// The review-and-check flow of the live smoke runs (request 9f81f372):
// what spike-smoke.mjs (SPIKE_PHASE=checks) and mcp-stage0.mjs (--checks)
// share. Everything here is pure, or reads only the spike env file, so it is
// tested in Node (test/node/checks.cases.ts) with no live call.
//
// The room is an import: its repository's first commit already holds the
// policy and the checker's configuration, so the room starts under them.
// The policy requires one check, `tests`, given by a member with role
// `checker` (the checker service's key), and one review from a maintainer,
// who is not the author (allowSelf is false), on `src/**` and `test/**`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { policy, requireCheck, requireReview } from "../../policy/src/helpers.ts";
import { seedKeyPair, envValue } from "../scripts/spike-checker-key.mjs";
import { sign } from "../src/crypto.ts";
import { iso } from "../src/ids.ts";
import { isTokenRecord, readListing } from "./cleanup.mjs";

/** The paths the policy covers, and the lane claims. */
export const CHECKED_PATHS = ["src/**", "test/**"];
export const CHECK = "tests";
export const CHECK_RULE = "check-tests";
export const REVIEW_RULE = "independent-review";

/** The room's policy: one check by role:checker and one independent review by a maintainer. */
export function checksPolicy() {
  return policy(
    requireCheck(CHECK, { id: CHECK_RULE, paths: CHECKED_PATHS, by: "role:checker" }),
    requireReview({ id: REVIEW_RULE, paths: CHECKED_PATHS, from: "role:maintainer" }),
  );
}

/** The `tests` checker's configuration: the whole tree, not volatile, no runner pinned (so its checks never carry). */
export const TESTS_CONFIG = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 300 };

const json = (v) => JSON.stringify(v, null, 2) + "\n";

/**
 * The imported repository's one commit: a package with no dependencies (so
 * `npm ci` installs nothing and needs only the lockfile), a passing test,
 * the policy and the checker's configuration.
 */
export function checkProject(run) {
  return {
    "README.md": `# spike checks\n\nA throwaway repository for the spike's live review and check run ${run}.\n`,
    "package.json": json({ name: "spike-checks", version: "1.0.0", private: true, type: "module", scripts: { test: "node --test" } }),
    "package-lock.json": json({ name: "spike-checks", version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name: "spike-checks", version: "1.0.0" } } }),
    "src/add.js": "export function add(a, b) {\n  return a + b;\n}\n",
    "test/add.test.js": 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/add.js";\n\ntest("adds", () => assert.equal(add(2, 2), 4));\n',
    ".artroom/policy.json": json(checksPolicy()),
    [`.artroom/checkers/${CHECK}.json`]: json(TESTS_CONFIG),
  };
}

/** The paths the `manual` check covers (request 8bd623cc, ROWS_ONLY=check). */
export const MANUAL_PATHS = ["lib/**"];
export const MANUAL_CONFIG = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 300 };

/**
 * The checks project with one more checker, `manual`, required on lib/** by
 * role:checker. No service is bound for it (no CHECKER_MANUAL), so the room
 * sends no job, and a measured check can be signed and sent at a chosen time.
 */
export function manualCheckProject(run) {
  const doc = policy(requireCheck(CHECK, { id: CHECK_RULE, paths: CHECKED_PATHS, by: "role:checker" }), requireReview({ id: REVIEW_RULE, paths: CHECKED_PATHS, from: "role:maintainer" }), requireCheck("manual", { id: "check-manual", paths: MANUAL_PATHS, by: "role:checker" }));
  return { ...checkProject(run), ".artroom/policy.json": json(doc), ".artroom/checkers/manual.json": json(MANUAL_CONFIG) };
}

/** The lane's change: a function and its test, both under the checked paths, so it owes the check and the review. */
export function checkedChange(run) {
  return {
    "src/greet.js": `export function greet(name) {\n  return \`hello, \${name}\`;\n}\n// ${run}\n`,
    "test/greet.test.js": 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { greet } from "../src/greet.js";\n\ntest("greets", () => assert.equal(greet("room"), "hello, room"));\n',
  };
}

export { envValue };

/**
 * The spike's operator and checker key pairs from the env file's text. The
 * operator's must match OPERATOR_KEYS. Each seed is added to `secrets` (for
 * redaction) and stays in this process.
 */
export function spikeKeys(text, secrets = new Set()) {
  const opSeed = envValue(text, "ARTROOM_OPERATOR_SEED");
  const ckSeed = envValue(text, "ARTROOM_CHECKER_SEED");
  for (const s of [opSeed, ckSeed]) if (s) secrets.add(s);
  const op = seedKeyPair(opSeed);
  return { operator: op && op.key === envValue(text, "OPERATOR_KEYS") ? op : null, checker: seedKeyPair(ckSeed) };
}

