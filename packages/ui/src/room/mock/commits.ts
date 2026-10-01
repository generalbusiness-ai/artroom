/**
 * The scenario's commits, for the per-change history. @birch works in jj, so
 * the session lane's commits carry `change-id` headers; @cedar's recut keeps
 * them. @ash uses plain git, so the rate-limit lane's commits have none.
 *
 * Session lane, generation 1 (on main before the rate limit landed):
 *   zvqmnwro  Move session reading into requireSession()
 *   tkxlpsuy  Use requireSession() in whoami
 *   ommqkrtv  Log the session cookie while debugging
 * Generation 2 (@cedar's recut on main after the rate limit landed):
 *   zvqmnwro  rewritten: it now also refuses expired cookies
 *   tkxlpsuy  rewritten by the rebase only: the same edits
 *   (ommqkrtv dropped: it logged a cookie)
 *   yrwpvlqs  added: Test requireSession()
 */

import type { CommitInfo } from "../changes.ts";
import type { Sha } from "../contract.ts";
import { MemoryRepo } from "./repo.ts";

const CHECK_MAIN_0 = `import type { Request, Response } from "../../http";
import type { User } from "../users";
import { readCookie, verifySessionCookie } from "../cookies";

const SESSION_COOKIE = "sid";

export function canEdit(user: User, resource: { owner: string }): boolean {
  return user.admin || user.id === resource.owner;
}

/** The key rate limits use for a request. */
export function rateKey(req: Request): string {
  return req.ip;
}

export const currentUser = (req: Request) => verifySessionCookie(readCookie(req, SESSION_COOKIE));
`;

const RATEKEY_OLD = `/** The key rate limits use for a request. */
export function rateKey(req: Request): string {
  return req.ip;
}`;

const RATEKEY_NEW = `/**
 * The key rate limits use for a request: the client address and, when the
 * request names one, the account. One office behind NAT no longer shares a limit.
 */
export function rateKey(req: Request): string {
  const account = req.headers.get("x-account") ?? "anonymous";
  return \`\${req.ip}:\${account.toLowerCase()}\`;
}`;

const CHECK_MAIN_2 = CHECK_MAIN_0.replace(RATEKEY_OLD, RATEKEY_NEW);

/** The session-lane edit to check.ts, applied to either main. */
const moveSession = (check: string) =>
  check
    .replace('import { readCookie, verifySessionCookie } from "../cookies";\n\nconst SESSION_COOKIE = "sid";\n', 'import { requireSession } from "./session";\n')
    .replace("export const currentUser = (req: Request) => verifySessionCookie(readCookie(req, SESSION_COOKIE));", "export const currentUser = (req: Request) => requireSession(req);");

const API_SESSION = `import type { Request, Response } from "../http";
import { readCookie, verifySessionCookie } from "../lib/cookies";

export async function whoami(req: Request, res: Response) {
  const cookie = readCookie(req, "sid");
  const user = cookie ? verifySessionCookie(cookie) : null;
  if (!user) return res.status(401).json({ error: "Sign in first." });
  return res.json({ id: user.id, name: user.name });
}
`;

const API_SESSION_NEW = `import type { Request, Response } from "../http";
import { requireSession } from "../lib/authz/session";

export async function whoami(req: Request, res: Response) {
  const user = requireSession(req);
  if (!user) return res.status(401).json({ error: "Sign in first." });
  return res.json({ id: user.id, name: user.name });
}
`;

const SESSION_1 = `import type { Request } from "../../http";
import { readCookie, verifySessionCookie } from "../cookies";

const SESSION_COOKIE = "sid";

/** The signed-in user, or null. Every session check goes through here. */
export function requireSession(req: Request) {
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return null;
  return verifySessionCookie(cookie);
}
`;

const SESSION_1_DEBUG = SESSION_1.replace("  if (!cookie) return null;\n", '  console.log("session cookie", cookie);\n  if (!cookie) return null;\n');

