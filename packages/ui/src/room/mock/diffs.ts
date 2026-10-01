/**
 * The scenario's code: unified diffs from each proposal's base to its head.
 * Short, but real enough that the notes and verdicts make sense.
 */

import type { DiffHunk, DiffLine, FileDiff } from "../adapter.ts";

/** Parse a small unified diff: `--- a/x`, `+++ b/x`, `@@ -a,b +c,d @@` hunks. */
export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: { path: string; status: FileDiff["status"]; hunks: DiffHunk[] } | null = null;
  let hunk: { header: string; lines: DiffLine[] } | null = null;
  let oldNo = 0;
  let newNo = 0;
  const all = text.split("\n");
  // An empty line is a blank context line, unless only file boundaries follow it.
  const kept = all.filter((line, i) => {
    if (line !== "") return true;
    const next = all.slice(i + 1).find((l) => l !== "");
    return next !== undefined && !next.startsWith("--- ");
  });
  for (const raw of kept) {
    if (raw.startsWith("--- ")) {
      const from = raw.slice(4);
      current = { path: "", status: from === "/dev/null" ? "added" : "modified", hunks: [] };
      files.push(current as FileDiff);
      hunk = null;
    } else if (raw.startsWith("+++ ") && current) {
      current.path = raw.slice(4).replace(/^b\//, "");
    } else if (raw.startsWith("@@") && current) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
      oldNo = Number(m?.[1] ?? 1);
      newNo = Number(m?.[2] ?? 1);
      hunk = { header: raw, lines: [] };
      current.hunks.push(hunk);
    } else if (hunk) {
      const mark = raw[0];
      const body = raw.slice(1);
      if (mark === "+") hunk.lines.push({ kind: "add", newLine: newNo++, text: body });
      else if (mark === "-") hunk.lines.push({ kind: "del", oldLine: oldNo++, text: body });
      else if (mark === " " || raw === "") hunk.lines.push({ kind: "context", oldLine: oldNo++, newLine: newNo++, text: body });
    }
  }
  return files;
}

const LOGIN = `
--- a/src/api/login.ts
+++ b/src/api/login.ts
@@ -1,18 +1,22 @@
 import type { Request, Response } from "../http";
 import { verifyPassword } from "../lib/auth/password";
-import { startSession } from "../lib/authz/check";
+import { rateKey, startSession } from "../lib/authz/check";
+import { TokenBucket } from "../lib/ratelimit/bucket";
+
+// Five attempts, then one more every twelve seconds.
+const loginLimiter = new TokenBucket({ capacity: 5, refillPerMinute: 5 });

 export async function login(req: Request, res: Response) {
   const { email, password } = await req.json();
   if (!email || !password) {
     return res.status(400).json({ error: "Email and password are required." });
   }

-  const user = await verifyPassword(email, password);
+  if (!loginLimiter.take(rateKey(req))) return tooMany(res);
+  const user = await verifyPassword(email, password);
   if (!user) {
     return res.status(401).json({ error: "Email or password is wrong." });
   }
   return startSession(res, user);
 }
+
+const tooMany = (res: Response) => res.status(429).json({ error: "Too many attempts. Try again in a minute." });
`;

const BUCKET = `
--- /dev/null
+++ b/src/lib/ratelimit/bucket.ts
@@ -0,0 +1,24 @@
+/** A token bucket per key. In memory: one bucket set per isolate. */
+export class TokenBucket {
+  private readonly buckets = new Map<string, { tokens: number; at: number }>();
+
+  constructor(private readonly opts: { capacity: number; refillPerMinute: number }) {}
+
+  /** Take one token for \`key\`. False when the bucket is empty. */
+  take(key: string, now = Date.now()): boolean {
+    const b = this.buckets.get(key) ?? { tokens: this.opts.capacity, at: now };
+    const refill = ((now - b.at) / 60_000) * this.opts.refillPerMinute;
+    b.tokens = Math.min(this.opts.capacity, b.tokens + refill);
+    b.at = now;
+    if (b.tokens < 1) {
+      this.buckets.set(key, b);
+      return false;
+    }
+    b.tokens -= 1;
+    this.buckets.set(key, b);
+    return true;
+  }
+
+  /** Forget keys idle for longer than a full refill. */
+  sweep(now = Date.now()) { for (const [k, b] of this.buckets) if (now - b.at > 120_000) this.buckets.delete(k); }
+}
`;

const BUCKET_TEST = `
--- /dev/null
+++ b/src/lib/ratelimit/bucket.test.ts
@@ -0,0 +1,12 @@
+import { expect, test } from "vitest";
+import { TokenBucket } from "./bucket";
+
+test("allows the capacity, then refuses until refill", () => {
+  const b = new TokenBucket({ capacity: 2, refillPerMinute: 60 });
+  expect(b.take("k", 0)).toBe(true);
+  expect(b.take("k", 0)).toBe(true);
+  expect(b.take("k", 0)).toBe(false);
+  expect(b.take("k", 1_000)).toBe(true);
+});
+
+test("keys are independent", () => expect(new TokenBucket({ capacity: 1, refillPerMinute: 1 }).take("a")).toBe(true));
`;

