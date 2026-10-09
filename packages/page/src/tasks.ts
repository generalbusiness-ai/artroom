/** Task controls use actual offered declarations; the shell owns signing and custody. */
import type { ChangeView, Offered, Room } from "./data.ts";
import { actionForm, type ActionContext, type Send } from "./actions.ts";
import { h, icon } from "./view.ts";
import { issueTaskValues } from "./task-values.ts";
import { editPath, matches } from "@generalbusiness/artroom-platform";
import { controlKey } from "./focus.ts";
export { changeTaskContext } from "./task-values.ts";

interface IssueDialog { dialog: HTMLDialogElement; form: HTMLElement; message: HTMLElement; context: ActionContext; close(restore?: boolean): void; initialDisabled: Set<HTMLElement> }
const issueDialogs = new Map<string, IssueDialog>();

/** UI lifetime only. Drafts and the shell's original submission fence stay owned there. */
export function reconcileIssueDialogs(): void {
  for (const [key, shown] of issueDialogs) if (shown.context.current?.() === false) { shown.close(false); issueDialogs.delete(key); }
}

export function issueDialogOutcome(key: string, state: "editable" | "unknown", message: string): void {
  const shown = issueDialogs.get(key);
  if (!shown || shown.context.current?.() === false) return;
  shown.message.textContent = message; shown.message.removeAttribute("hidden");
  for (const control of shown.form.querySelectorAll<HTMLElement>("input, textarea, select, button[type=submit]")) {
    if (state === "unknown") control.setAttribute("disabled", "");
    else if (!shown.initialDisabled.has(control)) control.removeAttribute("disabled");
  }
  if (state === "unknown" && !shown.dialog.querySelector("[data-check-original]")) {
    const check = h("button", { type: "button", "data-check-original": "" }, "Check status");
    check.addEventListener("click", () => { if (shown.context.current?.() === false) return; shown.close(); shown.context.refresh?.(); });
    shown.dialog.append(check);
  }
}

function missingFields(act: Offered, context: ActionContext, fields: readonly string[]): string[] {
  const fixed = context.defaults?.[act.kind];
  const missing = act.fields.filter((field) => field.required && !fields.includes(field.name) && fixed?.fields?.[field.name] === undefined && (context.choices?.[act.kind]?.[field.name] ?? field.choices)?.length !== 1).map((field) => field.name);
  if (act.step === "transition" && fixed?.on === undefined) missing.unshift("exact subject");
  return missing;
}
const missingCondition = (field: string): string => ({ definition: "the active issue definition", conditions: "the issue conditions", reports: "the selected issue-report evidence", manifest: "the selected version", requested: "an eligible reviewer", extent: "the review requirements", "exact subject": "the exact subject" })[field] ?? "a required recorded value";

/** Only a known one-file path can narrow held requirements; a tree remains advisory. */
export function taskReviewExtents(change: ChangeView): NonNullable<ChangeView["rules"]>["extents"] {
  const current = change.manifests.find(manifest => manifest.id === change.currentManifest);
  const extents = change.rules?.extents ?? [];
  const path = current?.file?.path;
  if (!path || editPath(path) === null || extents.some(extent => extent.patterns === undefined)) return extents;
  const matching = extents.filter(extent => extent.patterns!.some(pattern => matches(pattern, path)));
  return matching.length ? matching : extents.filter(extent => extent.patterns!.length === 0);
}

/** A single prominent task; native declarations remain the final authority. */
export function nextChangeAction(room: Room, change: ChangeView, offered: readonly Offered[], allowed: readonly string[]): Offered | null {
  const current = change.currentManifest === undefined ? change.manifests.find((manifest) => manifest.state === "current") : change.manifests.find((manifest) => manifest.id === change.currentManifest);
  if (["merged", "closed", "cancelled"].includes(change.state)) return null;
  if (change.state === "draft") return ["ready-own", "ready-any"].map(kind => offered.find(act => act.kind === kind && allowed.includes(kind))).find(act => act !== undefined) ?? null;
  if (!current || current.file && editPath(current.file.path) === null) return null;
  const author = !!room.me && (current?.authors.includes(room.me.handle) || change.author === room.me.handle);
  const applicable = taskReviewExtents({ ...change, currentManifest: current.id });
  const approving = change.reviews.filter(review => review.manifest === current.id && review.state === "submitted" && review.verdict === "approve");
  // This selects a useful task from held records; the destination still judges fresh rules and evidence.
  const needsReview = (change.rules?.approvals ?? 0) > approving.length || applicable.some(extent => approving.filter(review => review.extent === extent.name).length < extent.approvals)
    || change.reviews.some(review => review.manifest === current.id && review.state === "submitted" && review.verdict === "request-changes");
  const canReview = change.reviewMembersByExtent === undefined || !!room.me && applicable.some(extent => change.reviewMembersByExtent?.[extent.name]?.some(member => member.value === room.me!.handle));
  const requests = ["request-review-own", "request-review-any"];
  const order = author ? needsReview ? [...requests, "merge"] : ["merge", ...requests] : canReview ? ["review-verdict", "merge"] : ["merge"];
  return order.map((kind) => offered.find((act) => act.kind === kind && allowed.includes(kind))).find((act) => act !== undefined) ?? null;
}

