/**
 * The HTTPS routes (R-API-3, `HttpRoutes`). Refusals are 409 with a
 * `Refusal` body; failures use the status table of R-API-1. Every response
 * is `Cache-Control: no-store`, so no cache ever holds a grant or a token
 * (R-WS-4).
 */

import type { Genesis, ReadQuery, RoomId, Sha } from "@generalbusiness/artroom-contract";
import { isArtroomError, isRefusal } from "@generalbusiness/artroom-contract";
import { STAMP } from "@generalbusiness/artroom-policy";
import { parseStrict, utf8 } from "./canonical.ts";
import type { RoomEnv } from "./config.ts";
import { b64url, hmacSha256, keyPairFromSeed, randomToken } from "./crypto.ts";
import { artroomError, HTTP_STATUS, toArtroomError, unwire, type Wire } from "./errors.ts";
import { iso, RE, roomIdOf } from "./ids.ts";
import type { Room } from "./room.ts";
import { isPlainObject } from "./schema.ts";

const NO_STORE = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

function respond(value: unknown): Response {
  return isRefusal(value) ? json(value, 409) : json(value, 200);
}

function failure(e: unknown): Response {
  const err = toArtroomError(e);
  return json(err, HTTP_STATUS[err.code]);
}

type RoomStub = DurableObjectStub<Room>;

/** The room's Durable Object, by room ID or by name (R-ID-3). */
export async function roomStub(env: RoomEnv, room: string): Promise<RoomStub> {
  let id = room;
  if (!RE.roomId.test(room)) {
    const names = env.NAMES.get(env.NAMES.idFromName(room)) as unknown as { get(): Promise<RoomId | null> };
    const found = await names.get();
    if (!found) throw artroomError("not-found", `There is no room named ${room}.`);
    id = found;
  }
  return env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as RoomStub;
}

async function body(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > 1024 * 1024) throw artroomError("payload-too-large", "The request body is larger than 1 MiB.");
  const text = await req.text();
  if (text.length > 1024 * 1024) throw artroomError("payload-too-large", "The request body is larger than 1 MiB.");
  try {
    return parseStrict(text);
  } catch (e) {
    throw artroomError("bad-request", `The body is not valid JSON in the signed profile: ${(e as Error).message}`);
  }
}

function bearerOf(req: Request): string {
  const h = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/.exec(h);
  if (!m) throw artroomError("unauthenticated", "A session or bearer token is required in the Authorization header.");
  return m[1]!;
}

function intParam(url: URL, name: string): number | undefined {
  const v = url.searchParams.get(name);
  if (v === null) return undefined;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw artroomError("bad-request", `${name} must be an integer.`);
  return n;
}

// ------------------------------------------------------------ room creation (addition: not in HttpRoutes)

const ROOM_KEY_DOMAIN = "artroom-room-key-v1\n";

