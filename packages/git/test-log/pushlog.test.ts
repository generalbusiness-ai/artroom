// Lane L's real LogPublisher, publishing through the publisher sandbox's
// git code (GitOps.pushLog) to a real git repository, then lane L's
// verifier over what landed.
import { describe, expect, test } from "vitest";
import { spawnSync, execFile } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sha } from "@generalbusiness/artroom-contract";
import { GitCli } from "../../log/src/gitcli.ts";
import { LOG_REF } from "../../log/src/entries.ts";
import { LogPublisher } from "../../log/src/publisher.ts";
import { verifyLog } from "../../log/src/verify.ts";
import type { GitObject, GitRemote, PushOutcome } from "../../log/src/git.ts";
import { RoomSim, goldenLog, keys, memberAuthority } from "../../log/test/support/room-sim.ts";
import type { MemberId } from "@generalbusiness/artroom-contract";
import { evaluateNotify, policy, rule } from "@generalbusiness/artroom-policy";
import { entryId, retain } from "../../log/src/entries.ts";
import { canonicalize } from "../../log/src/canonical.ts";
import { GitOps, type Exec } from "../src/publisher/gitops.ts";
import { decodeLogPush, decodeLogStage, LOG_PUSH_LIMITS, toB64url, toLogOutcome } from "../src/publisher/log-push.ts";
import type { StageOutcome, StagePart, StageWant } from "../../log/src/git.ts";
import { LOG_TRANSFER_LIMITS, PublishError } from "../../log/src/publisher.ts";

const exec: Exec = (argv, opts) =>
  new Promise((resolve) => {
    const [cmd, ...args] = argv;
    const child = execFile(cmd!, args, { cwd: opts.cwd, env: { ...opts.env, PATH: process.env["PATH"] ?? "/usr/bin:/bin" }, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end(opts.stdin ? Buffer.from(opts.stdin) : undefined);
  });

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

/** Lane L's GitRemote, as lane A's log remote builds it: the ref through the publisher's readLogRef, objects by ID from the repository, pushes through pushLog. */
class SandboxRemote implements GitRemote {
  readonly reader: GitCli;
  readonly ops: GitOps;
  readonly url: string;
  limits: { readonly objects: number; readonly bytes: number };
  pushes = 0;
  /** Decoded bytes each push carried. */
  readonly sent: number[] = [];
  /** Pushes to answer `unknown` without sending, as a lost connection would. */
  failNext = 0;
  /** Decoded part bytes of each stage call. */
  readonly staged: number[] = [];
  /** The stage call (by count) whose answer is lost, once. */
  failStageAt = -1;
  stageCalls = 0;
  readonly answers: StageOutcome[] = [];
  constructor(url: string, ops: GitOps, limits = LOG_PUSH_LIMITS) {
    this.url = url;
    this.ops = ops;
    this.limits = limits;
    this.reader = new GitCli(url, url); // objects by ID straight from the repository, as the binding reads them
  }
  readRef(ref: string) {
    // The sandbox's readLogRef, as lane A's log remote calls it.
    return this.ops.readLogRef(this.url, ref) as Promise<Sha | null>;
  }
  readObject(sha: Sha) {
    return this.reader.readObject(sha);
  }
  async stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
    const lose = this.stageCalls++ === this.failStageAt;
    // Over the wire as lane A sends it, then the sandbox's own request check and bound.
    const d = decodeLogStage({ cohort, want, parts: parts.map((p) => ({ ...p, data: toB64url(p.data) })) }, this.limits);
    if ("refused" in d) return d.refused;
    this.staged.push(d.parts.reduce((n, p) => n + p.data.length, 0));
    const r = (await this.ops.stageLog(this.url, d.cohort, d.want, d.parts)) as StageOutcome;
    if (lose) throw new Error("simulated: the sandbox staged the parts and the answer was lost");
    this.answers.push(r);
    return r;
  }
  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    this.pushes++;
    if (ref !== LOG_REF) throw new Error("only the log ref");
    if (this.failNext > 0) {
      this.failNext--;
      return { ok: false, reason: "unknown", detail: "simulated: the connection dropped before sending" };
    }
    // Over the wire as lane A sends it, then the sandbox's own request check and bound.
    const d = decodeLogPush({ objects: objects.map((o) => ({ type: o.type, data: toB64url(o.data) })), ref, next, lease }, this.limits);
    if ("refused" in d) return d.refused;
    this.sent.push(d.objects.reduce((n, o) => n + o.data.length, 0));
    return toLogOutcome(await this.ops.pushLog(this.url, d.objects, next, lease));
  }
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "artroom-pushlog-"));
  const remote = join(root, "remote");
  mkdirSync(remote);
  git(remote, "init", "--quiet", "--bare");
  const sandbox = (n: string) => {
    mkdirSync(join(root, n));
    return new GitOps({ exec, workdir: join(root, n), config: ["protocol.file.allow=always"] });
  };
  return { remote, sandbox };
}