/** Technical requirements must be fixed from authenticated facts, never typed by the person. */
export function taskForm(act: Offered, send: Send, context: ActionContext, fields: readonly string[], label: string): HTMLElement {
  if (act.kind.startsWith("request-review") && context.choices?.[act.kind]?.["requested"]?.length === 0) return h("p", { class: "muted", role: "status" }, "No eligible reviewer is available for this version.");
  const fixed = context.defaults?.[act.kind];
  const unsupportedChoice = fields.filter((field) => act.fields.some((value) => value.name === field) && ["extent", "requested"].includes(field) && context.choices?.[act.kind]?.[field] === undefined);
  const missing = [...missingFields(act, context, fields), ...unsupportedChoice];
  if (missing.length) return h("p", { class: "muted", role: "status" }, `${label} is unavailable: ${missing.map(missingCondition).join(" and ")} could not be read from this version's recorded facts.`);
  const shown: Offered = { ...act, fields: act.fields.filter((field) => fields.includes(field.name) || fixed?.fields?.[field.name] !== undefined || (context.choices?.[act.kind]?.[field.name] ?? field.choices)?.length === 1) };
  const recipients = context.choices?.[act.kind]?.["requested"];
  const namedReview = act.kind.startsWith("request-review") && recipients?.length === 1 ? `Request review from ${recipients[0]!.label}` : undefined;
  const submitLabel = namedReview ?? (label === "Issue action" ? act.kind.startsWith("reopen") ? "Reopen issue" : act.kind.startsWith("close") ? "Close issue" : undefined : undefined);
  const form = actionForm(shown, send, { ...context, ...(submitLabel ? { submitLabel } : {}) }, true);
  if (act.kind === "comment") form.setAttribute("class", "composer");
  return form;
}

/** A native dialog wraps the supported task form; no generic protocol fields appear. */
export function createIssue(act: Offered, send: Send, context: ActionContext): HTMLElement {
  // The existing CLI intentionally uses the entered title as the issue's
  // condition. The form does the same, without claiming a native default.
  const taskAct = { ...act, fields: act.fields.filter((field) => field.name !== "conditions") };
  const definitionChoices = context.choices?.[act.kind]?.["definition"] ?? act.fields.find(field => field.name === "definition")?.choices;
  const fields = ["title", "body", ...(definitionChoices && definitionChoices.length > 1 ? ["definition"] : [])];
  const missing = missingFields(taskAct, context, fields);
  if (missing.length) return h("p", { class: "muted", role: "status" }, `Create issue is unavailable: ${missing.map(missingCondition).join(" and ")} could not be read from the room's active issue definition.`);
  const openerKey = context.draftKey ? controlKey(context.draftKey, "create-issue") : "create-issue";
  const button = h("button", { type: "button", class: "button primary", "data-task-act": act.kind, "data-focus-key": openerKey, "aria-label": "Create issue" }, h("span", { class: "full-label" }, "Create issue"), h("span", { class: "short-label" }, icon("plus"), "Create"));
  if (context.uncertain || context.pending) button.setAttribute("disabled", "");
  button.addEventListener("click", () => {
    if (button.hasAttribute("disabled") || context.current?.() === false) return;
    let dialog!: HTMLDialogElement;
    const capturedDefinitions = definitionChoices?.map(choice => ({ ...choice }));
    const submit: Send = (kind, on, typed, accepted) => {
      if (capturedDefinitions && !capturedDefinitions.some(choice => choice.value === typed["definition"])) return;
      send(kind, on, issueTaskValues(typed), () => { accepted?.(); closeDialog(); });
    };
    const form = taskForm(taskAct, submit, context, fields, "Create issue");
    const close = h("button", { type: "button" }, "Cancel");
    const message = h("p", { role: "status", "aria-live": "polite", hidden: "" });
    dialog = h("dialog", { class: "room-dialog", "aria-labelledby": "create-issue-title" }, h("h1", { id: "create-issue-title" }, "Create issue"), form, message, close) as HTMLDialogElement;
    const returnFocus = () => { [...document.querySelectorAll<HTMLElement>("[data-focus-key]")].find(node => node.getAttribute("data-focus-key") === openerKey)?.focus(); };
    const closeDialog = (restore = true) => { dialog.close(); dialog.remove(); if (context.draftKey && issueDialogs.get(context.draftKey)?.dialog === dialog) issueDialogs.delete(context.draftKey); if (restore && context.current?.() !== false) returnFocus(); };
    close.addEventListener("click", () => closeDialog());
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(); });
    if (context.draftKey) issueDialogs.set(context.draftKey, { dialog, form, message, context, close: closeDialog, initialDisabled: new Set([...form.querySelectorAll<HTMLElement>("[disabled]")]) });
    document.body.append(dialog); dialog.showModal(); dialog.querySelector<HTMLElement>("input, textarea, button")?.focus();
  });
  return button;
}
