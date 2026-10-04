/**
 * What the page says about a landing's publication (docs/protocol.md
 * section 14): only the recorded read-back and abort facts, on the Room
 * screen's cards (review 82f2743b, P1.2 and P2.3) and in a live room's feed
 * sentences and explanations, which describe recovery only from a loaded
 * operation (review 88a20f74, P1).
 *
 * The cards are rendered over the scripted stand-in room with its landing
 * operations replaced; the sentences come from the live adapter over a stub
 * of the contract's reads.
 */
import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/app.tsx";
import type { RoomSnapshot } from "../src/room/adapter.ts";
import type { Cursor, HttpRoom, LandOp, LogEntry, Sha } from "../src/room/contract.ts";
import { describeEntry } from "../src/room/live/describe.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { stepOf } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  location.hash = "";
});

const sha = (c: string) => c.repeat(40) as Sha;
const STEP = () => stepOf("Rate limit is ready");

/** Render a screen over the mock, with its landing operations replaced. */
function withOps(hash: string, make: (base: LandOp, snap: RoomSnapshot) => LandOp[], viewer: "@maya" | "@sam" = "@maya") {
  const mock = new MockRoom({ step: STEP(), viewer });
  const snap = mock.snapshot();
  const base = snap.landOps.find((o) => o.state === "unresolved")!;
  const ops = make(base, snap);
  const held = ops.find((o) => o.state === "publishing" || o.state === "unresolved");
  const slot = held && "publication" in held ? { state: "held" as const, op: held.id, publication: held.publication, reservedAt: held.reservedAt } : { state: "free" as const, last: 7 };
  vi.spyOn(mock, "snapshot").mockReturnValue({ ...snap, landOps: ops, slot });
  location.hash = hash;
  render(<App adapter={mock} />);
  return mock;
}

const card = (state: string) => document.querySelector<HTMLElement>(`[data-op='${state}']`)!;
const unresolved = (base: LandOp) => base as Extract<LandOp, { state: "unresolved" }>;
const ABORT = { trigger: "act_90_aaaaaaaa" as const, key: "key_compromised" as const, at: 90, tokenRevoked: true };

describe("the landing cards follow the recorded read-back and abort facts (review 82f2743b, P1.2)", () => {
  test("expected main, no abort: the room completes the same reserved commit forward", () => {
    withOps("#/room", (b) => [b]);
    const text = card("unresolved").textContent!;
    expect(text).toContain("Main still reads as before, so the room pushes the same reserved commit forward again");
    expect(text).toContain("never released on a timer");
  });

  test("unexpected main: the room stops pushing and the slot waits for an admin to reconcile", () => {
    withOps("#/room", (b) => [{ ...unresolved(b), readBack: { main: "unexpected", observed: sha("f") } }]);
    const text = card("unresolved").textContent!;
    expect(text).toContain("Main shows another writer. The room stopped pushing");
    expect(text).toContain("ffffff");
    expect(text).not.toContain("pushes the same reserved commit forward");
    expect(screen.getByRole("region", { name: "Room status" }).textContent).toContain("Held: another writer");
  });

  test("compromised evidence: forward retries stop; abort, read-back and revert outcomes are shown", () => {
    withOps("#/room", (b) => [{ ...unresolved(b), readBack: { main: "unexpected", observed: sha("f") }, abort: ABORT }]);
    const text = card("unresolved").textContent!;
    expect(text).toContain("Abort attempt in progress");
    expect(text).toContain("revoked as compromised (entry 90)");
    expect(text).toContain("The publication token was revoked.");
    expect(text).toContain("An admin must reconcile main.");
    expect(text).toContain("opens a revert lane");
    expect(text).not.toContain("pushes the same reserved commit forward");
  });

  test("compromised evidence with main still as expected: no forward push is promised", () => {
    withOps("#/room", (b) => [{ ...unresolved(b), abort: { ...ABORT, tokenRevoked: false } }]);
    const text = card("unresolved").textContent!;
    expect(text).toContain("no longer pushes this landing");
    expect(text).toContain("has not confirmed that the publication token was revoked");
    expect(text).toContain("Main still reads as the expected main");
  });

  test("landed despite an abort attempt: the revert lane is linked", () => {
    withOps("#/room", (b, snap) => {
      const u = unresolved(b);
      const revert = snap.lanes[0]!.lane;
      return [{ ...u, state: "landed", receipt: "act_91_aaaaaaaa", abort: ABORT, revertLane: revert } as LandOp];
    });
    const text = card("landed").textContent!;
    expect(text).toContain("Landed despite an abort attempt");
    expect(text).toContain("The room opened a revert lane");
  });

  test("aborted: established that it did not and cannot land", () => {
    withOps("#/room", (b) => [{ ...unresolved(b), state: "aborted", receipt: "act_91_aaaaaaaa", abort: ABORT } as LandOp]);
    expect(card("aborted").textContent).toContain("did not and cannot land");
  });

  test("the after-reservation note names the compromise exception", () => {
    location.hash = "#/room";
    render(<App adapter={new MockRoom({ step: STEP() })} />);
    expect(document.body.textContent).toContain("only a compromised-key revocation starts an abort attempt");
  });

  test("an admin's queue item describes the read-back it has", () => {
    withOps("#/needs-you", (b) => [{ ...unresolved(b), readBack: { main: "unexpected", observed: sha("f") } }], "@sam");
    const item = document.querySelector<HTMLElement>("[data-why='publication-unresolved']")!;
    expect(item.textContent).toContain("Main shows another writer");
    expect(item.textContent).not.toContain("pushes the same reserved commit forward");
  });
});

