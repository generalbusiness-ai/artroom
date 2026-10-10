/** Forms present the scope's offered acts; authority and typing stay in data.ts. */
import type { Offered } from "./data.ts";
import { controlKey } from "./focus.ts";

export interface ActionContext {
  /** Task copy derived from the actual subject/choice, never an extra act. */
  submitLabel?: string;
  /** Same selected room/key/route; a dialog never follows a new context. */
  current?: () => boolean;
  /** Exact subjects read by the shell, never guessed from a display number. */
  defaults?: Record<string, { on?: number; fields?: Record<string, string> }>;
  primary?: readonly string[];
  choices?: Record<string, Record<string, readonly { label: string; value: string }[]>>;
  refresh?: () => void;
  /** A submit or its subsequent observation is unsettled. Refresh is read-only. */
  uncertain?: boolean;
  /** A submission is in flight; a fresh signed act must not replace it. */
  pending?: boolean;
  /** The current subject already shows its uncertainty in its status. */
  statusShown?: boolean;
  /** Actions whose observed subject is final or otherwise unavailable. */
  blockedKinds?: readonly string[];
  /** Association includes the service, room, member key and scope. Memory only. */
  draftKey?: string;
}

export type Send = (kind: string, on: string, typed: Record<string, string>, accepted?: () => void, beforeSign?: () => Promise<void>) => void;
type Child = HTMLElement | string | null;
const element = (tag: string, attrs: Record<string, string> = {}, ...children: (Child | Child[])[]): HTMLElement => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const child of children.flat()) if (child !== null) node.append(child);
  return node;
};

const labels: Record<string, string> = {
  "open-issue": "Create issue", "open-pr": "Propose change", "review-verdict": "Review change",
  merge: "Merge change", publish: "Save changes", comment: "Comment", "edit-own": "Save changes",
  "propose-file": "Propose change", "request-review-own": "Request review", "ready-own": "Ready for review",
  "close-own": "Close", "close-any": "Close", "reopen-own": "Reopen", "cancel-merge": "Cancel merge",
};
const fieldLabels: Record<string, string> = {
  body: "Description", title: "Title", path: "Path", content: "Content", requested: "Reviewer",
  verdict: "Decision", extent: "Review requirement", manifest: "Version", reason: "Reason", approvals: "Required approvals",
  ownerMayReview: "Allow author review", singleControllerException: "Single controller exception", checks: "Checks",
  labels: "Labels", extents: "Review requirements", conditions: "Conditions", definition: "Definition", draft: "Draft",
};
const drafts = new Map<string, Record<string, string>>();
const draftVersions = new Map<string, number>();
const renderedDrafts = new WeakMap<HTMLElement, () => void>();
const own = <T>(record: Record<string, T> | undefined, name: string): T | undefined => record && Object.hasOwn(record, name) ? record[name] : undefined;
const technical = new Set(["base", "digest", "size", "definition", "draft", "conditions", "reports", "manifest", "earlier", "request", "replyTo", "mentions", "thread", "number", "opener"]);
const labelOf = (name: string) => own(fieldLabels, name) ?? name.replace(/-/g, " ");

/** Reuse B8's draft state at publication, after any awaited reads or acceptance.
 * This is a render projection, not a second draft store or request journal. */
export function reconcileActionDrafts(container: HTMLElement): void {
  for (const form of container.querySelectorAll<HTMLElement>("form[data-act]")) renderedDrafts.get(form)?.();
}

/** Supported domain forms remain ordinary controls; other declarations stay in Inspect. */
export function actsPanel(offered: { acts: Offered[]; hidden: number }, send: Send, last: HTMLElement | null, context: ActionContext = {}): HTMLElement {
  const panel = element("section", { class: "actions", "aria-label": "Actions" });
  if (last) {
    const record = element("details", { class: "action-record" }, element("summary", {}, "Last request"), last);
    panel.append(record);
  }
  if (context.uncertain || context.pending) {
    const refresh = element("button", { type: "button", class: "primary", "data-status-recovery": "", ...(context.draftKey ? { "data-focus-key": controlKey(context.draftKey, "check-status") } : {}) }, "Check status");
    if (!context.refresh) refresh.setAttribute("disabled", "");
    refresh.addEventListener("click", () => context.refresh?.());
    if (!context.statusShown) panel.append(element("p", { role: "status" }, context.pending ? "Sending request" : "Request outcome unknown"));
    panel.append(refresh);
  }
  const ordinary: HTMLElement[] = [], advanced: HTMLElement[] = [];
  for (const act of offered.acts) {
    const primary = context.primary?.includes(act.kind) ?? false;
    const form = actionForm(act, send, context, primary);
    const details = element("details", { class: primary ? "action" : "advanced-action" }, element("summary", {}, own(labels, act.kind) ?? act.kind), form);
    (primary ? ordinary : advanced).push(details);
  }
  panel.append(...ordinary);
  if (advanced.length > 0 || offered.hidden > 0) {
    const inspect = element("details", { class: "inspect-actions" }, element("summary", {}, "Advanced"), ...advanced);
    if (offered.hidden > 0) inspect.append(element("p", { class: "muted" }, `${offered.hidden} actions require another role.`));
    panel.append(inspect);
  }
  return panel;
}

