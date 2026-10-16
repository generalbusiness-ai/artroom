import { afterEach, beforeEach, expect, test } from "vitest";
import { actsPanel } from "../src/actions.ts";
import { changeTaskContext, createIssue, issueDialogOutcome, nextChangeAction, requestedReviewCandidates, reviewSelectionProblem, taskForm } from "../src/tasks.ts";
import { digestBytes, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import type { MemberRef, ScopeRef } from "@generalbusiness/dap-contract";
import type { ChangeView, Offered, Room } from "../src/data.ts";

// A minimal DOM stand-in at the form boundary, not a browser or authority test.
// Real signing, typed definitions and refusal are covered by story.scope.test.ts.
class Element {
  children: (Element | string)[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((event: { preventDefault(): void }) => void)[]>();
  closed = false;
  parent: Element | null = null;
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  removeAttribute(name: string) { this.attrs.delete(name); }
  showModal() { this.closed = false; } close() { this.closed = true; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  focus() {}
  querySelectorAll(selector: string): Element[] {
    return this.all().filter(node => selector.split(",").some(part => {
      const simple = part.trim(), attribute = /^\[([^=\]]+)\]$/.exec(simple)?.[1];
      if (attribute) return node.hasAttribute(attribute);
      if (simple === 'button[type=submit]' || simple === 'button[type="submit"]') return node.tag === "button" && node.attrs.get("type") === "submit";
      return node.tag === simple;
    }));
  }
  querySelector<T>(selector: string): T | null {
    const name = /^\[name="([^"]+)"\]$/.exec(selector)?.[1];
    return (name ? this.all().find((node) => node.name === name) : this.querySelectorAll(selector)[0]) as T ?? null;
  }
  hasAttribute(name: string) { return this.attrs.has(name); }
  append(...children: (Element | string)[]) { for (const child of children) { if (child instanceof Element) { child.remove(); child.parent = this; } this.children.push(child); } }
  prepend(...children: (Element | string)[]) { for (const child of [...children].reverse()) { if (child instanceof Element) { child.remove(); child.parent = this; } this.children.unshift(child); } }
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
  set textContent(value: string) { this.children = [value]; }
  all(): Element[] { return [this, ...this.children.flatMap((child) => typeof child === "string" ? [] : child.all())]; }
  event(name: string) { for (const listener of this.listeners.get(name) ?? []) listener({ preventDefault() {} }); }
}
const asElement = (node: HTMLElement) => node as unknown as Element;
let oldDocument: PropertyDescriptor | undefined;
beforeEach(() => {
  oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElementNS: (_namespace: string, tag: string) => new Element(tag), createElement: (tag: string) => new Element(tag) } });
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
  // An additional scripted bool declaration checks generic labels, not native review authority.
  const withBoolean: Offered = { ...review, fields: [...review.fields, { name: "notify", type: "bool", required: false }] };
  const panel = asElement(actsPanel({ acts: [withBoolean, { kind: "custom-act", step: "open", on: "record", line: "Custom", fields: [] }], hidden: 2 }, (...args) => sent.push(args), null, {
    primary: ["review-verdict", "merge"], defaults: { "review-verdict": { fields: { manifest: "17" } } },
    choices: { "review-verdict": { verdict: [{ label: "Approve", value: "approve" }, { label: "Request changes", value: "changes" }] } },
  }));
  const nodes = panel.all();
  expect(nodes.filter(node => node.tag === "label").map(node => node.children[0])).toEqual(["Decision", "Review comment", "notify?"]);
  expect(nodes.filter((node) => node.tag === "summary").map((node) => node.textContent)).toEqual(["Review change", "Advanced", "custom-act"]);
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
  const withRequest: Offered = { ...review, fields: [...review.fields, { name: "request", type: "item", required: false }] };
  const offered = { acts: [withRequest], hidden: 0 };
  const context = { primary: ["review-verdict"], draftKey: "room-A/member-A/scope", defaults: { "review-verdict": { fields: { manifest: "9", request: "6" } } }, choices: { "review-verdict": { verdict: [{ label: "Approve", value: "approve" }], request: [{ label: "Request 6", value: "6" }] } } };
  const first = asElement(actsPanel(offered, () => {}, null, context));
  const body = first.all().find((node) => node.name === "field:body")!;
  body.value = "Unsent review";
  first.all().find((node) => node.tag === "form")!.event("input");
  expect(first.all().filter((node) => node.tag === "select")).toHaveLength(0);
  const saved = (extra = {}) => asElement(actsPanel(offered, () => {}, null, { ...context, ...extra })).all().find((node) => node.name === "field:body")!.value;
  expect(saved()).toBe("Unsent review");
  const current = (requests: readonly { label: string; value: string }[], fixed?: string) => asElement(actsPanel(offered, (...args) => sent.push(args), null, {
    ...context, defaults: { "review-verdict": { fields: { manifest: "9", ...(fixed !== undefined ? { request: fixed } : {}) } } },
    choices: { "review-verdict": { ...context.choices["review-verdict"], request: requests } },
  })).all().find(node => node.tag === "form")!;
  const sent: unknown[] = [];
  const many = current([{ label: "Request 6", value: "6" }, { label: "Request 9", value: "9" }]);
  expect(many.all().find(node => node.name === "field:body")!.value).toBe("Unsent review");
  expect(many.all().find(node => node.name === "field:request")!.value).toBe("6");
  const replaced = current([{ label: "Request 9", value: "9" }], "9");
  const request = replaced.all().find(node => node.name === "field:request")!;
  expect(request.tag).toBe("select");expect(request.value).not.toBe("9");
  expect(replaced.all().find(node => node.name === "field:body")!.value).toBe("Unsent review");
  expect(replaced.all().find(node => node.tag === "button")!.hasAttribute("disabled")).toBe(true);
  replaced.event("submit");expect(sent).toEqual([]);
  request.value = "9";replaced.event("change");
  expect(replaced.all().find(node => node.tag === "button")!.hasAttribute("disabled")).toBe(false);
  replaced.event("submit");expect(sent).toEqual([["review-verdict", "", { manifest: "9", request: "9", verdict: "approve", body: "Unsent review" }]]);
  // An explicit voluntary selection remains a draft choice when a new sole request arrives.
  const voluntary = current([{ label: "Voluntary review", value: "" }], "");
  const voluntaryRequest = voluntary.all().find(node => node.name === "field:request")!;
  expect(voluntary.all().find(node => node.tag === "button")!.hasAttribute("disabled")).toBe(true);
  voluntaryRequest.value = "";voluntary.event("change");
  expect(voluntary.all().find(node => node.tag === "button")!.hasAttribute("disabled")).toBe(false);
  const newSole = current([{ label: "Request 10", value: "10" }], "10");
  expect(newSole.all().find(node => node.tag === "button")!.hasAttribute("disabled")).toBe(true);
  expect(newSole.all().find(node => node.name === "field:body")!.value).toBe("Unsent review");
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
  expect(panel.all().filter((node) => node.tag === "summary").map((node) => node.textContent)).toEqual(["Advanced", ...names]);
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
  // A custom declaration may use this kind/name for ordinary text. No task choices are asserted.
  const custom: Offered = { kind: "review-verdict", step: "open", on: "record", line: "Custom review", fields: [{ name: "manifest", type: "item", required: true }, { name: "request", type: "text", required: true }] };
  const ordinary = { acts: [custom], hidden: 0 };
  const customContext = { draftKey: "ordinary-custom-review", defaults: { "review-verdict": { fields: { manifest: "17" } } } };
  const customSent: unknown[] = [];
  const show = () => asElement(actsPanel(ordinary, (...args) => customSent.push(args), null, customContext)).all().find(node => node.tag === "form")!;
  const unsent = show();unsent.all().find(node => node.name === "field:request")!.value = "An ordinary request value";unsent.event("input");
  const reopened = show(), request = reopened.all().find(node => node.name === "field:request")!;
  expect(request.tag).toBe("input");expect(request.value).toBe("An ordinary request value");
  expect(reopened.all().find(node => node.tag === "button")!.hasAttribute("disabled")).toBe(false);
  request.value = "An edited ordinary value";reopened.event("input");reopened.event("submit");
  expect(customSent).toEqual([["review-verdict", "", { manifest: "17", request: "An edited ordinary value" }]]);
});

