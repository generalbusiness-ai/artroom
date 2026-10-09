/** Forms present the scope's offered acts; authority and typing stay in data.ts. */
import type { Offered } from "./data.ts";

export interface ActionContext {
  /** Exact subjects read by the shell, never guessed from a display number. */
  defaults?: Record<string, { on?: number; fields?: Record<string, string> }>;
  primary?: readonly string[];
  choices?: Record<string, Record<string, readonly { label: string; value: string }[]>>;
  refresh?: () => void;
  /** A submit or its subsequent observation is unsettled. Refresh is read-only. */
  uncertain?: boolean;
  /** The current subject already shows its uncertainty in its status. */
  statusShown?: boolean;
  /** Association includes the service, room, member key and scope. Memory only. */
  draftKey?: string;
}

type Send = (kind: string, on: string, typed: Record<string, string>) => void;
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
const technical = new Set(["base", "digest", "size", "definition", "draft", "conditions", "reports", "manifest", "earlier", "request", "replyTo", "mentions", "thread", "number", "opener"]);
const labelOf = (name: string) => fieldLabels[name] ?? name.replace(/-/g, " ");

/** Supported domain forms remain ordinary controls; other declarations stay in Inspect. */
export function actsPanel(offered: { acts: Offered[]; hidden: number }, send: Send, last: HTMLElement | null, context: ActionContext = {}): HTMLElement {
  const panel = element("section", { class: "actions", "aria-label": "Actions" });
  if (last) {
    const record = element("details", { class: "action-record" }, element("summary", {}, "Last request"), last);
    panel.append(record);
  }
  if (context.uncertain) {
    const refresh = element("button", { type: "button", class: "primary" }, "Check status");
    if (!context.refresh) refresh.setAttribute("disabled", "");
    refresh.addEventListener("click", () => context.refresh?.());
    if (!context.statusShown) panel.append(element("p", { role: "status" }, "Request outcome unknown"));
    panel.append(refresh);
  }
  const ordinary: HTMLElement[] = [], advanced: HTMLElement[] = [];
  for (const act of offered.acts) {
    const primary = context.primary?.includes(act.kind) ?? false;
    const form = actionForm(act, send, context, primary);
    const details = element("details", { class: primary ? "action" : "advanced-action" }, element("summary", {}, labels[act.kind] ?? act.kind), form);
    (primary ? ordinary : advanced).push(details);
  }
  panel.append(...ordinary);
  if (advanced.length > 0 || offered.hidden > 0) {
    const inspect = element("details", { class: "inspect-actions" }, element("summary", {}, "Inspect"), ...advanced);
    if (offered.hidden > 0) inspect.append(element("p", { class: "muted" }, `${offered.hidden} actions require another role.`));
    panel.append(inspect);
  }
  return panel;
}

function actionForm(act: Offered, send: Send, context: ActionContext, primary: boolean): HTMLElement {
  const defaults = context.defaults?.[act.kind];
  // Exact-version defaults are part of the key: a version change never reuses a stale review draft.
  const draftKey = context.draftKey ? JSON.stringify([context.draftKey, act.kind, defaults ?? null]) : null;
  const draft = draftKey ? drafts.get(draftKey) ?? {} : {};
  const controls: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[] = [];
  const form = element("form", { "data-act": act.kind });
  const advanced: HTMLElement[] = [];
  if (act.step === "transition") {
    const fixed = defaults?.on;
    const input = element("input", { name: "on", type: fixed === undefined ? "number" : "hidden", min: "0", value: fixed === undefined ? (draft["on"] ?? "") : String(fixed), required: "" }) as HTMLInputElement;
    controls.push(input);
    form.append(fixed === undefined ? element("label", {}, "Item", input) : input);
  }
  for (const field of act.fields) {
    const fixed = defaults?.fields?.[field.name];
    const choices = context.choices?.[act.kind]?.[field.name] ?? field.choices;
    const attrs: Record<string, string> = { name: `field:${field.name}`, "data-type": field.type };
    if (field.required) attrs["required"] = "";
    const value = fixed ?? draft[field.name] ?? "";
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
      input = element("textarea", { ...attrs, rows: field.name === "content" ? "8" : "3" }, value) as HTMLTextAreaElement;
    } else {
      input = element("input", { ...attrs, type: "text", value }) as HTMLInputElement;
    }
    controls.push(input);
    const label = element("label", {}, labelOf(field.name), input);
    if (primary && technical.has(field.name) && !field.required) advanced.push(label);
    else form.append(label);
  }
  if (advanced.length) form.append(element("details", {}, element("summary", {}, "More options"), advanced));
  const button = element("button", { type: "submit", class: primary ? "primary" : "" }, labels[act.kind] ?? act.kind);
  if (context.uncertain || act.fields.some((field) => field.required && (context.choices?.[act.kind]?.[field.name] ?? field.choices)?.length === 0 && defaults?.fields?.[field.name] === undefined)) button.setAttribute("disabled", "");
  if (context.uncertain) for (const control of controls) control.setAttribute("disabled", "");
  form.append(button);
  const read = (): { on: string; typed: Record<string, string> } => {
    let on = "";
    const typed: Record<string, string> = {};
    for (const control of controls) {
      if (control.name === "on") on = control.value;
      else if (control.value !== "") typed[control.name.slice(6)] = control.value;
    }
    return { on, typed };
  };
  form.addEventListener("input", () => {
    if (draftKey) { const { on, typed } = read(); drafts.set(draftKey, { ...typed, on }); }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (context.uncertain || button.hasAttribute("disabled")) return;
    const { on, typed } = read();
    // Block repeated clicks while the shell's signed operation is awaiting its answer.
    button.setAttribute("disabled", "");
    send(act.kind, on, typed);
  });
  return form;
}
