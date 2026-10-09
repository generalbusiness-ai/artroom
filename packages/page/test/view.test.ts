import { afterEach, expect, test, vi } from "vitest";
import type { Answer } from "@generalbusiness/artroom-contract";
import type { ChangeView, Room } from "../src/data.ts";
import { changeCondition, changeScreen, issueScreen, roomScreen, rulesScreen } from "../src/view.ts";
import type { ListState } from "../src/list-context.ts";

// A DOM-construction stand-in, not a browser. It witnesses the facts the view
// exposes and link destinations; responsive layout is checked by the recorder.
class Element {
  readonly children: (Element | string)[] = [];
  readonly attributes: Record<string, string> = {};
  readonly listeners = new Map<string, () => void>();
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  append(...children: (Element | string)[]) { this.children.push(...children); }
  replaceChildren(...children: (Element | string)[]) { this.children.splice(0, this.children.length, ...children); }
  addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
  fire(name: string) { this.listeners.get(name)?.(); }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  get value() { return this.attributes["value"] ?? ""; }
  set value(value: string) { this.attributes["value"] = value; }
  querySelectorAll(tag: string) { return this.all(tag); }
  get textContent(): string { return this.children.map((c) => typeof c === "string" ? c : c.textContent).join(""); }
  all(tag: string): Element[] { return [...(this.tagName === tag ? [this] : []), ...this.children.flatMap((c) => typeof c === "string" ? [] : c.all(tag))]; }
}
const document = { createElement: (tag: string) => new Element(tag) };
afterEach(() => vi.unstubAllGlobals());
const room = { key: "ed25519:member", me: { handle: "@member", role: "controller" }, reader: {}, directory: "sc_directory", session: { service: "https://room.test" } } as unknown as Room;
const head = { seq: 42, hash: "sha256:recorded-head" };
const view = (over: Partial<ChangeView> = {}): ChangeView => ({
  scope: "sc_change", definition: "sha256:definition", head, number: 7, title: "Improve guide", body: null, state: "open", author: "@author",
  manifests: [{ id: 12, state: "current", integrator: "@author", authors: ["@author"], base: "base-full", integration: null, tree: null, complete: true, file: { path: "guide.md", digest: "sha256:full-file-digest", size: 48, page: "https://example.test/HEAD/guide.md" } }],
  reviews: [], requests: [], jobs: [], links: [], merges: [], rules: null, comments: [], ...over,
}) as ChangeView;
const merge = (over: Partial<ChangeView["merges"][number]> = {}): ChangeView["merges"][number] => ({ id: 15, state: "unknown", manifest: 12, reason: null, commit: null,
  publication: { id: 16, state: "unresolved", reason: null, operations: [{ id: "17:0", kind: "push", attempts: ["confirmed"] }] }, ...over });
const render = (change: ChangeView, last: Answer | null = null, kind?: string): Element => { vi.stubGlobal("document", document); return changeScreen(room, change, last, kind) as unknown as Element; };

test("list handlers restore query and filter through detail/back while literal query text remains an input value", () => {
  vi.stubGlobal("document", document);
  let kept: ListState = { query: "", filter: "open" };
  const lanes = { issues: [{ scope: "sc_issue", number: 12, kind: "issue", title: "<script>Guide</script>", state: "closed", draft: false }], changes: [] } as never;
  const show = () => roomScreen(room, lanes, "issue", { state: kept, changed: (next) => { kept = next; } }) as unknown as Element;
  const first = show();
  first.all("button").find((button) => button.attributes["data-filter"] === "closed")!.fire("click");
  const query = first.all("input")[0]!; query.value = "<script>Guide"; query.fire("input");
  const returned = show();
  expect(returned.all("input")[0]!.value).toBe("<script>Guide");
  expect(returned.all("button").find((button) => button.attributes["data-filter"] === "closed")!.attributes["aria-pressed"]).toBe("true");
  expect(returned.textContent).toContain("<script>Guide</script>");
  expect(returned.all("script")).toEqual([]);
  kept = { query: "", filter: "open" };
  expect(show().textContent).toContain("No matches.");
});

