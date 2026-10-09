import { env } from "cloudflare:workers";
import { describe, expect, inject, test } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, keyIdOfSecret, scopeIdOf, textDigest, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import worker, { type Env } from "../../scope/src/worker.ts";
import { site } from "../../scope/src/site/route.ts";
import { gitHub, Hub, ownHost, type Stand } from "../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { memoryStore, type Context, type Git, type Outcome } from "../../cli/src/index.ts";
import { actsOn, listLanes, loadChange, loadIssue, loadRules, loadSite, openRoom, placeOf } from "../../page/src/index.ts";
import { FILES, branchFiles, judged, registerSetting, rehearse, transcript, type NextShot, type Person, type Rehearsal, type Stage, type Taken } from "../../../scripts/demo/rehearse.ts";
import { allowedClaim } from "../../page/src/claim.ts";
import { captureBinding, observeCaptures } from "../../../scripts/demo/capture-binding.ts";

const SERVICE = "https://scopes.test";

declare module "vitest" {
  interface ProvidedContext { demoRecord: boolean }
}

// Invariant: the demo runner's rehearsal, run on a room, prints for every shot of the demo script's middle the exit code and the
// lines the script expects, in order, and its transcript's table says so shot by shot; a shot whose outcome differs is a row that
// says no, and the rehearsal is not ok. The transcript holds no secret.
//
// | Part | Is |
// |---|---|
// | The rehearsal | Real: `rehearse` of `scripts/demo/rehearse.ts`, which `scripts/demo-run.ts` runs against a deployment. Its commands are `command` of the cli package's `src/line.ts`, with a store in memory for each person. |
// | The scopes, the routes and the readers | Real, as in `issues.scope.test.ts`: the namespace `PLATFORM`, the Worker's HTTP routes, and the real read sessions under a TEST SECRET. The lanes are created by the real directory under the demo profile's digests, which the real rules scope activated. |
// | The Git host | The production wiring of `artifacts-wiring.ts` over STAND-IN `OwnGit`, or `github-wiring.ts` over STAND-IN `Hub`, of `packages/scope/test/hosts.ts`. The operator's setting that pins the planned register is the test wiring the stand-in to that register's ID before the planned install. No live provider runs. |
// | The site route and the page | Real: `site` of the scope package over the same stand-in, and the Worker's entry for `/page/`, called as the Worker calls them. Their answers are read as text; no browser runs. |
// | `git` | A STAND-IN: `clone` asks the stand-in host for its refs with the header that `artroom clone` put in git's environment, and keeps the head; `log --oneline` reads the commits from that head in the stand-in's objects. |
// | The scheduler | A STAND-IN: while a command waits, its `pause` runs the operations drivers and the dispatchers of every scope that a command has waited on, as a deployment's alarms would. |
// | The clock | The scripted clock of the namespaces signs the intents; the wall clock times the shots. |
describe("the demo runner's rehearsal on real scopes. The Git host, git and the scheduler are STAND-INs", () => {
  for (const [host, make] of [["artifacts", () => Promise.resolve(ownHost())], ["github.com", gitHub]] as const) {
    test(`on ${host}: every shot, from the planned install to the page, prints the exit code and the lines the script expects, and the transcript's table says yes for each; a shot whose outcome differs is a row that says no; no secret is in the transcript`, async () => {
      net.hold = net.deaf = null;
      platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
      platformNet.sessions = true;
      const wired = new Set<ScopeId>();
      try {
        await story(await make(), wired);
      } finally {
        platformNet.secret = null;
        platformNet.sessions = false;
        net.hold = null;
        for (const name of wired) platformOutside.delete(name);
      }
    }, 240_000);
  }

  for (const [host, make] of [["artifacts", () => Promise.resolve(ownHost())], ["github.com", gitHub]] as const) {
    test(`on ${host}: the optional manifest sequence follows shot 16, publishes both text files together and refuses a controlled two-file branch; Git capture is a STAND-IN`, async () => {
      net.hold = net.deaf = null;
      platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
      platformNet.sessions = true;
      const wired = new Set<ScopeId>();
      try {
        const at = await make();
        const { stage, drained } = testStage(at, wired);
        const next: number[] = [];
        const rehearsal = await rehearse({ ...stage, manifest: true, beforeShot: async (shot) => { next.push(shot.n); } });
        const failed = rehearsal.shots.filter((shot) => !shot.match).map((shot) => `${shot.n}. ${shot.title}: ${shot.why}\n${shot.lines.join("\n")}`);
        expect(failed, failed.join("\n\n")).toEqual([]);
        expect([rehearsal.ok, rehearsal.shots.length, next]).toEqual([true, 31, Array.from({ length: 31 }, (_, i) => i + 1)]);
        expect(rehearsal.shots.slice(15, 21).map((shot) => shot.title)).toEqual([
          "Edit a page in an open folder, closing the issue", "Activate the manifest-list change definition",
          "Prepare the committed two-text-file branch two-pages", "Propose a two-text-file branch: published",
          "Prepare the committed two-text-file branch two-controlled", "Propose a controlled two-text-file branch: refused by name",
        ]);
        expect(rehearsal.shots[18]!.lines[0]).toMatch(/^Proposed 2 files as change sc_/);
        expect(rehearsal.shots[20]!.lines[1]).toContain("rules-not-met:rules");
        const directory = rehearsal.room.directory!;
        for (const file of branchFiles("two-pages")) {
          const page = await stage.get(`${SERVICE}/site/${directory}/HEAD/${file.path}`);
          expect([page.status, page.body.includes(new TextDecoder().decode(file.bytes).split("\n\n")[1]!.trim())]).toEqual([200, true]);
        }
        expect((await stage.get(`${SERVICE}/site/${directory}/HEAD/guide/controlled.md`)).status).toBe(404);
        expect(rehearsal.shots.find((shot) => shot.title === "The verifier, every scope")!.lines.at(-1)).toBe("All consistent: 14 scopes.");
        const text = transcript(rehearsal, { service: SERVICE, host, namespace: at.namespace, started: "in the test", how: "Git capture and preparation are STAND-INs." });
        expect(text).not.toMatch(/artroom-invite:[A-Za-z0-9_-]{9}/);
        const published = rehearsal.shots[18]!;
        expect(judged(published.expected, { code: 0, lines: [published.lines[0]!.replace("2 files", "1 files"), published.lines[1]!] }, {})).toMatch(/^line 1/);
        await drained();
      } finally {
        platformNet.secret = null; platformNet.sessions = false; net.hold = null;
        for (const name of wired) platformOutside.delete(name);
      }
    }, 240_000);
  }

  // Not a test of a property: the recorder for `scripts/demo-captures.ts --recorded`. It runs only when the root config provides
  // `demoRecord`, which `DEMO_RECORD=1` sets. It rehearses on a fresh room, as the test above does, then reads each screen of the
  // captures as the browser will, through the page's data functions, signed in as the founder, and asks the Worker's entry for the
  // page's two files. Each request and its answer is printed, in lines that begin `DEMO-RECORD `, for the script to give the browser
  // in place of a service, as `packages/page/test/screens.mjs` does with its own recorder.
  test.skipIf(!inject("demoRecord"))("record the Worker's answers to the page's reads on the rehearsal's room, for demo-captures (runs only with DEMO_RECORD=1)", async () => {
    net.hold = net.deaf = null;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    const wired = new Set<ScopeId>();
    try {
      await record(ownHost(), wired);
    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
      net.hold = null;
      for (const name of wired) platformOutside.delete(name);
    }
  }, 240_000);
});

