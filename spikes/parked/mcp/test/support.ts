import { connect, isRefusal, redeem } from "@generalbusiness/artroom-client";
import type { Redeemed } from "@generalbusiness/artroom-contract";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { createMcpFetch } from "../src/worker.ts";

export { FakeRoom };
export type Url = `https://${string}`;

/** A fake room whose `POST /mcp` route is this package's Worker handler. */
export async function roomWithMcp(): Promise<{ room: FakeRoom; url: Url; reads: Record<string, number> }> {
  const room = await FakeRoom.create();
  const url = (await room.start()) as Url;
  // A workspace is ready at the first read after it was asked for, with no second poll of the fake room. A test about
  // a pending workspace sets its own delay.
  room.workspaceDelay = 0;
  const reads: Record<string, number> = {};
  // The room as a service binding, counting the reads made through it.
  const service = {
    room: async () => {
      const wire = room.wire();
      return {
        ...wire,
        read: (session: never, query: { q: string }) => {
          reads[query.q] = (reads[query.q] ?? 0) + 1;
          return wire.read(session, query as never);
        },
      } as typeof wire;
    },
  };
  const fetchMcp = createMcpFetch<unknown>({
    // What the deployment's Worker does: a handle for the bearer, built on RoomWire. Acts go to bearerAct,
    // workspace requests to bearerRequest, reads use the token (R-CRED-10). A bad token yields null.
    async room(_request, _env, bearer) {
      return connect(service, room.id, { kind: "bearer", token: bearer }).catch(() => null);
    },
    // What the Room gives its endpoint for `tools/list`: the bearer's role and signed grant, read now (R-API-14).
    caller: (_request, _env, bearer) => room.bearerCaller(bearer),
  });
  room.mcp = (request) => fetchMcp(request, {});
  return { room, url, reads };
}

export async function agent(room: FakeRoom, url: Url, handle: `@${string}` = "@builder"): Promise<Redeemed> {
  const { invitation, secret } = await room.invite(handle, { role: "agent", custody: "room" });
  const out = await redeem({ url }, room.id, { invitation, secret });
  if (isRefusal(out)) throw new Error(out.rule);
  return out;
}

const ACT_TOOL_NAMES = ["claim", "propose", "note", "review", "land", "renew", "release", "act"];
let keys = 0;
/**
 * The arguments of a tool call, with an idempotency key where the tool is
 * an act tool and the test gave none: every act tool requires one (R-API-9,
 * amendment 7). A test about the key itself gives its own, or uses `rpc`.
 */
export function keyed(name: string, args: unknown): unknown {
  if (!ACT_TOOL_NAMES.includes(name) || typeof args !== "object" || args === null || "idempotencyKey" in args) return args;
  return { ...args, idempotencyKey: `test-key-${++keys}` };
}

let rpcId = 0;
/** One raw JSON-RPC call to the MCP endpoint. */
export async function rpc(url: string, bearer: string | undefined, method: string, params: unknown = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  const data = text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
  return { status: res.status, body: data ? JSON.parse(data) : null };
}
