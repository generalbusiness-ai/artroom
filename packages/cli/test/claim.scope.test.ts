import { describe, expect, test, onTestFinished } from "vitest";
import type { Entry, OperationId, ScopeId, Seed, SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, intentDigest, scopeIdOf, seedDigest, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { DIRECTORY_OF, repositoryName } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { captureSignedSummary, installSignedDiagnostic } from "../../scope/test/signed-read-diagnostic.ts";
import { beginSessionFixture, type SessionOwner } from "../../scope/test/session-settings.ts";
import { Platform, routed } from "../../scope/test/repository.ts";
import { outsideOf, wired } from "../../scope/test/outside.ts";
import { command, memoryStore, type Context } from "../src/index.ts";

const SERVICE = "https://scopes.test";
/** The test's own reader, which the command never presents. */
const reader = "a test reader";

// Invariant: a claim that gives up waiting is kept as pending, and a second run goes on from it with no second `found`; only
// `--again` signs a new found; uncertain found/seat/first-key delivery retries
// exactly the saved signature across real scope restarts, with no duplicate
// guarded mutation. The config never holds a signing key.
//
// Every scope is a Durable Object of the namespace `PLATFORM`, as in `story.scope.test.ts`, and every request of the command goes
// through the Worker's HTTP routes. The readers are the real read sessions and signed reads, under a TEST SECRET. Three STAND-INs:
// the Git host is `OutsideDouble`, the register's outside port, which at first sends nothing, as the deployed register did before
// its Git host settings were set; the scheduler is `pause`, which runs the dispatchers only, so that no pass of the register's
// operations driver runs but the one its own object starts; and the clock is the namespaces' scripted clock.
describe("claim resumes a claim it gave up on. The Git host and the scheduler are STAND-INs", () => {
  test("claim keeps exact requests across loss before found delivery and after accepted seat/first-key replies; settings restart and --again preserve distinct founds, with no duplicate enrollment or signing-key exposure", async () => {
    const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: reader });
    const cleanups: (() => void)[] = [];
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      for (const cleanup of cleanups.reverse()) cleanup();
      owner.close();
    };
    onTestFinished(close);
    // Captured, identity-bearing no-op hooks cannot overwrite later fixtures.
    const installedHold = () => !owner.isCurrent();
    const installedDeaf = () => !owner.isCurrent();
    net.hold = installedHold; net.deaf = installedDeaf;
    cleanups.push(() => { if (net.hold === installedHold) net.hold = null; if (net.deaf === installedDeaf) net.deaf = null; });
    try {
      await owner.required(() => resumed(owner, cleanups, () => { owner.active(); net.clock.now = timeOf(timeMs(net.clock.now)! + 30_000); }));
    } finally { close(); }
  });
});