describe("lane L's log through pushLog", () => {
  test("three publications land on refs/artroom/log exactly as lane L built them, git accepts them, and verify proves the prefix", async () => {
    const { remote, sandbox } = setup();
    const r = new SandboxRemote(remote, sandbox("publisher"));
    const { sim, c1, c2, c3 } = await goldenLog(r);
    expect(git(remote, "rev-parse", LOG_REF)).toBe(c3.commit);
    expect(git(remote, "rev-list", "--reverse", LOG_REF).split("\n")).toEqual([c1.commit, c2.commit, c3.commit]);
    expect(r.pushes).toBe(3);
    git(remote, "fsck", "--strict", "--no-dangling");
    expect(JSON.parse(git(remote, "show", `${LOG_REF}:artroom-log/v1/checkpoint.json`))).toMatchObject({ through: 10, hash: sim.entries[10]!.hash });
    const reader = GitCli.open(remote);
    await reader.fetch(LOG_REF);
    const report = await verifyLog(reader);
    expect(report.failures).toEqual([]);
    // The same check through the sandbox's read-back: readLogRef for the ref, objects by ID.
    const viaSandbox = await verifyLog(new SandboxRemote(remote, sandbox("verifier")));
    expect(viaSandbox.failures).toEqual([]);
    expect(viaSandbox).toMatchObject({ ok: true, head: c3.commit, commits: 3, verifiedThrough: report.verifiedThrough });
    expect(report).toMatchObject({ ok: true, head: c3.commit, commits: 3 });
  });

  test("the commit pushed is the one commitFor computes; a fresh sandbox after a restart continues on top", async () => {
    const { remote, sandbox } = setup();
    const { sim, publisher, c3 } = await goldenLog(new SandboxRemote(remote, sandbox("first")));
    // The Room computes the next commit before any remote write; the sandbox must push exactly it.
    sim.system({ type: "checkpoint", through: c3.through, hash: c3.hash, commit: c3.commit });
    const expected = publisher.commitFor(c3.commit, sim.entries, sim.checkpoint(), sim.retained);
    const reopened = await LogPublisher.open(new SandboxRemote(remote, sandbox("second")));
    const r = await reopened.publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(r.commit).toBe(expected);
    expect(git(remote, "rev-parse", LOG_REF)).toBe(expected);
    expect(git(remote, "rev-parse", `${expected}^`)).toBe(c3.commit);
  });

  test("another writer moved the ref: lane L gets lease-mismatch and refuses to write over it", async () => {
    const { remote, sandbox } = setup();
    const r = new SandboxRemote(remote, sandbox("p"));
    const { sim, publisher, c3 } = await goldenLog(r);
    git(remote, "update-ref", LOG_REF, `${c3.commit}^`); // someone moves the ref
    sim.system({ type: "checkpoint", through: c3.through, hash: c3.hash, commit: c3.commit });
    await expect(publisher.publish(sim.entries, sim.checkpoint(), sim.retained)).rejects.toMatchObject({ code: "unexpected-writer" });
  });

  test("lane L's transfer bound and the sandbox's are the same numbers", () => {
    expect(LOG_TRANSFER_LIMITS).toEqual(LOG_PUSH_LIMITS);
  });
});

