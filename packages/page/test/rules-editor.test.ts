import { afterEach, beforeEach, expect, test } from "vitest";
import { rulesEditor } from "../src/rules-editor.ts";
import type { RulesView } from "../src/data.ts";

// DOM stand-in exercises form values/confirmation, not browser rendering or policy judgment.
class Element {
  children: (Element | string)[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, (() => void)[]>();
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  hasAttribute(name: string) { return this.attrs.has(name); }
  append(...children: (Element | string)[]) { this.children.push(...children); }
  prepend(...children: (Element | string)[]) { this.children.unshift(...children); }
  replaceChildren(...children: (Element | string)[]) { this.children = children; }
  addEventListener(name: string, listener: (event: { preventDefault(): void }) => void) {
    this.listeners.set(name, [...this.listeners.get(name) ?? [], () => listener({ preventDefault() {} })]);
  }
  get name() { return this.attrs.get("name") ?? ""; }
  get value(): string {
    return this.attrs.get("value") ?? (this.tag === "textarea" ? this.textContent : this.all().find((node) => node.tag === "option" && node.hasAttribute("selected"))?.value ?? "");
  }
  set value(value: string) { this.attrs.set("value", value); }
  get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(""); }
  set textContent(value: string) { this.children = [value]; }
  all(): Element[] { return [this, ...this.children.flatMap((child) => typeof child === "string" ? [] : child.all())]; }
  event(name: string) { for (const listener of this.listeners.get(name) ?? []) listener(); }
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
const rules = (): RulesView => ({
  scope: "sc_rules" as RulesView["scope"], head: { seq: 10, hash: "sha256:fixture" as RulesView["head"]["hash"] }, item: 7, revision: 10,
  approvals: 1, ownerMayReview: false, singleControllerException: true,
  checks: [JSON.parse('{"name":"gate","required":true,"configuration":"sha256:configuration","checker":{"member":"@checker"},"extra":{"__proto__":"kept"}}')],
  labels: ["ready"], extents: [JSON.parse('{"name":"source","patterns":["src/**"],"approvals":1,"approver":"change.review","checks":["gate"],"class":"content","extra":{"__proto__":"extent kept"}}')],
  definitions: [], controllers: ["@controller"],
});
const button = (form: Element, label: string) => form.all().find((node) => node.tag === "button" && node.textContent === label)!;

test("unchanged rules and canceled confirmation sign nothing; malformed advanced values remain editable", () => {
  const sent: unknown[] = [];
  const form = asElement(rulesEditor(rules(), (...args) => sent.push(args)));
  form.event("submit");
  expect(form.textContent).toContain("No changes to save.");
  expect(sent).toEqual([]);
  form.all().find((node) => node.name === "extent:0")!.value = "2";
  form.event("submit");
  expect(form.textContent).toContain("Confirm rule changes");
  expect(form.textContent).toContain('"approvals":1');
  expect(form.textContent).toContain('"approvals":2');
  button(form, "Cancel").event("click");
  expect(sent).toEqual([]);
  expect(button(form, "Confirm changes")).toBeUndefined();
  form.all().find((node) => node.name === "checks")!.value = "not JSON";
  form.event("submit");
  expect(sent).toEqual([]);
  expect(button(form, "Confirm changes")).toBeUndefined();
});

test("confirmed rules publish the exact observed item and preserve the complete configuration and extent", () => {
  const original = rules(), sent: unknown[] = [];
  const form = asElement(rulesEditor(original, (...args) => sent.push(args)));
  form.all().find((node) => node.name === "extent:0")!.value = "3";
  form.event("submit");
  expect(sent).toEqual([]);
  const confirm = button(form, "Confirm changes");
  confirm.event("click"); confirm.event("click");
  expect(sent).toHaveLength(1);
  const [kind, on, typed] = sent[0] as [string, string, Record<string, string>];
  expect([kind, on, typed["singleControllerException"], typed["ownerMayReview"]]).toEqual(["publish", "7", "true", "false"]);
  expect(JSON.parse(typed["checks"]!)).toEqual(original.checks);
  expect(JSON.parse(typed["extents"]!)).toEqual([{ ...original.extents![0], approvals: 3 }]);
  expect(original.extents![0]!.approvals).toBe(1);
});

test("missing exact rules identity, incomplete values and pending custody offer no save mutation", () => {
  const { item: _item, ...withoutIdentity } = rules();
  for (const read of [withoutIdentity, { ...rules(), extents: null }]) {
    const form = asElement(rulesEditor(read, () => expect.fail("must not send")));
    expect(button(form, "Save changes")).toBeUndefined();
    expect(form.textContent).toContain("complete rules could not be read");
  }
  const pending = asElement(rulesEditor(rules(), () => expect.fail("must not send"), { blocked: true }));
  expect(button(pending, "Save changes").hasAttribute("disabled")).toBe(true);
  pending.event("submit");
  expect(button(pending, "Confirm changes")).toBeUndefined();
});

test("unsent rules edits survive navigation only in the same room, member and observed revision", () => {
  const original = rules();
  const form = asElement(rulesEditor(original, () => {}, { draftKey: "room/member/rules" }));
  form.all().find((node) => node.name === "extent:0")!.value = "4";
  form.event("input");
  const value = (read: RulesView, key: string) => asElement(rulesEditor(read, () => {}, { draftKey: key })).all().find((node) => node.name === "extent:0")!.value;
  expect(value(original, "room/member/rules")).toBe("4");
  expect(value(original, "other-room/member/rules")).toBe("1");
  expect(value(original, "room/other-member/rules")).toBe("1");
  expect(value({ ...original, head: { ...original.head, seq: original.head.seq + 1 } }, "room/member/rules")).toBe("1");
  form.event("submit");
  expect(button(form, "Confirm changes")).toBeDefined();
  form.all().find((node) => node.name === "extent:0")!.value = "5";
  form.event("input");
  expect(button(form, "Confirm changes")).toBeUndefined();
});
