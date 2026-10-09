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

import type { Answer, FieldValue, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { b64url, isScopeRef, keyIdOfSecret, unb64url } from "@generalbusiness/artroom-bytes";
import { act, actAssociation, actsOn, fieldValue, joinRoom, listLanes, loadChange, loadIssue, loadRules, openRoom, placeOf, siteAddress, type Acted, type Place, type Room, type Session } from "./data.ts";
import { actsPanel, answerLine, nonacceptedAnswerText, changeScreen, failureScreen, h, issueScreen, roomScreen, rulesScreen } from "./view.ts";
import { RoomOpening, ScopeSending, changeActions, issueActions, roomContext, routeOf, type Destination } from "./shell.ts";
import { editPath } from "@generalbusiness/artroom-platform";
import type { ActionContext } from "./actions.ts";
import { rulesEditor } from "./rules-editor.ts";
import { allowedClaim, claimRoom, type ClaimRegister } from "./claim.ts";

const KEPT = "artroom-page";
/** The room text survives a key-generation redraw in memory only. It can hold an invitation secret. */
let roomDraft = "";
let roomDraftContext = "";
/** What this browser keeps: the room (no secret of it) and the key. */
interface Settings { place: Place | null; secret: string; register?: ScopeRef }
let ignoredSavedAddress = false;

function settings(): Settings | null {
  ignoredSavedAddress = false;
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT) ?? "null") as (Settings & { service?: unknown }) | null;
    // Migration only: an obsolete saved address never chooses where this page reads or signs.
    ignoredSavedAddress = !!kept && Object.hasOwn(kept, "service");
    return kept && typeof kept.secret === "string" ? { place: kept.place ?? null, secret: kept.secret, ...(isScopeRef(kept.register) && kept.register.kind === "register" ? { register: kept.register } : {}) } : null;
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
const sending = new ScopeSending();
const claimDrafts = new Map<string, string>();
const claiming = new Set<string>();
let roomDialog: HTMLDialogElement | null = null;
const settingsContext = (kept: Settings): string => JSON.stringify([location.origin, kept.place, kept.secret, kept.register ?? null]);
let claimOffer: { kept: Settings; configured: ClaimRegister } | undefined;
function unknownRequest(kind: string): HTMLElement {
  return h("p", { class: "muted" }, `The ${kind} request may have been recorded. Checking status only reads the scope; a changed head does not settle this request. This page does not retain the exact signed request for automatic recovery. Keep this session open and inspect the original request before recovery; do not send a replacement.`);
}

async function roomOf(kept: Settings, place: Place): Promise<Room> {
  return opened.get(roomContext(location.origin, place, kept.secret), () => openRoom(sessionOf(kept), place));
}

/** Room and account labels come from the recorded read, never prototype fixtures. */
function shell(destination: Destination, room: Room | null, ...content: HTMLElement[]): HTMLElement[] {
  const offer = claimOffer;
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
  const create = () => {
    const button = h("button", { class: "nav-item", type: "button" }, "Create room");
    button.addEventListener("click", () => { if (room && offer) claimDialog(room, offer.kept, offer.configured, button); });
    return button;
  };
  return [skip,
    h("aside", { class: "rail" }, h("div", { class: "wordmark" }, "Artroom"), roomSwitch(), navigation(),
      offer ? create() : null, h("div", { class: "rail-bottom" }, h("a", { class: "nav-item", href: "#/settings", ...(destination === "settings" ? { "aria-current": "page" } : {}) }, "Settings"), accountControl())),
    h("header", { class: "mobile-header" }, h("div", { class: "mobile-context" }, roomSwitch(), accountControl()), navigation(true), offer ? create() : null),
    h("div", { class: "content", id: "page-main", tabindex: "-1" }, ...content)];
}

