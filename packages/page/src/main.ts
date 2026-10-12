/**
 * The page in a browser: the connection kept in local storage, and one screen
 * for each address after `#`.
 *
 * | Address | Screen |
 * |---|---|
 * | `#/` | The room's issues and changes, and the acts the caller may sign on the directory (opening an issue or a change). |
 * | `#/issue/<scope>` | One issue, and the acts the caller may sign on it. |
 * | `#/change/<scope>` | One change, with its states, and the acts the caller may sign on it. |
 * | `#/rules` | The rules of this room, and the acts the caller may sign on the rules scope. |
 * | `#/join`, `#/invitation`, `#/config` | Choose an existing room connection. |
 *
 * The page is served by the scope Worker at `/page/` and reads that Worker.
 *
 * The key is a 32-byte Ed25519 secret, kept in this browser's local storage
 * under `artroom-page`, as unpadded base64url. It is never shown: only its
 * key ID is. Any script that runs on the page's origin can read local
 * storage, so serve the page from an origin that runs nothing else.
 */

import type { Answer, FieldValue, MemberRef, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, isScopeRef, keyIdOfSecret, unb64url } from "@generalbusiness/artroom-bytes";
import { act, actAssociation, actsOn, fieldValue, listLanes, loadChange, loadIssue, loadRules, openRoom, placeOf, siteAddress, type Acted, type Place, type Room, type Session } from "./data.ts";
import { actsPanel, answerLine, nonacceptedAnswerText, changeScreen, failureScreen, h, icon, issueScreen, roomScreen, rulesScreen } from "./view.ts";
import { RoomOpening, ScopeSending, changeActions, issueActions, roomContext, routeOf, type Destination } from "./shell.ts";
import { editPath } from "@generalbusiness/artroom-platform";
import { reconcileActionDrafts, type ActionContext } from "./actions.ts";
import { rulesEditor } from "./rules-editor.ts";
import { changeTaskContext, createIssue, issueDialogOutcome, nextChangeAction, reconcileIssueDialogs, requestedReviewCandidates, reviewSelectionProblem, taskForm, taskReviewExtents, type ReviewSelection } from "./tasks.ts";
import type { Send } from "./actions.ts";
import { stateOf, keepState } from "./list-context.ts";
import { retainedEditor } from "./retained-editor.ts";
import { controlKey, keepFocus, restoreFocus } from "./focus.ts";
import { allowedClaim, claimRoom, claimStatus, type ClaimRegister } from "./claim.ts";
import { joinInvitation, checkOriginal, originalJoin, type JoinResult } from "./join-custody.ts";

const KEPT = "artroom-page";
/** The room text survives a key-generation redraw in memory only. It can hold an invitation secret. */
let invitationDraft = "";
let configDraft = "";
let connectionBusy = false;
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
  if (!secret || secret.length !== 32) throw new Error("The saved connection key is invalid. Join with an invitation or matching config and key.");
  return { service: location.origin, secret };
};

const root = (): HTMLElement => document.getElementById("page")!;
/** The number of the latest draw: a slower, earlier draw that ends after a later one shows nothing. */
let drawing = 0;
const showFor = (n: number, focus: boolean) => (...children: HTMLElement[]) => {
  if (n !== drawing) return;
  const previousFocus = keepFocus(root());
  root().setAttribute("data-entry", String(children.some(child => child.getAttribute("class") === "entry-header")));
  root().replaceChildren(...children);
  reconcileActionDrafts(root());
  syncCurrentFences();
  if (focus) document.getElementById("page-main")?.focus?.();
  else restoreFocus(root(), previousFocus);
};


