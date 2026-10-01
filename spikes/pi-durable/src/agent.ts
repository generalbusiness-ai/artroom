/**
 * The spike's Agent: one Durable Object that hosts a pi-durable Harness on
 * its own SQLite, and drives an Artroom room through lane E's client library
 * over a service binding (`env.ARTROOM`), as a Worker under a delegation
 * (protocol R-CRED-4, case (b) of R-ADM-3).
 *
 * The model is scripted (pi-ai's faux provider, with a response factory
 * that reads the transcript), because no model API key is configured here.
 * Everything else is the real code: pi-durable 1.0.0's Harness, tool tasks,
 * memos and documents; lane E's client; lane A's Room.
 *
 * The Artroom tools follow one rule, the one the spike tests:
 *   an act tool is `replay: "safe"`; its idempotency key is derived from the
 *   pi-durable tool task ID; and the prepared, signed envelope is stored in
 *   the task's memo before it is first sent. A rerun after a crash sends the
 *   stored bytes again, unchanged, and the room returns the original receipt
 *   (R-IDEM-2). Nothing is signed twice, so nothing can be admitted twice.
 */

import { DurableObject } from "cloudflare:workers";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Context } from "@earendil-works/chord";
import { Type, type AssistantMessage, type Message } from "@earendil-works/pi-ai";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { AssistantEntry, createRegistry, defineDoc, defineExtension, defineTool, Harness, section, type ToolExecutionApi } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { connect, isRefusal, signerFromJwk, type PreparedAct, type ClientActOptions, type PrivateJwk } from "@generalbusiness/artroom-client";
import type { ArtroomService, DelegationId, Held, LaneId, OpId, Result, Room, RoomId, Sha } from "@generalbusiness/artroom-contract";
import { DurableObjectSqlite } from "./do-sqlite.ts";

export interface AgentEnv {
  readonly ARTROOM: ArtroomService;
  /** Set only for the live run (test/live.test.ts). A Worker secret in a deployment. */
  readonly OPENROUTER_API_KEY?: string;
}

// ------------------------------------------------------------ test controls (module state, shared with the test isolate)

/** Named crash points. Each fires once: the Durable Object is reset with `ctx.abort()` at that point. */
export type CrashPoint = `${"claim" | "propose" | "land"}:${"before-send" | "after-send" | "after-receipt"}` | "write:after-push";

export const controls = {
  crashes: new Set<CrashPoint>(),
  /** Ablations: what goes wrong without each half of the rule. */
  memo: true,
  /** Derive the idempotency key from the tool task ID; false gives a fresh random key per attempt, the client's default. */
  taskKey: true,
  replay: "safe" as "safe" | "unsafe",
  /** Every time an act tool hands an envelope to the client, by kind: "prepared" (new) or "replayed" (from the memo). */
  sends: new Map<string, string[]>(),
  /** How many times an Agent instance was constructed (a reset makes a new one). */
  opens: 0,
  /** Pushes a change to a lane's fork and returns the new head. In the spike this is lane A's fake Artifacts. */
  workspace: null as null | ((lane: LaneId, files: Record<string, string>) => Sha),
  /** The client's clock. Lane A's test room runs on a fixed clock, so signed requests must use it too. */
  now: undefined as undefined | (() => number),
  reset(): void {
    this.crashes.clear();
    this.memo = true;
    this.taskKey = true;
    this.replay = "safe";
    this.sends.clear();
    this.workspace = null;
    this.now = undefined;
    this.opens = 0;
  },
};

// ------------------------------------------------------------ the lane document

/** What this conversation knows of its lane, from the room's receipts. The room stays the authority. */
export type LaneState = {
  room?: string;
  lane?: string;
  lease?: number;
  scope?: string[];
  head?: string;
  generation?: number;
  landOp?: string;
  /** Receipts, by act ID: one per act, however often the act was sent. */
  acts: { id: string; kind: string; seq: number }[];
};

