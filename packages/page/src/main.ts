/**
 * The page in a browser: the settings kept in local storage, and one screen
 * for each address after `#`.
 *
 * | Address | Screen |
 * |---|---|
 * | `#/` | The room's issues and changes. |
 * | `#/issue/<scope>` | One issue, and the acts the caller may sign on it. |
 * | `#/change/<scope>` | One change, with its states, and the acts the caller may sign on it. |
 * | `#/rules` | The rules of this room, and the acts the caller may sign on the rules scope. |
 * | `#/settings` | The base URL, the directory's scope ID and the key. |
 *
 * The key is a 32-byte Ed25519 secret, kept in this browser's local storage
 * under `artroom-page`, as unpadded base64url. It is never shown: only its
 * key ID is. Any script that runs on the page's origin can read local
 * storage, so serve the page from an origin that runs nothing else.
 */

import type { Answer, FieldValue, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, keyIdOfSecret, unb64url } from "@generalbusiness/artroom-bytes";
import { act, actsOn, fieldValue, listLanes, loadChange, loadIssue, loadRules, openRoom, type Acted, type Room, type Session } from "./data.ts";
import { actsPanel, answerLine, changeScreen, h, issueScreen, roomScreen, rulesScreen } from "./view.ts";

const KEPT = "artroom-page";
interface Settings { service: string; directory: string; secret: string }

function settings(): Settings | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT) ?? "null") as Settings | null;
    return kept && typeof kept.service === "string" && typeof kept.directory === "string" && typeof kept.secret === "string" ? kept : null;
  } catch {
    return null;
  }
}

const root = (): HTMLElement => document.getElementById("page")!;
const show = (...children: HTMLElement[]) => root().replaceChildren(...children);
const failure = (error: unknown) => h("main", {}, h("h1", {}, "Not read"), h("p", { class: "answer bad" }, error instanceof Error ? error.message : String(error)), h("p", {}, h("a", { href: "#/settings" }, "Settings")));

let opened: { key: string; room: Room } | null = null;
/** The scope's answer to the last act sent from this page, by scope, for the states and the answer line. */
const lastActs = new Map<string, Acted>();

async function roomOf(kept: Settings): Promise<Room> {
  const id = `${kept.service} ${kept.directory} ${kept.secret}`;
  if (opened?.key === id) return opened.room;
  const secret = unb64url(kept.secret);
  if (!secret || secret.length !== 32) throw new Error("The key kept in this browser is not a 32-byte secret. Set a key in Settings.");
  const session: Session = { service: kept.service, secret };
  opened = { key: id, room: await openRoom(session, kept.directory as ScopeId) };
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
        lastActs.set(scope, await act(room, scope, kind, { on: target, fields }));
      } catch (error) {
        lastActs.delete(scope);
        alert(error instanceof Error ? error.message : String(error));
      }
      await draw();
    })();
  };
  const last = lastActs.get(scope);
  return actsPanel(await actsOn(room, scope), send, last ? answerLine(last) : null);
}

function settingsScreen(): HTMLElement {
  const kept = settings();
  const service = h("input", { name: "service", value: kept?.service ?? "", placeholder: "https://scopes.example" });
  const directory = h("input", { name: "directory", value: kept?.directory ?? "", placeholder: "sc_..." });
  const secret = h("input", { name: "secret", type: "password", autocomplete: "off", placeholder: kept ? "kept; paste another to replace it" : "32-byte secret, base64url" });
  const form = h("form", {},
    h("label", {}, "Base URL of the scope service ", service),
    h("label", {}, "Directory scope ID of the room ", directory),
    h("label", {}, "Key ", secret),
    h("button", { type: "submit" }, "Keep in this browser"),
    h("button", { type: "button", id: "new-key" }, "Make a new key"),
  );
  const save = (newSecret: string | null) => {
    const value = newSecret ?? ((secret as HTMLInputElement).value.trim() || kept?.secret || "");
    localStorage.setItem(KEPT, JSON.stringify({ service: (service as HTMLInputElement).value.trim(), directory: (directory as HTMLInputElement).value.trim(), secret: value }));
    opened = null;
    location.hash = "#/";
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); save(null); });
  form.querySelector("#new-key")!.addEventListener("click", () => save(b64url(crypto.getRandomValues(new Uint8Array(32)))));
  const key = kept ? unb64url(kept.secret) : null;
  return h("main", {}, h("h1", {}, "Settings"),
    h("p", {}, key && key.length === 32 ? `This browser keeps key ${keyIdOfSecret(key)}.` : "This browser keeps no key yet."),
    h("p", { class: "muted" }, "A new key is no member's until membership enrols it: an invitation link from artroom invite, then artroom join, enrols a key on the command line. The page shows a key ID, never the key."),
    form);
}

async function draw(): Promise<void> {
  const path = location.hash.replace(/^#/, "") || "/";
  const kept = settings();
  if (path === "/settings" || !kept) return show(settingsScreen());
  try {
    const room = await roomOf(kept);
    const [, kind, scope] = path.split("/") as [string, string?, string?];
    const last = (s: string): Answer | null => lastActs.get(s)?.answer ?? null;
    if (kind === "issue" && scope) return show(issueScreen(room, await loadIssue(room, scope as ScopeId)), await panelFor(room, scope as ScopeId));
    if (kind === "change" && scope) return show(changeScreen(room, await loadChange(room, scope as ScopeId), last(scope)), await panelFor(room, scope as ScopeId));
    if (kind === "rules") return show(rulesScreen(room, await loadRules(room)), await panelFor(room, room.rules));
    return show(roomScreen(room, await listLanes(room)));
  } catch (error) {
    show(failure(error));
  }
}

window.addEventListener("hashchange", () => { void draw(); });
void draw();
