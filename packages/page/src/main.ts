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
import { b64url, canonicalize, isScopeRef, keyIdOfSecret, unb64url } from "@generalbusiness/artroom-bytes";
import { act, actAssociation, actsOn, enrollmentAssociation, fieldValue, joinAssociation, joinRoom, listLanes, loadChange, loadIssue, loadRules, openRoom, placeOf, siteAddress, type Acted, type Place, type Room, type Session } from "./data.ts";
import { actsPanel, answerLine, nonacceptedAnswerText, changeScreen, failureScreen, h, icon, issueScreen, roomScreen, rulesScreen } from "./view.ts";
import { RoomOpening, ScopeSending, changeActions, issueActions, roomContext, routeOf, type Destination } from "./shell.ts";
import { editPath } from "@generalbusiness/artroom-platform";
import type { ActionContext } from "./actions.ts";
import { rulesEditor } from "./rules-editor.ts";
import { changeTaskContext, createIssue, nextChangeAction, taskForm, taskReviewExtents } from "./tasks.ts";
import type { Send } from "./actions.ts";
import { stateOf, keepState } from "./list-context.ts";
import { retainedEditor } from "./retained-editor.ts";
import { controlKey, keepFocus, restoreFocus } from "./focus.ts";
import { allowedClaim, claimRoom, claimStatus, type ClaimRegister } from "./claim.ts";

const KEPT = "artroom-page";
/** The room text survives a key-generation redraw in memory only. It can hold an invitation secret. */
let roomDraft = "";
let roomDraftContext = "";
/** What this browser keeps: the room (no secret of it) and the key. */
interface LocalLabel { text: string; place: Place; register?: ScopeRef }
interface ClaimSelection { operation: string; place: Place; register: ScopeRef; origin: string; key: string }
interface Settings { place: Place | null; secret: string; register?: ScopeRef; label?: LocalLabel; claimSelection?: ClaimSelection }
function labelFor(value: unknown, place: Place | null, register?: ScopeRef): LocalLabel | undefined {
  if (!value || typeof value !== "object" || !place) return undefined;
  const label = value as LocalLabel;
  return typeof label.text === "string" && label.text.trim().length > 0 && label.text.length <= 256
    && label.place?.directory === place.directory && isScopeRef(label.place?.membership)
    && canonicalize(label.place.membership) === canonicalize(place.membership)
    && canonicalize(label.register ?? null) === canonicalize(register ?? null) ? label : undefined;
}
let ignoredSavedAddress = false;

function settings(): Settings | null {
  ignoredSavedAddress = false;
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT) ?? "null") as (Settings & { service?: unknown }) | null;
    // Migration only: an obsolete saved address never chooses where this page reads or signs.
    ignoredSavedAddress = !!kept && Object.hasOwn(kept, "service");
    if (!kept || typeof kept.secret !== "string") return null;
    const place = kept.place ?? null;
    const register = isScopeRef(kept.register) && kept.register.kind === "register" ? kept.register : undefined;
    const label = labelFor(kept.label, place, register);
    const selected = kept.claimSelection;
    const secret = unb64url(kept.secret);
    const claimSelection = selected && typeof selected.operation === "string" && selected.operation.length > 0 && selected.origin === location.origin && secret?.length === 32 && selected.key === keyIdOfSecret(secret) && labelFor({ text: "selection", place: selected.place, register: selected.register }, place, register) ? selected : undefined;
    return { place, secret: kept.secret, ...(register ? { register } : {}), ...(label ? { label } : {}), ...(claimSelection ? { claimSelection } : {}) };
  } catch {
    return null;
  }
}

function keep(kept: Settings): boolean {
  try {
    const bytes = JSON.stringify(kept);
    localStorage.setItem(KEPT, bytes);
    if (localStorage.getItem(KEPT) !== bytes) throw new Error("The browser did not retain these settings.");
    return true;
  } catch {
    return false;
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
  const previousFocus = keepFocus(root());
  root().replaceChildren(...children);
  if (focus) document.getElementById("page-main")?.focus?.();
  else restoreFocus(root(), previousFocus);
};


const opened = new RoomOpening<Room>();
/** The scope's answer to the last act sent from this page, by service/room/member/scope, for the states and the answer line. */
const lastActs = new Map<string, Acted>();
const sending = new ScopeSending();
const joining = new ScopeSending();
const joinAnswers = new Map<string, { result: Awaited<ReturnType<typeof joinRoom>>; settings: Settings }>();
/** Known replies remain discoverable where the person began joining; custody stays keyed by actual enrollment. */
const joinRepliesByContext = new Map<string, { result: Awaited<ReturnType<typeof joinRoom>>; settings: Settings }>();
const claimDrafts = new Map<string, string>();
const claiming = new Set<string>();
let roomDialog: HTMLDialogElement | null = null;
let roomDialogBinding: { settings: string; route: string } | null = null;
interface WorkbenchDialog {
  dialog: HTMLDialogElement; body: HTMLElement; context: string; route: string; kind: "record" | "review" | "source";
  opener: string; manifest?: number; action?: string; message: HTMLElement; binding: string;
}
let workbenchDialog: WorkbenchDialog | null = null;
const settingsContext = (kept: Settings): string => JSON.stringify([location.origin, kept.place, kept.secret, kept.register ?? null]);
let claimOffer: { kept: Settings; configured: ClaimRegister } | undefined;
function unknownRequest(kind: string): HTMLElement {
  return h("p", { class: "muted" }, `The ${kind} request may have been recorded. Checking status only reads the scope; a changed head does not settle this request. This page does not retain the exact signed request for automatic recovery. Keep this session open and inspect the original request before recovery; do not send a replacement.`);
}

function returnToControl(key: string): void {
  if (!restoreFocus(root(), { key })) document.getElementById("page-main")?.focus();
}
function closeWorkbench(restore = true): void {
  const current = workbenchDialog;
  if (!current) return;
  workbenchDialog = null;
  current.dialog.close(); current.dialog.remove();
  if (restore && location.hash === current.route && current.binding === settingsContext(settings() ?? { place: null, secret: "" })) returnToControl(current.opener);
}
function openWorkbench(title: string, body: HTMLElement, context: string, opener: string, kind: WorkbenchDialog["kind"], subject?: { manifest: number; action: string }): void {
  closeWorkbench(false);
  const close = h("button", { type: "button", class: "icon-button dialog-close", "aria-label": "Close dialog", "data-focus-key": controlKey(context, "dialog-close") }, icon("close"));
  const message = h("p", { role: "status", "aria-live": "polite", hidden: "" });
  const dialog = h("dialog", { class: "room-dialog", "aria-labelledby": "workbench-dialog-title" }, close, h("h1", { id: "workbench-dialog-title" }, title), body, message) as HTMLDialogElement;
  workbenchDialog = { dialog, body, message, context, route: location.hash, kind, opener, binding: settingsContext(settings() ?? { place: null, secret: "" }), ...subject };
  close.addEventListener("click", () => closeWorkbench());
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeWorkbench(); });
  document.body.append(dialog); dialog.showModal();
  (body.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select, button, summary") ?? close).focus();
}