test("a final subject can retain its declared action for inspection without offering another merge", () => {
  let sends = 0;
  const close: Offered = { kind: "close-own", step: "transition", on: "intent", line: "Close", fields: [{ name: "reason", type: "enum", required: false, choices: [{ label: "Completed", value: "completed" }, { label: "Not planned", value: "not-planned" }] }] };
  const values: unknown[] = [];
  const closeContext = { primary: ["close-own"], draftKey: "close/reason/original", defaults: { "close-own": { on: 0 } } };
  const closing = () => asElement(actsPanel({ acts: [close], hidden: 0 }, (...args) => values.push(args), null, closeContext)).all().find(node => node.tag === "form")!;
  const held = closing(), reason = held.all().find(node => node.name === "field:reason")!, submit = held.all().find(node => node.tag === "button")!;
  expect(reason.hasAttribute("required")).toBe(true);
  expect(submit.hasAttribute("disabled")).toBe(true);
  held.event("submit"); expect(values).toEqual([]);
  reason.value = "completed"; held.event("change"); expect(submit.hasAttribute("disabled")).toBe(false);
  reason.value = ""; held.event("input"); expect(submit.hasAttribute("disabled")).toBe(true);
  reason.value = "not-a-declared-choice"; held.event("change"); held.event("submit"); expect(values).toEqual([]);
  reason.value = "completed"; held.event("change");
  const restored = closing(); expect(restored.all().find(node => node.name === "field:reason")!.value).toBe("completed");
  expect(restored.all().find(node => node.tag === "button")!.hasAttribute("disabled")).toBe(false);
  restored.event("submit"); restored.event("change"); restored.event("submit");
  expect(values).toEqual([["close-own", "0", { reason: "completed" }]]);
  const blockedClose = asElement(actsPanel({ acts: [close], hidden: 0 }, () => expect.fail("unknown close must not send"), null, { ...closeContext, uncertain: true }));
  expect(blockedClose.all().find(node => node.tag === "button" && node.attrs.get("type") === "submit")!.hasAttribute("disabled")).toBe(true);
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

test("task defaults retain selected issue-report order and never fall back to an older manifest or checker jobs", () => {
  const reports = [{ at: { kind: "lane", scope: "second-issue", inc: "second" }, seq: 9, hash: "second-hash" }, { at: { kind: "lane", scope: "first-issue", inc: "first" }, seq: 4, hash: "first-hash" }];
  const change = { currentManifest: 12, proposal: 0, manifests: [{ id: 11, state: "superseded", selectedReports: [] }, { id: 12, state: "current", selectedReports: reports }], jobs: [{ id: 99, state: "passed" }], reviewExtents: [{ label: "Docs", value: "docs" }], reviewMembers: [{ label: "@reviewer", value: "@reviewer" }] } as unknown as ChangeView;
  expect(changeTaskContext(change).defaults?.["merge"]?.fields).toEqual({ manifest: "12", reports: JSON.stringify(reports) });
  const unreadable = { ...change as object, currentManifest: null } as never;
  expect(changeTaskContext(unreadable).defaults?.["merge"]).toBeUndefined();
  // Synthetic complete identity, not a native grant. Same handle in another
  // membership incarnation cannot attach another person's request.
  const fixtureDigest = digestBytes(new Uint8Array([1]));
  const membership: ScopeRef = { scope: scopeIdOf({ v: 1, kind: "membership", definition: fixtureDigest, creator: null, cause: fixtureDigest, ordinal: 0 }), inc: newIncarnation(new Uint8Array(16)), kind: "membership" };
  const lane: ScopeRef = { scope: scopeIdOf({ v: 1, kind: "lane", definition: fixtureDigest, creator: null, cause: fixtureDigest, ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(1)), kind: "lane" };
  const member: MemberRef = { membership, member: "@reviewer" };
  const requester: MemberRef = { membership, member: "@author" };
  const room = { membership, me: { handle: "@reviewer", ref: member } } as unknown as Room;
  const request = (id: number, requestedRef: MemberRef = member, state = "open") => ({ id, state, requested: "@reviewer", requester: "@author", requestedRef, requesterRef: requester });
  const requested = { ...change, scope: lane.scope, ref: lane, state: "open", reviewMembersByExtent: { docs: [{ label: "@reviewer", value: "@reviewer" }] }, reviewPolicy: { manifest: 12, source: {} as never, extents: [{ name: "docs", patterns: ["README.md"], approvals: 1, approver: "change.review", checks: [], class: "content" }] }, manifests: [{ ...change.manifests[1]!, authors: [], file: { path: "README.md" } }], requests: [request(7, { ...member, membership: { ...membership, inc: newIncarnation(new Uint8Array(16).fill(2)) } }), request(8, member, "met"), request(6)] } as unknown as ChangeView;
  const context = changeTaskContext(requested, room);
  expect(context.defaults["review-verdict"]!.fields).toEqual({ manifest: "12", request: "6" });
  const actualReview: Offered = { ...review, fields: [...review.fields, { name: "extent", type: "text", required: false }, { name: "request", type: "item", required: false }] };
  const sent: unknown[] = [];
  const form = asElement(taskForm(actualReview, (...args) => sent.push(args), context, ["verdict", "body", "extent", "request"], "Review change"));
  form.all().find(node => node.name === "field:verdict")!.value = "approve";
  form.event("submit");
  expect((sent[0] as unknown[])[2]).toEqual({ manifest: "12", request: "6", extent: "docs", verdict: "approve" });
  const captured = { scope: lane, member, request: 6 };
  expect(reviewSelectionProblem(room, { ...requested, requests: [...requested.requests, request(9)] }, 12, "docs", captured)).toBeNull();
  expect(reviewSelectionProblem(room, { ...requested, requests: [request(6, member, "met")] }, 12, "docs", captured)).toContain("no longer open");
  expect(reviewSelectionProblem(room, { ...requested, requests: [request(6, { ...member, membership: { ...membership, inc: newIncarnation(new Uint8Array(16).fill(3)) } })] }, 12, "docs", captured)).toContain("no longer open");
  const multiple = changeTaskContext({ ...requested, requests: [request(6), request(9)] }, room);
  expect(multiple.defaults["review-verdict"]!.fields?.["request"]).toBeUndefined();
  expect(multiple.choices["review-verdict"]!["request"]!.map(choice => choice.value)).toEqual(["6", "9"]);
  const choiceSent: unknown[] = [];
  const choiceForm = asElement(taskForm(actualReview, (...args) => choiceSent.push(args), multiple, ["verdict", "body", "extent", "request"], "Review change"));
  const chooser = choiceForm.all().find(node => node.name === "field:request")!;
  expect(chooser.tag).toBe("select"); expect(chooser.hasAttribute("required")).toBe(true);
  chooser.value = "9"; choiceForm.all().find(node => node.name === "field:verdict")!.value = "approve"; choiceForm.event("submit");
  expect((choiceSent[0] as unknown[])[2]).toMatchObject({ request: "9" });
  const unavailable = asElement(taskForm({ ...actualReview, fields: actualReview.fields.filter(field => field.name !== "request") }, () => expect.fail("schema cannot bind"), context, ["verdict", "body", "extent", "request"], "Review change"));
  expect(unavailable.hasAttribute("data-act")).toBe(false);
  expect(changeTaskContext(requested, { ...room, me: null }).choices["review-verdict"]!["request"]).toEqual([]);

  expect(reviewSelectionProblem(room, requested, 12, "docs", { ...captured, request: undefined })).toContain("Choose which review request");
  const voluntary = changeTaskContext({ ...requested, requests: [] }, room);
  expect(voluntary.defaults["review-verdict"]!.fields?.["request"]).toBe("");
  const plain = asElement(taskForm(actualReview, () => {}, voluntary, ["verdict", "body", "extent", "request"], "Review change"));
  expect(plain.textContent).toContain("Voluntary review");
  expect(reviewSelectionProblem(room, requested, 12, "docs", { ...captured, request: null })).toBeNull();

});

test("Create issue asks for title and description and intentionally uses the title as its native condition", () => {
  const body = new Element("body");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElementNS: (_namespace: string, tag: string) => new Element(tag), createElement: (tag: string) => new Element(tag), body } });
  const open: Offered = { kind: "open-issue", step: "open", on: "lane", line: "Open", fields: [{ name: "definition", type: "digest", required: true, choices: [{ label: "Issue", value: "authenticated-definition" }] }, { name: "title", type: "text", required: true }, { name: "body", type: "text", required: false }, { name: "conditions", type: "list", required: true }] };
  const sent: unknown[] = [];
  const unavailable = asElement(createIssue({ ...open, fields: open.fields.map(field => field.name === "definition" ? { ...field, choices: [] } : field) }, (...args) => sent.push(args), {}));
  expect(unavailable.textContent).toBe("Create issue is unavailable: the room's active issue definition could not be read.");
  expect(unavailable.hasAttribute("data-task-act")).toBe(false);
  expect(sent).toEqual([]);
  const create = asElement(createIssue(open, (...args) => sent.push(args), {})); create.event("click");
  const form = body.all().find((node) => node.tag === "form")!;
  expect(form.all().filter((node) => node.tag === "label").map((node) => node.textContent)).toEqual(["Title", "Description"]);
  form.all().find((node) => node.name === "field:title")!.value = "Fix the handbook";
  form.all().find((node) => node.name === "field:body")!.value = "The introduction is missing.";
  form.event("submit");
  expect((sent[0] as unknown[]).slice(0, 3)).toEqual(["open-issue", "", { definition: "authenticated-definition", title: "Fix the handbook", body: "The introduction is missing.", conditions: '["Fix the handbook"]' }]);
});


