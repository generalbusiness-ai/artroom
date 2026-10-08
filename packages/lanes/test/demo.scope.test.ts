import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, scopeIdOf, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import worker, { type Env } from "../../scope/src/worker.ts";
import { site } from "../../scope/src/site/route.ts";
import { ownHost, type Stand } from "../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { memoryStore, type Context, type Git, type Outcome } from "../../cli/src/index.ts";
import { FILES, judged, rehearse, transcript, type Person, type Rehearsal, type Stage, type Taken } from "../../../scripts/demo/rehearse.ts";

const SERVICE = "https://scopes.test";

// Invariant: the demo runner's rehearsal, run on a room, prints for every shot of the demo script's middle the exit code and the
// lines the script expects, in order, and its transcript's table says so shot by shot; a shot whose outcome differs is a row that
// says no, and the rehearsal is not ok. The transcript holds no secret.
//
// | Part | Is |
// |---|---|
// | The rehearsal | Real: `rehearse` of `scripts/demo/rehearse.ts`, which `scripts/demo-run.ts` runs against a deployment. Its commands are `command` of the cli package's `src/line.ts`, with a store in memory for each person. |
// | The scopes, the routes and the readers | Real, as in `issues.scope.test.ts`: the namespace `PLATFORM`, the Worker's HTTP routes, and the real read sessions under a TEST SECRET. The lanes are created by the real directory under the demo profile's digests, which the real rules scope activated. |
// | The Git host | The production wiring of the ports of the hosting's own Git service, `artifacts-wiring.ts`, over the STAND-IN `OwnGit` of `packages/scope/test/hosts.ts`. The operator's setting that pins the planned register is the test wiring the stand-in to that register's ID before the planned install, as `install.scope.test.ts` does. |
// | The site route and the page | Real: `site` of the scope package over the same stand-in, and the Worker's entry for `/page/`, called as the Worker calls them. Their answers are read as text; no browser runs. |
// | `git` | A STAND-IN: `clone` asks the stand-in host for its refs with the header that `artroom clone` put in git's environment, and keeps the head; `log --oneline` reads the commits from that head in the stand-in's objects. |
// | The scheduler | A STAND-IN: while a command waits, its `pause` runs the operations drivers and the dispatchers of every scope that a command has waited on, as a deployment's alarms would. |
// | The clock | The scripted clock of the namespaces signs the intents; the wall clock times the shots. |
describe("the demo runner's rehearsal on real scopes. The Git host, git and the scheduler are STAND-INs", () => {
  test("every shot, from the planned install to the page, prints the exit code and the lines the script expects, and the transcript's table says yes for each; a shot whose outcome differs is a row that says no; no secret is in the transcript", async () => {
    net.hold = net.deaf = null;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    const wired = new Set<ScopeId>();
    try {
      await story(ownHost(), wired);
    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
      net.hold = null;
      for (const name of wired) platformOutside.delete(name);
    }
  }, 240_000);
});

/** The stage of the rehearsal on the test Worker, and what the test reads of it: the people's contexts and the stand-in host. */
function testStage(at: Stand, wired: Set<ScopeId>): { stage: Stage; people: Partial<Record<Person, Context>>; drained(): Promise<void> } {
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const now = () => timeMs(net.clock.now)!;
  let register: ScopeId | null = null;
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => at.outside(given, sql, at.bindings(register!))); };
  net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
  // STAND-IN for the scheduler, as in `issues.scope.test.ts`; it keeps every scope a command has waited on.
  const known: Platform[] = [];
  const pause = async (waiting: readonly string[]) => {
    for (const scope of waiting) if (!known.some((node) => node.name === scope)) known.push(new Platform(scope as never));
    for (let pass = 0; pass < 64; pass++) {
      let made = 0;
      for (const node of known) {
        while ((await (node.stub as unknown as { effect(): Promise<number> }).effect()) > 0) made++;
        made += await node.stub.dispatch();
      }
      if (made === 0) return;
    }
    await settle(...known);
  };
  // STAND-IN for git: a clone is a read of the stand-in's refs with the clone's header, and keeps the head it read.
  const clones = new Map<string, string>();
  const git: Git = {
    run: async (args, given) => {
      if (args[0] !== "clone") return 1;
      const [remote, directory] = args.slice(-2) as [string, string];
      const header = (given["GIT_CONFIG_VALUE_0"] ?? "").replace(/^Authorization: /, "");
      const answer = await at.stand.fetch(new Request(`${remote}/info/refs?service=git-upload-pack`, { headers: { authorization: header } }));
      if (answer.status !== 200) return 128;
      clones.set(directory, at.stand.refs.get("refs/heads/main")!);
      return 0;
    },
  };
  const people: Partial<Record<Person, Context>> = {};
  const stage: Stage = {
    service: SERVICE, host: at.host, namespace: at.namespace, name: "demo",
    person: (who) => (people[who] = { store: memoryStore(), fetch, now, pause, git, read: async (path) => FILES[path] ?? null }),
    pin: async (planned) => {
      register = planned as ScopeId;
      wire(register);
      known.push(new Platform(register));
      return `STAND-IN for the operator's setting: the test wires the stand-in host to ${planned} before the planned install.`;
    },
    get: async (url) => {
      const path = new URL(url).pathname;
      const answer = path.startsWith("/site/") ? await site(new Request(url), { SCOPES: env.PLATFORM, ...at.bindings(register!) }, at.stand.fetch)
        : path.startsWith("/page/") ? await worker.fetch(new Request(url), {} as Env) : await routed(url);
      return { status: answer.status, type: answer.headers.get("content-type") ?? "", body: await answer.text() };
    },
    log: async (directory): Promise<Outcome> => {
      let id = clones.get(directory);
      if (id === undefined) return { code: 1, lines: [`fatal: cannot change to '${directory}': No such file or directory`] };
      const lines: string[] = [];
      while (id !== undefined) {
        const text = new TextDecoder().decode(at.stand.objects.get(id)!.data);
        lines.push(`${id.slice(0, 7)} ${text.split("\n\n")[1]!.split("\n")[0]}`);
        id = /^parent (\S+)$/m.exec(text)?.[1];
      }
      return { code: 0, lines };
    },
  };
  return { stage, people, drained: () => pause([]) };
}