const AUTHZ_RATEKEY = `
--- a/src/lib/authz/check.ts
+++ b/src/lib/authz/check.ts
@@ -21,9 +21,12 @@ export function startSession(res: Response, user: User) {
   return res.status(200).json({ ok: true });
 }

-/** The key rate limits use for a request. */
+/**
+ * The key rate limits use for a request: the client address and, when the
+ * request names one, the account. One office behind NAT no longer shares a limit.
+ */
 export function rateKey(req: Request): string {
-  return req.ip;
+  const account = req.headers.get("x-account") ?? "anonymous";
+  return \`\${req.ip}:\${account.toLowerCase()}\`;
 }
`;

const LOGGER = `
--- /dev/null
+++ b/src/lib/log/logger.ts
@@ -0,0 +1,16 @@
+/** One JSON line per request. Request IDs only: never bodies, headers or tokens. */
+export interface RequestLog {
+  id: string;
+  method: string;
+  path: string;
+  status: number;
+  ms: number;
+}
+
+export function logRequest(entry: RequestLog): void {
+  console.log(JSON.stringify({ level: "info", ...entry }));
+}
+
+export function newRequestId(): string {
+  return crypto.randomUUID();
+}
`;

const MIDDLEWARE = `
--- a/src/api/middleware.ts
+++ b/src/api/middleware.ts
@@ -1,10 +1,16 @@
 import type { Handler } from "../http";
+import { logRequest, newRequestId } from "../lib/log/logger";

 export function withErrors(handler: Handler): Handler {
   return async (req, res) => {
+    const id = newRequestId();
+    const started = performance.now();
     try {
       return await handler(req, res);
     } catch (err) {
       return res.status(500).json({ error: "Something went wrong." });
+    } finally {
+      const ms = Math.round(performance.now() - started);
+      logRequest({ id, method: req.method, path: new URL(req.url).pathname, status: res.statusCode, ms });
     }
   };
 }
`;

const AUTHZ_SESSION_G1 = `
--- a/src/lib/authz/check.ts
+++ b/src/lib/authz/check.ts
@@ -1,8 +1,6 @@
 import type { Request, Response } from "../../http";
 import type { User } from "../users";
-import { readCookie, verifySessionCookie } from "../cookies";
-
-const SESSION_COOKIE = "sid";
+import { requireSession } from "./session";

 export function canEdit(user: User, resource: { owner: string }): boolean {
   return user.admin || user.id === resource.owner;
@@ -24,6 +22,6 @@ export function startSession(res: Response, user: User) {
 /** The key rate limits use for a request. */
 export function rateKey(req: Request): string {
   return req.ip;
 }

-export const currentUser = (req: Request) => verifySessionCookie(readCookie(req, SESSION_COOKIE));
+export const currentUser = (req: Request) => requireSession(req);
`;

const AUTHZ_SESSION_G2 = `
--- a/src/lib/authz/check.ts
+++ b/src/lib/authz/check.ts
@@ -1,8 +1,6 @@
 import type { Request, Response } from "../../http";
 import type { User } from "../users";
-import { readCookie, verifySessionCookie } from "../cookies";
-
-const SESSION_COOKIE = "sid";
+import { requireSession } from "./session";

 export function canEdit(user: User, resource: { owner: string }): boolean {
   return user.admin || user.id === resource.owner;
@@ -24,9 +22,9 @@ export function startSession(res: Response, user: User) {
  * request names one, the account. One office behind NAT no longer shares a limit.
  */
 export function rateKey(req: Request): string {
   const account = req.headers.get("x-account") ?? "anonymous";
   return \`\${req.ip}:\${account.toLowerCase()}\`;
 }

-export const currentUser = (req: Request) => verifySessionCookie(readCookie(req, SESSION_COOKIE));
+export const currentUser = (req: Request) => requireSession(req);
`;

const SESSION_LIB = `
--- /dev/null
+++ b/src/lib/authz/session.ts
@@ -0,0 +1,11 @@
+import type { Request } from "../../http";
+import { readCookie, verifySessionCookie } from "../cookies";
+
+const SESSION_COOKIE = "sid";
+
+/** The signed-in user, or null. Every session check goes through here. */
+export function requireSession(req: Request) {
+  const cookie = readCookie(req, SESSION_COOKIE);
+  if (!cookie) return null;
+  return verifySessionCookie(cookie);
+}
`;

const API_SESSION = `
--- a/src/api/session.ts
+++ b/src/api/session.ts
@@ -1,9 +1,8 @@
 import type { Request, Response } from "../http";
-import { readCookie, verifySessionCookie } from "../lib/cookies";
+import { requireSession } from "../lib/authz/session";

 export async function whoami(req: Request, res: Response) {
-  const cookie = readCookie(req, "sid");
-  const user = cookie ? verifySessionCookie(cookie) : null;
+  const user = requireSession(req);
   if (!user) return res.status(401).json({ error: "Sign in first." });
   return res.json({ id: user.id, name: user.name });
 }
`;

/** Diffs by proposal key `<lane tag>/<generation>`. */
export const DIFFS: Readonly<Record<string, string>> = {
  "L1/1": LOGIN + BUCKET + BUCKET_TEST,
  "L1/2": LOGIN + BUCKET + BUCKET_TEST + AUTHZ_RATEKEY,
  "L3/1": LOGGER + MIDDLEWARE,
  "L2/1": AUTHZ_SESSION_G1 + SESSION_LIB + API_SESSION,
  "L2/2": AUTHZ_SESSION_G2 + SESSION_LIB + API_SESSION,
};
