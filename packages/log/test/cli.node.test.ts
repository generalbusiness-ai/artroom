/**
 * `artroom verify` as a command, against real git repositories (Node only):
 * its exit status and what it prints, and that it fetches the room's pinned
 * version heads so a version's changed paths are checked against Git objects
 * (declared acts stage 3, request 1e8fee4b).
 *
 * Each case starts a Node process that runs git for every object it reads,
 * so the three cases run at the same time and the tests read their results.
 * The repositories are written as loose objects; publishing through the git
 * CLI is `gitcli.node.test.ts`'s subject.
 *
 * Without the pinned head the same version is reported `git-unwitnessed`:
 * `declared-stage3.test.ts` shows that through verify, without a process.
 */

import { beforeAll, describe, expect, test } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import type { Sha } from "@generalbusiness/artroom-contract";
import { utf8 } from "../src/canonical.ts";
import { LOG_REF, ROOT } from "../src/entries.ts";
import { MemoryGit, buildTree, encodeCommit, gitObject } from "../src/git.ts";
import { LogPublisher } from "../src/publisher.ts";
import type { Fixture } from "./support/declared-room.ts";
import { open, publish } from "./support/fixtures.ts";
import { RoomSim, keys, memberAuthority } from "./support/room-sim.ts";
import { walk } from "./support/layout2.ts";
import checkJson from "./fixtures/declared-check-prepared.json";

const cli = resolve(import.meta.dirname, "../src/cli.ts");

/** A bare repository holding `git`'s objects, with `refs` pointing into them. */
function repository(git: MemoryGit, refs: Readonly<Record<string, Sha>>): string {
  const dir = mkdtempSync(join(tmpdir(), "artroom-cli-"));
  const r = spawnSync("git", ["-C", dir, "init", "--bare", "--quiet"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  for (const [sha, o] of git.objects) {
    const file = join(dir, "objects", sha.slice(0, 2), sha.slice(2));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, deflateSync(Buffer.concat([Buffer.from(`${o.type} ${o.data.length}\0`), o.data])));
  }
  for (const [ref, sha] of Object.entries(refs)) {
    mkdirSync(dirname(join(dir, ref)), { recursive: true });
    writeFileSync(join(dir, ref), `${sha}\n`);
  }
  return dir;
}

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function verify(...args: string[]): Promise<Ran> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [cli, "verify", ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", fail);
    child.on("close", (status) => done({ status, stdout, stderr }));
  });
}

/** The entry of the fixture that proposes a version: verify checks its changed paths against Git objects. */
const PROPOSE = 7;

/** A declared-acts fixture with one proposed version, and its head pinned under refs/artroom/heads/<lane>/1, as the room publishes it. */
async function declared(): Promise<string> {
  const log = open(checkJson as unknown as Fixture);
  const git = await publish(log);
  const propose = log.entries[PROPOSE]!.entry as { act: { envelope: { kind: string; target: { lane: string }; body: { head: Sha } } } };
  expect(propose.act.envelope.kind).toBe("propose");
  return repository(git, { [LOG_REF]: (await git.readRef(LOG_REF))!, [`refs/artroom/heads/${propose.act.envelope.target.lane}/1`]: propose.act.envelope.body.head });
}

/** A small log, then a second commit by someone else that alters a published line. */
async function rewritten(): Promise<string> {
  const sim = new RoomSim();
  await sim.claim(keys.alice, memberAuthority("@alice", keys.alice.key), ["src/**"]);
  const git = new MemoryGit();
  const first = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(), sim.retained);
  const { files } = await walk(git, first.commit);
  const seg = `${ROOT}/segments/000000000000.jsonl`;
  files.set(seg, utf8(new TextDecoder().decode(files.get(seg)).replace('"Work on it"', '"Work on that"')));
  const { root, objects } = buildTree(Object.fromEntries(files));
  const tampered = gitObject("commit", encodeCommit({ tree: root, parents: [first.commit], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "tamper\n" }));
  for (const o of [...objects, tampered]) git.objects.set(o.sha, { type: o.type, data: o.data });
  return repository(git, { [LOG_REF]: tampered.sha });
}

describe("artroom verify, on a fresh clone", () => {
  let intact: Ran;
  let tampered: Ran;
  let unreadable: Ran;
  beforeAll(async () => {
    [intact, tampered, unreadable] = await Promise.all([
      declared().then((dir) => verify(dir, "--json")),
      rewritten().then((dir) => verify(dir)),
      verify(join(tmpdir(), "artroom-cli-no-such-repository")),
    ]);
  });

  test("an intact log exits 0; its version is witnessed by the pinned head the command fetches, so there is no proof limit", () => {
    expect(intact.status, intact.stderr).toBe(0);
    expect(JSON.parse(intact.stdout)).toMatchObject({ ok: true, verifiedThrough: 9, failures: [], limits: [] });
  });

  test("a log with a rewritten entry exits 1, and the report names history-rewritten; a room with no pinned heads is still read", () => {
    expect(tampered.status, tampered.stderr).toBe(1);
    expect(tampered.stdout).toMatch(/^Verification failed\./);
    expect(tampered.stdout).toMatch(/history-rewritten at entry 2 in [0-9a-f]{40}/);
  });

  test("a remote that cannot be read exits 2, apart from a failed check, and prints no report", () => {
    expect(unreadable.status).toBe(2);
    expect(unreadable.stderr).toMatch(/^artroom verify: /);
    expect(unreadable.stdout).toBe("");
  });
});