const opened = new RoomOpening<Room>();
let lastVerifiedContext: string | null = null;
/** The scope's answer to the last act sent from this page, by service/room/member/scope, for the states and the answer line. */
const lastActs = new Map<string, Acted>();
const sending = new ScopeSending();
const claimDrafts = new Map<string, string>();
const claiming = new Set<string>();
let roomDialog: HTMLDialogElement | null = null;
let roomDialogBinding: { settings: string; route: string } | null = null;
interface WorkbenchDialog {
  dialog: HTMLDialogElement; body: HTMLElement; context: string; route: string; kind: "record" | "review" | "source";
  opener: string; manifest?: number; action?: string; message: HTMLElement; binding: string;
  reviewDisabled?: Set<HTMLElement>;
  review?: { room: Room; change: Awaited<ReturnType<typeof loadChange>>; blocked: boolean; offered: boolean; requestOffered: boolean };
  reviewBinding?: { scope: ScopeRef | null; member: MemberRef | null; fixed: string | undefined; choices: readonly string[] };
}
let workbenchDialog: WorkbenchDialog | null = null;
const settingsContext = (kept: Settings): string => JSON.stringify([location.origin, kept.place, kept.secret, kept.register ?? null]);
let claimOffer: { kept: Settings; configured: ClaimRegister } | undefined;
function unknownRequest(kind: string): HTMLElement {
  return h("p", { class: "muted" }, `The ${kind} request may have been recorded. Checking status only reads the scope; a changed head does not settle this request. This page does not retain the exact signed request for automatic recovery. Keep this session open and inspect the original request before recovery; do not send a replacement.`);
}

function currentScopeHosts(context: string): HTMLElement[] {
  return [root(), ...(workbenchDialog?.context === context && workbenchDialog.route === location.hash ? [workbenchDialog.body] : [])];
}
function fenceCurrentScope(context: string): void {
  for (const host of currentScopeHosts(context)) for (const control of host.querySelectorAll<HTMLElement>('[data-act] input, [data-act] textarea, [data-act] select, [data-act] button, [data-action-slot="create"] button, [data-action-slot="edit"] button, [data-action-slot="edit"] input, [data-action-slot="edit"] textarea')) control.setAttribute("disabled", "");
}
/** A render prepared before submission still publishes the current scope fence. */
function syncCurrentFences(): void {
  const hosts = [root(), ...(workbenchDialog?.kind === "record" && workbenchDialog.route === location.hash ? [workbenchDialog.body] : [])];
  for (const host of hosts) for (const marker of host.querySelectorAll<HTMLElement>("[data-request-context]")) {
    const context = marker.getAttribute("data-request-context")!;
    const last = lastActs.get(context);
    if (sending.get(context) || last && (last.answer.answer === "unavailable" || last.answer.answer === "mismatch" || last.observation !== null)) fenceCurrentScope(context);
  }
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
    reconcileActionDrafts(body);
    restoreFocus(body, saved);
  }
  return screen;
}

/** A fixed request or voluntary choice never changes when another request arrives. */
function selectedReviewRequest(dialog: WorkbenchDialog, typed: string | undefined): ReviewSelection {
  const held = dialog.reviewBinding;
  let request: number | null | undefined;
  if (held?.fixed !== undefined) request = (typed ?? "") === held.fixed ? held.fixed === "" ? null : Number(held.fixed) : undefined;
  else request = typed && held?.choices.includes(typed) ? Number(typed) : undefined;
  return { scope: held?.scope ?? null, member: held?.member ?? null, request };
}

