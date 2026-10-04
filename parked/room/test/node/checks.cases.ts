import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  CHECK,
  CHECKED_PATHS,
  CHECK_RULE,
  REVIEW_RULE,
  attentionFor,
  checkProject,
  checkedChange,
  checksIn,
  checksPolicy,
  importDraft,
  MANUAL_CONFIG,
  MANUAL_PATHS,
  manualCheckProject,
  obligationOf,
  seedImportRepo,
  spikeKeys,
} from "../../measure/checks.mjs";
import type { Answer, Api } from "../../measure/cleanup.mjs";
import { SEED_VAR, checkerJwk, envValue, seedKeyPair } from "../../scripts/spike-checker-key.mjs";
import { validateCheckerConfig, validatePolicy } from "@generalbusiness/artroom-policy";
import { b64url, keyPairFromSeed, newKeyPair, payloadOf, signingBytes, verify } from "../../src/crypto.ts";
import { matchesAny } from "../../src/glob.ts";
import { readJsonc } from "./jsonc.ts";

/** Request 9f81f372: the review-and-check flow's fixtures, keys and readers, with no live call. */

const seedOf = (n: number) => b64url(new Uint8Array(32).fill(n));

describe("the checked room's repository", () => {
  it("its policy requires the tests check by role:checker and one independent review from a maintainer, on the checked paths", () => {
    const doc = checksPolicy();
    expect(validatePolicy(doc).ok).toBe(true);
    const check = doc.rules.find((r) => r.id === CHECK_RULE);
    const review = doc.rules.find((r) => r.id === REVIEW_RULE);
    expect(check).toMatchObject({ kind: "require", paths: CHECKED_PATHS, obligation: { type: "check", check: CHECK, by: ["role:checker"] } });
    expect(review).toMatchObject({ kind: "require", paths: CHECKED_PATHS, obligation: { type: "review", from: ["role:maintainer"], count: 1, allowSelf: false } });
  });

  it("its first commit holds the policy, a valid checker configuration, and a package with no dependencies whose test is node --test", () => {
    const files = checkProject("run");
    expect(JSON.parse(files[".artroom/policy.json"]!)).toEqual(checksPolicy());
    expect(validateCheckerConfig(JSON.parse(files[`.artroom/checkers/${CHECK}.json`]!)).ok).toBe(true);
    const pkg = JSON.parse(files["package.json"]!);
    const lock = JSON.parse(files["package-lock.json"]!);
    expect(lock).toMatchObject({ name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { "": { name: pkg.name, version: pkg.version } } });
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.scripts.test).toBe("node --test");
    // The live measurement runs the package's test in the checker; nothing here runs it.
  });

  it("the lane's change is entirely under the checked paths, so it owes both obligations", () => {
    for (const p of Object.keys(checkedChange("run"))) expect(matchesAny(p as never, CHECKED_PATHS as never)).toBe(true);
  });
});

describe("the spike keys", () => {
  const op = keyPairFromSeed(new Uint8Array(32).fill(1));
  const text = (extra = "") => `ROOM_KEY_SECRET=x\nARTROOM_OPERATOR_SEED=${seedOf(1)}\nOPERATOR_KEYS=${op.key}\n${extra}`;

  it("reads the operator (matching OPERATOR_KEYS) and the checker, and keeps both seeds for redaction", () => {
    const secrets = new Set<string>();
    const k = spikeKeys(text(`${SEED_VAR}=${seedOf(2)}\n`), secrets);
    expect(k.operator?.key).toBe(op.key);
    expect(k.checker?.key).toBe(keyPairFromSeed(new Uint8Array(32).fill(2)).key);
    expect([...secrets].sort()).toEqual([seedOf(1), seedOf(2)].sort());
  });

  it("an operator seed that does not match OPERATOR_KEYS, or a missing or short checker seed, gives no key", () => {
    expect(spikeKeys(text().replace(op.key, newKeyPair().key)).operator).toBeNull();
    expect(spikeKeys(text()).checker).toBeNull();
    expect(spikeKeys(text(`${SEED_VAR}=${b64url(new Uint8Array(31))}\n`)).checker).toBeNull();
    expect(seedKeyPair("not base64url!")).toBeNull();
    expect(envValue(`A="quoted"\n`, "A")).toBe("quoted");
    expect(envValue("A=\n", "A")).toBeNull();
  });

  it("CHECKER_KEY is the JWK lane G's importSigner imports (WebCrypto, as signing.ts does); it signs as the seed's key ID, and the Room verifies its signature", async () => {
    const seed = seedOf(3);
    const jwk = checkerJwk(seed);
    const kp = seedKeyPair(seed)!;
    // lane G: `key_${jwk.x}` is the key ID, and the private key is imported from the JWK.
    expect(`key_${jwk.x}`).toBe(kp.key);
    const key = await crypto.subtle.importKey("jwk", { ...jwk, ext: false }, { name: "Ed25519" }, false, ["sign"]);
    const envelope = { v: 1, room: "room_00000000000000000000000000000000", actor: kp.key, kind: "check", target: null, body: { ok: true }, idempotencyKey: "k" };
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, signingBytes("artroom-envelope-v1", payloadOf("artroom-envelope-v1", envelope)) as Uint8Array<ArrayBuffer>));
    expect(await verify(kp.key, "artroom-envelope-v1", envelope, b64url(sig))).toBe(true);
    expect(() => checkerJwk(b64url(new Uint8Array(16)))).toThrow();
  });

  it("the key script refuses an env file that is not mode 600, and writes the JWK to a pipe", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-checks-env-"));
    const file = join(dir, "env");
    writeFileSync(file, text(`${SEED_VAR}=${seedOf(4)}\n`), { mode: 0o644 });
    const script = new URL("../../scripts/spike-checker-key.mjs", import.meta.url).pathname;
    const run = (arg: string) => {
      try {
        return { code: 0, out: execFileSync("node", [script, arg], { env: { ...process.env, ARTROOM_SPIKE_ENV: file }, stdio: "pipe" }).toString() };
      } catch (e) {
        return { code: (e as { status: number }).status, out: String((e as { stdout: Buffer }).stdout) };
      }
    };
    expect(run("jwk")).toEqual({ code: 2, out: "" });
    chmodSync(file, 0o600);
    // To a pipe (as here), the JWK; its private part is the seed.
    expect(JSON.parse(run("jwk").out)).toEqual(checkerJwk(seedOf(4)));
  });
});

