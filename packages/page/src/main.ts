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
 * | `#/settings` | The room and the key; joining a room with an invitation link. |
 *
 * The page is served by the scope Worker at `/page/` and reads that Worker.
 *
 * The key is a 32-byte Ed25519 secret, kept in this browser's local storage
 * under `artroom-page`, as unpadded base64url. It is never shown: only its
 * key ID is. Any script that runs on the page's origin can read local
 * storage, so serve the page from an origin that runs nothing else.
 */

import type { Answer, FieldValue, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, keyIdOfSecret, unb64url } from "@generalbusiness/artroom-bytes";
import { act, actAssociation, actsOn, fieldValue, joinRoom, listLanes, loadChange, loadIssue, loadRules, openRoom, placeOf, siteAddress, type Acted, type Place, type Room, type Session } from "./data.ts";
import { actsPanel, answerLine, nonacceptedAnswerText, changeScreen, failureScreen, h, issueScreen, roomScreen, rulesScreen } from "./view.ts";
import { RoomOpening, roomContext, routeOf, type Destination } from "./shell.ts";
import type { ActionContext } from "./actions.ts";

const KEPT = "artroom-page";
/** The room text survives a key-generation redraw in memory only. It can hold an invitation secret. */
let roomDraft = "";
let roomDraftContext = "";
/** What this browser keeps: the room (no secret of it) and the key. */
interface Settings { place: Place | null; secret: string }
let ignoredSavedAddress = false;

function settings(): Settings | null {
  ignoredSavedAddress = false;
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT) ?? "null") as (Settings & { service?: unknown }) | null;
    // Migration only: an obsolete saved address never chooses where this page reads or signs.
    ignoredSavedAddress = !!kept && Object.hasOwn(kept, "service");
    return kept && typeof kept.secret === "string" ? { place: kept.place ?? null, secret: kept.secret } : null;
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
  const secret = unb64url(kept.secret);
  if (!secret || secret.length !== 32) throw new Error("The key kept in this browser is not a 32-byte secret. Set a key in Settings.");
  return { service: location.origin, secret };
};

const root = (): HTMLElement => document.getElementById("page")!;
/** The number of the latest draw: a slower, earlier draw that ends after a later one shows nothing. */
let drawing = 0;
const showFor = (n: number, focus: boolean) => (...children: HTMLElement[]) => {
  if (n !== drawing) return;
  root().replaceChildren(...children);
  if (focus) document.getElementById("page-main")?.focus?.();
};


const opened = new RoomOpening<Room>();
/** The scope's answer to the last act sent from this page, by service/room/member/scope, for the states and the answer line. */
const lastActs = new Map<string, Acted>();

async function roomOf(kept: Settings, place: Place): Promise<Room> {
  return opened.get(roomContext(location.origin, place, kept.secret), () => openRoom(sessionOf(kept), place));
}

/** Room and account labels come from the recorded read, never prototype fixtures. */
function shell(destination: Destination, room: Room | null, ...content: HTMLElement[]): HTMLElement[] {
  const kept = settings();
  const directory = room?.directory ?? kept?.place?.directory;
  const name = room?.name || (directory ? `Room ${directory.slice(3, 11)}` : "Choose a room");
  const account = room?.me?.handle || "Your key";
  const roomSwitch = () => h("a", { class: "room-switch", href: "#/settings", title: directory ?? "Choose a room", "aria-label": `Room settings: ${name}` }, h("span", { class: "room-name" }, name), h("span", { "aria-hidden": "true" }, "⌄"));
  const accountControl = () => h("a", { class: "account", href: "#/settings", "aria-label": `Account settings: ${account}` }, h("span", { class: "avatar", "aria-hidden": "true" }, account.slice(0, 1).toUpperCase()), h("span", { class: "account-label" }, account));
  const navigation = (mobile = false) => h("nav", { class: mobile ? "navigation mobile-nav" : "navigation", "aria-label": "Room" },
    ([ ["issues", "Issues", "#/"], ["changes", "Changes", "#/?kind=change"], ["rules", "Rules", "#/rules"] ] as const).map(([kind, label, href]) =>
      h("a", { class: "nav-item", href, ...(destination === kind ? { "aria-current": "page" } : {}) }, label)),
    room ? h("a", { class: "nav-item", href: siteAddress(room, ""), title: "Latest published pages" }, "Pages") : null);
  const skip = h("a", { class: "skip", href: "#page-main" }, "Skip to content");
  skip.addEventListener("click", (event) => { event.preventDefault(); document.getElementById("page-main")?.focus(); });
  return [skip,
    h("aside", { class: "rail" }, h("div", { class: "wordmark" }, "Artroom"), roomSwitch(), navigation(),
      h("div", { class: "rail-bottom" }, h("a", { class: "nav-item", href: "#/settings", ...(destination === "settings" ? { "aria-current": "page" } : {}) }, "Settings"), accountControl())),
    h("header", { class: "mobile-header" }, h("div", { class: "mobile-context" }, roomSwitch(), accountControl()), navigation(true)),
    h("div", { class: "content", id: "page-main", tabindex: "-1" }, ...content)];
}

