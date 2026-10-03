/**
 * Writes the declared-acts stage 3 fixtures, test/fixtures/declared-*.json:
 * room-signed logs that the simulator in test/support/declared-room.ts
 * admitted the way the Room's admission does. Each is small and named for
 * what it proves; the forged variants are made from them in the tests.
 *
 *   node scripts/declared-fixtures.ts
 *
 * - declared-activates-kind: a v2 room whose landed policy change activates
 *   a document adding the kind `standup` and changing `note`'s meaning,
 *   with an act of the new kind; refuse, require, land and notify calls;
 *   the room's repository objects.
 * - declared-refusals: recorded refusals at each place admission stops: a
 *   refuse rule, a platform guard after the refuse rules (`outside-claim`),
 *   a platform guard before any policy (`obligation-open`), and a landing
 *   refused by a recomputation's failed `require`.
 * - declared-legacy-recovery: the legacy recovery sequence of note 3.2 in
 *   a v1 room: claim with purpose config-recovery, propose of an
 *   `.artroom/` change, the sole admin's flagged approval, land, its
 *   outcome, the activation of a v2 document, and the thread's release as
 *   a `recover` op.
 * - declared-two-steps: a log spanning two steps versions, the second a
 *   test-only name with the first's semantics.
 * - declared-profile: a document naming an evaluator profile no verifier
 *   carries yet.
 * - declared-check-prepared: a check whose integration a `prepared` event
 *   names.
 * - declared-grants: grants across the first v2 activation (R-DECL-17): a
 *   v1-era `*` delegation used for `renew` after it, a v2 grant with a
 *   signed map used for a `note`, and a room-custody invitation whose
 *   session names a binding.
 */

import { writeFileSync } from "node:fs";
import type { ActDeclaration, Authority, CheckerConfigV2, OpId, PolicyDocument, PolicyDocumentV2, Sha } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, bindingOf, policy, requireCheck, requireReview, rule, validatePolicyV2 } from "@generalbusiness/artroom-policy";
import { digestJson } from "../src/crypto.ts";
import { DeclaredRoom, pair, type Fixture } from "../test/support/declared-room.ts";
import { keys } from "../test/support/room-sim.ts";

const alice = keys.alice;
const bob = keys.bob;
const carol = pair(6);

const v2 = (base: PolicyDocument, acts: Readonly<Record<string, ActDeclaration>> = CODE_REVIEW_ACTS, steps = "artroom-steps-v1"): PolicyDocumentV2 =>
  ({ ...base, format: "artroom-policy-v2", steps, acts }) as unknown as PolicyDocumentV2;

function valid(doc: PolicyDocumentV2, checkers: Record<string, unknown> = {}): PolicyDocumentV2 {
  const r = validatePolicyV2({ ...doc, steps: "artroom-steps-v1" }, { checkers });
  if (!r.ok) throw new Error(`invalid fixture document: ${r.problems.join("; ")}`);
  return doc;
}

const opOf = (e: { entry: { entry: unknown } }): OpId => {
  const receipt = (e.entry.entry as { receipt: { effects: { type: string; op?: OpId }[] } }).receipt;
  return receipt.effects.find((x) => x.type === "land-op")!.op!;
};

function write(name: string, f: Fixture) {
  writeFileSync(new URL(`../test/fixtures/${name}.json`, import.meta.url), JSON.stringify(f, null, 1) + "\n");
  console.log(`${name}: ${f.entries.length} entries, ${f.retained.length} retained files, ${Object.keys(f.repo).length} repository objects`);
}

// ------------------------------------------------------- declared-activates-kind