test("one current condition follows the selected version, never an internally confirmed operation or an older version", () => {
  expect(changeCondition(view({ merges: [merge()] }))).toBe("Awaiting confirmation");
  expect(changeCondition(view(), { answer: "refused", reason: "unauthorized" } as never)).toBe("Open");
  expect(changeCondition(view({ merges: [merge({ state: "published", manifest: 11 })] }))).toBe("Open");
  const screen = render(view({ merges: [merge({ state: "published", commit: "exact-published-commit" })] }));
  expect(screen.all("span").filter((e) => e.attributes["class"]?.includes("condition")).map((e) => e.textContent)).toEqual(["Merged"]);
  expect(screen.textContent.match(/Merged/g)).toHaveLength(1);
  expect(screen.all("a").some((e) => e.attributes["href"] === "https://example.test/HEAD/guide.md")).toBe(false);
  expect(screen.textContent).toContain("Rendering this published version is not available yet.");
});

test("ordinary screens omit empty record panels while inspection preserves full subject, refusal and outside-operation evidence", () => {
  const screen = render(view({ merges: [merge({ state: "refused", reason: "rules-not-met:protected", publication: { id: 16, state: "not-reserved", reason: "authority-lost", operations: [{ id: "17:0", kind: "push", attempts: ["unknown", "refused"] }] } })] }));
  expect(screen.textContent).not.toContain("None.");
  expect(screen.all("h2").map((e) => e.textContent)).not.toContain("Review requests");
  expect(screen.all("h2").map((e) => e.textContent)).not.toContain("Comments (0)");
  const record = screen.all("details")[0]!;
  for (const evidence of ["sc_change", "sha256:definition", "sha256:recorded-head", "sha256:full-file-digest", "rules-not-met:protected", "authority-lost", "17:0", "unknown, refused"]) expect(record.textContent).toContain(evidence);
  expect(screen.all("span").find((e) => e.attributes["class"]?.includes("condition"))?.textContent).toBe("Needs review");
});

test("issue and rules keep their subject once and move authority detail into inspection", () => {
  vi.stubGlobal("document", document);
  const issue = issueScreen(room, { scope: "sc_issue", definition: "sha256:issue-definition", head, title: "<script>unsafe</script>", number: 5, body: null, state: "open", requester: "@author", assignees: [], conditions: [], comments: [], closeReason: null } as never) as unknown as Element;
  expect(issue.all("h1")[0]!.textContent).toBe("<script>unsafe</script> #5");
  expect(issue.all("script")).toEqual([]);
  expect(issue.all("h2")).toEqual([]);
  expect(issue.all("details")[0]!.textContent).toContain("sha256:issue-definition");
  const rules = rulesScreen(room, { scope: "sc_rules", head, revision: 3, approvals: 1, ownerMayReview: false, singleControllerException: false, checks: [], labels: [], extents: [{ name: "protected", class: "rules", approvals: 1, approver: "rules.publish", checks: [], patterns: ["AGENTS.md"] }], definitions: [], controllers: ["@controller"] } as never) as unknown as Element;
  expect(rules.children.filter((child) => typeof child === "string" || child.tagName !== "details").map((child) => typeof child === "string" ? child : child.textContent).join("").match(/AGENTS.md/g)).toHaveLength(1);
  expect(rules.all("details")[0]!.textContent).toContain("rules.publish");
});

// A refused or unsettled comment is request evidence, not the lifecycle of a merge.
test("last comment outcomes do not become the change's current merge condition", () => {
  for (const answer of [
    { answer: "refused", reason: "dependency-unavailable" },
    { answer: "refused", reason: "guard-failed", name: "approvals-needed" },
    { answer: "unavailable", reason: "busy" },
  ] as Answer[]) {
    const screen = render(view(), answer, "comment");
    expect(screen.all("span").find((e) => e.attributes["class"]?.includes("condition"))?.textContent).toBe("Open");
    expect(screen.all("details")[0]!.textContent).not.toContain("The lane refused the merge");
  }
  expect(changeCondition(view(), { answer: "unavailable", reason: "busy" } as Answer, "merge")).toBe("Authority unavailable");
});