test("Create issue keeps authenticated multiple-definition selection and submits the chosen digest with native conditions",()=>{
  const body=new Element("body");Object.defineProperty(globalThis,"document",{configurable:true,value:{createElementNS:(_namespace:string,tag:string)=>new Element(tag),createElement:(tag:string)=>new Element(tag),body}});
  const open:Offered={kind:"open-issue",step:"open",on:"lane",line:"Open",fields:[{name:"definition",type:"digest",required:true,choices:[{label:"Issue v1",value:"first-authenticated"},{label:"Issue v2",value:"second-authenticated"}]},{name:"title",type:"text",required:true},{name:"body",type:"text",required:false},{name:"conditions",type:"list",required:true}]};
  const sent:unknown[]=[];const create=asElement(createIssue(open,(...args)=>sent.push(args),{}));expect(create.hasAttribute("data-task-act")).toBe(true);create.event("click");
  const form=body.all().find(e=>e.tag==="form")!;const select=form.all().find(e=>e.name==="field:definition")!;expect(select.tag).toBe("select");select.value="second-authenticated";
  form.all().find(e=>e.name==="field:title")!.value="Chosen issue";form.event("submit");
  expect((sent[0]as unknown[]).slice(0,3)).toEqual(["open-issue","",{definition:"second-authenticated",title:"Chosen issue",conditions:'["Chosen issue"]'}]);
  const unavailable=asElement(createIssue({...open,fields:[...open.fields,{name:"custom",type:"text",required:true}]},()=>{},{}));expect(unavailable.hasAttribute("data-task-act")).toBe(false);
});

