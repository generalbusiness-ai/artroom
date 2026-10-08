/**
 * The page in a browser: the settings kept in local storage, and one screen
 * for each address after `#`.
 *
 * | Address | Screen |
 * |---|---|
 * | `#/` | The room's issues and changes, and the acts the caller may sign on the directory (opening an issue or a change). |
 * | `#/issue/<scope>` | One issue, and the acts the caller may sign on it. |
 * | `#/change/<scope>` | One change, with its states, and the acts the caller may sign on it. |
 * | `#/rules` | The rules of this room, and the acts the caller may sign on the rules scope. |
 * | `#/settings` | The base URL, the room and the key; joining a room with an invitation link. |
 *
 * The page is served by the scope Worker at `/page/`, so the base URL is
 * the page's own origin unless Settings names another.
 *
 * The key is a 32-byte Ed25519 secret, kept in this browser's local storage
 * under `artroom-page`, as unpadded base64url. It is never shown: only its
 * key ID is. Any script that runs on the page's origin can read local
 * storage, so serve the page from an origin that runs nothing else.
 */

import type { Answer, FieldValue, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, keyIdOfSecret, unb64url } from "@generalbusiness/artroom-bytes";
import { act, actAssociation, actsOn, fieldValue, joinRoom, listLanes, loadChange, loadIssue, loadRules, openRoom, placeOf, pageService, Unreadable, type Acted, type Place, type Room, type Session } from "./data.ts";
import { actsPanel, answerLine, changeScreen, failureScreen, h, issueScreen, roomScreen, rulesScreen } from "./view.ts";

const KEPT = "artroom-page";
/** The room text survives a key-generation redraw in memory only. It can hold an invitation secret. */
let roomDraft = "";
/** What this browser keeps: the base URL, the room (no secret of it) and the key. */
interface Settings { service: string; place: Place | null; secret: string }

function settings(): Settings | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT) ?? "null") as Settings | null;
    return kept && typeof kept.service === "string" && typeof kept.secret === "string" ? { ...kept, place: kept.place ?? null } : null;
  } catch {
    return null;
  }
}

function keep(kept: Settings): void {
  try {
    localStorage.setItem(KEPT, JSON.stringify(kept));
  } catch {
    alert("This browser does not let the page keep its settings.");
  }
}

const sessionOf = (kept: Settings): Session => {
  const service = pageService(kept.service, location.origin);
  const secret = unb64url(kept.secret);
  if (!secret || secret.length !== 32) throw new Error("The key kept in this browser is not a 32-byte secret. Set a key in Settings.");
  return { service, secret };
};

const root = (): HTMLElement => document.getElementById("page")!;
/** The number of the latest draw: a slower, earlier draw that ends after a later one shows nothing. */
let drawing = 0;
const showFor = (n: number) => (...children: HTMLElement[]) => { if (n === drawing) root().replaceChildren(...children); };


let opened: { key: string; room: Room } | null = null;
/** The scope's answer to the last act sent from this page, by service/room/member/scope, for the states and the answer line. */
const lastActs = new Map<string, Acted>();

async function roomOf(kept: Settings, place: Place): Promise<Room> {
  const id = `${kept.service} ${place.directory} ${kept.secret}`;
  if (opened?.key === id) return opened.room;
  opened = { key: id, room: await openRoom(sessionOf(kept), place) };
  return opened.room;
}

