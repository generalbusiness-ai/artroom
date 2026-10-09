import { describe, expect, test } from "vitest";
import type { Digest, Item, OperationId, Read } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { repositoryName } from "@generalbusiness/artroom-platform";
import { beginSessionFixture } from "../../scope/test/session-settings.ts";
import { nativeFixtureLifetime, driveFixture } from "../../scope/test/support/native-fixture-lifetime.ts";
import type { ArtifactsNamespace } from "../../scope/src/artifacts-host.ts";
import { artifactsOutside } from "../../scope/src/artifacts-wiring.ts";
import type { Outside } from "../../scope/src/index.ts";
import { routed, type Platform } from "../../scope/test/repository.ts";
import { outsideOf } from "../../scope/test/outside.ts";
import { command, memoryStore, type Context, type Git, type Outcome } from "../src/index.ts";

const SERVICE = "https://scopes.test";
const reader = "a test reader";
const NAMESPACE = "artroom-demo";
const HOST = "service.invalid";

/** STAND-IN: the binding of the hosting's own Git service, scripted. Each read token has a new plaintext and the lifetime asked. */
function binding(lifetime: ReturnType<typeof nativeFixtureLifetime>) {
  const minted: string[] = [];
  const ns: ArtifactsNamespace = {
    get: async (name) => ({
      createToken: async (scope, ttl) => { lifetime.active(); minted.push(`read-plaintext-${minted.length + 1}`); return { id: `tok-${minted.length}`, plaintext: minted.at(-1), scope, expiresAt: new Date(lifetime.now() + ttl * 1000).toISOString() }; },
      revokeToken: async () => true,
      info: async () => ({ name, remote: `https://${HOST}/git/${NAMESPACE}/${name}.git` }),
    }),
    create: async () => { throw new Error("no creation in this test"); },
    delete: async () => false,
  };
  return { minted, ns };
}
const onlyMintRead = (port: Outside): Outside => ({ ...port, accepts: (owner, kind) => kind === "mint-read" && port.accepts(owner, kind), send: (request) => (request.kind === "mint-read" ? port.send(request) : Promise.resolve(null)) });

/** STAND-IN for the `git` program: it records each run's arguments and added environment, and exits 0. */
function recordingGit(lifetime: ReturnType<typeof nativeFixtureLifetime>): Git & { runs: { args: readonly string[]; env: Readonly<Record<string, string>> }[] } {
  const runs: { args: readonly string[]; env: Readonly<Record<string, string>> }[] = [];
  return { runs, run: async (args, env) => { lifetime.active(); runs.push({ args: [...args], env: { ...env } }); return 0; } };
}

// Invariant: `artroom clone` signs `read-token`, reads the token once, and gives it to git only as the header configuration in
// git's environment: never in an argument and never in a printed line. Without git it signs nothing. `artroom remote` prints the
// repository's host, namespace, name and remote URL in each host's form.
//
// | Part | Is |
// |---|---|
// | The commands, their keys and their intents | Real: `command` of `src/line.ts`, with a store in memory for each person. |
// | The scopes, the routes and the readers | Real, as in `story.scope.test.ts`: the namespace `PLATFORM`, the Worker's HTTP routes, and the real read sessions under a TEST SECRET. |
// | The register's Git host | A STAND-IN: `OutsideDouble` answers each creation request with the name of attempt 1. |
// | The destination's Git host | The real `artifacts-wiring.ts` port over a STAND-IN binding that the test scripts. Only `mint-read` reaches it. |
// | git | A STAND-IN: a function that records its arguments and environment. Node's runner over a stand-in `git` script on the PATH is `git.test.ts`. |
// | The scheduler | A STAND-IN: while a command waits, its `pause` runs the operations driver and the dispatchers, as a deployment's alarms would. |
describe("artroom clone and artroom remote on real scopes. The Git hosts, git and the scheduler are STAND-INs", () => {
  test("remote prints the host's form; a member reads the destination with her session before any act there and after the claim window; clone without git signs nothing; clone signs read-token, reads the token once and gives it to git only in its environment's header configuration; a member clones with her own token; GitHub's remote is whole, and is read with the founder's session after the signed-read window", async () => {
    const owner = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true, inspector: reader });
    const lifetime = nativeFixtureLifetime(owner);
    try {
      await story(lifetime);
    } finally {
      lifetime.release();
    }
  });
});

