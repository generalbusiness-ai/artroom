import { expect, test } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, unb64url, definitionDigest, sign, keyIdOfSecret, digestBytes, factRefOf, scopeIdOf, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents, CONFIGURATION_DOMAIN, platform } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { valueDigest } from "@generalbusiness/artroom-derive";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { ownHost, readerOf, type Stand } from "../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { command, memoryStore, expectedOf, type ActShape, type Context, type Outcome } from "../../cli/src/index.ts";
import { changeDemo3 } from "../src/index.ts";


// The actual CheckerService reads its signed job-bound reservation snapshot
// and submits its result to the real lane. Its storage and runner are labelled
// stand-ins; actual private Git checkout is a separate runner boundary witness.
import { signJobRead } from "../../checkers/src/signing.ts";
import { verifyReservationObjects } from "../../checkers/src/reservation-snapshot.ts";
import { originOf } from "../../checkers/src/job.ts";
import { CheckerService } from "../../checkers/src/service.ts";
import { Outcomes } from "../../checkers/src/store.ts";
import { MemoryDurable } from "../../checkers/test/support.ts";

import { room as legacyRoom, rita as legacyFounder } from "./support/room.ts";

const SERVICE = "https://scopes.test";
const reader = "a test reader";
test("a manifest-list reservation records both files before the configured checker passes; no branch push occurs before that pass (real scopes, STAND-IN Git host and scheduler)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
async function story(at: Stand, wired: Set<ScopeId>): Promise<void> {
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const now = () => timeMs(net.clock.now)!;
  const host = at.stand;
  let R: Platform | null = null;
  const bindings = () => at.bindings(R!.name);
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => at.outside(given, sql, bindings())); };
  // STAND-IN for the scheduler: each pass drives the operations of every scope the command waits on, and of the register and the
  // destination, then their dispatchers, until nothing is due.
  const known: Platform[] = [];
  const pause = async (waiting: readonly string[]) => {
    const nodes = [...known, ...waiting.filter((scope) => !known.some((node) => node.name === scope)).map((scope) => new Platform(scope as never))];
    for (let pass = 0; pass < 64; pass++) {
      let made = 0;
      for (const node of nodes) {
        while ((await (node.stub as unknown as { effect(): Promise<number> }).effect()) > 0) made++;
        made += await node.stub.dispatch();
      }
      if (made === 0) return;
    }
    await settle(...nodes);
  };

  const files: Record<string, Uint8Array> = { "change3.json": utf8(canonicalize(changeDemo3)), "one.md": utf8("# One\n"), "two.md": utf8("# Two\n") };
  const person = (): Context => ({ store: memoryStore(), fetch, now, pause, read: async (path) => files[path] ?? null });
  const founder = person(), checker = person();
  const run = (who: Context, ...argv: string[]) => command(who, argv);
  const ok = (outcome: Outcome) => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };
  ok(await run(founder, "install", SERVICE, "--host", at.host, "--namespace", at.namespace));
  R = new Platform((await founder.store.config())!.register!.scope); wire(R.name); await R.restart(); known.push(R);
  net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
  ok(await run(founder, "claim", "tree", "--handle", "@rita"));
  const repository = (await founder.store.config())!.repository!;
  const G = new Platform(repository.destination); known.push(G); await pause([]);
  expect((await G.summary()).value.definition).toBe("platform:destination@3");
  const first = host.refs.get("refs/heads/main")!;
  const invitation = ok(await run(founder, "invite", "@check", "--role", "checker")).lines[1]!.split(": ")[1]!;
  ok(await run(checker, "join", invitation));
  const checkMember = { membership: repository.membership, member: "@check" };
  const checkConfig = { name: "text", image: `sha256:${"7".repeat(64)}`, environment: [], steps: [["check", "text"]], judged: { passed: { status: 0, line: "ok" }, failed: { status: 1, line: "bad" } }, limits: { seconds: 60, outputBytes: 65536 } };
  files["config.json"] = utf8(canonicalize(checkConfig));
  const configuration = valueDigest(CONFIGURATION_DOMAIN, checkConfig);
  ok(await run(founder, "act", "keep-configuration", "--on", "rules", "--set", `digest=${configuration}`, "--set", "name=text", "--value", "config.json"));
  ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", `checks=${JSON.stringify([{ name: "text", configuration, required: true, checker: checkMember }])}`, "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [{ name: "text", required: true }] }))}`));
  ok(await run(founder, "act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "change3.json"));
  founder.git = { run: async () => 0, files: async () => ({ ok: true, tip: first, files: [{ path: "one.md", bytes: files["one.md"]! }, { path: "docs/two.md", bytes: files["two.md"]! }] }) };
  // Freeze the wrong-source controls on a separately opened collection.
  const opened = ok(await run(founder, "act", "open-pr", "--on", "directory", "--set", `definition=${definitionDigest(changeDemo3)}`, "--set", "title=source controls", "--set", "draft=false", "--value", "change3.json"));
  const openSeq = Number(/entry \S+:(\d+),/.exec(opened.lines[0]!)![1]);
  const D = new Platform(repository.directory.scope); await pause([D.name]);
  const controlLane = await D.created(openSeq); await pause([controlLane.name]);
  const source = ok(await run(founder, "act", "propose-file", "--on", controlLane.name, "--set", `base=${first}`, "--set", "path=one.md", "--set", `digest=${digestBytes(files["one.md"]!)}`, "--set", `size=${files["one.md"]!.length}`, "--set", "content=# One\n"));
  const sourceSeq = Number(/entry \S+:(\d+),/.exec(source.lines[0]!)![1]);
  const sourceEntry = (await controlLane.entries())[sourceSeq]!;
  const row = { path: "one.md", entry: factRefOf(sourceEntry), digest: digestBytes(files["one.md"]!) };
  const mismatch = await run(founder, "act", "propose-manifest", "--on", controlLane.name, "--set", `base=${first}`, "--set", `files=${JSON.stringify([{ ...row, digest: `sha256:${"e".repeat(64)}` }])}`);
  expect([mismatch.code, mismatch.lines[0]]).toEqual([1, expect.stringContaining("source-mismatch")]);
  const proposed = await run(founder, "propose", "topic");
  ok(proposed);
  const matched = /as change (sc_\S+), version (\d+)\./.exec(proposed.lines[0]!)!;
  const [lane, version] = [matched[1]!, Number(matched[2])];
  const L = new Platform(lane as ScopeId);
  const manifest = await L.item(version);
  expect([manifest.values["tree"], manifest.values["integration"], host.refs.get("refs/heads/main")]).toEqual([expect.stringMatching(/^[0-9a-f]{40}$/), expect.stringMatching(/^[0-9a-f]{40}$/), first]);
  expect(proposed.lines[1]).toMatch(/^Reserved: merge/);
  const requested = ok(await run(founder, "act", "request-check", "--on", lane, "--set", `manifest=${version}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  const job = Number(/entry \S+:(\d+),/.exec(requested.lines[0]!)![1]);
  expect((await L.item(job)).values["tree"]).toBe(manifest.values["tree"]);
  const badTree = await run(checker, "act", "check", "--on", lane, "--set", `job=${job}`, "--set", `tree=${"e".repeat(40)}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed");
  expect([badTree.code, badTree.lines[0], host.refs.get("refs/heads/main")]).toEqual([1, expect.stringContaining("not-this-job"), first]);
  const checkerSecret = (await checker.store.secret((await checker.store.config())!.key))!;
  const checkerKey = keyIdOfSecret(checkerSecret);
  const Gsnapshot = { reservationSnapshot: async (asked: import("@generalbusiness/artroom-contract").SignedIntent): Promise<import("@generalbusiness/artroom-contract").ReservationSnapshot | null> => {
    const response = await routed(`${SERVICE}/v1/scopes/${G.name}/reservation-snapshot`, { method: "POST", headers: { "content-type": "application/json" }, body: canonicalize({ signed: asked }) });
    if (response.status !== 200) return null;
    const value = await response.json() as Omit<import("@generalbusiness/artroom-contract").ReservationSnapshot, "objects"> & { objects: { id: string; type: "blob" | "tree" | "commit"; data: string }[] };
    return { ...value, objects: value.objects.map((object) => ({ ...object, data: unb64url(object.data)! })) };
  } };
  let runs = 0, prepares = 0;
  const service = new CheckerService({
    signer: { key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, outcomes: new Outcomes(new MemoryDurable()), clock: now, random: (length) => crypto.getRandomValues(new Uint8Array(length)),
    scopes: {
      entry: async (_scope, seq) => (await L.sealed())[seq] ?? null,
      pinned: async () => definitionDigest(changeDemo3), activated: async () => ({ name: "change", state: "active" }),
      configuration: async () => canonicalize(checkConfig),
      reservationSnapshot: async (_scope, asked) => Gsnapshot.reservationSnapshot(asked),
      prepare: async () => { prepares++; throw new Error("reservation snapshot must mint nothing"); },
      standing: async (_scope, id, kind) => { const items = (await L.summary()).value.items; const item = items.find((item) => item.id === id); return item ? { state: item.state, expected: expectedOf(changeDemo3.acts[kind] as unknown as ActShape, items, null, { job: id }) } : null; },
      submit: async (_scope, signed) => L.stub.submit(signed, []),
    },
    // Runner boundary STAND-IN here; actual object checkout is tested in checkers/runner.test.ts.
    runner: { find: async () => null, run: async (ask) => { runs++; expect(ask.job.snapshot?.tree).toBe(manifest.values["tree"]); expect(ask.job.snapshot?.sources).toHaveLength(2); return { started: true, image: checkConfig.image, environment: [], checkout: true, steps: [{ status: 0, line: "ok" }], end: "complete" }; } },
  });
  const jobEntry = (await L.sealed())[job]!;
  const jobFact = factRefOf(jobEntry.entry);
  const readAsk = await signJobRead({ key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, { lane: await L.at(), fact: jobFact }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  const snapshot = await Gsnapshot.reservationSnapshot(readAsk);
  expect(snapshot).not.toBeNull();
  if (snapshot) expect(originOf({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string }, { entry: jobEntry, pinned: definitionDigest(changeDemo3), activated: { name: "change", state: "active" }, manifest: (await L.sealed())[version]!, reservation: snapshot })).toMatchObject({ job: { tree: manifest.values["tree"], commit: manifest.values["integration"] } });
  if (snapshot) {
    expect(await verifyReservationObjects(snapshot)).toBe(true);
    const corrupt = { ...snapshot, objects: snapshot.objects.map((object, n) => n === 0 ? { ...object, data: Uint8Array.from([...object.data, 0]) } : object) };
    expect(await verifyReservationObjects(corrupt)).toBe(false);
    expect(originOf({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string }, { entry: jobEntry, pinned: definitionDigest(changeDemo3), activated: { name: "change", state: "active" }, manifest: (await L.sealed())[version]!, reservation: corrupt })).toEqual({ not: "no-manifest" });
  }
  const wrongKey = (await founder.store.secret((await founder.store.config())!.key))!;
  const wrongAsk = await signJobRead({ key: keyIdOfSecret(wrongKey), sign: (bytes) => sign(wrongKey, bytes) }, { lane: await L.at(), fact: jobFact }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  expect(await Gsnapshot.reservationSnapshot(wrongAsk)).toBeNull();
  const delivered = await service.deliver({ lane: await L.at(), job: factRefOf(jobEntry.entry), name: "text", tree: manifest.values["tree"] as string });
  expect([delivered, runs, prepares]).toEqual([{ did: "submitted", outcome: { act: "check", outcome: "passed" }, ran: true, lane: "admitted" }, 1, 0]);
  expect(await service.deliver({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string })).toEqual({ did: "nothing", why: "no-manifest" });
  expect(runs).toBe(1);
  await pause([lane, repository.destination]);
  const published = host.refs.get("refs/heads/main")!;
  expect(published).not.toBe(first);
  const git = readerOf(host); const commit = await git.commit(published);
  expect(commit.tree).toBe(manifest.values["tree"]);
  expect((await git.tree(commit.tree)).map((row) => new TextDecoder().decode(row.name))).toEqual(["README.md", "docs", "one.md"]);
  // The same command also waits for a publication when no check is owed.
  ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
  founder.git = { run: async () => 0, files: async () => ({ ok: true, tip: published, files: [{ path: "three.md", bytes: utf8("# Three\n") }, { path: "four.md", bytes: utf8("# Four\n") }] }) };
  const direct = ok(await run(founder, "propose", "next"));
  expect(direct.lines[1]).toMatch(/^Published: commit/);
  const lastPublished = host.refs.get("refs/heads/main")!;
  const blocked = person();
  const blockedInvite = ok(await run(founder, "invite", "@blocked", "--role", "maintainer")).lines[1]!.split(": ")[1]!;
  ok(await run(blocked, "join", blockedInvite));
  blocked.git = { run: async () => 0, files: async () => ({ ok: true, tip: lastPublished, files: [{ path: "AGENTS.md", bytes: utf8("# Authority\n") }, { path: "five.md", bytes: utf8("# Five\n") }] }) };
  const refused = await run(blocked, "propose", "policy");
  expect([refused.code, refused.lines[1], host.refs.get("refs/heads/main")]).toEqual([1, expect.stringContaining("rules-not-met:rules"), lastPublished]);
  // A second reservation cannot be disclosed to a compromised checker key.
  ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", `checks=${JSON.stringify([{ name: "text", configuration, required: true, checker: checkMember }])}`, "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [{ name: "text", required: true }] }))}`));
  const held = ok(await run(founder, "propose", "held"));
  const heldMatch = /as change (sc_\S+), version (\d+)\./.exec(held.lines[0]!)!;
  const heldLane = new Platform(heldMatch[1] as ScopeId), heldVersion = Number(heldMatch[2]);
  const heldRequest = ok(await run(founder, "act", "request-check", "--on", heldLane.name, "--set", `manifest=${heldVersion}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  const heldJob = Number(/entry \S+:(\d+),/.exec(heldRequest.lines[0]!)![1]);
  const heldFact = factRefOf((await heldLane.entries())[heldJob]!);
  const heldAsk = await signJobRead({ key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, { lane: await heldLane.at(), fact: heldFact }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  expect(await Gsnapshot.reservationSnapshot(heldAsk)).not.toBeNull();
  const M = new Platform(repository.membership.scope);
  const keyItem = (await M.summary()).value.items.find((item) => item.type === "key" && item.values["id"] === checkerKey)!;
  ok(await run(founder, "act", "revoke-key", "--on", "membership", "--target", String(keyItem.id), "--set", "as=compromised"));
  expect(await Gsnapshot.reservationSnapshot(heldAsk)).toBeNull();
  expect(host.refs.get("refs/heads/main")).toBe(lastPublished);
  const replayed = await verify(httpSource(SERVICE, { fetch: routed, reader }), { mode: "replay", scope: G.name, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE, head: (await G.summary()).at });
  expect([replayed.report.result, replayed.why ?? null]).toEqual(["consistent", null]);
}

test("a native version-2 room refuses branch list proposals before local Git capture", async () => {
  const old = await legacyRoom();
  const directory = await old.D.at(), membership = await old.M.at();
  platformNet.inspector = reader;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true;
  try {
    const store = memoryStore(); await store.keep("founder", legacyFounder.secret);
    await store.save({ v: 1, service: SERVICE, key: "founder", repository: { directory, membership, rules: old.rules.name, destination: old.G.name } });
    let reads = 0;
    const outcome = await command({ store, fetch: ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch, now: () => timeMs(net.clock.now)!, git: { run: async () => 0, files: async () => { reads++; return { ok: false, reason: "should-not-read" }; } } }, ["propose", "topic"]);
    expect([outcome.code, outcome.lines[0], reads, (await old.G.summary()).value.definition]).toEqual([1, "Cannot propose: version-mismatch. This room has no manifest-list destination.", 0, "platform:destination@2"]);
  } finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; }
});
