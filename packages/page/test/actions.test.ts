import { afterEach, beforeEach, expect, test } from "vitest";
import { actsPanel } from "../src/actions.ts";
import { taskForm } from "../src/tasks.ts";
import type { Offered } from "../src/data.ts";

// A minimal DOM stand-in at the form boundary, not a browser or authority test.
// Real signing, typed definitions and refusal are covered by story.scope.test.ts.
class Element {
  children: (Element | string)[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((event: { preventDefault(): void }) => void)[]>();
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  hasAttribute(name: string) { return this.attrs.has(name); }
  append(...children: (Element | string)[]) { this.children.push(...children); }
  addEventListener(name: string, listener: (event: { preventDefault(): void }) => void) {
    this.listeners.set(name, [...this.listeners.get(name) ?? [], listener]);
  }
  get name() { return this.attrs.get("name") ?? ""; }
  get value(): string {
    if (this.attrs.has("value")) return this.attrs.get("value")!;
    if (this.tag === "textarea") return this.textContent;
    return this.all().find((node) => node.tag === "option" && node.hasAttribute("selected"))?.value ?? "";
  }
  set value(value: string) { this.attrs.set("value", value); }
  get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(""); }
  all(): Element[] { return [this, ...this.children.flatMap((child) => typeof child === "string" ? [] : child.all())]; }
  event(name: string) { for (const listener of this.listeners.get(name) ?? []) listener({ preventDefault() {} }); }
}
const asElement = (node: HTMLElement) => node as unknown as Element;
let oldDocument: PropertyDescriptor | undefined;
beforeEach(() => {
  oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: (tag: string) => new Element(tag) } });
});
afterEach(() => {
  if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
  else Reflect.deleteProperty(globalThis, "document");
});
const review: Offered = { kind: "review-verdict", step: "open", on: "review", line: "protocol declaration", fields: [
  { name: "manifest", type: "item", required: true }, { name: "verdict", type: "enum", required: true }, { name: "body", type: "text", required: false },
] };

test("review submits the exact observed version and typed controls once; unsupported acts remain inspectable", () => {
  const sent: unknown[] = [];
  const panel = asElement(actsPanel({ acts: [review, { kind: "custom-act", step: "open", on: "record", line: "Custom", fields: [] }], hidden: 2 }, (...args) => sent.push(args), null, {
    primary: ["review-verdict", "merge"], defaults: { "review-verdict": { fields: { manifest: "17" } } },
    choices: { "review-verdict": { verdict: [{ label: "Approve", value: "approve" }, { label: "Request changes", value: "changes" }] } },
  }));
  const nodes = panel.all();
  expect(nodes.filter((node) => node.tag === "summary").map((node) => node.textContent)).toEqual(["Review change", "Inspect", "custom-act"]);
  expect(nodes.find((node) => node.name === "field:manifest")?.attrs.get("type")).toBe("hidden");
  nodes.find((node) => node.name === "field:verdict")!.value = "changes";
  nodes.find((node) => node.name === "field:body")!.value = "<script>kept as text</script>";
  const form = nodes.find((node) => node.attrs.get("data-act") === "review-verdict")!;
  form.event("submit"); form.event("submit");
  expect(sent).toEqual([["review-verdict", "", { manifest: "17", verdict: "changes", body: "<script>kept as text</script>" }]]);
  expect(panel.textContent).not.toContain("Merge change"); // Context never adds an unoffered act.
});

test("unknown submission offers only a read refresh and cannot sign another mutation", () => {
  let sends = 0, reads = 0;
  const panel = asElement(actsPanel({ acts: [review], hidden: 0 }, () => sends++, null, { uncertain: true, refresh: () => reads++ }));
  panel.all().find((node) => node.tag === "form")!.event("submit");
  panel.all().find((node) => node.tag === "button" && node.textContent === "Check status")!.event("click");
  expect([sends, reads]).toEqual([0, 1]);
  expect(panel.all().filter((node) => node.name.startsWith("field:")).every((node) => node.hasAttribute("disabled"))).toBe(true);
  expect(panel.textContent).toContain("Request outcome unknown");
});