test("the next task follows the selected file's recorded requirements and current candidate authority", () => {
  const change = { state: "open", author: "@author", currentManifest: 12,
    manifests: [{ id: 12, state: "current", authors: ["@author"], file: { path: "AGENTS.md" } }],
    reviews: [], rules: { approvals: 0, extents: [
      { name: "rules", approvals: 1, approver: "rules.publish", checks: [], class: "authority" },
      { name: "source", approvals: 0, approver: "change.review", checks: [], class: "content" },
    ] }, reviewMembersByExtent: { rules: [{ label: "@controller", value: "@controller" }], source: [{ label: "@reader", value: "@reader" }] },
    // Synthetic presentation input; task-data proves the actual native binding.
    reviewPolicy: { manifest: 12, source: { at: { scope: "rules", kind: "rules", inc: "one" }, seq: 1, hash: "hash" }, extents: [
      { name: "rules", patterns: ["AGENTS.md"], approvals: 1, approver: "rules.publish", checks: [], class: "authority" },
      { name: "source", patterns: [], approvals: 0, approver: "change.review", checks: [], class: "content" },
    ] },
  } as unknown as ChangeView;
  const offered = ["merge", "request-review-own", "review-verdict"].map(kind => ({ kind, fields: [] })) as unknown as Offered[];
  const room = { me: { handle: "@author" } } as unknown as Room;
  const allowed = offered.map(act => act.kind);
  expect(nextChangeAction(room, change, offered, allowed)?.kind).toBe("request-review-own");
  expect(requestedReviewCandidates(change)).toEqual(change.reviewMembersByExtent?.["rules"]);
  const content = { ...change, manifests: [{ ...change.manifests[0]!, file: { ...change.manifests[0]!.file!, path: "README.md" } }] };
  expect(nextChangeAction(room, content, offered, allowed)?.kind).toBe("merge");
  expect(requestedReviewCandidates(content)).toEqual(change.reviewMembersByExtent?.["source"]);
  expect(nextChangeAction(room, { ...content, reviewPolicy: null }, offered, allowed)).toBeNull();
  expect(nextChangeAction(room, { ...content, reviewPolicy: { ...content.reviewPolicy!, manifest: 11 } }, offered, allowed)).toBeNull();
  const stranger = { me: { handle: "@unqualified" } } as unknown as Room;
  expect(nextChangeAction(stranger, change, offered.filter(act => act.kind === "review-verdict"), allowed)).toBeNull();
  expect(nextChangeAction(room, { ...change, state: "closed" }, offered, allowed)).toBeNull();
});