export const LaneDoc = defineDoc<LaneState>({
  kind: "artroom.lane",
  version: 1,
  scope: "conversation",
  // Rewindable, so a fork (a reviewer, a retry) can start from what its parent knew at the fork point.
  history: "rewindable",
  fork: "asOf",
  initial: () => ({ acts: [] }),
});

// ------------------------------------------------------------ the scripted model

const PLAN = ["artroom_claim", "artroom_write", "artroom_propose", "artroom_land"] as const;

function text(m: Message): string {
  const c = (m as { content: unknown }).content;
  if (typeof c === "string") return c;
  return (c as { type: string; text?: string }[]).flatMap((p) => (p.type === "text" && p.text ? [p.text] : [])).join("");
}

/**
 * A deterministic stand-in for a model: it reads the transcript and answers
 * the next step. It keeps no state of its own, so it gives the same answer
 * after a restart as before it.
 */
function scriptedTurn(messages: readonly Message[]): AssistantMessage {
  const n = messages.filter((m) => m.role === "assistant").length;
  const id = `call-${n + 1}`;
  const last = messages.at(-1);
  if (last?.role === "toolResult" && (last as { isError?: boolean }).isError) {
    return fauxAssistantMessage([fauxText(`Stopped: ${last.toolName} failed: ${text(last)}`)]);
  }
  if (last?.role === "user" && /landed|landing/i.test(text(last))) {
    return fauxAssistantMessage([fauxToolCall("artroom_status", {}, { id })], { stopReason: "toolUse" });
  }
  if (last?.role === "toolResult" && last.toolName === "artroom_status") {
    return fauxAssistantMessage([fauxText(`Done. ${text(last)}`)]);
  }
  const done = new Set(messages.filter((m) => m.role === "toolResult").map((m) => (m as { toolName: string }).toolName));
  const next = PLAN.find((t) => !done.has(t));
  switch (next) {
    case "artroom_claim":
      return fauxAssistantMessage([fauxToolCall(next, { goal: "Add a note from the pi-durable spike", scope: ["docs/**"] }, { id })], { stopReason: "toolUse" });
    case "artroom_write":
      return fauxAssistantMessage([fauxToolCall(next, { path: "docs/pi-durable.md", content: "Written by a pi-durable agent.\n" }, { id })], { stopReason: "toolUse" });
    case "artroom_propose":
      return fauxAssistantMessage([fauxToolCall(next, { summary: "Add docs/pi-durable.md" }, { id })], { stopReason: "toolUse" });
    case "artroom_land":
      return fauxAssistantMessage([fauxToolCall(next, {}, { id })], { stopReason: "toolUse" });
    default:
      return fauxAssistantMessage([fauxText("Landing started. I will report when the room says it has landed.")]);
  }
}

// ------------------------------------------------------------ the agent

const MODEL = { provider: "faux", modelId: "faux-1" } as const;
const ctx0 = BACKGROUND_CONTEXT;