/** The acts panel for one scope: its form sends the act, keeps the answer and draws the screen again. */
async function panelFor(room: Room, scope: ScopeId, context: ActionContext = {}): Promise<HTMLElement> {
  const currentContext = () => {
    const current = settings();
    return current?.place && roomContext(location.origin, current.place, current.secret) === roomContext(room.session.service, { directory: room.directory, membership: room.membership }, b64url(room.session.secret));
  };
  const send = (kind: string, on: string, typed: Record<string, string>) => {
    void (async () => {
      try {
        if (!currentContext()) throw new Error("The room or key changed. Open this view again before sending.");
        const offered = (await actsOn(room, scope)).acts.find((a) => a.kind === kind);
        if (!currentContext()) throw new Error("The room or key changed. Open this view again before sending.");
        if (!offered) throw new Error("This action is no longer offered. Check status before sending.");
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
  const uncertain = context.uncertain || !!last && (last.answer.answer === "unavailable" || last.answer.answer === "mismatch" || last.observation !== null);
  return actsPanel(await actsOn(room, scope), send, last ? answerLine(last) : null, { ...context, uncertain, draftKey: actAssociation(room, scope), refresh: () => { void draw(); } });
}

function settingsScreen(): HTMLElement {
  const kept = settings();
  const context = JSON.stringify([kept?.place ?? null, kept?.secret ?? null]);
  if (roomDraftContext !== context) { roomDraft = ""; roomDraftContext = context; }
  const room = h("textarea", { name: "room", rows: "3", placeholder: "an invitation link (artroom-invite:...), or the content of the command line's config.json" }, roomDraft);
  const secret = h("input", { name: "secret", type: "password", autocomplete: "off", placeholder: kept ? "kept; paste another to replace it" : "32-byte secret, base64url" });
  const said = h("p", { class: "answer", role: "status", hidden: "" });
  const tell = (good: boolean, text: string) => { said.textContent = text; said.className = `answer ${good ? "ok" : "bad"}`; said.removeAttribute("hidden"); };
  if (ignoredSavedAddress) tell(false, "The saved connection address is ignored. This page reads the Worker that serves it. Your room and key are kept; save these settings to continue.");
  const form = h("form", {},
    h("label", {}, "Room ", room),
    h("label", {}, "Key ", secret),
    h("button", { type: "submit", class: "primary" }, "Save settings"),
    h("button", { type: "button", id: "new-key" }, "Create key"),
    h("button", { type: "button", id: "join" }, "Join room"),
  );
  const read = (newSecret: string | null): Settings | null => {
    const typed = (room as HTMLTextAreaElement).value.trim();
    const place = typed ? placeOf(typed) : kept?.place ?? null;
    if (typed && !place) { tell(false, "That is neither an invitation link nor a config file that names a repository."); return null; }
    return { place, secret: newSecret ?? ((secret as HTMLInputElement).value.trim() || kept?.secret || "") };
  };
  const save = (next: Settings) => {
    keep(next); roomDraft = ""; (room as HTMLTextAreaElement).value = ""; opened.clear();
    const sameRoute = location.hash === "#/";
    location.hash = "#/";
    if (sameRoute) queueMicrotask(() => { void draw(); });
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); const next = read(null); if (next) save(next); });
  room.addEventListener("input", () => { roomDraft = (room as HTMLTextAreaElement).value; });
  form.querySelector("#new-key")!.addEventListener("click", () => { const next = read(b64url(crypto.getRandomValues(new Uint8Array(32)))); if (next) { roomDraft = (room as HTMLTextAreaElement).value; roomDraftContext = JSON.stringify([next.place, next.secret]); keep(next); opened.clear(); void draw(); } });
  // Joining signs membership's `join` with the kept key and the link's secret. The link is not kept: only the room it names.
  form.querySelector("#join")!.addEventListener("click", () => {
    void (async () => {
      const next = read(null);
      if (!next) return;
      try {
        const joined = await joinRoom(sessionOf(next), (room as HTMLTextAreaElement).value);
        if (joined.answer.answer !== "accepted") return tell(false, `${nonacceptedAnswerText(joined.answer)} Inspect membership ${joined.place.membership.scope} and the original request before another join. Recovery requires the same signed envelope; this page does not retain it.`);
        save({ ...next, place: joined.place });
      } catch (error) {
        tell(false, error instanceof Error ? error.message : String(error));
      }
    })();
  });
  const key = kept ? unb64url(kept.secret) : null;
  return h("main", { class: "screen settings-screen" }, h("h1", {}, "Settings"),
    h("p", {}, key && key.length === 32 ? `This browser keeps key ${keyIdOfSecret(key)}.` : "This browser keeps no key yet."),
    said, form,
    h("details", { class: "inspection" }, h("summary", {}, "Inspect connection"),
      h("p", {}, kept?.place ? `Directory ${kept.place.directory}; membership ${kept.place.membership.scope}.` : "No room is set yet."),
      h("p", { class: "muted" }, "An invitation enrols your key in membership. You can also use the command line's config.json and device.key. The page shows a key ID, never the key.")));
}

async function draw(focus = false): Promise<void> {
  const show = showFor(++drawing, focus);
  const route = routeOf(location.hash);
  const kept = settings();
  if (route.destination === "settings" || !kept || !kept.place || ignoredSavedAddress) return show(...shell("settings", null, settingsScreen()));
  let room: Room | null = null;
  try {
    room = await roomOf(kept, kept.place);
    const { destination, scope } = route;
    const loaded = room;
    const last = (s: string): Answer | null => lastActs.get(actAssociation(loaded, s as ScopeId))?.answer ?? null;
    if (destination === "issues" && scope) {
      const issue = await loadIssue(room, scope as ScopeId);
      const defaults = issue.intent === undefined ? undefined : Object.fromEntries(["edit-own", "edit-any", "close-own", "close-any", "reopen-own", "reopen-any"].map((kind) => [kind, { on: issue.intent! }]));
      return show(...shell(destination, room, issueScreen(room, issue), await panelFor(room, scope as ScopeId, { ...(defaults ? { defaults } : {}), primary: ["comment", "edit-own", "close-own", "close-any", "reopen-own"] })));
    }
    if (destination === "changes" && scope) {
      const change = await loadChange(room, scope as ScopeId);
      const current = change.manifests.find((manifest) => manifest.state === "current");
      const defaults = {
        ...(current ? Object.fromEntries(["merge", "review-verdict", "request-check"].map((kind) => [kind, { fields: { manifest: String(current.id) } }])) : {}),
        ...(change.proposal === undefined ? {} : Object.fromEntries(["edit-own", "edit-any", "ready-own", "ready-any", "request-review-own", "request-review-any"].map((kind) => [kind, { on: change.proposal! }]))),
      };
      const uncertain = change.merges.some((merge) => ["intended", "committed", "unknown"].includes(merge.state));
      const lastAct = lastActs.get(actAssociation(room, scope as ScopeId));
      const mergeAnswer = lastAct && ["merge", "cancel-merge"].includes(lastAct.kind) ? last(scope) : null;
      return show(...shell(destination, room, changeScreen(room, change, mergeAnswer, lastAct?.kind), await panelFor(room, scope as ScopeId, { ...(defaults ? { defaults } : {}), uncertain, statusShown: uncertain, primary: ["comment", "review-verdict", "merge", "request-review-own", "ready-own"], choices: { "review-verdict": { verdict: [{ label: "Approve", value: "approve" }, { label: "Request changes", value: "request-changes" }] } } })));
    }
    if (destination === "rules") return show(...shell(destination, room, rulesScreen(room, await loadRules(room)), await panelFor(room, room.rules, { primary: ["publish"] })));
    return show(...shell(destination, room, roomScreen(room, await listLanes(room), destination === "changes" ? "change" : "issue"), await panelFor(loaded, loaded.directory, { primary: [destination === "changes" ? "open-pr" : "open-issue"] })));
  } catch (error) {
    // Match the original service/room/member, even if opening this view failed.
    let known: Acted[] = [];
    try {
      const context = { session: sessionOf(kept), directory: kept.place.directory, membership: kept.place.membership };
      known = [...lastActs.entries()].filter(([association, result]) => association === actAssociation(context, result.scope)).map(([, result]) => result);
    } catch { /* Invalid current settings cannot match a known result. */ }
    show(...shell(route.destination, room, failureScreen(error, known)));
  }
}

window.addEventListener("hashchange", () => { void draw(true); });
void draw();