function claimDialog(room: Room, kept: Settings, configured: ClaimRegister, opener: HTMLElement): void {
  const binding = settingsContext(kept);
  if (settingsContext(settings() ?? { place: null, secret: "" }) !== binding) return;
  roomDialog?.close(); roomDialog?.remove();
  const name = h("input", { name: "name", required: "", maxlength: "256", value: claimDrafts.get(binding) ?? "", autocomplete: "off" }) as HTMLInputElement;
  const message = h("p", { role: "status", hidden: "" });
  const submit = h("button", { type: "submit", class: "primary" }, "Create room");
  const cancel = h("button", { type: "button" }, "Cancel");
  const form = h("form", {}, h("h1", { id: "create-room-title" }, "Create room"), h("label", {}, "Room name", name), message, h("div", { class: "form-footer" }, cancel, submit));
  const dialog = h("dialog", { class: "room-dialog", "aria-labelledby": "create-room-title" }, form) as HTMLDialogElement;
  roomDialog = dialog;
  const close = () => { claimDrafts.set(binding, name.value); dialog.close(); dialog.remove(); if (roomDialog === dialog) roomDialog = null; opener.focus(); };
  cancel.addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  name.addEventListener("input", () => { claimDrafts.set(binding, name.value); });
  if (claiming.has(binding)) { submit.setAttribute("disabled", ""); name.setAttribute("disabled", ""); }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (claiming.has(binding) || !name.value.trim() || settingsContext(settings() ?? { place: null, secret: "" }) !== binding) return;
    claiming.add(binding); claimDrafts.set(binding, name.value); submit.setAttribute("disabled", ""); name.setAttribute("disabled", "");
    message.textContent = "Creating room"; message.removeAttribute("hidden");
    void (async () => {
      try {
        const result = await claimRoom(sessionOf(kept), configured, localStorage, name.value, { handle: room.me!.handle });
        if (settingsContext(settings() ?? { place: null, secret: "" }) !== binding) return;
        if (result.repository) {
          keep({ ...kept, place: { directory: result.repository.directory.scope, membership: result.repository.membership } });
          opened.clear(); close(); location.hash = "#/"; await draw();
        } else {
          message.textContent = result.outcome.lines.join(" "); submit.textContent = result.pending ? "Resume creation" : "Create room";
          if (result.pending) name.setAttribute("disabled", ""); else name.removeAttribute("disabled");
        }
      } catch (error) { message.textContent = error instanceof Error ? error.message : "Creation could not be confirmed. Resume with the saved request."; submit.textContent = "Resume creation"; }
      finally { claiming.delete(binding); submit.removeAttribute("disabled"); }
    })();
  });
  root().append(dialog); dialog.showModal(); name.focus();
}