/** All deep records share one entry; status recovery remains a visible task. */
function inspectedScreen(screen: HTMLElement, panel: HTMLElement, context: string, label: string): HTMLElement {
  const record = screen.querySelector<HTMLElement>("details.inspection");
  record?.remove();
  const recovery = panel.querySelector<HTMLElement>("[data-status-recovery]");
  if (recovery) {
    recovery.remove();
    const next = screen.querySelector('[data-action-slot="next"]') ?? screen.querySelector('[data-action-slot="create"]');
    next?.replaceChildren(recovery);
  }
  const notice = panel.querySelector<HTMLElement>("[data-task-status]");
  if (notice) { notice.remove(); screen.append(notice); }
  const rulesForm = panel.querySelector<HTMLElement>(".rules-editor");
  if (rulesForm) { rulesForm.remove(); screen.append(rulesForm); }
  const body = h("div", { hidden: "", "data-record-body": "" }, record, panel);
  const key = controlKey(context, "inspect");
  const inspect = h("button", { type: "button", class: "icon-button", "aria-label": `Inspect ${label.toLowerCase()}`, "data-focus-key": key }, icon("more"));
  inspect.addEventListener("click", () => { body.removeAttribute("hidden"); openWorkbench(label, body, context, key, "record"); });
  (screen.querySelector(".detail-top") ?? screen.querySelector('[data-action-slot="create"]') ?? screen).append(inspect);
  screen.append(body);
  if (workbenchDialog?.kind === "record" && workbenchDialog.context === context && workbenchDialog.route === location.hash) {
    const saved = keepFocus(workbenchDialog.body);
    body.removeAttribute("hidden"); workbenchDialog.body.replaceWith(body); workbenchDialog.body = body;
    restoreFocus(body, saved);
  }
  return screen;
}

function nextTask(act: Awaited<ReturnType<typeof actsOn>>["acts"][number], send: Send, context: ActionContext, fields: readonly string[], label: string, association: string): HTMLElement {
  const form = taskForm(act, send, context, fields, label);
  if (!form.hasAttribute("data-act") || act.kind !== "review-verdict") return form;
  const manifest = context.defaults?.[act.kind]?.fields?.["manifest"];
  if (manifest === undefined) return form;
  const key = controlKey(association, `review:${manifest}`);
  const button = h("button", { type: "button", class: "primary", "data-task-act": act.kind, "data-focus-key": key }, "Review change");
  if (context.pending || context.uncertain) button.setAttribute("disabled", "");
  button.addEventListener("click", () => {
    let owned: WorkbenchDialog | null = null;
    const content = taskForm(act, (kind, on, typed, accepted) => send(kind, on, typed, () => { accepted?.(); if (workbenchDialog === owned) closeWorkbench(); }), context, fields, label);
    openWorkbench(`Review version ${manifest}`, content, association, key, "review", { manifest: Number(manifest), action: act.kind });
    owned = workbenchDialog;
  });
  return button;
}

function reconcileReview(context: string, change: Awaited<ReturnType<typeof loadChange>>, blocked: boolean, offered = true): void {
  const selected = workbenchDialog;
  if (selected?.kind !== "review" || selected.context !== context || selected.route !== location.hash) return;
  if (selected.manifest !== change.currentManifest) {
    selected.message.textContent = `Version ${selected.manifest} is no longer current. This draft is kept. Close this review and choose the new version explicitly.`;
    selected.message.removeAttribute("hidden");
    for (const button of selected.body.querySelectorAll("button[type=submit]")) button.setAttribute("disabled", "");
  } else if (blocked || !offered) {
    selected.message.textContent = blocked ? "Check the original request before another action. This review still names its original version." : "Review is no longer available to this member. This draft still names its original version.";
    selected.message.removeAttribute("hidden");
    for (const button of selected.body.querySelectorAll("button[type=submit]")) button.setAttribute("disabled", "");
  } else {
    const last = lastActs.get(context);
    if (last?.kind === selected.action && last.answer.answer === "refused") {
      selected.message.textContent = nonacceptedAnswerText(last.answer);
      selected.message.removeAttribute("hidden");
      for (const control of selected.body.querySelectorAll("input, textarea, select, button[type=submit]")) control.removeAttribute("disabled");
    }
  }
}

