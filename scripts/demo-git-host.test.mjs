import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DOMAINS } from "@generalbusiness/artroom-contract";
import { b64url, domainBytes, isScopeId, publicKeyOf, unb64url } from "@generalbusiness/artroom-bytes";
import { DemoPreparationError, plan, postInstall, prepare } from "./demo-git-host.mjs";
const script = fileURLToPath(new URL("./demo-git-host.mjs", import.meta.url));
const checkout = fileURLToPath(new URL("../", import.meta.url));
const loader = process.execArgv.filter((argument) => !argument.startsWith("--test"));
// The pinned loader uses deprecated module.register on Node26. Suppress only
// that known runtime warning when checking the CLI's own structured events.
const childRuntime = [...loader, "--disable-warning=DEP0205"];

// Invariant: actual filesystem preparation preserves private keys on repeat,
// restricts custody to the owner, and exposes a genuine signed public install
// whose founder/recovery keys and register pin are stable until its fixed end.
test("owner-only exclusive preparation keeps keys off stdout and locks one genuinely signed install plan", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "artroom-demo-host-"));
  const directory = join(scratch, "private");
  try {
    const child = spawnSync(process.execPath, [...childRuntime, script, "prepare", "--directory", directory, "--branch", "main", "--founder-handle", "@demo-owner"], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const prepared = JSON.parse(child.stdout);
    const path = join(directory, "private-state.json");
    const privateBytes = await readFile(path, "utf8");
    const state = JSON.parse(privateBytes);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    for (const role of Object.values(state.roles)) assert.ok(!child.stdout.includes(role.secret));
    assert.equal(child.stderr, "");
    await assert.rejects(prepare({ directory, branch: "main", founderHandle: "@demo-owner" }), { code: "directory-exists" });
    assert.equal(await readFile(path, "utf8"), privateBytes);
    const now = Date.parse("2030-01-01T00:00:00Z");
    await assert.rejects(plan({ directory, deadline: "2030-01-01T00:16:00Z" }, now), { code: "invalid-deadline" });
    await assert.rejects(stat(join(directory, "install-plan.json")), { code: "ENOENT" });
    const result = await plan({ directory, deadline: "2030-01-01T00:10:00Z" }, now);
    const publicPlan = result.plan;
    const signed = publicPlan.signedInstall;
    const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64url(publicKeyOf(state.roles.installer.key)) }, format: "jwk" });
    assert.equal(verify(null, domainBytes(DOMAINS.intent, signed.intent), pub, unb64url(signed.sig)), true);
    assert.equal(signed.intent.actor, prepared.roleKeys.installer.key);
    assert.deepEqual(signed.intent.fields.founders, [prepared.roleKeys.founder.key]);
    assert.equal(publicPlan.founding.recoveryKey, prepared.roleKeys.recovery.key);
    assert.equal(publicPlan.founding.branch, "main");
    assert.equal(publicPlan.founding.founderHandle, "@demo-owner");
    assert.equal(isScopeId(publicPlan.registerScope), true);
    assert.equal(publicPlan.registerSeed.cause, publicPlan.installDigest);
    assert.equal(signed.intent.notAfter, "2030-01-01T00:10:00Z");
    const savedPlan = await readFile(join(directory, "install-plan.json"), "utf8");
    for (const role of Object.values(state.roles)) assert.ok(!savedPlan.includes(role.secret));
    assert.equal((await stat(join(directory, "install-plan.json"))).mode & 0o777, 0o600);
    await assert.rejects(plan({ directory, deadline: "2030-01-01T00:11:00Z" }, now), { code: "artifact-exists" });
    assert.equal(await readFile(join(directory, "install-plan.json"), "utf8"), savedPlan);
    let calls = 0;
    await assert.rejects(postInstall("https://credential@worker.invalid", publicPlan, async () => { calls++; throw new Error("unreachable"); }), { code: "invalid-base-url" });
    assert.equal(calls, 0);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

// Invariant: a mistakenly shared private file cannot be read/signing authority
// for plan, and private material cannot be prepared within any Git checkout.
test("insecure private file and checkout custody are refused with static errors", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "artroom-demo-host-"));
  const directory = join(scratch, "private");
  try {
    await prepare({ directory, branch: "main", founderHandle: "@demo-owner" });
    await chmod(join(directory, "private-state.json"), 0o644);
    await assert.rejects(plan({ directory, deadline: "2030-01-01T00:10:00Z" }, Date.parse("2030-01-01T00:00:00Z")), (failure) => failure instanceof DemoPreparationError && failure.code === "private-permissions");
    const child = spawnSync(process.execPath, [...childRuntime, script, "plan", "--directory", directory, "--deadline", "2030-01-01T00:10:00Z"], { encoding: "utf8" });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.equal(JSON.parse(child.stderr).code, "private-permissions");
    await assert.rejects(prepare({ directory: join(checkout, "would-be-private-demo-state"), branch: "main", founderHandle: "@demo-owner" }), { code: "checkout-directory" });
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
