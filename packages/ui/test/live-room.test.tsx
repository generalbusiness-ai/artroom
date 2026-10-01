import { cleanup, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/app.tsx";
import type { Cursor, HttpRoom, Lane, LogEntry, Proposal, Sha, Update } from "../src/room/contract.ts";
import { isRefusal } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";

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
      await new Promise((r) => setTimeout(r, 10));
      expect(container.innerHTML).not.toContain(SECRET);
    }
    expect(container.textContent).toContain("This room cannot show the diff yet.");
    expect(f.calls).not.toContain("workspaceToken");
  });
});