// Settled requirements are evidence, not another default-home panel.
test("merged requirements stay in inspection; active requirements use only the recorded file's matching extent", () => {
  const rules = { revision: 29, approvals: 1, ownerMayReview: false, checks: [], extents: [
    { name: "protected", patterns: ["AGENTS.md"], class: "authority", approvals: 1, approver: "rules.publish", checks: [] },
    { name: "content", patterns: [], class: "content", approvals: 1, approver: "change.review", checks: [] },
  ] };
  const routineText = (screen: Element) => screen.children.filter((child) => typeof child === "string" || child.tagName !== "details").map((child) => typeof child === "string" ? child : child.textContent).join("");
  const merged = render(view({ rules, merges: [merge({ state: "published" })] }));
  expect(routineText(merged)).not.toContain("Review requirements");
  expect(routineText(merged)).not.toContain("Not recorded");
  const record = merged.all("details")[0]!;
  for (const fact of ["protected", "content", "rules.publish", "change.review", "Lane-held rules update 29"]) expect(record.textContent).toContain(fact);
  const active = render(view({ rules }));
  expect(routineText(active)).toContain("content · 0 of 1 approvals recorded");
  expect(routineText(active)).not.toContain("protected");
  expect(routineText(render(view({ rules: { ...rules, extents: rules.extents.map((extent) => ({ ...extent, approvals: 0 })) } })))).not.toContain("Review requirements");
});

// Source is selected-version text from the verified projection, never HEAD or HTML.
test("source preview preserves the selected manifest identity and treats markup as text", () => {
  const current = view().manifests[0]!;
  const source = "<script>window.pwned = true</script>\n# Selected content";
  const selected = { ...current, file: { ...current.file!, content: source } };
  const older = { ...current, id: 11, state: "superseded", file: { ...current.file!, content: "Older content", digest: "sha256:older" } };
  const screen = render(view({ manifests: [older, selected] }));
  const preview = screen.all("details").find((node) => node.attributes["class"] === "source-preview")!;
  expect(preview.all("summary")[0]!.textContent).toBe("Preview source");
  expect(preview.textContent).toContain("Version 12 · guide.md");
  expect(preview.textContent).toContain("sha256:full-file-digest");
  expect(preview.all("pre")[0]!.textContent).toBe(source);
  expect(preview.textContent).not.toContain("Older content");
  expect(screen.all("script")).toEqual([]);
  expect(screen.all("a").some((node) => node.attributes["href"] === selected.file.page)).toBe(false);
  expect(render(view()).all("details").some((node) => node.attributes["class"] === "source-preview")).toBe(false);
  expect(render(view({ manifests: [{ ...selected, file: { ...selected.file, content: "" } }] })).all("pre")[0]!.textContent).toBe("");
});

test("published latest-page navigation is explicitly distinct from selected source preview", () => {
  const current = view().manifests[0]!;
  const selected = { ...current, file: { ...current.file!, path: "docs/a page.md", content: "Exact selected source" } };
  const screen = render(view({ manifests: [selected], merges: [merge({ state: "published" })] }));
  const page = screen.all("a").find((node) => node.textContent === "Open latest page")!;
  expect(page.attributes["href"]).toBe("https://room.test/site/sc_directory/HEAD/docs/a%20page.md");
  expect(screen.all("a").some((node) => node.textContent === "Open page")).toBe(false);
  const preview = screen.all("details").find((node) => node.attributes["class"] === "source-preview")!;
  expect(preview.textContent).toContain("Version 12 · docs/a page.md");
  expect(preview.all("pre")[0]!.textContent).toBe("Exact selected source");
  expect(render(view({ manifests: [selected] })).all("a").some((node) => node.textContent === "Open latest page")).toBe(false);
  expect(render(view({ manifests: [{ ...selected, file: { ...selected.file, path: "../outside.md" } }], merges: [merge({ state: "published" })] })).all("a").some((node) => node.textContent === "Open latest page")).toBe(false);
});

test("editable rules omit the routine readonly copy while preserving full authority in inspection", () => {
  vi.stubGlobal("document", document);
  const screen = rulesScreen(room, { scope: "sc_rules", head, revision: 29, approvals: 1, ownerMayReview: false, singleControllerException: false, checks: [{ name: "build", required: true }], labels: [], extents: [{ name: "protected", class: "authority", approvals: 1, approver: "rules.publish", checks: ["build"], patterns: ["AGENTS.md"] }], definitions: [], controllers: ["@controller"] } as never, true) as unknown as Element;
  expect(screen.children.filter((node) => typeof node !== "string" && node.tagName === "section")).toEqual([]);
  const record = screen.all("details")[0]!;
  for (const fact of ["29", "protected", "authority", "rules.publish", "AGENTS.md", "build"]) expect(record.textContent).toContain(fact);
});
