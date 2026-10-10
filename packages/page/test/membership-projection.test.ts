import { expect, test } from "vitest";
import type { Item, ScopeRef } from "@generalbusiness/artroom-contract";
import { keyIdOfSecret, newIncarnation } from "@generalbusiness/artroom-bytes";
import { currentStanding, reviewCandidates } from "../src/membership-projection.ts";

// Made-up complete summary rows: this witnesses Page presentation, not a
// membership judgment, native grant, review decision or destination readiness.
const membership: ScopeRef = { scope: `sc_${"b".repeat(51)}a`, inc: newIncarnation(new Uint8Array(16).fill(2)), kind: "membership" };
const ref = (member: string) => ({ membership, member });
const keyId = (n: number) => keyIdOfSecret(new Uint8Array(32).fill(n));
const member = (id: number, handle: string, role = "member", controller?: string): Item => ({
  id, type: "member", state: "active", revision: 0, attributed: [], opened: `sha256:${"0".repeat(64)}`,
  parties: { member: ref(handle), controller: controller ? ref(controller) : null }, refs: {},
  values: { handle, role, kind: controller ? "agent" : "person" },
} as Item);
const key = (n: number, memberId: number, state = "active"): Item => ({
  id: 100 + n, type: "key", state, revision: 0, attributed: [], opened: `sha256:${"0".repeat(64)}`, parties: {}, refs: { member: memberId }, values: { id: keyId(n), kind: "device" },
} as Item);
const rows = (): Item[] => [
  { id: 0, type: "roster", state: "open", revision: 0, attributed: [], opened: `sha256:${"0".repeat(64)}`, parties: {}, refs: {}, values: {
    adminActions: ["change.review", "change.merge", "rules.publish"], maintainerActions: ["change.review", "change.merge"],
    memberActions: ["change.review"], agentActions: ["change.review", "change.comment"], checkerActions: [],
  } } as Item,
  member(1, "@author", "agent", "@owner"), key(1, 1), member(2, "@owner", "admin"), key(2, 2),
  member(3, "@reviewer"), key(3, 3), member(4, "@integrator", "maintainer"), key(4, 4),
  member(5, "@controller", "admin"), key(5, 5), member(6, "@unkeyed"),
  member(7, "@retired"), key(7, 7, "retired"), member(8, "@removed"), key(8, 8),
  member(9, "@agent", "agent", "@controller"), key(9, 9),
  member(10, "@orphan", "agent", "@unkeyed"), key(10, 10),
].map((item) => item.values["handle"] === "@removed" ? { ...item, state: "removed" } : item);
const extents = [
  // Actual lane-held rules projections omit patterns; the destination keeps
  // path classification. A full rules-scope extent is a different boundary.
  { name: "source", approvals: 0, approver: "change.review", checks: [], class: "content" },
  { name: "infrastructure", approvals: 1, approver: "change.merge", checks: [], class: "deployment" },
  { name: "rules", approvals: 1, approver: "rules.publish", checks: [], class: "authority" },
];

test("review choices require a live linked key, live agent controller, the selected extent grant and independence", () => {
  const projected = reviewCandidates(rows(), membership, [ref("@author")], false, extents)!;
  expect(projected.byExtent["source"]?.map((choice) => choice.value)).toEqual(["@reviewer", "@integrator", "@controller", "@agent"]);
  expect(projected.byExtent["infrastructure"]?.map((choice) => choice.value)).toEqual(["@integrator", "@controller"]);
  expect(projected.byExtent["rules"]?.map((choice) => choice.value)).toEqual(["@controller"]);
  // Zero required approvals do not make a supported real review unavailable.
  expect(projected.members!.map((choice) => choice.value)).toEqual(["@reviewer", "@integrator", "@controller", "@agent"]);
  const allowedOwner = reviewCandidates(rows(), membership, [ref("@author")], true, extents)!;
  expect(allowedOwner.byExtent["source"]?.map((choice) => choice.value)).toContain("@owner");
  expect(allowedOwner.byExtent["rules"]?.map((choice) => choice.value)).not.toContain("@owner");
});

test("a missing author-controller relation is unavailable, and foreign incarnation or missing role authority offers no invented choices", () => {
  const missing = rows().filter((item) => item.values["handle"] !== "@author");
  const independent = reviewCandidates(missing, membership, [ref("@author")], false, extents)!;
  expect(independent.byExtent["source"]).toBeNull();
  expect(independent.members).toBeNull();
  const exceptSource = reviewCandidates(missing, membership, [ref("@author")], true, extents)!;
  expect(exceptSource.byExtent["source"]?.length).toBeGreaterThan(0);
  expect(exceptSource.byExtent["rules"]).toBeNull();
  const foreign = { membership: { ...membership, inc: newIncarnation(new Uint8Array(16).fill(3)) }, member: "@author" };
  expect(reviewCandidates(rows(), membership, [foreign], false, extents)).toBeNull();
  const foreignController = rows().map<Item>((item) => item.values["handle"] === "@agent" ? { ...item, parties: { ...item.parties, controller: { ...foreign, member: "@controller" } } } : item);
  expect(reviewCandidates(foreignController, membership, [ref("@author")], false, extents)?.members?.map((choice) => choice.value)).not.toContain("@agent");
  expect(reviewCandidates(rows().filter((item) => item.type !== "roster"), membership, [ref("@author")], false, extents)).toBeNull();
  const unknownAction = [{ ...extents[0]!, approver: "unheld.approval" }];
  expect(reviewCandidates(rows(), membership, [ref("@author")], false, unknownAction)?.byExtent["source"]).toEqual([]);
  // Neither a different six-field source shape nor ambiguous/malformed held
  // requirements can supply reviewer choices at this boundary.
  expect(reviewCandidates(rows(), membership, [ref("@author")], false, [{ ...extents[0]!, patterns: [] }])).toBeNull();
  expect(reviewCandidates(rows(), membership, [ref("@author")], false, [extents[0]!, extents[0]!])).toBeNull();
  expect(reviewCandidates(rows(), membership, [ref("@author")], false, [{ ...extents[0]!, approvals: 65, checks: ["same", "same"] }])).toBeNull();
});

test("standing is recomputed from the current exact key link; retired keys and inactive controllers cannot carry cached permission", () => {
  const before = rows();
  expect(currentStanding(before, membership, keyId(9))?.actions).toEqual(["change.review", "change.comment"]);
  const controllerLost = before.map((item) => item.id === 105 ? { ...item, state: "retired" } : item);
  expect(currentStanding(controllerLost, membership, keyId(9))?.actions).toEqual(["change.comment"]);
  const ownLost = before.map((item) => item.id === 109 ? { ...item, state: "compromised" } : item);
  expect(currentStanding(ownLost, membership, keyId(9))).toBeNull();
  const moved = before.map((item) => item.id === 109 ? { ...item, refs: { member: 3 } } : item);
  expect(currentStanding(moved, membership, keyId(9))?.handle).toBe("@reviewer");
});