function nextTask(act: Awaited<ReturnType<typeof actsOn>>["acts"][number], send: Send, context: ActionContext, fields: readonly string[], label: string, association: string, room: Room, change: Awaited<ReturnType<typeof loadChange>>): HTMLElement {
  const form = taskForm(act, send, context, fields, label);
  if (!form.hasAttribute("data-act") || act.kind !== "review-verdict") return form;
  const manifest = context.defaults?.[act.kind]?.fields?.["manifest"];
  if (manifest === undefined) return form;
  const key = controlKey(association, `review:${manifest}`);
  const button = h("button", { type: "button", class: "primary", "data-task-act": act.kind, "data-focus-key": key }, "Review change");
  if (context.pending || context.uncertain) button.setAttribute("disabled", "");
  button.addEventListener("click", () => {
    let owned: WorkbenchDialog | null = null;
    const scopeOfReview = change.scope;
    const content = taskForm(act, (kind, on, typed, accepted) => send(kind, on, typed, () => { accepted?.(); if (workbenchDialog === owned) closeWorkbench(); }, async () => {
      if (!owned || workbenchDialog !== owned || context.current?.() === false) throw new Error("This review is no longer selected. Its draft is kept; nothing was signed.");
      const latest = await loadChange(room, scopeOfReview);
      if (workbenchDialog !== owned || context.current?.() === false) throw new Error("This review is no longer selected. Its draft is kept; nothing was signed.");
      const problem = !owned.review?.requestOffered ? "The native review request field is unavailable. This draft is kept." : reviewSelectionProblem(room, latest, Number(manifest), typed["extent"] ?? "", selectedReviewRequest(owned, typed["request"]));
      if (problem) { owned.message.textContent = problem; owned.message.removeAttribute("hidden"); throw new Error(problem); }
    }), context, fields, label);
    openWorkbench(`Review version ${manifest}`, content, association, key, "review", { manifest: Number(manifest), action: act.kind });
    owned = workbenchDialog;
    if (owned) {
      owned.reviewBinding = { scope: change.ref ? structuredClone(change.ref) : null, member: room.me?.ref ? structuredClone(room.me.ref) : null, fixed: context.defaults?.[act.kind]?.fields?.["request"], choices: (context.choices?.[act.kind]?.["request"] ?? []).map(choice => choice.value) };
      owned.review = { room, change, blocked: !!context.pending || !!context.uncertain, offered: true, requestOffered: act.fields.some(field => field.name === "request" && field.type === "item") };
      owned.reviewDisabled = new Set(content.querySelectorAll<HTMLElement>("[disabled]"));
    }
    content.addEventListener("input", () => { if (workbenchDialog === owned && owned?.review) reconcileReview(association, owned.review.room, owned.review.change, owned.review.blocked, owned.review.offered, owned.review.requestOffered); });
  });
  return button;
}