const RULES_A = [
  rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', reason: "A claim on ** covers the whole repository.", fix: "Claim only the paths you will change." }),
  rule({ id: "no-wip", on: "propose", refuse: '$contains(act.body.summary, "WIP")', reason: "Work in progress is not proposed.", fix: "Propose when it is ready." }),
  requireReview({ paths: "src/**", from: "@alice", id: "src-review" }),
  rule({ id: "freeze", kind: "land", block: "false", reason: "Not on a freeze.", fix: "Wait for the freeze to end." }),
  rule({ id: "holder-sees", kind: "notify", on: ["claim", "propose", "review", "land"], to: ["holder"], why: "Your thread moved." }),
];
const DOC_A = valid(v2(policy(...RULES_A)));
const STANDUP: ActDeclaration = { label: "Stand-up", targets: { none: ["comment"] }, body: { text: { type: "text", max: 2048 } }, who: { roles: ["maintainer", "member", "agent"] } };
/** Rules on a declared kind: compiled as if on `note`, then pointed at `kind` (the v1 helper knows only the seven). */
const on = (kind: string, part: Parameters<typeof policy>[0]) => {
  const id = (part as unknown as { rules: { id: string }[] }).rules[0]!.id;
  return policy(part).rules.filter((r) => r.id === id).map((r) => ({ ...r, on: [kind] }));
};
const B = v2(policy(...RULES_A), { ...CODE_REVIEW_ACTS, note: { ...CODE_REVIEW_ACTS["note"]!, body: { text: { type: "text", max: 4096 } } }, standup: STANDUP });
const DOC_B = valid({
  ...B,
  rules: [
    ...B.rules,
    ...on("standup", rule({ id: "standup-text", on: "note", refuse: 'act.body.text = ""', reason: "A stand-up says something.", fix: "Write what you did." })),
    ...on("standup", rule({ id: "standups-to-members", kind: "notify", on: ["note"], to: ["role:member"], why: "A stand-up was posted." })),
  ],
} as unknown as PolicyDocumentV2);

{
  const room = new DeclaredRoom();
  await room.activate(DOC_A); // 1
  await room.join("@bob", "member", bob); // 2, 3
  const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "Add stand-ups", scope: ["src/**", ".artroom/**"] } }); // 4
  await room.drainNotify(); // 5
  const head = room.change({ "src/app.ts": "export const x = 2;\n", ".artroom/policy.json": JSON.stringify(DOC_B) });
  await room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head, summary: "Declare stand-ups" } }); // 6
  await room.drainNotify(); // 7
  await room.act({ signer: alice, kind: "review", target: { lane: claim.id, generation: 1 }, body: { head, verdict: "approve", scope: ["src/**", ".artroom/**"], text: "Approved." } }); // 8
  await room.drainNotify(); // 9
  const land = await room.act({ signer: bob, kind: "land", target: { lane: claim.id, generation: 1 }, body: { lease: 1, head } }); // 10
  await room.drainNotify(); // 11
  await room.land(opOf(land)); // 12 land-evaluated, 13 land-reserved, 14 land-outcome, 15 policy-activated (DOC_B)
  const standup = await room.act({ signer: bob, kind: "standup", target: null, body: { text: "The stand-up kind is live." } }); // 16
  await room.drainNotify(); // 17
  await room.act({ signer: bob, kind: "note", target: { act: standup.id }, body: { text: "First one." } }); // 18
  write("declared-activates-kind", room.fixture("A v2 room: a landed policy change activates a document that adds the kind standup and changes note's meaning; refuse, require, land and notify calls; the repository's objects."));
}

// ------------------------------------------------------------ declared-refusals

{
  const r1 = valid(
    v2(
      policy(
        rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', reason: "A claim on ** covers the whole repository.", fix: "Claim only the paths you will change." }),
        rule({ id: "no-wip", on: "propose", refuse: '$contains(act.body.summary, "WIP")', reason: "Work in progress is not proposed.", fix: "Propose when it is ready." }),
        requireReview({ paths: "src/**", from: "@alice", id: "needs-review", when: "true" }),
      ),
    ),
  );
  const r2 = valid(v2(policy(requireReview({ paths: "src/**", from: "@alice", id: "needs-review", when: '"yes"' }))));
  const room = new DeclaredRoom();
  await room.activate(r1); // 1
  await room.join("@bob", "member", bob); // 2, 3
  await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "Everything", scope: ["**"] } }); // 4: refused by narrow-claims
  const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**"] } }); // 5
  const outside = room.change({ "docs/guide.md": "# guide\n" });
  await room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head: outside, summary: "Docs" } }); // 6: outside-claim, after no-wip
  const head = room.change({ "src/app.ts": "export const x = 3;\n" });
  await room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head, summary: "Ready" } }); // 7
  await room.act({ signer: bob, kind: "land", target: { lane: claim.id, generation: 1 }, body: { lease: 1, head } }); // 8: obligation-open, before policy
  await room.activate(r2); // 9
  await room.recompute(); // 10: obligations-recomputed, blocked by policy-type-error
  await room.act({ signer: bob, kind: "land", target: { lane: claim.id, generation: 1 }, body: { lease: 1, head } }); // 11: refused with the block, before policy
  write("declared-refusals", room.fixture("Recorded refusals at each place admission stops: a refuse rule, outside-claim after the refuse rules, obligation-open before policy, and a landing refused by a recomputation's failed require."));
}

