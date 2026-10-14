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
  type Catalogue,
  type Cursor,
  type Held,
  type LandOp,
  type Landing,
  type McpHeld,
  type McpInput,
  type McpOutput,
  type McpToolName,
  type OpKind,
  type RecordMeaning,
  type RoomApi,
  type Update,
  type UpdateStream,
} from "@generalbusiness/artroom-contract";
import { meaningOf, threadTitle } from "@generalbusiness/artroom-client";
import { ACT_TOOLS, TOOLS } from "./tools.ts";
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

/** The states after which an operation of each kind never changes again: what `operation` waits for by default (R-API-15). */
const FINISHED: { readonly [K in OpKind]: readonly string[] } = {
  workspace: ["ready", "failed"],
  preview: ["clean", "conflict", "failed"],
  land: ["landed", "aborted", "retryable", "failed"],
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A watch for attention items for the caller (R-API-15). It is the handle's
 * own subscription: `RoomWire.subscribe` over a service binding, the long
 * poll over HTTPS. It is a read: it holds no lease, slot or room state.
 */
interface AttentionWatch {
  /** Resolves when an update carries attention items for the caller, or after `ms`. */
  arrives(ms: number): Promise<void>;
  close(): Promise<void>;
}

type Subscribing = { subscribe?: (cursor?: Cursor, opts?: { readonly waitMs?: number }) => Promise<Update | UpdateStream> };

/**
 * End a subscription whose reader this watch holds: cancel its source once,
 * and give the lock back. A native stream refuses `cancel` while a reader
 * holds its lock, so it is cancelled through that reader, which also ends a
 * read still pending as done. A structural stream with no such reader (the
 * client's decoded one) cancels through its own active reader. A failing
 * cancel does not fail the tool: the page was already read.
 */
async function endStream(stream: UpdateStream, reader: ReturnType<UpdateStream["getReader"]>): Promise<void> {
  const native = reader as typeof reader & { cancel?: (reason?: unknown) => Promise<void> };
  if (typeof native.cancel === "function") await native.cancel().catch(() => undefined); // GM:watch-native-cancel
  else await stream.cancel().catch(() => undefined); // GM:watch-cancel
  reader.releaseLock(); // GM:watch-release
}

async function watchAttention(room: RoomApi): Promise<AttentionWatch> {
  const handle = room as RoomApi & Subscribing;
  // A handle with no subscription: wait out the time, and let the second read answer.
  if (typeof handle.subscribe !== "function") return { arrives: sleep, close: async () => undefined };
  // Opened before the page is read, from the live tail, so an item that arrives between the two is seen.
  const first = await handle.subscribe(undefined, { waitMs: 0 });
  if (typeof (first as UpdateStream).getReader === "function") {
    const stream = first as UpdateStream;
    const reader = stream.getReader();
    return {
      async arrives(ms) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<"deadline">((resolve) => (timer = setTimeout(() => resolve("deadline"), ms)));
        try {
          for (;;) {
            const next = await Promise.race([reader.read(), deadline]);
            if (next === "deadline" || next.done) return;
            if (next.value.attention.length > 0) return; // GM:attention-items
          }
        } finally {
          clearTimeout(timer);
        }
      },
      close: () => endStream(stream, reader),
    };
  }
  let cursor = (first as Update).cursor;
  return {
    async arrives(ms) {
      const deadline = Date.now() + ms;
      for (;;) {
        const left = deadline - Date.now();
        if (left <= 0) return;
        const update = (await handle.subscribe!(cursor, { waitMs: left })) as Update;
        cursor = update.cursor;
        if (update.attention.length > 0) return; // GM:attention-items-poll
      }
    },
    close: async () => undefined,
  };
}

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
    const page = opt({ cursor: input.cursor, limit: input.limit });
    const waitMs = input.waitMs ?? 0;
    if (waitMs === 0) return room.attention(page); // GM:attention-default
    const watch = await watchAttention(room);
    try {
      const now = await room.attention(page);
      if (now.items.length > 0) return now; // GM:attention-nonempty
      // The page would be empty: wait for an item for this caller, then read the page again. At `waitMs` that
      // second read is the empty page with its cursor (R-API-15).
      await watch.arrives(waitMs);
      return await room.attention(page); // GM:attention-reread
    } finally {
      await watch.close();
    }
  },

  async explain(room, input) {
    // Artroom's MCP reads answer an unknown ID with an object, so an unknown act is `ExplainNotFound`, never null (R-API-9).
    return (await room.explain(input.act)) ?? { act: input.act, outcome: "not-found" as const };
  },

  async lanes(room, input) {
    return room.lanes(opt({ state: input.state, holder: input.holder, touches: input.touches, cursor: input.cursor, limit: input.limit }));
  },

  async lane(room, input) {
    return (await room.lane(input.lane)) ?? { outcome: "not-found" as const, what: "lane" as const }; // GM:lane-not-found
  },

  async proposal(room, input) {
    return (await room.proposal({ lane: input.lane, generation: input.generation })) ?? { outcome: "not-found" as const, what: "proposal" as const }; // GM:proposal-not-found
  },

  async operation(room, input) {
    const ref = { id: input.id, kind: input.kind };
    let op;
    try {
      op = await room.op(ref);
    } catch (e) {
      // Only the lookup's `not-found` becomes a result. Authentication, permission and availability failures stay errors (R-API-9).
      if (isArtroomError(e) && e.code === "not-found") return { outcome: "not-found" as const, what: "operation" as const }; // GM:op-not-found
      throw e;
    }
    const waitMs = input.waitMs ?? 0;
    const until = input.until !== undefined && input.until.length > 0 ? input.until : FINISHED[input.kind]; // GM:op-until
    if (waitMs === 0 || until.includes(op.state)) return op; // GM:op-wait
    try {
      return await room.wait(ref, { until: until as never, timeoutMs: waitMs });
    } catch (e) {
      // At `waitMs` the answer is the operation's current state, read now, not an error (R-API-15).
      if (!(isArtroomError(e) && e.code === "timeout")) throw e; // GM:op-timeout
      return room.op(ref);
    }
  },

  async acts(room, input) {
    if (input.at !== undefined && input.policy !== undefined) throw error("bad-request", "Give at or policy, not both.");
    if (input.at === undefined && input.policy === undefined) return room.acts();
    // Artroom's MCP reads answer an unknown ID with an object, so a version the room does not retain is `ActsNotFound`.
    // Read from the room each time: a long-lived server's handle may have kept this version before a later activation retired one of its kinds.
    const at = input.at !== undefined ? { seq: input.at } : { policy: input.policy! };
    const opts = { fresh: true }; // G5:acts-fresh
    return (await room.actsAt(at, opts)) ?? { outcome: "not-found" as const }; // G5:acts-not-found
  },

  async act(room, input) {
    // The caller's kind, target, body and binding, unchanged: the tool never reads a binding for the agent (R-DECL-16).
    return room.act(input.kind, input.target, input.body, { binding: input.binding, idempotencyKey: input.idempotencyKey }); // G5:act-binding
  },
};