async function story(at: Stand, wired: Set<ScopeId>): Promise<void> {
  const { stage, people, drained } = testStage(at, wired);
  const told: number[] = [];
  const rehearsal: Rehearsal = await rehearse({ ...stage, told: (shot) => told.push(shot.n) });
  const text = transcript(rehearsal, { service: SERVICE, host: at.host, namespace: at.namespace, started: "in the test", how: "On the test Worker." });

  // Every shot ran, in order, as it ended, and each matches; the table has one row for each, and each says yes.
  const rows = text.split("\n").filter((line) => /^\| \d+\. /.test(line));
  const failed = rehearsal.shots.filter((shot) => !shot.match).map((shot) => `${shot.n}. ${shot.title}: ${shot.why}\n${shot.lines.join("\n")}`);
  expect(failed, failed.join("\n\n")).toEqual([]);
  expect([rehearsal.ok, told, rows.length, rows.every((row) => row.endsWith(" | yes |"))]).toEqual([true, rehearsal.shots.map((shot) => shot.n), 26, true]);
  expect(text).toContain("Result: all 26 shots printed what the script expects.");
  // The room's ids are what the shots printed, for the captures.
  expect(Object.keys(rehearsal.room).sort()).toEqual(["controlled", "destination", "directory", "issue", "membership", "published", "refused", "register", "rules", "service"]);

  // Each of the shots that the table lists as the script's outcomes is what the room holds: the issue is closed, the branch
  // holds the three commits after the founding one in order, and the refused change is not on it.
  const lines = (n: number) => rehearsal.shots[n - 1]!.lines;
  expect(lines(21)[0]).toMatch(/^#1 {2}closed \(completed\) {2}Add a getting-started page; assigned to @paul; lane sc_/);
  const pushed = at.stand.pushes.filter((push) => push.ref === "refs/heads/main").map((push) => push.commit);
  expect([pushed.length, lines(16)[2]!.includes(pushed[1]!), lines(19)[0]!.includes(pushed[2]!)]).toEqual([3, true, true]);
  expect(lines(22).at(-1)).toBe("All consistent: 12 scopes.");

  // No secret is in the transcript: neither the invitation links, nor any person's key, nor any credential of the host.
  const links = [rehearsal.shots[6]!, rehearsal.shots[8]!].map((shot) => shot.lines[1]!);
  expect(links.every((line) => line.endsWith("(cut: the link holds a secret)"))).toBe(true);
  for (const who of Object.values(people)) {
    const config = (await who.store.config())!;
    expect(text).not.toContain(b64url((await who.store.secret(config.key))!));
  }
  for (const secret of at.secrets()) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/artroom-invite:[A-Za-z0-9_-]{9}/);

  // Control: the judgment tells a different outcome from the expected one. The refused edit's expectation does not take the
  // published merge (its exit code differs); the published merge's expectation does not take the lines of another change's
  // publication (its lane differs); a table with such a row says no, and the result names the shot.
  const kept = { directory: rehearsal.room.directory!, controlled: rehearsal.room.controlled! };
  const [s16, s17, s19] = [16, 17, 19].map((n) => rehearsal.shots[n - 1]!) as [Taken, Taken, Taken];
  expect(judged(s17.expected, { code: s19.code as 0, lines: s19.lines }, { ...kept })).toBe("exit 0, where 1 is expected");
  expect(judged(s19.expected, { code: 0, lines: s16.lines.slice(2) }, { ...kept })).toMatch(/^line 1 is not "Published: commit <controlledCommit>, by the merge \{controlled\}:<seq>\."$/);
  expect(judged(s19.expected, { code: 0, lines: s19.lines }, { ...kept })).toBeNull();
  const changed = { ...rehearsal, shots: rehearsal.shots.map((shot) => (shot.n === 19 ? { ...shot, match: false, why: "line 1 differs" } : shot)), ok: false };
  const told2 = transcript(changed, { service: SERVICE, host: at.host, namespace: at.namespace, started: "", how: "" });
  expect([told2.includes("Result: 1 of 26 shots did not print what the script expects: 19."), told2.split("\n").filter((line) => line.endsWith(" | no |")).length]).toEqual([true, 1]);
  await drained();
}
