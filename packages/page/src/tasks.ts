/** Task controls use actual offered declarations; the shell owns signing and custody. */
import type { ChangeView, Offered, Room } from "./data.ts";
import { actionForm, type ActionContext, type Send } from "./actions.ts";
import { h } from "./view.ts";
import { issueTaskValues } from "./task-values.ts";

function missingFields(act: Offered, context: ActionContext, fields: readonly string[]): string[] {
  const fixed = context.defaults?.[act.kind];
  const missing = act.fields.filter((field) => field.required && !fields.includes(field.name) && fixed?.fields?.[field.name] === undefined && field.choices?.length !== 1).map((field) => field.name);
  if (act.step === "transition" && fixed?.on === undefined) missing.unshift("exact subject");
  return missing;
}
const missingCondition = (field: string): string => ({ definition: "the active issue definition", conditions: "the issue conditions", reports: "the selected issue-report evidence", manifest: "the selected version", requested: "an eligible reviewer", "exact subject": "the exact subject" })[field] ?? "a required recorded value";

/** A single prominent task; native declarations remain the final authority. */
export function nextChangeAction(room: Room, change: ChangeView, offered: readonly Offered[], allowed: readonly string[]): Offered | null {
  const current = change.manifests.find((manifest) => manifest.state === "current");
  const author = !!room.me && (current?.authors.includes(room.me.handle) || change.author === room.me.handle);
  const order = change.state === "draft" ? ["ready-own", "ready-any"] : author ? ["merge", "request-review-own", "request-review-any"] : ["review-verdict", "merge"];
  return order.map((kind) => offered.find((act) => act.kind === kind && allowed.includes(kind))).find((act) => act !== undefined) ?? null;
}

/** Technical requirements must be fixed from authenticated facts, never typed by the person. */
export function taskForm(act: Offered, send: Send, context: ActionContext, fields: readonly string[], label: string): HTMLElement {
  const fixed = context.defaults?.[act.kind];
  const missing = missingFields(act, context, fields);
  if (missing.length) return h("p", { class: "muted", role: "status" }, `${label} is unavailable: ${missing.map(missingCondition).join(" and ")} could not be read from this version's recorded facts.`);
  const shown: Offered = { ...act, fields: act.fields.filter((field) => fields.includes(field.name) || fixed?.fields?.[field.name] !== undefined || field.choices?.length === 1) };
  return actionForm(shown, send, context, true);
}

/** A native dialog wraps the supported task form; no generic protocol fields appear. */
export function createIssue(act: Offered, send: Send, context: ActionContext): HTMLElement {
  // The existing CLI intentionally uses the entered title as the issue's
  // condition. The form does the same, without claiming a native default.
  const taskAct = { ...act, fields: act.fields.filter((field) => field.name !== "conditions") };
  const missing = missingFields(taskAct, context, ["title", "body"]);
  if (missing.length) return h("p", { class: "muted", role: "status" }, `Create issue is unavailable: ${missing.map(missingCondition).join(" and ")} could not be read from the room's active issue definition.`);
  const button = h("button", { type: "button", class: "primary" }, "Create issue");
  if (context.uncertain || context.pending) button.setAttribute("disabled", "");
  button.addEventListener("click", () => {
    let dialog!: HTMLDialogElement;
    const submit: Send = (kind, on, typed, accepted) => {
      send(kind, on, issueTaskValues(typed), () => { accepted?.(); dialog.close(); dialog.remove(); button.focus(); });
    };
    const form = taskForm(taskAct, submit, context, ["title", "body"], "Create issue");
    const close = h("button", { type: "button" }, "Cancel");
    dialog = h("dialog", { class: "room-dialog", "aria-labelledby": "create-issue-title" }, h("h1", { id: "create-issue-title" }, "Create issue"), form, close) as HTMLDialogElement;
    close.addEventListener("click", () => { dialog.close(); dialog.remove(); button.focus(); });
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); dialog.close(); dialog.remove(); button.focus(); });
    document.body.append(dialog); dialog.showModal(); dialog.querySelector<HTMLElement>("input, textarea, button")?.focus();
  });
  return button;
}