describe("reading the flow's state", () => {
  const lane = "act_5_abcdef01";

  it("attentionFor finds the item for this reason and lane, and nothing for another lane or a malformed page", () => {
    const page = { items: [{ why: "review-requested", lane: "act_9_x", open: true }, { why: "review-requested", lane, open: false }, { why: "check-requested", lane, open: true }] };
    expect(attentionFor(page, "review-requested", lane)).toMatchObject({ open: false });
    expect(attentionFor(page, "check-requested", lane)).toMatchObject({ open: true });
    expect(attentionFor(page, "land-outcome", lane)).toBeNull();
    expect(attentionFor({ items: null }, "check-requested", lane)).toBeNull();
    expect(attentionFor(undefined, "check-requested", lane)).toBeNull();
  });

  it("obligationOf reads a proposal's obligation by kind", () => {
    const p = { obligations: [{ kind: "review", state: "open" }, { kind: "check", state: "met" }] };
    expect(obligationOf(p, "check")).toMatchObject({ state: "met" });
    expect(obligationOf(p, "review")).toMatchObject({ state: "open" });
    expect(obligationOf({}, "check")).toBeNull();
  });

  it("checksIn lists only the checker key's check acts: admitted ones with their outcome, refused ones with their rule", () => {
    const checker = keyPairFromSeed(new Uint8Array(32).fill(5)).key;
    const other = newKeyPair().key;
    const act = (seq: number, type: string, actor: string, kind: string, body: unknown, receipt: unknown = {}) => ({ seq, entry: { type, act: { envelope: { kind, actor, body } }, receipt } });
    const entries = [
      act(5, "act", checker, "check", { ok: true, check: CHECK, integration: "a".repeat(40), runner: "sha256:r", detail: "x".repeat(500) }),
      act(6, "act", other, "check", { ok: false, check: CHECK }),
      act(7, "refusal", checker, "check", {}, { rule: "check-binding" }),
      act(8, "act", checker, "note", { text: "x" }),
      { seq: 9, entry: { type: "system", event: { type: "land-outcome" } } },
    ];
    expect(checksIn(entries, checker)).toEqual({ accepted: [{ seq: 5, ok: true, check: CHECK, integration: "a".repeat(40), runner: "sha256:r", detail: "x".repeat(400) }], refused: [{ seq: 7, rule: "check-binding" }] });
    expect(checksIn(null, checker)).toEqual({ accepted: [], refused: [] });
  });
});

