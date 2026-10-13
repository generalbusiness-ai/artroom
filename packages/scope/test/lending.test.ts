import { expect, onTestFinished, test } from "vitest";
import type { Entry, Intent, Seed } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, isSeed, scopeIdOf, seedDigest, textDigest, timeMs } from "@generalbusiness/artroom-bytes";
import { requestSession, sessionRequest, type Fetch } from "@generalbusiness/artroom-client";
import { command, memoryStore, type Context } from "../../cli/src/index.ts";
import { keys, type Actor } from "@generalbusiness/dap-derive/testing";
import { APPLICATION_COHORT, FIRST_ACTIONS_OF, platform, repositoryName } from "@generalbusiness/dap-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { lending } from "../../../examples/lending/definition.ts";
import { LENDING_DEFINITION } from "../../../examples/lending/pin.ts";
import { NO_OUTSIDE } from "../src/index.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { Platform, rita, routed, sam } from "./repository.ts";
import { dispatchFixture } from "./support/native-fixture-lifetime.ts";
import { siteFixtureLifetime } from "./support/site-fixture-lifetime.ts";

const SERVICE = "https://scopes.test";

// The lending library of notes/2026-10-13-lending-library.md on real scopes: the
// application cohort installed by the command line, real membership, invitations,
// role lists and authority, the real application factory, SQLite and replay.
// The Git host, the clock and the local memoryStore are labelled STAND-INS. No
// shelf page, change lane or browser runs here: this shows the lending scope alone.
test("the lending library on real scopes: Nasruddin and the pot, its refusals, another member's return, the 64-thing bound, and roles that keep their earlier actions", async () => {
  const lifetime = siteFixtureLifetime();
  const settle = (...nodes: readonly Platform[]) => dispatchFixture(nodes, lifetime.wait);
  let releaseRegister = () => {};
  onTestFinished(() => releaseRegister());
  class OwnedPlatform extends Platform {
    override get stub() {
      const target = super.stub;
      return new Proxy(target, { get(source, key) {
        const value: unknown = Reflect.get(source, key, source);
        return typeof value === "function" ? (...args: unknown[]) => lifetime.wait(() => Promise.resolve(Reflect.apply(value, source, args))) : value;
      } });
    }
    override async created(seq: number, n = 0): Promise<Platform> {
      const send = (await lifetime.wait(() => this.entries()))[seq]?.sends.find((candidate) => candidate.n === n);
      if (!send || send.message.class !== "request" || send.message.type !== "create" || !isSeed(send.to)) throw new Error("a created scope requires an actual create request with a validated seed");
      return new OwnedPlatform(scopeIdOf(send.to));
    }
  }
  const store = memoryStore();
  await lifetime.wait(() => store.keep("operator", rita.secret));
  const fetch: Fetch = (url, init) => lifetime.wait(() => routed(url, init));
  const context: Context = { store, fetch, trustedFoundingService: { service: SERVICE, fetch },
    now: () => { lifetime.active(); return timeMs(soon(0))!; } };
  const run = (...argv: string[]) => lifetime.wait(() => command(context, argv));
  const planned = await run("install", "--plan", SERVICE, "--cohort", "application", "--host", "git.example", "--namespace", "lending");
  expect(planned.code, planned.lines.join("\n")).toBe(0);
  const plan = (await lifetime.wait(() => store.config()))?.plan;
  if (!plan) throw new Error("The CLI must retain the original application install plan.");
  const R = new OwnedPlatform(plan.register);
  try {
    const host = outsideOf(R.name);
    const ports = () => { lifetime.active(); return { outside: host }; };
    wired.set(R.name, ports);
    releaseRegister = () => { if (wired.get(R.name) === ports) wired.delete(R.name); };
    const installed = await run("install", "--planned", "--cohort", "application");
    expect(installed.code, installed.lines.join("\n")).toBe(0);

    // The neighbour (rita) claims the room. She is its founder and admin.
    const neighbour = rita, nasruddin = keys.una, passerby = keys.vic;
    const claim = await R.intent(neighbour, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@neighbour", recoveryKey: sam.key } });
    const directorySeed: Seed = { v: 1, kind: "directory", definition: APPLICATION_COHORT.directory, creator: await R.at(), cause: intentDigest(claim.intent), ordinal: 0 };
    const D = new OwnedPlatform(scopeIdOf(directorySeed));
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(directorySeed), 1), id: "lending-fixture" } } });
    expect(await R.stub.submit(claim, [])).toMatchObject({ answer: "accepted" });
    await (R.stub as unknown as { effect(): Promise<number> }).effect();
    await settle(R, D);
    const child = async (kind: Seed["kind"]) => {
      const send = (await D.entries())[0]!.sends.find((candidate) => isSeed(candidate.to) && candidate.to.kind === kind);
      if (!send || !isSeed(send.to)) throw new Error(`the directory did not create its ${kind}`);
      return new OwnedPlatform(scopeIdOf(send.to));
    };
    const M = await child("membership"), Q = await child("rules"), G = await child("destination");
    await settle(R, D, M, Q, G);
    expect([(await D.summary()).value.definition, (await M.summary()).value.definition, (await Q.summary()).value.definition, (await G.summary()).value.definition])
      .toEqual([APPLICATION_COHORT.directory, APPLICATION_COHORT.membership, APPLICATION_COHORT.rules, APPLICATION_COHORT.destination]);
    const seat = await M.did(neighbour, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(neighbour, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    const membership = await M.at();
    for (const [who, handle] of [[nasruddin, "@nasruddin"], [passerby, "@passerby"]] as const) {
      const secret = `lending-${handle}-invitation-secret-of-at-least-32-bytes`;
      const invitation = await M.did(neighbour, "invite-member", { fields: { handle, role: "member", inviteHash: textDigest(secret), inviteEnds: soon(60) } });
      await M.did(who, "join", { fields: { invitation, secret } });
    }

    // Activate the exact pin and establish the application. The opener is the only
    // genesis field and the factory supplies it, so the values are the empty object.
    const bytes = canonicalize(lending);
    expect(await Q.stub.submit(await Q.intent(neighbour, "activate", { fields: { digest: LENDING_DEFINITION, name: lending.name } }), [], { values: [bytes] })).toMatchObject({ answer: "accepted" });
    const ask = async (who: Actor) => D.intent(who, "establish-application", { expected: await D.expected({ repository: 0 }), fields: { definition: LENDING_DEFINITION, values: "{}", execution: "recorded-do" } });
    expect(await D.stub.submit(await ask(nasruddin), [], { values: [bytes] })).toMatchObject({ answer: "refused", reason: "unauthorized" });
    const established = await D.stub.submit(await ask(neighbour), [], { values: [bytes] });
    expect(established.answer, JSON.stringify(established)).toBe("accepted");
    if (established.answer !== "accepted") throw new Error("the application factory refused the lending definition");
    const L = await D.created(established.receipt.fact.seq);
    lifetime.wire(L.name, () => NO_OUTSIDE);
    await settle(D, L);
    expect((await L.summary()).value).toMatchObject({ definition: LENDING_DEFINITION, status: "active",
      items: [{ type: "library", state: "open", parties: { founder: { membership, member: "@neighbour" } } }] });

    // Enrollment and the factory grant no lending action by implication.
    const donation = (name: string, description: string): Partial<Intent> => ({ fields: { name, description } });
    expect(await L.act(neighbour, "donate", donation("Big pot", "A heavy copper pot. Holds eight litres."))).toMatchObject({ answer: "refused", reason: "unauthorized" });

    // Staff is the action lending.staff on a role membership already has. set-actions
    // replaces a role's whole list, so each grant restates what the role held.
    const first = FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]!;
    const lists = { admin: [...first.admin, "lending.member", "lending.staff"], member: [...first.member, "lending.member"] };
    for (const role of ["admin", "member"] as const) await M.did(neighbour, "set-actions", { on: 0, expected: await M.expected({ on: 0 }), fields: { role, actions: lists[role] } });
    lifetime.advance(301); // The earlier grant's reuse window ends; this is no claim of immediate revocation.
    // The roles kept their earlier actions: the admin can still invite, and still administers roles.
    await M.did(neighbour, "invite-member", { fields: { handle: "@later", role: "member", inviteHash: textDigest("lending-later-invitation-secret-of-at-least-32-bytes"), inviteEnds: soon(60) } });
    await M.did(neighbour, "set-actions", { on: 0, expected: await M.expected({ on: 0 }), fields: { role: "member", actions: lists.member } });
    lifetime.advance(301);

    const on = async (thing: number): Promise<Partial<Intent>> => ({ on: thing, expected: await L.expected({ on: thing }) });
    const head = async () => (await L.summary()).at;
    const refused = async (answer: Promise<unknown>, reason: string) => {
      const before = await head();
      expect(await answer).toMatchObject({ answer: "refused", reason });
      expect(await head()).toEqual(before);
    };
    const person = (handle: string) => ({ membership, member: handle });

    // 1 to 3: the neighbour donates the big pot; Nasruddin borrows it and returns it.
    const big = await L.did(neighbour, "donate", donation("Big pot", "A heavy copper pot. Holds eight litres."));
    await L.did(nasruddin, "borrow", await on(big));
    expect(await L.item(big)).toMatchObject({ state: "lent", parties: { donor: person("@neighbour"), borrower: person("@nasruddin") } });
    await refused(L.act(passerby, "borrow", await on(big)), "guard-failed");
    await L.did(nasruddin, "return", await on(big));
    expect(await L.item(big)).toMatchObject({ state: "available", parties: { borrower: null } });

    // 4: the small pot is not a thing in the library, so a return has no item to name.
    const things = async () => (await L.summary()).value.items.filter((item) => item.type === "thing");
    expect((await things()).map((thing) => thing.values["name"])).toEqual(["Big pot"]);

    // 5: Nasruddin donates it in his own words. The scope does not judge the description.
    const small = await L.did(nasruddin, "donate", donation("Small pot", "Baby born when the big pot was with me"));
    expect(await L.item(small)).toMatchObject({ state: "available", parties: { donor: person("@nasruddin") }, values: { description: "Baby born when the big pot was with me" } });

    // 6 to 8: he borrows the big pot again and says it died. Only staff cancel.
    await L.did(nasruddin, "borrow", await on(big));
    await refused(L.act(nasruddin, "cancel", { ...await on(big), fields: { reason: "The pot died" } }), "unauthorized");
    const lent = (await L.item(big)).revision;
    const cancelled = await L.did(neighbour, "cancel", { ...await on(big), fields: { reason: "Nasruddin says the pot died" } });
    // A thing that is gone has left the summary, which lists live items. Its end and its reason are in the record.
    expect((await things()).map((thing) => thing.id)).toEqual([small]);
    expect((await L.entries())[cancelled]).toMatchObject({ input: { type: "act", signed: { intent: { actor: neighbour.key, kind: "cancel", on: big, fields: { reason: "Nasruddin says the pot died" } } } } });
    expect((await L.entries())[1]!.input).toMatchObject({ type: "delivery", message: { class: "control", type: "confirm" } });

    // 9: the shelf is replenished. No act changes the thing that is gone.
    const fresh = await L.did(neighbour, "donate", donation("New big pot", "Copper, eight litres."));
    for (const [who, kind, fields] of [[nasruddin, "borrow", {}], [passerby, "return", {}], [neighbour, "cancel", { reason: "Again" }]] as const) {
      await refused(L.act(who, kind, { on: big, expected: { on: lent + 1 }, fields }), "final");
    }
    expect((await things()).map((thing) => [thing.id, thing.state])).toEqual([[small, "available"], [fresh, "available"]]);

    // The record: the genesis, the directory's confirmation of the creation, and the seven acts that took
    // effect, each with its signer. A refusal wrote nothing.
    const kindOf = (entry: Entry) => entry.input.type === "act" ? `${entry.input.signed.intent.kind} ${entry.input.signed.intent.actor}` : entry.input.type;
    expect((await L.entries()).map(kindOf)).toEqual(["genesis", "delivery", `donate ${neighbour.key}`, `borrow ${nasruddin.key}`, `return ${nasruddin.key}`,
      `donate ${nasruddin.key}`, `borrow ${nasruddin.key}`, `cancel ${neighbour.key}`, `donate ${neighbour.key}`]);

    // Anyone may return a lent thing: the passer-by brings back what Nasruddin borrowed.
    await refused(L.act(passerby, "return", await on(small)), "guard-failed");
    await L.did(nasruddin, "borrow", await on(small));
    await L.did(passerby, "return", await on(small));
    expect(await L.item(small)).toMatchObject({ state: "available", parties: { borrower: null } });

    // The state and the record survive a restart.
    const before = await L.summary();
    await lifetime.wait(() => L.restart());
    expect((await L.summary()).value).toEqual(before.value);

    // 64 live things. The gone pot does not count; the 65th donation is refused until a thing is cancelled.
    for (let n = 3; n <= 64; n++) await L.did(nasruddin, "donate", donation(`Thing ${n}`, "One of many."));
    expect(await things()).toHaveLength(64);
    await refused(L.act(nasruddin, "donate", donation("Thing 65", "One too many.")), "type-full");
    await L.did(neighbour, "cancel", { ...await on(fresh), fields: { reason: "Dented" } });
    await L.did(nasruddin, "donate", donation("Thing 65", "Room again."));

    // An independent reader replays the lending scope from its record, with the grants proven from membership.
    const issued = await lifetime.wait(() => requestSession(SERVICE, M.name, sessionRequest(membership, neighbour.secret, soon(60), crypto.randomUUID()), { fetch: routed as unknown as Fetch }));
    if (!issued.ok) throw new Error(`Read session refused: ${issued.reason}`);
    const final = await head();
    const replay = await lifetime.wait(() => verify(httpSource(SERVICE, { fetch, reader: issued.session.reader() }), { mode: "replay", platform, grants: "proven", scope: L.name, head: final }));
    expect([replay.report.result, replay.why]).toEqual(["consistent", null]);
  } finally {
    lifetime.release();
    releaseRegister();
  }
});