/** Bytes of every tree and blob in `commit`'s tree: what a push of the complete tree would carry. */
function fullTree(remote: string, commit: string): { bytes: number; objects: GitObject[] } {
  const listed = git(remote, "ls-tree", "-r", "-t", "--format=%(objecttype) %(objectname)", commit).split("\n").filter(Boolean);
  const all = [`tree ${git(remote, "rev-parse", `${commit}^{tree}`)}`, ...listed].map((l) => {
    const [type, sha] = l.split(" ") as [GitObject["type"], Sha];
    return { type, sha, data: new Uint8Array(spawnSync("git", ["-C", remote, "cat-file", type, sha]).stdout) };
  });
  return { bytes: all.reduce((n, o) => n + o.data.length, 0), objects: all };
}

describe("review f7d273e1 (2): the bound is on one push, not on the accumulated log", () => {
  /** The golden log, then `more` one-entry cohorts, through `remote`. */
  async function grow(remote: SandboxRemote, more: number, opts: { maxTransfer?: { objects: number; bytes: number }; beforeEach?: (i: number) => void; reopen?: (i: number) => SandboxRemote | null } = {}) {
    const golden = await goldenLog(remote);
    const commits = [golden.c1.commit, golden.c2.commit, golden.c3.commit];
    let publisher = await LogPublisher.open(remote, opts.maxTransfer ? { maxTransfer: opts.maxTransfer } : {});
    for (let i = 0; i < more; i++) {
      opts.beforeEach?.(i);
      const fresh = opts.reopen?.(i);
      if (fresh) publisher = await LogPublisher.open(fresh, opts.maxTransfer ? { maxTransfer: opts.maxTransfer } : {});
      commits.push((await golden.sim.publish(publisher)).commit);
    }
    return { ...golden, commits };
  }

  test("an accumulated log larger than one bounded push keeps publishing small cohorts, through a retry and a restart, and verifies", async () => {
    // Unbounded, to measure: what each push carried, and what the complete tree of the last commit is.
    const dry = setup();
    const a = new SandboxRemote(dry.remote, dry.sandbox("dry"));
    const measured = await grow(a, 3);
    const bound = Math.max(...a.sent);
    const last = measured.commits.at(-1)!;
    const full = fullTree(dry.remote, last);
    expect(full.bytes).toBeGreaterThan(bound); // the accumulated log is larger than any one push
    // A cohort carries its new entries' segment, the checkpoint, the trees above them and new retained files.
    expect(a.sent.at(-1)!).toBeLessThan(full.bytes);

    // Bounded at the largest push, publisher and sandbox alike.
    const run = setup();
    const limits = { objects: LOG_PUSH_LIMITS.objects, bytes: bound };
    const b = new SandboxRemote(run.remote, run.sandbox("p"), limits);
    const restarted = new SandboxRemote(run.remote, run.sandbox("after-restart"), limits);
    const got = await grow(b, 3, {
      maxTransfer: limits,
      beforeEach: (i) => {
        if (i === 0) b.failNext = 1; // the first bounded cohort: no answer, read back, the same cohort again
      },
      reopen: (i) => (i === 2 ? restarted : null), // the last: a restarted publisher, rebuilt from the ref
    });
    expect(got.commits).toEqual(measured.commits); // the same commits as unbounded
    expect(git(run.remote, "rev-parse", LOG_REF)).toBe(last);
    expect(Math.max(...b.sent, ...restarted.sent)).toBeLessThanOrEqual(bound);
    expect(restarted.sent.length).toBe(1);
    // The complete tree in one push would have been refused by the sandbox.
    const whole = decodeLogPush({ objects: full.objects.map((o) => ({ type: o.type, data: toB64url(o.data) })), ref: LOG_REF, next: last, lease: measured.commits.at(-2)! }, limits);
    expect(whole).toMatchObject({ refused: { ok: false, reason: "unknown", detail: expect.stringMatching(/cohort too large/) } });
    // Independent check: a fresh clone, git fsck, and lane L's verifier.
    git(run.remote, "fsck", "--strict", "--no-dangling");
    const reader = GitCli.open(run.remote);
    await reader.fetch(LOG_REF);
    const report = await verifyLog(reader);
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, head: last, commits: 6 });
  });

  test("a cohort whose new objects exceed one push, to a remote that cannot stage, is refused as cohort-too-large, and nothing is sent", async () => {
    const { remote, sandbox } = setup();
    const r = new SandboxRemote(remote, sandbox("p"));
    const { sim, c3 } = await goldenLog(r);
    (r as { stage?: unknown }).stage = undefined; // a remote that cannot stage
    const pushes = r.pushes;
    const small = await LogPublisher.open(r, { maxTransfer: { objects: 100_000, bytes: 64 } });
    const err = await small.publish(sim.entries.concat(), sim.checkpoint(), sim.retained).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect(err).toMatchObject({ code: "cohort-too-large", retryable: false });
    expect(r.pushes).toBe(pushes);
    expect(git(remote, "rev-parse", LOG_REF)).toBe(c3.commit);
  });
});

