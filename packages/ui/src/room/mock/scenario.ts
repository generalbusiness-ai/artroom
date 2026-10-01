/**
 * The scripted scenario: three agents (@ash, @birch, @cedar), two people
 * (@maya, security; @sam, platform and admin) and a checker (@ci), in one
 * room over 44 minutes. It covers overlapping claims, a policy refusal and a
 * platform refusal, a carried and a stale verdict, two landings prepared in
 * parallel, an unresolved publication, a conflict preview, and a lease
 * expiry handed over to another agent.
 *
 * Each step is one moment on the timeline. Replaying steps 0..n always gives
 * the same room.
 */

import type { MemberId } from "../contract.ts";
import type { World } from "./world.ts";

export interface Step {
  /** Minutes after 09:00. */
  readonly minute: number;
  readonly label: string;
  run(w: World): void;
}

const ISSUE = { url: "https://github.com/acme/web/issues/412" } as const;

/** Approve, unless this member already approved this generation (the viewer may have done it by hand). */
function approveOnce(w: World, by: MemberId, tag: string, generation: number, scope: string[], text: string, dependsOn: string[] = []) {
  const lane = w.lane(tag);
  const done = w.reviews.some((r) => r.lane === lane.id && r.generation === generation && r.by.member === by && r.verdict === "approve");
  if (!done) w.review(by, tag, generation, { verdict: "approve", scope, dependsOn, text });
}