/** A JSON copy, for memos and documents. */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class Agent extends DurableObject<AgentEnv> {
  #harness!: Harness;
  #room: Promise<Room> | undefined;
  #prefix!: string;

  constructor(state: DurableObjectState, env: AgentEnv) {
    super(state, env);
    controls.opens++;
    void state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec("CREATE TABLE IF NOT EXISTS agent_config (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
      // A per-storage prefix for idempotency keys: task IDs restart if this storage is ever lost, keys must not.
      const prefix = state.storage.sql.exec<{ v: string }>("SELECT v FROM agent_config WHERE k = 'prefix'").toArray()[0]?.v;
      this.#prefix = prefix ?? crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      if (prefix === undefined) state.storage.sql.exec("INSERT INTO agent_config (k, v) VALUES ('prefix', ?)", this.#prefix);
      this.#harness = await this.#open();
    });
  }

  async #open(): Promise<Harness> {
    const faux = fauxProvider();
    faux.setResponses(Array.from({ length: 200 }, () => (context: { messages: Message[] }) => scriptedTurn(context.messages)));
    // The key reaches pi-ai through its credential store, never through process.env or a log line.
    const credentials = new InMemoryCredentialStore();
    const key = this.env.OPENROUTER_API_KEY;
    if (key) await credentials.modify("openrouter", async () => ({ type: "api_key", key }));
    const models = createModels({ credentials });
    models.setProvider(faux.provider);
    if (key) models.setProvider(openrouterProvider());
    const registry = createRegistry();
    registry.install(this.#artroomExtension());
    const storage = await SqliteStorage.open(new DurableObjectSqlite(this.ctx.storage));
    return Harness.open(storage, { models, registry, settings: { toolExecution: "sequential" } }, ctx0);
  }

  #model(): { provider: string; modelId: string } {
    const m = this.#config("model");
    return m === undefined ? MODEL : (JSON.parse(m) as { provider: string; modelId: string });
  }

  #config(k: string): string | undefined {
    return this.ctx.storage.sql.exec<{ v: string }>("SELECT v FROM agent_config WHERE k = ?", k).toArray()[0]?.v;
  }

  /** Crash here if the test asked for it: reset this Durable Object, as an eviction or a host failure would. */
  #maybeCrash(point: CrashPoint): void {
    if (controls.crashes.delete(point)) {
      this.ctx.abort(`injected crash at ${point}`);
      throw new Error(`injected crash at ${point}`);
    }
  }

  async #roomHandle(): Promise<Room> {
    this.#room ??= (async () => {
      const room = this.#config("room") as RoomId;
      const signer = await signerFromJwk(JSON.parse(this.#config("jwk")!) as PrivateJwk);
      return connect(this.env.ARTROOM, room, { kind: "delegation", signer, as: this.#config("delegation") as DelegationId }, controls.now ? { now: controls.now } : {});
    })();
    return this.#room;
  }

  /**
   * Sends one act exactly once across crashes. The first run prepares and
   * signs it through the client, stores the prepared act in the tool task's
   * memo, then sends it. A rerun finds the memo and sends the same bytes.
   */
  async #act<T>(api: ToolExecutionApi, cx: Context, kind: "claim" | "propose" | "land", prepare: (room: Room, opts: ClientActOptions) => Promise<Result<T>>): Promise<Result<T>> {
    const room = await this.#roomHandle();
    const count = (how: string) => controls.sends.set(kind, [...(controls.sends.get(kind) ?? []), how]);
    const saved = controls.memo ? await api.memo<PreparedAct & Record<string, never>>("artroom:prepared", cx) : undefined;
    let out: Result<T>;
    if (saved !== undefined) {
      this.#maybeCrash(`${kind}:before-send`);
      count("replayed");
      out = (await (room as unknown as { replay(a: PreparedAct): Promise<Result<T>> }).replay(saved)) as Result<T>;
    } else {
      const idempotencyKey = controls.taskKey ? `pd-${this.#prefix}-${String(api.taskId).replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 64) : crypto.randomUUID();
      out = await prepare(room, {
        idempotencyKey,
        onPrepared: async (prepared) => {
          if (controls.memo) await api.memo("artroom:prepared", json(prepared) as never, cx);
          this.#maybeCrash(`${kind}:before-send`);
          count("prepared");
        },
      });
    }
    this.#maybeCrash(`${kind}:after-send`);
    return out;
  }

  /** Record a receipt in the lane document. Idempotent: an act is recorded once, by ID. */
  async #receipt(api: ToolExecutionApi, cx: Context, r: { id: string; kind: string; seq: number }, change: (d: LaneState) => void): Promise<void> {
    await api.commit(async (tx) => {
      const d = await tx.doc(LaneDoc, api.conversationId);
      if (!d.acts.some((a) => a.id === r.id)) d.acts.push({ id: r.id, kind: r.kind, seq: r.seq });
      change(d);
    }, cx);
  }

  async #lane(api: ToolExecutionApi, cx: Context): Promise<LaneState> {
    // A document is a live overlay inside its commit only: copy it out.
    return api.commit(async (tx) => json(await tx.doc(LaneDoc, api.conversationId)) as LaneState, cx);
  }

  #artroomExtension() {
    const replay = controls.replay;
    const refusal = (r: { rule: string; reason: string }) => ({ content: [{ type: "text" as const, text: `Refused: ${r.rule}: ${r.reason}` }], isError: true });

    const claim = defineTool({
      name: "artroom_claim",
      description: "Claim a lane in the Artroom room: declare a goal and the paths you will change.",
      parameters: Type.Object({ goal: Type.String(), scope: Type.Array(Type.String()) }),
      replay,
      execute: async (args, api, cx) => {
        const r = await this.#act(api, cx, "claim", (room, opts) => room.claim({ goal: args.goal, scope: args.scope }, opts));
        if (isRefusal(r)) return refusal(r);
        await this.#receipt(api, cx, r, (d) => {
          d.room = this.#config("room")!;
          d.lane = r.lane;
          d.lease = r.lease.generation;
          d.scope = [...r.scope];
        });
        this.#maybeCrash("claim:after-receipt");
        return { content: [{ type: "text", text: `Claimed lane ${r.lane} (lease ${r.lease.generation}).` }] };
      },
    });

    const write = defineTool({
      name: "artroom_write",
      description: "Write one file on your lane's workspace and push it.",
      parameters: Type.Object({ path: Type.String(), content: Type.String() }),
      replay: "safe",
      execute: async (args, api, cx) => {
        const lane = (await this.#lane(api, cx)).lane as LaneId;
        // The first pushed head wins: a rerun reuses it rather than pushing another commit.
        let head = await api.memo<string>("artroom:head", cx);
        if (head === undefined) {
          const pushed = controls.workspace!(lane, { [args.path]: args.content });
          head = await api.memo("artroom:head", pushed, cx);
          this.#maybeCrash("write:after-push");
        }
        const h = head;
        await api.commit(async (tx) => {
          (await tx.doc(LaneDoc, api.conversationId)).head = h;
        }, cx);
        return { content: [{ type: "text", text: `Pushed ${args.path}; head ${h}.` }] };
      },
    });

    const propose = defineTool({
      name: "artroom_propose",
      description: "Propose your lane's pushed head for landing.",
      parameters: Type.Object({ summary: Type.String() }),
      replay,
      execute: async (args, api, cx) => {
        const doc = await this.#lane(api, cx);
        const r = await this.#act(api, cx, "propose", async (room, opts) => {
          // The lane's current generation and lease, read from the room as an agent naturally would.
          const lane = await room.lane(doc.lane as LaneId);
          if (lane === null || lane.state !== "held") throw new Error(`lane ${doc.lane} is not held`);
          const held: Held = { lane: lane.lane, lease: lane.lease };
          return room.propose(held, { expectedGeneration: lane.generation, head: doc.head as Sha, summary: args.summary }, opts);
        });
        if (isRefusal(r)) return refusal(r);
        await this.#receipt(api, cx, r, (d) => {
          d.generation = r.generation;
        });
        this.#maybeCrash("propose:after-receipt");
        return { content: [{ type: "text", text: `Proposed generation ${r.generation} at ${r.head}.` }] };
      },
    });

    const land = defineTool({
      name: "artroom_land",
      description: "Ask the room to land your lane's latest proposal.",
      parameters: Type.Object({}),
      replay,
      execute: async (_args, api, cx) => {
        const doc = await this.#lane(api, cx);
        const r = await this.#act(api, cx, "land", async (room, opts) => {
          const lane = await room.lane(doc.lane as LaneId);
          if (lane === null || lane.state !== "held") throw new Error(`lane ${doc.lane} is not held`);
          return room.land({ lane: lane.lane, lease: lane.lease }, { lane: lane.lane, generation: doc.generation!, head: doc.head as Sha }, opts);
        });
        if (isRefusal(r)) return refusal(r);
        await this.#receipt(api, cx, r, (d) => {
          d.landOp = r.op.id;
        });
        this.#maybeCrash("land:after-receipt");
        return { content: [{ type: "text", text: `Landing ${r.op.id} started (${r.op.state}).` }] };
      },
    });

    const status = defineTool({
      name: "artroom_status",
      description: "Read your lane's landing operation.",
      parameters: Type.Object({}),
      replay: "safe",
      execute: async (_args, api, cx) => {
        const doc = await this.#lane(api, cx);
        const room = await this.#roomHandle();
        const op = (await room.op({ kind: "land", id: doc.landOp as OpId })) as { state: string; commit?: string };
        return { content: [{ type: "text", text: `Landing ${doc.landOp} is ${op.state}.` }] };
      },
    });

    return defineExtension({
      name: "artroom",
      tools: [claim, write, propose, land, status],
      sections: [
        section(
          "artroom",
          () =>
            "You work in an Artroom room. To change files: call artroom_claim with a goal and a scope of path globs that covers every file you will write; " +
            "call artroom_write for each file; call artroom_propose; then call artroom_land. Call each tool once, in that order, then say which landing operation started.",
        ),
        // The model sees what its conversation knows of its lane before every request.
        section("lane", async (input, cx) => {
          const d = (await input.read.snapshot(LaneDoc, input.conversationId, cx)) as LaneState | undefined;
          return d?.lane === undefined ? undefined : `lane ${d.lane}, lease ${d.lease}, generation ${d.generation ?? 0}`;
        }),
      ],
    });
  }

  // ------------------------------------------------------------ RPC, for the test

  async setup(room: RoomId, jwk: PrivateJwk, delegation: DelegationId, model: { provider: string; modelId: string } = MODEL): Promise<void> {
    for (const [k, v] of [
      ["room", room],
      ["jwk", JSON.stringify(jwk)],
      ["delegation", delegation],
      ["model", JSON.stringify(model)],
    ] as const) {
      this.ctx.storage.sql.exec("INSERT INTO agent_config (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, v);
    }
  }

  /** Submit a task, exactly once by `requestId`, and wait for its answer. Call it again after a crash. */
  async run(task: string, requestId: string, whenBusy?: "steer" | "followUp"): Promise<{ status: string; answer: string }> {
    const root = await this.#harness.root(ctx0, { agent: { model: this.#model() } });
    this.#harness.resume();
    const submission = await root.submit({ type: "input", content: task, requestId, ...(whenBusy ? { whenBusy } : {}) }, ctx0);
    const settled = await submission.wait(ctx0);
    if (settled.status !== "done" || settled.type !== "input") return { status: settled.status, answer: "" };
    const entry = await root.commit((tx) => tx.entry(AssistantEntry, settled.answer!), ctx0);
    return { status: "done", answer: text(entry!.model![0] as Message) };
  }

  /** The transcript, oldest first, as role, tool and text. */
  async transcript(): Promise<{ kind: string; role?: string; tool?: string; error?: boolean; model?: string; text: string }[]> {
    const root = await this.#harness.root(ctx0, { agent: { model: this.#model() } });
    const out: { kind: string; role?: string; tool?: string; error?: boolean; model?: string; text: string }[] = [];
    let cursor;
    for (;;) {
      const page = await root.entries({}, 100, cursor, ctx0);
      for (const e of page.items) {
        const m = e.model?.[0];
        out.push({
          kind: e.kind,
          ...(m ? { role: m.role } : {}),
          ...(m?.role === "toolResult" ? { tool: m.toolName, error: m.isError === true } : {}),
          ...(m?.role === "assistant" ? { tool: m.content.flatMap((c) => (c.type === "toolCall" ? [c.name] : [])).join(",") || undefined, model: m.responseModel ?? m.model } : {}),
          text: m ? text(m) : "",
        } as never);
      }
      if (page.next === undefined) break;
      cursor = page.next;
    }
    return out.reverse();
  }

  async lane(): Promise<LaneState | undefined> {
    const root = await this.#harness.root(ctx0, { agent: { model: this.#model() } });
    return (await this.#harness.snapshot(LaneDoc, root.id, ctx0)) as LaneState | undefined;
  }

  /** Spend, per provider/model, from pi-durable's usage document. */
  async usage(): Promise<unknown> {
    return json(await this.#harness.usage(ctx0));
  }
}
