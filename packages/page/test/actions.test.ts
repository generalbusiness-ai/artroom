import { afterEach, beforeEach, expect, test } from "vitest";
import { actsPanel } from "../src/actions.ts";
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
