import { expect, test } from "vitest";
import type { Answer, Entry } from "@generalbusiness/artroom-contract";
import { changeStates, operationsOf, type Merge, type ReviewRequest } from "../src/index.ts";

// Invariant: each of plan 016's states of a change is named from one record or answer, and only from it. The story on real scopes
// (`story.scope.test.ts`) reaches waiting for a reviewer, publication in progress, policy not met, publication confirmed, effect
// queued and effect confirmed. The cases here are those the story's stand-in host does not produce. Each view is MADE BY HAND.

const merge = (over: Partial<Merge>): Merge => ({ id: 30, state: "intended", manifest: 20, reason: null, commit: null, publication: null, ...over });
const request: ReviewRequest = { id: 12, state: "open", requested: "@paul", requester: "@una" };
const refusedBy = (reason: string, name?: string): Answer => ({ answer: "refused", reason, ...(name ? { name } : {}), judgedAt: { seq: 9, hash: "sha256:00" } }) as unknown as Answer;

test("an open request waits for its reviewer until a merge is published; a merge's lost and refused operations are effect unknown and effect refused", () => {
  const publication = { id: 40, state: "unresolved", reason: null, operations: [
    { id: "41:0", kind: "push", attempts: ["unknown" as const] },
    { id: "42:0", kind: "receipt", attempts: ["unknown" as const, "refused" as const] },
    { id: "43:0", kind: "revoke", attempts: [] },
  ] };
  expect(changeStates({ requests: [request], merges: [merge({ state: "unknown", publication })] }).map((s) => [s.state, s.detail])).toEqual([
    ["waiting for a reviewer", "@paul is asked to review, by @una (request 12)."],
    ["publication in progress", "Merge 30 is unknown; the destination's publication 40 is unresolved."],
    ["effect unknown", "push, operation 41:0, attempt 1: unknown."],
    ["effect refused", "receipt, operation 42:0, attempt 2: refused."],
    ["effect queued", "revoke, operation 43:0, no attempt yet."],
  ]);
  expect(changeStates({ requests: [request], merges: [merge({ state: "published", commit: "c".repeat(40) })] }).map((s) => s.state)).toEqual(["publication confirmed"]);
  const cleaned = { ...publication, state: "cleaned", operations: [] };
  expect(changeStates({ requests: [], merges: [merge({ state: "published", publication: cleaned })] }).map((s) => s.state)).toEqual(["publication confirmed"]);
  expect(changeStates({ requests: [], merges: [merge({ state: "refused", publication: cleaned })] })).toEqual([]);
  for (const state of ["cleanup-aborted", "cleanup-deleted", "cleanup-owed", "unresolved"]) {
    const live = { ...cleaned, state };
    if (state === "cleanup-deleted" || state === "cleanup-owed") expect(changeStates({ requests: [], merges: [merge({ state: "published", publication: live })] }).map((s) => s.state)).toEqual(["publication in progress", "publication confirmed"]);
    expect(changeStates({ requests: [], merges: [merge({ state: "unknown", publication: live })] }).map((s) => s.state)).toEqual(["publication in progress"]);
  }
});

test("unavailable authority is an answer of unavailable, a dependency that could not be read, or authority-lost; a refusal for a grant is none of these", () => {
  const none = { requests: [], merges: [] };
  expect(changeStates(none, { answer: "unavailable", reason: "dependency-unavailable" } as unknown as Answer).map((s) => s.state)).toEqual(["unavailable authority"]);
  expect(changeStates(none, refusedBy("dependency-unavailable")).map((s) => s.state)).toEqual(["unavailable authority"]);
  expect(changeStates({ requests: [], merges: [merge({ state: "refused", reason: "authority-lost" })] }).map((s) => s.state)).toEqual(["unavailable authority"]);
  expect(changeStates(none, refusedBy("unauthorized"))).toEqual([]);
  const unknown = changeStates(none, { answer: "unavailable", reason: "busy" })[0]!.detail;
  expect(unknown).toContain("Outcome unknown; no acceptance is confirmed");
  expect(unknown).toContain("same signed envelope");
  expect(unknown).toContain("this page does not retain it");
  expect(unknown).not.toMatch(/Nothing was written|same act may be sent again/);
});

test("policy not met names each extent the destination names, a path in no extent, or the lane's own approvals-needed; another reason is no policy state", () => {
  const refused = (reason: string) => changeStates({ requests: [], merges: [merge({ id: 7, state: "refused", reason })] }).map((s) => s.detail);
  expect(refused("rules-not-met:rules,source")).toEqual(["Merge 7 was not reserved: the rules are not met for the extents rules, source."]);
  expect(refused("rules-not-met")).toEqual(["Merge 7 was not reserved: a changed path is in no extent of the rules."]);
  expect(refused("out-of-date")).toEqual([]);
  expect(changeStates({ requests: [], merges: [] }, refusedBy("guard-failed", "approvals-needed")).map((s) => s.state)).toEqual(["policy not met"]);
});

test("an operation is named by the entry that opened it; an attempt in that entry names it by its ordinal, and `self` is the item that entry opens", () => {
  const entry = (seq: number, effects: unknown[]) => ({ seq, effects }) as unknown as Entry;
  const operations = operationsOf([
    entry(5, [{ effect: "open", item: 5, type: "publication", state: "queued" }, { effect: "operation", k: 0, owner: "platform:destination@1", kind: "judge", attempts: 3, for: "self" }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }]),
    entry(6, [{ effect: "attempt", operation: "5:0", attempt: 1, result: "confirmed", selected: null }, { effect: "operation", k: 0, owner: "platform:destination@1", kind: "push", attempts: 1, for: 5 }]),
    entry(7, [{ effect: "operation", k: 0, owner: "platform:destination@1", kind: "mint", attempts: 1 }]),
  ]);
  expect(operations).toEqual([
    { id: "5:0", kind: "judge", attempts: ["confirmed"], for: 5 },
    { id: "6:0", kind: "push", attempts: [], for: 5 },
    { id: "7:0", kind: "mint", attempts: [], for: null },
  ]);
});
