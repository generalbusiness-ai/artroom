/**
 * Review 88a20f74: P1, live sentences about unresolved publications state
 * only recorded facts, and describe recovery only from a loaded operation;
 * P2, a dry run validates the whole compiled policy before predicting.
 */
import { cleanup, render, screen } from "@testing-library/preact";
import { validatePolicy } from "@generalbusiness/artroom-policy";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/app.tsx";
import type { DraftRule } from "../src/room/adapter.ts";
import type { Cursor, HttpRoom, LandOp, LogEntry, Sha } from "../src/room/contract.ts";
import { compileDraft } from "../src/room/dryrun.ts";
import { describeEntry } from "../src/room/live/describe.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { POLICY } from "../src/room/mock/policy.ts";
import { stepOf } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  location.hash = "";
});

const FORWARD = "pushes the same reserved commit forward";
const ABORT = { trigger: "act_99_aaaaaaaa" as const, key: "key_compromised" as const, at: 99, tokenRevoked: true };
type Unresolved = Extract<LandOp, { state: "unresolved" }>;

function base() {
  const snap = new MockRoom({ step: stepOf("Rate limit is ready") }).snapshot();
  const op = snap.landOps.find((o) => o.state === "unresolved") as Unresolved;
  return { snap, op };
}

function entry(seq: number, event: Extract<LogEntry["entry"], { type: "system" }>["event"]): LogEntry {
  return { format: "artroom-log-v1", seq, prev: `sha256:${"0".repeat(64)}`, at: "2026-10-01T09:30:00Z", hash: `sha256:${seq.toString(16).padStart(8, "0")}${"1".repeat(56)}`, roomSig: "s", entry: { type: "system", event } };
}

/** A live room whose log holds `acts` and whose one lane has `op` loaded (or no landing). */
async function live(acts: LogEntry[], op: LandOp | null) {
  const { snap } = base();
  const lane = snap.lanes[0]!;
  const room = {
    id: snap.room.id,
    name: snap.room.name,
    members: async () => ({ at: 1, members: [], teams: {}, delegations: [], recovery: "key_r", soleAdmin: false }),
    lanes: async () => ({ items: [{ ...lane, generations: [], ...(op ? { landing: op.id } : { landing: undefined }) }], cursor: "c" as Cursor, more: false }),
    attention: async () => ({ items: [], cursor: "c" as Cursor, more: false }),
    log: async () => ({ acts, cursor: "c" as Cursor, more: false, head: acts.at(-1)!.seq, publishedThrough: 0 }),
    proposal: async () => null,
    op: async () => op,
    explain: async () => ({ act: "act_100_00000064", kind: "system", outcome: "system", entry: acts.at(-1)!, decisions: [], invariants: [], published: false }),
    watch: () => ({ cursor: "c" as Cursor, close: () => {}, [Symbol.dispose]: () => {} }),
  } as unknown as HttpRoom;
  const r = new LiveRoom(room, "@sam");
  await r.start();
  return r;
}