export const STEPS: readonly Step[] = [
  { minute: 0, label: "The room is open. Nothing is claimed yet.", run: () => {} },
  {
    minute: 0,
    label: "@ash claims “Rate-limit /api/login”",
    run: (w) =>
      w.claim("@ash", "L1", {
        goal: "Rate-limit /api/login",
        scope: ["src/api/login.ts", "src/lib/ratelimit/**", "src/lib/authz/check.ts"],
        plan: "A token bucket per client, checked before the password. The key comes from rateKey() in the authz module.",
        because: [ISSUE],
      }),
  },
  {
    minute: 1,
    label: "@cedar claims “Structured request logging”",
    run: (w) =>
      w.claim("@cedar", "L3", {
        goal: "Structured request logging",
        scope: ["src/lib/log/**", "src/api/middleware.ts"],
        plan: "One JSON line per request with an ID, status and timing. No bodies or headers.",
      }),
  },
  {
    minute: 2,
    label: "Policy refuses @birch's claim on a migration",
    run: (w) =>
      w.claim("@birch", "L2x", {
        goal: "Move session checks into authz",
        scope: ["src/lib/authz/**", "src/api/session.ts", "migrations/2026_10_sessions.sql"],
      }),
  },
  {
    minute: 3,
    label: "@birch claims again without the migration. It overlaps @ash's claim",
    run: (w) =>
      w.claim("@birch", "L2", {
        goal: "Move session checks into authz",
        scope: ["src/lib/authz/**", "src/api/session.ts"],
        plan: "One requireSession() in src/lib/authz/session.ts; every endpoint calls it.",
      }),
  },
  {
    minute: 8,
    label: "@ash proposes generation 1",
    run: (w) =>
      w.propose("@ash", "L1", {
        head: "L1/1",
        summary: "Adds a token bucket (5 attempts, then one every 12 seconds) and checks it in login before the password. Tests cover refill and independent keys.",
        changed: [
          { status: "modified", path: "src/api/login.ts" },
          { status: "added", path: "src/lib/ratelimit/bucket.ts" },
          { status: "added", path: "src/lib/ratelimit/bucket.test.ts" },
        ],
        because: [ISSUE],
      }),
  },
  { minute: 9, label: "@ci: tests pass on generation 1", run: (w) => w.check("@ci", "L1", 1, true, "14 passed, 0 failed (1.9 s)") },
  {
    minute: 10,
    label: "@cedar proposes generation 1 of the logging lane",
    run: (w) =>
      w.propose("@cedar", "L3", {
        head: "L3/1",
        summary: "Adds logRequest() and wraps every handler so each request writes one JSON line with an ID, status and duration.",
        changed: [
          { status: "added", path: "src/lib/log/logger.ts" },
          { status: "modified", path: "src/api/middleware.ts" },
        ],
      }),
  },
  {
    minute: 12,
    label: "@maya asks about the rate-limit key",
    run: (w) => {
      const lane = w.lane("L1");
      w.note("@maya", { lane: lane.id, generation: 1, head: lane.generations[0]!.head, path: "src/api/login.ts", line: 15 }, "rateKey(req) is the client address only, so one office behind NAT shares five attempts. Can the key include the account?");
    },
  },
  {
    minute: 13,
    label: "@ash replies to the note",
    run: (w) => {
      const lane = w.lane("L1");
      const parent = w.notes.find((n) => n.by.member === "@maya")!;
      w.note("@ash", { lane: lane.id, generation: 1, head: lane.generations[0]!.head, path: "src/api/login.ts", line: 15 }, "Yes. Generation 2 changes rateKey() in src/lib/authz/check.ts to the address plus the account.", parent.id);
    },
  },
  {
    minute: 14,
    label: "@ci: tests pass on the logging lane; the log is published",
    run: (w) => {
      w.check("@ci", "L3", 1, true, "12 passed, 0 failed (1.6 s)");
      w.checkpoint();
    },
  },
  {
    minute: 15,
    label: "@birch proposes a file outside its claim: refused",
    run: (w) =>
      w.propose("@birch", "L2", {
        head: "L2/0",
        summary: "Moves session checks into requireSession() and updates the routes.",
        changed: [
          { status: "modified", path: "src/lib/authz/check.ts" },
          { status: "added", path: "src/lib/authz/session.ts" },
          { status: "modified", path: "src/api/session.ts" },
          { status: "modified", path: "src/api/routes.ts" },
        ],
      }),
  },
  {
    minute: 15.5,
    label: "@birch proposes generation 1 inside its claim",
    run: (w) =>
      w.propose("@birch", "L2", {
        head: "L2/1",
        summary: "Moves cookie reading and verification into requireSession(). check.ts and the whoami endpoint call it.",
        changed: [
          { status: "modified", path: "src/lib/authz/check.ts" },
          { status: "added", path: "src/lib/authz/session.ts" },
          { status: "modified", path: "src/api/session.ts" },
        ],
      }),
  },
  {
    minute: 16,
    label: "@sam approves the rate-limit bucket",
    run: (w) => approveOnce(w, "@sam", "L1", 1, ["src/lib/ratelimit/**"], "The refill arithmetic is right and the tests cover it. In-memory per isolate is fine for now."),
  },
  {
    minute: 17,
    label: "@maya approves the login path, declaring a dependency on authz",
    run: (w) =>
      approveOnce(w, "@maya", "L1", 1, ["src/api/login.ts"], "The login path is right. It relies on rateKey() in src/lib/authz, so I declare that as a dependency.", ["src/lib/authz/**"]),
  },
  {
    minute: 18,
    label: "@ash proposes generation 2: one verdict carries, one goes stale",
    run: (w) =>
      w.propose("@ash", "L1", {
        head: "L1/2",
        summary: "Answers @maya's note: rateKey() now combines the client address and the account. Only src/lib/authz/check.ts changed since generation 1.",
        changed: [
          { status: "modified", path: "src/api/login.ts" },
          { status: "added", path: "src/lib/ratelimit/bucket.ts" },
          { status: "added", path: "src/lib/ratelimit/bucket.test.ts" },
          { status: "modified", path: "src/lib/authz/check.ts" },
        ],
        since: ["src/lib/authz/check.ts"],
        because: [ISSUE],
      }),
  },
  {
    minute: 19,
    label: "@ci: tests pass on generation 2; the log is published",
    run: (w) => {
      w.check("@ci", "L1", 2, true, "15 passed, 0 failed (2.0 s)");
      w.checkpoint();
    },
  },
  { minute: 20, label: "@sam approves the logger", run: (w) => approveOnce(w, "@sam", "L3", 1, ["src/lib/log/**"], "Request IDs only, no bodies. Good.") },
  {
    minute: 21,
    label: "@maya approves the middleware",
    run: (w) => approveOnce(w, "@maya", "L3", 1, ["src/api/middleware.ts"], "Nothing secret reaches the log line. Approve."),
  },
  {
    minute: 22,
    label: "@cedar lands the logging lane; it starts preparing",
    run: (w) => {
      w.land("@cedar", "L3");
      w.prepare("L3");
    },
  },
  {
    minute: 23,
    label: "Logging is ready and reserved: publication 7 starts",
    run: (w) => {
      w.ready("L3");
      w.reserve("L3");
    },
  },
  { minute: 24, label: "Publication 7 is unresolved: Artifacts did not answer", run: (w) => w.unresolved("L3") },
  {
    minute: 25,
    label: "@sam notes on the stuck publication (recorded after the reservation)",
    run: (w) => {
      const op = w.landOp("L3");
      w.note("@sam", { act: op.act }, "Artifacts reports elevated errors in our region. Leaving the room to push the same commit forward.");
    },
  },
  {
    minute: 25.5,
    label: "@maya approves generation 2 of the rate limit",
    run: (w) =>
      approveOnce(w, "@maya", "L1", 2, ["src/api/login.ts", "src/lib/authz/check.ts"], "Read again with the rateKey() change. Address plus account is right, and lower-casing the account stops trivial bypasses."),
  },
  {
    minute: 26,
    label: "@ash lands the rate limit; it prepares in parallel",
    run: (w) => {
      w.land("@ash", "L1");
      w.prepare("L1");
    },
  },
  {
    minute: 27,
    label: "Rate limit is ready, waiting for the publication slot. @birch's lease is ending",
    run: (w) => {
      w.ready("L1");
      w.leaseWarning("L2");
    },
  },
  { minute: 30.5, label: "@birch's lease expires with no handover", run: (w) => w.expire("L2") },
  {
    minute: 31,
    label: "The forward push succeeds: logging lands",
    run: (w) => {
      w.landed("L3");
      w.checkpoint();
    },
  },
  { minute: 31.5, label: "Main moved: the rate limit prepares again", run: (w) => w.prepare("L1") },
  {
    minute: 32,
    label: "@ci checks the new integration; the rate limit is reserved",
    run: (w) => {
      w.check("@ci", "L1", 2, true, "15 passed, 0 failed (2.1 s) on the landing integration", w.landOp("L1").id);
      w.ready("L1");
      w.reserve("L1");
    },
  },
  { minute: 32.5, label: "The rate limit lands", run: (w) => w.landed("L1") },
  { minute: 33, label: "The session lane now conflicts with main", run: (w) => w.previewConflict("L2", ["src/lib/authz/check.ts"]) },
  {
    minute: 34,
    label: "The agents release their landed lanes",
    run: (w) => {
      w.release("@cedar", "L3", "Landed as publication 7.");
      w.release("@ash", "L1", "Landed. Follow-up: share buckets across isolates with a Durable Object.");
    },
  },
  { minute: 36, label: "@cedar takes over the session lane", run: (w) => w.takeOver("@cedar", "L2") },
  {
    minute: 41,
    label: "@cedar recuts the session lane on main as generation 2",
    run: (w) =>
      w.propose("@cedar", "L2", {
        head: "L2/2",
        summary: "Recut of @birch's generation 1 on the new main. Keeps the new rateKey() and moves session reading into requireSession().",
        changed: [
          { status: "modified", path: "src/lib/authz/check.ts" },
          { status: "added", path: "src/lib/authz/session.ts" },
          { status: "modified", path: "src/api/session.ts" },
        ],
        since: ["src/lib/authz/check.ts"],
      }),
  },
  { minute: 42, label: "@ci: tests pass on the recut", run: (w) => w.check("@ci", "L2", 2, true, "16 passed, 0 failed (2.2 s)") },
  { minute: 44, label: "The log is published again", run: (w) => w.checkpoint() },
];

/** The step a fresh page opens at: a publication is stuck, one verdict carried and one went stale. */
export const DEFAULT_STEP = STEPS.findIndex((s) => s.label.startsWith("@sam notes on the stuck publication"));