const SESSION_2 = `import type { Request } from "../../http";
import { isExpired, readCookie, verifySessionCookie } from "../cookies";

const SESSION_COOKIE = "sid";

/** The signed-in user, or null. Every session check goes through here. */
export function requireSession(req: Request) {
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return null;
  if (isExpired(cookie)) return null;
  return verifySessionCookie(cookie);
}
`;

const SESSION_TEST = `import { expect, test } from "vitest";
import { requireSession } from "./session";

test("no cookie, no session", () => {
  expect(requireSession(new Request("https://acme.test/"))).toBeNull();
});
`;

/** The demo's repository, and each generation's commits by `<lane tag>/<generation>`. */
export function scenarioCommits(): { repo: MemoryRepo; commits: Record<string, CommitInfo[]>; heads: Record<string, Sha> } {
  const repo = new MemoryRepo();
  const main0 = repo.commit(null, { "src/lib/authz/check.ts": CHECK_MAIN_0, "src/api/session.ts": API_SESSION, "src/api/login.ts": "export {};\n" }, "main0");
  const main2 = repo.commit(main0, { "src/lib/authz/check.ts": CHECK_MAIN_2, "src/lib/ratelimit/bucket.ts": "export class TokenBucket {}\n" }, "main2");
  const chain = (parent: Sha, steps: { changeId: string | null; subject: string; edits: Record<string, string | null> }[], salt: string): CommitInfo[] => {
    const out: CommitInfo[] = [];
    let at = parent;
    for (const [i, s] of steps.entries()) {
      const commit = repo.commit(at, s.edits, `${salt}:${i}:${s.changeId ?? s.subject}`);
      out.push({ commit, parent: at, changeId: s.changeId, subject: s.subject });
      at = commit;
    }
    return out;
  };

  const moveG1 = { "src/lib/authz/check.ts": moveSession(CHECK_MAIN_0), "src/lib/authz/session.ts": SESSION_1 };
  const L2_1 = chain(
    main0,
    [
      { changeId: "zvqmnwrokxsl", subject: "Move session reading into requireSession()", edits: moveG1 },
      { changeId: "tkxlpsuyqmzo", subject: "Use requireSession() in whoami", edits: { "src/api/session.ts": API_SESSION_NEW } },
      { changeId: "ommqkrtvnwpy", subject: "Log the session cookie while debugging", edits: { "src/lib/authz/session.ts": SESSION_1_DEBUG } },
    ],
    "L2/1",
  );
  const L2_2 = chain(
    main2,
    [
      { changeId: "zvqmnwrokxsl", subject: "Move session reading into requireSession()", edits: { "src/lib/authz/check.ts": moveSession(CHECK_MAIN_2), "src/lib/authz/session.ts": SESSION_2 } },
      { changeId: "tkxlpsuyqmzo", subject: "Use requireSession() in whoami", edits: { "src/api/session.ts": API_SESSION_NEW } },
      { changeId: "yrwpvlqsmtno", subject: "Test requireSession()", edits: { "src/lib/authz/session.test.ts": SESSION_TEST } },
    ],
    "L2/2",
  );
  // Plain git: no headers. The per-change view shows nothing for this lane.
  const L1_1 = chain(main0, [{ changeId: null, subject: "Rate-limit login attempts", edits: { "src/api/login.ts": "export const limited = true;\n" } }], "L1/1");
  const L1_2 = chain(main0, [{ changeId: null, subject: "Rate-limit login attempts by address and account", edits: { "src/api/login.ts": "export const limited = true;\n", "src/lib/authz/check.ts": CHECK_MAIN_2 } }], "L1/2");

  const commits: Record<string, CommitInfo[]> = { "L2/1": L2_1, "L2/2": L2_2, "L1/1": L1_1, "L1/2": L1_2 };
  const heads = Object.fromEntries(Object.entries(commits).map(([k, cs]) => [k, cs.at(-1)!.commit]));
  return { repo, commits, heads };
}

/** Built once: the same IDs on every replay. */
export const SCENARIO_COMMITS = scenarioCommits();
