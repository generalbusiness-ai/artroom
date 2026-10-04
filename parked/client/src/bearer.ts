/**
 * Acts under a bearer token (R-CRED-3, R-CRED-10). The client holds no key:
 * the room signs with the session key under the bearer's delegation.
 *
 * - Over HTTPS the only route that accepts a bearer for acts is the MCP
 *   endpoint, `POST /v1/rooms/:room/mcp`, so each act becomes one call of
 *   the MCP tool with the same name (R-API-9) (`McpBearer`). `check` and
 *   `roster` have no tool, so the handle refuses them with `forbidden`
 *   before it sends anything.
 * - Over RPC, acts go to `RoomWire.bearerAct` and workspace requests to
 *   `RoomWire.bearerRequest` (`RpcBearer`). `roster` is refused locally,
 *   because no delegation can grant it (R-ADM-5).
 *
 * A declared act goes with the binding its caller read (R-CRED-10 as
 * amended): over HTTPS as one call of the MCP tool `act`, over RPC as a
 * `DeclaredBearerAct`. The handle never chooses the binding. A declared
 * check step may go this way; the legacy `check` and `roster` stay refused.
 *
 * A retry sends the same act and idempotency key. While the token is valid
 * the room returns the original result; after it is revoked or expires the
 * room throws `unauthenticated`, and there is nothing to replay (R-CRED-10).
 */

import {
  isArtroomError,
  isRefusal,
  type ActRecord,
  type ArtroomError,
  type AnyBearerAct,
  type Binding,
  type RoomWire,
  type SessionToken,
  type EnvelopeKind,
  type McpToolName,
  type RequestBody,
  type Result,
  type WorkspaceGrant,
  type WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { artroomError } from "./errors.ts";
import type { HttpWire, RequestResult } from "./wire.ts";

type Obj = Record<string, unknown>;

/** The MCP protocol revision the client speaks: one stateless POST per call. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** How a handle acts for a bearer session. */
export interface BearerActor {
  /** `binding` is given for a generic declared act, and only then; the named methods give none. */
  act(kind: string, target: unknown, body: unknown, idempotencyKey: string, binding?: Binding): Promise<Result<ActRecord>>;
  request(req: RequestBody): Promise<Result<RequestResult>>;
}

/** Bearer acts over HTTPS, through the MCP endpoint's tools. */
export class McpBearer implements BearerActor {
  readonly #wire: HttpWire;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  #id = 0;

  constructor(wire: HttpWire, token: string, fetchImpl: typeof fetch | undefined) {
    this.#wire = wire;
    this.#token = token;
    this.#fetch = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** Calls one MCP tool. A refusal is returned; a tool error is thrown as the `ArtroomError` it carries. */
  async tool(name: McpToolName, args: Obj, timeoutMs = 60_000): Promise<unknown> {
    const url = this.#wire.url("/mcp");
    const id = ++this.#id;
    let res: Response;
    let text: string;
    try {
      res = await this.#fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${this.#token}`,
          "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual", // never follow: a redirect could carry the credential elsewhere
      });
      text = await res.text();
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw artroomError(timedOut ? "timeout" : "unavailable", "The MCP endpoint did not answer.", { maybeRecorded: true });
    }
    if (!res.ok) throw this.#wire.failure({ status: res.status, body: safeJson(text) }, true);
    const message = parseRpc(text, id);
    if (message === undefined) throw artroomError("unavailable", "The MCP response was incomplete.", { maybeRecorded: true });
    if (message["error"] !== undefined) {
      const err = message["error"] as { code?: number; message?: string };
      throw artroomError(err.code === -32602 ? "bad-request" : "internal", `The MCP endpoint refused the call (${err.code ?? "?"}).`);
    }
    const result = message["result"] as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
    let structured = result.structuredContent;
    if (structured === undefined) {
      const first = result.content?.find((c) => c.type === "text")?.text;
      structured = first === undefined ? undefined : safeJson(first);
    }
    if (result.isError === true) {
      throw isArtroomError(structured) ? this.#wire.redactor.error(structured as ArtroomError) : artroomError("internal", "The MCP tool failed.");
    }
    if (isRefusal(structured)) return this.#wire.redactor.refusal(structured);
    return structured ?? null;
  }

  /** One act, as the matching MCP tool call: `act` for a generic declared act, the named tool otherwise. */
  async act(kind: string, target: unknown, body: unknown, idempotencyKey: string, binding?: Binding): Promise<Result<ActRecord>> {
    // The generic act: the caller's kind, target, body and binding, unchanged (R-CRED-10 as amended).
    if (binding !== undefined) return (await this.tool("act", { kind, target, body, binding, idempotencyKey })) as Result<ActRecord>; // G5:mcp-bearer-generic
    const t = (target ?? {}) as Obj;
    const b = body as Obj;
    const key = { idempotencyKey };
    let out: unknown;
    switch (kind as EnvelopeKind) {
      case "claim": {
        if (b["purpose"] !== undefined) {
          throw artroomError("forbidden", "A configuration-recovery claim needs the admin's own key, not a delegation (R-ADMIN-5).");
        }
        // Both forms keep `because` (R-API-9).
        out = await this.tool("claim", target === null ? { ...b, ...key } : { lane: t["lane"], ...b, ...key });
        break;
      }
      case "propose":
        out = await this.tool("propose", {
          lane: t["lane"],
          lease: b["lease"],
          head: b["head"],
          expectedGeneration: b["expectedGeneration"],
          summary: b["summary"],
          because: b["because"],
          ...key,
        });
        break;
      case "note":
        out = await this.tool("note", { anchor: target, text: b["text"], replyTo: b["replyTo"], ...key });
        break;
      case "review":
        out = await this.tool("review", { lane: t["lane"], generation: t["generation"], ...b, ...key });
        break;
      case "land":
        out = await this.tool("land", { lane: t["lane"], lease: b["lease"], generation: t["generation"], head: b["head"], waitMs: 0, ...key });
        break;
      case "release":
        out = await this.tool("release", { lane: t["lane"], lease: b["lease"], note: b["note"], ...key });
        break;
      case "renew":
        out = await this.tool("renew", { lane: t["lane"], lease: b["lease"], ...key });
        break;
      case "check":
      case "roster":
        throw artroomError("forbidden", `A bearer session cannot sign ${kind} acts over HTTPS. Use a key: \`artroom login\`, or a Worker delegation.`);
      default:
        throw artroomError("bad-request", `There is no named tool for ${kind}. Use act() with the binding you read from acts().`); // G5:mcp-bearer-unnamed
    }
    return out as Result<ActRecord>;
  }

  /** The `workspace` and `workspace-token` requests, through the `workspace` tool (R-WS-5). */
  async request(req: RequestBody): Promise<Result<RequestResult>> {
    if (req.kind === "session") throw artroomError("bad-request", "A bearer token is already a read credential.");
    const out = await this.tool("workspace", { lane: req.lane, lease: req.lease, waitMs: 0 });
    if (isRefusal(out)) return out;
    const { op, grant } = out as { op: WorkspaceOp; grant: WorkspaceGrant | null };
    if (req.kind === "workspace") return op;
    if (grant !== null) {
      this.#wire.redactor.add(grant.token);
      return grant;
    }
    return {
      refused: true,
      rule: "workspace-not-ready",
      reason: `The workspace operation ${op.id} is ${op.state}, so it has no token yet.`,
      fix: op.state === "failed" ? "Open the workspace again." : "Wait for the workspace to be ready, then ask again.",
    };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The JSON-RPC response with `id`, from a JSON body or a server-sent event stream. */
function parseRpc(text: string, id: number): Obj | undefined {
  const candidates: unknown[] = [];
  const whole = safeJson(text);
  if (whole !== undefined) candidates.push(...(Array.isArray(whole) ? whole : [whole]));
  else {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) candidates.push(safeJson(data));
    }
  }
  for (const c of candidates) {
    if (typeof c === "object" && c !== null && (c as Obj)["id"] === id) return c as Obj;
  }
  return undefined;
}