function refusalOf(rule: string, reason: string, fix: string) {
  return { refused: true as const, rule, reason, fix };
}

/** The first line of a result's text: what happened, for an agent that reads only text. */
function headline(name: McpToolName, out: unknown): string {
  if (isRefusal(out)) {
    // A stale binding: say what the active meaning is, so the agent reads it before it decides to act again (R-DECL-16).
    const now =
      out.rule === "binding-stale" && out.current?.binding !== undefined
        ? ` The active binding is ${out.current.binding}, in policy version ${String(out.current.policy)}. Nothing was done. Call acts and read the declaration before you act again.` // G5:headline-stale
        : "";
    return `Refused (${out.rule}): ${out.reason}${out.fix ? ` Fix: ${out.fix}` : ""}${now}`;
  }
  if (out === null) return "Nothing found.";
  if ((out as { outcome?: unknown }).outcome === "not-found") {
    const what = (out as { what?: unknown }).what;
    if (typeof what === "string") return `The room has no such ${what}. Check the ID.`;
    return name === "acts" ? "The room retains no such policy version." : `The room has no act ${String((out as { act: unknown }).act)}. Check the ID.`;
  }
  const o = out as Record<string, unknown>;
  switch (name) {
    case "acts": {
      const c = o as unknown as Catalogue;
      if (c.vocabulary !== "declared") return `Policy version ${c.policy} is the legacy vocabulary: use the named tools.`;
      const kinds = Object.entries(c.acts).map(([k, a]) => `${k} (${a.declaration.label}${a.retired !== undefined ? `, retired at seq ${a.retired}` : ""})`);
      return `Policy version ${c.policy} declares ${kinds.length} acts: ${kinds.join(", ")}.`;
    }
    case "explain": {
      const m = (o as { meaning?: RecordMeaning }).meaning;
      // The label in force at the record's own seq, and where the kind was retired (R-DECL-23).
      const what = m === undefined ? String(o["kind"]) : `${m.label} (${m.kind})${"retired" in m && m.retired !== undefined ? `, retired at seq ${m.retired}` : ""}`; // G5:headline-meaning
      return `${String(o["act"])}: ${what}, ${String(o["outcome"])}.`;
    }
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
    case "lanes":
      return `${(o["items"] as unknown[]).length} lanes${o["more"] === true ? `; more after cursor ${String(o["cursor"])}` : ""}.`;
    case "lane":
      return `Lane ${String(o["lane"])} is ${String(o["state"])} at generation ${String(o["generation"])}.`;
    case "proposal":
      return `Generation ${String(o["generation"])} of lane ${String(o["lane"])}, head ${String(o["head"])}.`;
    case "operation":
      return `Operation ${String(o["id"])} is ${String(o["state"])}.`;
    default:
      return `Done: ${String(o["id"] ?? o["act"] ?? name)}.`;
  }
}

