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
 *   with acts of the new kind, one after a team names its signer; refuse,
 *   require, land and notify calls; the room's repository objects.
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
 * - declared-carry: obligations, evidence and carrying across versions: a
 *   verdict carried to a second version by a carry rule, judged again at a
 *   recomputation, and read by the land input; a check carried onto the
 *   landing's integration by a `check-carried` event; an advisory check
 *   obligation; a verdict that does not carry because its scope changed;
 *   an objection, then an approval; reviewers in notify directories; and a
 *   check whose key is revoked as compromised before the landing.
 * - declared-carry-plain: a verdict carried by the platform's conditions
 *   alone, with no carry rule and so no recorded decision, and read by a
 *   land input.
 * - declared-snapshot: a scoped checker: a `prepared` event that records
 *   the snapshot commit for a landing's integration, a check on that
 *   commit, and the same on a second thread with no `prepared` event.
 *
 * `room.land` seals a `land-evaluated` event only when no blocking
 * obligation is open on the landing's integration, as the Room does. A call
 * below that is made while one is open seals nothing; its comment says so.
 * The tests show what the fold holds open there with an event they forge.
 */

import { writeFileSync } from "node:fs";
import type { ActDeclaration, Authority, CheckerConfigV2, OpId, PolicyDocument, PolicyDocumentV2, Sha } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, bindingOf, carry, checkerInputs, policy, requireCheck, requireReview, rule, validatePolicyV2 } from "@generalbusiness/artroom-policy";
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
  await room.act({ signer: alice, kind: "roster", target: null, body: { op: "team", team: "@core", members: ["@bob"] } }); // 19
  await room.act({ signer: bob, kind: "standup", target: null, body: { text: "Teams now count." } }); // 20: its actor input names the team
  await room.drainNotify(); // 21
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

// --------------------------------------------------------------- declared-carry

