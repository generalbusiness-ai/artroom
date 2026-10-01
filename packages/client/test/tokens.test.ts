/**
 * Workspace credentials (R-WS-1 to R-WS-4, section 23 "B watches A's
 * workspace"): the operation is public, the write token is the holder's
 * alone, and no token appears in anything the client returns or logs.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Claim, Proposal, WorkspaceGrant } from "@generalbusiness/artroom-contract";
import { isArtroomError, isRefusal } from "../src/index.ts";
import type { FakeRoom } from "./support/fake-room.ts";
import { joinAs, sha, startRoom } from "./support/setup.ts";

let room: FakeRoom;
beforeEach(async () => {
  ({ room } = await startRoom());
});
afterEach(() => room.stop());

function ok<T>(value: unknown): T {
  if (isRefusal(value)) throw new Error(`refused: ${value.rule}`);
  return value as T;
}

describe("the workspace operation is public; its token is not (R-WS-1, R-WS-2)", () => {
  test("B reads and waits on A's workspace, sees the remote and no token, and is refused the token", async () => {
    const a = await joinAs(room, "@alice");
    const b = await joinAs(room, "@bob");
    const claim = ok<Claim>(await a.api.claim({ goal: "g", scope: ["src/**"] }));
    const op = ok<{ id: `op_${string}` }>(await a.api.workspace(claim));
    const seen = await b.api.wait({ id: op.id, kind: "workspace" }, { until: ["ready", "failed"] });
    expect(seen.state).toBe("ready");
    if (seen.state !== "ready") return;
    expect(seen.detail.remote).toMatch(/^https:\/\//);
    expect(JSON.stringify(seen)).not.toMatch(/token|art_v1_/);
    const refused = await b.api.workspaceToken(claim);
    expect(isRefusal(refused) && refused.rule).toBe("not-holder");
  });

  test("the holder's token request with an old lease is refused lease-fenced, and its old grant is revoked (R-WS-3)", async () => {
    const a = await joinAs(room, "@alice");
    const claim = ok<Claim>(await a.api.claim({ goal: "g", scope: ["src/**"] }));
    const op = ok<{ id: `op_${string}` }>(await a.api.workspace(claim));
    await a.api.wait({ id: op.id, kind: "workspace" }, { until: ["ready"] });
    const grant = ok<WorkspaceGrant>(await a.api.workspaceToken(claim));
    expect(room.grantValid(grant.token)).toBe(true);
    room.expire(claim.lane);
    expect(room.grantValid(grant.token)).toBe(false);
    const again = await a.api.workspaceToken(claim);
    expect(isRefusal(again) && again.rule).toBe("not-holder");
    // Expiry and take-over each start a new lease generation (R-LANE-6); the old one is fenced.
    const back = ok<Claim>(await a.api.claim({ lane: claim.lane, scope: ["src/**"], expectedGeneration: 0 }));
    expect(back.lease.generation).toBe(3);
    const fenced = await a.api.workspaceToken(claim);
    expect(isRefusal(fenced) && fenced.rule).toBe("lease-fenced");
  });

  test("a token requested before the operation is ready is refused workspace-not-ready", async () => {
    room.workspaceDelay = 1_000;
    const a = await joinAs(room, "@alice");
    const claim = ok<Claim>(await a.api.claim({ goal: "g", scope: ["src/**"] }));
    ok(await a.api.workspace(claim));
    const early = await a.api.workspaceToken(claim);
    expect(isRefusal(early) && early.rule).toBe("workspace-not-ready");
  });
});

describe("no token in any output (R-WS-4)", () => {
  test("tokens appear only in the grant and the join result: not in reads, updates, explain, errors or debug lines", async () => {
    const lines: string[] = [];
    const a = await joinAs(room, "@alice", "member", { log: (l) => lines.push(l) });
    const b = await joinAs(room, "@bob");
    const outputs: unknown[] = [];
    const claim = ok<Claim>(await a.api.claim({ goal: "g", scope: ["src/**"] }));
    const op = ok<{ id: `op_${string}` }>(await a.api.workspace(claim));
    outputs.push(await a.api.wait({ id: op.id, kind: "workspace" }, { until: ["ready"] }));
    const grant = ok<WorkspaceGrant>(await a.api.workspaceToken(claim));
    const p = ok<Proposal>(await a.api.propose(claim, { head: sha("a") as never, expectedGeneration: 0, summary: "s" }));
    outputs.push(p, await b.api.review(p, { verdict: "approve", scope: ["src/**"], text: "ok" }));
    outputs.push(await a.api.log({ limit: 500 }), await a.api.attention(), await b.api.attention(), await a.api.members());
    outputs.push(await a.api.explain(p.id), await a.api.subscribe(undefined, { waitMs: 0 }), await a.api.lanes());
    outputs.push(await a.api.op({ id: op.id, kind: "workspace" }));
    // A room that misbehaves and echoes the token in an error message: the client redacts it.
    room.faults.push({ route: "GET /members", kind: "status", status: 500, body: { name: "ArtroomError", code: "internal", message: `failed with ${grant.token}`, retryable: false } });
    try {
      await a.api.members();
    } catch (e) {
      expect(isArtroomError(e)).toBe(true);
      outputs.push(e);
    }
    const text = JSON.stringify(outputs) + lines.join("\n");
    expect(room.secrets().length).toBeGreaterThan(3);
    for (const secret of room.secrets()) expect(text).not.toContain(secret);
    expect(text).toContain("[redacted]");
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) expect(line).toMatch(/^(GET|POST) \/[a-z/%_0-9A-Z-]* (\d{3}|no response) \d+ms$/);
  });
});