/** `spikeKeys` from the spike env file. */
export function loadSpikeKeys(secrets) {
  return spikeKeys(readFileSync(process.env.ARTROOM_SPIKE_ENV ?? join(homedir(), ".config/generalbusiness/artroom-spike.env"), "utf8"), secrets);
}

/** The one attention item about this lane for this reason, or null. */
export function attentionFor(page, why, lane) {
  const items = Array.isArray(page?.items) ? page.items : [];
  return items.find((i) => i?.why === why && i?.lane === lane) ?? null;
}

/** The obligation of a kind in a proposal (or a propose result), or null. */
export function obligationOf(proposal, kind) {
  const list = Array.isArray(proposal?.obligations) ? proposal.obligations : [];
  return list.find((o) => o?.kind === kind) ?? null;
}

/**
 * The accepted check acts in log entries, signed by `checker`: each with its
 * seq, ok, integration, runner digest and the start of its detail. A refused check is listed apart, with its rule.
 */
export function checksIn(entries, checker) {
  const list = Array.isArray(entries) ? entries : [];
  const mine = (e) => e?.entry?.act?.envelope?.kind === "check" && e.entry.act.envelope.actor === checker;
  return {
    accepted: list.filter((e) => e?.entry?.type === "act" && mine(e)).map((e) => {
        const b = e.entry.act.envelope.body ?? {};
        // What ran, as the checker recorded it: the runner environment's digest and the start of its detail.
        return { seq: e.seq, ok: b.ok, integration: b.integration, check: b.check, runner: b.runner, detail: typeof b.detail === "string" ? b.detail.slice(0, 400) : undefined };
      }),
    refused: list.filter((e) => e?.entry?.type === "refusal" && mine(e)).map((e) => ({ seq: e.seq, rule: e.entry.receipt?.rule ?? e.entry.receipt?.refusal?.rule })),
  };
}

/**
 * Create a throwaway repository `name` with one commit of `files`, using the
 * creation token, then revoke every active token on it before any Room sees
 * it. `api` is bound to the import namespace (Artifacts REST, hugh's OAuth);
 * `git(args, { cwd, token })` runs git and resolves `{ code, stdout,
 * stderr }`; `dir` is an empty directory. `onSecret` receives the creation
 * token, for redaction. Never throws for a refusal: the caller records what
 * happened. `active` is the number of tokens left, or null when the listing
 * proves nothing.
 */
export async function seedImportRepo({ api, git, dir, name, files, onSecret = () => {} }) {
  const c = await api("POST", "/repos", { name });
  if (typeof c?.result?.token === "string") onSecret(c.result.token);
  if (c?.success !== true || typeof c.result?.remote !== "string") return { name, created: false, errors: c?.errors ?? null };
  const remote = c.result.remote;
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  for (const args of [["init", "-q"], ["add", "-A"], ["commit", "-q", "-m", "the imported repository's one commit"]]) {
    const r = await git(args, { cwd: dir });
    if (r.code !== 0) return { name, remote, created: true, pushed: false, stderr: r.stderr };
  }
  const seeded = (await git(["rev-parse", "HEAD"], { cwd: dir })).stdout;
  const p = await git(["push", "-q", remote, "HEAD:refs/heads/main"], { cwd: dir, token: c.result.token });
  const tokens = async () => readListing(await api("GET", `/repos/${name}/tokens?state=active&per_page=100`), 100, isTokenRecord);
  const before = await tokens();
  let revoked = 0;
  for (const t of before.items ?? []) if ((await api("DELETE", `/tokens/${t.id}`))?.success === true) revoked++;
  const after = await tokens();
  return { name, remote, seeded, created: true, pushed: p.code === 0, stderr: p.stderr || undefined, revoked, active: after.outcome === "done" ? after.items.length : null };
}

/** The draft of an import room: the spike operator's signed onboarding grant of `${ns}/${repo}` to `admin`, valid for `ttlMs`. */
export function importDraft({ operator, admin, recovery, ns, repo, handle, name, now = Date.now(), ttlMs = 15 * 60_000 }) {
  const grant = { v: 1, repo: `${ns}/${repo}`, admin: admin.key, operator: operator.key, notAfter: iso(now + ttlMs) };
  return { name, repo: { kind: "import", grant: { grant, sig: sign(operator.seed, "artroom-onboarding-v1", grant) } }, admin: { handle, key: admin.key }, recovery: recovery.key };
}