async function resumed(owner: SessionOwner, cleanups: (() => void)[], advanceClock: () => void): Promise<void> {
  // HTTP fault injection is a STAND-IN only for loss: accepted turns below
  // are still the actual Worker's. Lost replies are cancelled before throwing.
  let beforeFound = false;
  let unavailableFound = false;
  let unavailableSettlement = false;
  let mismatchedDefinition = false;
  const requestedPaths: string[] = [];
  let after: "seat" | "first-key" | null = null;
  let watchingAgain = false;
  const watched: { diagnostic: ReturnType<typeof captureSignedSummary> | null; unavailable: boolean } = { diagnostic: null, unavailable: false };
  let watchedGets = 0;
  const sent: Record<string, SignedIntent[]> = { found: [], seat: [], "first-key": [] };
  const fetch = (async (url: string, init?: RequestInit) => owner.required(async () => {
    owner.active();
    requestedPaths.push(new URL(url).pathname);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { signed?: SignedIntent } : null;
    const settlement = new URL(url).pathname.endsWith("/settle");
    if (settlement && unavailableSettlement) { unavailableSettlement = false; return Response.json({ ok: false, reason: "unavailable" }); }
    // Settlement is a read-only POST, never a mutation delivery/fault target.
    const signed = new URL(url).pathname.endsWith("/acts") ? body?.signed : undefined;
    const kind = signed?.intent.kind;
    if (signed && kind && sent[kind]) sent[kind]!.push(structuredClone(signed));
    if (kind === "found" && beforeFound) { beforeFound = false; throw new Error("scripted loss before found delivery"); }
    // STAND-IN for an unavailable reply, before delivery to the real Worker.
    if (kind === "found" && unavailableFound) { unavailableFound = false; return Response.json({ answer: "unavailable", reason: "unavailable" }); }
    const url_ = new URL(url);
    const authorization = new Headers(init?.headers).get("authorization");
    if (watchingAgain && url_.pathname === `/v1/scopes/${registerName}` && (init?.method ?? "GET") === "GET") {
      watchedGets++;
      if (watchedGets === 1 && authorization?.startsWith("Signed ")) {
        try { watched.diagnostic = captureSignedSummary(owner, registerName, authorization); cleanups.push(watched.diagnostic.close); }
        catch { watched.unavailable = true; }
      }
    }
    let response: Response;
    try { response = await routed(url, init); }
    finally { if (watchingAgain && watchedGets > 0) watched.diagnostic?.close(); }
    owner.active();
    if (kind === "found" && mismatchedDefinition) {
      mismatchedDefinition = false;
      // The Worker really admits the exact request under @3. Only this HTTP
      // response metadata is scripted; the actual core's receipt is checked.
      const actual = await response.json() as { answer: string; receipt: { definition: string } };
      owner.active();
      expect([actual.answer, actual.receipt.definition]).toEqual(["accepted", "platform:register@3"]);
      return Response.json({ ...actual, receipt: { ...actual.receipt, definition: "platform:register@1" } });
    }
    if (kind === after) { after = null; await response.body?.cancel(); owner.active(); throw new Error("scripted loss after accepted enrollment"); }
    return response;
  })) as unknown as Fetch;
  // STAND-IN for the scheduler: the dispatchers of the scopes the command waits on. No pass of an operations driver.
  const platform = (scope: ScopeId) => new class extends Platform {
    override get object() { owner.active(); return super.object; }
    override get stub(): Platform["stub"] {
      owner.active();
      const stub = super.stub;
      return new Proxy(stub, { get(target, property) {
        const method = Reflect.get(target, property, target) as unknown;
        if (typeof method !== "function") return method;
        return (...args: unknown[]) => owner.required(async () => {
          owner.active();
          const answer: unknown = await Reflect.apply(method, target, args);
          owner.active();
          return answer;
        });
      } });
    }
    override restart() { return owner.required(() => super.restart()); }
  }(scope);
  const pause = async (waiting: readonly string[]) => {
    const nodes = waiting.map(scope => platform(scope as ScopeId));
    let passes = 0;
    for (let made = 1; made > 0;) {
      if (++passes > 64) expect.fail("The owned dispatch fixture did not quiesce within 64 passes.");
      owner.active(); made = 0;
      for (const node of nodes) { owner.active(); made += await node.stub.dispatch(); owner.active(); }
    }
  };
  const rita: Context = { store: memoryStore(), fetch, now: () => { owner.active(); return timeMs(net.clock.now)!; }, pause, tries: 3 };
  // A fresh command context each time; only the store survives. memoryStore
  // stands for local file persistence, and server restarts below are actual.
  const run = (...argv: string[]) => owner.required(() => command({ ...rita }, argv));
  let registerName = "";
  const configOf = () => owner.required(() => rita.store.config());
  const secrets = async () => (await owner.required(() => Promise.all([rita.store.secret("operator"), rita.store.secret("recovery")]))).filter((s) => s !== null).map((s) => b64url(s!));
  const noSecret = async () => { const text = JSON.stringify(await configOf()); for (const secret of await secrets()) expect(text).not.toContain(secret); };

  expect((await run("install", SERVICE, "--host", "git.example", "--namespace", "artroom")).code).toBe(0);
  owner.active();
  const R = platform((await configOf())!.register!.scope);
  registerName = R.name;
  const directoryDefinition = DIRECTORY_OF[(await owner.required(() => R.summary())).value.definition]!;
  // STAND-IN: the register's Git host, which sends nothing yet: no settings.
  const host = outsideOf(R.name);
  owner.active();
  host.accepting = false;
  // The register is unique to the install signature kept in this memory store.
  // Do not revive any previous factory or undo its host after ownership ends.
  const ownedOutside = {
    accepts: () => owner.isCurrent() && host.accepts(),
    send: (request: Parameters<typeof host.send>[0]) => owner.required(() => host.send(request)),
    late: (deliver: Parameters<typeof host.late>[0]) => host.late((...args) => owner.required(() => deliver(...args))),
  };
  const installedWiring = () => { owner.active(); return { outside: ownedOutside }; };
  wired.set(R.name, installedWiring);
  cleanups.push(() => { if (wired.get(R.name) === installedWiring) wired.delete(R.name); });
  cleanups.push(installSignedDiagnostic(owner, R.name));
  await owner.required(() => R.restart());
  const founds = async () => (await owner.required(() => R.entries())).filter((entry): entry is Entry & { input: { type: "act" } } => entry.input.type === "act" && entry.input.signed.intent.kind === "found");

  // Save before delivery: the first POST never reaches the Worker. A resume
  // must resend the exact bytes rather than wait forever on an absent digest.
  beforeFound = true;
  const unsent = await run("claim", "demo", "--handle", "@rita");
  expect(unsent).toMatchObject({ code: 1, lines: [expect.stringMatching(/^No answer:/)] });
  const savedFound = (await configOf())!.claim!.found!.signed;
  expect([(await founds()).length, sent["found"]]).toEqual([0, [savedFound]]);
  const beforeLegacy = (await configOf())!;
  await owner.required(async () => rita.store.save({ ...beforeLegacy, claim: { register: beforeLegacy.claim!.register, intent: beforeLegacy.claim!.intent, handle: beforeLegacy.claim!.handle } }));
  expect(await run("claim", "demo")).toMatchObject({ code: 1, lines: [expect.stringMatching(/^This pending claim has only a digest and no readable admitted directory/)] });
  expect([(await founds()).length, sent["found"]!.length]).toEqual([0, 1]);
  await owner.required(async () => rita.store.save(beforeLegacy));
  unavailableFound = true;
  expect(await run("claim", "demo")).toEqual({ code: 1, lines: [`Unavailable: unavailable. Outcome unknown; no acceptance is confirmed. Inspect artroom log ${R.name} before another mutation. Recovery requires the same original signed envelope; repeating a generic command signs a new request.`] });
  expect((await configOf())!.claim!.found!.signed).toEqual(savedFound);
  expect((await founds()).length).toBe(0);
  advanceClock();
  await owner.required(() => R.restart());
  // The same found is admitted once; it then gives up waiting on Git settings.
  const first = await run("claim", "demo", "--handle", "@rita");
  const resume = "run artroom claim demo again to go on waiting for this claim, or with --again to sign a new one, which creates a second repository.";
  expect(first).toEqual({ code: 1, lines: [`Gave up waiting for the directory after 3 reads. What was asked may still take effect; ${resume}`] });
  const pending = (await configOf())!;
  expect([pending.repository, pending.claim]).toEqual([undefined, { register: R.name, intent: expect.stringMatching(/^sha256:/), handle: "@rita", found: { signed: savedFound, accepted: expect.objectContaining({ at: await owner.required(() => R.at()), seq: 1 }) } }]);
  expect(sent["found"]).toEqual([savedFound, savedFound, savedFound]);
  await noSecret();
  expect([(await founds()).length, host.sent.length]).toEqual([1, 0]);

  // --again signs a second found. A mismatched known definition in its
  // accepted reply stops before directory routing, keeping the exact request.
  mismatchedDefinition = true;
  const beforeMismatch = requestedPaths.length;
  watchingAgain = true;
  let again: Awaited<ReturnType<typeof command>>;
  try { again = await run("claim", "demo", "--handle", "@rita", "--again"); }
  finally { watchingAgain = false; watched.diagnostic?.close(); }
  const safeDiagnostic = watched.diagnostic?.report() ?? { complete: false, released: true, ownerCurrent: owner.isCurrent(), records: [] };
  expect(again, JSON.stringify(safeDiagnostic)).toEqual({ code: 1, lines: ["No answer: The accepted reply names another register definition; its exact saved request remains pending."] });
  expect([watchedGets, watched.unavailable, safeDiagnostic.complete, safeDiagnostic.released, safeDiagnostic.ownerCurrent]).toEqual([1, false, true, true, true]);
  expect(safeDiagnostic.records.every(record => record.phase !== "unmarked")).toBe(true);
  expect(safeDiagnostic.records.filter(record => record.phase === "final-summary" && (record.stage === "local-summary-eligible" || record.stage === "genesis-root-summary-eligible" || record.stage === "genesis-root-summary-ineligible" || record.stage === "request-refused")).map(record => record.stage)).toEqual([expect.stringMatching(/^(local-summary-eligible|genesis-root-summary-eligible)$/)]);
  expect(requestedPaths.slice(beforeMismatch).every((path) => path.startsWith(`/v1/scopes/${R.name}`))).toBe(true);
  const second = (await configOf())!.claim!;
  expect([(await founds()).length, second.intent === pending.claim!.intent, second.found!.accepted, host.sent.length]).toEqual([2, false, undefined, 0]);
  await noSecret();

  // The Git host's settings are set, and the register's object restarts. The host will create each repository.
  owner.active();
  host.accepting = true;
  await owner.required(() => R.restart());
  for (const claim of await founds()) {
    const seed: Seed = { v: 1, kind: "directory", definition: directoryDefinition, creator: await owner.required(() => R.at()), cause: intentDigest(claim.input.signed.intent), ordinal: 0 };
    owner.active();
    host.answer(`${claim.seq}:0` as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: `repo-${claim.seq}` } } });
  }

  // The second claim reaches membership. Its accepted seat reply is lost:
  // preserve the exact request before that POST and retry it after a restart.
  after = "seat";
  const seatLoss = await run("claim", "demo");
  expect(seatLoss).toMatchObject({ code: 1, lines: [expect.stringMatching(/^No answer:/)] });
  const seatedPending = (await configOf())!.claim!;
  const M = platform(seatedPending.repository!.membership.scope);
  const enrollment = async (kind: string) => (await owner.required(() => M.entries())).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === kind);
  expect([(await enrollment("seat")).length, seatedPending.seat?.accepted, seatedPending.firstKey]).toEqual([1, undefined, undefined]);
  expect(sent["seat"]).toEqual([seatedPending.seat!.signed]);
  // Same founder key and handle, different room: a stale cache cannot splice
  // the first claim's actual membership into the second directory's refs.
  const originalSeated = (await configOf())!;
  unavailableSettlement = true;
  const beforeUnavailableMarker = [sent["found"]!.length, sent["seat"]!.length, sent["first-key"]!.length];
  expect(await run("claim", "demo")).toEqual({ code: 1, lines: ["Cannot confirm the saved found step: unavailable. The exact request remains pending; nothing was submitted."] });
  expect(await configOf()).toEqual(originalSeated);
  expect([sent["found"]!.length, sent["seat"]!.length, sent["first-key"]!.length]).toEqual(beforeUnavailableMarker);
  // A real receipt for the first claim cannot skip the second found step,
  // even though it has the same register, incarnation and signing key.
  await owner.required(async () => rita.store.save({ ...originalSeated, claim: { ...seatedPending, found: { signed: seatedPending.found!.signed, accepted: pending.claim!.found!.accepted! } } }));
  const beforeMarker = [sent["found"]!.length, sent["seat"]!.length, sent["first-key"]!.length];
  expect(await run("claim", "demo")).toEqual({ code: 1, lines: ["The saved accepted fact does not match this exact claim step; nothing was submitted."] });
  expect([sent["found"]!.length, sent["seat"]!.length, sent["first-key"]!.length]).toEqual(beforeMarker);
  await owner.required(async () => rita.store.save(originalSeated));
  const firstSeed: Seed = { v: 1, kind: "directory", definition: directoryDefinition, creator: await owner.required(() => R.at()), cause: pending.claim!.intent, ordinal: 0 };
  const firstDirectory = platform(scopeIdOf(firstSeed));
  const firstBirths = (await owner.required(() => firstDirectory.entries()))[0]!.sends;
  const firstMembership = platform(scopeIdOf(firstBirths.find((send) => "creator" in send.to && send.to.kind === "membership")!.to as Seed));
  const { seat: _seat, firstKey: _firstKey, ...withoutEnrollment } = seatedPending;
  await owner.required(async () => rita.store.save({ ...originalSeated, claim: { ...withoutEnrollment, repository: { ...seatedPending.repository!, membership: await owner.required(() => firstMembership.at()) } } }));
  const beforeMix = [sent["seat"]!.length, sent["first-key"]!.length];
  expect(await run("claim", "demo")).toEqual({ code: 1, lines: ["The saved repository references do not match this claim; nothing was submitted."] });
  expect([sent["seat"]!.length, sent["first-key"]!.length]).toEqual(beforeMix);
  await owner.required(async () => rita.store.save(originalSeated));
  advanceClock();
  await owner.required(() => M.restart());
  after = "first-key";
  const keyLoss = await run("claim", "demo");
  expect(keyLoss).toMatchObject({ code: 1, lines: [expect.stringMatching(/^No answer:/)] });
  const keyedPending = (await configOf())!.claim!;
  expect([(await enrollment("seat")).length, (await enrollment("first-key")).length, keyedPending.firstKey?.accepted]).toEqual([1, 1, undefined]);
  expect(sent["seat"]).toEqual([seatedPending.seat!.signed, seatedPending.seat!.signed]);
  expect(sent["first-key"]).toEqual([keyedPending.firstKey!.signed]);
  advanceClock();
  await owner.required(() => M.restart());
  // Retry the exact accepted first-key request. No second seat/key is admitted.
  const resumedClaim = await run("claim", "demo");
  expect(resumedClaim.code, resumedClaim.lines.join("\n")).toBe(0);
  const config = (await configOf())!;
  expect([config.claim, config.handle, resumedClaim.lines[1], resumedClaim.lines[2]]).toEqual([undefined, "@rita", "Definitions: platform:directory@3, platform:membership@2, platform:rules@2, platform:destination@3.", expect.stringMatching(/^You are @rita, an admin, on key key_\S+; your inbox is sc_\S+\.$/)]);
  const D = platform(config.repository!.directory.scope);
  expect((await owner.required(() => D.entries()))[0]!.uses.map((use) => use.fact.seq)).toContain((await founds())[1]!.seq);
  // No third found; each creation attempt was sent once, by the pass that the register's first call after its restart started.
  expect([(await founds()).length, host.attempts.sort()]).toEqual([2, [`${(await founds())[0]!.seq}:0#1`, `${(await founds())[1]!.seq}:0#1`].sort()]);
  expect([(await enrollment("seat")).length, (await enrollment("first-key")).length]).toEqual([1, 1]);
  expect(sent["first-key"]).toEqual([keyedPending.firstKey!.signed, keyedPending.firstKey!.signed]);
  expect(sent["found"]).toEqual([savedFound, savedFound, savedFound, second.found!.signed, second.found!.signed]); // The mismatched reply retries only its exact admitted envelope.
  await noSecret();
  // A legacy digest can recover its exact admitted found from the real
  // directory's retained claim, and its already admitted enrollment from
  // membership. These are read-only recoveries, never invented signatures.
  const { repository: _repository, handle: _handle, ...withoutRepository } = config;
  const beforeLegacySends = [sent["found"]!.length, sent["seat"]!.length, sent["first-key"]!.length];
  const legacy = { ...withoutRepository, claim: { register: second.register, intent: second.intent, handle: second.handle } };
  await owner.required(async () => rita.store.save(legacy));
  const legacyRecovered = await run("claim", "demo");
  expect(legacyRecovered.code, legacyRecovered.lines.join("\n")).toBe(0);
  expect([sent["found"]!.length, sent["seat"]!.length, sent["first-key"]!.length]).toEqual(beforeLegacySends);
  expect((await configOf())!.repository!.membership).toEqual(config.repository!.membership);
}
