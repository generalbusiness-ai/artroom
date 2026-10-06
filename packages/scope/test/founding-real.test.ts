import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Intent, OperationId, Read, Seed } from "@generalbusiness/artroom-contract";
import { intentDigest, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, ruleAt, validateDefinition, type Item } from "@generalbusiness/artroom-derive";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, sam, settle } from "./repository.ts";
import { reader } from "./support.ts";

const { paul } = keys;

/** The marks of one platform definition that the platform package has no rule of the right kind for, by name, once each: what a runtime with this package lacks to run it. */
function lacking(named: string): string[] {
  const supplied = platform(named)!;
  const checked = validateDefinition(JSON.parse(JSON.stringify(supplied.data)), PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw new Error(`${named} is refused: ${JSON.stringify(checked.problems)}`);
  return [...new Set(checked.definition.marks.filter((mark) => ruleAt(supplied.rules, mark.code, mark.kind) === null).map((mark) => mark.code))];
}

// The plan's step 9c, as far as it runs (authority note, section 3.8, and sections 12.1.1 and 12.1.2 with the rows of revision 25;
// the scope contract, sections 7.1 and 7.2). Every scope here is a Durable Object of the namespace `PLATFORM`: the deployed class,
// with the production authority and the platform package's own data and rules. No rule is a stand-in, and no entry is made by hand.
//
// | Part | Is |
// |---|---|
// | The register, the directory, membership and the rules scope | Real scopes, written through the turn, the store, the dispatchers and the operations driver. |
// | The Git host | A STAND-IN: `OutsideDouble` of `outside.ts`, wired as the register's outside port. It answers the one request of an attempt with what the test wrote. Nothing here creates a repository. |
// | The clock, transport and the readers | The scripted clock, the namespace's transport, and the test readers, as in every test of the namespace `PLATFORM`. |
// | Who may install | Nothing checks it: that is the installation design's (N5). paul signs the `install`. |
describe("a founding on real scopes under the deployed class (authority note, section 3.8; I3 plan, step 9c). The Git host is a STAND-IN", () => {
  test("an install founds a register; a founder's claim opens the creation of a repository; its own answer selects it and creates the directory; the directory's genesis creates membership and the rules scope, each held until the register's confirm; and the creation of the destination is not decided, because `platform:destination@1` lacks rules", async () => {
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
    // The host's own answer to attempt 1, which the test writes: created, under the attempt's own name, with the host's ID.
    const name = repositoryName(seedDigest(seed), 1);
    host.answer(creation, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name, id: "repo-7" } } });
    const claimed: Answer = await R.stub.submit(found, []);
    expect(claimed).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 1 } } });

    // Steps 2 to 7: the operations driver sends the one request, records its answer as an outcome entry, and the dispatchers carry
    // every message from there. Nothing is carried by the test.
    while ((await (R.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ }
    await settle(R, D);
    const directory = await D.at();
    const sent = (await D.entries())[0]!.sends;
    const [membershipScope, rulesScope, destination] = [1, 2, 3].map((n) => new Platform(scopeIdOf(sent.find((send) => send.n === n)!.to as Seed)));
    await settle(R, D, membershipScope!, rulesScope!);

    // The register: the request reached the host once, by the attempt's own name. The outcome is selected, sets the claim's
    // repository, and sends the `create` of the directory. The directory's applied result makes the claim `active`, and the register
    // confirms the directory.
    const r = await R.entries();
    expect([host.attempts, r.map((entry) => entry.input.type), r[2]!.effects, r[2]!.sends.map((send) => [send.n, send.message.class, (send.to as Seed).kind])]).toEqual([
      ["1:0#1"], ["genesis", "act", "outcome", "delivery"],
      [{ effect: "attempt", operation: creation, attempt: 1, result: "confirmed", selected: true }, { effect: "value", item: 1, slot: "repository", value: { host: "git.example", namespace: "artroom", name, id: "repo-7" } }],
      [[0, "request", "directory"]],
    ]);
    // The claim is `active`, which is final: it is read with the retained final items.
    const claims = await (R.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "claim");
    expect([claims.ok && claims.value.map((item) => [item.id, item.state, item.refs]), r[3]!.sends.map((send) => send.message)]).toMatchObject([
      [[1, "active", { directory, genesis: { at: directory, seq: 0 } }]], [{ class: "control", type: "confirm" }],
    ]);

    // Each scope that came to exist, with its kind, its scope ID, the definition that it pins, its status, and the membership
    // reference that it records. The register records none. The directory holds it in `repository.membership`, with the incarnation
    // that it confirmed. Membership is its own. The rules scope holds the scope ID alone, as the value `rules.membership`: no entry
    // of it retains an observation yet, so it records no incarnation.
    const membership = await membershipScope!.at();
    const rules = await rulesScope!.at();
    const shown = async (node: Platform, recorded: (items: Awaited<ReturnType<Platform["summary"]>>["value"]["items"]) => unknown) => {
      const { scope, status, definition, items } = (await node.summary()).value;
      return [scope.kind, scope.scope, definition, status, recorded(items)];
    };
    expect([
      await shown(R, () => null), await shown(D, (items) => items[0]!.refs["membership"]), await shown(membershipScope!, () => membership), await shown(rulesScope!, (items) => items[0]!.values["membership"]),
    ]).toEqual([
      ["register", R.name, REGISTER, "active", null],
      ["directory", D.name, DIRECTORY, "active", membership],
      ["membership", membershipScope!.name, "platform:membership@1", "active", membership],
      ["rules", rulesScope!.name, "platform:rules@1", "active", membership.scope],
    ]);
    // The directory's repository item: its fixed slots from the creation's fields and from the claim's entry, and the references of
    // the two children that answered. The destination's is not set.
    expect((await D.item(0))).toMatchObject({
      refs: { register, claim: { at: register, seq: 1 }, membership, rules, destination: null },
      values: { repository: { host: "git.example", namespace: "artroom", name, id: "repo-7" }, branch: "main", founder: rita.key, founderHandle: "@rita", recoveryKey: sam.key },
    });

    // Where the founding stops. The directory's third creation, of the destination, is sealed as a duty and dispatched. The object
    // that its seed names records nothing: transport answers `retry`, `unsupported-definition`, because a runtime with this package
    // lacks a rule for these marks of `platform:destination@1`, and a version with a mark and no rule runs nothing (the contract's
    // section 6.1). So the destination does not exist, the duty stays with the directory, and the founding is not whole.
    const { entry, hash } = (await D.sealed())[0]!;
    const create = entry.sends.find((send) => send.n === 3)!;
    expect(lacking("platform:destination@1")).toEqual(["resend-due", "abort-if-behind", "first-head", "judge", "push", "mint", "revoke", "deciding-read", "receipt", "adopt-read"]);
    expect([lacking(REGISTER), lacking(DIRECTORY), lacking("platform:membership@1"), lacking("platform:rules@1")]).toEqual([[], [], [], []]);
    expect([
      await destination!.stub.deliver({ to: create.to, from: { at: directory, seq: 0, hash }, n: 3, message: create.message }),
      await destination!.stub.summary(reader),
      ((await D.stub.outbox(reader)) as { value: readonly { duty: string; held: boolean; acknowledged: unknown; result: unknown }[] }).value.map((duty) => [duty.duty, duty.held, duty.acknowledged !== null, duty.result !== null]),
    ]).toEqual([
      { answer: "retry", reason: "unsupported-definition" }, { ok: false, reason: "not-found" },
      // The result of the directory's own creation, the three creations, and the two confirmations. Only the third creation is unanswered.
      [["0.0", false, true, false], ["0.1", false, true, true], ["0.2", false, true, true], ["0.3", false, false, false], [expect.any(String), false, true, false], [expect.any(String), false, true, false]],
    ]);
    wired.delete(R.name);
  });
});
