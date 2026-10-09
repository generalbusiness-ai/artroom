import { expect, test } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, definitionDigest, digestBytes, factRefOf, scopeIdOf, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents, CONFIGURATION_DOMAIN, platform } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { valueDigest } from "@generalbusiness/artroom-derive";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { ownHost, readerOf, type Stand } from "../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { command, memoryStore, type Context, type Outcome } from "../../cli/src/index.ts";
import { changeDemo3 } from "../src/index.ts";


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
  const checkConfig = { image: `sha256:${"7".repeat(64)}` };
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
  expect([manifest.values["tree"], host.refs.get("refs/heads/main")]).toEqual([expect.stringMatching(/^[0-9a-f]{40}$/), first]);
  expect(proposed.lines[1]).toMatch(/^Reserved: merge/);
  const requested = ok(await run(founder, "act", "request-check", "--on", lane, "--set", `manifest=${version}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  const job = Number(/entry \S+:(\d+),/.exec(requested.lines[0]!)![1]);
  expect((await L.item(job)).values["tree"]).toBe(manifest.values["tree"]);
  const badTree = await run(checker, "act", "check", "--on", lane, "--set", `job=${job}`, "--set", `tree=${"e".repeat(40)}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed");
  expect([badTree.code, badTree.lines[0], host.refs.get("refs/heads/main")]).toEqual([1, expect.stringContaining("not-this-job"), first]);
  ok(await run(checker, "act", "check", "--on", lane, "--set", `job=${job}`, "--set", `tree=${manifest.values["tree"]}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed"));
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
  const replayed = await verify(httpSource(SERVICE, { fetch: routed, reader }), { mode: "replay", scope: G.name, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE, head: (await G.summary()).at });
  expect([replayed.report.result, replayed.why ?? null]).toEqual(["consistent", null]);
}
