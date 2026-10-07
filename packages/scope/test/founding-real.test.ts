import { runInDurableObject } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Entry, Intent, Observation, ObservationUse, OperationId, Read, Seed } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, entryHash, factRefOf, intentDigest, scopeIdOf, seedDigest, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { PROFILES, grantFrom, ruleAt, validateDefinition, valueDigest, type Item } from "@generalbusiness/artroom-derive";
import { d, keys, otherLane, ticket, ticketDefinition } from "@generalbusiness/artroom-derive/testing";
import { CONFIGURATION_DOMAIN, DESTINATION, DESTINATION_CHANGED_SET, DIRECTORY, REGISTER, destinationReceipt, firstExtents, foundingObjects, platform, repositoryName, revokedToken, RULES_EXTENTS_VALUE } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { targetOf } from "../../platform/src/destination.ts";
import { SqliteStore } from "../src/index.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam, settle } from "./repository.ts";
import { reader } from "./support.ts";
import { platformNet } from "./worker.ts";

const { paul } = keys;
const SERVICE = "https://scopes.test";

/** The freshness proof that an act's entry retains in its grant. */
const proof = (entry: Entry): ObservationUse & { observation: Observation } => {
  if (entry.input.type !== "act" || !entry.input.authority[0]) throw new Error("the entry records no grant");
  return entry.input.authority[0].fresh as ObservationUse & { observation: Observation };
};

