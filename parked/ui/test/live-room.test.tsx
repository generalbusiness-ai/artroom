import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/app.tsx";
import type { CheckCarriedEvent } from "../src/room/adapter.ts";
import type { Cursor, HttpRoom, Lane, LogEntry, Proposal, Sha, Update } from "../src/room/contract.ts";
import { isRefusal } from "../src/room/contract.ts";
import { describeEntry } from "../src/room/live/describe.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { settled, waitFor } from "./helpers.tsx";

const SECRET = "artifacts-write-token-DO-NOT-SHOW";
const sha = (c: string) => c.repeat(40) as Sha;
const LANE = "act_9_aaaaaaaa" as const;

/** A fake HttpRoom: enough of the contract's surface for the adapter, plus a token it must never ask for. */
function fakeRoom() {
  const calls: string[] = [];
  let onUpdate: ((u: Update) => void) | null = null;
  const mock = new MockRoom().snapshot();
  const lane: Lane = { ...mock.lanes[0]!, lane: LANE, overlaps: [], generations: [{ generation: 1, head: sha("a"), act: "act_13_bbbbbbbb" }], generation: 1 };
  const proposal: Proposal = { ...mock.proposals[0]!, lane: LANE, generation: 1 };
  const claimEntry: LogEntry = {
    format: "artroom-log-v1",
    seq: 9,
    prev: `sha256:${"0".repeat(64)}`,
    at: "2026-10-01T09:00:00Z",
    hash: `sha256:aaaaaaaa${"1".repeat(56)}`,
    roomSig: "sig",
    entry: {
      type: "act",
      act: {
        envelope: { v: 1, room: mock.room.id, actor: "key_x", kind: "claim", target: null, body: { goal: "Rate-limit /api/login", scope: ["src/api/login.ts"] }, idempotencyKey: "k1" },
        sig: "s",
      },
      receipt: { outcome: "accepted", authority: { via: "member", member: "@ash", role: "agent", key: "key_x" }, decisions: [], effects: [], flags: [] },
    },
  };
  const room = {
    id: mock.room.id,
    name: "acme/web",
    members: async () => ({ at: 9, members: [{ handle: "@maya", role: "maintainer", teams: ["@security"], keys: [], state: "active", joined: 2 }, { handle: "@ash", role: "agent", teams: [], keys: [], state: "active", joined: 4 }], teams: {}, delegations: [], recovery: "key_r", soleAdmin: false }),
    lanes: async () => ({ items: [lane], cursor: "c" as Cursor, more: false }),
    proposal: async () => proposal,
    op: async () => {
      throw new Error("no ops");
    },
    attention: async () => ({ items: [], cursor: "c" as Cursor, more: false }),
    log: async () => ({ acts: [claimEntry], cursor: "c" as Cursor, more: false, publishedThrough: 9, head: 9 }),
    explain: async () => null,
    workspaceToken: async () => {
      calls.push("workspaceToken");
      return { op: "op_ws_1", lane: LANE, leaseGeneration: 1, remote: "https://example.invalid/r", token: SECRET, expiresAt: "2026-10-01T10:00:00Z" };
    },
    review: async () => ({ refused: true, rule: "not-authorized-reviewer", reason: "Not a reviewer here.", fix: "Ask @security." }),
    watch: (_c: Cursor | undefined, fn: (u: Update) => void) => {
      calls.push("watch");
      onUpdate = fn;
      return { cursor: "c" as Cursor, close: () => calls.push("close"), [Symbol.dispose]: () => {} };
    },
  };
  return { room: room as unknown as HttpRoom, calls, push: () => onUpdate?.({ cursor: "c2" as Cursor, entries: [], attention: [], publishedThrough: 9 }) };
}

afterEach(() => {
  cleanup();
  location.hash = "";
});

