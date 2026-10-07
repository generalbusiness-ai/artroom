import { describe, expect, test } from "vitest";
import type { Intent, PlatformDefinition, Seed } from "@generalbusiness/artroom-contract";
import { factRefOf, intentDigest, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { firstExtents, foundingObjects, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { foundingPublication } from "./publication.ts";
import { Platform, rita, routed, sam, settle } from "./repository.ts";

const { paul } = keys;
const SERVICE = "https://scopes.test";

// Invariant (the planner's decision of 2026-10-07): a scope is judged and replayed by the version that its genesis pinned, for as
// long as it exists, and a deployment serves every version that its platform package has shipped. A room founded on version 1 runs
// on the code that ships version 2: it has no `read-token`, and every one of its histories replays consistent.
//
// | Part | Is |
// |---|---|
// | The register, the directory, membership, the rules scope, the destination and the inbox | Real scopes of the namespace `PLATFORM`: the deployed class, the production authority and the platform package's own data and rules, under version 1 of each. |
// | The Git host | A STAND-IN: `OutsideDouble` answers the one creation request and the founding publication's operations. |
// | The readers and the clock | The test readers and the scripted clock of the namespace. |
describe("a room founded on version 1 of every definition, on the code that ships version 2. The Git host is a STAND-IN", () => {
  test("a register founded on platform:register@1 founds its whole room on version 1; its first head is the empty tree; read-token is refused by name and writes nothing; a grant read from membership states version 1; every history replays consistent, and replays with mismatch when version 1 is judged by version 2's code", async () => {
    net.hold = net.deaf = null;
    const REGISTER_1: PlatformDefinition = "platform:register@1";
    const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "artroom", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER_1, creator: null, cause: intentDigest(install), ordinal: 0 }));
    const host = outsideOf(R.name);
    wired.set(R.name, () => ({ outside: host }));
    expect((await R.stub.found(signIntent(install, paul.secret), REGISTER_1)).answer).toBe("accepted");
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
    // Version 1 of the register seeds the directory under version 1.
    const seed: Seed = { v: 1, kind: "directory", definition: "platform:directory@1", creator: await R.at(), cause: intentDigest(found.intent), ordinal: 0 };
    const D = new Platform(scopeIdOf(seed));
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: "repo-1" } } });
    expect((await R.stub.submit(found, [])).answer).toBe("accepted");
    while ((await (R.stub as unknown as { effect(): Promise<number> }).effect()) > 0) { /* each pass may make the next one due */ }
    await settle(R, D);
    const sent = (await D.entries())[0]!.sends;
    const [M, rules, G] = [1, 2, 3].map((n) => new Platform(scopeIdOf(sent.find((send) => send.n === n)!.to as Seed))) as [Platform, Platform, Platform];
    await settle(R, D, M, rules, G);
    wired.delete(R.name);
    const seat = await M.did(rita, "seat", { expected: { roster: 1 } });
    await M.did(rita, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const inbox = new Platform(scopeIdOf((await M.entries())[seat]!.sends.find((send) => "definition" in send.to)!.to as Seed));
    await settle(M, inbox);
    const nodes = [R, D, M, rules, G, inbox];
    expect(await Promise.all(nodes.map(async (node) => (await node.summary()).value.definition))).toEqual([
      "platform:register@1", "platform:directory@1", "platform:membership@1", "platform:rules@1", "platform:destination@1", "platform:inbox@1",
    ]);
    // Membership's version 1 gives the admin its first list without `destination.read-token`.
    expect((await M.item(0)).values["adminActions"]).not.toContain("destination.read-token");

    // The founding publication: the first head is version 1's founding commit, the empty tree, with no README.
    await foundingPublication(G);
    const emptyTree = foundingObjects("sha1", G.name, (await G.entries())[0]!.time, factRefOf((await R.entries())[1]!));
    expect(await G.item(0)).toMatchObject({ state: "ready", values: { head: emptyTree.commit } });

    // `read-token` is no act of `platform:destination@1`: the scope refuses it by name, and writes nothing.
    const before = (await G.summary()).at;
    expect(await G.act(rita, "read-token", { on: 0, expected: await G.expected({ on: 0 }), fields: { hours: 1 } })).toMatchObject({ answer: "refused", reason: "unknown-act" });
    expect((await G.summary()).at).toEqual(before);

    // An act whose grant is read from membership: the admin publishes rules. The rules scope retains membership's answer, which
    // states the version that membership pinned, so the replay below derives that answer again under version 1.
    const published = await rules.act(rita, "publish", { on: 0, expected: await rules.expected({ on: 0 }), fields: { approvals: 2, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 2, checks: [] }) as never } });
    expect(published.answer).toBe("accepted");
    const retained = (await rules.entries()).at(-1)!.input;
    expect(retained.type === "act" ? retained.authority.map((grant) => grant.fresh.observation.definition) : null).toEqual(["platform:membership@1"]);

    // Every history replays consistent with the package that ships version 2, which serves version 1 as it shipped.
    const options = { mode: "replay", grants: "proven" } as const;
    for (const node of nodes) {
      const { report, why } = await verify(httpSource(SERVICE, { fetch: routed }), { ...options, platform, scope: node.name, head: (await node.summary()).at });
      expect([(await node.at()).kind, report.result, why]).toEqual([(await node.at()).kind, "consistent", null]);
    }
    // Control: the finding of 2026-10-07. A verifier that judges version 1 by version 2's code reports membership's history as a
    // mismatch: its genesis wrote version 1's first lists.
    const newestOnly = (named: string) => platform(named.replace(/@1$/, "@2"));
    const { report } = await verify(httpSource(SERVICE, { fetch: routed }), { ...options, platform: newestOnly, scope: M.name, head: (await M.summary()).at });
    expect(report.result).toBe("mismatch");
  });
});