test("one authenticated reviewer is named directly without a false picker", () => {
  const request: Offered = { kind: "request-review-own", step: "open", on: "review-request", line: "Request review", fields: [{ name: "requested", type: "member", required: true }] };
  const sent: unknown[] = [];
  const form = asElement(taskForm(request, (...args) => sent.push(args), { choices: { "request-review-own": { requested: [{ label: "@controller", value: "@controller" }] } } }, ["requested"], "Request review"));
  expect(form.all().filter(node => node.tag === "select")).toEqual([]);
  expect(form.all().find(node => node.tag === "button")?.textContent).toBe("Request review from @controller");
  form.event("submit");
  expect(sent[0]).toEqual(["request-review-own", "", { requested: "@controller" }]);
});

test("a refused creation keeps its draft editable; unknown creation offers a read-only status check without another send", () => {
  const body = new Element("body");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElementNS: (_namespace: string, tag: string) => new Element(tag), createElement: (tag: string) => new Element(tag), body, querySelectorAll: (selector: string) => body.querySelectorAll(selector) } });
  const open: Offered = { kind: "open-issue", step: "open", on: "lane", line: "Open", fields: [{ name: "definition", type: "digest", required: true, choices: [{ label: "Issue", value: "native-pin" }] }, { name: "title", type: "text", required: true }, { name: "conditions", type: "list", required: true }] };
  const sent: unknown[] = [];
  let reads = 0;
  const creator = asElement(createIssue(open, (...args) => sent.push(args), { draftKey: "creation-original-context", current: () => true, refresh: () => reads++ }));
  creator.event("click");
  const dialog = body.all().find(node => node.tag === "dialog")!;
  const form = dialog.all().find(node => node.tag === "form")!;
  const footer = form.all().find(node => node.attrs.get("class") === "form-footer dialog-controls")!;
  expect(footer.children.map(node => typeof node === "string" ? node : node.textContent)).toEqual(["Create issue", "Cancel"]);
  expect(form.all().filter(node => node.tag === "button" && node.attrs.get("type") === "submit")).toHaveLength(1);
  form.all().find(node => node.name === "field:title")!.value = "Keep these words";
  form.event("input"); form.event("submit");
  issueDialogOutcome("creation-original-context", "editable", "The native request was refused.");
  expect(form.all().find(node => node.name === "field:title")?.value).toBe("Keep these words");
  expect(form.all().find(node => node.tag === "button")?.hasAttribute("disabled")).toBe(false);
  issueDialogOutcome("creation-original-context", "unknown", "The original request remains unknown.");
  form.event("submit");
  expect(sent).toHaveLength(1);
  dialog.all().find(node => node.hasAttribute("data-check-original"))!.event("click");
  expect([reads, sent.length, dialog.closed]).toEqual([1, 1, true]);
});
