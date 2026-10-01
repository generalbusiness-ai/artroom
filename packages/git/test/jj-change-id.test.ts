// A jj `change-id` commit header survives the whole lane path: a push to the
// lane's fork, pinning at refs/artroom/heads/<lane>/<generation>, and the
// landing onto main. Real git throughout; the fork and the canonical repo are
// local bare repos standing in for Artifacts, and the Room and publication
// tokens are the usual fakes (support.ts). measure/jj-change-id.mjs runs the
// same check against real Artifacts.
//
// jj writes the header after `committer`, as `change-id <32 letters k-z>`.
// The commit object is never rewritten on this path: pinning copies objects,
// and the landing either fast-forwards to the head or makes a merge commit
// whose second parent is the head (R-LAND-4). So the header is expected to
// survive, byte for byte, and these tests check it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sha } from "@generalbusiness/artroom-contract";
import { Landing } from "../src/landing/engine.ts";
import { GitPublisher } from "../src/publisher/git-publisher.ts";
import { pinnedRef } from "../src/publisher/gitops.ts";
import { Clock, FakeRoom, FakeTokens, Fixture, actId, laneId, localExec, nodeSql, opId, sh } from "./support.ts";

/** The raw commit object, exactly as git stores it. */
async function rawCommit(gitDir: string, rev: string): Promise<string> {
  const r = await localExec(["git", "--git-dir", gitDir, "cat-file", "commit", rev], { env: {} });
  if (r.code !== 0) throw new Error(`cat-file ${rev}: ${r.stderr}`);
  return r.stdout;
}

const changeIdOf = (raw: string) => /\nchange-id ([k-z]{32})\n/.exec(raw)?.[1] ?? null;

interface Written {
  readonly head: Sha;
  /** The commit object as its writer made it. */
  readonly raw: string;
  readonly changeId: string;
}

/** Writes one lane commit on main, with a `change-id` header, and pushes it to the fork's refs/heads/work. */
type Writer = (f: Fixture, fork: string) => Promise<Written>;

/** git hash-object on a hand-built commit, with the header where jj puts it. */
const hashObject: Writer = async (f, fork) => {
  const changeId = "zyxwvutsrqponmlkzyxwvutsrqponmlk";
  await sh(f.work, "checkout", "-q", "--detach", f.main);
  f.write({ "src/jj.txt": "written with a change-id\n" });
  await sh(f.work, "add", "-A");
  const tree = await sh(f.work, "write-tree");
  const who = "agent <agent@invalid> 1700000100 +0000";
  const body = `tree ${tree}\nparent ${f.main}\nauthor ${who}\ncommitter ${who}\nchange-id ${changeId}\n\nlane work\n`;
  const file = join(f.root, "commit.txt");
  writeFileSync(file, body);
  const head = (await sh(f.work, "hash-object", "-t", "commit", "-w", file)) as Sha;
  await sh(f.work, "push", "-q", fork, `${head}:refs/heads/work`);
  const raw = await rawCommit(join(f.work, ".git"), head);
  assert.equal(raw, body, "git stored the commit as written");
  return { head, raw, changeId };
};

