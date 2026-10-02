/**
 * Review f30be7f6, CLI findings.
 *
 * - E5.1: `artroom workspace` reserves its installation (a workspace
 *   revision) before it asks the room for anything, and installs only if
 *   no later local workspace action or release bumped that revision, and
 *   only for the lease it was asked for. A superseded workspace keeps the
 *   newer remote, credential, mapping and selection, and says so.
 * - E5.2: the config and journal are schema 2. Version 1 files are decoded
 *   explicitly; local changes that their saved evidence cannot prove safe
 *   become "manual local step" messages, while the kept receipt is still
 *   returned. Unknown versions are refused.
 */

import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, git } = useHarness();

const configPath = (home: string) => join(home, "config.json");
const config = (home: string) => JSON.parse(readFileSync(configPath(home), "utf8"));
const room = (home: string) => config(home).rooms[h.room.id];
const acts = (kind: string) => h.room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === kind);
const calls = (route: string) => h.room.requests.filter((r) => r.route === route).length;
const crashAt = (name: string) => ({
  step: (s: string) => {
    if (s === name) throw new Error(`interrupted after ${s}`);
  },
});

function repoAt(name: string): string {
  const dir = join(h.tmp, name);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "a@example.com");
  git(dir, "config", "user.name", "A");
  writeFileSync(join(dir, "README.md"), "hello\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "first");
  return dir;
}
const credential = (dir: string) => join(dir, ".git", "artroom", "credentials");

/** A fetch that holds the first workspace-token response after the room has answered it, until released. */
function pauseTokenResponse() {
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const reached = new Promise<void>((r) => (arrived = r));
  let paused = false;
  const hold: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    if (!paused && String(input).endsWith("/requests") && typeof init?.body === "string" && init.body.includes('"workspace-token"')) {
      paused = true;
      arrived();
      await gate;
    }
    return res;
  };
  return { fetch: hold, reached, release };
}

describe("E5.1: a workspace installs only while its reservation still owns the workspace", () => {
  test("same lane: a lease-1 response that arrives after release, reclaim and a lease-2 workspace installs nothing", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = room(home).lane as string;
    const pause = pauseTokenResponse();
    const old = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, ["release"], dir)).code).toBe(EXIT.ok);
    expect((await cli(home, ["claim", "src/**", "--lane", x], dir)).code).toBe(EXIT.ok);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const newer = { file: readFileSync(credential(dir), "utf8"), mapping: room(home).workspaces[x] };
    expect(newer.mapping.lease).toBe(2);
    pause.release();
    const res = await old;
    expect(res.code).toBe(EXIT.failed);
    expect(res.out).toContain(`Did not install the workspace for lane ${x}, lease 1: a newer workspace or release for this repository happened`);
    expect(readFileSync(credential(dir), "utf8")).toBe(newer.file);
    expect(room(home).workspaces[x]).toEqual(newer.mapping);
    expect(room(home).lane).toBe(x);
  });

  test("different lanes: an older response for lane X does not replace lane Y's newer workspace in the same repository", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = room(home).lane as string;
    const pause = pauseTokenResponse();
    const old = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = room(home).lane as string;
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const yFile = readFileSync(credential(dir), "utf8");
    const yRemote = git(dir, "remote", "get-url", "artroom");
    pause.release();
    expect((await old).code).toBe(EXIT.failed);
    expect(readFileSync(credential(dir), "utf8")).toBe(yFile);
    expect(git(dir, "remote", "get-url", "artroom")).toBe(yRemote);
    expect(room(home).lane).toBe(y);
    expect(room(home).workspaces[x]).toBeUndefined();
  });

  test("two overlapping workspaces: the one started last owns the installation, whichever answer arrives first", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const first = pauseTokenResponse();
    const a = cli(home, ["workspace"], dir, { fetch: first.fetch });
    await first.reached;
    const second = pauseTokenResponse();
    const b = cli(home, ["workspace"], dir, { fetch: second.fetch });
    await second.reached;
    first.release(); // the earlier-started workspace answers first
    expect((await a).code).toBe(EXIT.failed);
    expect(existsSync(credential(dir))).toBe(false);
    second.release();
    expect((await b).code).toBe(EXIT.ok);
    const mapping = room(home).workspaces[room(home).lane];
    expect(readFileSync(credential(dir), "utf8")).toContain(`installation ${mapping.install}.`);
  });

  test("a release while the workspace is being prepared: the revoked token is never installed", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const pause = pauseTokenResponse();
    const old = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, ["release"], dir)).code).toBe(EXIT.ok);
    pause.release();
    expect((await old).code).toBe(EXIT.failed);
    expect(existsSync(credential(dir))).toBe(false);
    expect(room(home).workspaces ?? {}).toEqual({});
  });

  test("a failed installation leaves nothing a later workspace or release mistakes for its own", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    // Interrupted after the mapping is written, before the credential: the mapping names a file that is not there.
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-mapped"))).code).toBe(EXIT.failed);
    expect(existsSync(credential(dir))).toBe(false);
    // The credential cannot be written at all: a directory is in its way.
    mkdirSync(credential(dir), { recursive: true });
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.failed);
    rmdirSync(credential(dir));
    // A clean installation replaces both, and a release removes exactly it.
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const mapping = room(home).workspaces[room(home).lane];
    expect(readFileSync(credential(dir), "utf8")).toContain(`installation ${mapping.install}.`);
    expect((await cli(home, ["release"], dir)).code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
  });
});

