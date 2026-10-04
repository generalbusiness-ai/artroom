/**
 * The HTTPS routes (R-API-3, `HttpRoutes`). Refusals are 409 with a
 * `Refusal` body; failures use the status table of R-API-1. Every response
 * is `Cache-Control: no-store`, so no cache ever holds a grant or a token
 * (R-WS-4).
 */

import type { ReadQuery, Sha } from "@generalbusiness/artroom-contract";
import { isArtroomError, isRefusal } from "@generalbusiness/artroom-contract";
import { parseStrict } from "./canonical.ts";
import { clock, type RoomEnv } from "./config.ts";
import { report, toConsole, type DiagnosisSink } from "./diag.ts";
import { artroomError, HTTP_STATUS, toArtroomError, unwire, type Wire } from "./errors.ts";
import { draftRoom, foundRoom } from "./founding.ts";
import { RE } from "./ids.ts";
import { registry } from "./registry.ts";
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

/** The room's Durable Object, by room ID or by name through the registry (R-GEN-11). */
export async function roomStub(env: RoomEnv, room: string): Promise<RoomStub> {
  let id = room;
  if (!RE.roomId.test(room)) {
    const found = await registry(env).lookup(room);
    if (!found) throw artroomError("not-found", `There is no room named ${room}.`);
    id = found.room;
  }
  return env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as RoomStub;
}

/** The largest request body any route reads. */
const MAX_BODY = 1024 * 1024;

/**
 * The body's bytes, counted as they stream in: past `MAX_BODY` the read
 * stops and the request is refused, whatever `Content-Length` said or
 * whether it was sent at all (request 55be0661).
 */
async function bodyText(req: Request): Promise<string> {
  const tooLarge = () => artroomError("payload-too-large", "The request body is larger than 1 MiB.");
  if (Number(req.headers.get("Content-Length") ?? "0") > MAX_BODY) throw tooLarge();
  if (req.body === null) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function body(req: Request): Promise<unknown> {
  const text = await bodyText(req);
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

// ------------------------------------------------------------ the router

/** `log` takes a failure that is not an `ArtroomError`, which the client sees only as `internal` (request d268d249). */
export async function route(req: Request, env: RoomEnv, log: DiagnosisSink = toConsole): Promise<Response> {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== "v1" || parts[1] !== "rooms") return failure(artroomError("not-found", "No such route."));
    // Founding (R-GEN-10) and finding a room's ID (R-API-11): no credential.
    if (parts.length === 2 && req.method === "POST") return json(await draftRoom(env, await body(req), clock()));
    if (parts.length === 3 && parts[2] === "found" && req.method === "POST") {
      const b = await body(req);
      if (!isPlainObject(b)) throw artroomError("bad-request", "Send genesis, sig and draft.");
      return json({ room: await foundRoom(env, b["genesis"], b["sig"], b["draft"]) });
    }
    const room = parts[2];
    if (!room) return failure(artroomError("not-found", "No such route."));
    if (parts.length === 3 && req.method === "GET") {
      const ref = await registry(env).lookup(room);
      return ref ? json(ref) : failure(artroomError("not-found", `There is no room ${room}.`));
    }
    const rest = parts.slice(3);
    const stub = await roomStub(env, room);
    const m = req.method;
    const one = rest.length === 1 ? rest[0] : null;

    if (m === "POST" && one === "acts") return respond(unwire(await stub.submit(await body(req))));
    if (m === "POST" && one === "requests") return respond(unwire(await stub.request(await body(req))));
    if (m === "POST" && one === "redeem") return respond(unwire(await stub.redeem(await body(req), req.headers.get("CF-Connecting-IP") ?? "unknown")));
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
    if (one === "declarations") {
      // The declarations of one policy version (R-API-3, R-API-9 as amended): the active one, or `at` an entry's seq, or `policy`.
      const at = intParam(url, "at");
      const policy = url.searchParams.get("policy");
      const c = await readQ({ q: "acts", ...(at !== undefined ? { at } : {}), ...(policy !== null ? { policy: policy as `act_${number}_${string}` } : {}) });
      return c ? json(c) : failure(artroomError("not-found", "The room retains no such policy version.")); // G5:route-acts-missing
    }
    if (one === "subscribe") {
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const waitMs = intParam(url, "waitMs") ?? 25_000;
      return json(unwire(await stub.poll(token, cursor, waitMs)));
    }
    return failure(artroomError("not-found", "No such route."));
  } catch (e) {
    if (!isArtroomError(e)) report(log, "http-failed", "route", e);
    return failure(e);
  }
}

export type { Sha };