export function actionForm(act: Offered, send: Send, context: ActionContext, primary: boolean): HTMLElement {
  const defaults = own(context.defaults, act.kind);
  const choicesFor = own(context.choices, act.kind);
  const blocked = context.uncertain || context.pending || context.blockedKinds?.includes(act.kind);
  // Exact-version defaults are part of the key: a version change never reuses a stale review draft.
  const draftKey = context.draftKey ? JSON.stringify([context.draftKey, act.kind, defaults ?? null]) : null;
  const draft = draftKey ? drafts.get(draftKey) ?? {} : {};
  const controls: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] = [];
  const form = element("form", { "data-act": act.kind });
  const advanced: HTMLElement[] = [];
  if (act.step === "transition") {
    const fixed = defaults?.on;
    const input = element("input", { name: "on", type: fixed === undefined ? "number" : "hidden", min: "0", value: fixed === undefined ? (own(draft, "on") ?? "") : String(fixed), required: "", ...(draftKey ? { "data-focus-key": controlKey(draftKey, "target") } : {}) }) as HTMLInputElement;
    controls.push(input);
    form.append(fixed === undefined ? element("label", {}, "Item", input) : input);
  }
  for (const field of act.fields) {
    const fixed = own(defaults?.fields, field.name);
    const choices = own(choicesFor, field.name) ?? field.choices;
    const attrs: Record<string, string> = { name: `field:${field.name}`, "data-type": field.type };
    if (draftKey) attrs["data-focus-key"] = controlKey(draftKey, `field:${field.name}`);
    if (field.required) attrs["required"] = "";
    const value = fixed ?? own(draft, field.name) ?? "";
    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (fixed !== undefined || choices?.length === 1) {
      input = element("input", { ...attrs, type: "hidden", value: fixed ?? choices![0]!.value }) as HTMLInputElement;
      form.append(input);
      controls.push(input);
      continue;
    }
    if (choices) {
      input = element("select", attrs,
        element("option", { value: "" }, choices.length ? `Choose ${labelOf(field.name).toLowerCase()}` : "No eligible choice"),
        choices.map((choice) => element("option", { value: choice.value, ...(choice.value === value ? { selected: "" } : {}) }, choice.label))) as HTMLSelectElement;
      if (choices.length === 0) input.setAttribute("disabled", "");
    } else if (field.name === "body" || field.name === "content" || field.type === "list") {
      if (field.name === "body" && act.kind === "comment") attrs["placeholder"] = "Add a comment…";
      input = element("textarea", { ...attrs, rows: field.name === "content" ? "8" : "3" }, value) as HTMLTextAreaElement;
    } else {
      input = element("input", { ...attrs, type: "text", value }) as HTMLInputElement;
    }
    controls.push(input);
    const fieldLabel = field.name === "body" && act.kind === "comment" ? "Comment"
      : field.name === "body" && act.kind === "review-verdict" ? "Review comment" : labelOf(field.name);
    const label = element("label", {}, fieldLabel, input);
    if (primary && technical.has(field.name) && !field.required) advanced.push(label);
    else form.append(label);
  }
  if (advanced.length) form.append(element("details", {}, element("summary", {}, "More options"), advanced));
  const button = element("button", { type: "submit", class: primary ? "primary" : "", ...(draftKey ? { "data-focus-key": controlKey(draftKey, "submit") } : {}) }, context.submitLabel ?? own(labels, act.kind) ?? act.kind);
  if (blocked || act.fields.some((field) => field.required && (own(choicesFor, field.name) ?? field.choices)?.length === 0 && own(defaults?.fields, field.name) === undefined)) button.setAttribute("disabled", "");
  if (blocked) for (const control of controls) control.setAttribute("disabled", "");
  form.append(button);
  const read = (): { on: string; typed: Record<string, string> } => {
    let on = "";
    const typed: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const control of controls) {
      if (control.name === "on") on = control.value;
      else if (control.value !== "") typed[control.name.slice(6)] = control.value;
    }
    return { on, typed };
  };
  form.addEventListener("input", () => {
    if (draftKey) { const { on, typed } = read(); drafts.set(draftKey, { ...typed, on }); draftVersions.set(draftKey, (draftVersions.get(draftKey) ?? 0) + 1); }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (blocked || button.hasAttribute("disabled")) return;
    const { on, typed } = read();
    const submittedDraft = { ...typed, on };
    if (draftKey) drafts.set(draftKey, submittedDraft);
    const submittedVersion = draftKey ? draftVersions.get(draftKey) ?? 0 : null;
    // Block repeated clicks while the shell's signed operation is awaiting its answer.
    button.setAttribute("disabled", "");
    const accepted = act.kind === "comment" && draftKey ? () => {
      const current = drafts.get(draftKey);
      if (current && (draftVersions.get(draftKey) ?? 0) === submittedVersion && JSON.stringify(current) === JSON.stringify(submittedDraft)) drafts.delete(draftKey);
    } : undefined;
    if (accepted) send(act.kind, on, typed, accepted); else send(act.kind, on, typed);
  });
  if (draftKey) renderedDrafts.set(form, () => {
    const current = drafts.get(draftKey) ?? {};
    for (const control of controls) {
      if (control.name === "on") { if (defaults?.on === undefined) control.value = own(current, "on") ?? ""; continue; }
      const name = control.name.slice(6);
      const field = act.fields.find(field => field.name === name)!;
      const choices = own(choicesFor, name) ?? field.choices;
      if (own(defaults?.fields, name) !== undefined || choices?.length === 1) continue;
      const value = own(current, name) ?? "";
      control.value = choices && !choices.some(choice => choice.value === value) ? "" : value;
    }
  });
  return form;
}
