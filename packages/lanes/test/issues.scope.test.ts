import { describe, expect, test } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, scopeIdOf, textDigest, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { ownHost, type Stand } from "../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { command, memoryStore, type Context, type Outcome } from "../../cli/src/index.ts";
import { DEMO_DIGESTS, changeDemo, issueDemo } from "../src/index.ts";

const SERVICE = "https://scopes.test";
/** The test's own reader, which the command never presents. */
const reader = "a test reader";

// Invariant: from the command line, an issue is opened, commented on and assigned through the issue lane's own acts under the demo
// profile; a member's one-file change that says it closes the issue is published by the room's merge, and the merge closes the
// issue; `artroom issues` lists the issue closed; and `artroom verify --all` replays every scope of the room consistent, one line
// for each. An act the lane reserves to others is refused by name, and nothing is written.
// An accepted edit proposal keeps its original lane/version when optional
// linking loses a required read; no proposal, link or merge is automatically retried.
//
// | Part | Is |
// |---|---|
// | The commands, their keys and their intents | Real: `command` of the cli package's `src/line.ts`, with a store in memory for each person. |
// | The scopes, the routes and the readers | Real, as in `edit.scope.test.ts`: the namespace `PLATFORM`, the Worker's HTTP routes, and the real read sessions under a TEST SECRET. Each lane is created by the real directory under the demo profile's digests, which the real rules scope activated. |
// | The Git host | The production wiring of the ports of the hosting's own Git service, `artifacts-wiring.ts`, over the STAND-IN `OwnGit` of `packages/scope/test/hosts.ts`. Refs and objects are maps; every write is a real push of a pack that the stand-in decodes. GitHub's provider is not run here: `edit.scope.test.ts` runs the same publication on both. |
// | The scheduler | A STAND-IN: while a command waits, its `pause` runs the operations drivers and the dispatchers of the scopes it waits on, as a deployment's alarms would. |
// | The clock | The scripted clock of the namespaces. |
describe("artroom issue and issues, edit --closes and verify --all on real scopes. The Git host and the scheduler are STAND-INs", () => {
  test("an issue opened by a member, commented on by another and assigned by the admin; a member's edit with --closes is linked and waits for a merger, the admin's merge publishes it and closes the issue; merge --closes links a waiting change the same way; a member who did not open an issue and holds no issue.triage is refused close and assign by name, with nothing written; issues lists both closed; verify --all prints one line for each scope of the room and all consistent", async () => {
    net.hold = net.deaf = null;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    platformNet.inspector = reader;
    const wired = new Set<ScopeId>();
    try {
      await story(ownHost(), wired);
    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
      platformNet.inspector = null;
      net.hold = null;
      for (const name of wired) platformOutside.delete(name);
    }
  }, 180_000);
});