/** The acts panel for one scope: its form sends the act, keeps the answer and draws the screen again. */
interface PanelOptions {
  offered?: Awaited<ReturnType<typeof actsOn>>;
  represented?: readonly string[];
  customForm?: (send: (kind: string, on: string, typed: Record<string, string>) => void, blocked: boolean, draftKey: string) => HTMLElement;
}
async function panelFor(room: Room, scope: ScopeId, context: ActionContext = {}, options: PanelOptions = {}): Promise<HTMLElement> {
  const association = actAssociation(room, scope);
  const currentContext = () => {
    const current = settings();
    return current?.place && roomContext(location.origin, current.place, current.secret) === roomContext(room.session.service, { directory: room.directory, membership: room.membership }, b64url(room.session.secret));
  };
  const send = (kind: string, on: string, typed: Record<string, string>) => {
    const previous = lastActs.get(association);
    if (context.uncertain || context.blockedKinds?.includes(kind) || previous && (previous.answer.answer === "unavailable" || previous.answer.answer === "mismatch" || previous.observation !== null)) return;
    if (!sending.begin(association, kind)) return;
    void draw(); // Every form on this scope is fenced, including after navigation and redraw.
    void (async () => {
      try {
        if (!currentContext()) throw new Error("The room or key changed. Open this view again before sending.");
        const offered = (await actsOn(room, scope)).acts.find((a) => a.kind === kind);
        if (!currentContext()) throw new Error("The room or key changed. Open this view again before sending.");
        if (!offered) throw new Error("This action is no longer offered. Check status before sending.");
        const fields: Record<string, FieldValue> = Object.fromEntries(Object.entries(typed).map(([name, text]) => [name, fieldValue(room, offered.fields.find((f) => f.name === name)?.type ?? "text", text)]));
        const target = /^\d+$/.test(on) ? Number(on) : null;
        const result = await act(room, scope, kind, { on: target, fields }, (known) => { lastActs.set(association, known); sending.answered(association); }, () => { sending.submitting(association); });
        lastActs.set(association, result);
      } catch (error) {
        sending.failed(association);
        if (sending.get(association)?.state !== "unknown") alert(error instanceof Error ? error.message : String(error));
      }
      await draw();
    })();
  };
  const offered = options.offered ?? await actsOn(room, scope);
  const last = lastActs.get(association);
  const fence = sending.get(association);
  const pending = !!fence && fence.state !== "unknown";
  const uncertain = fence?.state === "unknown" || context.uncertain || !!last && (last.answer.answer === "unavailable" || last.answer.answer === "mismatch" || last.observation !== null);
  const remaining = { ...offered, acts: offered.acts.filter((act) => !options.represented?.includes(act.kind)) };
  const panel = actsPanel(remaining, send, last ? answerLine(last) : null, { ...context, pending, uncertain, draftKey: association, refresh: () => { void draw(); } });
  if (options.customForm) panel.append(options.customForm(send, pending || !!uncertain, association));
  if (fence?.state === "unknown") panel.append(unknownRequest(fence.kind));
  return panel;
}