/**
 * When an act opened a thread: one sentence that names the thread as every
 * reader does, by its goal, or by the act's label at its own seq and its
 * first text field by name (R-DECL-23, section 33.10). The declarations are read only when the thread
 * has no goal; if that read fails the thread is named by its ID alone.
 */
async function openedThread(room: RoomApi, input: McpInput<"act">, out: unknown): Promise<string | undefined> {
  if (out === null || typeof out !== "object" || isRefusal(out)) return undefined;
  const o = out as { lane?: unknown; goal?: unknown; seq?: unknown; effect?: { type?: unknown } };
  if (o.effect?.type !== "opened" || typeof o.lane !== "string") return undefined;
  const lane = { lane: o.lane, goal: typeof o.goal === "string" ? o.goal : "" };
  let title = threadTitle(lane);
  if (lane.goal === "" && typeof o.seq === "number") {
    try {
      const c = await room.actsAt({ seq: o.seq });
      if (c !== null) title = threadTitle(lane, { meaning: meaningOf(c, input.kind), body: input.body }); // G5:mcp-thread
    } catch {
      // The act is recorded. Only the words for its thread could not be read.
    }
  }
  return title === lane.lane ? `It opened thread ${lane.lane}.` : `It opened thread ${lane.lane}: ${title}.`;
}

export function toolResult(name: McpToolName, out: unknown, note?: string): ToolResult {
  const text = `${headline(name, out)}${note !== undefined ? ` ${note}` : ""}\n${JSON.stringify(out)}`;
  if (out === null || typeof out !== "object") return { content: [{ type: "text", text }] };
  return { content: [{ type: "text", text }], structuredContent: out as Record<string, unknown>, isError: false };
}

export function errorResult(thrown: ArtroomError): ToolResult {
  // A plain object with the error's own fields. A failure the room threw over RPC arrives as an `Error` instance, whose
  // `message` is not enumerable and which MCP does not accept as structured content.
  const e: ArtroomError = {
    name: "ArtroomError",
    code: thrown.code,
    message: thrown.message,
    retryable: thrown.retryable,
    ...(thrown.retryAfterMs !== undefined ? { retryAfterMs: thrown.retryAfterMs } : {}),
    ...(thrown.maybeRecorded !== undefined ? { maybeRecorded: thrown.maybeRecorded } : {}),
  }; // G5:error-plain
  const hint = e.retryable ? " Retry the same call with the same idempotencyKey." : "";
  return {
    content: [{ type: "text", text: `Error (${e.code}): ${e.message}${hint}\n${JSON.stringify(e)}` }],
    structuredContent: e as unknown as Record<string, unknown>,
    isError: true,
  };
}

/** Validates the input, runs the tool, and shapes the result. Never throws. */
/** True only for the tools' own names: never `constructor`, `__proto__` or another inherited name. */
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
    if (problems.length > 0) {
      // Every act tool requires a key, so that a retry after a lost reply can never record the act twice. A call
      // without one is told how to add it (R-API-9).
      const keyless = (ACT_TOOLS as readonly string[]).includes(name) && !(typeof input === "object" && input !== null && Object.hasOwn(input, "idempotencyKey"));
      const advice = keyless ? " Add any unique string as idempotencyKey, and reuse the same one to retry this call." : ""; // GM:key-advice
      return errorResult(error("bad-request", `The input does not fit the ${name} tool: ${problems.join("; ")}.${advice}`));
    }
    const api = typeof room === "function" ? await room() : room;
    const out = await (RUN[name] as Runner<McpToolName>)(api, input as never);
    return toolResult(name, out, name === "act" ? await openedThread(api, input as McpInput<"act">, out) : undefined);
  } catch (e) {
    return errorResult(isArtroomError(e) ? e : error("internal", "The tool failed.", true));
  }
}