test("an uncertain subject keeps one status home while its known request remains inspectable", () => {
  const last = new Element("p");
  last.append("Accepted merge; subsequent observation unknown");
  const panel = asElement(actsPanel({ acts: [review], hidden: 0 }, () => expect.fail("must not submit"), last as unknown as HTMLElement, {
    uncertain: true, statusShown: true, refresh: () => {},
  }));
  expect(panel.all().filter((node) => node.attrs.get("role") === "status")).toHaveLength(0);
  expect(panel.textContent).not.toMatch(/Awaiting confirmation|Request outcome unknown/);
  expect(panel.all().find((node) => node.attrs.get("class") === "action-record")?.textContent).toContain("Accepted merge; subsequent observation unknown");
  expect(panel.all().find((node) => node.tag === "button" && node.textContent === "Check status")).toBeDefined();
});

test("a single eligible choice is fixed and drafts stay with their room, member and exact version", () => {
  const offered = { acts: [review], hidden: 0 };
  const context = { primary: ["review-verdict"], draftKey: "room-A/member-A/scope", defaults: { "review-verdict": { fields: { manifest: "9" } } }, choices: { "review-verdict": { verdict: [{ label: "Approve", value: "approve" }] } } };
  const first = asElement(actsPanel(offered, () => {}, null, context));
  const body = first.all().find((node) => node.name === "field:body")!;
  body.value = "Unsent review";
  first.all().find((node) => node.tag === "form")!.event("input");
  expect(first.all().filter((node) => node.tag === "select")).toHaveLength(0);
  const saved = (extra = {}) => asElement(actsPanel(offered, () => {}, null, { ...context, ...extra })).all().find((node) => node.name === "field:body")!.value;
  expect(saved()).toBe("Unsent review");
  expect(saved({ draftKey: "room-B/member-A/scope" })).toBe("");
  expect(saved({ draftKey: "room-A/member-B/scope" })).toBe("");
  expect(saved({ defaults: { "review-verdict": { fields: { manifest: "10" } } } })).toBe("");
});

test("ordinary declared inherited names remain own fields with their exact text, including saved drafts", () => {
  // These names are valid declarations, as the real validator/judgment witness in derive/timed.test.ts shows.
  const names = ["__proto__", "constructor", "toString"];
  const offered = { acts: names.map((kind): Offered => ({ kind, step: "open", on: "record", line: kind, fields: names.map((name) => ({ name, type: "text", required: true })) })), hidden: 0 };
  const sent: unknown[] = [];
  const context = { defaults: {}, choices: {}, draftKey: "ordinary-inherited-names" };
  const panel = asElement(actsPanel(offered, (...args) => sent.push(args), null, context));
  expect(panel.all().filter((node) => node.tag === "summary").map((node) => node.textContent)).toEqual(["Inspect", ...names]);
  const form = panel.all().find((node) => node.attrs.get("data-act") === "__proto__")!;
  for (const name of names) {
    const input = form.all().find((node) => node.name === `field:${name}`)!;
    expect([input.attrs.get("type"), input.value]).toEqual(["text", ""]);
    input.value = `text for ${name}`;
  }
  form.event("input");
  const redraw = asElement(actsPanel(offered, (...args) => sent.push(args), null, context));
  const restored = redraw.all().find((node) => node.attrs.get("data-act") === "__proto__")!;
  for (const name of names) expect(restored.all().find((node) => node.name === `field:${name}`)!.value).toBe(`text for ${name}`);
  restored.event("submit");
  const fields = (sent[0] as [string, string, Record<string, string>])[2];
  expect(Object.keys(fields)).toEqual(names);
  for (const name of names) expect([Object.hasOwn(fields, name), fields[name]]).toEqual([true, `text for ${name}`]);
  expect(Object.getPrototypeOf(fields)).toBeNull();
});

test("a final subject can retain its declared action for inspection without offering another merge", () => {
  let sends = 0;
  const merge: Offered = { kind: "merge", step: "open", on: "merge", line: "Merge", fields: [] };
  const panel = asElement(actsPanel({ acts: [merge], hidden: 0 }, () => sends++, null, { blockedKinds: ["merge"] }));
  const form = panel.all().find((node) => node.tag === "form")!;
  expect(form.all().find((node) => node.tag === "button")?.hasAttribute("disabled")).toBe(true);
  form.event("submit");
  expect(sends).toBe(0);
});