async function story(at: Stand, wired: Set<ScopeId>): Promise<void> {
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const now = () => timeMs(net.clock.now)!;
  const host = at.stand;
  let R: Platform | null = null;
  const bindings = () => at.bindings(R!.name);
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => at.outside(given, sql, bindings())); };
  // STAND-IN for the scheduler, as in `edit.scope.test.ts`.
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
  const files: Record<string, Uint8Array> = {
    "change-demo.json": utf8(canonicalize(changeDemo)),
    "issue-demo.json": utf8(canonicalize(issueDemo)),
    "start.md": utf8("# Getting started\n\nClone the room, then edit a page.\n"),
    "readme.md": utf8("# The handbook\n\nNo typos here.\n"),
  };
  const person = (): Context => ({ store: memoryStore(), fetch, now, pause, read: async (path) => files[path] ?? null });
  const rita = person();
  const una = person();
  const paul = person();
  const run = (who: Context, ...argv: string[]): Promise<Outcome> => command(who, argv);
  const ok = (outcome: Outcome) => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };

  // A room on the stand-in host, founded by rita, the admin; una and paul join as members.
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
  for (const [who, handle] of [[una, "@una"], [paul, "@paul"]] as const) {
    ok(await run(who, "join", ok(await run(rita, "invite", handle, "--role", "member")).lines[1]!.split(": ")[1]!));
  }

  // The rules: no approval for the source extent. Before the issue definition is active there is no issue to open: nothing is signed.
  ok(await run(rita, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
  const atDirectory = (await D.summary()).at;
  const none = await run(una, "issue", "open", "--title", "Too early");
  expect([none.code, none.lines[0], (await D.summary()).at]).toEqual([1, expect.stringMatching(/^The rules scope sc_\S+ holds no issue definition active\. An admin activates one: artroom act activate --on rules --set digest=<digest> --set name=issue/), atDirectory]);
  ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.issue}`, "--set", "name=issue", "--value", "issue-demo.json"));
  ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.change}`, "--set", "name=change", "--value", "change-demo.json"));
  expect(await run(una, "issues")).toEqual({ code: 0, lines: ["No issues."] });

  // una opens an issue. The directory creates its lane under the demo profile's issue digest; the lane holds the title and the
  // body's digest, and the opener is una.
  const opened = ok(await run(una, "issue", "open", "--title", "The handbook has no start page", "--body", "A new member does not know where to begin."));
  const first = /^Opened issue #1: The handbook has no start page\. Its lane is (sc_\S+)\.$/.exec(opened.lines[0]!)!;
  expect([opened.lines.length, first !== null]).toEqual([1, true]);
  const I = new Platform(first[1] as ScopeId);
  expect([(await I.summary()).value.definition, (await I.item(0)).state, (await I.item(0)).values["body"], (await I.item(0)).parties["requester"]]).toEqual([DEMO_DIGESTS.issue, "open", textDigest("A new member does not know where to begin."), expect.objectContaining({ member: "@una" })]);

  // paul comments on it; any member may.
  const commented = ok(await run(paul, "issue", "comment", "1", "I looked for one too."));
  expect(commented.lines).toEqual([expect.stringMatching(new RegExp(`^Commented: entry ${I.name}:\\d+, hash sha256:`))]);
  const comment = (await I.summary()).value.items.find((item) => item.type === "comment")!;
  expect([comment.parties["author"], comment.values["body"]]).toEqual([expect.objectContaining({ member: "@paul" }), textDigest("I looked for one too.")]);

  // Assignment needs issue.triage, which members do not hold: una's is refused by name, and nothing is written. rita assigns una.
  const atIssue = (await I.summary()).at;
  expect(await run(una, "issue", "assign", "#1", "@una")).toEqual({ code: 1, lines: [`Refused: unauthorized, judged at entry ${I.name}:${atIssue.seq}. The request was refused.`] });
  expect((await I.summary()).at).toEqual(atIssue);
  ok(await run(rita, "issue", "assign", I.name, "@una"));
  expect((await I.item(0)).parties["assignees"]).toEqual([expect.objectContaining({ member: "@una" })]);

  // A second issue, opened by una. paul did not open it and holds no issue.triage: his close is `close-any`, refused by name, and
  // nothing is written. The demo profile has no rule that reserves a close to an assignee: it is the opener's, or a triager's.
  const second = /Its lane is (sc_\S+)\.$/.exec(ok(await run(una, "issue", "open", "--title", "A typo on the front page")).lines[0]!)!;
  const J = new Platform(second[1] as ScopeId);
  const atSecond = (await J.summary()).at;
  expect(await run(paul, "issue", "close", "2")).toEqual({ code: 1, lines: [`Refused: unauthorized, judged at entry ${J.name}:${atSecond.seq}. The request was refused.`] });
  expect([(await J.summary()).at, (await J.item(0)).state]).toEqual([atSecond, "open"]);

  // una's edit says it closes issue 1. The change lane links it; una is a member and holds no change.merge, so her merge is refused
  // by name and the change waits, linked, with the issue open.
  const head0 = host.refs.get("refs/heads/main")!;
  // An issue that is not listed is found before anything is signed: no change is opened.
  const beforeEdit = (await D.summary()).at;
  expect([await run(una, "edit", "guide/start.md", "--file", "start.md", "--closes", "9"), (await D.summary()).at]).toEqual([{ code: 2, lines: [`No issue 9 is listed in the directory ${D.name}. Run: artroom issues`] }, beforeEdit]);
  const edited = await run(una, "edit", "guide/start.md", "--file", "start.md", "--closes", "1");
  const lane = /as change (sc_\S+), version (\d+)\./.exec(edited.lines[0]!)!;
  expect(edited).toEqual({ code: 1, lines: [
    `Proposed guide/start.md (${files["start.md"]!.length} bytes) as change ${lane[1]}, version ${lane[2]}.`,
    `Linked: when it is published, the change ${lane[1]} closes issue #1 (${I.name}).`,
    expect.stringMatching(new RegExp(`^Refused: unauthorized, judged at entry ${lane[1]}:\\d+\\. The request was refused\\.$`)),
    `The change ${lane[1]} waits, at version ${lane[2]}. When it may be merged, run: artroom merge ${lane[1]}`,
  ] });
  expect([host.refs.get("refs/heads/main"), (await I.item(0)).state]).toEqual([head0, "open"]);

  // rita merges it. The room publishes the commit, and the merge closes the issue: one entry closes it, the delivery of the lane's
  // `closes` update in the state `merged`. The assignment stays.
  const merged = ok(await run(rita, "merge", lane[1]!));
  const head1 = host.refs.get("refs/heads/main")!;
  expect(merged.lines).toEqual([expect.stringMatching(new RegExp(`^Published: commit ${head1}, by the merge ${lane[1]}:\\d+\\.$`)), `Page: ${SERVICE}/site/${D.name}/HEAD/guide/start.md`]);
  const closing = (await I.entries()).filter((entry) => entry.effects.some((effect) => effect.effect === "state" && effect.item === 0 && effect.state === "closed"));
  expect([head1 !== head0, (await I.item(0)).state, (await I.item(0)).values["closeReason"], closing.length, closing[0]?.input.type, (await I.item(0)).parties["assignees"]]).toEqual([true, "closed", "completed", 1, "delivery", [expect.objectContaining({ member: "@una" })]]);

  // merge --closes: una's edit of README.md has no link and waits; her merge with --closes 2 links it, and is refused again; rita's
  // merge publishes it and closes issue 2.
  const waiting = await run(una, "edit", "README.md", "--file", "readme.md");
  const lane2 = /as change (sc_\S+), version/.exec(waiting.lines[0]!)![1]!;
  expect([waiting.code, waiting.lines.length, (await J.item(0)).state]).toEqual([1, 3, "open"]);
  const linked = await run(una, "merge", lane2, "--closes", "#2");
  expect([linked.code, linked.lines[0], linked.lines[1]]).toEqual([1, `Linked: when it is published, the change ${lane2} closes issue #2 (${J.name}).`, expect.stringMatching(/^Refused: unauthorized, /)]);
  ok(await run(rita, "merge", lane2));
  expect([(await J.item(0)).state, (await J.item(0)).values["closeReason"]]).toEqual(["closed", "completed"]);

  // The directory's index row still says open: the merge closed the issue in its own lane and sent the directory nothing. That is
  // why `issues` reads each issue's lane.
  const row = (await D.summary()).value.items.find((item) => item.type === "lane" && (item.refs["scope"] as { scope?: string } | undefined)?.scope === I.name)!;
  expect(row.values["state"]).toBe("open");
  expect(await run(paul, "issues")).toEqual({ code: 0, lines: [
    `#1  closed (completed)  The handbook has no start page; assigned to @una; lane ${I.name}`,
    `#2  closed (completed)  A typo on the front page; lane ${J.name}`,
    "2 issues, 0 open.",
  ] });

  // verify --all: the register and every scope of the room, found by the creations in the histories, in that order: the directory's
  // three children and four lanes, then the three inboxes that membership created. Each is replayed from its first entry over the
  // read routes with the caller's session, the lanes with the capability code; one line each, and the last line says all are consistent.
  const verified = await run(una, "verify", "--all");
  expect(verified.code, verified.lines.join("\n")).toBe(0);
  const lines = verified.lines.slice(0, -1);
  const kinds = lines.map((line) => line.split(" ")[0]);
  expect(kinds).toEqual(["register", "directory", "membership", "rules", "destination", "lane", "lane", "lane", "lane", "inbox", "inbox", "inbox"]);
  for (const line of lines) expect(line).toMatch(/^[a-z]+ sc_[a-z2-7]+, entry \d+: consistent\.$/);
  expect(lines.filter((line) => line.includes(I.name) || line.includes(J.name) || line.includes(lane[1]!) || line.includes(lane2))).toHaveLength(4);
  expect(verified.lines.at(-1)).toBe("All consistent: 12 scopes.");
  // Read/transport boundary STAND-IN after one real accepted proposal.
  // Every mutation still reaches the real Worker; only the subsequent
  // linking summary read is lost. The original --closes positive flow above
  // remains intact, and this command must keep its known lane/version.
  let proposed: { at: { scope: ScopeId }; seq: number } | null = null;
  let proposals = 0; let links = 0; let merges = 0;
  const unavailableLink = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (proposed && path === `/v1/scopes/${proposed.at.scope}`) throw new Error("TEST private linking transport detail");
    const response = await routed(url, init);
    if (init?.method === "POST" && path.endsWith("/acts")) {
      const asked = JSON.parse(String(init.body)) as { signed?: { intent?: { kind?: string } } };
      const kind = asked.signed?.intent?.kind;
      if (kind === "link-own") links++;
      if (kind === "merge") merges++;
      if (kind === "propose-file") {
        proposals++;
        const answer = await response.clone().json() as { answer: string; receipt: { fact: NonNullable<typeof proposed> } };
        if (answer.answer === "accepted") proposed = answer.receipt.fact;
      }
    }
    return response;
  }) as unknown as Fetch;
  const stopped = await command({ ...una, fetch: unavailableLink }, ["edit", "guide/start.md", "--file", "start.md", "--closes", "1"]);
  expect(proposed).not.toBeNull();
  const original = proposed as unknown as { at: { scope: ScopeId }; seq: number };
  expect([stopped.code, stopped.lines, proposals, links, merges]).toEqual([1, [
    `Proposed guide/start.md (${files["start.md"]!.length} bytes) as change ${original.at.scope}, version ${original.seq}.`,
    "Linking could not be confirmed: a required request or reply was unavailable.",
    `Inspect artroom show ${original.at.scope}:${original.seq} and artroom log ${original.at.scope} before another edit, link or merge. The proposal is recorded; linking was not confirmed and no mutation was retried.`,
  ], 1, 0, 0]);
  expect(stopped.lines.join("\n")).not.toContain("TEST private linking transport detail");
  const recorded = await new Platform(original.at.scope).entries();
  expect(recorded.filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "propose-file")).toHaveLength(1);
  expect(recorded.some((entry) => entry.input.type === "act" && ["link-own", "merge"].includes(entry.input.signed.intent.kind))).toBe(false);

  // Nothing is left to deliver when the test ends: each scope's sends are carried, so no pass of this room runs into a later test.
  await pause([...lines.map((line) => line.split(" ")[1]!.replace(/,$/, "")), original.at.scope]);
}