function roomSeed(env: RoomEnv, draft: string): Uint8Array {
  if (!env.ROOM_KEY_SECRET) throw artroomError("unavailable", "This deployment has no ROOM_KEY_SECRET, so it cannot found rooms.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(draft)) throw artroomError("bad-request", "The draft is not valid.");
  return hmacSha256(utf8(env.ROOM_KEY_SECRET), utf8(ROOM_KEY_DOMAIN + draft));
}

/** Step 1 of founding: the genesis object to sign, with a room key the Worker derives (R-GEN-1). */
export function draftRoom(env: RoomEnv, input: unknown, now: number): { readonly genesis: Genesis; readonly draft: string } {
  if (!isPlainObject(input)) throw artroomError("bad-request", "The draft must be an object.");
  const { name, repo, admin, recovery } = input as Record<string, unknown>;
  if (typeof name !== "string" || !name || name.length > 128) throw artroomError("bad-request", "name must be 1 to 128 characters.");
  if (typeof repo !== "string" || !repo || repo.length > 256) throw artroomError("bad-request", "repo must be 1 to 256 characters.");
  if (!isPlainObject(admin) || typeof admin["handle"] !== "string" || !RE.handle.test(admin["handle"]) || typeof admin["key"] !== "string" || !RE.keyId.test(admin["key"]))
    throw artroomError("bad-request", "admin must have a handle and a key ID.");
  if (typeof recovery !== "string" || !RE.keyId.test(recovery)) throw artroomError("bad-request", "recovery must be a key ID.");
  const draft = randomToken();
  const roomKey = keyPairFromSeed(roomSeed(env, draft)).key;
  const genesis: Genesis = {
    format: "artroom-log-v1",
    name,
    repo,
    admin: { handle: admin["handle"] as `@${string}`, key: admin["key"] as `key_${string}` },
    recovery: recovery as `key_${string}`,
    roomKey,
    profile: { policy: "artroom-jsonata-v1", jsonata: STAMP.jsonata },
    createdAt: iso(now),
  };
  return { genesis, draft };
}

/** Step 2 of founding: the first admin's signature over the genesis. */
export async function foundRoom(env: RoomEnv, genesis: Genesis, sig: string, draft: string): Promise<RoomId> {
  const seed = roomSeed(env, draft);
  if (keyPairFromSeed(seed).key !== genesis.roomKey) throw artroomError("bad-request", "The genesis does not match the draft.");
  const id = roomIdOf(genesis);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as RoomStub;
  const room = unwire((await stub.found(genesis, sig, b64url(seed))) as Wire<RoomId>);
  const names = env.NAMES.get(env.NAMES.idFromName(genesis.name)) as unknown as { set(r: RoomId): Promise<void> };
  await names.set(room);
  return room;
}

// ------------------------------------------------------------ the router

export async function route(req: Request, env: RoomEnv): Promise<Response> {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== "v1" || parts[1] !== "rooms") return failure(artroomError("not-found", "No such route."));
    if (parts.length === 2 && req.method === "POST") return json(draftRoom(env, await body(req), Date.now()));
    if (parts.length === 3 && parts[2] === "found" && req.method === "POST") {
      const b = (await body(req)) as { genesis?: Genesis; sig?: string; draft?: string };
      if (!isPlainObject(b) || !isPlainObject(b.genesis) || typeof b.sig !== "string" || typeof b.draft !== "string") throw artroomError("bad-request", "Send genesis, sig and draft.");
      return json({ room: await foundRoom(env, b.genesis, b.sig, b.draft) });
    }
    const room = parts[2];
    if (!room) return failure(artroomError("not-found", "No such route."));
    const rest = parts.slice(3);
    const stub = await roomStub(env, room);
    const m = req.method;
    const one = rest.length === 1 ? rest[0] : null;

    if (m === "POST" && one === "acts") return respond(unwire(await stub.submit(await body(req))));
    if (m === "POST" && one === "requests") return respond(unwire(await stub.request(await body(req))));
    if (m === "POST" && one === "redeem") return respond(unwire(await stub.redeem(await body(req), req.headers.get("CF-Connecting-IP") ?? "unknown")));
    if (m === "POST" && one === "mcp") return failure(artroomError("not-found", "The MCP endpoint is served by the MCP package, not this one."));
    if (m === "GET" && one === "ws") {
      if (req.headers.get("Upgrade") !== "websocket") throw artroomError("bad-request", "This route needs a WebSocket upgrade.");
      return stub.fetch(req);
    }
    if (m !== "GET") return failure(artroomError("not-found", "No such route."));

    const token = bearerOf(req);
    const readQ = async (q: ReadQuery) => unwire((await stub.read(token, q)) as Wire<unknown>);
    if (one === "lanes") {
      const filter = {
        ...(url.searchParams.get("state") ? { state: url.searchParams.get("state") as "held" | "unheld" } : {}),
        ...(url.searchParams.get("holder") ? { holder: url.searchParams.get("holder") as `@${string}` } : {}),
        ...(url.searchParams.get("touches") ? { touches: url.searchParams.get("touches")! } : {}),
        ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor") as never } : {}),
        ...(intParam(url, "limit") !== undefined ? { limit: intParam(url, "limit")! } : {}),
      };
      return json(await readQ({ q: "lanes", filter }));
    }
    if (rest[0] === "lanes" && rest.length === 2) {
      const lane = await readQ({ q: "lane", lane: rest[1] as `act_${number}_${string}` });
      return lane ? json(lane) : failure(artroomError("not-found", `There is no lane ${rest[1]}.`));
    }
    if (rest[0] === "lanes" && rest.length === 3) {
      const p = await readQ({ q: "proposal", ref: { lane: rest[1] as `act_${number}_${string}`, generation: Number(rest[2]) } });
      return p ? json(p) : failure(artroomError("not-found", "There is no such proposal."));
    }
    if (rest[0] === "ops" && rest.length === 2) {
      const until = url.searchParams.get("until");
      const timeoutMs = intParam(url, "timeoutMs");
      return json(await readQ({ q: "op", op: rest[1] as `op_${string}`, ...(until ? { until: until.split(",") } : {}), ...(timeoutMs !== undefined ? { timeoutMs } : {}) }));
    }
    if (one === "attention") {
      const cursor = url.searchParams.get("cursor");
      const limit = intParam(url, "limit");
      return json(await readQ({ q: "attention", page: { ...(cursor ? { cursor: cursor as never } : {}), ...(limit !== undefined ? { limit } : {}) } }));
    }
    if (one === "log") {
      const cursor = url.searchParams.get("cursor");
      const after = intParam(url, "after");
      const limit = intParam(url, "limit");
      return json(await readQ({ q: "log", req: { ...(cursor ? { cursor: cursor as never } : {}), ...(after !== undefined ? { after } : {}), ...(limit !== undefined ? { limit } : {}) } }));
    }
    if (rest[0] === "explain" && rest.length === 2) {
      const e = await readQ({ q: "explain", act: rest[1] as `act_${number}_${string}` });
      return e ? json(e) : failure(artroomError("not-found", "There is no such entry."));
    }
    if (one === "members") return json(await readQ({ q: "members" }));
    if (one === "subscribe") {
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const waitMs = intParam(url, "waitMs") ?? 25_000;
      return json(unwire(await stub.poll(token, cursor, waitMs)));
    }
    return failure(artroomError("not-found", "No such route."));
  } catch (e) {
    if (isArtroomError(e)) return failure(e);
    return failure(e);
  }
}

export type { Sha };
