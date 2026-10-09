import { afterEach, expect, test, vi } from "vitest";
import type { Answer } from "@generalbusiness/artroom-contract";
import type { ChangeView, Room } from "../src/data.ts";
import { changeCondition, changeScreen, issueScreen, rulesScreen } from "../src/view.ts";

// A DOM-construction stand-in, not a browser. It witnesses the facts the view
// exposes and link destinations; responsive layout is checked by the recorder.
class Element {
  readonly children: (Element | string)[] = [];
  readonly attributes: Record<string, string> = {};
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  append(...children: (Element | string)[]) { this.children.push(...children); }
  get textContent(): string { return this.children.map((c) => typeof c === "string" ? c : c.textContent).join(""); }
  all(tag: string): Element[] { return [...(this.tagName === tag ? [this] : []), ...this.children.flatMap((c) => typeof c === "string" ? [] : c.all(tag))]; }
}
const document = { createElement: (tag: string) => new Element(tag) };
afterEach(() => vi.unstubAllGlobals());
const room = { key: "ed25519:member", me: { handle: "@member", role: "controller" }, reader: {}, directory: "sc_directory" } as unknown as Room;
const head = { seq: 42, hash: "sha256:recorded-head" };
const view = (over: Partial<ChangeView> = {}): ChangeView => ({
  scope: "sc_change", definition: "sha256:definition", head, number: 7, title: "Improve guide", body: null, state: "open", author: "@author",
  manifests: [{ id: 12, state: "current", integrator: "@author", authors: ["@author"], base: "base-full", integration: null, tree: null, complete: true, file: { path: "guide.md", digest: "sha256:full-file-digest", size: 48, page: "https://example.test/HEAD/guide.md" } }],
  reviews: [], requests: [], jobs: [], links: [], merges: [], rules: null, comments: [], ...over,
}) as ChangeView;
const merge = (over: Partial<ChangeView["merges"][number]> = {}): ChangeView["merges"][number] => ({ id: 15, state: "unknown", manifest: 12, reason: null, commit: null,
  publication: { id: 16, state: "unresolved", reason: null, operations: [{ id: "17:0", kind: "push", attempts: ["confirmed"] }] }, ...over });
const render = (change: ChangeView, last: Answer | null = null, kind?: string): Element => { vi.stubGlobal("document", document); return changeScreen(room, change, last, kind) as unknown as Element; };

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
  expect(rules.textContent.match(/AGENTS.md/g)).toHaveLength(1);
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
