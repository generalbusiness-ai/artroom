import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import type { DeclaredDefinition, Item, Read, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, definitionDigest, entryHash, scopeIdOf, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents, platform } from "@generalbusiness/artroom-platform";
import { foundingObjects } from "../../platform/src/future-2/destination-objects.ts";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { site } from "../../scope/src/site/route.ts";
import type { SiteEnv } from "../../scope/src/site/host.ts";
import { gitHub, ownHost, readerOf, type Stand } from "../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { command, memoryStore, type Context, type Outcome } from "../../cli/src/index.ts";
import { DEMO_DIGESTS, changeDemo } from "../src/index.ts";

const SERVICE = "https://scopes.test";
/** The test's own reader, which the command never presents. */
const reader = "a test reader";

// Invariant: `artroom edit` proposes one file as a change of the room's lane, the room judges it by its rules, and the destination
// writes the published tree with that file and pushes the commit; the site route then serves the file. A change in the rules extent
// waits for the rules scope's controller; a path no tree may hold is refused by name, and nothing is pushed. Both hosts' providers
// push the commit the same way.
//
// | Part | Is |
// |---|---|
// | The commands, their keys and their intents | Real: `command` of the cli package's `src/line.ts`, with a store in memory for each person. |
// | The scopes, the routes and the readers | Real, as in `story.scope.test.ts`: the namespace `PLATFORM`, the Worker's HTTP routes, and the real read sessions under a TEST SECRET. The change lane is created by the real directory under the demo profile's digest, which the real rules scope activated. |
// | The Git host | The production wiring of each host's ports, `artifacts-wiring.ts` and `github-wiring.ts`, for the register and the destination, over a STAND-IN of `packages/scope/test/hosts.ts`: `OwnGit` for the hosting's own Git service, `Hub` for GitHub. Refs and objects are maps. Every write is a real push of a pack that the stand-in decodes. |
// | The site route | Real: `site` of the scope package, called as the Worker calls it, over the same stand-in. Its answer is read as text; no page is rendered in a browser. |
// | The scheduler | A STAND-IN: while a command waits, its `pause` runs the operations drivers and the dispatchers of the scopes it waits on, as a deployment's alarms would. |
// | The clock | The scripted clock of the namespaces. |
describe("artroom edit on real scopes, through the production wiring of each Git host's ports. The Git hosts and the scheduler are STAND-INs", () => {
  for (const [label, made] of [["the hosting's own Git service", async () => ownHost()], ["GitHub", gitHub]] as const) {
    test(`on ${label}: found a room; edit README.md: the change is judged, the destination pushes the published tree with that file and the site route serves it; a second edit replaces it; an edit of AGENTS.md by a maintainer waits until the rules scope's controller approves, then publishes; a path no tree may hold is refused path-invalid with nothing pushed; and the destination replays consistent`, async () => {
      net.hold = net.deaf = null;
      platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
      platformNet.sessions = true;
      platformNet.inspector = reader;
      const wired = new Set<ScopeId>();
      try {
        await story(await made(), wired);
      } finally {
        platformNet.secret = null;
        platformNet.sessions = false;
        platformNet.inspector = null;
        net.hold = null;
        for (const name of wired) platformOutside.delete(name);
      }
    }, 120_000);
  }
});

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
  // An older valid change definition has no one-file proposal. Another
  // valid definition has that name but carries detached content, unlike the
  // command's signed-text protocol. Neither supports this edit workflow.
  const legacy = structuredClone(changeDemo) as DeclaredDefinition;
  delete legacy.acts["propose-file"];
  const detached = structuredClone(changeDemo) as DeclaredDefinition;
  detached.acts["propose-file"]!.fields["content"] = { type: "text", max: 65536, detached: true, required: true };
  // Harmless metadata and explicit default targets are compatible:
  // support is not an exact-row catalog.
  const extended = structuredClone(changeDemo) as DeclaredDefinition;
  extended.items["manifest"]!.values["commandNote"] = { fixed: true, required: false, of: { type: "text", max: 32 } };
  extended.acts["propose-file"]!.effects = [...extended.acts["propose-file"]!.effects.map((effect) => ({ ...effect, of: "on" as const })), { value: { slot: "commandNote", from: { const: "metadata" } } }];
  const files: Record<string, Uint8Array> = {
    "change-demo.json": utf8(canonicalize(changeDemo)),
    "legacy.json": utf8(canonicalize(legacy)),
    "detached.json": utf8(canonicalize(detached)),
    "extended.json": utf8(canonicalize(extended)),
    "readme.md": utf8("# The handbook\n\nWritten by the room.\n"),
    "readme-2.md": utf8("# The handbook, again\n"),
    "agents.md": utf8("# Agents\n\nAsk before you push.\n"),
    "binary.bin": Uint8Array.from([0xff, 0xfe, 0x00]),
  };
  const person = (): Context => ({ store: memoryStore(), fetch, now, pause, read: async (path) => files[path] ?? null });
  const rita = person();
  const paul = person();
  const run = (who: Context, ...argv: string[]): Promise<Outcome> => command(who, argv);
  const ok = (outcome: Outcome) => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };

  // A room on the host: the register creates the repository through the real port, and every scope that a creation makes is
  // wired to the same port before it first runs. Only the register and the destination take its effects.
  ok(await run(rita, "install", SERVICE, "--host", at.host, "--namespace", at.namespace));
  R = new Platform((await rita.store.config())!.register!.scope);
  wire(R.name);
  await R.restart();
  known.push(R);
  net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
  ok(await run(rita, "claim", "demo", "--handle", "@rita"));
  const repository = (await rita.store.config())!.repository!;
  const [D, G] = [new Platform(repository.directory.scope), new Platform(repository.destination)];
  known.push(G);
  await pause([]);
  // The founding head, pushed by the destination through the port: one README.md that names the repository, the founder and the directory
  // (`platform:destination@2`).
  const first = foundingObjects("sha1", G.name, (await G.entries())[0]!.time, (await G.item(0)).refs["claim"] as never, { name: ((await G.item(0)).values["repository"] as { name: string }).name, handle: "@rita", directory: D.name }).commit;
  expect([(await G.item(0)).values["head"], host.refs.get("refs/heads/main")]).toEqual([first, first]);
  const siteEnv: SiteEnv = { SCOPES: env.PLATFORM, ...bindings() };
  const page = async (path: string) => { const response = await site(new Request(`${SERVICE}/site/${D.name}/HEAD/${path}`), siteEnv, host.fetch); return { status: response.status, body: await response.text() }; };
  // The site already serves the founding README, which the first edit replaces.
  const founded = await page("README.md");
  expect([founded.status, founded.body.includes("Founded by")]).toEqual([200, true]);

  // paul, a maintainer: he holds change.merge and not rules.publish.
  const link = ok(await run(rita, "invite", "@paul", "--role", "maintainer")).lines[1]!.split(": ")[1]!;
  ok(await run(paul, "join", link));

  // The rules: the first extents, with no approval for the source extent; the rules extent asks one from the controller. The
  // change definition of the demo profile, activated with its bytes beside the act.
  ok(await run(rita, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
  // Before the activation there is no change to open: nothing is signed.
  const none = await run(rita, "edit", "README.md", "--file", "readme.md");
  expect([none.code, none.lines[0]]).toEqual([1, expect.stringMatching(/^The rules scope sc_\S+ holds no change definition active\. An admin activates one: artroom act activate/)]);
  // The real rules scope validates and activates these definitions. Local
  // preflight must refuse before the directory opens any partial lane.
  for (const [name, definition] of [["legacy.json", legacy], ["detached.json", detached]] as const) {
    ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(definition)}`, "--set", "name=change", "--value", name));
    const beforeEdit = (await D.summary()).at;
    // Catch only here so the control disabling preflight distinguishes the
    // original thrown path and partial lane by an assertion, not an error.
    const unsupported = await run(rita, "edit", "README.md", "--file", "readme.md").catch((error: unknown) => ({ code: 1, lines: [String(error)] }));
    expect([unsupported.code, unsupported.lines[0], (await D.summary()).at]).toEqual([
      1, expect.stringMatching(/^Unsupported edit: the active change definition sha256:\S+ .* No change was opened\.$/), beforeEdit,
    ]);
  }
  ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.change}`, "--set", "name=change", "--value", "change-demo.json"));

  // Read-boundary STAND-IN: only the destination summary's named version is
  // changed to native @1. The actual scope remains @2. This shows the CLI's
  // protocol preflight, not a native-room/history provenance resolution.
  const beforeUnsupported = (await D.summary()).at;
  let writes = 0;
  const unsupportedFetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && new URL(url).pathname.endsWith("/acts")) writes++;
    const response = await routed(url, init);
    if (new URL(url).pathname !== `/v1/scopes/${repository.destination}`) return response;
    const read = await response.json() as { ok: boolean; value?: { definition: string } };
    if (read.ok && read.value) read.value.definition = "platform:destination@1";
    return new Response(JSON.stringify(read), { status: response.status, headers: response.headers });
  }) as unknown as Fetch;
  const unsupportedTarget = await command({ ...rita, fetch: unsupportedFetch }, ["edit", "README.md", "--file", "readme.md"]);
  expect([unsupportedTarget.code, unsupportedTarget.lines[0], writes, (await D.summary()).at]).toEqual([
    1, expect.stringMatching(/^Unsupported edit: destination sc_\S+ runs platform:destination@1; .* No change was opened\.$/), 0, beforeUnsupported,
  ]);

  // A file that is no UTF-8 text is not carried: nothing is signed.
  const before = (await D.summary()).at;
  expect((await run(rita, "edit", "logo.png", "--file", "binary.bin")).code).toBe(2);
  expect((await D.summary()).at).toEqual(before);

  // edit README.md: in the source extent, which asks no approval, rita's own merge publishes it.
  const edited = ok(await run(rita, "edit", "README.md", "--file", "readme.md"));
  const head1 = host.refs.get("refs/heads/main")!;
  expect(edited.lines).toEqual([
    expect.stringMatching(/^Proposed README\.md \(\d+ bytes\) as change sc_\S+, version \d+\.$/),
    expect.stringMatching(new RegExp(`^Published: commit ${head1}, by the merge sc_\\S+:\\d+\\.$`)),
    `Page: ${SERVICE}/site/${D.name}/HEAD/README.md`,
  ]);
  // The destination recorded the commit the host holds: one parent, the founding head; its tree holds README.md and nothing else.
  const git = readerOf(host);
  const commit1 = await git.commit(head1);
  expect([(await G.item(0)).values["head"], commit1.parents, (await git.tree(commit1.tree)).map((e) => new TextDecoder().decode(e.name))]).toEqual([head1, [first], ["README.md"]]);
  const shown = await page("README.md");
  expect([shown.status, shown.body]).toEqual([200, expect.stringContaining('<h1 id="the-handbook">The handbook</h1>\n<p>Written by the room.</p>')]);

  // A second edit of the same path replaces the file.
  ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(extended)}`, "--set", "name=change", "--value", "extended.json"));
  ok(await run(rita, "edit", "README.md", "--file", "readme-2.md", "--title", "Retitle the handbook"));
  const head2 = host.refs.get("refs/heads/main")!;
  expect((await git.commit(head2)).parents).toEqual([head1]);
  const replaced = await page("README.md");
  expect([replaced.body.includes('<h1 id="the-handbook-again">The handbook, again</h1>'), replaced.body.includes("Written by the room.")]).toEqual([true, false]);

  // AGENTS.md is in the rules extent. paul's merge is refused by the destination, named; nothing is pushed.
  const waiting = await run(paul, "edit", "AGENTS.md", "--file", "agents.md");
  const lane = /as change (sc_\S+), version (\d+)\./.exec(waiting.lines[0]!)!;
  expect(waiting).toEqual({ code: 1, lines: [waiting.lines[0], expect.stringMatching(new RegExp(`^Not published: the merge ${lane[1]}:\\d+ is refused, rules-not-met:rules\\. The change ${lane[1]} stays open at version ${lane[2]}\\. When it may be merged, run: artroom merge ${lane[1]}$`))] });
  expect([host.refs.get("refs/heads/main"), (await page("AGENTS.md")).status]).toEqual([head2, 404]);
  // The rules scope's controller approves it for the rules extent; then paul's merge publishes it.
  ok(await run(rita, "act", "review-verdict", "--on", lane[1]!, "--set", `manifest=${lane[2]}`, "--set", "verdict=approve", "--set", "extent=rules"));
  const merged = ok(await run(paul, "merge", lane[1]!));
  const head3 = host.refs.get("refs/heads/main")!;
  expect(merged.lines).toEqual([expect.stringMatching(new RegExp(`^Published: commit ${head3}, by the merge ${lane[1]}:\\d+\\.$`)), `Page: ${SERVICE}/site/${D.name}/HEAD/AGENTS.md`]);
  expect([(await git.commit(head3)).parents, (await page("AGENTS.md")).body.includes("Ask before you push.")]).toEqual([[head2], true]);

  // A path that no tree may hold is refused by the destination, by name, and nothing is pushed.
  const pushes = host.pushes.length;
  const outside = await run(rita, "edit", "../outside.md", "--file", "readme.md");
  expect([outside.code, outside.lines[1]]).toEqual([1, expect.stringMatching(/^Not published: the merge sc_\S+:\d+ is refused, path-invalid\. /)]);
  expect([host.refs.get("refs/heads/main"), host.pushes.length]).toEqual([head3, pushes]);

  // The destination's history, with its three publications of a one-file manifest and two refusals, replays consistent, with the
  // histories whose entries it names: a verifier reads each over HTTP and derives every entry again, with the platform package's
  // rules and the capability code that the production ports hold, as `wiring.scope.test.ts` does. `artroom verify` carries no
  // capability code, and answers that it cannot derive a lane (the delivery note's section 5).
  const replayed = await verify(httpSource(SERVICE, { fetch: routed, reader }), { mode: "replay", scope: G.name, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE, head: (await G.summary()).at });
  expect([replayed.report.result, replayed.why ?? null]).toEqual(["consistent", null]);
  // No token of the host is in any history: every scope's entries, read past the sessions.
  const histories = canonicalize(await Promise.all([R, D, G].map((node) => node.entries())));
  for (const secret of at.secrets()) expect(histories).not.toContain(secret);
  // The publications are the room's: every push to the branch is the destination's, after the founding one.
  expect(host.pushes.filter((p) => p.ref === "refs/heads/main").map((p) => p.commit)).toEqual([first, head1, head2, head3]);
  const items = await (G.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "publication");
  expect(items.ok && items.value.map((item) => [item.state, item.values["reason"] ?? null])).toEqual([["published", null], ["published", null], ["not-reserved", "rules-not-met:rules"], ["published", null], ["not-reserved", "path-invalid"]]);

  if (at.host === "artifacts") {
    // Scripted HTTP read boundary only: after one real accepted merge, three
    // unrelated entries precede its terminal entry. That terminal is just
    // beyond the configured existing tries budget; no infinite stream or
    // timeout is needed to distinguish the former unbounded inner scan.
    const badLane = /as change (sc_\S+),/.exec(outside.lines[0]!)![1]!;
    const template = (await new Platform(badLane as ScopeId).entries()).find((entry) => entry.effects.length === 0)!;
    expect(template).toBeDefined();
    const tries = 3;
    const reads: number[] = [];
    let mergeSeq: number | null = null;
    let submits = 0;
    let pauses = 0;
    const streamFetch = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const prefix = `/v1/scopes/${badLane}/entries/`;
      if (mergeSeq !== null && path.startsWith(prefix)) {
        const seq = Number(path.slice(prefix.length));
        reads.push(seq);
        const entry = { ...template, seq, effects: reads.length <= tries ? [] : [
          { effect: "state" as const, item: mergeSeq, state: "published" },
          { effect: "value" as const, item: mergeSeq, slot: "commit", value: head3 },
        ] };
        const hash = entryHash(entry);
        return new Response(JSON.stringify({ ok: true, at: { seq, hash }, value: { entry, hash }, complete: true }), { headers: { "content-type": "application/json" } });
      }
      const response = await routed(url, init);
      if (path === `/v1/scopes/${badLane}/acts` && init?.method === "POST") {
        const asked = JSON.parse(String(init.body)) as { signed?: { intent?: { kind?: string } } };
        if (asked.signed?.intent?.kind === "merge") {
          submits++;
          const answer = await response.clone().json() as { answer: string; receipt?: { fact: { seq: number } } };
          if (answer.answer === "accepted") mergeSeq = answer.receipt!.fact.seq;
        }
      }
      return response;
    }) as unknown as Fetch;
    const exhausted = await command({ ...rita, fetch: streamFetch, tries, pause: async (waiting) => { pauses++; await pause(waiting); } }, ["merge", badLane]);
    expect([exhausted.code, exhausted.lines[0], reads, pauses, submits]).toEqual([
      1, `Gave up waiting for the room's answer to merge ${badLane}:${mergeSeq} after ${tries} reads. What was asked may still take effect; run artroom merge ${badLane} again only after artroom log ${badLane} shows the merge ${mergeSeq} ended.`,
      Array.from({ length: tries }, (_, n) => mergeSeq! + n + 1), tries, 1,
    ]);
  }
}