describe("E5.2: schema 1 files are decoded conservatively; unknown versions are refused", () => {
  function rewriteEntry(home: string, key: string, change: (e: Record<string, unknown>) => Record<string, unknown>): void {
    const path = join(home, "journal", h.room.id, `act-${key}.json`);
    writeFileSync(path, JSON.stringify(change(JSON.parse(readFileSync(path, "utf8")))));
  }

  test("the exact revision-4 answered release-lane entry returns its kept receipt, changes nothing local, and names the manual steps", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = room(home).lane as string;
    await cli(home, ["workspace"], dir);
    expect((await cli(home, ["release", "--idempotency-key", "rel-v1"], dir, crashAt("act-answered"))).code).toBe(EXIT.failed);
    // As revision 4 wrote it: schema 1, state answered with its receipt, and a lane-and-path intent.
    rewriteEntry(home, "rel-v1", (e) => ({ ...e, v: 1, local: { kind: "release-lane", lane: x, credential: credential(dir) } }));
    const before = calls("/acts");
    const res = await cli(home, ["release", "--idempotency-key", "rel-v1"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Released lane ${x}`);
    expect(res.out).toContain("Manual local step: This release was recorded by an older artroom, so its local cleanup was not done.");
    expect(res.out).toContain(`Manual local step: If ${credential(dir)} still holds lane ${x}'s credential, remove it by hand.`);
    expect(calls("/acts")).toBe(before);
    expect(existsSync(credential(dir))).toBe(true);
    expect(room(home).lane).toBe(x);
    expect(acts("release")).toHaveLength(1);
  });

  test.each([
    ["a revision-2 prepared claim with no state or intent", (e: Record<string, unknown>) => ({ v: 1, type: e["type"], id: e["id"], room: e["room"], command: e["command"], prepared: e["prepared"] })],
    ["a revision-4 prepared claim with a value-based intent", (e: Record<string, unknown>) => ({ ...e, v: 1, local: { kind: "select-lane", expect: null } })],
  ])("%s is resent unchanged, and its lane is not selected", async (_what, toV1) => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    expect((await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "claim-v1"])).code).toBe(EXIT.failed);
    rewriteEntry(home, "claim-v1", toV1);
    const res = await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "claim-v1"]);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toMatch(/Manual local step: This claim was recorded by an older artroom/);
    expect(room(home).lane).toBeUndefined();
    expect(acts("claim")).toHaveLength(1);
  });

  test("a schema-1 config with a path-only mapping and an old marker: release removes nothing it cannot prove, and says so", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = room(home).lane as string;
    await cli(home, ["workspace"], dir);
    const c = config(home);
    delete c.v;
    const r = c.rooms[h.room.id];
    r.workspaces = { [x]: credential(dir) };
    delete r.workspaceRev;
    delete r.workspaceBy;
    writeFileSync(configPath(home), JSON.stringify(c));
    const text = readFileSync(credential(dir), "utf8").split("\n");
    text[0] = `# artroom workspace credential for lane ${x}, lease 1.`;
    writeFileSync(credential(dir), text.join("\n"));
    const res = await cli(home, ["release"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Manual local step: ${credential(dir)} was set up by an older artroom for lane ${x}. If it still holds this lane's credential, remove it by hand.`);
    expect(existsSync(credential(dir))).toBe(true);
    expect(config(home).v).toBe(3);
  });

  test.each(["act-answered", "config-written"])("an interruption after %s while migrating a schema-1 config is finished by the same command", async (step) => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const c = config(home);
    delete c.v;
    writeFileSync(configPath(home), JSON.stringify(c));
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", `mig-${step}`];
    expect((await cli(home, argv, h.tmp, crashAt(step))).code).toBe(EXIT.failed);
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(config(home).v).toBe(3);
    expect(room(home).lane).toMatch(/^act_/);
    expect(room(home).laneRev).toBe(1);
    expect(acts("claim")).toHaveLength(1);
  });

  test("a config or journal entry from a newer schema is refused, and nothing is sent", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "future"]);
    rewriteEntry(home, "future", (e) => ({ ...e, v: 4 }));
    const before = calls("/acts");
    const entry = await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "future"]);
    expect(entry.code).toBe(EXIT.failed);
    expect(entry.err).toMatch(/was written by a newer artroom \(schema 4; this one reads 1 to 3\)\. Update artroom/);
    expect(calls("/acts")).toBe(before);
    const c = config(home);
    writeFileSync(configPath(home), JSON.stringify({ ...c, v: 99 }));
    const conf = await cli(home, ["attention"]);
    expect(conf.code).toBe(EXIT.failed);
    expect(conf.err).toMatch(/config\.json was written by a newer artroom \(schema 99/);
  });
});