describe("live adapter (stub over HttpRoom)", () => {
  test("loads a snapshot from the contract's reads and follows the WebSocket", async () => {
    const f = fakeRoom();
    const live = new LiveRoom(f.room, "@maya", () => new Date("2026-10-01T09:30:00Z"));
    await live.start();
    const s = live.snapshot()!;
    expect(s.source.kind).toBe("live");
    expect(s.lanes.map((l) => l.goal)).toEqual(["Rate-limit /api/login"]);
    expect(s.feed[0]!.text).toBe("@ash claimed “Rate-limit /api/login”.");
    expect(s.feed[0]!.id).toBe("act_9_aaaaaaaa");
    expect(s.people.find((p) => p.handle === "@ash")!.kind).toBe("agent");
    expect(f.calls).toContain("watch");
    let notified = 0;
    live.subscribe(() => notified++);
    f.push();
    await waitFor(() => expect(notified).toBeGreaterThan(0));
    live.stop();
    expect(f.calls).toContain("close");
  });

  test("what the contract cannot serve yet is reported, not guessed", async () => {
    const live = new LiveRoom(fakeRoom().room, "@maya");
    await live.start();
    expect(await live.diff({ lane: LANE, generation: 1 })).toBeNull();
    expect(live.snapshot()!.policy.document).toBeNull();
    const r = await live.dryRun({ kind: "global-input", paths: ["x/**"] });
    expect(isRefusal(r) && r.rule).toBe("dry-run-unavailable");
  });

  test("the UI renders a live room and never asks for or shows a workspace token", async () => {
    const f = fakeRoom();
    const live = new LiveRoom(f.room, "@maya");
    await live.start();
    location.hash = "#/room";
    const { container } = render(<App adapter={live} />);
    await screen.findByText("Rate-limit /api/login", { selector: "a" });
    for (const hash of ["#/needs-you", "#/policy", `#/lane/${LANE}/1`]) {
      location.hash = hash;
      await settled();
      expect(container.innerHTML).not.toContain(SECRET);
    }
    await screen.findByText("This room cannot show the diff yet.");
    expect(f.calls).not.toContain("workspaceToken");
  });
});

describe("partial live reads are shown as partial (review 82f2743b, P2.6)", () => {
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

function systemEntry(seq: number, event: LogEntry["entry"] & { type: "system" }): LogEntry {
  return { format: "artroom-log-v1", seq, prev: `sha256:${"0".repeat(64)}`, at: "2026-10-01T09:30:00Z", hash: `sha256:cccccccc${String(seq).padStart(56, "0")}`, roomSig: "sig", entry: event };
}

const LIVE_EVENTS: CheckCarriedEvent[] = [
  {
    type: "check-carried",
    op: "op_land_40",
    lane: "act_9_aaaaaaaa",
    generation: 2,
    integration: sha("d"),
    obligation: "obl_tests",
    act: "act_31_bbbbbbbb",
    policy: "act_1_cccccccc",
    outcome: { carried: true, reason: { code: "tree-identical", tree: sha("e"), config: `sha256:${"1".repeat(64)}`, runner: `sha256:${"2".repeat(64)}`, text: "the tree is the same" } },
    decisions: [],
  },
  {
    type: "check-carried",
    op: "op_land_40",
    lane: "act_9_aaaaaaaa",
    generation: 2,
    integration: sha("d"),
    obligation: "obl_lint",
    act: "act_32_dddddddd",
    policy: "act_1_cccccccc",
    outcome: { carried: false, notCarried: { act: "act_32_dddddddd", code: "runner-changed", text: "No runner environment is pinned." } },
    decisions: [],
  },
];

function liveRoom(): HttpRoom {
  const entries = LIVE_EVENTS.map((event, i) => systemEntry(41 + i, { type: "system", event }));
  const room = {
    id: "room_live",
    name: "acme/web",
    members: async () => ({ at: 42, members: [], teams: {}, delegations: [], recovery: "key_r", soleAdmin: false }),
    lanes: async () => ({ items: [], cursor: "c" as Cursor, more: false }),
    attention: async () => ({ items: [], cursor: "c" as Cursor, more: false }),
    log: async () => ({ acts: entries, cursor: "c" as Cursor, more: false, publishedThrough: 42, head: 42 }),
    explain: async () => null,
    watch: (_c: Cursor | undefined, _fn: (u: Update) => void) => ({ cursor: "c" as Cursor, close: () => {}, [Symbol.dispose]: () => {} }),
  };
  return room as unknown as HttpRoom;
}

describe("a live room's check-carried events (R-CARRY-13)", () => {
  test("describes check-carried events, carried and not, in plain sentences", () => {
    const [carried, not] = LIVE_EVENTS.map((event, i) => describeEntry(systemEntry(41 + i, { type: "system", event })));
    expect(carried!.kind).toBe("check-carried");
    expect(carried!.text).toBe("The check in entry 31 carried to integration ddddddd (generation 2) because the tree is the same.");
    expect(carried!.lane).toBe("act_9_aaaaaaaa");
    expect(carried!.op).toBe("op_land_40");
    expect(not!.text).toBe("The check in entry 32 did not carry to integration ddddddd (generation 2). No runner environment is pinned.");
  });

  test("loads check-carried events from the log and shows them in the feed", async () => {
    const live = new LiveRoom(liveRoom(), "@maya");
    await live.start();
    const s = live.snapshot()!;
    expect(s.checkCarries.map((c) => [c.seq, c.event.outcome.carried])).toEqual([
      [41, true],
      [42, false],
    ]);
    location.hash = "#/room";
    render(<App adapter={live} />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Activity" }).textContent).toContain("did not carry to integration ddddddd"));
    live.stop();
  });

});