/** The acts panel for one scope: its form sends the act, keeps the answer and draws the screen again. */
async function panelFor(room: Room, scope: ScopeId): Promise<HTMLElement> {
  const send = (kind: string, on: string, typed: Record<string, string>) => {
    void (async () => {
      try {
        const offered = (await actsOn(room, scope)).acts.find((a) => a.kind === kind);
        const fields: Record<string, FieldValue> = {};
        for (const [name, text] of Object.entries(typed)) fields[name] = fieldValue(room, offered?.fields.find((f) => f.name === name)?.type ?? "text", text);
        const target = /^\d+$/.test(on) ? Number(on) : null;
        const association = actAssociation(room, scope);
        const result = await act(room, scope, kind, { on: target, fields }, (known) => lastActs.set(association, known));
        lastActs.set(association, result);
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
      await draw();
    })();
  };
  const last = lastActs.get(actAssociation(room, scope));
  return actsPanel(await actsOn(room, scope), send, last ? answerLine(last) : null);
}

function settingsScreen(): HTMLElement {
  const kept = settings();
  const service = h("input", { name: "service", value: kept?.service ?? "", placeholder: `${location.origin} (this page's own)` });
  const room = h("textarea", { name: "room", rows: "3", placeholder: "an invitation link (artroom-invite:...), or the content of the command line's config.json" }, roomDraft);
  const secret = h("input", { name: "secret", type: "password", autocomplete: "off", placeholder: kept ? "kept; paste another to replace it" : "32-byte secret, base64url" });
  const said = h("p", { class: "answer", role: "status", hidden: "" });
  const tell = (good: boolean, text: string) => { said.textContent = text; said.className = `answer ${good ? "ok" : "bad"}`; said.removeAttribute("hidden"); };
  const form = h("form", {},
    h("label", {}, "Base URL of this page's scope service ", service),
    h("label", {}, "Room ", room),
    h("label", {}, "Key ", secret),
    h("button", { type: "submit" }, "Keep in this browser"),
    h("button", { type: "button", id: "new-key" }, "Make a new key"),
    h("button", { type: "button", id: "join" }, "Join with the invitation link"),
  );
  const read = (newSecret: string | null): Settings | null => {
    let base: string;
    try { base = pageService((service as HTMLInputElement).value, location.origin); }
    catch (error) { tell(false, error instanceof Unreadable ? error.message : "Invalid service URL."); return null; }
    const typed = (room as HTMLTextAreaElement).value.trim();
    const place = typed ? placeOf(typed) : kept?.place ?? null;
    if (typed && !place) { tell(false, "That is neither an invitation link nor a config file that names a repository."); return null; }
    return { service: base, place, secret: newSecret ?? ((secret as HTMLInputElement).value.trim() || kept?.secret || "") };
  };
  const save = (next: Settings) => { keep(next); roomDraft = ""; (room as HTMLTextAreaElement).value = ""; opened = null; location.hash = "#/"; };
  form.addEventListener("submit", (event) => { event.preventDefault(); const next = read(null); if (next) save(next); });
  form.querySelector("#new-key")!.addEventListener("click", () => { const next = read(b64url(crypto.getRandomValues(new Uint8Array(32)))); if (next) { roomDraft = (room as HTMLTextAreaElement).value; keep(next); opened = null; void draw(); } });
  // Joining signs membership's `join` with the kept key and the link's secret. The link is not kept: only the room it names.
  form.querySelector("#join")!.addEventListener("click", () => {
    void (async () => {
      const next = read(null);
      if (!next) return;
      try {
        const joined = await joinRoom(sessionOf(next), (room as HTMLTextAreaElement).value);
        if (joined.answer.answer !== "accepted") return tell(false, `Membership refused the join: ${joined.answer.reason}${"name" in joined.answer && joined.answer.name ? ` (${joined.answer.name})` : ""}. Nothing was written.`);
        save({ ...next, place: joined.place });
      } catch (error) {
        tell(false, error instanceof Error ? error.message : String(error));
      }
    })();
  });
  const key = kept ? unb64url(kept.secret) : null;
  return h("main", {}, h("h1", {}, "Settings"),
    h("p", {}, key && key.length === 32 ? `This browser keeps key ${keyIdOfSecret(key)}.` : "This browser keeps no key yet."),
    h("p", {}, kept?.place ? `The room: directory ${kept.place.directory}, membership ${kept.place.membership.scope}.` : "No room is set yet."),
    h("p", { class: "muted" }, "A key is a member's once membership enrols it. With an invitation link from artroom invite, make a new key here and join with the link; or paste the key that the command line keeps in keys/device.key with its config.json. The page shows a key ID, never the key."),
    h("p", { class: "muted" }, "This page uses its own service origin. Cross-origin service configuration is not supported."),
    said, form);
}

async function draw(): Promise<void> {
  const show = showFor(++drawing);
  const path = location.hash.replace(/^#/, "") || "/";
  const kept = settings();
  if (path === "/settings" || !kept || !kept.place) return show(settingsScreen());
  try {
    const room = await roomOf(kept, kept.place);
    const [, kind, scope] = path.split("/") as [string, string?, string?];
    const last = (s: string): Answer | null => lastActs.get(actAssociation(room, s as ScopeId))?.answer ?? null;
    if (kind === "issue" && scope) return show(issueScreen(room, await loadIssue(room, scope as ScopeId)), await panelFor(room, scope as ScopeId));
    if (kind === "change" && scope) return show(changeScreen(room, await loadChange(room, scope as ScopeId), last(scope)), await panelFor(room, scope as ScopeId));
    if (kind === "rules") return show(rulesScreen(room, await loadRules(room)), await panelFor(room, room.rules));
    return show(roomScreen(room, await listLanes(room)), await panelFor(room, room.directory));
  } catch (error) {
    // Match the original service/room/member, even if opening this view failed.
    let known: Acted[] = [];
    try {
      const context = { session: sessionOf(kept), directory: kept.place.directory, membership: kept.place.membership };
      known = [...lastActs.entries()].filter(([association, result]) => association === actAssociation(context, result.scope)).map(([, result]) => result);
    } catch { /* Invalid current settings cannot match a known result. */ }
    show(failureScreen(error, known));
  }
}

window.addEventListener("hashchange", () => { void draw(); });
void draw();