// ----------------------------------------------------- declared-legacy-recovery

{
  const lockout = policy(
    rule({ id: "frozen", on: ["claim", "propose", "review", "land", "release", "note"], refuse: "true", reason: "The room is frozen.", fix: "Ask an admin." }),
    rule({ id: "admins-see-claims", kind: "notify", on: ["claim"], to: ["role:admin"], why: "A thread was claimed." }),
  );
  const repaired = valid(v2(policy(rule({ id: "admins-see-claims", kind: "notify", on: ["claim"], to: ["role:admin"], why: "A thread was claimed." }))));
  const room = new DeclaredRoom();
  await room.activate(lockout); // 1: a v1 document that refuses every ordinary act
  await room.act({ signer: alice, kind: "claim", target: null, body: { goal: "Ordinary work", scope: ["src/**"] } }); // 2: refused by frozen
  const claim = await room.act({ signer: alice, kind: "claim", target: null, body: { goal: "Restore a working policy", scope: [".artroom/policy.json"], purpose: "config-recovery" } }); // 3
  await room.drainNotify(); // 4
  const head = room.change({ ".artroom/policy.json": JSON.stringify(repaired) });
  await room.act({ signer: alice, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head, summary: "Replace the frozen policy with declared acts." } }); // 5
  await room.act({ signer: alice, kind: "review", target: { lane: claim.id, generation: 1 }, body: { head, verdict: "approve", scope: [".artroom/**"], text: "Restores the default rules." } }); // 6: sole-admin-self-approval
  const land = await room.act({ signer: alice, kind: "land", target: { lane: claim.id, generation: 1 }, body: { lease: 1, head } }); // 7
  await room.land(opOf(land)); // 8 land-reserved, 9 land-outcome, 10 policy-activated (v2)
  await room.act({ signer: alice, kind: "recover", target: { lane: claim.id }, body: { op: "release", lease: 1 } }); // 11
  write("declared-legacy-recovery", room.fixture("The legacy recovery sequence of note 3.2: in a v1 room locked by its policy, claim with purpose config-recovery, propose of .artroom/policy.json, the sole admin's flagged approval, land, land-outcome, policy-activated of a v2 document, and the thread's release as a recover op."));
}

// ---------------------------------------------------------- declared-two-steps

