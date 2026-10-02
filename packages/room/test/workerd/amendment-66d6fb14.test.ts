/**
 * Amendment 66d6fb14 (docs/protocol.md section 28): for `propose`, policy
 * `refuse` rules run inside step 8, after R-PROP-1, R-PROP-3 and R-PROP-6
 * and before the claim check (R-PROP-4) and the remaining invariants. So a
 * proposal that adds jj conflict data outside its claim is refused by the
 * default pack's `jj-conflicts` rule, not `outside-claim`.
 */

import { describe, expect, it } from "vitest";
import type { Claim, PolicyDocument, Proposal } from "@generalbusiness/artroom-contract";
import { starterPolicy } from "@generalbusiness/artroom-policy/pack";
import { addMember, expectRefusal, makeRoom, pushChange } from "./support.ts";

const pack = (): PolicyDocument => starterPolicy({ owners: { "**": "@owner" } });

async function room(doc?: PolicyDocument) {
  const r = await makeRoom(doc ? { policy: doc } : {});
  const alice = await addMember(r, "@alice", "member");
  const c = await alice.ok<Claim>("claim", null, { goal: "fix the app", scope: ["src/**"] });
  return { r, alice, lane: c.lane };
}

/** jj stores a conflicted commit with `.jjconflict-side-*` and `.jjconflict-base-*` directories at the tree root. */
const conflicted = { "src/app.ts": "<<<<<<< conflict", ".jjconflict-side-0/src/app.ts": "v2", ".jjconflict-base-0/src/app.ts": "v1" };

describe("amendment 66d6fb14: refuse rules run before the claim check on propose", () => {
  it("a proposal adding .jjconflict-side-0/ outside its claim is refused with jj-conflicts, from the default policy pack, not outside-claim", async () => {
    const { r, alice, lane } = await room(pack());
    const head = pushChange(r, lane, conflicted);
    const refusal = expectRefusal(await alice.act("propose", { lane }, { lease: 1, expectedGeneration: 0, head, summary: "conflicted" }), "jj-conflicts");
    expect(refusal.fix).toMatch(/Resolve the jj conflicts/);
  });

  it("without the rule, the same proposal is refused by the claim check", async () => {
    const { r, alice, lane } = await room();
    const head = pushChange(r, lane, conflicted);
    expectRefusal(await alice.act("propose", { lane }, { lease: 1, expectedGeneration: 0, head, summary: "conflicted" }), "outside-claim");
  });

  it("under the pack, a path outside the claim with no jj conflict data is still outside-claim, and a proposal inside it is admitted", async () => {
    const { r, alice, lane } = await room(pack());
    const outside = pushChange(r, lane, { "docs/readme.md": "more" });
    expectRefusal(await alice.act("propose", { lane }, { lease: 1, expectedGeneration: 0, head: outside, summary: "outside" }), "outside-claim");
    const inside = pushChange(r, lane, { "src/app.ts": "v2" });
    await alice.ok<Proposal>("propose", { lane }, { lease: 1, expectedGeneration: 0, head: inside, summary: "inside" });
  });
});