/** One recorded answer: its status, the headers the browser needs, and its body. */
interface Recorded { status: number; headers: Record<string, string>; body: string }
const KEPT_HEADERS = ["content-type", "content-security-policy", "location", "x-content-type-options"];

async function record(at: Stand, wired: Set<ScopeId>): Promise<void> {
  const { stage, people, pages, drained } = testStage(at, wired);
  const rehearsal = await rehearse(stage);
  expect(rehearsal.ok).toBe(true);
  await drained();
  let recording = new Map<string, Recorded>();
  const keep = async (key: string, answer: Response): Promise<Response> => {
    const body = await answer.text();
    const headers = Object.fromEntries(KEPT_HEADERS.flatMap((name) => (answer.headers.get(name) ? [[name, answer.headers.get(name)!]] : [])));
    recording.set(key, { status: answer.status, headers, body });
    return new Response(body, { status: answer.status, headers: answer.headers });
  };
  // An act's body differs each time it is signed, so it is answered by its path alone. A session is answered by its path and the
  // key that asked, which the browser's own request names.
  const recorded = (async (url: string, init?: RequestInit) => {
    const answer = await (pages as unknown as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    const path = url.slice(SERVICE.length);
    const actor = path.endsWith("/sessions") ? ` ${(JSON.parse(String(init?.body)) as { request: { actor: string } }).request.actor}` : "";
    return keep(`${init?.method === "POST" ? "POST" : "GET"} ${path}${actor}`, answer);
  }) as unknown as Fetch;
  const founder = people.founder!;
  const config = (await founder.store.config())!;
  const secret = (await founder.store.secret(config.key))!;
  const place = placeOf(JSON.stringify(config))!;
  const { issue, published, refused } = rehearsal.room as Required<typeof rehearsal.room>;
  // The screens, each as `main.ts` draws it: the room, the issue, the refused change, the published change and the rules; then
  // the rendered page, which the browser opens by its address.
  const room = await openRoom({ service: SERVICE, secret, fetch: recorded, now: () => timeMs(net.clock.now)! }, place);
  await listLanes(room);
  await actsOn(room, room.directory);
  await loadIssue(room, issue as ScopeId);
  await actsOn(room, issue as ScopeId);
  for (const change of [refused, published] as ScopeId[]) {
    await loadChange(room, change);
    await actsOn(room, change);
  }
  await loadRules(room);
  await actsOn(room, room.rules);
  expect((await loadSite(room, "guide/start.md")).status).toBe(200);
  for (const path of ["/page/", "/page/page.js"]) await keep(`GET ${path}`, await worker.fetch(new Request(`${SERVICE}${path}`), {} as Env));
  // Readonly claim eligibility is recorded separately for each actual caller.
  // A path-only map cannot reuse the operator's signed read for a member.
  const founderSession = { service: SERVICE, secret, fetch: recorded, now: () => timeMs(net.clock.now)! };
  const configured = await allowedClaim(founderSession, config.register!);
  const founderAnswers = Object.fromEntries(recording);
  recording = new Map();
  const member = people.member!;
  const memberConfig = (await member.store.config())!;
  const memberSecret = (await member.store.secret(memberConfig.key))!;
  const memberPlace = placeOf(JSON.stringify(memberConfig))!;
  const memberSession = { service: SERVICE, secret: memberSecret, fetch: recorded, now: () => timeMs(net.clock.now)! };
  const memberRoom = await openRoom(memberSession, memberPlace);
  await listLanes(memberRoom);
  await actsOn(memberRoom, memberRoom.directory);
  let memberRefusal = "";
  try { await allowedClaim(memberSession, config.register!); }
  catch (error) { memberRefusal = error instanceof Error ? error.message : "Eligibility could not be read."; }
  expect(memberRefusal).not.toBe("");
  const assets = Object.fromEntries(Object.entries(founderAnswers).filter(([key]) => key === "GET /page/" || key === "GET /page/page.js"));
  const kept = {
    service: SERVICE, place, room: rehearsal.room, secret: b64url(secret), answers: founderAnswers,
    claimWitness: { register: configured.register, definition: configured.definition,
      founder: { place, secret: b64url(secret), actor: keyIdOfSecret(secret), recordedName: room.name, answers: founderAnswers },
      member: { place: memberPlace, secret: b64url(memberSecret), actor: keyIdOfSecret(memberSecret), answers: { ...assets, ...Object.fromEntries(recording) }, refusal: memberRefusal },
    },
  };
  // In lines of at most 64 KiB, which the test runner prints whole.
  const text = b64url(new TextEncoder().encode(JSON.stringify(kept)));
  for (let i = 0, n = 0; i < text.length; i += 65536, n++) console.log(`DEMO-RECORD ${n} ${text.slice(i, i + 65536)}`);
  console.log("DEMO-RECORD end");
}

/** The stage of the rehearsal on the test Worker, and what the test reads of it: the people's contexts and the stand-in host. */
function testStage(at: Stand, wired: Set<ScopeId>): { stage: Stage; people: Partial<Record<Person, Context>>; pages: Fetch; drained(): Promise<void> } {
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
  const branches = new Map<string, { base: string; files: readonly { path: string; bytes: Uint8Array }[] }>();
  const git: Git = {
    files: async (base, branch) => {
      const captured = branches.get(branch);
      if (!captured || captured.base !== base) return { ok: false, reason: "stand-in-base-mismatch" };
      return { ok: true, tip: base, files: captured.files };
    },
    run: async (args, given) => {
      if (args.length === 1 && args[0] === "--version") {
        expect(given).toEqual({});
        return 0;
      }
      if (args[0] !== "clone") return 1;
      const [remote, directory] = args.slice(-2) as [string, string];
      const header = (given["GIT_CONFIG_VALUE_0"] ?? "").replace(/^Authorization: /, "");
      const answer = await at.stand.fetch(new Request(`${remote}/info/refs?service=git-upload-pack`, { headers: { authorization: header } }));
      if (answer.status !== 200) return 128;
      clones.set(directory, at.stand.refs.get("refs/heads/main")!);
      return 0;
    },
  };
  // The paths as the deployed Worker answers them: the site route over the stand-in host, the page, and the scope routes.
  const deployed = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = new URL(url).pathname;
    return path.startsWith("/site/") ? site(new Request(url, init), { SCOPES: env.PLATFORM, ...at.bindings(register!) }, at.stand.fetch)
      : path.startsWith("/page/") ? worker.fetch(new Request(url, init), {} as Env) : routed(url, init);
  };
  const people: Partial<Record<Person, Context>> = {};
  const stage: Stage = {
    service: SERVICE, host: at.host, namespace: at.namespace, name: "demo",
    person: (who) => {
      // The injected transport is this real test Worker at SERVICE, not an
      // arbitrary callback asserted to prove a service's historical source.
      const context = { store: memoryStore(), fetch, trustedFoundingService: { service: SERVICE, fetch }, now, pause, git, read: async (path: string) => FILES[path] ?? null };
      return (people[who] = context);
    },
    pin: async (planned) => {
      register = planned as ScopeId;
      wire(register);
      known.push(new Platform(register));
      return `STAND-IN for the operator's setting: the test wires ${registerSetting(at.host)} to ${planned} before the planned install.`;
    },
    get: async (url) => {
      const answer = await deployed(url);
      return { status: answer.status, type: answer.headers.get("content-type") ?? "", body: await answer.text() };
    },
    prepareBranch: async (branch, files) => {
      const base = at.stand.refs.get("refs/heads/main")!;
      clones.set("site", base);
      branches.set(branch, { base, files });
      return { code: 0, lines: [`Prepared local Git branch ${branch} with ${files.length} text files.`, `STAND-IN Git preparation: pull current room head ${base}, commit the two named text files locally.`] };
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
  return { stage, people, pages: deployed as unknown as Fetch, drained: () => pause([]) };
}

async function story(at: Stand, wired: Set<ScopeId>): Promise<void> {
  const { stage, people, drained } = testStage(at, wired);
  const told: number[] = [];
  const next: NextShot[] = [];
  const events: string[] = [];
  let waiting = false;
  let clock = Date.UTC(2026, 9, 8);
  // The pacing wait must finish before a command/read runs or its timer starts.
  // A clock and a microtask gate avoid wall-clock sleeps. The real scope story
  // still proves each shot runs; the added boundary guards against running it
  // while the operator is narrating.
  const rehearsal: Rehearsal = await rehearse({
    ...stage,
    now: () => clock,
    beforeShot: async (shot) => {
      waiting = true;
      next.push(shot);
      events.push(`before ${shot.n}`);
      await Promise.resolve();
      clock += 10_000;
      waiting = false;
    },
    person: (who) => { expect(waiting, "command started before pacing completed").toBe(false); return stage.person(who); },
    get: (url) => { expect(waiting, "GET started before pacing completed").toBe(false); return stage.get(url); },
    log: (directory) => { expect(waiting, "git started before pacing completed").toBe(false); return stage.log(directory); },
    told: (shot) => { told.push(shot.n); events.push(`after ${shot.n}`); },
  });
  expect(events).toEqual(rehearsal.shots.flatMap((shot) => [`before ${shot.n}`, `after ${shot.n}`]));
  expect(next).toEqual(rehearsal.shots.map(({ n, title, scene, who, typed }) => ({ n, title, scene, who, typed })));
  expect(rehearsal.shots.every((shot) => shot.seconds === 0), "pre-shot waits must be outside shot durations").toBe(true);
  const text = transcript(rehearsal, { service: SERVICE, host: at.host, namespace: at.namespace, started: "in the test", how: "On the test Worker." });

  // Every shot ran, in order, as it ended, and each matches; the table has one row for each, and each says yes.
  const rows = text.split("\n").filter((line) => /^\| \d+\. /.test(line));
  const failed = rehearsal.shots.filter((shot) => !shot.match).map((shot) => `${shot.n}. ${shot.title}: ${shot.why}\n${shot.lines.join("\n")}`);
  expect(failed, failed.join("\n\n")).toEqual([]);
  expect([rehearsal.ok, told, rows.length, rows.every((row) => row.endsWith(" | yes |"))]).toEqual([true, rehearsal.shots.map((shot) => shot.n), 26, true]);
  expect(text).toContain("Result: all 26 shots printed what the script expects.");
  expect(rehearsal.shots[0]!.typed).toContain(`--host ${at.host} --namespace ${at.namespace}`);
  expect(rehearsal.shots[0]!.note).toContain(`${at.host === "github.com" ? "GITHUB_APP_CONFIG" : "ARTIFACTS_CONFIG"}.registerScope`);
  if (at.stand instanceof Hub) {
    expect(at.stand.mintedPermissions.slice(0, 2)).toEqual(["write", "read"]);
    expect(at.stand.mintedPermissions.filter((permission) => permission === "read")).toHaveLength(1);
  }
  // The room's ids are what the shots printed, for the captures.
  expect(Object.keys(rehearsal.room).sort()).toEqual(["controlled", "destination", "directory", "issue", "membership", "published", "refused", "register", "rules", "service"]);

  // Real native genesis and actual creator send entries anchor the capture's
  // lane hints to the full refs kept by claim/join, without a new grant.
  const births = await observeCaptures(people.founder!, rehearsal.room);
  const config = (await people.founder!.store.config())!;
  const observed = { v: 1 as const, source: "test source", service: SERVICE, config: textDigest(canonicalize(config)), actor: keyIdOfSecret((await people.founder!.store.secret(config.key))!), births };
  const bound = captureBinding(config, observed, SERVICE, { ...rehearsal.room, diagnostic: "not capture metadata" } as typeof rehearsal.room, "test source");
  expect(bound.place).toEqual({ directory: config.repository!.directory.scope, membership: config.repository!.membership });
  expect(bound.room).toEqual(rehearsal.room);
  expect(() => captureBinding(config, observed, "https://other.test", rehearsal.room, "test source")).toThrow("Capture binding");
  expect(() => captureBinding(config, observed, SERVICE, { ...rehearsal.room, published: rehearsal.room.controlled! }, "test source")).toThrow("Capture binding");
  const detached = structuredClone(observed);
  detached.births.published.creator = null;
  expect(() => captureBinding(config, detached, SERVICE, rehearsal.room, "test source")).toThrow("Capture binding");
  let loaded = 0;
  const noKey: Context = { ...people.founder!, store: { ...people.founder!.store, secret: async () => { loaded++; throw new Error("unexpected key load"); } } };
  await expect(observeCaptures(noKey, { ...rehearsal.room, service: "https://other.test" })).rejects.toThrow("Capture binding");
  await expect(observeCaptures(noKey, { ...rehearsal.room, directory: rehearsal.room.issue! })).rejects.toThrow("Capture binding");
  expect(loaded).toBe(0);

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
  // A captured register whose saved plan disagrees must not reach the pin
  // hook or any later command. The command still produces its normal lines;
  // this control changes only the saved correspondence the runner must check.
  let pins = 0;
  let saves = 0;
  const stopped = await rehearse({ ...stage, pin: async () => { pins++; return "unexpected pin"; }, person: async (who) => {
    const ctx = await stage.person(who);
    return { ...ctx, store: { ...ctx.store, save: async (saved) => { saves++; await ctx.store.save(saved.plan ? { ...saved, plan: { ...saved.plan, register: config.repository!.directory.scope } } : saved); } } };
  } });
  expect([pins, saves, stopped.ok, stopped.shots[0]!.why, stopped.shots.slice(1).every((shot) => shot.code === -1)]).toEqual([0, 1, false, "planned install identity is missing or inconsistent", true]);
  await drained();
}
