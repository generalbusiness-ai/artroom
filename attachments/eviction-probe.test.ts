import { expect, test } from "vitest";
import { writeFileSync } from "node:fs";
import { canonicalize, isRefusal, type PreparedAct } from "./packages/client/src/index.ts";
import { CODE_REVIEW_ACTS } from "./packages/policy/src/declared.ts";
import { FakeRoom } from "./packages/client/test/support/fake-room.ts";
import { caught, joinAs, startRoom } from "./packages/client/test/support/setup.ts";

test("65 unresolved accepted named acts preserve the oldest retry across activation, as a retained-key control does", async () => {
  const { room } = await startRoom();
  try {
    const { api } = await joinAs(room, "@alice", "member", { retries: 0 });
    const saved: PreparedAct[] = [];
    const losses: unknown[] = [];
    for (let i = 0; i < 65; i++) {
      room.faults.push({ route: "POST /acts", kind: "drop", times: 1 });
      losses.push(await caught(api.claim({ goal: `goal-${i}`, scope: [`src/task_${i}/**`] }, {
        idempotencyKey: `evict-${i}`,
        onPrepared: (p) => void (saved[i] = JSON.parse(JSON.stringify(p))),
      })));
    }
    const claims = () => room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "claim");
    const originals = claims();
    expect(originals).toHaveLength(65);
    expect(losses).toHaveLength(65);
    expect(losses.every((e) => (e as { maybeRecorded?: boolean }).maybeRecorded === true)).toBe(true);
    await room.activate({ ...CODE_REVIEW_ACTS });
    const stale = await api.note({ act: FakeRoom.idOf(originals[0]!) }, { text: "invalidate named vocabulary" }, { idempotencyKey: "stale-seam" });
    expect(stale).toMatchObject({ refused: true, rule: "binding-stale" });
    let retainedPrepared: PreparedAct | undefined;
    const retained = await api.claim({ goal: "goal-1", scope: ["src/task_1/**"] }, {
      idempotencyKey: "evict-1", onPrepared: (p) => void (retainedPrepared = p),
    });
    expect(isRefusal(retained)).toBe(false);
    expect((retained as { id: string }).id).toBe(FakeRoom.idOf(originals[1]!));
    expect(canonicalize(retainedPrepared)).toBe(canonicalize(saved[1]));
    let oldestPrepared: PreparedAct | undefined;
    const oldest = await api.claim({ goal: "goal-0", scope: ["src/task_0/**"] }, {
      idempotencyKey: "evict-0", onPrepared: (p) => void (oldestPrepared = p),
    });
    // Diagnostic control: retaining the original prepared act externally restores the exact receipt.
    const direct = await api.replay(saved[0]!);
    expect(isRefusal(direct)).toBe(false);
    expect((direct as { id: string }).id).toBe(FakeRoom.idOf(originals[0]!));
    expect(claims()).toHaveLength(65);
    const observations = {
      head: "c38c23ce3760f041d75678cf6c5d4c109c62e5da", fidelity: "exact client against its unchanged FakeRoom HTTPS seam; no real Room or provider",
      losses, acceptedClaimsBefore: originals.length, stale,
      retained: { saved: saved[1], preparedOnRetry: retainedPrepared, savedCanonical: canonicalize(saved[1]), retryCanonical: canonicalize(retainedPrepared), result: retained },
      oldest: { saved: saved[0], preparedOnRetry: oldestPrepared, savedCanonical: canonicalize(saved[0]), retryCanonical: canonicalize(oldestPrepared), result: oldest, exactExternalReplay: direct },
      claimCountAfter: claims().length,
      actPosts: room.requests.filter((r) => r.method === "POST" && r.route === "/acts"),
    };
    writeFileSync(new URL("../observations.json", import.meta.url), JSON.stringify(observations, null, 2) + "\n");
    // Required behavior: repeating the oldest unresolved key still returns its original accepted receipt.
    expect(isRefusal(oldest), "oldest unresolved intent was silently evicted and rebuilt under a new vocabulary").toBe(false);
    expect((oldest as { id: string }).id).toBe(FakeRoom.idOf(originals[0]!));
  } finally {
    await room.stop();
  }
});
