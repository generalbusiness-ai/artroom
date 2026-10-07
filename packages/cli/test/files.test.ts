import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { b64url } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { fileStore } from "../src/files.ts";
import { command } from "../src/line.ts";

// Invariant: a key the command makes is kept owner-only and never replaced, and no line the command prints holds it.
test("install keeps its operator key owner-only under the config directory, refuses to replace it, and prints only the key's ID; a refused founding is printed with its reason", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "artroom-cli-")), "artroom");
  const store = fileStore(dir);
  // A service that refuses every founding: what it answers is not the point here, only what the command keeps and prints.
  const fetch: Fetch = async () => new Response(JSON.stringify({ answer: "refused", reason: "unauthorized" }), { status: 403 }) as never;
  const outcome = await command({ store, fetch }, ["install", "https://service.test"]);
  expect(outcome).toEqual({ code: 1, lines: ["Refused: unauthorized. Nothing was written."] });

  const path = join(dir, "keys", "operator.key");
  expect([statSync(dir).mode & 0o777, statSync(join(dir, "keys")).mode & 0o777, statSync(path).mode & 0o777]).toEqual([0o700, 0o700, 0o600]);
  const secret = (await store.secret("operator"))!;
  expect([secret.length, readFileSync(path, "utf8")]).toEqual([32, `${b64url(secret)}\n`]);
  await expect(store.keep("operator", new Uint8Array(32))).rejects.toThrow(/exists already; it is not replaced/);
  expect(await store.secret("operator")).toEqual(secret);
  // A second install reuses the kept key: the same intent's actor, and the secret is in no line.
  const again = await command({ store, fetch }, ["install", "https://service.test"]);
  expect(again.lines.join("\n")).not.toContain(b64url(secret));

  // Two actual filesystem writers have each completed a private temporary
  // file before either publishes its key. The gate controls ordering, not time.
  const concurrent = join(mkdtempSync(join(tmpdir(), "artroom-cli-concurrent-")), "artroom");
  const gate = new SharedArrayBuffer(8);
  const publish = new Int32Array(gate);
  const workers: Worker[] = [];
  let ready = 0;
  try {
    const code = `
      const { parentPort, workerData } = require("node:worker_threads");
      const fs = require("node:fs");
      const { syncBuiltinESMExports } = require("node:module");
      const write = fs.writeFileSync;
      const exists = fs.existsSync;
      fs.existsSync = (path) => {
        const result = exists(path);
        // If publication regresses to an exists-then-rename, both actual
        // writers see absence before either can rename. The fixed hard-link
        // publication does not need this check and never reaches this gate.
        if (String(path).endsWith("operator.key")) {
          const gate = new Int32Array(workerData.gate);
          Atomics.add(gate, 1, 1);
          Atomics.notify(gate, 1);
          while (Atomics.load(gate, 1) < 2) Atomics.wait(gate, 1, Atomics.load(gate, 1));
        }
        return result;
      };
      fs.writeFileSync = (path, ...args) => {
        const result = write(path, ...args);
        if (String(path).endsWith(".tmp")) {
          parentPort.postMessage({ ready: true });
          Atomics.wait(new Int32Array(workerData.gate), 0, 0);
        }
        return result;
      };
      syncBuiltinESMExports();
      import(workerData.source).then(async ({ fileStore }) => {
        try {
          await fileStore(workerData.directory).keep("operator", new Uint8Array(32).fill(workerData.byte));
          parentPort.postMessage({ stored: true });
        } catch { parentPort.postMessage({ stored: false }); }
      }).catch(() => parentPort.postMessage({ failedToLoad: true }));
    `;
    const results = await Promise.all([11, 22].map((byte) => new Promise<boolean>((resolve, reject) => {
      const worker = new Worker(code, { eval: true, execArgv: ["--import", import.meta.resolve("tsx"), "--disable-warning=DEP0205"], workerData: { gate, byte, directory: concurrent, source: new URL("../src/files.ts", import.meta.url).href } });
      workers.push(worker);
      worker.on("error", reject);
      worker.on("message", (message: { ready?: boolean; stored?: boolean; failedToLoad?: boolean }) => {
        if (message.failedToLoad) reject(new Error("the filesystem writer did not load"));
        if (message.ready && ++ready === 2) { Atomics.store(publish, 0, 1); Atomics.notify(publish, 0); }
        if (typeof message.stored === "boolean") resolve(message.stored);
      });
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await fileStore(concurrent).secret("operator")).toEqual(new Uint8Array(32).fill(results[0] ? 11 : 22));
    expect(readdirSync(join(concurrent, "keys"))).toEqual(["operator.key"]);
    expect(statSync(join(concurrent, "keys", "operator.key")).mode & 0o777).toBe(0o600);
  } finally {
    Atomics.store(publish, 0, 1);
    Atomics.store(publish, 1, 2);
    Atomics.notify(publish, 0);
    Atomics.notify(publish, 1);
    await Promise.all(workers.map((worker) => worker.terminate()));
    rmSync(concurrent, { recursive: true, force: true });
  }

  // Launch the actual JavaScript bin through this Node, from outside the
  // checkout. Its pinned loader must resolve from the installed CLI package.
  const launched = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/artroom.js", import.meta.url))], { cwd: tmpdir(), encoding: "utf8" });
  expect([launched.status, launched.stdout, launched.stderr]).toEqual([2, "", expect.stringMatching(/^Usage:\n  artroom install /)]);
  expect(launched.stdout + launched.stderr).not.toContain(b64url(secret));
});

// Invariant: pending secret-bearing request bytes survive a new fileStore,
// owner-only and immutable, without relaxing the signing key format.
test("private pending envelopes persist owner-only separately from public config and signing keys", async () => {
  const dir = mkdtempSync(join(tmpdir(), "artroom-private-"));
  try {
    const store = fileStore(dir);
    const bytes = new TextEncoder().encode(JSON.stringify({ secret: "an invitation secret", signed: "complete envelope" }));
    await store.keepPrivate("join-pending", bytes);
    await store.save({ v: 1, service: "https://service.test", key: "device" });
    const reopened = fileStore(dir);
    expect(await reopened.private("join-pending")).toEqual(bytes);
    expect([statSync(join(dir, "private")).mode & 0o777, statSync(join(dir, "private", "join-pending.data")).mode & 0o777]).toEqual([0o700, 0o600]);
    expect(readFileSync(join(dir, "config.json"), "utf8")).not.toContain("invitation secret");
    expect(await reopened.secret("join-pending")).toBeNull();
    await expect(reopened.keepPrivate("join-pending", new Uint8Array([1]))).rejects.toThrow(/exists already; it is not replaced/);
    expect(await reopened.private("join-pending")).toEqual(bytes);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