/** jj itself: clone the fork, describe a change, and `jj git push` a bookmark. */
const jj: Writer = async (f, fork) => {
  const config = join(f.root, "jj.toml");
  writeFileSync(config, '[user]\nname = "agent"\nemail = "agent@invalid"\n');
  const env = { HOME: f.root, JJ_CONFIG: config };
  const dir = join(f.root, "jj-lane");
  const run = async (...args: string[]) => {
    const r = await localExec(["jj", ...args], { cwd: dir, env });
    if (r.code !== 0) throw new Error(`jj ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const clone = await localExec(["jj", "git", "clone", "--colocate", fork, dir], { cwd: f.root, env });
  if (clone.code !== 0) throw new Error(`jj git clone: ${clone.stderr}`);
  writeFileSync(join(dir, "src", "jj.txt"), "written by jj\n");
  await run("describe", "-m", "lane work");
  await run("bookmark", "create", "work", "-r", "@");
  await run("git", "push", "--bookmark", "work");
  const head = (await run("log", "-r", "work", "--no-graph", "-T", "commit_id")) as Sha;
  const changeId = await run("log", "-r", "work", "--no-graph", "-T", "change_id");
  return { head, raw: await rawCommit(join(dir, ".git"), head), changeId };
};

const jjInstalled = (await localExec(["jj", "--version"], { env: {} })).code === 0;

const WRITERS: [string, Writer, boolean][] = [
  ["git hash-object", hashObject, true],
  ["jj", jj, jjInstalled],
];

for (const [name, write, available] of WRITERS) {
  for (const mainMoves of [true, false]) {
    const how = mainMoves ? "a landing merge" : "a fast-forward landing";
    test(`jj change-id (${name}): the header is byte-identical in the fork, the pinned head and main's history after ${how} (R-PROP-1, R-LAND-4)`, { skip: available ? false : "jj is not installed" }, async (t) => {
      const f = await new Fixture().init();
      t.after(() => f.dispose());
      const fork = join(f.root, "fork.git");
      await sh(f.root, "clone", "-q", "--bare", f.canonical, fork);

      // The agent's commit, pushed to its fork.
      const lane = laneId(1);
      const w = await write(f, fork);
      assert.equal(changeIdOf(w.raw), w.changeId, "the writer put a change-id header in the commit");
      assert.equal(await rawCommit(fork, "refs/heads/work"), w.raw, "fork");

      // Propose: pin the head from the fork into the canonical repo.
      assert.deepEqual(await f.ops.pinObjects(fork, f.canonical, w.head), { kind: "pinned", already: false });
      assert.deepEqual(await f.ops.pinRef(f.canonical, pinnedRef(lane, 1), w.head), { kind: "pinned", already: false });
      assert.equal(await rawCommit(f.canonical, pinnedRef(lane, 1)), w.raw, "pinned head");

      // Land through the engine and the real git publisher.
      const room = new FakeRoom();
      const tokens = new FakeTokens();
      const engine = new Landing({ sql: nodeSql(), room, publisher: new GitPublisher(f.ops, f.canonical), tokens, now: new Clock().now });
      const landLane = async (n: number, head: Sha) => {
        room.hold(laneId(n), 1, head);
        await engine.refreshMain();
        const r = engine.accept({ id: opId(n), lane: laneId(n), generation: 1, head, act: actId(500 + n), leaseGeneration: 1, policyVersion: room.policy });
        assert.ok(!("refused" in r), "accepted");
        await engine.prepare(opId(n));
        assert.equal(engine.reserve(opId(n)).kind, "reserved");
        await engine.publish();
        assert.equal(engine.view(opId(n))?.state, "landed");
      };
      let before = f.main;
      if (mainMoves) {
        // Another lane lands first, so this one needs a merge commit.
        const other = await f.propose(laneId(2), 1, f.main, { "src/other.txt": "other lane\n" });
        await landLane(2, other);
        before = other;
      }
      await landLane(1, w.head);

      const main = await f.canonicalMain();
      if (mainMoves) {
        assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${main}^1`), before, "merge: first parent is the old main");
        assert.equal(await sh(f.root, "--git-dir", f.canonical, "rev-parse", `${main}^2`), w.head, "merge: second parent is the lane's head, not a copy");
        assert.equal(changeIdOf(await rawCommit(f.canonical, main)), null, "the merge commit is Artroom's own and carries no change-id");
      } else {
        assert.equal(main, w.head, "fast-forward: main is the lane's commit itself");
      }
      const history = (await sh(f.root, "--git-dir", f.canonical, "rev-list", "refs/heads/main")).split("\n");
      assert.ok(history.includes(w.head), "the lane's commit is in main's history");
      // Read through main, not by SHA: the commit main reaches is the one the agent wrote.
      assert.equal(await rawCommit(f.canonical, mainMoves ? "refs/heads/main^2" : "refs/heads/main"), w.raw, "main's history");
    });
  }
}
