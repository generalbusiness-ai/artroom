// The runner sandbox's life cycle, at the RunnerHost and the provider: one
// job per container (G1) and one owner per runner (G2), from review c46a4491.
//
// Ownership and grants are decisions, tested over the in-memory container.
// That a new container is the pristine image, and that nothing a job started
// outlives it, needs a file system and processes: one test uses the container
// modelled on the host.
import { onTestFinished, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { CheckJob, Sha } from "@generalbusiness/artroom-contract";
import { checkJob, gitAuthEnvFor, isRefusal } from "../src/job.ts";
import { runnerProvider } from "../src/sandbox.ts";
import { Fleet, MemoryContainer, ProcessContainer, modelImage } from "./containers.ts";
import { expectations, job, tok, urlOf } from "./support.ts";

const memory = () => new Fleet(() => new MemoryContainer(new Map()));
const sha = "a".repeat(40) as Sha;

test("G2: one owner per runner: a second open is refused, foreign and stale closes change nothing, a closed owner can do nothing", async () => {
  const fleet = memory();
  const { c, host } = fleet.make();
  const A = { repoPath: "/git/ns/A.git", token: tok("A0123456789"), registry: [] };
  const B = { repoPath: "/git/ns/B.git", token: tok("B0123456789"), registry: [] };
  const a = await host.open(A);
  await assert.rejects(host.open(B), /already has a job/);
  // A's grant is untouched by the refused open.
  assert.equal(await Fleet.ask(c, "/git/ns/A.git/info/refs"), 200);
  assert.equal(await Fleet.ask(c, "/git/ns/B.git/info/refs"), 403);
  assert.deepEqual(fleet.upstream, [`/git/ns/A.git/info/refs Bearer ${A.token}`]);
  // Anything but A's token can neither run nor close.
  await assert.rejects(host.exec("forged", ["mkdir"]), /not held by the caller/);
  assert.equal(await host.close("forged"), false);
  assert.equal(c.running, true);
  assert.equal((await host.exec(a.owner, ["mkdir"])).exitCode, 0);
  // A's close ends A: its container goes, and its token is spent.
  assert.equal(await host.close(a.owner), true);
  assert.equal(c.running, false);
  await assert.rejects(host.exec(a.owner, ["mkdir"]), /not held by the caller/);
  assert.equal(await host.close(a.owner), false);
  // A late close from A cannot revoke B's later grant.
  const b = await host.open(B);
  assert.equal(await host.close(a.owner), false);
  assert.equal(c.running, true);
  assert.equal(await Fleet.ask(c, "/git/ns/B.git/info/refs"), 200);
  assert.equal(await Fleet.ask(c, "/git/ns/A.git/info/refs"), 403);
  assert.equal(fleet.upstream.at(-1), `/git/ns/B.git/info/refs Bearer ${B.token}`);
  await host.close(b.owner);
});

test("G2: a failed open cleans up: its container is destroyed and the runner can be opened again", async () => {
  const { c, host } = memory().make();
  const grant = { repoPath: "/git/ns/canon.git", token: tok("x0123456789"), registry: [] };
  c.failIntercept = true;
  await assert.rejects(host.open(grant), /intercept failed/);
  assert.deepEqual([c.starts, c.destroys, c.running], [1, 1, false]);
  c.failIntercept = false;
  const ok = await host.open(grant);
  assert.equal(c.running, true);
  await host.close(ok.owner);
});

test("G2: concurrent jobs each get their own runner and grant; one job's close never touches the other", async () => {
  const fleet = memory();
  const provider = runnerProvider({ fresh: () => fleet.make().host, registry: [] });
  const open = (over: Partial<CheckJob>) => {
    const bound = checkJob(job(sha, { kind: "tree", tree: sha }, over), expectations());
    assert.ok(!isRefusal(bound), JSON.stringify(bound));
    return provider.open(bound);
  };
  const a = await open({ gitAuthEnv: gitAuthEnvFor(tok("jobA0123456789")) });
  const b = await open({ readUrl: urlOf("canon2"), gitAuthEnv: gitAuthEnvFor(tok("jobB0123456789")) });
  // Both are open at once, in two containers, each with only its own grant.
  assert.equal(fleet.boxes.length, 2);
  const [boxA, boxB] = fleet.boxes.map((x) => x.c) as [MemoryContainer, MemoryContainer];
  assert.equal(await Fleet.ask(boxA, "/git/ns/canon.git/info/refs"), 200);
  assert.equal(await Fleet.ask(boxA, "/git/ns/canon2.git/info/refs"), 403);
  assert.equal(await Fleet.ask(boxB, "/git/ns/canon2.git/info/refs"), 200);
  assert.equal(await Fleet.ask(boxB, "/git/ns/canon.git/info/refs"), 403);
  assert.deepEqual(fleet.upstream, [`/git/ns/canon.git/info/refs Bearer ${tok("jobA0123456789")}`, `/git/ns/canon2.git/info/refs Bearer ${tok("jobB0123456789")}`]);
  // A closes first; B keeps its container and its grant.
  await a.close();
  assert.deepEqual(fleet.lives(), [[1, 1, false], [1, 0, true]]);
  assert.equal(await Fleet.ask(boxB, "/git/ns/canon2.git/info/refs"), 200);
  assert.equal((await b.runner.exec(["mkdir"])).exitCode, 0);
  await b.close();
  assert.equal(boxB.running, false);
});

/** Wait, briefly, for a process to be gone. */
async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 200; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await sleep(5);
  }
  return false;
}

test("G1: a runner never reuses a container: reopening after close, or over a leftover one, starts from the image, and a process a job left running dies with its container", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artroom-sandbox-"));
  const image = modelImage(dir);
  const fleet = new Fleet(() => new ProcessContainer({ dir, image }));
  onTestFinished(async () => {
    await fleet.dispose();
    rmSync(dir, { recursive: true, force: true });
  });
  const { c, host } = fleet.make();
  const grant = { repoPath: "/git/ns/canon.git", token: tok("a0123456789"), registry: [] };
  // What the image's own npm answers, and what a replaced one does: a link to `true` answers nothing.
  const pristine = "--version";
  const replace = "ln -s /usr/bin/true tools/npm";
  // A job replaces a trusted tool in its container, and leaves a process running.
  const a = await host.open(grant);
  const pid = (await host.exec(a.owner, ["sh", "-c", `${replace} && { sleep 60 >/dev/null 2>&1 & echo $!; }`])).stdout.trim();
  assert.deepEqual(await host.exec(a.owner, ["npm", "--version"]), { exitCode: 0, stdout: "", stderr: "" }, "the job's npm is the replaced one");
  assert.doesNotThrow(() => process.kill(Number(pid), 0), "the process the job left is running");
  assert.equal(await host.close(a.owner), true);
  assert.equal(c.running, false);
  assert.equal(await gone(Number(pid)), true, "no process survived its job's container");
  // The next job on the same runner starts from the image.
  const b = await host.open(grant);
  assert.equal((await host.exec(b.owner, ["npm", "--version"])).stdout.trim(), pristine);
  assert.equal(b.digest, a.digest);
  await host.close(b.owner);
  // A container left running by anything earlier is destroyed, not adopted.
  c.start();
  const leftover = c.root!;
  const left = await c.exec(["sh", "-c", replace], { env: {}, signal: new AbortController().signal });
  assert.equal((await left.output()).exitCode, 0);
  const d = await host.open(grant);
  assert.notEqual(c.root, leftover);
  assert.equal((await host.exec(d.owner, ["npm", "--version"])).stdout.trim(), pristine);
  assert.equal(d.digest, a.digest);
  await host.close(d.owner);
});
