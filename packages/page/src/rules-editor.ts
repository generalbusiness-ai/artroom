/** Edits a complete read of native rules; the shell signs the existing publish act. */
import type { RulesView } from "./data.ts";

type Rules = RulesView & { item?: number };
type Send = (kind: string, on: string, typed: Record<string, string>) => void;
type Child = HTMLElement | string;
const h = (tag: string, attrs: Record<string, string> = {}, ...children: (Child | Child[])[]): HTMLElement => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children.flat()) node.append(child);
  return node;
};
const serialized = (value: unknown): string => JSON.stringify(value);
const drafts = new Map<string, Record<string, string>>();

/** A rules form has no authority of its own: only the offered publish action may call send. */
export function rulesEditor(rules: Rules, send: Send, context: { blocked?: boolean; draftKey?: string } = {}): HTMLElement {
  const form = h("form", { class: "rules-editor", "data-act": "publish" });
  if (rules.item === undefined || rules.approvals === null || rules.ownerMayReview === null || rules.singleControllerException === null || rules.extents === null) {
    form.append(h("p", { role: "status" }, "The complete rules could not be read. Check status before editing."));
    return form;
  }
  const baseline = Object.fromEntries([
    ["approvals", String(rules.approvals)], ["ownerMayReview", String(rules.ownerMayReview)],
    ["singleControllerException", String(rules.singleControllerException)],
    ["checks", serialized(rules.checks)], ["labels", serialized(rules.labels)], ["extents", serialized(rules.extents)],
  ]);
  const draftKey = context.draftKey ? JSON.stringify([context.draftKey, rules.item, rules.head]) : null;
  const draft = draftKey ? drafts.get(draftKey) : undefined;
  const value = (name: string, fallback: string): string => draft && Object.hasOwn(draft, name) ? draft[name]! : fallback;
  const approvals = h("input", { type: "number", min: "0", step: "1", required: "", name: "approvals", value: value("approvals", baseline["approvals"]!) }) as HTMLInputElement;
  const bool = (name: string, value: boolean): HTMLSelectElement => h("select", { name },
    h("option", { value: "false", ...(!value ? { selected: "" } : {}) }, "No"),
    h("option", { value: "true", ...(value ? { selected: "" } : {}) }, "Yes")) as HTMLSelectElement;
  const owner = bool("ownerMayReview", value("ownerMayReview", String(rules.ownerMayReview)) === "true");
  const exception = bool("singleControllerException", value("singleControllerException", String(rules.singleControllerException)) === "true");
  const extentInputs = rules.extents.map((extent, index) => {
    const input = h("input", { type: "number", min: "0", step: "1", required: "", name: `extent:${index}`, value: value(`extent:${index}`, String(extent.approvals)), "aria-label": `Approvals for ${extent.name}` }) as HTMLInputElement;
    form.append(h("div", { class: "rule-row" },
      h("div", {}, h("strong", { class: "rule-label" }, extent.name), h("span", { class: "rule-path" }, extent.patterns?.length ? extent.patterns.join(", ") : "Paths unmatched by another extent")),
      h("label", {}, "Approvals", input)));
    return input;
  });
  form.prepend(h("h2", {}, "Review requirements"));
  form.append(h("label", {}, "Default approvals", approvals), h("label", {}, "Allow author's controller review", owner));
  const checks = h("textarea", { name: "checks", rows: "5" }, value("checks", baseline["checks"]!)) as HTMLTextAreaElement;
  const labels = h("textarea", { name: "labels", rows: "2" }, value("labels", baseline["labels"]!)) as HTMLTextAreaElement;
  form.append(h("details", {}, h("summary", {}, "Advanced rules"), h("label", {}, "Checks", checks), h("label", {}, "Labels", labels), h("label", {}, "Single controller exception", exception)));
  const save = h("button", { type: "submit", class: "primary" }, "Save changes");
  const message = h("p", { role: "status", hidden: "" });
  const confirmation = h("div", { class: "rules-confirmation", hidden: "" });
  const controls = [approvals, owner, exception, checks, labels, ...extentInputs];
  if (context.blocked) {
    save.setAttribute("disabled", "");
    for (const control of controls) control.setAttribute("disabled", "");
  }
  form.append(save, message, confirmation);
  let pending: Record<string, string> | null = null;
  let submitted = false;
  const read = (): Record<string, string> => {
    const count = (input: HTMLInputElement): number => {
      const value = input.value;
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Approvals must be a whole number of zero or more.");
      return Number(value);
    };
    const rawChecks: unknown = JSON.parse(checks.value), rawLabels: unknown = JSON.parse(labels.value);
    if (!Array.isArray(rawChecks) || !Array.isArray(rawLabels)) throw new Error("Checks and labels must be JSON lists.");
    // Spread preserves the complete extent, including fields this editor does not interpret.
    const extents = rules.extents!.map((extent, index) => ({ ...extent, approvals: count(extentInputs[index]!) }));
    return Object.fromEntries([
      ["approvals", String(count(approvals))], ["ownerMayReview", owner.value], ["singleControllerException", exception.value],
      ["checks", serialized(rawChecks)], ["labels", serialized(rawLabels)], ["extents", serialized(extents)],
    ]);
  };
  const hideConfirmation = () => { pending = null; confirmation.setAttribute("hidden", ""); confirmation.replaceChildren(); };
  const changedInput = () => {
    hideConfirmation();
    if (draftKey) drafts.set(draftKey, Object.fromEntries(controls.map((control) => [control.name, control.value])));
  };
  form.addEventListener("input", changedInput);
  form.addEventListener("change", changedInput);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (context.blocked || submitted) return;
    let next: Record<string, string>;
    try { next = read(); }
    catch (error) { message.textContent = error instanceof Error ? error.message : "The rules could not be read."; message.removeAttribute("hidden"); return; }
    const changed = Object.keys(baseline).filter((key) => baseline[key] !== next[key]);
    if (changed.length === 0) { hideConfirmation(); message.textContent = "No changes to save."; message.removeAttribute("hidden"); return; }
    message.setAttribute("hidden", "");
    pending = next;
    const confirm = h("button", { type: "button", class: "primary" }, "Confirm changes");
    const cancel = h("button", { type: "button" }, "Cancel");
    const names: Record<string, string> = { approvals: "Default approvals", ownerMayReview: "Author's controller review", singleControllerException: "Single controller exception", checks: "Checks", labels: "Labels", extents: "Review requirements" };
    confirmation.replaceChildren(h("h3", {}, "Confirm rule changes"), ...changed.map((key) => h("div", {}, h("strong", {}, names[key]!), h("pre", {}, `${baseline[key]}\n→ ${next[key]}`))), confirm, cancel);
    confirmation.removeAttribute("hidden");
    cancel.addEventListener("click", hideConfirmation);
    confirm.addEventListener("click", () => {
      if (!pending || context.blocked || submitted) return;
      submitted = true;
      save.setAttribute("disabled", ""); confirm.setAttribute("disabled", "");
      send("publish", String(rules.item), pending);
    });
  });
  return form;
}