describe("terminal landing cards say why (review 82f2743b, P2.3)", () => {
  test("a refused failure shows its rule, reason and fix", () => {
    withOps("#/room", (b) => [
      { ...unresolved(b), state: "failed", receipt: "act_99_aaaaaaaa", reason: { code: "refused", refusal: { refused: true, rule: "required-security-policy", reason: "Required security approval missing.", fix: "Ask @maya to review." } } } as LandOp,
    ]);
    const alert = within(card("failed")).getByRole("alert");
    expect(alert.textContent).toContain("required-security-policy");
    expect(alert.textContent).toContain("Required security approval missing.");
    expect(alert.textContent).toContain("Ask @maya to review.");
  });

  test("a retryable outcome shows its reason and recorded fix", () => {
    withOps("#/room", (b) => [{ ...unresolved(b), state: "retryable", receipt: "act_99_aaaaaaaa", reason: "generation-moved", fix: "Land generation 3." } as LandOp]);
    const text = card("retryable").textContent!;
    expect(text).toContain("A newer generation was proposed");
    expect(text).toContain("Fix: Land generation 3.");
  });

  test("a conflict names its paths; a failed check links to the check", () => {
    withOps("#/room", (b) => [
      { ...unresolved(b), state: "failed", receipt: "act_99_aaaaaaaa", reason: { code: "conflict", paths: ["src/a.ts"] } } as LandOp,
      { ...unresolved(b), id: "op_land_2", state: "failed", receipt: "act_98_aaaaaaaa", reason: { code: "check-failed", check: "act_97_aaaaaaaa" } } as LandOp,
    ]);
    const cards = [...document.querySelectorAll<HTMLElement>("[data-op='failed']")];
    const conflict = cards.find((c) => c.textContent!.includes("conflicts"));
    const check = cards.find((c) => c.textContent!.includes("check failed"));
    expect(conflict!.textContent).toContain("conflicts with main on src/a.ts");
    expect(check!.textContent).toContain("a required check failed");
    expect(within(check!).getByRole("button", { name: "The failed check" })).toBeTruthy();
  });
});

describe("live sentences about unresolved publications state only recorded facts (review 88a20f74, P1)", () => {
  const FORWARD = "pushes the same reserved commit forward";
  const ABORT_99 = { trigger: "act_99_aaaaaaaa" as const, key: "key_compromised" as const, at: 99, tokenRevoked: true };
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
        entry(99, { type: "abort-attempt", op: op.id, attempt: ABORT_99 }),
        entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } }),
      ],
      { ...op, abort: ABORT_99 },
    );
    const text = r.snapshot()!.feed[1]!.text;
    expect(text).toContain("main read back as the expected main");
    expect(text).toContain("Now: Abort attempt in progress. The room no longer pushes this landing");
    expect(text).not.toContain(FORWARD);
    r.stop();
  });

  test("truncated history with a loaded abort: the abort still governs the sentence", async () => {
    const { op } = base();
    const r = await live([entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } })], { ...op, abort: ABORT_99 });
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
    const r = await live([entry(100, { type: "publication-unresolved", op: op.id, readBack: { main: "expected-main" } })], { ...op, abort: ABORT_99 });
    const why = await r.explain("act_100_00000064");
    expect(why!.title).toContain("Now: Abort attempt in progress");
    expect(why!.title).not.toContain(FORWARD);
    location.hash = "#/room";
    render(<App adapter={r} />);
    expect(screen.getByText(/Now: Abort attempt in progress/)).toBeTruthy();
    r.stop();
  });
});
