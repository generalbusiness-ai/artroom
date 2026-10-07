import { describe, expect, test } from "vitest";
import type { Entry, OperationId, Seed } from "@generalbusiness/artroom-contract";
import { b64url, intentDigest, seedDigest, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { DIRECTORY, repositoryName } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet } from "@generalbusiness/artroom-scope/testing/worker";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { outsideOf, wired } from "../../scope/test/outside.ts";
import { command, memoryStore, type Context } from "../src/index.ts";

const SERVICE = "https://scopes.test";
/** The test's own reader, which the command never presents. */
const reader = "a test reader";

// Invariant: a claim that gives up waiting is kept as pending, and a second run goes on from it with no second `found`; only
// `--again` signs a new one; the config never holds a secret.
//
// Every scope is a Durable Object of the namespace `PLATFORM`, as in `story.scope.test.ts`, and every request of the command goes
// through the Worker's HTTP routes. The readers are the real read sessions and signed reads, under a TEST SECRET. Three STAND-INs:
// the Git host is `OutsideDouble`, the register's outside port, which at first sends nothing, as the deployed register did before
// its Git host settings were set; the scheduler is `pause`, which runs the dispatchers only, so that no pass of the register's
// operations driver runs but the one its own object starts; and the clock is the namespaces' scripted clock.
describe("claim resumes a claim it gave up on. The Git host and the scheduler are STAND-INs", () => {
  test("a claim that gives up waiting is kept as pending; --again signs a new one; after the settings change and a restart, a second run goes on from the pending claim with no further found, and the config never holds a secret", async () => {
    net.hold = net.deaf = null;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    platformNet.inspector = reader;
    try {
      await resumed();
    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
      platformNet.inspector = null;
    }
  });
});

async function resumed(): Promise<void> {
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  // STAND-IN for the scheduler: the dispatchers of the scopes the command waits on. No pass of an operations driver.
  const pause = async (waiting: readonly string[]) => settle(...waiting.map((scope) => new Platform(scope as never)));
  const rita: Context = { store: memoryStore(), fetch, now: () => timeMs(net.clock.now)!, pause, tries: 3 };
  const run = (...argv: string[]) => command(rita, argv);
  const secrets = async () => (await Promise.all([rita.store.secret("operator"), rita.store.secret("recovery")])).filter((s) => s !== null).map((s) => b64url(s!));
  const noSecret = async () => { const text = JSON.stringify(await rita.store.config()); for (const secret of await secrets()) expect(text).not.toContain(secret); };

  expect((await run("install", SERVICE, "--host", "git.example", "--namespace", "artroom")).code).toBe(0);
  const R = new Platform((await rita.store.config())!.register!.scope);
  // STAND-IN: the register's Git host, which sends nothing yet: no settings.
  const host = outsideOf(R.name);
  host.accepting = false;
  wired.set(R.name, () => ({ outside: host }));
  await R.restart();
  const founds = async () => (await R.entries()).filter((entry): entry is Entry & { input: { type: "act" } } => entry.input.type === "act" && entry.input.signed.intent.kind === "found");

  // The first claim gives up waiting for the directory. It is kept as pending: its register, its intent's digest and its handle.
  const first = await run("claim", "demo", "--handle", "@rita");
  const resume = "run artroom claim demo again to go on waiting for this claim, or with --again to sign a new one, which creates a second repository.";
  expect(first).toEqual({ code: 1, lines: [`Gave up waiting for the directory after 3 reads. What was asked may still take effect; ${resume}`] });
  const pending = (await rita.store.config())!;
  expect([pending.repository, pending.claim]).toEqual([undefined, { register: R.name, intent: expect.stringMatching(/^sha256:/), handle: "@rita" }]);
  await noSecret();
  expect([(await founds()).length, host.sent.length]).toEqual([1, 0]);

  // --again signs a second found, which is now the pending one.
  const again = await run("claim", "demo", "--handle", "@rita", "--again");
  expect(again.code).toBe(1);
  const second = (await rita.store.config())!.claim!;
  expect([(await founds()).length, second.intent === pending.claim!.intent, host.sent.length]).toEqual([2, false, 0]);
  await noSecret();

  // The Git host's settings are set, and the register's object restarts. The host will create each repository.
  host.accepting = true;
  await R.restart();
  for (const claim of await founds()) {
    const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: await R.at(), cause: intentDigest(claim.input.signed.intent), ordinal: 0 };
    host.answer(`${claim.seq}:0` as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: `repo-${claim.seq}` } } });
  }

  // The second run signs nothing: it goes on from the pending claim, the second, to the seat.
  const resumedClaim = await run("claim", "demo");
  expect(resumedClaim.code, resumedClaim.lines.join("\n")).toBe(0);
  const config = (await rita.store.config())!;
  expect([config.claim, config.handle, resumedClaim.lines[1], resumedClaim.lines[2]]).toEqual([undefined, "@rita", "Definitions: platform:directory@2, platform:membership@2, platform:rules@2, platform:destination@2.", expect.stringMatching(/^You are @rita, an admin, on key key_\S+; your inbox is sc_\S+\.$/)]);
  const D = new Platform(config.repository!.directory.scope);
  expect((await D.entries())[0]!.uses.map((use) => use.fact.seq)).toContain((await founds())[1]!.seq);
  // No third found; each creation attempt was sent once, by the pass that the register's first call after its restart started.
  expect([(await founds()).length, host.attempts.sort()]).toEqual([2, [`${(await founds())[0]!.seq}:0#1`, `${(await founds())[1]!.seq}:0#1`].sort()]);
  await noSecret();
  wired.delete(R.name);
}
