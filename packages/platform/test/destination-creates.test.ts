import { expect, test } from "vitest";
import type { OperationId } from "@generalbusiness/artroom-contract";
import { factRefOf } from "@generalbusiness/artroom-bytes";
import { destinationReceipt, firstHeadCommit } from "../src/destination.ts";
import { Branch, HEAD, OTHER, said } from "./support-destination.ts";
import { t } from "@generalbusiness/artroom-derive/testing";

// Real destination rules and derive judges, in memory. The bureau, claim
// and host answers are hand-written; no host, port or founding is reached.
const WRITTEN = ["write", null, null];
const BAD_INPUT = ["refused", "bad-input", null];
const kinds = (b: Branch) => Object.fromEntries(b.last.effects.flatMap((effect) => effect.effect === "operation" ? [[effect.kind, `${b.head.seq}:${effect.k}` as OperationId]] : []));
const TOKEN = { token: "first-head-token", ends: t(600) };

for (const format of ["sha1", "sha256"] as const) test(`first-head ${format} compares the exact founding commit, releases its token, opens the receipt with its stable operation fact, and starts the oldest queued judge`, () => {
  const b = new Branch(false).confirmed();
  b.reserve();
  const queued = b.head.seq;
  const write = b.state.operation("0:0")!;
  const expected = firstHeadCommit(b.state, b.own, write, format);
  expect(said(b.answered("0:1", 1, "confirmed", TOKEN))).toEqual(WRITTEN);
  expect(said(b.answered(write.id, 1, "confirmed", { send: "accepted", seen: expected }))).toEqual(WRITTEN);
  const receipt = b.item(b.head.seq);
  expect([b.branch.state, b.branch.values["head"], b.branch.values["token"], receipt.type, receipt.values["commit"], receipt.values["opening"], b.branch.refs["judging"]]).toEqual(["ready", expected, null, "receipt", expected, 0, queued]);
  expect(b.opened.map(([kind]) => kind)).toEqual(["revoke", "receipt", "mint", "judge"]);
  const first = kinds(b);
  const made = destinationReceipt(b.state, b.own, receipt, format);
  expect(made.file).toEqual({ v: 1, first: factRefOf(b.last), claim: b.branch.refs["claim"], commit: expected });
  expect(made.ref).toBe(`refs/artroom/receipts/${b.fact(0).hash.slice(7)}`);
  expect(said(b.answered(first["receipt"]!, 1, "confirmed", { send: "accepted", seen: made.commit }))).toEqual(WRITTEN);
  expect(b.item(receipt.id).state).toBe("written");
});

test("a first-head absent ref opens each next mint through the third attempt, while another writer's commit leaves the branch empty", () => {
  const b = new Branch(false).confirmed();
  for (const attempt of [1, 2, 3]) {
    expect(said(b.answered("0:0", attempt, "refused", { send: "not-sent", seen: "absent" }))).toEqual(WRITTEN);
    expect(b.opened.map(([kind]) => kind)).toEqual(attempt < 3 ? ["mint"] : []);
  }
  expect([b.branch.state, b.state.count("receipt", "owed"), b.state.operation("0:0")!.attempts.length]).toEqual(["empty", 0, 3]);
  const other = new Branch(false).confirmed();
  expect(said(other.answered("0:0", 1, "confirmed", { send: "accepted", seen: OTHER }))).toEqual(WRITTEN);
  expect([other.branch.state, other.branch.values["head"], other.opened]).toEqual(["empty", null, []]);
});

test("a first-head deciding read opens the same receipt without settling its unknown attempt, and a late own answer opens no second receipt", () => {
  const b = new Branch(false).confirmed();
  const expected = firstHeadCommit(b.state, b.own, b.state.operation("0:0")!, "sha1");
  expect(said(b.lost("0:0", 1))).toEqual(WRITTEN);
  const read = kinds(b)["read"]!;
  expect(said(b.answered(read, 1, "confirmed", { seen: "absent" }))).toEqual(BAD_INPUT);
  expect(said(b.answered(read, 1, "confirmed", { seen: expected }))).toEqual(WRITTEN);
  expect([b.branch.state, b.state.operation("0:0")!.attempts[0]!.outcomes.map(({ result }) => result), b.state.count("receipt", "owed")]).toEqual(["ready", ["unknown"], 1]);
  expect(said(b.answered("0:0", 1, "confirmed", { send: "accepted", seen: expected }))).toEqual(WRITTEN);
  expect([b.opened, b.state.count("receipt", "owed")]).toEqual([[], 1]);
});

test("an imported first head compares the update's exact commit, not an arbitrary read-back commit", () => {
  const b = new Branch(true).confirmed();
  b.imported("done", HEAD);
  const first = kinds(b)["first-head"]!;
  expect(firstHeadCommit(b.state, b.own, b.state.operation(first)!, "sha1")).toBe(HEAD);
  expect(said(b.answered(first, 1, "refused", { send: "refused", seen: OTHER }))).toEqual(WRITTEN);
  expect([b.branch.state, b.state.count("receipt", "owed")]).toEqual(["empty", 0]);
  const confirmed = new Branch(true).confirmed();
  confirmed.imported("done", HEAD);
  expect(said(confirmed.answered(kinds(confirmed)["first-head"]!, 1, "confirmed", { send: "accepted", seen: HEAD }))).toEqual(WRITTEN);
  expect([confirmed.branch.state, confirmed.branch.values["head"], confirmed.state.count("receipt", "owed")]).toEqual(["ready", HEAD, 1]);
});