/** The marks of one platform definition that the platform package has no rule of the right kind for, by name, once each: what a runtime with this package lacks to run it. */
function lacking(named: string): string[] {
  const supplied = platform(named)!;
  const checked = validateDefinition(JSON.parse(JSON.stringify(supplied.data)), PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw new Error(`${named} is refused: ${JSON.stringify(checked.problems)}`);
  return [...new Set(checked.definition.marks.filter((mark) => ruleAt(supplied.rules, mark.code, mark.kind) === null).map((mark) => mark.code))];
}

// Invariant: a real destination reserves and publishes the first source change when its touched extent requires a passed
// check bound to the retained job, configured digest and the current member and key of the real membership scope.
// The plan's step 9c (authority note, revision 28, section 3.8, and sections 12.1.1, 12.1.2 and 12.1.5;
// the scope contract, sections 7.1 and 7.2). Every scope here is a Durable Object of the namespace `PLATFORM`: the deployed class,
// with the production authority and the platform package's own data and rules. No rule is a stand-in. Four lane entries below are
// SCRIPTED, made by hand and anchored explicitly for replay; no actual lane or Git host is run here.
//
// | Part | Is |
// |---|---|
// | The register, the directory, membership and the rules scope | Real scopes, written through the turn, the store, the dispatchers and the operations driver. |
// | The Git host | A STAND-IN: `OutsideDouble` of `outside.ts`, wired as the register's outside port. It answers the one request of an attempt with what the test wrote. Nothing here creates a repository. |
// | The change lane | SCRIPTED: a manifest, a job opening, its passed decision and a merge entry, signed and hashed by the test. The integrator and job facts are stated by hand; the checker grant uses a real membership answer. No lane judged them and no checker runner ran. Its progress messages retain duties at the destination. |
// | The clock, transport and the readers | The scripted clock, the namespace's transport, and the test readers, as in every test of the namespace `PLATFORM`. For the reads that are about a session, the readers are the real read sessions, under a TEST SECRET that the test generates. |
// | Who may install | Nothing checks it: that is the installation design's (N5). paul signs the `install`. |
describe("a founding on real scopes under the deployed class (authority note, section 3.8; I3 plan, step 9c). The Git host is a STAND-IN", () => {
  test("an install founds a register; a founder's claim opens the creation of a repository; the reply to its first attempt is lost, and the own answer of the second selects it and creates the directory; the directory creates and confirms membership, rules and destination; real rules and membership observations decide the first publication with a required passed check", async () => {
    net.hold = net.deaf = null;
    // Step 0: the register, by an `install` intent with `to: null`, under `platform:register@1`. Its seed has the kind `register` and
    // no creator, and the object's name is the seed's digest.
    const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "artroom", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
    // STAND-IN: the Git host of this register. It is wired before the object is first reached.
    const host = outsideOf(R.name);
    wired.set(R.name, () => ({ outside: host }));
    expect(await R.stub.found(signIntent(install, paul.secret), REGISTER)).toMatchObject({ answer: "accepted", receipt: { definition: REGISTER, fact: { at: { scope: R.name, kind: "register" }, seq: 0 } } });
    const register = await R.at();

    // Step 1: the founder's claim. The policy is `keys`, and rita's key is a founder's. No grant judges the act. The entry fixes the
    // directory's seed, and so its scope ID, and opens the creation of a repository, with attempt 1.
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
    const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: register, cause: intentDigest(found.intent), ordinal: 0 };
    const D = new Platform(scopeIdOf(seed));
    const creation: OperationId = "1:0";
    // What the host answers, which the test writes (section 12.1.1, case c). The reply to attempt 1 is lost: no answer comes. The
    // host's own answer to attempt 2 says created, under that attempt's own name, with the host's ID.
    const name = repositoryName(seedDigest(seed), 2);
    host.answer(creation, 1, null);
    host.answer(creation, 2, { result: "confirmed", evidence: { basis: "own-answer", body: { name, id: "repo-7" } } });
    const claimed: Answer = await R.stub.submit(found, []);
    expect(claimed).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 1 } } });

    // Steps 2 to 7: the operations driver sends the one request of each attempt and records what came as an outcome entry, and the
    // dispatchers carry every message from there. Nothing is carried by the test. Attempt 1 is recorded `unknown`, with the body
    // that the register's rule states for an outcome that is not known, and its entry opens attempt 2, which is due after a delay.
    const driven = async () => { while ((await (R.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ } };
    await driven();
    expect((await R.last()).input).toMatchObject({ type: "outcome", attempt: 1, result: "unknown", evidence: { basis: "none", body: { name: repositoryName(seedDigest(seed), 1) } } });
    net.clock.now = soon(PROPOSED_BOUNDS.dispatchRetrySeconds);
    await driven();
    await settle(R, D);
    const directory = await D.at();
    const sent = (await D.entries())[0]!.sends;
    const [membershipScope, rulesScope, destination] = [1, 2, 3].map((n) => new Platform(scopeIdOf(sent.find((send) => send.n === n)!.to as Seed)));
    await settle(R, D, membershipScope!, rulesScope!, destination!);

    // The register: one request of each attempt reached the host. The outcome of attempt 2 is selected, sets the claim's repository,
    // and sends the `create` of the directory. The directory's applied result makes the claim `active`, and the register confirms
    // the directory.
    const r = await R.entries();
    expect([host.attempts, r.map((entry) => entry.input.type), r[3]!.effects, r[3]!.sends.map((send) => [send.n, send.message.class, (send.to as Seed).kind])]).toEqual([
      ["1:0#1", "1:0#2"], ["genesis", "act", "outcome", "outcome", "delivery"],
      [{ effect: "attempt", operation: creation, attempt: 2, result: "confirmed", selected: true }, { effect: "value", item: 1, slot: "repository", value: { host: "git.example", namespace: "artroom", name, id: "repo-7" } }],
      [[0, "request", "directory"]],
    ]);
    // The claim is `active`, which is final: it is read with the retained final items.
    const claims = await (R.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "claim");
    expect([claims.ok && claims.value.map((item) => [item.id, item.state, item.refs]), r[4]!.sends.map((send) => send.message)]).toMatchObject([
      [[1, "active", { directory, genesis: { at: directory, seq: 0 } }]], [{ class: "control", type: "confirm" }],
    ]);

    // Each scope that came to exist, with its kind, its scope ID, the definition that it pins, its status, and the membership
    // reference that it records. The register records none. The directory holds it in `repository.membership`, with the incarnation
    // that it confirmed. Membership is its own. The rules scope holds the scope ID alone, as the value `rules.membership`: no entry
    // of it retains an observation yet, so it records no incarnation.
    const membership = await membershipScope!.at();
    const rules = await rulesScope!.at();
    const G = destination!;
    const branchScope = await G.at();
    const shown = async (node: Platform, recorded: (items: Awaited<ReturnType<Platform["summary"]>>["value"]["items"]) => unknown) => {
      const { scope, status, definition, items } = (await node.summary()).value;
      return [scope.kind, scope.scope, definition, status, recorded(items)];
    };
    expect([
      await shown(R, () => null), await shown(D, (items) => items[0]!.refs["membership"]), await shown(membershipScope!, () => membership), await shown(rulesScope!, (items) => items[0]!.values["membership"]), await shown(G, (items) => items[0]!.values["membership"]),
    ]).toEqual([
      ["register", R.name, REGISTER, "active", null],
      ["directory", D.name, DIRECTORY, "active", membership],
      ["membership", membershipScope!.name, "platform:membership@1", "active", membership],
      ["rules", rulesScope!.name, "platform:rules@1", "active", membership.scope],
      ["destination", G.name, DESTINATION, "active", membership.scope],
    ]);
    // The directory's repository item: its fixed slots from the creation's fields and from the claim's entry, and the references of
    // the three children that answered.
    expect((await D.item(0))).toMatchObject({
      refs: { register, claim: { at: register, seq: 1 }, membership, rules, destination: branchScope },
      values: { repository: { host: "git.example", namespace: "artroom", name, id: "repo-7" }, branch: "main", founder: rita.key, founderHandle: "@rita", recoveryKey: sam.key },
    });

    // Every declared mark has its production rule, so the third child is created and confirmed too. No duty is held or waiting.
    expect([lacking(REGISTER), lacking(DIRECTORY), lacking("platform:membership@1"), lacking("platform:rules@1"), lacking(DESTINATION)]).toEqual([[], [], [], [], []]);
    expect(((await D.stub.outbox(reader)) as { value: readonly { acknowledged: unknown }[] }).value.every((duty) => duty.acknowledged !== null)).toBe(true);
    // STAND-IN: the destination's Git host. It answers with the exact ID that the package computes for the founding commit.
    const destinationHost = outsideOf(G.name);
    const firstHead = foundingObjects("sha1", G.name, (await G.entries())[0]!.time, factRefOf(r[1]!)).commit;
    destinationHost.answer("0:0" as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { send: "accepted", seen: firstHead } } });
    let driving = "mint";
    wired.set(G.name, () => ({ outside: { accepts: (_owner, kind) => kind === driving, send: (request) => destinationHost.send(request) } }));
    await G.restart();
    // The host stand-in gets its request context from the actual SQLite records, as a real port does. No answer is a rule.
    const drive = async (kind: string) => {
      const answers = await runInDurableObject(G.object, (_instance, state) => {
        const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
        const own = (seq: number) => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; };
        return store.all().operations.filter((operation) => operation.kind === kind).flatMap((operation) => operation.attempts.filter((attempt) => attempt.outcomes.length === 0).map((attempt) => {
          const body = kind === "mint" ? { token: `token-${operation.id}`, ends: soon(60) }
            : kind === "revoke" ? { token: revokedToken(store, own, operation) }
            : kind === "receipt" ? { send: "accepted", seen: destinationReceipt(store, own, targetOf(store, own, operation)!, "sha1").commit }
            : { send: "accepted", seen: kind === "first-head" ? firstHead : integration };
          return { operation: operation.id, attempt: attempt.attempt, body };
        }));
      });
      for (const answer of answers) destinationHost.answer(answer.operation, answer.attempt, { result: "confirmed", evidence: { basis: "own-answer", body: answer.body } });
      driving = kind;
      await G.restart();
      await (G.stub as unknown as { effect(): Promise<number> }).effect();
    };
    await drive("mint");
    await drive("first-head");
    expect(await G.item(0)).toMatchObject({ state: "ready", values: { head: firstHead } });
    await drive("mint");
    await drive("receipt");
    await drive("revoke");
    wired.delete(R.name);

    // Where the rules scope records its membership reference (authority note, revision 25, section 12.1; I3 deltas EM21, EQ7 and
    // EU6). rita takes her seat in membership, on the founding key, and so is an admin, who holds `rules.publish`.
    const seat = await membershipScope!.did(rita, "seat", { expected: await membershipScope!.expected({ roster: 0 }) });
    await membershipScope!.did(rita, "first-key", { fields: { member: seat }, expected: await membershipScope!.expected({ roster: 0, member: seat }) });
    // A read session of rita's, issued by membership under a TEST SECRET that this test generates. A scope accepts a session only
    // when it names the membership reference that the scope itself records, with its incarnation. So what a reader with it is
    // answered at the rules scope shows what that scope records, as its own store holds it.
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const real = async <T>(run: () => Promise<T>): Promise<T> => { platformNet.sessions = true; try { return await run(); } finally { platformNet.sessions = false; } };
    const issued = await real(async () => requestSession(SERVICE, membershipScope!.name, sessionRequest(membership, rita.secret, soon(60), "founding-real"), { fetch: routed as unknown as Fetch }));
    if (!issued.ok) throw new Error(`no session: ${issued.reason}`);
    const reads = async (node: Platform) => (await real(() => routed(`${SERVICE}/v1/scopes/${node.name}`, { headers: { authorization: issued.session.reader() } }))).status;
    // The directory records the reference with its incarnation, and the rules scope records the ID alone: no session is accepted there yet.
    expect([await reads(D), await reads(rulesScope!)]).toEqual([200, 403]);
    const publish = async (approvals: number) => rulesScope!.act(rita, "publish", { on: 0, expected: await rulesScope!.expected({ on: 0 }), fields: { approvals, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals, checks: [] }) as never } });
    // The rules scope's first act that needs a grant. It holds membership's scope ID and no incarnation, so its first read asks by the
    // ID alone. The answer's `of` holds the incarnation of the scope that answered, guard 1 takes it, and the entry that retains
    // the observation fixes it: the grant covers this scope by that reference.
    // Before any `publish` the rules scope answers an observation of the rules with the revision 0 and the values of the genesis
    // (authority note, revision 28, section 12.1.4; I3 deltas, entries EQ8 and FB10). It is what another scope's object is answered:
    // one call on the object, by the reference or by the scope ID alone. A membership scope answers no such request.
    const observes = async (of: object, asked: string) => { const got = await rulesScope!.stub.observe({ of, asked }); return got && typeof got === "object" && "answer" in got ? got.answer : got; };
    const founding = { asked: "rules", approvals: 1, ownerMayReview: false, checks: [], labels: [], singleControllerException: false, extents: valueDigest(RULES_EXTENTS_VALUE.domain, firstExtents({ approvals: 1, checks: [] })) };
    expect([await observes(rules, "rules"), await observes({ scope: rules.scope, kind: "rules" }, "definitions"), await membershipScope!.stub.observe({ of: membership, asked: "rules" })]).toEqual([
      { subject: "rules", of: rules, head: (await rulesScope!.summary()).at, revision: 0, content: founding, definition: "platform:rules@1" },
      { subject: "rules", of: rules, head: (await rulesScope!.summary()).at, revision: 0, content: { asked: "definitions", active: [] }, definition: "platform:rules@1" }, null,
    ]);
    expect(await publish(2)).toMatchObject({ answer: "accepted" });
    const first = proof(await rulesScope!.last());
    expect(first).toMatchObject({ observation: { of: membership, key: rita.key, keyState: "active", role: "admin", within: { membership } }, use: "fresh", prior: null });
    // From then on the incarnation is a function of the folded state: the rules scope records the reference with it, and accepts the
    // session. A later read states it: after a restart the object holds no observation in memory, records the same reference from
    // its store, reads again, and is answered by the same incarnation.
    expect(await reads(rulesScope!)).toBe(200);
    await rulesScope!.restart();
    net.clock.now = soon(10);
    expect(await reads(rulesScope!)).toBe(200);
    platformNet.secret = null;
    expect(await publish(3)).toMatchObject({ answer: "accepted" });
    expect([proof(await rulesScope!.last()).observation.of, proof(await rulesScope!.last()).use, (await rulesScope!.item(0)).values["approvals"]]).toEqual([membership, "fresh", 3]);
    // After each `publish` the revision of the answer is the position of that entry, also after the restart, and its head is the
    // scope's head. A request that states another incarnation of the rules scope's name is answered by nobody.
    const published = (await rulesScope!.summary()).at;
    expect([await observes(rules, "rules"), (await rulesScope!.item(0)).refs["published"], await observes({ ...rules, inc: register.inc }, "rules")]).toEqual([
      { subject: "rules", of: rules, head: published, revision: published.seq, content: { ...founding, approvals: 3, extents: valueDigest(RULES_EXTENTS_VALUE.domain, firstExtents({ approvals: 3, checks: [] })) }, definition: "platform:rules@1" }, published.seq, null,
    ]);
    // A request that states another incarnation of membership's name is answered by nobody, and one by the ID alone is answered.
    const asked = { ...membership, inc: register.inc };
    expect([await membershipScope!.stub.observe({ of: asked, key: rita.key }), await membershipScope!.stub.observe({ of: { scope: membership.scope, kind: "membership" }, key: rita.key })]).toMatchObject([null, { of: membership, key: rita.key }]);

    // Revision 28, section 3.3, rows 8 to 10: the deployed authority reads the real rules scope and membership before the turn.
    // A definition that the real rules scope has never activated is refused by name, rather than left waiting for an observation.
    // The definition's bytes travel beside the act, at the place that `definition` states: derive's made-up `ticket`.
  const inactive = await D.intent(rita, "open-issue", { expected: await D.expected({ repository: 0 }), fields: { definition: ticketDefinition.digest, title: "An inactive definition", conditions: [] } });
  expect(await D.stub.submit(inactive, [], { values: [canonicalize(ticket)] })).toMatchObject({ answer: "refused", reason: "guard-failed", name: "not-activated" });
    // Membership answers the unknown worker as unknown. No task is opened and no task creation is dispatched.
    const beforeTask = (await D.summary()).at;
    expect(await D.act(rita, "open-task", { expected: await D.expected({ repository: 0 }), fields: { worker: { membership, member: "@missing" }, controller: { membership, member: "@rita" }, lane: { ...directory, kind: "lane" } } })).toMatchObject({ answer: "refused", reason: "guard-failed", name: "worker-not-active" });
    expect((await D.summary()).at).toEqual(beforeTask);
    const configuration = { name: "unit", image: d("a"), environment: {}, steps: [["npm", "test"]], judged: { passed: { exit: 0, line: "ok" }, failed: { exit: 1, line: "not ok" } }, limits: { seconds: 600, bytes: 65536 } };
    const digest = valueDigest(CONFIGURATION_DOMAIN, configuration);
    const keptConfiguration = await rulesScope!.stub.submit(await rulesScope!.intent(rita, "keep-configuration", { fields: { digest, name: "unit" } }), [], { values: [canonicalize(configuration)] });
    expect(keptConfiguration.answer, JSON.stringify(keptConfiguration)).toBe("accepted");
    const withChecker = async (member: string) => rulesScope!.act(rita, "publish", { on: 0, expected: await rulesScope!.expected({ on: 0 }), fields: { approvals: 0, ownerMayReview: false, checks: [{ name: "unit", configuration: digest, required: true, checker: { membership, member } }], labels: [], extents: firstExtents({ approvals: 0, checks: [{ name: "unit", required: true }] }) as never } });
    // The signer's own member is served by her grant. Its projected admin standing is available to the checker rule.
    expect(await withChecker("@rita")).toMatchObject({ answer: "refused", reason: "guard-failed", name: "not-a-checker" });
    const checkerMember = await membershipScope!.did(rita, "add-member", { fields: { handle: "@check", kind: "checker" } });
    const checkerSecret = "the invitation of the required checker key";
    const checkerInvitation = await membershipScope!.did(rita, "invite-key", { fields: { member: checkerMember, kind: "checker", inviteHash: textDigest(checkerSecret), inviteEnds: soon(3600) }, expected: await membershipScope!.expected({ member: checkerMember }) });
    await membershipScope!.did(paul, "enrol", { on: 0, fields: { invitation: checkerInvitation, secret: checkerSecret }, expected: await membershipScope!.expected({ on: 0, member: checkerMember }) });
    expect(await withChecker("@check")).toMatchObject({ answer: "accepted" });
    const checked = await rulesScope!.last();
    expect(checked.input.type === "act" && checked.input.observed).toMatchObject([{ observation: { subject: "member", of: membership, member: "@check", memberState: "active", role: "checker" }, use: "fresh" }]);

    expect((await rulesScope!.item(0)).values["checks"]).toEqual([{ name: "unit", configuration: digest, required: true, checker: { membership, member: "@check" } }]);
    const retainedConfiguration = await rulesScope!.stub.retained(reader, "value", digest, CONFIGURATION_DOMAIN);
    expect(retainedConfiguration).toMatchObject({ ok: true, value: { bytes: canonicalize(configuration) } });

    // SCRIPTED source facts: manifest (anchor 1), job opening (anchor 2), passed decision (anchor 3), merge (anchor 4).
    // No lane judged them and no checker runner ran. The passed decision is signed by the actually enrolled key; its fresh
    // change.check grant is built from this real membership answer, with only the source read metadata supplied by the test.
    // The destination retains all four facts, reads them with its production reader, and reads that key's current standing.
    const integration = "b".repeat(40);
    const tree = "d".repeat(40);
    const by = { membership, member: "@rita" } as const;
    const signed = (kind: string, fields: Intent["fields"]) => signIntent({ v: 1, to: otherLane, actor: rita.key, kind, on: null, expected: {}, fields, idempotencyKey: kind, notAfter: soon(60) }, rita.secret);
    const manifest: Entry = { v: 1, at: otherLane, seq: 1, prev: d("0"), time: net.clock.now, clamped: false, epoch: 0, input: { type: "act", signed: signed("propose-manifest", { base: firstHead, integration, tree, complete: true, selected: [] }), authority: [], presented: {} }, uses: [], prepared: [], effects: [{ effect: "party", item: 1, slot: "integrator", member: by }], sends: [] };
    const checkerAnswer = await membershipScope!.stub.observe({ of: membership, key: paul.key }) as Omit<Observation, "at">;
    expect(checkerAnswer).toMatchObject({ of: membership, head: (await membershipScope!.summary()).at, key: paul.key, keyState: "active", member: "@check", memberState: "active", role: "checker", actions: expect.arrayContaining(["change.check"]), within: { membership } });
    const checkGrant = grantFrom({ observation: { ...checkerAnswer, at: net.clock.now }, read: { run: "scripted-source-check-read", n: 1 }, use: "fresh", prior: null });
    const job: Entry = { v: 1, at: otherLane, seq: 2, prev: entryHash(manifest), time: net.clock.now, clamped: false, epoch: 0, input: { type: "act", signed: signed("request-check", { manifest: 1, name: "unit", configuration: digest }), authority: [], presented: {} }, uses: [], prepared: [], effects: [{ effect: "value", item: 2, slot: "tree", value: tree }], sends: [] };
    const decision: Entry = { v: 1, at: otherLane, seq: 3, prev: entryHash(job), time: net.clock.now, clamped: false, epoch: 0, input: { type: "act", signed: signIntent({ v: 1, to: otherLane, actor: paul.key, kind: "check", on: null, expected: {}, fields: { job: 2, tree, configuration: digest, outcome: "passed" }, idempotencyKey: "scripted-check", notAfter: soon(60) }, paul.secret), authority: [checkGrant], presented: {} }, uses: [], prepared: [], effects: [{ effect: "state", item: 2, state: "passed" }], sends: [] };
    const request = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest), verdicts: [], jobs: [{ job: factRefOf(job), name: "unit", state: "passed", decidedBy: factRefOf(decision) }], links: [], reports: [] } } } as const;
    const merge: Entry = { v: 1, at: otherLane, seq: 4, prev: entryHash(decision), time: net.clock.now, clamped: false, epoch: 0, input: { type: "act", signed: signed("merge", { manifest: 1 }), authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [{ n: 0, to: branchScope, message: request }] };
    const sourceFacts = [manifest, job, decision, merge];
    for (const entry of sourceFacts) net.peers.set(entryHash(entry), { entry, under: "change" });
    expect(await G.stub.deliver({ to: branchScope, from: factRefOf(merge), n: 0, message: request })).toMatchObject({ answer: "recorded" });
    driving = "judge";
    const queued = await G.last();
    const publication = queued.seq;
    const storedPublication = () => runInDurableObject(G.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      return { item: store.item(publication), held: store.holder(publication), operations: store.operationsFor(publication), owedReceipts: store.page("receipt", ["owed"], null, 130).items };
    });
    expect(await G.item(publication)).toMatchObject({ state: "queued", refs: { operation: factRefOf(merge), manifest: factRefOf(manifest), lane: otherLane } });
    expect(queued.uses.map((use) => use.fact.hash).sort()).toEqual(sourceFacts.map(entryHash).sort());
    for (const use of queued.uses) expect(await G.stub.retained(reader, "entry", use.content)).toMatchObject({ ok: true, value: { bytes: canonicalize(sourceFacts.find((entry) => entryHash(entry) === use.fact.hash)) } });
    expect((await storedPublication()).held?.decisions?.["withdraw"]).toBe(1);
    const judging = `${queued.seq}:0` as OperationId;
    const changes = { paths: ["src/a.ts"], links: [], unreadable: 0 };
    const changed = valueDigest(DESTINATION_CHANGED_SET.domain, changes);
    destinationHost.answer(judging, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { head: firstHead, present: true, tree, firstParent: firstHead, ancestors: [], changes: changed } }, retain: [{ kind: "value", domain: DESTINATION_CHANGED_SET.domain, digest: changed, bytes: canonicalize(changes) }] });
    // The judge is the only host request in this phase. Its following push and mint remain recorded until their phases.
    driving = "judge";
    await G.restart();
    await (G.stub as unknown as { effect(): Promise<number> }).effect();
    const judged = await G.last();
    expect(judged.input).toMatchObject({ type: "outcome", operation: judging, result: "confirmed", observed: [
      { observation: { subject: "rules", of: rules, revision: checked.seq, content: { asked: "rules" } }, use: "fresh" },
      { observation: { of: membership, key: rita.key, keyState: "active", actions: expect.arrayContaining(["change.merge"]) }, use: "fresh" },
      { observation: { subject: "holders", of: membership, action: "rules.publish", count: 1 }, use: "fresh" },
      { observation: { subject: "member", of: membership, member: "@rita", memberState: "active" }, use: "fresh" },
      { observation: { of: membership, key: paul.key, keyState: "active", member: "@check", role: "checker", actions: expect.arrayContaining(["change.check"]) }, use: "fresh" },
    ] });
    expect(judged.uses).toEqual(queued.uses);
    if (judged.input.type !== "outcome") throw new Error("the judge recorded no outcome");
    const currentRules = judged.input.observed?.find((use) => "subject" in use.observation && use.observation.subject === "rules");
    expect(currentRules?.observation).toMatchObject({ content: { checks: [{ name: "unit", configuration: digest, required: true, checker: "@check" }] } });
    expect((await storedPublication()).item).toMatchObject({ state: "reserved", values: { integration, reservedAt: judged.seq } });
    expect(await G.item(0)).toMatchObject({ refs: { slot: publication, judging: null } });
    expect(judged.sends[0]!.message).toMatchObject({ type: "relate", body: { name: "publication", state: "reserved", detail: { operation: factRefOf(merge), outcome: "committed", rules: checked.seq } } });
    expect((await storedPublication()).operations.filter((operation) => ["judge", "push", "mint"].includes(operation.kind)).every((operation) => operation.for === publication)).toBe(true);

    // The labelled Git host answers the reserved compare-and-swap, then the exact receipt write. The real rules publish, release
    // the branch slot, finish the receipt and clean up each token. Progress messages to the scripted lane retain their duties.
    await drive("mint");
    await drive("push");
    expect((await storedPublication()).item).toMatchObject({ state: "published", values: { integration } });
    expect(await G.item(0)).toMatchObject({ refs: { slot: null, judging: null }, values: { head: integration } });
    expect((await storedPublication()).owedReceipts).toHaveLength(1);
    await drive("mint");
    await drive("receipt");
    await drive("revoke");
    const finished = await storedPublication();
    expect(finished.owedReceipts).toHaveLength(0);
    expect(finished.held?.decisions ?? {}).toEqual({});
    expect(finished.operations.every((operation) => operation.attempts.every((attempt) => attempt.outcomes.length > 0))).toBe(true);
    const outbox = await G.stub.outbox(reader);
    expect(outbox.ok && outbox.value.filter((duty) => "scope" in duty.to && duty.to.scope === otherLane.scope).map((duty) => [duty.acknowledged, duty.result, duty.diagnosis])).toEqual([[null, null, null], [null, null, null], [null, null, null]]);
    wired.delete(G.name);

    // A verifier reads the five histories as bytes and derives every entry again, with the platform package's data and rules: the
    // register's outcome entry with its creation, the directory's genesis under the fourth cause, the clause of the result, and
    // the grants of the rules scope from their observations, the first of which fixed the incarnation. No grant is taken as current.
    // Only the four scripted source facts are anchored (no membership or rules facts). Every actual founding, authority and destination history is replayed.
    const options = { mode: "replay", platform, grants: "proven", anchors: sourceFacts.map((entry) => ({ scope: entry.at.scope, seq: entry.seq, hash: entryHash(entry) })) } as const;
    for (const node of [R, D, membershipScope!, rulesScope!, G]) {
      const { report, why } = await verify(httpSource(SERVICE, { fetch: routed }), { ...options, scope: node.name, head: (await node.summary()).at });
      expect([(await node.at()).kind, report.result, why]).toEqual([(await node.at()).kind, "consistent", null]);
    }
  });
});
