/**
 * Acts under a bearer token (R-CRED-3). The client holds no key: the room
 * signs with the session key under the bearer's delegation. Over HTTPS the
 * only route that accepts a bearer for acts is the MCP endpoint, `POST
 * /v1/rooms/:room/mcp`, so each act becomes one call of the MCP tool with
 * the same name (R-API-9).
 *
 * `check` and `roster` have no MCP tool, so a bearer session cannot sign
 * them over HTTPS.
 */

import {
  isArtroomError,
  isRefusal,
  type ActRecord,
  type ArtroomError,
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

export class BearerActs {
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

  /** One act, as the matching MCP tool call. */
  async act(kind: EnvelopeKind, target: unknown, body: unknown, idempotencyKey: string): Promise<Result<ActRecord>> {
    const t = (target ?? {}) as Obj;
    const b = body as Obj;
    const key = { idempotencyKey };
    let out: unknown;
    switch (kind) {
      case "claim": {
        if (b["purpose"] !== undefined) {
          throw artroomError("forbidden", "A configuration-recovery claim needs the admin's own key, not a delegation (R-ADMIN-5).");
        }
        const { because, ...rest } = b;
        out = await this.tool("claim", target === null ? { ...b, ...key } : { lane: t["lane"], ...rest, ...key });
        void because;
        break;
      }
      case "propose":
        out = await this.tool("propose", {
          lane: t["lane"],
          lease: b["lease"],
          head: b["head"],
          expectedGeneration: b["expectedGeneration"],
          summary: b["summary"],
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