/** Bearer acts over a service binding: `RoomWire.bearerAct` and `bearerRequest` (R-CRED-10). */
export class RpcBearer implements BearerActor {
  readonly #wire: RoomWire;
  readonly #token: string;
  readonly #clean: <T>(f: () => Promise<T>) => Promise<T>;

  constructor(wire: RoomWire, token: string, guard: <T>(f: () => Promise<T>) => Promise<T>) {
    this.#wire = wire;
    this.#token = token;
    this.#clean = guard;
  }

  async act(kind: string, target: unknown, body: unknown, idempotencyKey: string, binding?: Binding): Promise<Result<ActRecord>> {
    if (kind === "roster") throw artroomError("forbidden", "A bearer session cannot sign roster acts: no delegation grants them (R-ADM-5).");
    // With a binding, the room signs `v: 2` with exactly that binding; without one, the legacy act (R-CRED-10 as amended).
    const act = (binding !== undefined ? { kind, binding, target, body, idempotencyKey } : { kind, target, body, idempotencyKey }) as AnyBearerAct; // G5:rpc-bearer-binding
    return this.#clean(async () => (await this.#wire.bearerAct(this.#token, act)) as Result<ActRecord>);
  }

  async request(req: RequestBody): Promise<Result<RequestResult>> {
    if (req.kind === "session") throw artroomError("bad-request", "A bearer token is already a read credential.");
    return this.#clean(() => this.#wire.bearerRequest(this.#token, req));
  }
}

export type { SessionToken };