function settingsScreen(): HTMLElement {
  const kept = settings();
  const context = JSON.stringify([kept?.place ?? null, kept?.secret ?? null, kept?.register ?? null]);
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
    let register = kept?.register;
    if (typed && !typed.startsWith("artroom-invite:")) {
      try {
        const parsed = JSON.parse(typed) as { register?: unknown };
        if (parsed.register !== undefined && (!isScopeRef(parsed.register) || parsed.register.kind !== "register")) { tell(false, "The register reference in this config is invalid."); return null; }
        register = parsed.register as ScopeRef | undefined;
      } catch { tell(false, "The config could not be read."); return null; }
    } else if (typed) register = undefined;
    return { place, secret: newSecret ?? ((secret as HTMLInputElement).value.trim() || kept?.secret || ""), ...(register ? { register } : {}) };
  };
  const save = (next: Settings) => {
    keep(next); roomDraft = ""; (room as HTMLTextAreaElement).value = ""; opened.clear();
    const sameRoute = location.hash === "#/";
    location.hash = "#/";
    if (sameRoute) queueMicrotask(() => { void draw(); });
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); const next = read(null); if (next) save(next); });
  room.addEventListener("input", () => { roomDraft = (room as HTMLTextAreaElement).value; });
  form.querySelector("#new-key")!.addEventListener("click", () => { const next = read(b64url(crypto.getRandomValues(new Uint8Array(32)))); if (next) { roomDraft = (room as HTMLTextAreaElement).value; roomDraftContext = JSON.stringify([next.place, next.secret, next.register ?? null]); keep(next); opened.clear(); void draw(); } });
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
  const currentDraw = ++drawing;
  const show = showFor(currentDraw, focus);
  claimOffer = undefined;
  roomDialog?.close(); roomDialog?.remove(); roomDialog = null;
  const route = routeOf(location.hash);
  const kept = settings();
  if (route.destination === "settings" || !kept || !kept.place || ignoredSavedAddress) return show(...shell("settings", null, settingsScreen()));
  let room: Room | null = null;
  try {
    room = await roomOf(kept, kept.place);
    if (kept.register && room.me?.handle && typeof navigator !== "undefined" && navigator.locks && typeof HTMLDialogElement !== "undefined") {
      try {
        const configured = await allowedClaim(sessionOf(kept), kept.register);
        if (currentDraw !== drawing || settingsContext(settings() ?? { place: null, secret: "" }) !== settingsContext(kept)) return;
        claimOffer = { kept, configured };
      } catch { /* No founding control is offered without a current native eligibility read. */ }
    }
    if (currentDraw !== drawing || settingsContext(settings() ?? { place: null, secret: "" }) !== settingsContext(kept)) return;
    const { destination, scope } = route;
    const loaded = room;
    const last = (s: string): Answer | null => lastActs.get(actAssociation(loaded, s as ScopeId))?.answer ?? null;
    if (destination === "issues" && scope) {
      const issue = await loadIssue(room, scope as ScopeId);
      const defaults = issue.intent === undefined ? undefined : Object.fromEntries(["edit-own", "edit-any", "close-own", "close-any", "reopen-own", "reopen-any"].map((kind) => [kind, { on: issue.intent! }]));
      const offered = await actsOn(room, scope as ScopeId);
      return show(...shell(destination, room, issueScreen(room, issue), await panelFor(room, scope as ScopeId, { ...(defaults ? { defaults } : {}), ...issueActions(issue.state, offered.acts.map((act) => act.kind)) }, { offered })));
    }
    if (destination === "changes" && scope) {
      const change = await loadChange(room, scope as ScopeId);
      const current = change.manifests.find((manifest) => manifest.state === "current");
      const defaults = {
        ...(current ? Object.fromEntries(["merge", "review-verdict", "request-check"].map((kind) => [kind, { fields: { manifest: String(current.id) } }])) : {}),
        ...(change.proposal === undefined ? {} : Object.fromEntries(["edit-own", "edit-any", "ready-own", "ready-any", "request-review-own", "request-review-any"].map((kind) => [kind, { on: change.proposal! }]))),
      };
      const uncertain = change.merges.some((merge) => ["intended", "committed", "unknown"].includes(merge.state));
      const { primary, blockedKinds } = changeActions(change.state, !!current?.file && editPath(current.file.path) === null);
      const lastAct = lastActs.get(actAssociation(room, scope as ScopeId));
      const mergeAnswer = lastAct && ["merge", "cancel-merge"].includes(lastAct.kind) ? last(scope) : null;
      return show(...shell(destination, room, changeScreen(room, change, mergeAnswer, lastAct?.kind), await panelFor(room, scope as ScopeId, { ...(defaults ? { defaults } : {}), uncertain, statusShown: uncertain, primary, blockedKinds })));
    }
    if (destination === "rules") {
      const rules = await loadRules(room);
      const offered = await actsOn(room, room.rules);
      const editable = rules.item !== undefined && offered.acts.some((act) => act.kind === "publish");
      const options: PanelOptions = { offered, ...(editable ? { represented: ["publish"], customForm: (send, blocked, draftKey) => rulesEditor(rules, send, { blocked, draftKey }) } : {}) };
      return show(...shell(destination, room, rulesScreen(room, rules, editable), await panelFor(room, room.rules, {}, options)));
    }
    return show(...shell(destination, room, roomScreen(room, await listLanes(room), destination === "changes" ? "change" : "issue"), await panelFor(loaded, loaded.directory, { primary: [destination === "changes" ? "open-pr" : "open-issue"] })));
  } catch (error) {
    // Match the original service/room/member, even if opening this view failed.
    let known: Acted[] = [];
    let fence: ReturnType<ScopeSending["get"]>;
    try {
      const context = { session: sessionOf(kept), directory: kept.place.directory, membership: kept.place.membership };
      known = [...lastActs.entries()].filter(([association, result]) => association === actAssociation(context, result.scope)).map(([, result]) => result);
      const scope = route.scope ?? (route.destination === "rules" ? room?.rules : kept.place.directory);
      fence = scope ? sending.get(actAssociation(context, scope as ScopeId)) : undefined;
    } catch { /* Invalid current settings cannot match a known result. */ }
    show(...shell(route.destination, room, failureScreen(error, known), ...(fence?.state === "unknown" ? [unknownRequest(fence.kind)] : [])));
  }
}

window.addEventListener("hashchange", () => { void draw(true); });
void draw();