async function story(lifetime: ReturnType<typeof nativeFixtureLifetime>): Promise<void> {
  const fetch = ((url: string, init?: RequestInit) => lifetime.wait(() => routed(url, init))) as unknown as Fetch;
  const now = lifetime.now;
  const registers: Platform[] = [];
  const destinations: Platform[] = [];
  // STAND-IN for the scheduler: each creation is answered under the name of attempt 1, with the ID the host gives; each pass drives
  // the registers' and destinations' operations, then the dispatchers.
  const pause = async (waiting: readonly string[]) => {
    lifetime.active();
    for (const register of registers) {
      const final = await (register.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "claim");
      for (const claim of (await register.summary()).value.items.filter((item) => item.type === "claim").concat(final.ok ? final.value : [])) {
        const name = repositoryName(claim.values["seed"] as Digest, 1);
        const github = (await register.item(0)).values["host"] === "github.com";
        lifetime.active();
        outsideOf(register.name).answer(`${claim.id}:0` as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name, id: github ? "71" : name } } });
      }
    }
    await driveFixture([...registers, ...destinations, ...waiting.map(scope => lifetime.platform(scope as never))], lifetime.wait);
  };
  const git = recordingGit(lifetime);
  const rita: Context = { store: memoryStore(), fetch, now, pause, git };
  const una: Context = { store: memoryStore(), fetch, now, pause, git };
  const run = (who: Context, ...argv: string[]): Promise<Outcome> => lifetime.wait(() => command(who, argv));
  const ok = (outcome: Outcome) => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };

  // A room on the hosting's own Git service.
  ok(await run(rita, "install", SERVICE, "--host", "artifacts", "--namespace", NAMESPACE));
  const R = lifetime.platform((await lifetime.wait(() => rita.store.config()))!.register!.scope);
  lifetime.wire(R.name, () => ({ outside: outsideOf(R.name) }));
  await R.restart();
  registers.push(R);
  ok(await run(rita, "claim", "demo", "--handle", "@rita"));
  const repository = (await lifetime.wait(() => rita.store.config()))!.repository!;
  const G = lifetime.platform(repository.destination);
  const name = (await G.item(0)).values["repository"] as { name: string };
  const remoteUrl = `https://${HOST}/git/${NAMESPACE}/${name.name}.git`;
  const service = binding(lifetime);
  lifetime.outside(G.name, (given, sql) => onlyMintRead(artifactsOutside(given, sql, { ARTIFACTS_CONFIG: canonicalize({ registerScope: R.name, namespace: NAMESPACE, host: HOST, maxBytes: 1024 * 1024, credentialIdentity: "adapter-attempt" }), ARTIFACTS: service.ns })));
  await G.restart();
  destinations.push(G);
  // The first destination read and clone happen after the claim's signed-read
  // window, with no destination act or membership observation to bootstrap them.
  expect((await G.entries()).some((entry) => entry.input.type === "act")).toBe(false);
  lifetime.advance(16 * 60_000);
  try {
    // remote: the branch item's record. The service's hostname is the deployment's setting, which no scope records: it is marked.
    expect(await run(rita, "remote")).toEqual({ code: 0, lines: ["Host: artifacts", `Namespace: ${NAMESPACE}`, `Name: ${name.name}`, `Remote URL: https://<service host>/git/${NAMESPACE}/${name.name}.git (the service host is the deployment's setting; artroom clone prints it whole)`] });

    // A member who joined before any act at the destination reads it with her session: the destination knows membership's scope ID
    // from its genesis, though no entry of it retains an observation yet (the planner's decision ca8ad1cf). Her key signed nothing
    // there.
    const link = ok(await run(rita, "invite", "@una", "--role", "member")).lines[1]!.split(": ")[1]!;
    ok(await run(una, "join", link));
    expect((await run(una, "remote")).lines).toEqual(["Host: artifacts", `Namespace: ${NAMESPACE}`, `Name: ${name.name}`, expect.stringMatching(/^Remote URL: https:\/\/<service host>\//)]);

    // Without git nothing is signed: the command prints the clone command with the token's place marked, and the destination's
    // head does not move.
    const head = (await G.summary()).at;
    const without = await run({ ...rita, git: { run: async () => null } }, "clone", "here");
    expect(without).toEqual({ code: 1, lines: ["git is not installed here, so nothing was signed. With git installed, run artroom clone again; it runs:", `git -c http.extraHeader="Authorization: Bearer <read token>" clone -- https://<service host>/git/${NAMESPACE}/${name.name}.git here`] });
    expect([(await G.summary()).at, service.minted, git.runs]).toEqual([head, [], []]);

    // clone: one read token of 2 hours, read once, and one run of git whose arguments hold the remote and the directory and no token.
    const cloned = ok(await run(rita, "clone", "here", "--hours", "2"));
    expect(service.minted).toEqual(["read-plaintext-1"]);
    expect(git.runs).toEqual([
      { args: ["--version"], env: {} },
      { args: ["clone", "--", remoteUrl, "here"], env: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: "Authorization: Bearer read-plaintext-1" } },
    ]);
    expect(cloned.lines).toEqual([expect.stringMatching(new RegExp(`^Read token: ${G.name}:\\d+, until \\S+\\.$`)), `Remote URL: ${remoteUrl}`, "Cloned into here."]);
    // The token is in no argument, in no printed line, in no entry and in no config.
    for (const text of [JSON.stringify(git.runs.map((r) => r.args)), cloned.lines.join("\n"), canonicalize(await G.entries()), JSON.stringify(await lifetime.wait(() => rita.store.config()))]) expect(text).not.toContain("read-plaintext");
    // remote now prints the URL whole: the clone's credential answer named it, and the config keeps it.
    expect((await run(rita, "remote")).lines.at(-1)).toBe(`Remote URL: ${remoteUrl}`);

    // The member clones with a token of her own, read with her own session.
    git.runs.length = 0;
    const hers = ok(await run(una, "clone"));
    expect([service.minted, git.runs.at(-1)]).toEqual([["read-plaintext-1", "read-plaintext-2"], { args: ["clone", "--", remoteUrl], env: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: "Authorization: Bearer read-plaintext-2" } }]);
    expect(hers.lines.at(-1)).toBe(`Cloned into ${name.name}.`);
    expect(hers.lines.join("\n")).not.toContain("read-plaintext");
    // --hours is from 1 to 24; outside that nothing is signed.
    const before = (await G.summary()).at;
    expect((await run(una, "clone", "--hours", "25")).code).toBe(2);
    expect((await G.summary()).at).toEqual(before);
  } finally {
    lifetime.unOutside(G.name);
    lifetime.unWire(R.name);
  }

  // GitHub: the remote URL is whole from the branch item alone.
  const vic: Context = { store: memoryStore(), fetch, now, pause };
  ok(await run(vic, "install", SERVICE, "--host", "github.com", "--namespace", "generalbusiness-ai"));
  const H = lifetime.platform((await lifetime.wait(() => vic.store.config()))!.register!.scope);
  lifetime.wire(H.name, () => ({ outside: outsideOf(H.name) }));
  await H.restart();
  registers.length = 0;
  registers.push(H);
  try {
    ok(await run(vic, "claim", "hub", "--handle", "@vic"));
    const hub = ((await lifetime.platform((await lifetime.wait(() => vic.store.config()))!.repository!.destination).item(0)).values["repository"]) as { name: string };
    expect(await run(vic, "remote")).toEqual({ code: 0, lines: ["Host: github.com", "Namespace: generalbusiness-ai", `Name: ${hub.name}`, `Remote URL: https://github.com/generalbusiness-ai/${hub.name}.git`] });
    // Past the intent window of the claim, the founder's key's signed read is refused, and the destination, which has no act yet, is
    // read with the founder's session: remote and clone go on (the planner's decision ca8ad1cf; the gap the live-ops note's section 4,
    // items 1 and 2, recorded).
    lifetime.advance(16 * 60_000);
    expect(await run(vic, "remote")).toEqual({ code: 0, lines: ["Host: github.com", "Namespace: generalbusiness-ai", `Name: ${hub.name}`, `Remote URL: https://github.com/generalbusiness-ai/${hub.name}.git`] });
    expect(await run({ ...vic, git: { run: async () => null } }, "clone")).toEqual({ code: 1, lines: ["git is not installed here, so nothing was signed. With git installed, run artroom clone again; it runs:", `git -c http.extraHeader="Authorization: Basic <x-access-token:read token, base64>" clone -- https://github.com/generalbusiness-ai/${hub.name}.git`] });
  } finally {
    lifetime.unWire(H.name);
  }
}