{
  const dave = pair(7);
  const erin = pair(8);
  const RUNNER = `sha256:${"c".repeat(64)}` as const;
  const test: CheckerConfigV2 = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 600, runner: RUNNER };
  const lint: CheckerConfigV2 = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 600, runner: RUNNER, advisory: true };
  const build: CheckerConfigV2 = { format: "artroom-checker-v2", act: "check", volatile: true, timeoutSeconds: 600, runner: RUNNER };
  const build2: CheckerConfigV2 = { ...build, timeoutSeconds: 900 };
  // A second checker with the test checker's configuration, digest for digest: a check counts only for its own checker.
  const audit: CheckerConfigV2 = { ...test };
  const rules = (libReviewers: string, audited = false) => [
    requireReview({ paths: "src/**", from: "@alice", id: "src-review" }),
    requireReview({ paths: "lib/**", from: libReviewers, id: "lib-review" }),
    requireReview({ paths: "docs/**", from: "role:maintainer", id: "docs-review", allowSelf: true }),
    requireCheck("test", { paths: "src/**", by: "@carol", id: "tests" }),
    requireCheck("lint", { paths: "src/**", by: "@carol", id: "lint" }),
    requireCheck("build", { paths: "src/**", by: "@carol", id: "build" }),
    ...(audited ? [requireCheck("audit", { paths: "src/**", by: "@carol", id: "audit" })] : []),
    carry({
      allow: [
        { id: "verdicts-carry", evidence: "review", allow: "true" },
        { id: "checks-carry", evidence: "check", allow: "true" },
      ],
    }),
    rule({ id: "reviewers-see", kind: "notify", on: ["propose", "review", "land"], to: ["reviewers"], why: "A version you reviewed moved." }),
  ];
  const freeze = rule({ id: "freeze", kind: "land", block: "false", reason: "Not on a freeze.", fix: "Wait for the freeze to end." });
  const c1 = valid(v2(policy(...rules("role:maintainer"))), { test, lint, build });
  const c2 = valid(v2(policy(...rules("role:maintainer"), freeze)), { test, lint, build });
  const later = { test, lint, build: build2, audit };
  const c3 = valid(v2(policy(...rules("@erin", true), freeze)), later);
  const c4 = valid(v2(policy(...rules("@erin", true), freeze, requireReview({ paths: "**", from: "@alice", id: "broken", when: '"yes"' }))), later);
  const c5 = valid(v2(policy(...rules("@erin", true), freeze, rule({ id: "admins-see-lands", kind: "notify", on: ["land"], to: ["role:admin"], why: "A landing started." }))), later);
  const check = (room: DeclaredRoom, name: "test" | "build", config: CheckerConfigV2, lane: string, generation: number, integration: Sha, ok = true, landOp?: OpId) => ({
    signer: carol,
    kind: "check",
    target: { lane, generation },
    body: {
      obligation: name === "test" ? "obl_tests" : "obl_build",
      check: name,
      integration,
      input: { kind: "tree", tree: room.treeOf(integration) },
      config: digestJson(config),
      runner: RUNNER,
      volatile: config.volatile,
      ok,
      detail: ok ? "Passed." : "Failed.",
      ...(landOp ? { landOp } : {}),
    },
  });
  const propose = (lane: string, expectedGeneration: number, head: Sha, summary: string, signer = bob) => ({ signer, kind: "propose", target: { lane }, body: { lease: 1, expectedGeneration, head, summary } });
  const review = (signer: typeof bob, lane: string, generation: number, head: Sha, verdict: "approve" | "object", scope: string[]) => ({ signer, kind: "review", target: { lane, generation }, body: { head, verdict, scope, text: verdict === "approve" ? "Approved." : "Not yet." } });
  const land = (lane: string, generation: number, head: Sha, signer = bob) => ({ signer, kind: "land", target: { lane, generation }, body: { lease: 1, head } });

  const room = new DeclaredRoom();
  await room.activate(c1, { test, lint, build });
  await room.join("@bob", "member", bob);
  await room.join("@carol", "checker", carol);
  await room.join("@dave", "maintainer", dave);
  await room.join("@erin", "maintainer", erin);

  // Thread 1: a verdict carried to a version with the same tree; checks counted by integration; a check carried onto
  // the landing's integration.
  const t1 = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**", "docs/**"] } });
  const h1 = room.change({ "src/app.ts": "export const x = 5;\n" });
  await room.act(propose(t1.id, 0, h1, "Five"));
  await room.drainNotify();
  await room.act(review(alice, t1.id, 1, h1, "approve", ["src/**"]));
  await room.drainNotify();
  await room.act(check(room, "test", test, t1.id, 1, h1));
  await room.act(check(room, "build", build, t1.id, 1, h1));
  const h2 = room.recommit(h1);
  await room.act(propose(t1.id, 1, h2, "Five, on a new commit")); // the verdict carries (verdicts-carry)
  await room.drainNotify();
  await room.activate(c2, { test, lint, build });
  await room.recompute(); // require, then the carried verdict judged again
  await room.act(check(room, "test", test, t1.id, 2, h2));
  await room.act(check(room, "build", build, t1.id, 2, h2));
  const land1 = await room.act(land(t1.id, 2, h2));
  await room.drainNotify();
  const i2 = room.recommit(h2); // the landing's integration: another commit, the same tree
  await room.carryChecks(opOf(land1), i2, { tree: room.treeOf(i2) }); // tests carries (tree-identical); build is volatile and does not
  await room.land(opOf(land1), true); // nothing sealed: tests is met by the carry, build is open on this integration
  await room.act(check(room, "build", build, t1.id, 2, i2, true, opOf(land1)));
  await room.land(opOf(land1), true); // land-evaluated: every blocking obligation met; the advisory lint is open

  // Thread 2: a verdict that does not carry, an objection that is not carried either, then an approval.
  const t2 = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The library", scope: ["lib/**"] } });
  const l1 = room.change({ "lib/util.ts": "export const u = 1;\n" });
  await room.act(propose(t2.id, 0, l1, "A helper"));
  await room.drainNotify();
  await room.act(review(dave, t2.id, 1, l1, "approve", ["lib/**"]));
  await room.drainNotify();
  const l2 = room.change({ "lib/util.ts": "export const u = 2;\n" });
  await room.act(propose(t2.id, 1, l2, "A better helper")); // lib/util.ts changed inside the reviewed scope: the platform does not carry it, and no rule is asked
  await room.drainNotify();
  await room.act(review(dave, t2.id, 2, l2, "object", ["lib/**"]));
  await room.drainNotify();
  await room.act(land(t2.id, 2, l2)); // refused obligation-open, before policy
  const l3 = room.recommit(l2);
  await room.act(propose(t2.id, 2, l3, "The same helper, rebased")); // an objection is not carried: no call is owed
  await room.drainNotify();
  await room.act(review(dave, t2.id, 3, l3, "approve", ["lib/**"]));
  await room.drainNotify();
  const land2 = await room.act(land(t2.id, 3, l3));
  await room.drainNotify();
  await room.land(opOf(land2));

  // Thread 3: an author's own approval counts for a documentation obligation and not for the other; two verdicts carry.
  const t3 = await room.act({ signer: dave, kind: "claim", target: null, body: { goal: "Library notes", scope: ["lib/**", "docs/**"] } });
  const d1 = room.change({ "lib/util.ts": "export const u = 3;\n", "docs/guide.md": "# guide\n" });
  await room.act(propose(t3.id, 0, d1, "A helper and its guide", dave));
  await room.drainNotify();
  await room.act(review(dave, t3.id, 1, d1, "approve", ["docs/**"]));
  await room.act(review(erin, t3.id, 1, d1, "approve", ["lib/**", "docs/**"]));
  await room.drainNotify(); // two notifications, each with the reviewers as they were when its act was sealed: dave; then dave and erin
  const d2 = room.recommit(d1);
  await room.act(propose(t3.id, 1, d2, "The same, rebased", dave)); // two carry calls: erin's verdict, then dave's own
  await room.drainNotify();
  const land3 = await room.act(land(t3.id, 2, d2, dave));
  await room.drainNotify();
  await room.land(opOf(land3));

  // Thread 4: a failing check; then a new policy changes who may review lib/** and the build checker's configuration.
  const t4 = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "App and library", scope: ["src/**", "lib/**"] } });
  const s1 = room.change({ "src/app.ts": "export const x = 7;\n", "lib/util.ts": "export const u = 4;\n" });
  await room.act(propose(t4.id, 0, s1, "Seven and four"));
  await room.drainNotify();
  await room.act(review(alice, t4.id, 1, s1, "approve", ["src/**"]));
  await room.drainNotify();
  await room.act(review(dave, t4.id, 1, s1, "approve", ["lib/**"]));
  await room.drainNotify();
  await room.act(check(room, "test", test, t4.id, 1, s1));
  await room.act(check(room, "build", build, t4.id, 1, s1, false)); // a failing check meets nothing
  const land4 = await room.act(land(t4.id, 1, s1));
  await room.drainNotify();
  await room.land(opOf(land4), true); // nothing sealed: build is open
  await room.activate(c3, later);
  await room.recompute(); // thread 1's and thread 4's open versions
  await room.land(opOf(land1), true); // nothing sealed. Thread 1 under the new policy: its check carry was judged under the old one; its build check names the old configuration
  await room.carryChecks(opOf(land1), i2, { tree: room.treeOf(i2) }); // judged again under the new policy: tests carries again
  await room.land(opOf(land1), true); // nothing sealed: build and audit are open
  await room.land(opOf(land4), true); // nothing sealed. Thread 4: dave no longer qualifies for lib-review
  await room.act(review(erin, t4.id, 1, s1, "approve", ["lib/**"]));
  await room.drainNotify(); // reviewers: alice and erin, not dave
  await room.act(review(alice, t1.id, 2, h2, "object", ["src/**"])); // her verdict here replaces her carried one
  await room.drainNotify();
  await room.land(opOf(land1), true); // nothing sealed: src-review is open again

  // Thread 5: a check whose key is revoked as compromised stops counting.
  const t5 = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app again", scope: ["src/**"] } });
  const x1 = room.change({ "src/app.ts": "export const x = 8;\n" });
  await room.act(propose(t5.id, 0, x1, "Eight"));
  await room.drainNotify();
  await room.act(review(alice, t5.id, 1, x1, "approve", ["src/**"]));
  await room.drainNotify();
  await room.act(check(room, "test", test, t5.id, 1, x1));
  const land5 = await room.act(land(t5.id, 1, x1)); // tests met, build and audit open
  await room.drainNotify();
  await room.land(opOf(land5), true); // nothing sealed
  await room.act({ signer: alice, kind: "roster", target: null, body: { op: "revoke-key", key: carol.key, reason: "compromised" } });
  await room.land(opOf(land5), true); // nothing sealed: tests is open again

  // Thread 6: a sole admin's flagged self-approval counts only while the room has one active admin.
  const t6 = await room.act({ signer: alice, kind: "claim", target: null, body: { goal: "Tell admins about landings", scope: [".artroom/**"] } });
  const p1 = room.change({ ".artroom/policy.json": JSON.stringify(c5) });
  await room.act(propose(t6.id, 0, p1, "Notify admins of landings", alice));
  await room.drainNotify();
  await room.act(review(alice, t6.id, 1, p1, "approve", [".artroom/**"])); // flagged sole-admin-self-approval
  await room.drainNotify();
  const land6 = await room.act(land(t6.id, 1, p1, alice));
  await room.drainNotify();
  await room.land(opOf(land6), true); // land-evaluated: obl_admin-approval met
  await room.act({ signer: alice, kind: "roster", target: null, body: { op: "set-role", member: "@dave", role: "admin" } });
  await room.land(opOf(land6), true); // nothing sealed. Two active admins: the self-approval no longer counts

  // A policy whose require rule cannot be evaluated: each open version is blocked, keeps its obligations, and its
  // carried verdicts are still judged.
  await room.activate(c4, later);
  await room.recompute();
  write("declared-carry", room.fixture("Obligations, evidence and carrying under a v2 document: verdicts carried, not carried and replaced; checks counted by integration, carried by check-carried events and judged again after an activation; an advisory and a failing check; an author's own approval; a policy that changes who qualifies; a revoked checker key; a sole admin's self-approval; a recomputation that fails."));
}

// --------------------------------------------------------- declared-carry-plain

{
  const dave = pair(7);
  const reviewers = ["@alice", "role:maintainer"];
  const doc = valid(v2(policy(requireReview({ paths: "src/**", from: reviewers, id: "src-review" }))));
  const firstOnly = valid(v2(policy(requireReview({ paths: "src/**", from: reviewers, id: "src-review", when: "lane.generation = 0" }))));
  const room = new DeclaredRoom();
  await room.activate(doc); // 1
  await room.join("@bob", "member", bob); // 2, 3
  const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**"] } }); // 4
  const h1 = room.change({ "src/app.ts": "export const x = 9;\n" });
  await room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head: h1, summary: "Nine" } }); // 5
  await room.act({ signer: alice, kind: "review", target: { lane: claim.id, generation: 1 }, body: { head: h1, verdict: "approve", scope: ["src/**"], text: "Approved." } }); // 6
  const h2 = room.recommit(h1);
  await room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 1, head: h2, summary: "Nine, rebased" } }); // 7: carried on the platform's conditions; no rule, no decision
  const land = await room.act({ signer: bob, kind: "land", target: { lane: claim.id, generation: 2 }, body: { lease: 1, head: h2 } }); // 8: the land input lists the carried verdict
  await room.land(opOf(land)); // 9 land-evaluated, 10 land-reserved, 11 land-outcome
  // A verdict carries only for the obligations the new version still has. Under a policy that requires the review
  // of a thread's first version only, the second version has no obligation for the verdict to be carried to; when
  // a later policy requires it again, nothing was carried, and another reviewer's approval meets it.
  await room.join("@dave", "maintainer", dave); // 12, 13
  await room.activate(firstOnly); // 14
  const second = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "The app again", scope: ["src/**"] } }); // 15
  const g1 = room.change({ "src/app.ts": "export const x = 10;\n" });
  await room.act({ signer: bob, kind: "propose", target: { lane: second.id }, body: { lease: 1, expectedGeneration: 0, head: g1, summary: "Ten" } }); // 16
  await room.act({ signer: alice, kind: "review", target: { lane: second.id, generation: 1 }, body: { head: g1, verdict: "approve", scope: ["src/**"], text: "Approved." } }); // 17
  const g2 = room.recommit(g1);
  await room.act({ signer: bob, kind: "propose", target: { lane: second.id }, body: { lease: 1, expectedGeneration: 1, head: g2, summary: "Ten, rebased" } }); // 18: no obligation on this version
  await room.activate(doc); // 19
  await room.recompute(); // 20: src-review is required again; no verdict was carried
  await room.act({ signer: dave, kind: "review", target: { lane: second.id, generation: 2 }, body: { head: g2, verdict: "approve", scope: ["src/**"], text: "Approved." } }); // 21
  const land2 = await room.act({ signer: bob, kind: "land", target: { lane: second.id, generation: 2 }, body: { lease: 1, head: g2 } }); // 22: one verdict listed, dave's
  await room.land(opOf(land2), true); // 23 land-evaluated
  write("declared-carry-plain", room.fixture("A verdict carried to a second version by the platform's conditions alone: the policy has no carry rule, so the log records no carry decision, and the land input lists the carried verdict. Then a verdict that is not carried, because the new version has no obligation for it."));
}

// ------------------------------------------------------------ declared-snapshot

{
  const RUNNER = `sha256:${"c".repeat(64)}` as const;
  const config: CheckerConfigV2 = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 600, runner: RUNNER, inputs: ["src/**"] };
  const base = policy(requireCheck("test", { paths: "src/**", by: "@carol", id: "tests" }));
  const doc = valid(v2(base), { test: config });
  const paths = checkerInputs(config.inputs, base.carry)!;
  const snapshot = (n: string) => `sha256:${n.repeat(64)}`;
  const room = new DeclaredRoom();
  await room.activate(doc, { test: config }); // 1
  await room.join("@bob", "member", bob); // 2, 3
  await room.join("@carol", "checker", carol); // 4, 5
  const scoped = async (goal: string, content: string, digest: string, prepare: boolean) => {
    const claim = await room.act({ signer: bob, kind: "claim", target: null, body: { goal, scope: ["src/**"] } });
    const head = room.change({ "src/app.ts": content });
    await room.act({ signer: bob, kind: "propose", target: { lane: claim.id }, body: { lease: 1, expectedGeneration: 0, head, summary: goal } });
    const land = await room.act({ signer: bob, kind: "land", target: { lane: claim.id, generation: 1 }, body: { lease: 1, head } });
    // The snapshot commit: a commit that holds only the checker's inputs, as R-CARRY-15 builds it.
    const commit = room.commit({ "src/app.ts": content }, null);
    if (prepare) room.prepared(claim.id, 1, { op: opOf(land), snapshots: [{ check: "test", commit, digest }] });
    await room.act({
      signer: carol,
      kind: "check",
      target: { lane: claim.id, generation: 1 },
      body: { obligation: "obl_tests", check: "test", integration: commit, input: { kind: "filtered", snapshot: digest, paths }, config: digestJson(config), runner: RUNNER, volatile: false, ok: true, detail: "Passed.", landOp: opOf(land) },
    });
    await room.land(opOf(land), true);
  };
  await scoped("Prepared", "export const x = 10;\n", snapshot("a"), true); // 6 claim, 7 propose, 8 land, 9 prepared, 10 check, 11 land-evaluated
  // With no prepared event the simulator cannot say the check counts for the landing's integration: tests stays open
  // in it, and no land-evaluated event is sealed.
  await scoped("Not prepared", "export const x = 11;\n", snapshot("b"), false); // 12 claim, 13 propose, 14 land, 15 check
  // A third thread: a check on a first version that needs it, then a second version that does not: no check is owed,
  // carried or judged for it.
  const third = await room.act({ signer: bob, kind: "claim", target: null, body: { goal: "Then only notes", scope: ["src/**", "docs/**"] } }); // 16
  const first = room.change({ "src/app.ts": "export const x = 12;\n" });
  await room.act({ signer: bob, kind: "propose", target: { lane: third.id }, body: { lease: 1, expectedGeneration: 0, head: first, summary: "Twelve" } }); // 17
  await room.act({
    signer: carol,
    kind: "check",
    target: { lane: third.id, generation: 1 },
    body: { obligation: "obl_tests", check: "test", integration: first, input: { kind: "tree", tree: room.treeOf(first) }, config: digestJson(config), runner: RUNNER, volatile: false, ok: true, detail: "Passed." },
  }); // 18
  const notes = room.change({ "docs/notes.md": "# notes\n" });
  await room.act({ signer: bob, kind: "propose", target: { lane: third.id }, body: { lease: 1, expectedGeneration: 1, head: notes, summary: "Only notes" } }); // 19: no obligation
  const land3 = await room.act({ signer: bob, kind: "land", target: { lane: third.id, generation: 2 }, body: { lease: 1, head: notes } }); // 20
  await room.land(opOf(land3), true); // 21 land-evaluated
  write("declared-snapshot", room.fixture("A scoped checker: a prepared event records the snapshot commit for a landing's integration, a check runs on that commit, and the landing's land input counts it; then the same on a second thread with no prepared event."));
}