{
  const s1 = valid(v2(policy(rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', reason: "A claim on ** covers the whole repository.", fix: "Claim only the paths you will change." }))));
  const s2 = { ...s1, steps: "artroom-steps-test2" } as unknown as PolicyDocumentV2;
  const room = new DeclaredRoom();
  await room.activate(s1); // 1
  await room.join("@bob", "member", bob); // 2, 3
  const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**"] } }); // 4
  await room.activate(s2); // 5: every binding changes
  await room.act({ signer: bob, kind: "note", target: { act: claim.id }, body: { text: "Under the second steps version." } }); // 6
  await room.act({ signer: bob, kind: "release", target: { lane: claim.id }, body: { lease: 1 } }); // 7
  write("declared-two-steps", room.fixture("A log spanning two steps versions: artroom-steps-v1, then the test-only artroom-steps-test2 with the same semantics under another name."));
}

// ------------------------------------------------------------ declared-profile

{
  const p = { ...v2(policy()), profile: "artroom-jsonata-v2" } as unknown as PolicyDocumentV2;
  const room = new DeclaredRoom();
  await room.activate(p); // 1
  await room.join("@bob", "member", bob); // 2, 3
  write("declared-profile", room.fixture("A document naming the evaluator profile artroom-jsonata-v2, which no verifier carries yet."));
}

// ---------------------------------------------------- declared-check-prepared

{
  const config: CheckerConfigV2 = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 600 };
  const doc = valid(v2(policy(requireCheck("test", { paths: "src/**", by: "@carol", id: "tests" }))), { test: config });
  const room = new DeclaredRoom();
  await room.activate(doc, { test: config }); // 1
  await room.join("@bob", "member", bob); // 2, 3
  await room.join("@carol", "checker", carol); // 4, 5
  const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**"] } }); // 6
  const head = room.change({ "src/app.ts": "export const x = 4;\n" });
  await room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head, summary: "Ready" } }); // 7
  const prepared = room.prepared(claim.id, 1); // 8
  const tree = ((prepared.entry as { event: { tree: Sha } }).event.tree);
  await room.act({
    signer: carol,
    kind: "check",
    target: { lane: claim.id, generation: 1 },
    body: { obligation: "obl_tests", check: "test", integration: head, input: { kind: "tree", tree }, config: digestJson(config), runner: `sha256:${"c".repeat(64)}`, volatile: false, ok: true, detail: "All tests pass." },
  }); // 9
  write("declared-check-prepared", room.fixture("A check whose integration and tree a prepared event names (R-DECL-20), under a v2 document with a v2 checker configuration."));
}

// ------------------------------------------------------------- declared-grants

{
  const dan = pair(7);
  const erin = pair(8);
  const grants = valid(v2(policy(), { ...CODE_REVIEW_ACTS, release: { ...CODE_REVIEW_ACTS["release"]!, who: { roles: ["maintainer", "member", "agent"], delegable: false } } }));
  const room = new DeclaredRoom();
  await room.activate(policy()); // 1: v1
  await room.join("@bob", "member", bob); // 2, 3
  const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**"] } }); // 4
  const old = await room.act({ signer: bob, kind: "roster", target: null, body: { op: "delegate", to: dan.key, kinds: "*", lanes: "*", expiresAt: room.at(5000) } }); // 5: a v1-era grant
  await room.activate(grants); // 6: the first v2 document
  const byOld: Authority = { via: "delegation", member: "@bob", role: "member", key: dan.key, delegation: old.id, grantor: bob.key } as Authority;
  await room.act({ signer: dan, kind: "renew", target: { lane: claim.id }, body: { lease: 1 }, delegation: old.id }, byOld); // 7: renew is still covered
  const grant = await room.act({
    signer: bob,
    kind: "roster",
    target: null,
    body: { op: "delegate", to: carol.key, kinds: ["renew"], acts: { note: await bindingOf(grants, "note"), claim: await bindingOf(grants, "claim") }, lanes: "*", expiresAt: room.at(5000) },
  }); // 8: a v2 grant, with its signed map
  const byGrant: Authority = { via: "delegation", member: "@bob", role: "member", key: carol.key, delegation: grant.id, grantor: bob.key } as Authority;
  await room.act({ signer: carol, kind: "note", target: { act: claim.id }, body: { text: "Delegated note." }, delegation: grant.id }, byGrant); // 9
  await room.act({
    signer: alice,
    kind: "roster",
    target: null,
    body: { op: "invite", member: "@erin", role: "agent", custody: "room", expiresAt: room.at(5000), secretHash: `sha256:${"e".repeat(64)}`, session: { kinds: [], acts: { note: await bindingOf(grants, "note") }, lanes: "*", ttlSeconds: 3600 } },
  }); // 10: a room-custody invitation whose session names a binding
  void erin;
  write("declared-grants", room.fixture("Grants across the first v2 activation (R-DECL-17): a v1-era * delegation used for renew after it, a v2 grant with a signed map used for a note, and a room-custody invitation whose session names a binding; release is not delegable."));
}