function reconcileReview(context: string, room: Room, change: Awaited<ReturnType<typeof loadChange>>, blocked: boolean, offered = true, requestOffered = true): void {
  const selected = workbenchDialog;
  if (selected?.kind !== "review" || selected.context !== context || selected.route !== location.hash) return;
  selected.review = { room, change, blocked, offered, requestOffered };
  const last = lastActs.get(context);
  const requestBlocked = blocked || !!sending.get(context) || !!last && (last.answer.answer === "unavailable" || last.answer.answer === "mismatch" || last.observation !== null);
  const extent = selected.body.querySelector<HTMLInputElement | HTMLSelectElement>('[name="field:extent"]')?.value ?? "";
  const request = selected.body.querySelector<HTMLInputElement | HTMLSelectElement>('[name="field:request"]')?.value;
  const problem = !requestOffered ? "The native review request field is unavailable. This draft is kept." : reviewSelectionProblem(room, change, selected.manifest!, extent, selectedReviewRequest(selected, request));
  // A failed preparation has no submitted original to fence. Keep the exact
  // draft editable for deliberate correction; initially unavailable controls stay unavailable.
  if (!requestBlocked) for (const control of selected.body.querySelectorAll<HTMLElement>("input, textarea, select")) {
    if (!selected.reviewDisabled?.has(control)) control.removeAttribute("disabled");
  }
  if (requestBlocked || !offered || problem) {
    selected.message.textContent = requestBlocked ? "Check the original request before another action. This review still names its original version." : !offered ? "Review is no longer available to this member. This draft still names its original version." : problem!;
    selected.message.removeAttribute("hidden");
    for (const button of selected.body.querySelectorAll("button[type=submit]")) button.setAttribute("disabled", "");
  } else {
    if (last && last.kind === selected.action && last.answer.answer === "refused") {
      selected.message.textContent = nonacceptedAnswerText(last.answer);
      selected.message.removeAttribute("hidden");
      for (const control of selected.body.querySelectorAll<HTMLElement>("input, textarea, select, button[type=submit]")) if (!selected.reviewDisabled?.has(control)) control.removeAttribute("disabled");
    } else if (!sending.get(context)) {
      selected.message.setAttribute("hidden", "");
      for (const button of selected.body.querySelectorAll("button[type=submit]")) button.removeAttribute("disabled");
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

/** Actual membership standing and the current key establish room context. */
function verifiedRoom(room: Room | null): room is Room & { me: NonNullable<Room["me"]> } {
  return !!room?.me?.handle && room.key === keyIdOfSecret(room.session.secret);
}
const wordmark = () => h("div", { class: "wordmark" }, h("img", { class: "wordmark-light", src: "/brand/dap-wordmark.svg", alt: "dap", width: "72", height: "42" }), h("img", { class: "wordmark-dark", src: "/brand/dap-wordmark-white.svg", alt: "dap", width: "72", height: "42" }));
function entryShell(...content: HTMLElement[]): HTMLElement[] {
  return [h("header", { class: "entry-header" }, wordmark()), h("div", { class: "content entry-content", id: "page-main", tabindex: "-1" }, ...content)];
}
/** Room and account labels come from the recorded read, never prototype fixtures. */
function shell(destination: Destination, room: Room | null, ...content: HTMLElement[]): HTMLElement[] {
  if (!verifiedRoom(room)) return entryShell(...content);
  const offer = claimOffer;
  const kept = settings();
  const directory = room.directory;
  const local = kept ? labelFor(kept.label, { directory, membership: room.membership }, kept.register)?.text : undefined;
  const name = room.name;
  const account = room.me.handle;
  const shellContext = JSON.stringify([location.origin, directory, room.membership, room.key]);
  const roomSwitch = () => name ? h("a", { class: "room-switch", href: "#/join", title: directory, "aria-label": `Change room: ${name}`, "data-focus-key": controlKey(shellContext, "room-connection") }, h("span", { class: "room-name" }, h("span", {}, name), local ? h("span", { class: "room-recorded-name", title: "Personal label in this browser" }, `Personal label: ${local}`) : null), h("span", { "aria-hidden": "true" }, "⌄")) : null;
  const accountControl = () => h("a", { class: "account", href: "#/join", "aria-label": `Change connection for ${account}`, "data-focus-key": controlKey(shellContext, "account-connection") }, h("span", { class: "avatar", "aria-hidden": "true" }, account.slice(0, 1).toUpperCase()), h("span", { class: "account-label" }, account));
  const navigation = (mobile = false) => h("nav", { class: mobile ? "navigation mobile-nav" : "navigation", "aria-label": "Room" },
    ([ ["issues", "Issues", "#/"], ["changes", "Changes", "#/?kind=change"], ["rules", "Rules", "#/rules"] ] as const).map(([kind, label, href]) => h("a", { class: "nav-item", href, "data-focus-key": controlKey(shellContext, `nav:${kind}`), ...(destination === kind ? { "aria-current": "page" } : {}) }, label)), h("a", { class: "nav-item", href: siteAddress(room, ""), title: "Latest published pages" }, "Pages"));
  const skip = h("a", { class: "skip", href: "#page-main" }, "Skip to content");
  skip.addEventListener("click", event => { event.preventDefault(); document.getElementById("page-main")?.focus(); });
  const create = () => { const button = h("button", { class: "nav-item", type: "button", "data-focus-key": controlKey(shellContext, "create-room") }, "Create room"); button.addEventListener("click", () => { if (offer) claimDialog(room, offer.kept, offer.configured, button); }); return button; };
  return [skip,
    h("aside", { class: "rail" }, wordmark(), roomSwitch(), navigation(), offer ? create() : null, h("div", { class: "rail-bottom" }, accountControl())),
    h("header", { class: "mobile-header" }, h("div", { class: "mobile-context" }, wordmark(), roomSwitch(), accountControl()), navigation(true), offer ? create() : null),
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
  const form = h("form", {}, h("h1", { id: "create-room-title" }, "Create room"), h("label", {}, "Personal label", name), message, h("div", { class: "form-footer" }, cancel, submit));
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
  const activeView = () => location.hash === capturedRoute && currentContext();
  const showLocally = (message: HTMLElement, blocked = true, notice = "") => {
    if (!activeView()) return;
    for (const host of currentScopeHosts(association)) {
      const answerHost = [...host.querySelectorAll<HTMLElement>("[data-request-context]")].find(node => node.getAttribute("data-request-context") === association);
      answerHost?.replaceChildren(message);
      const noticeHost = [...host.querySelectorAll<HTMLElement>("[data-task-context]")].find(node => node.getAttribute("data-task-context") === association);
      if (noticeHost && notice) { noticeHost.textContent = notice; noticeHost.removeAttribute("hidden"); }
    }
    if (blocked) fenceCurrentScope(association);
  };
  const currentContext = () => {
    const current = settings();
    if (!current?.place) return false;
    return roomContext(location.origin, current.place, current.secret) === roomContext(room.session.service, { directory: room.directory, membership: room.membership }, b64url(room.session.secret));
  };
  const send: Send = (kind, on, typed, accepted, beforeSign) => {
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
        await beforeSign?.();
        if (!currentContext()) throw new Error("The room or key changed before signing. Nothing was sent.");
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
        if (result.answer.answer === "refused" && result.observation === null) issueDialogOutcome(association, "editable", nonacceptedAnswerText(result.answer));
        else if (result.answer.answer !== "accepted" || result.observation !== null) issueDialogOutcome(association, "unknown", "The original request remains unresolved. Check status without sending a replacement.");
      } catch (error) {
        sending.failed(association);
        issueDialogOutcome(association, sending.get(association)?.state === "unknown" ? "unknown" : "editable", sending.get(association)?.state === "unknown" ? "Request outcome unknown. Check status without sending a replacement." : error instanceof Error ? error.message : "The request could not be prepared.");
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
  const taskContext = { ...context, pending, uncertain, draftKey: association, refresh: () => { void draw(); }, current: () => location.hash === capturedRoute && currentContext() };
  const represented = options.tasks?.(offered, send, taskContext) ?? [];
  const remaining = { ...offered, acts: offered.acts.filter((act) => !options.represented?.includes(act.kind) && !represented.includes(act.kind)) };
  const advancedContext = { ...taskContext };
  delete advancedContext.choices;
  const panel = actsPanel(remaining, send, last ? answerLine(last) : null, { ...advancedContext, primary: [] });
  const answerHost = h("div", { class: "request-answer", "aria-live": "polite", "data-request-context": association });
  panel.prepend(answerHost);
  const noticeHost = h("p", { "data-task-status": "", "data-task-context": association, role: "status", "aria-live": "polite", hidden: "" });
  if (pending || uncertain) { noticeHost.textContent = pending ? "Sending request" : "Request outcome unknown"; noticeHost.removeAttribute("hidden"); }
  panel.append(noticeHost);
  if (options.customForm) panel.append(options.customForm(send, pending || !!uncertain, association));
  if (fence?.state === "unknown") panel.append(unknownRequest(fence.kind));
  return panel;
}

function connectionScreen(path: "join" | "invitation" | "config"): HTMLElement {
  const capturedDraw = drawing, capturedRoute = location.hash, capturedContext = settingsContext(settings() ?? { place: null, secret: "" });
  const current = () => drawing === capturedDraw && location.hash === capturedRoute && settingsContext(settings() ?? { place: null, secret: "" }) === capturedContext;
  const back = () => h("a", { class: "entry-back", href: "#/join" }, h("span", { "aria-hidden": "true" }, "‹"), "Back");
  if (path === "join") return h("main", { class: "screen entry-screen" }, h("h1", {}, "Join a room"), h("p", { class: "entry-intro" }, "How would you like to join?"),
    ignoredSavedAddress ? h("p", { class: "entry-answer" }, "The saved connection address is ignored. Your room and key are kept. Use a connection below; this page reads only its own service.") : null,
    h("div", { class: "entry-choices" },
      h("a", { class: "entry-choice", href: "#/invitation" }, h("div", {}, h("h2", {}, "Invitation link"), h("p", {}, "Paste a link. We create your key and join the room.")), h("span", { class: "entry-chevron", "aria-hidden": "true" }, "›")),
      h("a", { class: "entry-choice", href: "#/config" }, h("div", {}, h("h2", {}, "Config and key"), h("p", {}, "Use config.json and its matching device key.")), h("span", { class: "entry-chevron", "aria-hidden": "true" }, "›"))));
  const message = h("p", { class: "entry-answer", role: "status", "aria-live": "polite" });
  const tell = (text: string, bad = false) => { if (!current()) return; message.textContent = text; message.className = `entry-answer${bad ? " bad" : ""}`; };
  const selectRoom = async (next: Settings, expectedHandle?: string): Promise<boolean> => {
    const room = await openRoom(sessionOf(next), next.place!);
    if (!current()) return false;
    if (!verifiedRoom(room) || expectedHandle !== undefined && room.me.handle !== expectedHandle) { tell("Refused because this key has no matching verified membership in this room.", true); return false; }
    if (!keep(next)) {
      // A failed readback can follow a successful write. Only this still-open
      // screen may report it, and it promises no previous selection survived.
      const selectedContext = settingsContext(settings() ?? { place: null, secret: "" });
      if (drawing === capturedDraw && location.hash === capturedRoute && (selectedContext === capturedContext || selectedContext === settingsContext(next))) {
        message.textContent = "The connection was verified, but its storage could not be read back. Check the original saved connection before another request.";
        message.className = "entry-answer bad";
      }
      return false;
    }
    opened.clear(); invitationDraft = ""; configDraft = "";
    location.hash = "#/"; void draw(true); return true;
  };
  if (path === "config") {
    const config = h("textarea", { name: "config", required: "", spellcheck: "false", placeholder: "Paste the contents of config.json" }, configDraft) as HTMLTextAreaElement;
    const key = h("input", { name: "key", type: "password", required: "", autocomplete: "off", placeholder: "Paste the matching device.key" }) as HTMLInputElement;
    const submit = h("button", { type: "submit", class: "primary" }, "Join room");
    const form = h("form", { class: "entry-form" }, h("label", {}, "config.json", config), h("label", {}, "Device key", key), submit);
    config.addEventListener("input", () => { configDraft = config.value; });
    form.addEventListener("submit", event => { event.preventDefault(); if (!current() || connectionBusy) return; void (async () => {
      connectionBusy = true; submit.setAttribute("disabled", ""); tell("Working on joining the room");
      let decodedSecret: Uint8Array | null = null;
      try {
        const typed = config.value.trim(), raw = key.value.trim(), place = placeOf(typed);
        decodedSecret = unb64url(raw);
        const secret = decodedSecret;
        if (!typed || typed.startsWith("artroom-invite:") || !place || !secret || secret.length !== 32) { tell("Refused because config.json and its matching 32-byte device key are both required. Use the invitation path for an invitation link.", true); return; }
        const parsed = JSON.parse(typed) as { register?: unknown };
        if (parsed.register !== undefined && (!isScopeRef(parsed.register) || parsed.register.kind !== "register")) { tell("Refused because the config register reference is invalid.", true); return; }
        if (await selectRoom({ place, secret: b64url(secret), ...(parsed.register ? { register: parsed.register as ScopeRef } : {}) })) key.value = "";
      } catch (error) { tell(error instanceof Error ? error.message : "The room could not verify this config and key.", true); }
      finally { decodedSecret?.fill(0); connectionBusy = false; if (current()) submit.removeAttribute("disabled"); }
    })(); });
    return h("main", { class: "screen entry-screen" }, back(), h("h1", {}, "Join with config and key"), h("p", { class: "entry-intro" }, "Both files are required."), form, message);
  }
  const invitation = h("textarea", { name: "invitation", spellcheck: "false", autocomplete: "off", placeholder: "artroom-invite:…" }, invitationDraft) as HTMLTextAreaElement;
  const check = h("button", { type: "button", class: "link-button", hidden: "" }, "Check status");
  const form = h("form", { class: "entry-form" }, h("label", {}, "Invitation link", invitation));
  form.addEventListener("submit", event => event.preventDefault());
  const resultOf = async (result: JoinResult | null) => {
    if (!current()) { if (result?.status === "verified") result.secret.fill(0); return; }
    if (!result) { tell("No original enrollment is retained. Paste an invitation to join."); return; }
    if (result.status === "verified") { try { await selectRoom({ place: result.place, secret: b64url(result.secret) }, result.handle); } finally { result.secret.fill(0); } return; }
    const unknown = result.status === "unknown" || result.status === "blocked";
    tell(result.status === "refused" ? `${result.reason} That invitation remains refused. Paste a different invitation to join with the retained key; Check status only reads the original result.` : result.reason ?? "The original join is unresolved. Check status without sending a replacement.", true);
    if (unknown) {
      try { const original = originalJoin(location.origin, localStorage); if (original) { if (original.status === "unknown") invitation.setAttribute("disabled", ""); else invitation.removeAttribute("disabled"); check.removeAttribute("hidden"); } else { invitation.removeAttribute("disabled"); check.setAttribute("hidden", ""); } }
      catch { invitation.setAttribute("disabled", ""); check.setAttribute("hidden", ""); }
    } else invitation.removeAttribute("disabled");
  };
  let held: ReturnType<typeof originalJoin> | undefined;
  try { held = originalJoin(location.origin, localStorage); }
  catch { tell("Original enrollment custody is unavailable. Nothing will be replaced.", true); invitation.setAttribute("disabled", ""); }
  if (held) {
    if (held.status === "unknown") invitation.setAttribute("disabled", "");
    check.removeAttribute("hidden");
    tell(held.status === "verified" ? "The original join is verified. Check status to open its saved room, or paste another invitation." : held.status === "prepared" ? "The original join was prepared. Paste the same invitation to continue with that exact request." : held.status === "refused" ? "That invitation remains refused. Paste a different invitation to join with the retained key; Check status only reads the original result." : "An original join is retained. Check status without sending a replacement.", held.status === "unknown" || held.status === "refused");
  }
  invitation.addEventListener("input", () => {
    invitationDraft = invitation.value;
    const typed = invitation.value.trim();
    if (!current() || connectionBusy || !typed) return;
    if (!typed.startsWith("artroom-invite:")) { tell("Paste the complete invitation link.", true); return; }
    connectionBusy = true; invitation.setAttribute("disabled", ""); tell("Working on joining the room");
    void joinInvitation(location.origin, typed, localStorage, { current }).then(resultOf).catch(error => tell(error instanceof Error ? error.message : "The original join could not be confirmed. Check status before another request.", true)).finally(() => { connectionBusy = false; if (current()) { try { if (originalJoin(location.origin, localStorage)) check.removeAttribute("hidden"); else invitation.removeAttribute("disabled"); } catch { /* Corrupt custody stays fenced. */ } } });
  });
  check.addEventListener("click", () => { if (!current() || connectionBusy) return; connectionBusy = true; check.setAttribute("disabled", ""); tell("Reading the original join status"); void checkOriginal(location.origin, localStorage, { current }).then(resultOf).catch(error => tell(error instanceof Error ? error.message : "The original join remains unresolved.", true)).finally(() => { connectionBusy = false; if (current()) check.removeAttribute("disabled"); }); });
  return h("main", { class: "screen entry-screen" }, back(), h("h1", {}, "Join with an invitation"), h("p", { class: "entry-intro" }, "Paste your invitation link to join automatically."), form, message, check);
}

async function draw(focus = false): Promise<void> {
  const currentDraw = ++drawing;
  claimOffer = undefined;
  reconcileIssueDialogs();
  if (roomDialog && (roomDialogBinding?.settings !== settingsContext(settings() ?? { place: null, secret: "" }) || roomDialogBinding?.route !== location.hash)) {
    roomDialog.close(); roomDialog.remove(); roomDialog = null; roomDialogBinding = null;
  }
  if (workbenchDialog && (workbenchDialog.route !== location.hash || workbenchDialog.binding !== settingsContext(settings() ?? { place: null, secret: "" }))) closeWorkbench(false);
  const route = routeOf(location.hash);
  const kept = settings();
  const publish = showFor(currentDraw, focus);
  let selectedRoom: Room | null = null;
  const originalContext = kept ? settingsContext(kept) : null;
  const show = (...children: HTMLElement[]) => {
    const current = settings();
    if (currentDraw !== drawing) return;
    if ((current ? settingsContext(current) : null) !== originalContext) { void draw(focus); return; }
    lastVerifiedContext = verifiedRoom(selectedRoom) ? originalContext : null;
    document.title = verifiedRoom(selectedRoom) && selectedRoom.name ? `dap - workroom ${selectedRoom.name}` : "dap - workroom";
    publish(...children);
  };
  if (["join", "invitation", "config"].includes(route.destination) || !kept || !kept.place || ignoredSavedAddress) {
    const path = route.destination === "invitation" || route.destination === "config" ? route.destination : "join";
    return show(...entryShell(connectionScreen(path)));
  }
  if (originalContext !== lastVerifiedContext) show(...entryShell(h("main", { class: "screen entry-screen" }, h("h1", {}, "Opening your room"), h("p", { class: "entry-answer", role: "status" }, "Working on reading the room"))));
  let room: Room | null = null;
  try {
    room = await roomOf(kept, kept.place);
    if (!verifiedRoom(room)) throw new Error("Refused because this key has no verified membership in this room.");
    selectedRoom = room;
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
      const taskContext = changeTaskContext(change, loaded);
      const applicable = taskReviewExtents(change);
      if (change.reviewMembersByExtent !== undefined && taskContext.choices["review-verdict"]) {
        if (applicable === null) delete taskContext.choices["review-verdict"];
        else taskContext.choices["review-verdict"] = { ...taskContext.choices["review-verdict"], extent: (change.reviewExtents ?? []).filter(extent => applicable.some(row => row.name === extent.value) && change.reviewMembersByExtent?.[extent.value]?.some(member => member.value === loaded.me?.handle)) };
      }
      const recipients = requestedReviewCandidates(change);
      for (const kind of ["request-review-own", "request-review-any"]) {
        if (recipients === null) delete taskContext.choices[kind];
        else taskContext.choices[kind] = { requested: recipients };
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
        if (!next && change.state === "open" && applicable === null) screen.querySelector('[data-action-slot="next"]')?.append(h("p", { class: "muted", role: "status" }, "The rules policy for this recorded version could not be verified. Native actions remain in Advanced."));
        reconcileReview(association, loaded, change, !!context.pending || !!context.uncertain, acts.acts.some(act => act.kind === "review-verdict"), acts.acts.some(act => act.kind === "review-verdict" && act.fields.some(field => field.name === "request" && field.type === "item")));
        if (next && !context.pending && !context.uncertain) {
          const label = next.kind === "merge" ? "Merge change" : next.kind.startsWith("request-review") ? "Request review" : "Review change";
          const control = nextTask(next, send, context, ["verdict", "body", "extent", "request", ...(change.reviewMembers ? ["requested"] : [])], label, association, loaded, change);
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
    selectedRoom = null;
    show(...entryShell(failureScreen(error, known), ...(fence?.state === "unknown" ? [unknownRequest(fence.kind)] : [])));
  }
}

window.addEventListener("hashchange", () => { void draw(true); });
void draw();
