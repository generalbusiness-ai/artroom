/**
 * Runs one MCP tool against a `RoomApi` (R-API-9). Transport-free, so the
 * Worker handler, the stdio server and the tests share it.
 *
 * Results follow R-API-1: a `Refusal` is an ordinary tool result
 * (`isError: false`) whose structured content is the refusal; an
 * `ArtroomError` is a tool error (`isError: true`) whose structured content
 * is the error.
 */

import {
  isArtroomError,
  isRefusal,
  type ArtroomError,
  type Held,
  type LandOp,
  type Landing,
  type McpHeld,
  type McpInput,
  type McpOutput,
  type McpToolName,
  type RoomApi,
} from "@generalbusiness/artroom-contract";
import { TOOLS } from "./tools.ts";
import { validate } from "./validate.ts";

/** The result of `tools/call`, as MCP defines it. */
export interface ToolResult {
  readonly content: { readonly type: "text"; readonly text: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
  [key: string]: unknown;
}

function error(code: ArtroomError["code"], message: string, retryable = false): ArtroomError {
  return { name: "ArtroomError", code, message, retryable };
}

/**
 * Rebuilds `Held` from `McpHeld` with the room's current lease expiry
 * (R-API-9). Only the lease generation is signed; the room fences on it
 * exactly as it does for the method.
 */
async function held(room: RoomApi, input: McpHeld): Promise<Held> {
  const lane = await room.lane(input.lane);
  const lease = lane?.state === "held" ? lane.lease : undefined;
  return {
    lane: input.lane,
    lease: { holder: lease?.holder ?? "@unknown", generation: input.lease, expiresAt: lease?.expiresAt ?? new Date(0).toISOString() },
  };
}

/** Drops undefined fields, so optional inputs stay absent (exactOptionalPropertyTypes, R-SIG-3). */
const opt = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };
const key = (i: { idempotencyKey?: string }) => (i.idempotencyKey === undefined ? undefined : { idempotencyKey: i.idempotencyKey });

const LAND_WAIT = ["landed", "aborted", "retryable", "failed", "unresolved"] as const;

type Runner<T extends McpToolName> = (room: RoomApi, input: McpInput<T>) => Promise<McpOutput<T>>;

const RUN: { readonly [T in McpToolName]: Runner<T> } = {
  async claim(room, input) {
    const all = input as McpInput<"claim"> & { lane?: string; lease?: number; expectedGeneration?: number; because?: unknown };
    if ("lane" in input && input.lane !== undefined) {
      if (input.expectedGeneration === undefined) {
        return refusalOf("invalid-body", "Changing or taking over a lane needs `expectedGeneration`.", "Read the lane's generation and give it as `expectedGeneration`.");
      }
      const body = opt({ scope: input.scope, goal: input.goal, plan: input.plan, because: all.because, expectedGeneration: input.expectedGeneration });
      const target = input.lease === undefined ? input.lane : await held(room, { lane: input.lane, lease: input.lease });
      return room.claim({ ...body, lane: target } as never, key(input));
    }
    if (all.lease !== undefined || all.expectedGeneration !== undefined) {
      return refusalOf("invalid-body", "`lease` and `expectedGeneration` belong to an existing lane.", "Give `lane` as well, or leave them out to open a new lane.");
    }
    const i = input as Extract<McpInput<"claim">, { goal: string }>;
    if (i.goal === undefined) return refusalOf("invalid-body", "A new lane needs a `goal`.", "Add `goal`, or give `lane` to change an existing lane.");
    return room.claim(opt({ goal: i.goal, scope: i.scope, plan: i.plan, because: i.because }) as never, key(i));
  },

  async workspace(room, input) {
    const h = await held(room, input);
    const opened = await room.workspace(h);
    if (isRefusal(opened)) return opened;
    let op = opened;
    if (op.state === "pending") {
      try {
        op = await room.wait(op, { until: ["ready", "failed"], timeoutMs: input.waitMs ?? 20_000 });
      } catch (e) {
        if (!(isArtroomError(e) && e.code === "timeout")) throw e;
        op = await room.op(op);
      }
    }
    if (op.state !== "ready") return { op, grant: null };
    // Judged afresh now, for this holder and lease (R-WS-2, R-WS-5).
    const grant = await room.workspaceToken(h);
    if (isRefusal(grant)) return grant;
    return { op, grant };
  },

  async renew(room, input) {
    return room.renew(await held(room, input), key(input));
  },

  async release(room, input) {
    return room.release(await held(room, input), opt({ note: input.note }), key(input));
  },

  async propose(room, input) {
    // `because` passes through unchanged (R-API-9).
    return room.propose(await held(room, input), opt({ head: input.head, expectedGeneration: input.expectedGeneration, summary: input.summary, because: input.because }), key(input));
  },

  async note(room, input) {
    return room.note(input.anchor, opt({ text: input.text, replyTo: input.replyTo }), key(input));
  },

  async review(room, input) {
    return room.review(
      { lane: input.lane, generation: input.generation, head: input.head },
      opt({ verdict: input.verdict, scope: input.scope, dependsOn: input.dependsOn, text: input.text }),
      key(input),
    );
  },

  async land(room, input) {
    const landing = await room.land(await held(room, input), { lane: input.lane, generation: input.generation, head: input.head }, key(input));
    if (isRefusal(landing) || !input.waitMs) return landing;
    let op: LandOp;
    try {
      op = await room.wait(landing.op, { until: LAND_WAIT, timeoutMs: input.waitMs });
    } catch (e) {
      if (!(isArtroomError(e) && e.code === "timeout")) throw e;
      op = await room.op(landing.op);
    }
    return { ...landing, op } satisfies Landing;
  },

  async attention(room, input) {
    // The page carries publishedThrough from the same read (R-API-9).
    return room.attention(opt({ cursor: input.cursor, limit: input.limit }));
  },

  async explain(room, input) {
    // MCP structured content must be an object, so an unknown act is `ExplainNotFound`, never null (R-API-9).
    return (await room.explain(input.act)) ?? { act: input.act, outcome: "not-found" as const };
  },
};