/** Enter the existing editor from one explicitly selected native change.
 * This supplies no empty/new-page source, in-place correction or invented base. */
function proposeFromRecordedSource(room: Room, rows: Awaited<ReturnType<typeof listLanes>>["changes"], context: ActionContext): HTMLElement {
  const association = actAssociation(room, room.directory);
  const key = controlKey(association, "propose-change");
  const button = h("button", { type: "button", class: "button primary", "aria-label": "Propose change", "data-focus-key": key },
    h("span", { class: "full-label" }, "Propose change"), h("span", { class: "short-label" }, icon("plus"), "Create"));
  const host = h("div", {}, button);
  const permitted = !!room.me?.actions.includes("change.propose");
  if (context.pending || context.uncertain || rows.length === 0 || !permitted) button.setAttribute("disabled", "");
  if (!permitted) host.append(h("p", { class: "muted small" }, "Your current member cannot propose a text change."));
  else if (rows.length === 0) host.append(h("p", { class: "muted small" }, "No recorded change is available here as a text source."));
  button.addEventListener("click", () => {
    if (button.hasAttribute("disabled")) return;
    const binding = settingsContext(settings() ?? { place: null, secret: "" });
    const route = location.hash;
    const content = h("div");
    openWorkbench("Propose change", content, association, key, "source");
    const owned = workbenchDialog!;
    const current = () => workbenchDialog === owned && location.hash === route && settingsContext(settings() ?? { place: null, secret: "" }) === binding;
    const message = h("p", { role: "status", "aria-live": "polite" });
    const load = async (scope: ScopeId) => {
      if (!current()) return;
      content.replaceChildren(message); message.textContent = "Reading source";
      try {
        const change = await loadChange(room, scope);
        if (!current()) return;
        const selected = change.manifests.find(manifest => manifest.state === "current") ?? change.manifests.at(-1);
        if (!selected?.file || typeof selected.file.content !== "string") {
          message.textContent = "Verified retained text is unavailable for this change.";
          if (rows.length > 1) {
            const back = h("button", { type: "button" }, "Choose another source");
            back.addEventListener("click", () => { content.replaceChildren(h("label", {}, "Source change", selection), choose); selection.focus(); });
            content.append(back);
          }
          return;
        }
        const sourceContext = actAssociation(room, change.scope);
        const settled = () => {
          const unsettled = [lastActs.get(sourceContext), lastActs.get(association)].some(last => last && (last.answer.answer === "unavailable" || last.answer.answer === "mismatch" || last.observation !== null));
          return !sending.get(association) && !sending.get(sourceContext) && !unsettled;
        };
        content.replaceChildren(retainedEditor(room, change, { current: () => current() && settled(), recorded: lane => { if (current()) location.hash = `#/change/${lane}`; } }));
      } catch (error) { if (current()) message.textContent = error instanceof Error ? error.message : "The recorded source could not be read."; }
    };
    if (rows.length === 1) { void load(rows[0]!.scope); return; }
    const selection = h("select", { "aria-label": "Recorded source change", "data-focus-key": controlKey(association, "source-choice") },
      h("option", { value: "" }, "Choose a recorded source"), rows.map(row => h("option", { value: row.scope }, `#${row.number ?? "?"} · ${row.title ?? "Untitled"}`))) as HTMLSelectElement;
    const choose = h("button", { type: "button", class: "primary" }, "Use source");
    choose.setAttribute("disabled", "");
    selection.addEventListener("change", () => { if (selection.value) choose.removeAttribute("disabled"); else choose.setAttribute("disabled", ""); });
    choose.addEventListener("click", () => {
      const row = rows.find(row => row.scope === selection.value);
      if (row) void load(row.scope);
    });
    content.replaceChildren(h("label", {}, "Source change", selection), choose);
    selection.focus();
  });
  return host;
}

async function roomOf(kept: Settings, place: Place): Promise<Room> {
  return opened.get(roomContext(location.origin, place, kept.secret), () => openRoom(sessionOf(kept), place));
}