describe("P1 live sentences about unresolved publications", () => {
  test("the event alone states only what was read back, for both read-backs", () => {
    const { op } = base();
    const expected = describeEntry(entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } })).text;
    const unexpected = describeEntry(entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "unexpected", observed: "f".repeat(40) as Sha } })).text;
    expect(expected).toBe("A publication is unresolved: main read back as the expected main, so the push had not landed.");
    expect(unexpected).toContain("neither the expected main nor the reserved commit");
    for (const t of [expected, unexpected]) expect(t).not.toMatch(/push(es)? .*forward/);
  });

  test("abort before the first unresolved event: the feed says forward pushes stopped", async () => {
    const { op } = base();
    const r = await live(
      [
        entry(99, { type: "abort-attempt", op: op.id, attempt: ABORT }),
        entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } }),
      ],
      { ...op, abort: ABORT },
    );
    const text = r.snapshot()!.feed[1]!.text;
    expect(text).toContain("main read back as the expected main");
    expect(text).toContain("Now: Abort attempt in progress. The room no longer pushes this landing");
    expect(text).not.toContain(FORWARD);
    r.stop();
  });

  test("truncated history with a loaded abort: the abort still governs the sentence", async () => {
    const { op } = base();
    const r = await live([entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } })], { ...op, abort: ABORT });
    const text = r.snapshot()!.feed[0]!.text;
    expect(text).toContain("Now: Abort attempt in progress");
    expect(text).not.toContain(FORWARD);
    r.stop();
  });

  test("with no loaded operation, the sentence does not assume there was no abort", async () => {
    const { op } = base();
    const r = await live([entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } })], null);
    const text = r.snapshot()!.feed[0]!.text;
    expect(text).toContain("whether the room is still pushing it is not known here");
    expect(text).not.toContain(FORWARD);
    r.stop();
  });

  test("ordinary unresolved publication with no abort: complete forward is described from the loaded operation", async () => {
    const { op } = base();
    const r = await live([entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } })], op);
    expect(r.snapshot()!.feed[0]!.text).toContain(`Now: Main still reads as before, so the room ${FORWARD} again.`);
    r.stop();
  });

  test("unexpected main: the room stopped pushing", async () => {
    const { op } = base();
    const observed = "f".repeat(40) as Sha;
    const r = await live([entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "unexpected", observed } })], { ...op, readBack: { main: "unexpected", observed } });
    const text = r.snapshot()!.feed[0]!.text;
    expect(text).toContain("Now: Main shows another writer. The room stopped pushing");
    expect(text).not.toContain(FORWARD);
    r.stop();
  });

  test("explain titles follow the same rule", async () => {
    const { op } = base();
    const r = await live([entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } })], { ...op, abort: ABORT });
    const why = await r.explain("act_100_00000064");
    expect(why!.title).toContain("Now: Abort attempt in progress");
    expect(why!.title).not.toContain(FORWARD);
    location.hash = "#/room";
    render(<App adapter={r} />);
    expect(screen.getByText(/Now: Abort attempt in progress/)).toBeTruthy();
    r.stop();
  });
});

describe("P2 a dry run validates the whole compiled policy first", () => {
  const invalid: [string, DraftRule][] = [
    ["require-review with an existing rule ID", { kind: "require-review", id: "security-review", paths: ["src/**"], from: "@platform", count: 1 }],
    ["require-review with an invalid path", { kind: "require-review", id: "valid-id", paths: ["src/[ab].ts"], from: "@platform", count: 1 }],
    ["default dependency with an invalid area", { kind: "carry-depends-on", area: "src/[ab]/**", dependsOn: ["src/**"] }],
    ["global input with an invalid path", { kind: "global-input", paths: ["src/[ab].ts"] }],
    ["refuse-claim with an existing rule ID", { kind: "refuse-claim", id: "security-review", paths: ["migrations/**"], roles: ["agent"] }],
  ];
  for (const [name, draft] of invalid) {
    test(`${name}: no prediction, the validation problem and a fix`, async () => {
      const r = await new MockRoom().dryRun(draft);
      expect(r).toMatchObject({ status: "not-compiled" });
      if (!("status" in r) || r.status !== "not-compiled") throw new Error("not refused");
      expect(r.reason).toContain("would be refused (policy-invalid)");
      expect(r.problems.length).toBeGreaterThan(0);
      expect(r.fix).toBeTruthy();
    });
  }

  test("an unsupported refuse-claim target shape is still refused before validation", async () => {
    const r = await new MockRoom().dryRun({ kind: "refuse-claim", id: "new-id", paths: ["src/*.sql"], roles: ["agent"] });
    if (!("status" in r) || r.status !== "not-compiled") throw new Error("not refused");
    expect(r.reason).toContain("neither a literal path nor a directory");
  });

  const valid: DraftRule[] = [
    { kind: "require-review", id: "platform-reviews-authz", paths: ["src/lib/authz/**"], from: "@platform", count: 1 },
    { kind: "refuse-claim", id: "agents-stay-out-of-authz", paths: ["src/lib/authz/**"], roles: ["agent"] },
    { kind: "carry-depends-on", area: "src/lib/**", dependsOn: ["src/lib/**"] },
    { kind: "global-input", paths: ["src/lib/authz/**"] },
  ];
  for (const draft of valid) {
    test(`a valid ${draft.kind} draft compiles to a valid policy and replays`, async () => {
      const c = compileDraft(draft, POLICY);
      if (!("doc" in c)) throw new Error(c.problem);
      expect(validatePolicy(c.doc).ok).toBe(true);
      expect((await new MockRoom().dryRun(draft)) as { status: string }).toMatchObject({ status: "replayed" });
    });
  }
});