describe("review b618eca1: an object larger than one transfer is staged in parts through the sandbox", () => {
  const tiny = { objects: 100_000, bytes: 1024 };

  /** The golden log on `remote`, and the commit an unbounded publisher writes for the next cohort. */
  async function next(remote: SandboxRemote) {
    const dry = setup();
    const ref = await goldenLog(new SandboxRemote(dry.remote, dry.sandbox("dry")));
    const expected = (await ref.sim.publish(ref.publisher)).commit;
    const limits = remote.limits;
    remote.limits = LOG_PUSH_LIMITS; // the golden log itself is published unbounded
    const g = await goldenLog(remote);
    remote.limits = limits;
    return { g, expected };
  }

  async function independent(remote: string, head: string, commits: number) {
    git(remote, "fsck", "--strict", "--no-dangling");
    const reader = GitCli.open(remote);
    await reader.fetch(LOG_REF);
    const report = await verifyLog(reader);
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, head, commits });
  }

  test("scaled down: the segment blob is staged in chunks under the bound, the push carries nothing, the commit is the unbounded one, and it verifies", async () => {
    const { remote, sandbox } = setup();
    const r = new SandboxRemote(remote, sandbox("p"), tiny);
    const { g, expected } = await next(r);
    const publisher = await LogPublisher.open(r, { maxTransfer: tiny });
    const pushes = r.sent.length;
    const stagedBefore = r.staged.length;
    expect((await g.sim.publish(publisher)).commit).toBe(expected);
    expect(r.staged.length - stagedBefore).toBeGreaterThan(3);
    expect(Math.max(...r.staged)).toBeLessThanOrEqual(tiny.bytes);
    expect(r.sent.slice(pushes)).toEqual([0]); // the push itself carried no objects
    await independent(remote, expected, 4);
  });

  test("restart mid-staging: a lost answer stops the publisher; reopened on the same sandbox it resumes, on a restarted sandbox it stages again; the same commit", async () => {
    for (const restart of [false, true]) {
      const { remote, sandbox } = setup();
      const r = new SandboxRemote(remote, sandbox("p"), tiny);
      const { g, expected } = await next(r);
      const first = await LogPublisher.open(r, { maxTransfer: tiny, attempts: 1 });
      r.failStageAt = r.stageCalls + 4;
      await expect(g.sim.publish(first)).rejects.toMatchObject({ code: "unresolved" });
      expect(git(remote, "rev-parse", LOG_REF)).toBe(g.c3.commit);
      const again = restart ? new SandboxRemote(remote, sandbox("restarted"), tiny) : r;
      const before = again.answers.length;
      const published = await (await LogPublisher.open(again, { maxTransfer: tiny })).publish(g.sim.entries, g.sim.checkpoint(), g.sim.retained);
      expect(published.commit).toBe(expected);
      const probe = again.answers[before]!;
      expect(probe.ok).toBe(true);
      const missing = probe.ok ? probe.missing : [];
      // Resumed: some object was partly staged already. Restarted: nothing was, and everything was staged again.
      expect(missing.some((m) => m.have > 0)).toBe(!restart);
      await independent(remote, expected, 4);
    }
  });

  test("at the default bound: an active segment over 16 MiB takes one-entry cohorts, staged through the sandbox, after a restart too, and verifies", async () => {
    const { remote, sandbox } = setup();
    let r = new SandboxRemote(remote, sandbox("p"));
    const sim = new RoomSim();
    sim.activate(policy(rule({ id: "notify-members", kind: "notify", on: ["note"], to: ["role:member"], why: "A note needs the members." })));
    let publisher = new LogPublisher(r);
    const authority = memberAuthority("@alice", keys.alice.key);
    const claim = await sim.claim(keys.alice, authority, ["src/**"]);
    const recipients = Array.from({ length: 2400 }, (_, i) => `@member${String(i).padStart(5, "0")}${"x".repeat(50)}` as MemberId);
    const add = async () => {
      const body = { text: "A note for the room." };
      const e = sim.accept(sim.envelope(keys.alice, "note", claim.lane!, body), authority);
      const id = entryId(e.seq, e.hash);
      const input = {
        kind: "notify" as const,
        act: { id, kind: "note" as const, target: claim.lane!, body },
        actor: { member: "@alice" as MemberId, role: "admin" as const, teams: [], delegated: false },
        lane: { id: claim.lane!, claimed: true, holder: "@alice" as MemberId, scope: ["src/**"], generation: 1, purpose: "ordinary" as const },
        proposal: null,
      };
      const ev = await evaluateNotify(sim.policy, input, { roles: { member: recipients }, reviewers: [] });
      for (const x of ev.evaluations) sim.retained.push(retain("input", x.context));
      sim.system({ type: "notified", entry: id, decisions: ev.evaluations.map((x) => x.decision), to: [...new Set(ev.notify.map((n) => n.to as MemberId))] });
    };
    const segment = () => sim.entries.reduce((n, e) => n + Buffer.byteLength(canonicalize(e)) + 1, 0);
    while (segment() < LOG_PUSH_LIMITS.bytes + 1_000_000) {
      await add();
      if (sim.entries.length % 30 === 0) await sim.publish(publisher);
    }
    await sim.publish(publisher);
    for (const restart of [false, true]) {
      if (restart) {
        r = new SandboxRemote(remote, sandbox("restarted"));
        publisher = await LogPublisher.open(r);
      }
      const from = publisher.publishedThrough;
      const before = r.staged.length;
      const p = await sim.publish(publisher);
      expect(p.through - from).toBe(1); // a one-entry cohort
      expect(r.staged.length - before).toBeGreaterThan(2);
      expect(Math.max(...r.staged.slice(before))).toBeLessThanOrEqual(LOG_PUSH_LIMITS.bytes);
    }
    expect(segment()).toBeGreaterThan(LOG_PUSH_LIMITS.bytes);
    const head = git(remote, "rev-parse", LOG_REF);
    const reader = GitCli.open(remote);
    await reader.fetch(LOG_REF);
    const report = await verifyLog(reader);
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, head });
  }, 600_000);
});