/** Room and account labels come from the recorded read, never prototype fixtures. */
function shell(destination: Destination, room: Room | null, ...content: HTMLElement[]): HTMLElement[] {
  const offer = claimOffer;
  const kept = settings();
  const directory = room?.directory ?? kept?.place?.directory;
  const recordedName = room?.name || (directory ? `Room ${directory.slice(3, 11)}` : "Choose a room");
  const local = room && kept ? labelFor(kept.label, { directory: room.directory, membership: room.membership }, kept.register)?.text : undefined;
  const name = recordedName;
  const account = room?.me?.handle || "Your key";
  const shellContext = JSON.stringify([location.origin, directory ?? null, room?.membership ?? null, room?.key ?? null]);
  const roomSwitch = () => h("a", { class: "room-switch", href: "#/settings", title: directory ?? "Choose a room", "aria-label": `Room settings: ${name}`, "data-focus-key": controlKey(shellContext, "room-settings") }, h("span", { class: "room-name" }, h("span", {}, name), local ? h("span", { class: "room-recorded-name", title: "Personal label in this browser" }, `Personal label: ${local}`) : null), h("span", { "aria-hidden": "true" }, "⌄"));
  const accountControl = () => h("a", { class: "account", href: "#/settings", "aria-label": `Account settings: ${account}`, "data-focus-key": controlKey(shellContext, "account-settings") }, h("span", { class: "avatar", "aria-hidden": "true" }, account.slice(0, 1).toUpperCase()), h("span", { class: "account-label" }, account));
  const navigation = (mobile = false) => h("nav", { class: mobile ? "navigation mobile-nav" : "navigation", "aria-label": "Room" },
    ([ ["issues", "Issues", "#/"], ["changes", "Changes", "#/?kind=change"], ["rules", "Rules", "#/rules"] ] as const).map(([kind, label, href]) =>
      h("a", { class: "nav-item", href, "data-focus-key": controlKey(shellContext, `nav:${kind}`), ...(destination === kind ? { "aria-current": "page" } : {}) }, label)),
    room ? h("a", { class: "nav-item", href: siteAddress(room, ""), title: "Latest published pages" }, "Pages") : null);
  const skip = h("a", { class: "skip", href: "#page-main" }, "Skip to content");
  skip.addEventListener("click", (event) => { event.preventDefault(); document.getElementById("page-main")?.focus(); });
  const create = () => {
    const button = h("button", { class: "nav-item", type: "button", "data-focus-key": controlKey(shellContext, "create-room") }, "Create room");
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
  let status: ReturnType<typeof claimStatus>;
  try { status = claimStatus(sessionOf(kept), configured, localStorage); }
  catch (error) { alert(error instanceof Error ? error.message : "The private claim status could not be read."); return; }
  const selected = status?.state === "complete" && kept.claimSelection?.operation === status.operation;
  let mode: "new" | "resume" = status && !selected ? "resume" : "new";
  let operation = status?.operation;
  const name = h("input", { name: "name", required: "", maxlength: "256", value: mode === "resume" ? status!.label : claimDrafts.get(binding) ?? "", autocomplete: "off" }) as HTMLInputElement;
  const message = h("p", { role: "status", hidden: "" });
  const submit = h("button", { type: "submit", class: "primary" }, mode === "resume" ? "Resume creation" : "Create room");
  const cancel = h("button", { type: "button" }, "Cancel");
  const form = h("form", {}, h("h1", { id: "create-room-title" }, "Create room"), h("label", {}, "Room name", name), message, h("div", { class: "form-footer" }, cancel, submit));
  const dialog = h("dialog", { class: "room-dialog", "aria-labelledby": "create-room-title" }, form) as HTMLDialogElement;
  roomDialog = dialog;
  roomDialogBinding = { settings: binding, route: location.hash };
  const openerKey = opener.getAttribute("data-focus-key");
  const close = (preserveDraft = true) => { if (preserveDraft) claimDrafts.set(binding, name.value); else claimDrafts.delete(binding); dialog.close(); dialog.remove(); if (roomDialog === dialog) { roomDialog = null; roomDialogBinding = null; } if (openerKey) returnToControl(openerKey); };
  cancel.addEventListener("click", () => { close(); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  name.addEventListener("input", () => { claimDrafts.set(binding, name.value); });
  if (mode === "resume") name.setAttribute("disabled", "");
  if (claiming.has(binding)) { submit.setAttribute("disabled", ""); name.setAttribute("disabled", ""); }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (claiming.has(binding) || !name.value.trim() || settingsContext(settings() ?? { place: null, secret: "" }) !== binding) return;
    claiming.add(binding); claimDrafts.set(binding, name.value); submit.setAttribute("disabled", ""); name.setAttribute("disabled", "");
    message.textContent = "Creating room"; message.removeAttribute("hidden");
    void (async () => {
      try {
        const result = await claimRoom(sessionOf(kept), configured, localStorage, name.value, { mode, ...(operation ? { operation } : {}), handle: room.me!.handle, current: () => settingsContext(settings() ?? { place: null, secret: "" }) === binding });
        operation = result.operation; mode = "resume";
        if (settingsContext(settings() ?? { place: null, secret: "" }) !== binding) return;
        if (result.repository) {
          const place = { directory: result.repository.directory.scope, membership: result.repository.membership };
          const label: LocalLabel = { text: result.label, place, ...(kept.register ? { register: kept.register } : {}) };
          const claimSelection: ClaimSelection = { operation: result.operation, place, register: configured.register, origin: location.origin, key: keyIdOfSecret(room.session.secret) };
          if (!keep({ ...kept, place, label, claimSelection })) {
            message.textContent = `Creation is recorded, but storage of the room settings could not be verified. Check the saved room and key before another action. Directory ${result.repository.directory.scope}; membership ${result.repository.membership.scope}. Keep the private claim record. Resume creation to verify the original proof before trying to save again.`;
            submit.textContent = "Resume creation";
            return;
          }
          opened.clear(); close(false); location.hash = "#/"; await draw(true);
        } else {
          message.textContent = result.outcome.lines.join(" "); submit.textContent = result.pending ? "Resume creation" : "Create room";
          if (result.pending) name.setAttribute("disabled", ""); else name.removeAttribute("disabled");
        }
      } catch (error) {
        if (settingsContext(settings() ?? { place: null, secret: "" }) !== binding) return;
        try {
          const retained = claimStatus(sessionOf(kept), configured, localStorage);
          if (retained) { operation = retained.operation; mode = "resume"; name.value = retained.label; name.setAttribute("disabled", ""); }
        } catch { /* Preserve the original error; private recovery remains unavailable. */ }
        message.textContent = error instanceof Error ? error.message : "Creation could not be confirmed. Resume with the saved request."; submit.textContent = "Resume creation";
      }
      finally { claiming.delete(binding); submit.removeAttribute("disabled"); }
    })();
  });
  document.body.append(dialog); dialog.showModal(); name.focus();
}

/** The acts panel for one scope: its form sends the act, keeps the answer and draws the screen again. */
interface PanelOptions {
  offered?: Awaited<ReturnType<typeof actsOn>>;
  represented?: readonly string[];
  customForm?: (send: (kind: string, on: string, typed: Record<string, string>) => void, blocked: boolean, draftKey: string) => HTMLElement;
  tasks?: (offered: Awaited<ReturnType<typeof actsOn>>, send: Send, context: ActionContext) => readonly string[];
}
async function panelFor(room: Room, scope: ScopeId, context: ActionContext = {}, options: PanelOptions = {}): Promise<HTMLElement> {
  const association = actAssociation(room, scope);
  const capturedRoute = location.hash;
  const capturedDrawing = drawing;
  let answerHost: HTMLElement | null = null;
  let noticeHost: HTMLElement | null = null;
  const activeView = () => capturedDrawing === drawing && location.hash === capturedRoute && currentContext();
  const showLocally = (message: HTMLElement, blocked = true, notice = "") => {
    if (!activeView()) return;
    answerHost?.replaceChildren(message);
    if (noticeHost && notice) { noticeHost.textContent = notice; noticeHost.removeAttribute("hidden"); }
    if (blocked) {
      const hosts = [root(), ...(workbenchDialog?.context === association ? [workbenchDialog.body] : [])];
      for (const host of hosts) for (const control of host.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('[data-act] input, [data-act] textarea, [data-act] select, [data-act] button, [data-action-slot="create"] button, [data-action-slot="edit"] button, [data-action-slot="edit"] input, [data-action-slot="edit"] textarea')) control.setAttribute("disabled", "");
    }
  };
  const currentContext = () => {
    const current = settings();
    return current?.place && roomContext(location.origin, current.place, current.secret) === roomContext(room.session.service, { directory: room.directory, membership: room.membership }, b64url(room.session.secret));
  };
  const send = (kind: string, on: string, typed: Record<string, string>, accepted?: () => void) => {
    const previous = lastActs.get(association);
    if (context.uncertain || context.blockedKinds?.includes(kind) || previous && (previous.answer.answer === "unavailable" || previous.answer.answer === "mismatch" || previous.observation !== null)) return;
    if (!sending.begin(association, kind)) return;
    showLocally(h("p", { role: "status" }, "Sending request"), true, "Sending request");
    void (async () => {
      try {
        if (!currentContext()) throw new Error("The room or key changed. Open this view again before sending.");
        const offered = (await actsOn(room, scope)).acts.find((a) => a.kind === kind);
        if (!currentContext()) throw new Error("The room or key changed. Open this view again before sending.");
        if (!offered) throw new Error("This action is no longer offered. Check status before sending.");
        const fields: Record<string, FieldValue> = Object.fromEntries(Object.entries(typed).map(([name, text]) => [name, fieldValue(room, offered.fields.find((f) => f.name === name)?.type ?? "text", text)]));
        const target = /^\d+$/.test(on) ? Number(on) : null;
        const result = await act(room, scope, kind, { on: target, fields }, (known) => {
          lastActs.set(association, known); sending.answered(association);
          showLocally(answerLine(known), true, known.answer.answer === "accepted" ? "Request accepted" : known.answer.answer === "refused" ? `Request refused: ${known.answer.reason}` : "Request outcome unknown");
          if (known.answer.answer === "accepted") accepted?.();
        }, () => {
          if (!currentContext()) throw new Error("The room or key changed before submission. Nothing was sent.");
          sending.submitting(association);
        });
        lastActs.set(association, result);
      } catch (error) {
        sending.failed(association);
        if (sending.get(association)?.state === "unknown") showLocally(unknownRequest(kind), true, "Request outcome unknown");
        else if (activeView()) showLocally(h("p", { role: "status" }, error instanceof Error ? error.message : String(error)), false, error instanceof Error ? error.message : "The request could not be prepared.");
      }
      if (activeView()) await draw();
    })();
  };
  const offered = options.offered ?? await actsOn(room, scope);
  const last = lastActs.get(association);
  const fence = sending.get(association);
  const pending = !!fence && fence.state !== "unknown";
  const uncertain = fence?.state === "unknown" || context.uncertain || !!last && (last.answer.answer === "unavailable" || last.answer.answer === "mismatch" || last.observation !== null);
  const taskContext = { ...context, pending, uncertain, draftKey: association, refresh: () => { void draw(); } };
  const represented = options.tasks?.(offered, send, taskContext) ?? [];
  const remaining = { ...offered, acts: offered.acts.filter((act) => !options.represented?.includes(act.kind) && !represented.includes(act.kind)) };
  const advancedContext = { ...taskContext };
  delete advancedContext.choices;
  const panel = actsPanel(remaining, send, last ? answerLine(last) : null, { ...advancedContext, primary: [] });
  answerHost = h("div", { class: "request-answer", "aria-live": "polite" });
  panel.prepend(answerHost);
  noticeHost = h("p", { "data-task-status": "", role: "status", "aria-live": "polite", hidden: "" });
  if (pending || uncertain) { noticeHost.textContent = pending ? "Sending request" : "Request outcome unknown"; noticeHost.removeAttribute("hidden"); }
  panel.append(noticeHost);
  if (options.customForm) panel.append(options.customForm(send, pending || !!uncertain, association));
  if (fence?.state === "unknown") panel.append(unknownRequest(fence.kind));
  return panel;
}

function settingsScreen(): HTMLElement {
  const kept = settings();
  const selectedContext = settingsContext(kept ?? { place: null, secret: "" });
  let joinKey: string | null = null;
  if (kept?.place) {
    try { joinKey = enrollmentAssociation(sessionOf(kept), kept.place.membership); } catch { /* Invalid key cannot select a Join record. */ }
  }
  const screenDraw = drawing;
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
    const label = typed ? undefined : labelFor(kept?.label, place, register);
    const chosenSecret = newSecret ?? ((secret as HTMLInputElement).value.trim() || kept?.secret || "");
    const claimSelection = !typed && chosenSecret === kept?.secret ? kept?.claimSelection : undefined;
    return { place, secret: chosenSecret, ...(register ? { register } : {}), ...(label ? { label } : {}), ...(claimSelection ? { claimSelection } : {}) };
  };
  const save = (next: Settings) => {
    if (!keep(next)) { tell(false, "Storage of these settings could not be verified. Check the saved room and key before another action."); return; }
    roomDraft = ""; (room as HTMLTextAreaElement).value = ""; opened.clear();
    const sameRoute = location.hash === "#/";
    location.hash = "#/";
    if (sameRoute) queueMicrotask(() => { void draw(); });
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); const next = read(null); if (next) save(next); });
  form.querySelector("#new-key")!.addEventListener("click", () => { const next = read(b64url(crypto.getRandomValues(new Uint8Array(32)))); if (next) { if (!keep(next)) { tell(false, "Storage of the new key could not be verified. Check the saved room and key before another action."); return; } roomDraft = (room as HTMLTextAreaElement).value; roomDraftContext = JSON.stringify([next.place, next.secret, next.register ?? null]); opened.clear(); void draw(); } });
  // Joining signs membership's `join` with the kept key and the link's secret. The link is not kept: only the room it names.
  const joinButton = form.querySelector("#join")!;
  const previousRecord = joinRepliesByContext.get(selectedContext) ?? (joinKey ? joinAnswers.get(joinKey) : undefined);
  const previousJoin = previousRecord?.result;
  if (previousJoin?.answer.answer === "accepted") {
    joinButton.setAttribute("disabled", "");
    const select = h("button", { type: "button" }, "Use joined room");
    select.addEventListener("click", () => {
      if (settingsContext(settings() ?? { place: null, secret: "" }) !== selectedContext) return;
      save({ ...previousRecord!.settings, place: previousJoin.place });
    });
    form.append(select);
  }
  if (joinKey && joining.get(joinKey)) { joinButton.setAttribute("disabled", ""); tell(false, joining.get(joinKey)?.state === "unknown" ? "The Join request outcome is unknown. Inspect membership and the original request. This page does not retain the exact signed request for automatic recovery; do not send a replacement." : "Joining room"); }
  if (previousJoin) tell(previousJoin.answer.answer === "accepted", previousJoin.answer.answer === "accepted" ? `Joining was accepted by membership ${previousJoin.place.membership.scope}. The saved room was not changed after the settings context changed. Inspect that membership before choosing this room.` : `${nonacceptedAnswerText(previousJoin.answer)} Inspect membership ${previousJoin.place.membership.scope} and the original request.`);
  if (previousJoin) form.append(h("details", { class: "inspection" }, h("summary", {}, "Inspect Join answer"), h("pre", {}, JSON.stringify(previousJoin.answer, null, 2))));
  const offeredJoin = () => {
    try {
      const typed = (room as HTMLTextAreaElement).value;
      if (!typed.trim().startsWith("artroom-invite:")) return;
      const key = (secret as HTMLInputElement).value.trim() || kept?.secret || "";
      const enrollment = joinAssociation(sessionOf({ place: kept?.place ?? null, secret: key }), typed);
      const state = joining.get(enrollment);
      if (state || joinAnswers.get(enrollment)?.result.answer.answer === "accepted") {
        joinButton.setAttribute("disabled", "");
        if (state) tell(false, state.state === "unknown" ? "The Join request outcome is unknown. Inspect membership and the original request. This page does not retain the exact signed request for automatic recovery; do not send a replacement." : "Joining room");
      } else joinButton.removeAttribute("disabled");
    } catch { /* The submit handler reports an invalid invitation or key. */ }
  };
  room.addEventListener("input", () => { roomDraft = (room as HTMLTextAreaElement).value; offeredJoin(); });
  secret.addEventListener("input", offeredJoin);
  joinButton.addEventListener("click", () => {
    void (async () => {
      const next = read(null);
      if (!next) return;
      const invitation = (room as HTMLTextAreaElement).value;
      const current = () => settingsContext(settings() ?? { place: null, secret: "" }) === selectedContext;
      let enrollment: string;
      try { enrollment = joinAssociation(sessionOf(next), invitation); }
      catch (error) { tell(false, error instanceof Error ? error.message : "The invitation could not be read."); return; }
      if (!current() || joinAnswers.get(enrollment)?.result.answer.answer === "accepted" || !joining.begin(enrollment, "join")) return;
      joinButton.setAttribute("disabled", "");
      try {
        const joined = await joinRoom(sessionOf(next), invitation, () => {
          if (!current()) throw new Error("The room or key changed before joining. Nothing was sent.");
          joining.submitting(enrollment);
        });
        const record = { result: joined, settings: next };
        joinAnswers.set(enrollment, record);
        if (joined.answer.answer !== "unavailable" && joined.answer.answer !== "mismatch") joinRepliesByContext.set(selectedContext, record);
        if (joined.answer.answer === "unavailable" || joined.answer.answer === "mismatch") joining.failed(enrollment); else joining.answered(enrollment);
        if (!current() || screenDraw !== drawing) return;
        if (joined.answer.answer !== "accepted") return tell(false, `${nonacceptedAnswerText(joined.answer)} Inspect membership ${joined.place.membership.scope} and the original request before another join. Recovery requires the same signed envelope; this page does not retain it.`);
        save({ ...next, place: joined.place });
      } catch (error) {
        joining.failed(enrollment);
        if (current() && screenDraw === drawing) tell(false, joining.get(enrollment)?.state === "unknown" ? "The Join request outcome is unknown. Inspect membership and the original request. This page does not retain the exact signed request for automatic recovery; do not send a replacement." : error instanceof Error ? error.message : String(error));
      } finally {
        if (!joining.get(enrollment) && joinAnswers.get(enrollment)?.result.answer.answer !== "accepted") joinButton.removeAttribute("disabled");
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
  claimOffer = undefined;
  if (roomDialog && (roomDialogBinding?.settings !== settingsContext(settings() ?? { place: null, secret: "" }) || roomDialogBinding?.route !== location.hash)) {
    roomDialog.close(); roomDialog.remove(); roomDialog = null; roomDialogBinding = null;
  }
  if (workbenchDialog && (workbenchDialog.route !== location.hash || workbenchDialog.binding !== settingsContext(settings() ?? { place: null, secret: "" }))) closeWorkbench(false);
  const route = routeOf(location.hash);
  const kept = settings();
  const publish = showFor(currentDraw, focus);
  const originalContext = kept ? settingsContext(kept) : null;
  const show = (...children: HTMLElement[]) => {
    const current = settings();
    if (currentDraw !== drawing) return;
    if ((current ? settingsContext(current) : null) !== originalContext) { void draw(focus); return; }
    publish(...children);
  };
  if (route.destination === "settings" || !kept || !kept.place || ignoredSavedAddress) return show(...shell("settings", null, settingsScreen()));
  let room: Room | null = null;
  try {
    room = await roomOf(kept, kept.place);
    if (kept.register && room.me?.handle && typeof navigator !== "undefined" && navigator.locks && typeof HTMLDialogElement !== "undefined") {
      try {
        const configured = await allowedClaim(sessionOf(kept), kept.register);
        claimStatus(sessionOf(kept), configured, localStorage); // A corrupt private recovery record offers no fresh creation.
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
      const screen = issueScreen(room, issue);
      const actionContext = { ...(defaults ? { defaults } : {}), ...issueActions(issue.state, offered.acts.map((act) => act.kind)) };
      const association = actAssociation(room, scope as ScopeId);
      const panel = await panelFor(room, scope as ScopeId, actionContext, { offered, tasks: (acts, send, context) => {
        const represented: string[] = [];
        const comment = acts.acts.find((act) => act.kind === "comment");
        if (comment) {
          const control = taskForm(comment, send, context, ["body"], "Comment");
          screen.querySelector('[data-action-slot="comment"]')?.append(control);
          if (control.hasAttribute("data-act")) represented.push("comment");
        }
        const next = acts.acts.find((act) => actionContext.primary.includes(act.kind) && act.kind !== "comment");
        if (next && !context.pending && !context.uncertain) {
          const control = taskForm(next, send, context, ["reason"], "Issue action");
          screen.querySelector('[data-action-slot="next"]')?.append(control);
          if (control.hasAttribute("data-act")) represented.push(next.kind);
        }
        return represented;
      } });
      return show(...shell(destination, room, inspectedScreen(screen, panel, association, "Issue record")));
    }
    if (destination === "changes" && scope) {
      const change = await loadChange(room, scope as ScopeId);
      const current = change.currentManifest === undefined ? change.manifests.find((manifest) => manifest.state === "current") : change.manifests.find((manifest) => manifest.id === change.currentManifest);
      const defaults = {
        ...(current ? Object.fromEntries(["review-verdict", "request-check"].map((kind) => [kind, { fields: { manifest: String(current.id) } }])) : {}),
        ...(change.proposal === undefined ? {} : Object.fromEntries(["edit-own", "edit-any", "ready-own", "ready-any", "request-review-own", "request-review-any"].map((kind) => [kind, { on: change.proposal! }]))),
      };
      const taskContext = changeTaskContext(change);
      const applicable = taskReviewExtents(change);
      if (change.reviewMembersByExtent !== undefined && taskContext.choices["review-verdict"]) {
        taskContext.choices["review-verdict"] = { ...taskContext.choices["review-verdict"], extent: (change.reviewExtents ?? []).filter(extent => applicable.some(row => row.name === extent.value) && change.reviewMembersByExtent?.[extent.value]?.some(member => member.value === loaded.me?.handle)) };
        const required = applicable.filter(extent => extent.approvals > 0);
        const relevant = required.length ? required : applicable;
        const recipients = new Map<string, { label: string; value: string }>();
        for (const extent of relevant) for (const candidate of change.reviewMembersByExtent?.[extent.name] ?? []) recipients.set(candidate.value, candidate);
        for (const kind of ["request-review-own", "request-review-any"]) taskContext.choices[kind] = { requested: [...recipients.values()] };
      }
      const uncertain = change.merges.some((merge) => ["intended", "committed", "unknown"].includes(merge.state));
      const { primary, blockedKinds } = changeActions(change.state, !!current?.file && editPath(current.file.path) === null);
      const lastAct = lastActs.get(actAssociation(room, scope as ScopeId));
      const mergeAnswer = lastAct && ["merge", "cancel-merge"].includes(lastAct.kind) ? last(scope) : null;
      const screen = changeScreen(room, change, mergeAnswer, lastAct?.kind);
      if (current?.file && typeof current.file.content === "string") {
        const capturedHash = location.hash;
        const capturedContext = settingsContext(kept);
        const priorMutation = lastActs.get(actAssociation(loaded, change.scope));
        const mutationUnsettled = () => !!sending.get(actAssociation(loaded, change.scope)) || !!priorMutation && (priorMutation.answer.answer === "unavailable" || priorMutation.answer.answer === "mismatch" || priorMutation.observation !== null);
        screen.querySelector('[data-action-slot="edit"]')?.append(mutationUnsettled() ? h("p", { class: "muted" }, "The current request must be confirmed before proposing an edit.") : retainedEditor(room, change, {
          current: () => location.hash === capturedHash && settingsContext(settings() ?? { place: null, secret: "" }) === capturedContext && !mutationUnsettled(),
          recorded: (lane) => { location.hash = `#/change/${lane}`; },
        }));
      }
      const association = actAssociation(room, scope as ScopeId);
      const panel = await panelFor(room, scope as ScopeId, { defaults: { ...defaults, ...taskContext.defaults }, ...(taskContext.choices ? { choices: taskContext.choices } : {}), uncertain, statusShown: uncertain, primary, blockedKinds }, { tasks: (acts, send, context) => {
        const represented: string[] = [];
        const comment = acts.acts.find((act) => act.kind === "comment");
        if (comment) {
          const control = taskForm(comment, send, context, ["body"], "Comment");
          screen.querySelector('[data-action-slot="comment"]')?.append(control);
          if (control.hasAttribute("data-act")) represented.push("comment");
        }
        const next = nextChangeAction(loaded, change, acts.acts, primary);
        reconcileReview(association, change, !!context.pending || !!context.uncertain, acts.acts.some(act => act.kind === "review-verdict"));
        if (next && !context.pending && !context.uncertain) {
          const label = next.kind === "merge" ? "Merge change" : next.kind.startsWith("request-review") ? "Request review" : "Review change";
          const control = nextTask(next, send, context, ["verdict", "body", "extent", ...(change.reviewMembers ? ["requested"] : [])], label, association);
          screen.querySelector('[data-action-slot="next"]')?.append(control);
          if (control.hasAttribute("data-act") || control.hasAttribute("data-task-act")) represented.push(next.kind);
        }
        return represented;
      } });
      return show(...shell(destination, room, inspectedScreen(screen, panel, association, "Change record")));
    }
    if (destination === "rules") {
      const rules = await loadRules(room);
      const offered = await actsOn(room, room.rules);
      const editable = rules.item !== undefined && offered.acts.some((act) => act.kind === "publish");
      const options: PanelOptions = { offered, ...(editable ? { represented: ["publish"], customForm: (send, blocked, draftKey) => rulesEditor(rules, send, { blocked, draftKey }) } : {}) };
      const screen = rulesScreen(room, rules, editable);
      const panel = await panelFor(room, room.rules, {}, options);
      return show(...shell(destination, room, inspectedScreen(screen, panel, actAssociation(room, room.rules), "Rules record")));
    }
    const kind = destination === "changes" ? "change" : "issue";
    const listContext = { origin: location.origin, directory: room.directory, membership: room.membership, key: room.key };
    const lanes = await listLanes(room);
    const screen = roomScreen(room, lanes, kind, { state: stateOf(listContext, kind), changed: (state) => { keepState(listContext, kind, state); }, focusKey: actAssociation(room, room.directory) });
    const panel = await panelFor(loaded, loaded.directory, {}, { tasks: (acts, send, context) => {
      if (destination === "changes") {
        const open = acts.acts.find(act => act.kind === "open-pr");
        if (open) screen.querySelector('[data-action-slot="create"]')?.append(proposeFromRecordedSource(loaded, lanes.changes, context));
        return []; // Generic custom declarations remain available in Advanced.
      }
      const open = destination === "issues" ? acts.acts.find((act) => act.kind === "open-issue") : undefined;
      if (!open) return [];
      const control = createIssue(open, send, context);
      screen.querySelector('[data-action-slot="create"]')?.append(control);
      // An unavailable task paragraph must not remove the usable native
      // declaration from Inspect (for example a custom required field).
      return control.hasAttribute("data-task-act") ? [open.kind] : [];
    } });
    return show(...shell(destination, room, inspectedScreen(screen, panel, actAssociation(room, room.directory), "Room record")));
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
