/**
 * Review 82f2743b: findings P1.2 to P2.6, each branch rendered.
 * (P1.1 is covered in policy-runtime.test.ts.)
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/app.tsx";
import type { RoomSnapshot, Why } from "../src/room/adapter.ts";
import type { ActId, Cursor, HttpRoom, LandOp, Lane, LogEntry, Proposal, Sha } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { AppContext } from "../src/ui/context.ts";
import { WhyDialog } from "../src/ui/WhyDialog.tsx";
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

describe("P1.2 publication recovery follows the recorded read-back and abort facts", () => {
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

describe("P2.3 terminal landing cards say why", () => {
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

describe("P2.4 note threads stay bound to their recorded head", () => {
  const LANE_GOAL = "Rate-limit /api/login";

  async function openGen(mock: MockRoom, generation: number) {
    const lane = mock.snapshot().lanes.find((l) => l.goal === LANE_GOAL)!;
    location.hash = `#/lane/${lane.lane}/${generation}`;
    render(<App adapter={mock} />);
    await waitFor(() => expect(document.querySelector("[data-file='src/api/login.ts']")).not.toBeNull());
    return document.querySelector<HTMLElement>("[data-file='src/api/login.ts']")!;
  }

  test("with every interdiff known and the file unchanged, the thread is placed on the line and says why", async () => {
    const file = await openGen(new MockRoom({ step: 22 }), 2);
    const row = file.querySelector<HTMLElement>("tr.thread")!;
    expect(row.textContent).toContain("Written on generation 1");
    expect(row.textContent).toContain("The file is unchanged from that head to this one.");
  });

  test("with the interdiff unavailable, the thread stays on its own head and the relation is unknown", async () => {
    const mock = new MockRoom({ step: 22 });
    vi.spyOn(mock, "changedSince").mockReturnValue(null);
    const file = await openGen(mock, 2);
    expect(file.querySelector("tr.thread")).toBeNull();
    const held = file.querySelector<HTMLElement>("[data-relation='unknown']")!;
    expect(held.textContent).toContain("On generation 1");
    expect(held.textContent).toContain("line 15");
    expect(held.textContent).toContain("is not known here");
    expect(file.textContent).not.toContain("unchanged from that head");
  });

  test("a file changed in an earlier generation and unchanged in the latest is not projected", async () => {
    const mock = new MockRoom({ step: 22 });
    const snap = mock.snapshot();
    const lane = snap.lanes.find((l) => l.goal === LANE_GOAL)!;
    const g2 = snap.proposals.find((p) => p.lane === lane.lane && p.generation === 2)!;
    const g3: Proposal = { ...g2, generation: 3, head: sha("3"), id: "act_200_aaaaaaaa" };
    vi.spyOn(mock, "snapshot").mockReturnValue({ ...snap, proposals: [...snap.proposals, g3], lanes: snap.lanes.map((l) => (l.lane === lane.lane ? { ...l, generation: 3 } : l)) });
    vi.spyOn(mock, "changedSince").mockImplementation((ref) => (ref.generation === 2 ? ["src/api/login.ts"] : ref.generation === 3 ? ["src/lib/authz/check.ts"] : null));
    vi.spyOn(mock, "diff").mockImplementation((ref) => MockRoom.prototype.diff.call(mock, { ...ref, generation: Math.min(ref.generation, 2) }));
    const file = await openGen(mock, 3);
    expect(file.querySelector("tr.thread")).toBeNull();
    expect(file.querySelector<HTMLElement>("[data-relation='changed']")!.textContent).toContain("This file changed since that head");
  });
});

describe("P2.5 the why dialog shows the explanation of the act it was asked for", () => {
  function setup() {
    const mock = new MockRoom();
    const ids = mock.snapshot().feed.slice(0, 2).map((f) => f.id) as [ActId, ActId];
    const why = (act: ActId, title: string): Why => ({ act, seq: 1, by: "@sam", title, outcome: "accepted", decisions: [], invariants: [], reasons: [], published: false });
    const state = { adapter: mock, snap: mock.snapshot(), why: () => {} };
    const view = (id: ActId | null) => (
      <AppContext.Provider value={state}>
        <WhyDialog act={id} onClose={() => {}} />
      </AppContext.Provider>
    );
    return { mock, ids, why, view };
  }

  test("a late answer for an earlier request does not replace the current one", async () => {
    const { mock, ids, why, view } = setup();
    let resolveA!: (v: Why) => void;
    let resolveB!: (v: Why) => void;
    const pa = new Promise<Why>((r) => (resolveA = r));
    const pb = new Promise<Why>((r) => (resolveB = r));
    vi.spyOn(mock, "explain").mockImplementation((id) => (id === ids[0] ? pa : pb));
    const { rerender } = render(view(ids[0]));
    rerender(view(null));
    rerender(view(ids[1]));
    resolveB(why(ids[1], "Explanation B"));
    await screen.findByText("Explanation B");
    resolveA(why(ids[0], "Explanation A"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Explanation A")).toBeNull();
    expect(screen.getByText("Explanation B")).toBeTruthy();
  });

  test("a failed explain shows a recoverable error, and trying again works", async () => {
    const { mock, ids, why, view } = setup();
    const explain = vi.spyOn(mock, "explain").mockRejectedValueOnce({ name: "ArtroomError", message: "unavailable" }).mockResolvedValueOnce(why(ids[0], "Explanation A"));
    render(view(ids[0]));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The room did not explain this entry: unavailable.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByText("Explanation A");
    expect(explain).toHaveBeenCalledTimes(2);
  });
});

describe("P2.6 partial live reads are shown as partial", () => {
  function fake(opts: { more: boolean }) {
    const mock = new MockRoom().snapshot();
    const lane: Lane = { ...mock.lanes[0]!, lane: "act_9_aaaaaaaa", overlaps: [], generations: [], generation: 0 };
    const entry: LogEntry = {
      format: "artroom-log-v1",
      seq: 1000,
      prev: `sha256:${"0".repeat(64)}`,
      at: "2026-10-01T09:00:00Z",
      hash: `sha256:aaaaaaaa${"1".repeat(56)}`,
      roomSig: "sig",
      entry: {
        type: "act",
        act: { envelope: { v: 1, room: mock.room.id, actor: "key_x", kind: "claim", target: null, body: { goal: "Rate-limit /api/login", scope: ["src/api/login.ts"] }, idempotencyKey: "k1" }, sig: "s" },
        receipt: { outcome: "accepted", authority: { via: "member", member: "@ash", role: "agent", key: "key_x" }, decisions: [], effects: [], flags: [] },
      },
    };
    const calls = { lanes: 0, attention: 0, log: 0 };
    const room = {
      id: mock.room.id,
      name: "acme/web",
      members: async () => ({ at: 9, members: [{ handle: "@maya", role: "maintainer", teams: [], keys: [], state: "active", joined: 2 }], teams: {}, delegations: [], recovery: "key_r", soleAdmin: false }),
      lanes: async () => (calls.lanes++, { items: [lane], cursor: "c" as Cursor, more: opts.more }),
      attention: async () => (calls.attention++, { items: [], cursor: "c" as Cursor, more: opts.more }),
      log: async () => (calls.log++, { acts: [entry], cursor: "c" as Cursor, more: opts.more, publishedThrough: 500, head: 1000 }),
      proposal: async () => null,
      op: async () => {
        throw new Error("no ops");
      },
      explain: async () => null,
      watch: () => ({ cursor: "c" as Cursor, close: () => {}, [Symbol.dispose]: () => {} }),
    };
    return { room: room as unknown as HttpRoom, calls };
  }

  test("cursors are followed until they stop advancing, and the snapshot says what is missing", async () => {
    const f = fake({ more: true });
    const live = new LiveRoom(f.room, "@maya");
    await live.start();
    const s = live.snapshot()!;
    expect(f.calls.lanes).toBe(2); // the second page returned the same cursor
    expect(f.calls.attention).toBe(2);
    expect(s.coverage).toEqual({ lanes: false, attention: false, feed: { from: 501, complete: false } });
    expect(s.slot).toBeNull();
    expect(s.log).toEqual({ head: 1000, publishedThrough: 500 });
  });

  test("the screens claim nothing beyond what was read", async () => {
    const live = new LiveRoom(fake({ more: true }).room, "@maya");
    await live.start();
    location.hash = "#/room";
    render(<App adapter={live} />);
    const status = screen.getByRole("region", { name: "Room status" }).textContent!;
    expect(status).not.toContain("All published");
    expect(status).toContain("500 entries not yet published");
    expect(status).toContain("through entry 500 of 1000");
    expect(document.querySelector("[data-slot='unavailable']")!.textContent).toContain("It may be free or held.");
    expect(document.querySelector("[data-partial='lanes']")).not.toBeNull();
    expect(document.querySelector("[data-partial='feed']")!.textContent).toContain("Entries before 501 are not loaded.");
    expect(screen.queryByText("No lanes yet. An agent or a person opens one with a claim.")).toBeNull();
    location.hash = "#/needs-you";
    await screen.findByText(/this list is not complete/);
    expect(screen.queryByText("Nothing needs you right now")).toBeNull();
    expect(document.querySelector(".nav .count")!.textContent).toBe("0+");
  });

  test("a complete read with no held landing still does not claim the slot is free", async () => {
    const live = new LiveRoom(fake({ more: false }).room, "@maya");
    await live.start();
    expect(live.snapshot()!.coverage.lanes).toBe(true);
    expect(live.snapshot()!.slot).toBeNull();
  });
});
