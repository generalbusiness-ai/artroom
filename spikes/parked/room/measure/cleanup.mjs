// Cleanup rules for the live harnesses that make Artifacts state on the
// spike: spike-smoke.mjs (deploy V3, reviews 1b868265 and 2485e992) and
// mcp-stage0.mjs (review 66fec276). One set of rules: a duty is done only on
// `success: true`; a listing proves absence only when it is complete and
// every record has a usable identity; the repositories and tokens a run
// knows it made are cleaned even without an inventory; and a run is ok only
// when every duty is done and the final inventory proves nothing is left.

export const REPO_PAGE = 200;
export const TOKEN_PAGE = 100;

/** A remote answer settles a duty only on `success: true`; `success: false` is a refusal; anything else is unknown. */
export function outcomeOf(answer) {
  if (answer?.success === true) return "done";
  if (answer?.success === false) return "refused";
  return "unknown";
}

/**
 * The repository a public room was sealed on, from the names a listing returned: of the incarnations
 * `<base>-<step>` of its identity, the one with the highest step (the last made; abandoned ones come before it,
 * review 3eb7bc44). The base name itself and forks are not incarnations. Null when there is none.
 */
export function incarnationOf(base, names) {
  const re = new RegExp(`^${escapeRe(base)}-(\\d+)$`);
  let best = null;
  for (const n of names) {
    const m = re.exec(n);
    if (m && (best === null || Number(m[1]) > best.step)) best = { name: n, step: Number(m[1]) };
  }
  return best?.name ?? null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A repository record names an Artifacts repository; a token record carries a token ID (review 2485e992). */
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const TOKEN_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isRepoRecord = (r) => r !== null && typeof r === "object" && typeof r.name === "string" && NAME.test(r.name);
export const isTokenRecord = (t) => t !== null && typeof t === "object" && typeof t.id === "string" && TOKEN_ID.test(t.id);

/**
 * A listing's outcome, decided once. It is `done`, with its items, only if it
 * proves the whole set: `success: true`, an array, less than a page, no
 * larger `total_count`, and every record usable (`usable`, its identity). A
 * refusal is `refused`; anything else is `unknown`. Either way there are no
 * items: a refused, partial or malformed listing proves nothing is absent,
 * and a malformed record is never filtered into apparent absence.
 */
export function readListing(answer, page, usable) {
  if (answer?.success === false) return { outcome: "refused", items: null, detail: why(answer) };
  if (answer?.success !== true || !Array.isArray(answer.result)) return { outcome: "unknown", items: null, detail: why(answer) };
  const total = answer.result_info?.total_count;
  if (answer.result.length >= page || (typeof total === "number" && total > answer.result.length)) return { outcome: "unknown", items: null, detail: "incomplete listing" };
  if (!answer.result.every(usable)) return { outcome: "unknown", items: null, detail: "a record without a usable identity" };
  return { outcome: "done", items: answer.result };
}

function why(answer) {
  if (answer === undefined || answer === null) return "no answer";
  const errors = Array.isArray(answer.errors) ? answer.errors.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ") : "";
  if (errors) return errors;
  return "no success field in the answer";
}

/**
 * Clean up one run's Artifacts state and say whether it is all done. Duties:
 * revoke every token the run minted and did not see revoked; inventory the
 * run's repositories (the canonical one and `<canonical>--<lane>` forks);
 * for each, list its active tokens, revoke each, delete the repository; then
 * inventory again. Each duty ends `done`, `refused` or `unknown`. `ok` is
 * true only when every duty is done and the final inventory proves no
 * repository is left. Repository names and token IDs are kept, so an
 * operator can finish what is unresolved; no token is ever kept. Every
 * remote call's exception becomes an unknown duty; any other exception
 * reaches the caller, whose result then has a failed cleanup.
 */
export async function cleanupRun({ api, canonical, expected = [], minted = new Map(), incarnations = false }) {
  const duties = [];
  let reposLeft = [];
  const record = (duty, outcome, detail) => {
    const d = { ...duty, outcome, ...(outcome !== "done" && detail ? { detail } : {}) };
    duties.push(d);
    return d;
  };
  const settle = async (duty, call) => {
    try {
      const answer = await call();
      return record(duty, outcomeOf(answer), why(answer)).outcome;
    } catch (e) {
      return record(duty, "unknown", e.message).outcome;
    }
  };
  const listing = async (duty, path, page, usable) => {
    try {
      const { outcome, items, detail } = readListing(await api("GET", path), page, usable);
      record(duty, outcome, detail);
      return items;
    } catch (e) {
      record(duty, "unknown", e.message);
      return null;
    }
  };
  for (const [id, repo] of [...minted]) {
    if ((await settle({ duty: "revoke-minted-token", repo, token: id }, () => api("DELETE", `/tokens/${id}`))) === "done") minted.delete(id);
  }
  if (canonical) {
    // Records are validated by the listing; this only tells this run's repositories from others the search returns.
    // With `incarnations` (a public room since review 3eb7bc44), `canonical` is the identity's base name and the run's
    // repositories are the base (an older Room's), every incarnation `<base>-<step>`, and the forks of each.
    const ours = incarnations ? new RegExp(`^${escapeRe(canonical)}(-\\d+)?(--.+)?$`) : null;
    const mine = (r) => (ours ? ours.test(r.name) : r.name === canonical || r.name.startsWith(`${canonical}--`));
    const inventory = (duty) => listing({ duty, repos: expected }, `/repos?limit=${REPO_PAGE}&search=${canonical}`, REPO_PAGE, isRepoRecord);
    const found = await inventory("inventory");
    // Without a complete inventory, still clean what the run knows it made; the run fails on the inventory duty.
    const names = found ? found.filter(mine).map((r) => r.name) : [...new Set(expected)];
    for (const name of names) {
      const tokens = await listing({ duty: "list-tokens", repo: name }, `/repos/${name}/tokens?state=active&per_page=${TOKEN_PAGE}`, TOKEN_PAGE, isTokenRecord);
      for (const t of tokens ?? []) {
        // Token metadata only: the ID, scope and times, never the token.
        const meta = Object.fromEntries(Object.entries(t).filter(([k]) => !/plaintext|token|secret/i.test(k)));
        await settle({ duty: "revoke-token", repo: name, token: t.id, meta }, () => api("DELETE", `/tokens/${t.id}`));
      }
      await settle({ duty: "delete-repo", repo: name }, () => api("DELETE", `/repos/${name}`));
    }
    const left = await inventory("final-inventory");
    reposLeft = left ? left.filter(mine).map((r) => r.name) : null;
  }
  const unresolved = duties.filter((d) => d.outcome !== "done");
  const ok = unresolved.length === 0 && Array.isArray(reposLeft) && reposLeft.length === 0;
  return { ok, duties, unresolved, reposLeft };
}

/** The run succeeds only if main finished, every step passed, and cleanup is all done. */
export function smokeOk(result, failed) {
  return !failed && result.steps.length > 0 && result.steps.every((s) => s.ok) && result.cleanup?.ok === true;
}