describe("seedImportRepo and importDraft", () => {
  /** A fake Artifacts namespace (REST answers only) and a recording git. */
  function fakes(opts: { create?: Answer; tokens?: Answer; revoke?: boolean; pushCode?: number } = {}) {
    const calls: string[] = [];
    const secrets: string[] = [];
    let live = [{ id: "tok-create", scope: "write" }];
    const api: Api = async (m, p) => {
      calls.push(`${m} ${p}`);
      if (m === "POST" && p === "/repos") return opts.create ?? { success: true, result: { remote: "https://h/git/ns/r.git", token: "art_v2_create" } };
      if (m === "GET" && p.includes("/tokens?")) return opts.tokens ?? { success: true, result: live };
      if (m === "DELETE" && p.startsWith("/tokens/")) {
        if (opts.revoke === false) return { success: false };
        live = live.filter((t) => `/tokens/${t.id}` !== p);
        return { success: true };
      }
      return { success: false };
    };
    const git = async (args: string[]) => {
      calls.push(`git ${args[0]}`);
      if (args[0] === "push") return { code: opts.pushCode ?? 0, stdout: "", stderr: opts.pushCode ? "denied" : "" };
      return { code: 0, stdout: args[0] === "rev-parse" ? "c".repeat(40) : "", stderr: "" };
    };
    return { api, git, calls, secrets, onSecret: (t: string) => void secrets.push(t) };
  }
  const dir = () => mkdtempSync(join(tmpdir(), "deploy-checks-seed-"));

  it("creates, writes the files, commits, pushes with the creation token, then revokes every token and confirms none is left", async () => {
    const f = fakes();
    const d = dir();
    const r = await seedImportRepo({ api: f.api, git: f.git, dir: d, name: "r", files: { "a/b.txt": "x\n" }, onSecret: f.onSecret });
    expect(r).toMatchObject({ created: true, pushed: true, seeded: "c".repeat(40), revoked: 1, active: 0 });
    expect(readFileSync(join(d, "a/b.txt"), "utf8")).toBe("x\n");
    expect(f.secrets).toEqual(["art_v2_create"]);
    expect(f.calls).toEqual(["POST /repos", "git init", "git add", "git commit", "git rev-parse", "git push", "GET /repos/r/tokens?state=active&per_page=100", "DELETE /tokens/tok-create", "GET /repos/r/tokens?state=active&per_page=100"]);
  });

  it("a refused create pushes nothing; a failed push or a refused revocation is reported, and an unreadable listing is unknown, never zero", async () => {
    const refused = fakes({ create: { success: false, errors: [{ message: "no" }] } });
    expect(await seedImportRepo({ api: refused.api, git: refused.git, dir: dir(), name: "r", files: {} })).toMatchObject({ created: false });
    expect(refused.calls).toEqual(["POST /repos"]);
    const push = fakes({ pushCode: 1 });
    expect(await seedImportRepo({ api: push.api, git: push.git, dir: dir(), name: "r", files: {} })).toMatchObject({ pushed: false, revoked: 1, active: 0 });
    const kept = fakes({ revoke: false });
    expect(await seedImportRepo({ api: kept.api, git: kept.git, dir: dir(), name: "r", files: {} })).toMatchObject({ revoked: 0, active: 1 });
    const unknown = fakes({ tokens: { success: true, result: [{}] } });
    expect(await seedImportRepo({ api: unknown.api, git: unknown.git, dir: dir(), name: "r", files: {} })).toMatchObject({ revoked: 0, active: null });
  });

  it("importDraft carries an onboarding grant the operator signed for exactly this repository and admin", async () => {
    const operator = keyPairFromSeed(new Uint8Array(32).fill(6));
    const admin = newKeyPair();
    const recovery = newKeyPair();
    const d = importDraft({ operator, admin, recovery, ns: "gitseq-spike-import", repo: "r", handle: "@author", name: "n", now: Date.UTC(2026, 9, 2) });
    expect(d).toMatchObject({ name: "n", admin: { handle: "@author", key: admin.key }, recovery: recovery.key, repo: { kind: "import" } });
    expect(d.repo.grant.grant).toEqual({ v: 1, repo: "gitseq-spike-import/r", admin: admin.key, operator: operator.key, notAfter: "2026-10-02T00:15:00.000Z" });
    expect(await verify(operator.key, "artroom-onboarding-v1", d.repo.grant.grant, d.repo.grant.sig)).toBe(true);
  });
});

describe("the manual check of the isolated check measurement (request 8bd623cc)", () => {
  it("adds a valid `manual` check on lib/** with its configuration, which the spike binds no service for", () => {
    const files = manualCheckProject("run");
    const doc = JSON.parse(files[".artroom/policy.json"]!);
    expect(validatePolicy(doc).ok).toBe(true);
    expect(doc.rules.find((r: { id: string }) => r.id === "check-manual")).toMatchObject({ kind: "require", paths: MANUAL_PATHS, obligation: { type: "check", check: "manual", by: ["role:checker"] } });
    expect(JSON.parse(files[".artroom/checkers/manual.json"]!)).toEqual(MANUAL_CONFIG);
    expect(validateCheckerConfig(MANUAL_CONFIG).ok).toBe(true);
    // No job: the spike Room has no CHECKER_MANUAL binding.
    const spike = readJsonc<{ services: { binding: string }[] }>("../../wrangler.spike.jsonc", import.meta.url);
    expect(spike.services.map((x) => x.binding)).not.toContain("CHECKER_MANUAL");
  });
});