function refusalOf(rule: string, reason: string, fix: string) {
  return { refused: true as const, rule, reason, fix };
}

/** The first line of a result's text: what happened, for an agent that reads only text. */
function headline(name: McpToolName, out: unknown): string {
  if (isRefusal(out)) return `Refused (${out.rule}): ${out.reason}${out.fix ? ` Fix: ${out.fix}` : ""}`;
  if (out === null) return "Nothing found.";
  if ((out as { outcome?: unknown }).outcome === "not-found") return `The room has no act ${String((out as { act: unknown }).act)}. Check the ID.`;
  const o = out as Record<string, unknown>;
  switch (name) {
    case "claim":
      return `Claimed lane ${String(o["lane"])} with lease ${String((o["lease"] as { generation: number }).generation)}.`;
    case "workspace":
      return o["grant"] === null ? `Workspace is ${String((o["op"] as { state: string }).state)}; no token yet.` : "Workspace ready: push to grant.remote with grant.token.";
    case "propose":
      return `Proposed generation ${String(o["generation"])}.`;
    case "land":
      return `Landing ${String((o["op"] as { id: string; state: string }).id)} is ${String((o["op"] as { state: string }).state)}.`;
    case "attention":
      return `${(o["items"] as unknown[]).length} items; next cursor ${String(o["cursor"])}.`;
    default:
      return `Done: ${String(o["id"] ?? o["act"] ?? name)}.`;
  }
}

export function toolResult(name: McpToolName, out: unknown): ToolResult {
  const text = `${headline(name, out)}\n${JSON.stringify(out)}`;
  if (out === null || typeof out !== "object") return { content: [{ type: "text", text }] };
  return { content: [{ type: "text", text }], structuredContent: out as Record<string, unknown>, isError: false };
}

export function errorResult(e: ArtroomError): ToolResult {
  const hint = e.retryable ? " Retry the same call with the same idempotencyKey." : "";
  return {
    content: [{ type: "text", text: `Error (${e.code}): ${e.message}${hint}\n${JSON.stringify(e)}` }],
    structuredContent: e as unknown as Record<string, unknown>,
    isError: true,
  };
}

/** Validates the input, runs the tool, and shapes the result. Never throws. */
/** True only for the ten tools' own names: never `constructor`, `__proto__` or another inherited name. */
export function isToolName(name: unknown): name is McpToolName {
  return typeof name === "string" && Object.hasOwn(TOOLS, name) && Object.hasOwn(RUN, name);
}

/** Validates the input, runs the tool, and shapes the result. Never throws. */
export async function callTool(room: RoomApi | (() => Promise<RoomApi>), name: unknown, args: unknown): Promise<ToolResult> {
  try {
    if (!isToolName(name)) {
      return errorResult(error("bad-request", `There is no tool named ${JSON.stringify(String(name)).slice(0, 80)}. The tools are ${Object.keys(TOOLS).join(", ")}.`));
    }
    // A JSON round trip keeps only own data properties: nothing reaches the runner through a prototype.
    const input: unknown = args === undefined || args === null ? {} : JSON.parse(JSON.stringify(args));
    const problems = validate(TOOLS[name].inputSchema, input);
    if (problems.length > 0) return errorResult(error("bad-request", `The input does not fit the ${name} tool: ${problems.join("; ")}.`));
    const api = typeof room === "function" ? await room() : room;
    return toolResult(name, await (RUN[name] as Runner<McpToolName>)(api, input as never));
  } catch (e) {
    return errorResult(isArtroomError(e) ? e : error("internal", "The tool failed.", true));
  }
}