test("a pending signed request prevents fresh submission without claiming its outcome is unknown", () => {
  let sends = 0;
  const panel = asElement(actsPanel({ acts: [review], hidden: 0 }, () => sends++, null, { pending: true, refresh: () => {} }));
  expect(panel.textContent).toContain("Sending request");
  expect(panel.textContent).not.toContain("Request outcome unknown");
  panel.all().find((node) => node.tag === "form")!.event("submit");
  expect(sends).toBe(0);
});

test("only the exact accepted comment draft retires; delayed acceptance preserves newer edits and other subjects", () => {
  const comment: Offered = { kind: "comment", step: "open", on: "comment", line: "Comment", fields: [{ name: "body", type: "text", required: true }] };
  const callbacks: (() => void)[] = [];
  const form = (subject: string) => asElement(actsPanel({ acts: [comment], hidden: 0 }, (_kind, _on, _typed, accepted) => { callbacks.push(accepted!); }, null, { primary: ["comment"], draftKey: subject })).all().find((node) => node.tag === "form")!;
  const edit = (shown: Element, value: string) => { shown.all().find((node) => node.name === "field:body")!.value = value; shown.event("input"); };
  const first = form("room/key/first-subject"); edit(first, "Accepted text"); first.event("submit"); callbacks[0]!();
  expect(form("room/key/first-subject").all().find((node) => node.name === "field:body")!.value).toBe("");
  const delayed = form("room/key/first-subject"); edit(delayed, "Old submission"); delayed.event("submit");
  const newer = form("room/key/first-subject"); edit(newer, "Newer unsent edit");
  const other = form("room/key/other-subject"); edit(other, "Other subject draft");
  callbacks[1]!();
  expect(form("room/key/first-subject").all().find((node) => node.name === "field:body")!.value).toBe("Newer unsent edit");
  expect(form("room/key/other-subject").all().find((node) => node.name === "field:body")!.value).toBe("Other subject draft");
  const repeated = form("room/key/same-text-subject"); edit(repeated, "Repeated text"); repeated.event("submit");
  const changedBack = form("room/key/same-text-subject"); edit(changedBack, "Different text"); edit(changedBack, "Repeated text");
  callbacks[2]!();
  expect(form("room/key/same-text-subject").all().find((node) => node.name === "field:body")!.value).toBe("Repeated text");
  const unknown = form("room/key/unknown-subject"); edit(unknown, "Unknown or refused submission"); unknown.event("submit");
  expect(form("room/key/unknown-subject").all().find((node) => node.name === "field:body")!.value).toBe("Unknown or refused submission");
});

test("a Merge task uses the exact observed manifest and selected issue reports without asking for protocol fields", () => {
  const merge: Offered = { kind: "merge", step: "open", on: "merge", line: "Merge", fields: [{ name: "manifest", type: "item", required: true }, { name: "reports", type: "list", required: true }] };
  const missing = asElement(taskForm(merge, () => {}, { defaults: { merge: { fields: { manifest: "12" } } } }, [], "Merge change"));
  expect(missing.textContent).toContain("selected issue-report evidence"); expect(missing.all().filter((node) => node.tag === "input")).toEqual([]);
  const reports = '[{"at":{"kind":"lane","scope":"recorded-issue","inc":"recorded"},"seq":8,"hash":"recorded-hash"}]';
  const sent: unknown[] = [];
  const ready = asElement(taskForm(merge, (...args) => sent.push(args), { defaults: { merge: { fields: { manifest: "12", reports } } } }, [], "Merge change"));
  expect(ready.all().filter((node) => node.tag === "label")).toEqual([]);
  expect(ready.all().filter((node) => node.tag === "input").map((node) => node.attrs.get("type"))).toEqual(["hidden", "hidden"]);
  ready.event("submit"); expect(sent[0]).toEqual(["merge", "", { manifest: "12", reports }]);
});
