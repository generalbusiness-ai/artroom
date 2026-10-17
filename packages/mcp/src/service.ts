import { invitationRedemptionFields } from "@generalbusiness/artroom-client";
/**
 * One MCP service for every dap application (plan 031). It lists fourteen
 * generic tools that never change, and one act tool per act declaration of
 * each definition the inventory holds, listed for the caller's standing.
 * In `--generic` mode the act tools are replaced by `actions` and `act`;
 * in `--generic=add` mode both are listed.
 *
 * The service is a transport over the scope service and the caller's key:
 * it derives no judgment and holds no authority. Every write is one signed
 * intent judged by a scope, kept under custody before it is sent. This file
 * knows no application: it reads definitions as data.
 */

import type { Answer, Beside, DeclaredDefinition, Digest, Entry, FieldValue, Item, PlatformDefinition, Read, Receipt, ScopeId, ScopeRef, Seed, Summary } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, digestBytes, intentDigest, isDigest, isPlatformDefinition, isScopeId, isScopeRef, parseStrict, scopeIdOf, textDigest, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { TransportError, invitationOf, readCredential, signedIntent, wellFormedInvitation, type Fetch, type Signer } from "@generalbusiness/artroom-client";
import { platform } from "@generalbusiness/dap-platform";
import { ACT_OUTPUT, actTool, bindingsOf, declarationDigest, describedOf, generationOf, listed, selected, type Binding, type Held, type Inventory, type Mode, type Tool } from "./catalogue.ts";
import { Custody, CustodyError, Lost, meaningOf, validKey, type CustodyRecord, type CustodyStore, type Envelope, type Identity } from "./custody.ts";
import { describeAct, grantAction, onOf, schemaOf, type DefinitionLike } from "./describe.ts";
import { answered, clip, finding, type Finding } from "./errors.ts";
import { Kept, definitionOf, readInventory, readPartitionIndexes, type ConfigPort, type McpConfig, type Read_, type Root } from "./inventory.ts";
import { KIB, bytesOf, cursorOf, fromCursor, pageBy, sliceText } from "./paging.ts";
import { Reads } from "./reads.ts";
import { Unshaped, effectiveFields, expectedOf, needsOn, shapeFields, shapePresented, valuePlaces } from "./shape.ts";
import { WORDS, type Words } from "./words.ts";
import { McpMetrics, observedFetch, type McpMetricOptions } from "./metrics.ts";

export interface ServerPort {
  /** The scope service's base URL. */
  service: string;
  /** Replaces the runtime's `fetch`: a test passes the Worker's routes. */
  fetch?: Fetch;
  /** The key the server signs with: a person's device key or an agent key, from `ARTROOM_HOME`. */
  signer: Signer;
  config: ConfigPort;
  custody: CustodyStore;
  /** Operational observations only; absent or failed reporting does not own a result. */
  metrics?: McpMetricOptions;
  mode?: Mode;
  /** `--tools`: only these definitions' act tools beside the generic ones. */
  tools?: readonly string[] | null;
  words?: Words;
  now?: () => number;
  /** Called between two polls of `wait`. The default waits one second; a test drives its scheduler here. */
  pause?: (waiting: readonly ScopeId[]) => Promise<void>;
  /** The most bytes of one `tools/list` page. The default is 256 KiB (section 9); a test sets a small one to see cursors. */
  listPageBytes?: number;
  /** The timer of the watch. The default is `setInterval`. */
  every?: (ms: number, run: () => void) => () => void;
}

/** A tool's answer, as `tools/call` sends it: structured content with an object root, and its text. */
export interface CallResult { content: { type: "text"; text: string }[]; structuredContent: Record<string, unknown>; isError: boolean }

/** A `tools/list` cursor from an earlier generation. */
export class ListRestart extends Error { constructor() { super("The tool list changed; list again from the start."); } }

export const SERVER_NAME = "dap";
export const SERVER_VERSION = "0.1.0-dev.1";
/** The server's instructions, at most 512 characters (section 3). */
export const INSTRUCTIONS = "Start with room. Each act tool says what it does, who may sign it and what would refuse it. An answer is the scope's decision; a refusal naming a guard points at its sentence. After accepted, use wait to see what the entry created. After a lost reply, settle with the same idempotencyKey; do not sign again. Only credential returns a credential by design; step and record can show a join's signed invitation. Nothing here grants authority: you may sign what your role holds, and the list changes when that does.";

const LIST_PAGE_BYTES = 256 * KIB;
const WATCH_MS = 30_000;
const WAIT_MOST_SECONDS = 60;
/** The most entries one poll or call reads when it searches a history, and the most pages of final items; it goes on from there next time. */
const SEARCH_ENTRIES = 16;
/** The most bytes of a capability's name or of a step's name that `prepare` takes. */
const NAME_BYTES = 128;
const SEARCH_PAGES = 4;
const SINGLETON_PLACES = ["register", "directory", "membership", "rules", "destination", "inbox"] as const;

interface Snapshot {
  read: Read_;
  bindings: Binding[];
  tools: Tool[];
  generation: Digest;
  hidden: string[];
  memberships: Map<string, ScopeRef>;
  /** The digest of the configuration the snapshot was derived from. */
  configured: Digest;
}

type Args = Record<string, unknown>;
type Run = (args: Args) => Promise<CallResult>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (structured: Record<string, unknown>): string => JSON.stringify(structured);
/**
 * Response bounds of plan 031, section 8, for the whole CallResult as the service makes it: text, structured content and isError
 * together. Over 2026-07-28 the wire adds MODERN_RESULT_EXTRA bytes to each result, which these bounds do not count.
 */
export const BOUNDS = { act: 4 * KIB, room: 8 * KIB, inspect: 8 * KIB, large: 64 * KIB, credential: 2 * KIB } as const;
/** What a page of structured content may use of its bound: the rest is the envelope and the text that points at it. */
const PAGE_SPARE = 512;
const pageOf = (bound: number): number => bound - PAGE_SPARE;
/**
 * A result. The text repeats the structured content's JSON when the whole result fits its bound; otherwise the text says
 * where the result is, and the JSON is sent once. A single item larger than a page is the one result that exceeds its bound.
 */
const ok = (structured: Record<string, unknown>, bound: number = BOUNDS.act): CallResult => {
  const whole: CallResult = { content: [{ type: "text", text: text(structured) }], structuredContent: structured, isError: false };
  if (bytesOf(whole) <= bound) return whole;
  return { content: [{ type: "text", text: `The result is in structuredContent: ${bytesOf(structured)} bytes of JSON, which this text does not repeat.` }], structuredContent: structured, isError: false };
};
/** The bound of every error result: the smallest tool's bound, so an error fits whichever tool gave it. */
export const ERROR_BYTES = Math.min(...Object.values(BOUNDS));
/**
 * An error result. Its whole serialized size is held within ERROR_BYTES: when the sentence would pass it, only the sentence
 * is cut, and says so; the error's kind and its next step stay whole. Every next step the server writes is bounded (a file it
 * names is relative to ARTROOM_HOME), so the last check, on the result with no sentence at all, holds for each of them; were
 * one ever longer, the next step would be cut to fit, with its length, rather than the result pass its bound.
 */
export const failed = (f: Finding): CallResult => {
  const said = finding(f);
  const result = (message: string, next: string = said.next): CallResult => { const structured = { error: said.error, message, next }; return { content: [{ type: "text", text: text(structured) }], structuredContent: structured, isError: true }; };
  const whole = result(said.sentence);
  if (bytesOf(whole) <= ERROR_BYTES) return whole;
  /** The longest marked cut of `full` that fits, or null when even the marked cut of nothing does not fit. */
  const fit = (full: string, make: (part: string) => CallResult, says: (length: number) => string): CallResult | null => {
    const cut = (n: number) => { const end = /[\uD800-\uDBFF]/.test(full[n - 1] ?? "") ? n - 1 : n; return make(`${full.slice(0, end)}… ${says(full.length)}`); };
    if (bytesOf(cut(0)) > ERROR_BYTES) return null;
    let lo = 0, hi = full.length;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (bytesOf(cut(mid)) <= ERROR_BYTES) lo = mid; else hi = mid - 1; }
    return cut(lo);
  };
  const cutNote = (n: number) => `(the sentence is cut here; it had ${n} characters)`;
  const nextNote = (n: number) => `(the next step is cut here; it had ${n} characters)`;
  const message = `… ${cutNote(said.sentence.length)}`;
  // The sentence cut, with the next step whole; else the sentence reduced to its mark and the next step cut; else both marks,
  // which with an error's short kind are a few hundred bytes. Each step is measured as it would be returned.
  return fit(said.sentence, (m) => result(m), cutNote) ?? fit(said.next, (n) => result(message, n), nextNote) ?? result(message, `… ${nextNote(said.next.length)}`);
};

/**
 * A native answer, projected for a result: its kind, the fact and the outbox IDs of an acceptance, the reason, name and judged head
 * of a refusal. The receipt's effects are counted, not repeated: `step` reads the entry whole.
 */
export function projectAnswer(answer: Answer): Record<string, unknown> {
  switch (answer.answer) {
    case "accepted": return { answer: "accepted", fact: answer.receipt.fact, outboxIds: answer.receipt.sends, effects: answer.receipt.effects.length };
    case "refused": return { answer: "refused", reason: answer.reason, ...(answer.name ? { name: answer.name } : {}), judgedAt: answer.judgedAt };
    default: return { answer: answer.answer, reason: answer.reason };
  }
}

const configDigest = (config: McpConfig): Digest => digestBytes(utf8(canonicalize(config as never)));

class Stop extends Error { constructor(readonly result: CallResult) { super("stop"); } }
const stop = (f: Finding): never => { throw new Stop(failed(f)); };

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
const scopeArg = { type: ["string", "integer"], description: "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number." };
const keyArg = { type: "string", minLength: 1, maxLength: 128, description: "Your key for this one meaning, 1 to 128 bytes. Keep it." };

export class McpService {
  #reads: Reads;
  /** The scope service: the configuration's, or, for a process that has joined nothing yet, the one its first join names. */
  #service: string;
  readonly kept = new Kept();
  readonly custody: Custody;
  readonly mode: Mode;
  readonly words: Words;
  readonly #port: ServerPort;
  readonly #metrics: McpMetrics;
  readonly #fetch: Fetch | undefined;
  readonly #tools: readonly string[] | null;
  #snapshot: Snapshot | null = null;
  #stale = false;
  /** Where each history search goes on from: the next entry to read, or the next page's cursor. Kept in memory, never authority. */
  readonly #searches = new Map<string, number>();
  readonly #pages = new Map<string, string | undefined>();
  readonly #listeners = new Set<(generation: Digest) => void>();
  #stopWatch: (() => void) | null = null;
  #told: Digest | null = null;
  readonly #generic: Record<string, { tool: Tool; run: Run }>;
  /** Every list-change the service raised, for a test to count. */
  raised = 0;

  constructor(port: ServerPort) {
    this.#port = port;
    this.#metrics = new McpMetrics(port.metrics);
    const fetcher = port.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
    this.#fetch = this.#metrics.enabled && fetcher ? observedFetch(fetcher) : port.fetch;
    this.mode = port.mode ?? "default";
    this.words = port.words ?? WORDS;
    this.#tools = port.tools ?? null;
    const now = port.now ?? Date.now;
    this.#service = port.service;
    this.#reads = this.#readsOf(port.service);
    this.custody = new Custody(port.custody, () => timeOf(now()));
    this.#generic = this.#genericTools();
  }

  get key(): string { return this.#port.signer.key; }
  get reads(): Reads { return this.#reads; }
  get service(): string { return this.#service; }
  #readsOf(service: string): Reads { return new Reads({ service, ...(this.#fetch ? { fetch: this.#fetch } : {}), signer: this.#port.signer, now: this.#port.now ?? Date.now }); }
  #now(): number { return (this.#port.now ?? Date.now)(); }

  // ---------------------------------------------------------------- the list

  /** Reads the inventory and derives the list: a pure function of the semantic inputs. */
  async snapshot(): Promise<Snapshot> {
    const config = await this.#port.config.read();
    const read = await readInventory(this.reads, this.kept, config);
    const bindings = bindingsOf(read.inventory, this.words);
    const generation = generationOf(bindings, read.inventory, { mode: this.mode, tools: this.#tools, words: this.words });
    const memberships = new Map<string, ScopeRef>();
    if (config.repository) memberships.set(config.repository.membership.scope, config.repository.membership);
    for (const root of config.roots ?? []) if (root.membership) memberships.set(root.membership.scope, root.membership);
    const shown = bindings.filter((b) => selected(b, this.#tools));
    const hidden = shown.filter((b) => !listed(b, read.inventory)).map((b) => b.name);
    const acts = this.mode === "generic" ? [] : shown.filter((b) => listed(b, read.inventory)).map((b) => actTool(b, read.inventory, this.mode));
    const generic = Object.entries(this.#generic).filter(([name]) => (name === "actions" || name === "act" ? this.mode !== "default" : true)).map(([, g]) => g.tool);
    const snapshot: Snapshot = { read, bindings, tools: [...generic, ...acts], generation, hidden, memberships, configured: configDigest(config) };
    this.#stale = false;
    const previous = this.#snapshot?.generation ?? null;
    this.#snapshot = snapshot;
    if (previous !== null && previous !== generation) this.#raise(generation);
    return snapshot;
  }

  /** The snapshot the last list or call derived; derived again when none is held, or when this service changed the configuration since. */
  async #current(): Promise<Snapshot> {
    if (!this.#snapshot || this.#stale) return this.snapshot();
    // The configuration is read on every call: another process (another connection of the same ARTROOM_HOME, or the command line)
    // may have added a root or a room since, and a call by a name already known must see the scopes and memberships it names now.
    if (configDigest(await this.#port.config.read()) !== this.#snapshot.configured) return this.snapshot();
    return this.#snapshot;
  }

  /**
   * After this service wrote the configuration (a created scope, a claimed or joined room, an inbox): the next call derives the
   * list again, and a subscribed client is told of the change at once, with no list or room call first.
   */
  #invalidate(): void { this.#stale = true; void this.check(); }

  /** One page of `tools/list`: at most 256 KiB, a cursor bound to the generation, and a restart for a cursor of another one. */
  page(cursor?: unknown): Promise<{ tools: Tool[]; nextCursor?: string; generation: Digest }> {
    return this.#metrics.list(() => this.#page(cursor), error => error instanceof ListRestart ? { end: "refused", reason: "restart" } : error instanceof TransportError ? { end: "unavailable", reason: "transport" } : { end: "error", reason: "exception" });
  }
  async #page(cursor?: unknown): Promise<{ tools: Tool[]; nextCursor?: string; generation: Digest }> {
    const s = await this.snapshot();
    let from = 0;
    if (cursor !== undefined && cursor !== null) {
      const at = fromCursor<{ g: string; i: number }>(cursor);
      if (!at || at.g !== s.generation || !Number.isSafeInteger(at.i) || at.i < 0 || at.i > s.tools.length) throw new ListRestart();
      from = at.i;
    }
    const { page, next } = pageBy(s.tools, from, this.#port.listPageBytes ?? LIST_PAGE_BYTES);
    return { tools: page, ...(next !== null ? { nextCursor: cursorOf({ g: s.generation, i: next }) } : {}), generation: s.generation };
  }

  // ---------------------------------------------------------------- telling subscribed clients

  /** Tell `listener` of each new generation, while subscribed; the watch runs only while someone is. */
  subscribe(listener: (generation: Digest) => void): () => void {
    this.#listeners.add(listener);
    if (!this.#stopWatch) {
      const every = this.#port.every ?? ((ms, run) => { const timer = setInterval(run, ms); return () => clearInterval(timer); });
      this.#stopWatch = every(WATCH_MS, () => { void this.check(); });
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0 && this.#stopWatch) { this.#stopWatch(); this.#stopWatch = null; }
    };
  }

  get watching(): boolean { return this.#stopWatch !== null; }

  /** Recompute the generation; tell subscribers when it differs from what they were told. Errors of a read are not a change. */
  async check(): Promise<void> {
    if (this.#listeners.size === 0) return;
    try { await this.snapshot(); } catch { /* an unreadable inventory is no change of the list */ }
  }

  #raise(generation: Digest): void {
    if (this.#told === generation) return;
    this.#told = generation;
    this.raised++;
    for (const listener of [...this.#listeners]) { try { listener(generation); } catch { /* a listener's failure is its own */ } }
  }

  // ---------------------------------------------------------------- calls

  call(name: string, args: unknown): Promise<CallResult> {
    return this.#metrics.call(name, () => this.#call(name, args), result => {
      const c = result.structuredContent, answer = c["answer"], error = c["error"];
      const end = answer === "refused" || answer === "mismatch" ? "refused" : answer === "unavailable" || error === "transport" ? "unavailable" : result.isError ? "error" : "ok";
      return { end, reason: typeof c["reason"] === "string" ? c["reason"] : typeof error === "string" ? error : "none", bytes: bytesOf(result) };
    });
  }
  async #call(name: string, args: unknown): Promise<CallResult> {
    const given = isRecord(args) ? args : {};
    try {
      const generic = Object.hasOwn(this.#generic, name) ? this.#generic[name]! : null;
      if (generic && ((name !== "actions" && name !== "act") || this.mode !== "default")) return await generic.run(given);
      // A name the list derived earlier does not hold: derive it again once, since the room may have changed since.
      let s = await this.#current();
      if (!s.bindings.some((b) => b.name === name)) s = await this.snapshot();
      const binding = this.mode === "generic" ? null : s.bindings.find((b) => b.name === name) ?? null;
      if (!binding) return failed({ error: "unknown-tool", name });
      return await this.#perform(binding, given, binding.kind);
    } catch (error) {
      if (error instanceof Stop) return error.result;
      if (error instanceof CustodyError) return failed({ error: "custody", state: error.why.held, key: String(given["idempotencyKey"] ?? ""), scope: String(given["target"] ?? given["scope"] ?? ""), ...("keys" in error.why ? { keys: error.why.keys } : {}), ...("recorded" in error.why ? { recorded: error.why.recorded } : {}), ...("bytes" in error.why ? { bytes: error.why.bytes } : {}), ...("reason" in error.why && error.why.reason === "budget" ? { reason: "budget" } : {}), ...("stale" in error.why && error.why.stale ? { stale: error.why.stale } : {}), ...("answer" in error.why ? { answer: error.why.answer } : {}), ...("step" in error.why && error.why.step ? { step: error.why.step } : {}) });
      if (error instanceof TransportError) return failed({ error: "transport", scope: String(given["target"] ?? given["scope"] ?? "the scope"), submitted: false });
      throw error;
    }
  }

  // ---------------------------------------------------------------- scopes and targets

  #membershipOf(s: Snapshot, held: Held | undefined): ScopeRef | null {
    if (held?.membership) return s.memberships.get(held.membership) ?? null;
    return s.read.room?.membership ?? null;
  }

  /** A scope by ID, by a room name, or by a lane's number. */
  async #scope(s: Snapshot, named: unknown): Promise<{ scope: ScopeId; held: Held | undefined; membership: ScopeRef | null }> {
    const room = s.read.room;
    const held = (scope: ScopeId) => s.read.inventory.scopes.find((h) => h.scope === scope);
    const at = (scope: ScopeId) => ({ scope, held: held(scope), membership: this.#membershipOf(s, held(scope)) });
    if (typeof named === "string" && isScopeId(named)) return at(named);
    if (typeof named === "string" && (SINGLETON_PLACES as readonly string[]).includes(named)) {
      const matched = s.read.inventory.scopes.find((h) => h.place === named);
      return matched ? at(matched.scope) : stop({ error: "target", what: `no ${named} is in the inventory` });
    }
    const number = typeof named === "number" ? named : typeof named === "string" && /^#?\d+$/.test(named) ? Number(named.replace("#", "")) : null;
    if (number !== null && room) {
      let lane = room.lanes.find((l) => l.number === number);
      if (!lane) {
        if (held(room.directory.scope)?.pinned === "platform:directory@10") {
          const coverage = await readPartitionIndexes(this.#reads, room.directory, room.membership);
          if (!coverage.complete) return stop({ error: "read", scope: room.directory.scope, reason: "unavailable" });
          const row = coverage.indexes.flatMap(index => [...index.lanes]).find(item => item.values["number"] === number && isScopeRef(item.refs["scope"]));
          if (row) return at((row.refs["scope"] as ScopeRef).scope);
          return stop({ error: "target", what: `no issue or change ${number} is listed in the selected complete partition indexes` });
        }
        // A lane opened since the list was read: the directory's rows, read once.
        const read = await this.#reads.read(room.membership, (t, r) => t.summary(room.directory.scope, r));
        if (read.ok) {
          const row = read.value.items.find((item) => item.type === "lane" && item.values["number"] === number && isScopeRef(item.refs["scope"]));
          if (row) return at((row.refs["scope"] as ScopeRef).scope);
        }
      }
      if (lane) return at(lane.ref.scope);
    }
    return stop({ error: "target", what: `${clip(JSON.stringify(named) ?? String(named))} names no scope here` });
  }

  async #summary(scope: ScopeId, membership: ScopeRef | null): Promise<{ summary: Summary; at: Read<Summary> & { ok: true } }> {
    const read = await this.#reads.read(membership, (t, r) => t.summary(scope, r));
    if (!read.ok) return stop({ error: "read", scope, reason: read.reason });
    return { summary: read.value, at: read };
  }

  /**
   * The target of an act as its summary has it; or, where the caller may not read it yet and the configuration records its pin,
   * that pin with no items: the act is signed with no expected revisions, as `dap join` signs one, and the scope judges.
   */
  async #target(scope: ScopeId, membership: ScopeRef | null): Promise<Pick<Summary, "scope" | "definition" | "items">> {
    const read = await this.#reads.read(membership, (t, r) => t.summary(scope, r));
    if (read.ok) return read.value;
    const pin = this.kept.pins.get(scope);
    if (pin && read.reason === "forbidden") return { scope: pin.ref, definition: pin.pinned, items: [] };
    return stop({ error: "read", scope, reason: read.reason });
  }

  async #definition(s: Snapshot, pinned: Digest | PlatformDefinition, scope: ScopeId, membership: ScopeRef | null): Promise<DefinitionLike> {
    const rules = s.read.room?.rules;
    const matched = await definitionOf(this.reads, this.kept, pinned, [{ scope, membership }, ...(rules ? [{ scope: rules.scope, membership: s.read.room!.membership }] : [])]);
    return matched ?? stop({ error: "read", scope, reason: "unsupported-definition" });
  }

  // ---------------------------------------------------------------- an act, under custody

  async #perform(binding: Binding | null, args: Args, kind: string, preparing?: { resource: unknown; capability: string; step: string }): Promise<CallResult> {
    const key = args["idempotencyKey"];
    if (!validKey(key)) return failed({ error: "shape", field: "idempotencyKey", what: "is missing, or not 1 to 128 bytes of UTF-8", declared: "a key you choose and keep" });
    const s = await this.#current();
    // The target: given, or the room's own scope of a singleton platform kind.
    let named = args["target"] ?? args["scope"];
    if (named === undefined && binding?.singleton) named = binding.scopes[0]!.scope;
    if (named === undefined) return failed({ error: "target", what: "no target was given" });
    const { scope, membership } = await this.#scope(s, named);
    const summary = await this.#target(scope, membership);
    const definition = await this.#definition(s, summary.definition, scope, membership);
    const act = definition.acts[kind];
    // The binding check, before anything is signed: the target's pinned definition and declaration are the ones this tool serves.
    const declaration = act && kind !== definition.genesis ? declarationDigest(definition, kind, summary.definition) : null;
    // A tool bound to other declarations refuses before anything is signed, and the list is derived again.
    const stale = async (): Promise<CallResult> => {
      const fresh = await this.snapshot();
      const serving = fresh.bindings.find((b) => b.definition === definition.name && b.kind === kind && b.declaration === declaration && b.digests.includes(summary.definition));
      return failed({ error: "stale-descriptor", scope, runs: `${definition.name} ${summary.definition}`, tool: serving && this.mode !== "generic" ? serving.name : declaration ? "act, with this scope and kind" : null });
    };
    if (!act || declaration === null) return binding ? stale() : failed({ error: "shape", field: "kind", what: `is not an act of ${definition.name}`, declared: Object.keys(definition.acts).filter((k) => k !== definition.genesis).join(", ") });
    if (binding && (binding.definition !== definition.name || binding.declaration !== declaration || !binding.digests.includes(summary.definition))) return stale();
    if (!binding && args["digest"] !== undefined && args["digest"] !== summary.definition) {
      return failed({ error: "stale-descriptor", scope, runs: `${definition.name} ${summary.definition}`, tool: "act, with the digest you read again from actions" });
    }
    const on = args["on"] === undefined ? null : args["on"];
    if (needsOn(act) ? !(typeof on === "number" && Number.isSafeInteger(on) && on >= 0) : on !== null) {
      return failed({ error: "shape", field: "on", what: needsOn(act) ? "is required: the local ID of the item this act is on" : "is not taken: this act is on no existing item", declared: onOf(act) });
    }
    const fieldsGiven = isRecord(args["fields"]) ? args["fields"] : {};
    const textsGiven = Array.isArray(args["texts"]) ? args["texts"].filter((t): t is string => typeof t === "string") : [];
    const valuesGiven = Array.isArray(args["values"]) ? args["values"].filter((v): v is string => typeof v === "string") : [];
    const presentedGiven = isRecord(args["presented"]) ? args["presented"] : undefined;
    const meaning = meaningOf({ kind, on, fields: fieldsGiven, texts: textsGiven.map(textDigest).sort(), values: valuesGiven.map((v) => digestBytes(utf8(v))).sort(), presented: presentedGiven ?? {} });
    const identity: Identity = { service: this.#service, membership, signer: this.#port.signer.key, target: summary.scope, key: key as string };
    const items = summary.items;
    const build = async (): Promise<{ binding: CustodyRecord["binding"]; envelope: Envelope }> => {
      let shaped: { fields: Record<string, FieldValue>; texts: string[] };
      let presented: ReturnType<typeof shapePresented>;
      try {
        shaped = shapeFields(act, fieldsGiven, textsGiven, membership);
        presented = shapePresented(act, presentedGiven);
      } catch (error) {
        if (error instanceof Unshaped) return stop({ error: "shape", field: error.field, what: error.what, declared: error.declared });
        throw error;
      }
      const values = [...valuesGiven];
      for (const place of valuePlaces(act, shaped.fields)) {
        if (values.some((v) => valueDigest(place.domain, v) === place.digest)) continue;
        values.push(await this.#valueBytes(s, place));
      }
      // The subjects are resolved from the fields the scope will read, defaults applied and local facts as their seq; the intent
      // signs the fields as given.
      const expected = expectedOf(act, items, on as number | null, effectiveFields(act, shaped.fields, summary.scope));
      const signed = await signedIntent(this.#port.signer, { to: summary.scope, kind, on: on as number | null, fields: shaped.fields, expected }, { idempotencyKey: key as string, now: this.#now() });
      const beside: Beside = { ...(shaped.texts.length > 0 ? { texts: shaped.texts } : {}), ...(Object.keys(presented).length > 0 ? { presented } : {}), ...(values.length > 0 ? { values } : {}) };
      return { binding: { definition: definition.name, kind, declaration, pinned: summary.definition }, envelope: { signed, beside } };
    };
    const asked = { scope, kind, on: on as number | null, action: grantAction(act) };
    const guards = describeAct(definition, kind, act, { standing: "unknown" }, { pinned: summary.definition }, { definition: definition.name, kind, declaration, digests: [summary.definition] }, "").guards;
    const notAfter = timeOf(this.#now() + PROPOSED_BOUNDS.intentLifetimeSeconds * 1000);
    // What the envelope will carry, for custody's byte bound before anything is signed.
    const carried = bytesOf({ fields: fieldsGiven, texts: textsGiven, values: valuesGiven, presented: presentedGiven ?? {} });
    if (preparing) {
      const record = await this.custody.keep(identity, meaning, build, notAfter, carried);
      const resource = await this.#scope(s, preparing.resource);
      const { summary: resourceSummary } = await this.#summary(resource.scope, resource.membership);
      const stepped = await this.custody.step(identity, resourceSummary.scope, preparing.capability, preparing.step, async (signed) => {
        try { return await this.#reads.transport.prepare(resource.scope, signed, [], preparing.capability, preparing.step); }
        catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
      });
      const said = stepped.answer === null
        ? { sentence: `The reply from ${resource.scope} to step ${preparing.step} of ${preparing.capability} was lost; this step's outcome is unknown. The act's phase is unchanged.`, next: "Call prepare again with the same arguments: the resource answers the same step with its first entry." }
        : { sentence: `${resource.scope} answered step ${preparing.step} of ${preparing.capability} for your intent: ${stepped.answer.answer}${stepped.answer.answer === "refused" ? ` (${stepped.answer.reason}${stepped.answer.name ? `, ${stepped.answer.name}` : ""})` : ""}. The act is not submitted by this; its phase is ${record.phase}.`, next: "Submit the act with the same idempotencyKey when the steps you need are answered; settle shows each step and the act apart." };
      return ok({ step: { resource: resource.scope, capability: preparing.capability, step: preparing.step, phase: stepped.step.phase, answer: stepped.answer === null ? null : projectAnswer(stepped.answer) }, act: { phase: stepped.record.phase, intent: intentDigest(stepped.record.envelope.signed.intent) }, ...said });
    }
    const kept = await this.custody.send(identity, meaning, build, async (envelope) => {
      try { return await this.#reads.transport.submit(scope, envelope.signed, [], envelope.beside); }
      catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
    }, { ...(args["resubmit"] === true ? { resubmit: true } : {}), notAfter, bytes: carried });
    const tool = binding?.name ?? "act";
    if ("lost" in kept) return failed({ error: "transport", scope, submitted: true });
    const said = answered(kept.answer, asked, guards);
    if (kept.answer.answer === "accepted" && !kept.retained) {
      // An accepted act on a membership can change whether it gives this key a session: ask again on the next read.
      if (summary.scope.kind === "membership") this.#reads.forget(summary.scope.scope);
      void this.check();
    }
    return ok(this.#answerOf(kept.answer, { scope, kind, tool, retained: kept.retained, said, phase: kept.record.phase }));
  }

  #answerOf(answer: Answer, at: { scope: string; kind: string; tool: string; retained: boolean; said: { sentence: string; next: string }; phase: string }): Record<string, unknown> {
    const base = { answer: answer.answer, sentence: at.retained ? `${at.said.sentence} This outcome was kept under custody; nothing was sent.` : at.said.sentence, next: at.retained && answer.answer === "refused" ? `${at.said.next} To send the same envelope again, deliberately: resubmit: true.` : at.said.next, scope: at.scope, kind: at.kind, tool: at.tool, retained: at.retained, phase: at.phase };
    switch (answer.answer) {
      case "accepted": return { ...base, fact: answer.receipt.fact, outboxIds: answer.receipt.sends };
      case "refused": return { ...base, reason: answer.reason, ...(answer.name ? { name: answer.name } : {}), judgedAt: answer.judgedAt };
      default: return { ...base, reason: answer.reason };
    }
  }

  /** The bytes of a value a field names by digest: a definition's, read from the rules scope that retained it. */
  async #valueBytes(s: Snapshot, place: { name: string; domain: string; digest: string }): Promise<string> {
    const room = s.read.room;
    if (place.domain !== "artroom-definition-1" || !room?.rules) return stop({ error: "shape", field: `fields.${place.name}`, what: `names a value in ${place.domain} that is not in values`, declared: "a digest of a value given in values" });
    const read = await this.#reads.read(room.membership, (t, r) => t.retained(room.rules!.scope, r, "definition", place.digest as Digest));
    if (!read.ok) return stop({ error: "shape", field: `fields.${place.name}`, what: `names a definition the rules scope does not hold (${read.reason}); give its bytes in values`, declared: "the digest of a definition" });
    return read.value.bytes;
  }

  // ---------------------------------------------------------------- the generic tools

  #genericTools(): Record<string, { tool: Tool; run: Run }> {
    const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[], annotations: Record<string, unknown>, run: Run, output?: Record<string, unknown>): [string, { tool: Tool; run: Run }] =>
      [name, { tool: { name, description, inputSchema: { type: "object", properties, required, additionalProperties: false }, ...(output ? { outputSchema: output } : {}), annotations }, run }];
    return Object.fromEntries([
      tool("room", "Orientation. The service, your key, the scopes of the room by name, the issues and changes the directory lists, the applications its factory created (such as a Counter), the standalone scopes, your standing on each membership, the active definitions, and the act tools your role does not hold; paged by bytes, with a cursor. Start here.",
        { cursor: { type: "string" } }, [], READ, (a) => this.#room(a)),
      tool("inspect", "One scope: its definition and digest, status, head, counts by item type and state, and its live items, paged by bytes at its head. With declaration: true, the definition's bytes, paged. With describe: <kind>, the complete derived text of one act, for an act whose tool description points here.",
        { scope: scopeArg, declaration: { type: "boolean" }, describe: { type: "string" }, cursor: { type: "string" }, offset: { type: "integer", minimum: 0 } }, ["scope"], READ, (a) => this.#inspect(a)),
      tool("create", "Creates a scope with no existing target, and records it in your configuration so later connections list its tools. definition: a platform name such as platform:register@3, a definition's JSON, or its digest; kind: the definition's genesis act; fields; texts and definitions beside it; membership: the membership scope standing for the new scope is read from. Kept under custody like an act: the idempotencyKey is required.",
        { definition: { type: ["string", "object"] }, kind: { type: "string" }, fields: { type: "object" }, texts: { type: "array", items: { type: "string" } }, definitions: { type: "array", items: { type: "object" } }, membership: { type: ["string", "object"] }, idempotencyKey: keyArg, resubmit: { type: "boolean" } },
        ["definition", "kind", "idempotencyKey"], WRITE, (a) => this.#create(a), ACT_OUTPUT),
      tool("join", "Joins a room with an invitation link from dap invite (artroom-invite:...), as dap join does: signs membership's join with this server's key, keeps the exact request under custody before sending it, and on acceptance records the room in your configuration, so its tools are listed. After a lost reply, call again with the same link and idempotencyKey: the same request is sent again, never a new one. The link is private: this tool's result never repeats it. Legacy membership records the invitation secret in the join entry, visible through authorized history reads. The invitation-key cohort records a proof bound to this membership, invitation and joining key; its private invitation seed stays out of the entry.",
        { link: { type: "string", description: "The invitation link, artroom-invite:..." }, idempotencyKey: keyArg }, ["link", "idempotencyKey"], WRITE, (a) => this.#join(a), ACT_OUTPUT),
      tool("prepare", "Asks the scope that owns a resource for one step of a capability. With kind: for the intent an act will submit later under the same idempotencyKey; resource: the scope asked, which may differ from target; then the act's own target, kind, on, fields, texts, presented and values. Without kind: a step with no act, such as hold@1's instance, whose own intent (kind capability:step, with fields) goes to the resource. Returns the resource's answer for that step, never an act's receipt.",
        { resource: scopeArg, capability: { type: "string" }, step: { type: "string" }, target: scopeArg, kind: { type: "string" }, on: { type: "integer", minimum: 0 }, fields: { type: "object" }, texts: { type: "array", items: { type: "string" } }, presented: { type: "object" }, values: { type: "array", items: { type: "string" } }, idempotencyKey: keyArg },
        ["resource", "capability", "step", "idempotencyKey"], WRITE, (a) => this.#prepare(a)),
      tool("items", "A page of one item type of a scope, in one of two traversals, each with its own cursor: the live items, from the scope's summary (the default); or, with final: true, the retained final items. The cursor is not checked against its traversal: to continue, call again with the same scope, type and final flag.",
        { scope: scopeArg, type: { type: "string" }, final: { type: "boolean", description: "true: the traversal of the retained final items, separate from the live one; the default is the live items" }, cursor: { type: "string" } }, ["scope", "type"], READ, (a) => this.#items(a)),
      tool("steps", "A page of a scope's entries, oldest first, one line each: seq, time, kind, signer, effects and sends counts.",
        { scope: scopeArg, cursor: { type: "string" } }, ["scope"], READ, (a) => this.#steps(a)),
      tool("step", "One entry in full: its input, fields, effects, sends and hash, paged by bytes with offset. A detached text's digest resolves with text.",
        { scope: scopeArg, seq: { type: "integer", minimum: 0 }, offset: { type: "integer", minimum: 0 } }, ["scope", "seq"], READ, (a) => this.#step(a)),
      tool("record", "A page of the history as stored: each entry's canonical bytes and hash, for a verifier or an exact comparison.",
        { scope: scopeArg, cursor: { type: "string" } }, ["scope"], READ, (a) => this.#record(a)),
      tool("sends", "A page of a scope's sends with their attempts and results; or, with outboxId (seq.n, as a receipt lists it), the status of that one send.",
        { scope: scopeArg, outboxId: { type: "string" }, cursor: { type: "string" } }, ["scope"], READ, (a) => this.#sends(a)),
      tool("text", "A retained input by scope, kind and digest: a definition, a foreign entry, a rule's input, a detached text, a snapshot, or a value in its byte domain; paged by bytes with offset.",
        { scope: scopeArg, kind: { enum: ["definition", "entry", "rule", "text", "snapshot", "value"] }, digest: { type: "string" }, domain: { type: "string" }, offset: { type: "integer", minimum: 0 } }, ["scope", "kind", "digest"], READ, (a) => this.#text(a)),
      tool("wait", "Waits at most 60 seconds until one of: a scope's head reaches seq; an item reaches one of states; the scopes an entry created (entry) and the scopes their genesis created exist and are active; a send (outboxId) has a result. Returns what it saw and whether it timed out. Never writes.",
        { scope: scopeArg, seq: { type: "integer", minimum: 0 }, item: { type: "integer", minimum: 0 }, type: { type: "string", description: "the item's type; with item, a final item is found among the retained ones" }, states: { type: "array", items: { type: "string" } }, entry: { type: "integer", minimum: 0 }, outboxId: { type: "string" }, seconds: { type: "integer", minimum: 1, maximum: WAIT_MOST_SECONDS } }, ["scope"], READ, (a) => this.#wait(a)),
      tool("settle", "What is known about the envelope under idempotencyKey on target (or the creation of definition): the act's phase and kept outcome, the scope's settlement for an act that is not final, and each preparation step apart. Signs nothing and sends no act.",
        { target: scopeArg, definition: { type: ["string", "object"] }, idempotencyKey: keyArg, cursor: { type: "string" } }, ["idempotencyKey"], READ, (a) => this.#settle(a)),
      tool("credential", "The one-time read credential for a read-token act your key signed (entry: its seq at the destination), read once from the destination's credential route with your session. Its result is a secret: the credential is in the structured field credential only, with the remote URL beside it. Use it with Git; it is not kept here.",
        { entry: { type: "integer", minimum: 1 }, target: scopeArg }, ["entry"], { ...READ, idempotentHint: false }, (a) => this.#credential(a)),
      tool("actions", "The acts of one scope, as act tools would describe them: each kind with its derived description, input schema, binding and the definition digest to give to act. For a host that lists few tools.",
        { scope: scopeArg, cursor: { type: "string" } }, ["scope"], READ, (a) => this.#actions(a)),
      tool("act", "Signs one act of a scope by its native kind, under the same custody and binding checks as an act tool. digest: the definition digest actions gave; fields as actions describes; idempotencyKey required.",
        { target: scopeArg, kind: { type: "string" }, digest: { type: "string" }, on: { type: "integer", minimum: 0 }, fields: { type: "object" }, texts: { type: "array", items: { type: "string" } }, presented: { type: "object" }, values: { type: "array", items: { type: "string" } }, idempotencyKey: keyArg, resubmit: { type: "boolean" } },
        ["target", "kind", "digest", "idempotencyKey"], WRITE, (a) => (typeof a["kind"] === "string" ? this.#perform(null, a, a["kind"]) : Promise.resolve(failed({ error: "shape", field: "kind", what: "is missing", declared: "a native act kind" }))), ACT_OUTPUT),
    ]);
  }

  /**
   * `room`: the header on every page, and the room's collections (lanes, applications, roots, standing, active definitions, the act
   * tools not held, the scopes not read) paged together by bytes, in that order. The cursor is bound to the layout of those
   * collections, a digest of every entry in order, and not to the tool list's generation: a row the list does not count, such as
   * an application still being created, moves the entries after it. A continuation whose layout no longer holds restarts at the
   * first entry and says so, so no entry is repeated or skipped.
   */
  async #room(args: Args): Promise<CallResult> {
    const s = await this.snapshot();
    const room = s.read.room;
    const heldBy = new Map(s.read.inventory.scopes.map((h) => [h.scope, h] as const));
    const lanes = (room?.lanes ?? []).map((l) => {
      const held = heldBy.get(l.ref.scope);
      return { number: l.number, kind: l.kind, title: l.title, state: l.state, scope: l.ref.scope, definition: held?.definition.name ?? null, digest: held?.pinned ?? null };
    });
    const places = Object.fromEntries(SINGLETON_PLACES.map((p) => [p, s.read.inventory.scopes.find((h) => h.place === p) ?? null]).filter(([, h]) => h !== null).map(([p, h]) => [p, { scope: (h as Held).scope, definition: (h as Held).pinned }]));
    const standing = Object.entries(s.read.inventory.standing).map(([membership, st]) => (st.known ? { membership, handle: st.handle, role: st.role, key: st.key } : { membership, standing: "your standing here is unknown", why: st.reason }));
    const activeName = new Map(s.read.inventory.active.map((a) => [a.digest, a.name] as const));
    const applications = (room?.applications ?? []).map((a) => {
      const held = a.ref ? heldBy.get(a.ref.scope) : undefined;
      return { definition: held?.definition.name ?? (a.digest !== null ? activeName.get(a.digest) ?? null : null), digest: a.digest, scope: a.ref?.scope ?? null, state: a.state };
    });
    const roots = s.read.inventory.scopes.filter((h) => h.place === "root").map((h) => ({ scope: h.scope, definition: h.definition.name, digest: h.pinned, membership: h.membership }));
    const sections = { lanes, applications, roots, standing, active: s.read.inventory.active as unknown[], notHeld: s.hidden as unknown[], unread: s.read.unread as unknown[] };
    type Section = keyof typeof sections;
    const all = (Object.keys(sections) as Section[]).flatMap((section) => sections[section].map((value) => ({ section, value })));
    const header = { service: this.#service, key: this.#port.signer.key, mode: this.mode, generation: s.generation, scopes: places };
    const layout = digestBytes(utf8(canonicalize(all as never)));
    const given = fromCursor<{ l: string; i: number }>(args["cursor"]);
    const moved = given !== null && given.l !== layout;
    const from = given && !moved ? Math.min(given.i, all.length) : 0;
    const { page, next } = pageBy(all, from, pageOf(BOUNDS.room) - bytesOf(header) - 256);
    const out: Record<string, unknown[]> = Object.fromEntries((Object.keys(sections) as Section[]).map((k) => [k, page.filter((e) => e.section === k).map((e) => e.value)]));
    return ok({
      ...header, ...out,
      ...(next !== null ? { cursor: cursorOf({ l: layout, i: next }), more: `This page holds entries ${from + 1} to ${next} of ${all.length}; call room with cursor for the rest.` } : {}),
      ...(moved ? { restarted: "The room's collections changed since the cursor was made; this page restarts at the first entry." } : {}),
    }, BOUNDS.room);
  }

  async #inspect(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const { summary, at } = await this.#summary(scope, membership);
    if (typeof args["describe"] === "string") {
      const definition = await this.#definition(s, summary.definition, scope, membership);
      const kind = args["describe"];
      const act = definition.acts[kind];
      if (!act || kind === definition.genesis) return failed({ error: "shape", field: "describe", what: `is not an act of ${definition.name}`, declared: Object.keys(definition.acts).filter((k) => k !== definition.genesis).join(", ") });
      const binding = s.bindings.find((b) => b.definition === definition.name && b.kind === kind && b.digests.includes(summary.definition));
      const complete = binding ? describedOf(binding, s.read.inventory, this.mode).complete
        : describeAct(definition, kind, act, { standing: "unknown" }, { pinned: summary.definition, active: s.read.inventory.active }, { definition: definition.name, kind, declaration: declarationDigest(definition, kind, summary.definition), digests: [summary.definition] }, "").complete;
      const part = sliceText(complete, Number(args["offset"] ?? 0), pageOf(BOUNDS.large) - 1024);
      return ok({ scope, kind, tool: binding?.name ?? null, text: part.text, ...(part.next !== null ? { offset: part.next } : {}), bytes: part.total }, BOUNDS.large);
    }
    if (args["declaration"] === true) {
      if (isPlatformDefinition(summary.definition)) {
        const data = canonicalize(platform(summary.definition)?.data ?? null);
        const part = sliceText(data, Number(args["offset"] ?? 0), pageOf(BOUNDS.large) - 1024);
        return ok({ scope, definition: summary.definition, platform: true, bytes: part.text, ...(part.next !== null ? { offset: part.next } : {}), total: part.total }, BOUNDS.large);
      }
      const read = await this.#reads.read(membership, (t, r) => t.retained(scope, r, "definition", summary.definition as Digest));
      if (!read.ok) return failed({ error: "read", scope, reason: read.reason });
      const part = sliceText(read.value.bytes, Number(args["offset"] ?? 0), pageOf(BOUNDS.large) - 1024);
      return ok({ scope, definition: summary.definition, bytes: part.text, ...(part.next !== null ? { offset: part.next } : {}), total: part.total }, BOUNDS.large);
    }
    // Live items, paged by bytes, bound to the head the summary was read at. A continuation at a moved head restarts.
    const head = `${at.at.seq}:${at.at.hash}`;
    const given = fromCursor<{ h: string; i: number }>(args["cursor"]);
    const moved = given !== null && given.h !== head;
    const from = given && !moved ? given.i : 0;
    const definitionName = isPlatformDefinition(summary.definition) ? summary.definition : (this.kept.definitions.get(summary.definition)?.name ?? null);
    const counts = summary.counts.filter(([, , n]) => n > 0).map(([type, state, n]) => ({ type, state, n }));
    const header = { scope, ref: summary.scope, definition: definitionName, digest: summary.definition, status: summary.status, head: at.at, counts };
    const { page, next } = pageBy(summary.items, from, pageOf(BOUNDS.inspect) - bytesOf(header) - 256);
    return ok({ ...header, items: page, ...(next !== null ? { cursor: cursorOf({ h: head, i: next }) } : {}), ...(moved ? { restarted: "The head moved since the cursor was made; this page restarts at the first item of the new head." } : {}) }, BOUNDS.inspect);
  }

  async #items(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const type = String(args["type"]);
    if (args["final"] !== true) {
      const { summary, at } = await this.#summary(scope, membership);
      const all = summary.items.filter((i) => i.type === type);
      const from = fromCursor<{ h: string; i: number }>(args["cursor"]);
      const head = `${at.at.seq}:${at.at.hash}`;
      const start = from && from.h === head ? from.i : 0;
      const { page, next } = pageBy(all, start, pageOf(BOUNDS.large));
      return ok({ scope, type, live: true, head: at.at, items: page, ...(next !== null ? { cursor: cursorOf({ h: head, i: next }) } : {}) }, BOUNDS.large);
    }
    const cursor = fromCursor<{ c?: string; i: number }>(args["cursor"]);
    const read = await this.#reads.read(membership, (t, r) => t.items(scope, r, type, cursor?.c));
    if (!read.ok) return failed({ error: "read", scope, reason: read.reason });
    const { page, next } = pageBy(read.value, cursor?.i ?? 0, pageOf(BOUNDS.large));
    const cont = next !== null ? cursorOf({ ...(cursor?.c ? { c: cursor.c } : {}), i: next }) : read.next ? cursorOf({ c: read.next, i: 0 }) : null;
    return ok({ scope, type, live: false, head: read.at, items: page, ...(cont ? { cursor: cont } : {}) }, BOUNDS.large);
  }

  async #steps(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const cursor = fromCursor<{ c?: string; i: number }>(args["cursor"]);
    const read = await this.#reads.read(membership, (t, r) => t.history(scope, r, cursor?.c));
    if (!read.ok) return failed({ error: "read", scope, reason: read.reason });
    const lines = read.value.map(({ entry }) => lineOf(entry));
    const { page, next } = pageBy(lines, cursor?.i ?? 0, pageOf(BOUNDS.large));
    const cont = next !== null ? cursorOf({ ...(cursor?.c ? { c: cursor.c } : {}), i: next }) : read.next ? cursorOf({ c: read.next, i: 0 }) : null;
    return ok({ scope, head: read.at, steps: page, ...(cont ? { cursor: cont } : {}) }, BOUNDS.large);
  }

  async #step(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const seq = Number(args["seq"]);
    const read = await this.#reads.read(membership, (t, r) => t.entry(scope, r, seq));
    if (!read.ok) return failed({ error: "read", scope, reason: read.reason });
    const whole = canonicalize(read.value);
    const part = sliceText(whole, Number(args["offset"] ?? 0), pageOf(BOUNDS.large) - 1024);
    if (part.next === null && Number(args["offset"] ?? 0) === 0) return ok({ scope, seq, hash: read.value.hash, entry: read.value.entry }, BOUNDS.large);
    return ok({ scope, seq, hash: read.value.hash, json: part.text, ...(part.next !== null ? { offset: part.next } : {}), bytes: part.total }, BOUNDS.large);
  }

  async #record(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const cursor = fromCursor<{ c?: string; i: number }>(args["cursor"]);
    const read = await this.#reads.read(membership, (t, r) => t.log(scope, r, cursor?.c));
    if (!read.ok) return failed({ error: "read", scope, reason: read.reason });
    const { page, next } = pageBy(read.value.entries, cursor?.i ?? 0, pageOf(BOUNDS.large));
    const cont = next !== null ? cursorOf({ ...(cursor?.c ? { c: cursor.c } : {}), i: next }) : read.next ? cursorOf({ c: read.next, i: 0 }) : null;
    return ok({ scope: read.value.scope, definition: read.value.definition, head: read.at, entries: page, ...(cont ? { cursor: cont } : {}) }, BOUNDS.large);
  }

  async #sends(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const reader = await this.#reads.reader(membership);
    if (typeof args["outboxId"] === "string") {
      const read = await this.#reads.transport.outboxItem(scope, reader, args["outboxId"] as `${number}.${number}`);
      return read.ok ? ok({ scope, outboxItem: read.value, head: read.at }, BOUNDS.large) : failed({ error: "read", scope, reason: read.reason });
    }
    const cursor = fromCursor<{ c?: string; i: number }>(args["cursor"]);
    const read = await this.#reads.transport.outbox(scope, reader, cursor?.c);
    if (!read.ok) return failed({ error: "read", scope, reason: read.reason });
    const { page, next } = pageBy(read.value, cursor?.i ?? 0, pageOf(BOUNDS.large));
    const cont = next !== null ? cursorOf({ ...(cursor?.c ? { c: cursor.c } : {}), i: next }) : read.next ? cursorOf({ c: read.next, i: 0 }) : null;
    return ok({ scope, head: read.at, sends: page, ...(cont ? { cursor: cont } : {}) }, BOUNDS.large);
  }

  async #text(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const kind = String(args["kind"]) as "definition" | "entry" | "rule" | "text" | "snapshot" | "value";
    const digest = String(args["digest"]) as Digest;
    const domain = typeof args["domain"] === "string" ? args["domain"] : undefined;
    const read = await this.#reads.read(membership, (t, r) => t.retained(scope, r, kind, digest, domain));
    if (!read.ok) return failed({ error: "read", scope, reason: read.reason });
    let value = read.value.bytes;
    if (kind === "text") { try { const t = parseStrict(value); if (typeof t === "string") value = t; } catch { /* kept as bytes */ } }
    const part = sliceText(value, Number(args["offset"] ?? 0), pageOf(BOUNDS.large) - 1024);
    return ok({ scope, kind, digest, ...(read.value.domain ? { domain: read.value.domain } : {}), text: part.text, ...(part.next !== null ? { offset: part.next } : {}), bytes: part.total }, BOUNDS.large);
  }

  async #prepare(args: Args): Promise<CallResult> {
    if (typeof args["capability"] !== "string" || typeof args["step"] !== "string") return failed({ error: "shape", field: "capability or step", what: "is missing", declared: "text" });
    // A capability's name and a step are short words of the contract: anything longer is refused before anything is signed or kept,
    // so neither the record nor any result repeats it.
    for (const field of ["capability", "step"] as const) {
      if (utf8(args[field] as string).length > NAME_BYTES) return failed({ error: "shape", field, what: `is longer than ${NAME_BYTES} bytes`, declared: "a capability's name, such as hold@1, or one of its steps" });
    }
    if (typeof args["kind"] !== "string") return this.#standalone(args, args["capability"], args["step"]);
    return this.#perform(null, args, args["kind"], { resource: args["resource"], capability: args["capability"], step: args["step"] });
  }

  /**
   * A capability step with no act, such as `hold@1:instance`: the intent is the step's own, of kind `<capability>:<step>`, to the
   * resource, with the step's fields and no expected revisions, signed by this server's key. It is kept under custody under the
   * caller's key before it is sent, and its answers are kept as the step's, apart from any act: the record is never submitted.
   */
  async #standalone(args: Args, capability: string, step: string): Promise<CallResult> {
    const key = args["idempotencyKey"];
    if (!validKey(key)) return failed({ error: "shape", field: "idempotencyKey", what: "is missing, or not 1 to 128 bytes of UTF-8", declared: "a key you choose and keep" });
    if (args["target"] !== undefined && args["target"] !== args["resource"]) return failed({ error: "shape", field: "target", what: "is not taken by a step with no act: the step's intent goes to the resource", declared: "resource only" });
    const fields = isRecord(args["fields"]) ? args["fields"] as Record<string, FieldValue> : {};
    const s = await this.#current();
    const resource = await this.#scope(s, args["resource"]);
    const { summary } = await this.#summary(resource.scope, resource.membership);
    const identity: Identity = { service: this.#service, membership: resource.membership, signer: this.#port.signer.key, target: summary.scope, key: key as string };
    const kind = `${capability}:${step}`;
    const build = async () => ({
      binding: { definition: capability, kind, declaration: null, pinned: summary.definition },
      envelope: { signed: await signedIntent(this.#port.signer, { to: summary.scope, kind, on: null, fields, expected: {} }, { idempotencyKey: key as string, now: this.#now() }), beside: {} } as Envelope,
    });
    const notAfter = timeOf(this.#now() + PROPOSED_BOUNDS.intentLifetimeSeconds * 1000);
    await this.custody.keep(identity, meaningOf({ standalone: kind, fields }), build, notAfter, bytesOf(fields), { standalone: true });
    const stepped = await this.custody.step(identity, summary.scope, capability, step, async (signed) => {
      try { return await this.#reads.transport.prepare(resource.scope, signed, [], capability, step); }
      catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
    });
    const said = stepped.answer === null
      ? { sentence: `The reply from ${resource.scope} to step ${step} of ${capability} was lost; this step's outcome is unknown.`, next: "Call prepare again with the same arguments: the same signed step is sent again, and the resource answers it with its first entry." }
      : { sentence: `${resource.scope} answered step ${step} of ${capability}, a step with no act: ${stepped.answer.answer}${stepped.answer.answer === "refused" ? ` (${stepped.answer.reason}${stepped.answer.name ? `, ${stepped.answer.name}` : ""})` : ""}.${stepped.retained ? " This answer was kept from before; nothing was sent." : ""}`, next: "settle with the resource as target and the same key shows this step." };
    return ok({ step: { resource: resource.scope, capability, step, phase: stepped.step.phase, answer: stepped.answer === null ? null : projectAnswer(stepped.answer) }, intent: intentDigest(stepped.record.envelope.signed.intent), ...said });
  }

  async #settle(args: Args): Promise<CallResult> {
    const key = args["idempotencyKey"];
    if (!validKey(key)) return failed({ error: "shape", field: "idempotencyKey", what: "is missing, or not 1 to 128 bytes", declared: "the key you gave" });
    const s = await this.#current();
    let identity: Identity;
    let scope: ScopeId | null = null;
    if (args["target"] !== undefined) {
      const at = await this.#scope(s, args["target"]);
      scope = at.scope;
      const { summary } = await this.#summary(at.scope, at.membership);
      identity = { service: this.#service, membership: at.membership, signer: this.#port.signer.key, target: summary.scope, key: key as string };
    } else if (args["definition"] !== undefined) {
      const named = creationName(args["definition"]);
      if (!named) return failed({ error: "shape", field: "definition", what: "is not a platform name, a digest or a definition", declared: "the definition the creation named" });
      identity = { service: this.#service, membership: await this.#membershipRef(args["membership"]), signer: this.#port.signer.key, target: { create: named }, key: key as string };
    } else return failed({ error: "target", what: "give target, or definition for a creation" });
    const settled = await this.custody.settle(identity, async (envelope) => {
      if (envelope.creation) {
        // A creation settles by the scope it created: its genesis carries the creation intent.
        const kind = isPlatformDefinition(envelope.creation.definition) && envelope.creation.definition.startsWith("platform:register@") ? "register" : "directory";
        const definition = typeof envelope.creation.definition === "string" ? envelope.creation.definition : definitionDigest(envelope.creation.definition);
        const created = scopeIdOf({ v: 1, kind, definition, creator: null, cause: intentDigest(envelope.signed.intent), ordinal: 0 } as Seed);
        try {
          const read = await this.#reads.transport.settle(created, envelope.signed);
          return read.ok ? read.value : null;
        } catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
      }
      try {
        const read = await this.#reads.transport.settle(scope!, envelope.signed);
        return read.ok ? read.value : null;
      } catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
    });
    if (!settled) return ok({ answer: "not-found", sentence: `No record is kept under key ${String(key)} for that target.`, next: "Nothing was sent under this key from this server; sign with it." });
    const record = settled.record;
    const last = settled.decided;
    const receipt: Receipt | null = settled.receipt ?? (last?.answer.answer === "accepted" ? last.answer.receipt : null);
    // Each step by its latest answer, projected, and how many it has had; the steps paged by bytes with a cursor.
    const allSteps = Object.entries(record.steps).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, st]) => {
      const latest = st.answers.at(-1)?.answer ?? null;
      return { resource: st.resource.scope, capability: st.capability, step: st.step, phase: st.phase, answer: latest?.answer ?? "unknown", last: latest ? projectAnswer(latest) : null, answers: st.answers.length };
    });
    const fromStep = fromCursor<{ i: number }>(args["cursor"])?.i ?? 0;
    const { page: steps, next: nextStep } = pageBy(allSteps, fromStep, pageOf(BOUNDS.act) - 1536);
    const answer = record.phase === "accepted" ? "accepted" : record.phase === "refused" ? "refused" : record.phase === "mismatch" ? "mismatch" : record.phase === "settled" ? "settled" : "unknown";
    const sentence = answer === "settled" ? `Under key ${String(key)}, every capability step is decided; no act is kept under this key.`
      : answer === "accepted" ? `The act under key ${String(key)} was accepted: entry ${receipt?.fact.seq}.`
      : answer === "refused" ? `The act under key ${String(key)} was refused; the refusal is kept.`
      : answer === "mismatch" ? `The key ${String(key)} is on another intent of your key at that scope.`
      : `The outcome under key ${String(key)} is unknown: the scope gave no receipt for the exact envelope. The record stays unknown.`;
    return ok({ answer, phase: record.phase, sentence, next: answer === "unknown" ? "Call the same tool again with the same idempotencyKey: it resends the same envelope." : "Nothing more is needed.", ...(receipt ? { fact: receipt.fact, outboxIds: receipt.sends } : {}), outcomes: record.count, attempt: record.attempt, last: last ? { at: last.at, ...projectAnswer(last.answer) } : null, steps, ...(nextStep !== null ? { cursor: cursorOf({ i: nextStep }), more: `Steps ${fromStep + 1} to ${nextStep} of ${allSteps.length}; call settle with cursor for the rest.` } : {}) });
  }

  async #membershipRef(given: unknown): Promise<ScopeRef | null> {
    if (given === undefined || given === null) return null;
    if (isScopeRef(given)) return given;
    if (typeof given === "string" && isScopeId(given)) {
      const read = await this.#reads.read(null, (t, r) => t.summary(given, r));
      if (read.ok) return read.value.scope;
      return stop({ error: "read", scope: given, reason: read.reason });
    }
    return stop({ error: "shape", field: "membership", what: "is not a membership scope", declared: "a scope ID or { scope, inc, kind }" });
  }

  async #create(args: Args): Promise<CallResult> {
    const key = args["idempotencyKey"];
    if (!validKey(key)) return failed({ error: "shape", field: "idempotencyKey", what: "is missing, or not 1 to 128 bytes", declared: "a key you choose and keep" });
    const given = args["definition"];
    let definition: DeclaredDefinition | Digest | PlatformDefinition;
    let data: DefinitionLike | null = null;
    if (typeof given === "string" && isPlatformDefinition(given)) { definition = given; data = (platform(given)?.data as unknown as DefinitionLike | undefined) ?? null; }
    else if (typeof given === "string" && isDigest(given)) { definition = given; data = (this.kept.definitions.get(given) as unknown as DefinitionLike | undefined) ?? null; }
    else if (isRecord(given)) { definition = given as unknown as DeclaredDefinition; data = given as unknown as DefinitionLike; }
    else return failed({ error: "shape", field: "definition", what: "is not a platform name, a digest or a definition", declared: "platform:<name>@<n>, sha256:..., or a definition's JSON" });
    if (!data) return failed({ error: "shape", field: "definition", what: "names a definition this server cannot read; give its JSON", declared: "a definition" });
    const kind = String(args["kind"] ?? "");
    if (kind !== data.genesis) return failed({ error: "shape", field: "kind", what: `is not the genesis act of ${data.name}`, declared: data.genesis });
    const act = data.acts[kind]!;
    const named = creationName(definition)!;
    const membership = await this.#membershipRef(args["membership"]);
    const fieldsGiven = isRecord(args["fields"]) ? args["fields"] : {};
    const textsGiven = Array.isArray(args["texts"]) ? args["texts"].filter((t): t is string => typeof t === "string") : [];
    const definitions = Array.isArray(args["definitions"]) ? args["definitions"].filter(isRecord) as unknown as DeclaredDefinition[] : [];
    const identity: Identity = { service: this.#service, membership, signer: this.#port.signer.key, target: { create: named }, key: key as string };
    const meaning = meaningOf({ kind, definition: named, fields: fieldsGiven, texts: textsGiven.map(textDigest).sort(), definitions: definitions.map((d) => definitionDigest(d)).sort() });
    const build = async () => {
      let shaped: { fields: Record<string, FieldValue>; texts: string[] };
      try { shaped = shapeFields(act, fieldsGiven, textsGiven, membership); }
      catch (error) { if (error instanceof Unshaped) return stop({ error: "shape", field: error.field, what: error.what, declared: error.declared }); throw error; }
      // A creation intent's kind is the creation's, not the genesis act's: `install` for a register, `found` for any other scope
      // with no creator (the scope contract, section 7.1). The genesis act then applies with the intent's fields.
      const creation = data!.name === "platform:register" ? "install" : "found";
      const signed = await signedIntent(this.#port.signer, { to: null, kind: creation, fields: shaped.fields }, { idempotencyKey: key as string, now: this.#now() });
      return { binding: { definition: data!.name, kind, declaration: null, pinned: named }, envelope: { signed, beside: shaped.texts.length > 0 ? { texts: shaped.texts } : {}, creation: { definition, definitions } } as Envelope };
    };
    const notAfter = timeOf(this.#now() + PROPOSED_BOUNDS.intentLifetimeSeconds * 1000);
    const kept = await this.custody.send(identity, meaning, build, async (envelope) => {
      try {
        const created = await this.#reads.transport.create(envelope.signed, envelope.creation!.definition, envelope.creation!.definitions, envelope.beside);
        // A creation has no mismatch and its refusal names no head: give it the shape of an act's answer.
        return created.answer === "refused" ? { answer: "refused", reason: created.reason as never, judgedAt: { seq: 0, hash: "sha256:" + "0".repeat(64) } as never } : created as Answer;
      } catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
    }, { ...(args["resubmit"] === true ? { resubmit: true } : {}), notAfter, bytes: bytesOf({ definition: args["definition"], fields: fieldsGiven, texts: textsGiven, definitions }) });
    if ("lost" in kept) return failed({ error: "transport", scope: "the creation", submitted: true });
    if (kept.answer.answer === "accepted") {
      const scope = kept.answer.receipt.fact.at.scope;
      const config = await this.#port.config.read();
      if (!(config.roots ?? []).some((r) => r.scope === scope)) await this.#port.config.addRoot({ scope, membership } satisfies Root);
      this.#invalidate();
    }
    const said = kept.answer.answer === "accepted"
      ? { sentence: `Created ${kept.answer.receipt.fact.at.kind} ${kept.answer.receipt.fact.at.scope} under ${data.name}; it is recorded in your configuration's standalone scopes.`, next: "Call wait with the scope and entry 0 to see what its genesis created; tools/list now lists its acts." }
      : answered(kept.answer, { scope: "the creation", kind }, null);
    return ok(this.#answerOf(kept.answer, { scope: kept.answer.answer === "accepted" ? kept.answer.receipt.fact.at.scope : "the creation", kind, tool: "create", retained: kept.retained, said, phase: kept.record.phase }));
  }

  /**
   * `join`: membership's `join` for an invitation link, under custody, with no pre-join reads: the link names membership's
   * version and its scope. On acceptance, the entry is read and checked against the request kept, its inbox found, and the
   * room recorded in the configuration; the list is derived again on the next call.
   */
  async #join(args: Args): Promise<CallResult> {
    const key = args["idempotencyKey"];
    if (!validKey(key)) return failed({ error: "shape", field: "idempotencyKey", what: "is missing, or not 1 to 128 bytes of UTF-8", declared: "a key you choose and keep" });
    const link = typeof args["link"] === "string" ? invitationOf(args["link"].trim()) : null;
    if (!link || !wellFormedInvitation(link)) return failed({ error: "shape", field: "link", what: "is no invitation link from dap invite, or its repository references are not well formed", declared: "artroom-invite:..." });
    const config = await this.#port.config.read();
    if (config.repository && config.repository.membership.scope !== link.repository.membership.scope) return failed({ error: "target", what: `this configuration has a room already (directory ${config.repository.directory.scope}); use another ARTROOM_HOME to join another` });
    if (this.#service !== "" && this.#service !== link.service) return failed({ error: "target", what: `the link names the service ${clip(link.service)}, and this server serves ${this.#service}` });
    if (this.#service === "") { this.#service = link.service; this.#reads = this.#readsOf(link.service); }
    const named = (link.definition ?? "platform:membership@1") as PlatformDefinition;
    const membershipData = platform(named)?.data as unknown as DefinitionLike | undefined;
    const act = membershipData?.name === "platform:membership" ? membershipData.acts["join"] : undefined;
    if (!act) return failed({ error: "target", what: `the invitation is in ${clip(named)}, which this server does not know as membership` });
    const M = link.repository.membership;
    const fields = invitationRedemptionFields(named, M, link.invitation, this.#port.signer.key, link.secret);
    const identity: Identity = { service: this.#service, membership: M, signer: this.#port.signer.key, target: M, key: key as string };
    const meaning = meaningOf({ join: textDigest(canonicalize(link as never)) });
    const build = async () => ({
      binding: { definition: "platform:membership", kind: "join", declaration: declarationDigest(membershipData!, "join", named), pinned: named },
      envelope: { signed: await signedIntent(this.#port.signer, { to: M, kind: "join", fields, expected: expectedOf(act, [], null, effectiveFields(act, fields, M)) }, { idempotencyKey: key as string, now: this.#now() }), beside: {} } as Envelope,
    });
    const notAfter = timeOf(this.#now() + PROPOSED_BOUNDS.intentLifetimeSeconds * 1000);
    const kept = await this.custody.send(identity, meaning, build, async (envelope) => {
      try { return await this.#reads.transport.submit(M.scope, envelope.signed, [], envelope.beside); }
      catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
    }, { notAfter, bytes: bytesOf(fields) });
    if ("lost" in kept) return failed({ error: "transport", scope: M.scope, submitted: true });
    const asked = { scope: M.scope, kind: "join", on: null, action: null };
    if (kept.answer.answer !== "accepted") return ok(this.#answerOf(kept.answer, { scope: M.scope, kind: "join", tool: "join", retained: kept.retained, said: answered(kept.answer, asked, []), phase: kept.record.phase }));
    // The admitted entry, read as the member the join made: it must hold the exact request kept, and it names the inbox.
    this.#reads.forget(M.scope);
    const fact = kept.answer.receipt.fact;
    const entry = await this.#reads.read(M, (t, r) => t.entry(M.scope, r, fact.seq));
    if (!entry.ok) return failed({ error: "read", scope: M.scope, reason: entry.reason });
    const input = entry.value.entry.input;
    if (entry.value.hash !== fact.hash || input.type !== "act" || canonicalize(input.signed) !== canonicalize(kept.record.envelope.signed)) {
      return failed({ error: "target", what: `entry ${M.scope}:${fact.seq} does not hold the join kept under this key` });
    }
    const inbox = entry.value.entry.sends.flatMap((send) => ("creator" in send.to && send.to.kind === "inbox" ? [scopeIdOf(send.to as Seed)] : []))[0];
    if (!inbox) return failed({ error: "target", what: `entry ${M.scope}:${fact.seq} creates no inbox` });
    const repository = { ...link.repository, inbox };
    if (this.#port.config.joined) await this.#port.config.joined({ service: link.service, repository, handle: link.handle });
    else if (this.#port.config.setRepository) await this.#port.config.setRepository(repository);
    this.#invalidate();
    return ok({
      ...this.#answerOf(kept.answer, { scope: M.scope, kind: "join", tool: "join", retained: kept.retained, said: { sentence: `Joined as ${link.handle} on key ${this.#port.signer.key}: entry ${M.scope}:${fact.seq}. The room is recorded in your configuration.`, next: "Call wait with scope inbox and seq 0 until your inbox exists; then room. tools/list now lists the room's acts for your role." }, phase: kept.record.phase }),
      handle: link.handle, repository,
    });
  }

  async #wait(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const seconds = Math.min(WAIT_MOST_SECONDS, Math.max(1, Number(args["seconds"] ?? WAIT_MOST_SECONDS)));
    const pause = this.#port.pause ?? (() => new Promise<void>((resolve) => { setTimeout(resolve, 1000); }));
    let waiting: ScopeId[] = [scope];
    const poll = async (): Promise<Record<string, unknown> | null> => {
      if (typeof args["outboxId"] === "string") {
        const read = await this.#reads.transport.outboxItem(scope, await this.#reads.reader(membership), args["outboxId"] as `${number}.${number}`);
        return read.ok && (read.value.result !== null || read.value.diagnosis !== null) ? { outboxItem: read.value } : null;
      }
      if (typeof args["entry"] === "number") return this.#created(scope, membership, args["entry"], (w) => { waiting = [scope, ...w]; });
      const read = await this.#reads.read(membership, (t, r) => t.summary(scope, r));
      if (!read.ok) return null;
      if (typeof args["seq"] === "number") return read.at.seq >= args["seq"] ? { head: read.at } : null;
      const states = Array.isArray(args["states"]) ? args["states"] as string[] : [];
      if (typeof args["item"] === "number" || typeof args["type"] === "string") {
        const match = (i: Item) => (typeof args["item"] === "number" ? i.id === args["item"] : i.type === args["type"]) && (states.length === 0 || states.includes(i.state));
        const item = read.value.items.find(match);
        if (item) return { item, head: read.at };
        // An item in a final state is no longer live: with its type, the retained final items are read too, following the pages
        // across polls, a few pages a poll, from where the last poll stopped; at the last page the search starts over.
        if (typeof args["item"] === "number" && typeof args["type"] === "string" && !read.value.items.some((i) => i.id === args["item"])) {
          const key = `final ${scope} ${args["type"]}`;
          let cursor = this.#pages.get(key);
          for (let n = 0; n < SEARCH_PAGES; n++) {
            const final = await this.#reads.read(membership, (t, r) => t.items(scope, r, args["type"] as string, cursor));
            if (!final.ok) break;
            const matched = final.value.find(match);
            if (matched) { this.#pages.delete(key); return { item: matched, head: read.at, final: true }; }
            cursor = final.next;
            if (cursor === undefined) break;
          }
          this.#pages.set(key, cursor);
        }
        return null;
      }
      return read.value.status === "active" ? { head: read.at, status: "active" } : null;
    };
    for (let n = 0; n < seconds; n++) {
      const seen = await poll();
      if (seen) return ok({ scope, timedOut: false, polls: n + 1, ...seen });
      await pause(waiting);
    }
    return ok({ scope, timedOut: true, polls: seconds, sentence: `Nothing reached the state asked within ${seconds} seconds. What was asked may still take effect.`, next: "Call wait again." });
  }

  /** The scopes entry `seq` created, read by its sends and, for an entry whose creation an outside answer completes, by the later entries whose sends the entry's intent caused; then what their genesis created. */
  async #created(scope: ScopeId, membership: ScopeRef | null, seq: number, waiting: (scopes: ScopeId[]) => void): Promise<Record<string, unknown> | null> {
    const read = await this.#reads.read(membership, (t, r) => t.entry(scope, r, seq));
    if (!read.ok) return null;
    const entry = read.value.entry;
    const seeds: { n: number; seed: Seed; from: number }[] = entry.sends.flatMap((send) => ("creator" in send.to ? [{ n: send.n, seed: send.to as Seed, from: seq }] : []));
    if (seeds.length === 0 && entry.input.type === "act") {
      // A creation that an outside answer completes, as the register's `found`: a later entry sends the create, caused by this intent.
      // The search reads a few entries a poll and goes on from where it stopped, with no limit on how far; once it finds the entry,
      // it starts there.
      const cause = intentDigest(entry.input.signed.intent);
      const key = `created ${scope} ${seq}`;
      let next = this.#searches.get(key) ?? seq + 1;
      for (let n = 0; n < SEARCH_ENTRIES && seeds.length === 0; n++, next++) {
        const at = next;
        const later = await this.#reads.read(membership, (t, r) => t.entry(scope, r, at));
        if (!later.ok) break;
        for (const send of later.value.entry.sends) if ("creator" in send.to && (send.to as Seed).cause === cause) seeds.push({ n: send.n, seed: send.to as Seed, from: at });
        if (seeds.length > 0) break;
      }
      this.#searches.set(key, next);
    }
    if (seeds.length === 0) return null;
    const children: { scope: ScopeId; ref: ScopeRef | null; kind: string; definition: string; status: string | null; by: string }[] = [];
    const queue = seeds.map((s) => ({ ...s, by: `${scope}:${s.from}.${s.n}`, depth: 0 }));
    while (queue.length > 0) {
      const next = queue.shift()!;
      const id = scopeIdOf(next.seed);
      // A child's own reads go with the same membership; a signed read is the fallback where the cause chain allows it.
      const child = await this.#reads.read(membership, (t, r) => t.summary(id, r));
      const status = child.ok ? child.value.status : null;
      children.push({ scope: id, ref: child.ok ? child.value.scope : null, kind: next.seed.kind, definition: String(next.seed.definition), status, by: next.by });
      if (status === "active" && next.depth === 0) {
        const genesis = await this.#reads.read(membership, (t, r) => t.entry(id, r, 0));
        if (genesis.ok) for (const send of genesis.value.entry.sends) if ("creator" in send.to) queue.push({ n: send.n, seed: send.to as Seed, from: 0, by: `${id}:0.${send.n}`, depth: 1 });
      }
    }
    waiting(children.map((c) => c.scope));
    if (!children.every((c) => c.status === "active")) return null;
    await this.#remember(entry, children);
    return { created: children.map(({ ref: _ref, ...c }) => c) };
  }

  /**
   * A room the caller's own claim created, or the caller's own inbox, is recorded in the configuration, as `dap create` and
   * `join` record them, so the next list holds the room's scopes. Only an entry the caller's key signed is followed.
   */
  async #remember(entry: Entry, children: readonly { ref: ScopeRef | null; kind: string }[]): Promise<void> {
    const set = this.#port.config.setRepository;
    if (!set || entry.input.type !== "act" || entry.input.signed.intent.actor !== this.#port.signer.key) return;
    const of = (kind: string) => children.find((c) => c.kind === kind)?.ref ?? null;
    const config = await this.#port.config.read();
    const [directory, membership, rules, destination, inbox] = ["directory", "membership", "rules", "destination", "inbox"].map(of);
    if (!config.repository && directory && membership && rules && destination) {
      await set({ directory, membership, rules: rules.scope, destination: destination.scope });
      this.#reads.forget(membership.scope);
      this.#invalidate();
    } else if (config.repository && inbox && !config.repository.inbox && entry.at.scope === config.repository.membership.scope) {
      await set({ ...config.repository, inbox: inbox.scope });
      this.#invalidate();
    }
  }

  async #credential(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const target = args["target"] ?? "destination";
    const { scope, membership } = await this.#scope(s, target);
    const seq = Number(args["entry"]);
    const reader = await this.#reads.reader(membership);
    if (reader === null) return failed({ error: "credential", destination: scope, why: "no read session is given here, and only a session reads a credential" });
    const opening = await this.#reads.read(membership, (t, r) => t.entry(scope, r, seq));
    if (!opening.ok) return failed({ error: "credential", destination: scope, why: `entry ${seq}: ${opening.reason}` });
    const input = opening.value.entry.input;
    if (input.type !== "act" || input.signed.intent.kind !== "read-token" || input.signed.intent.actor !== this.#port.signer.key) return failed({ error: "credential", destination: scope, why: `entry ${seq} is no read-token act your key signed` });
    // The mint's outcome: searched a few entries a call, going on from where the last call stopped, with no limit on how far.
    const operation = `${seq}:0`;
    const key = `credential ${scope} ${seq}`;
    let handle: string | null = null;
    let ended: string | null = null;
    let next = this.#searches.get(key) ?? seq + 1;
    for (let n = 0; n < SEARCH_ENTRIES && handle === null && ended === null; n++, next++) {
      const at = next;
      const got = await this.#reads.read(membership, (t, r) => t.entry(scope, r, at));
      if (!got.ok) break;
      const i = got.value.entry.input;
      if (i.type === "outcome" && i.operation === operation) {
        if (i.result !== "confirmed") ended = i.result;
        else { const body = i.evidence.body as { token?: unknown }; if (typeof body?.token === "string") handle = body.token; }
        break;
      }
    }
    this.#searches.set(key, next);
    if (ended) return failed({ error: "credential", destination: scope, why: `the mint of entry ${seq} is ${ended}` });
    if (handle === null) return failed({ error: "credential", destination: scope, why: `the mint of entry ${seq} has no outcome up to entry ${next - 1}; call credential again, which goes on from entry ${next}, or wait first` });
    let answer: Read<{ token: string; ends: string; remote: string }>;
    try { answer = await readCredential(this.#service, scope, reader, handle, this.#fetch ? { fetch: this.#fetch } : {}); }
    catch { return failed({ error: "credential", destination: scope, why: "the credential reply was unavailable or invalid; the one-time credential may have been consumed" }); }
    if (!answer.ok) return failed({ error: "credential", destination: scope, why: answer.reason });
    const structured = { credential: answer.value.token, remote: answer.value.remote, ends: answer.value.ends, entry: seq };
    // The text holds no credential: it says where the one structured field is.
    return { content: [{ type: "text", text: JSON.stringify({ ...structured, credential: "(secret: in structuredContent.credential only)" }) }], structuredContent: structured, isError: false };
  }

  async #actions(args: Args): Promise<CallResult> {
    const s = await this.#current();
    const { scope, membership } = await this.#scope(s, args["scope"]);
    const summary = await this.#target(scope, membership);
    const definition = await this.#definition(s, summary.definition, scope, membership);
    const held = s.read.inventory.scopes.find((h) => h.scope === scope);
    const inventory: Inventory = held ? s.read.inventory : { ...s.read.inventory, scopes: [...s.read.inventory.scopes, { scope, ref: summary.scope, place: "root", pinned: summary.definition, definition, membership: membership?.scope ?? null }] };
    const bindings = bindingsOf(inventory, this.words).filter((b) => b.scopes.some((h) => h.scope === scope));
    const acts = bindings.filter((b) => listed(b, inventory)).map((b) => {
      const text = describedOf(b, inventory, "generic");
      return { kind: b.kind, tool: this.mode === "add" ? b.name : null, description: text.description, fields: Object.fromEntries(Object.entries(b.act.fields).map(([n, f]) => [n, schemaOf(f, { pinned: b.pinned, active: inventory.active })])), on: onOf(b.act), binding: { definition: b.definition, declaration: b.declaration, digests: b.digests } };
    });
    const from = fromCursor<{ i: number }>(args["cursor"])?.i ?? 0;
    const { page, next } = pageBy(acts, from, pageOf(BOUNDS.large));
    return ok({ scope, definition: definition.name, digest: summary.definition, acts: page, notHeld: bindings.filter((b) => !listed(b, inventory)).map((b) => b.kind), ...(next !== null ? { cursor: cursorOf({ i: next }) } : {}) }, BOUNDS.large);
  }
}

/** One entry in one line: seq, time, what, by which key, and its effect and send counts. */
function lineOf(entry: Entry): Record<string, unknown> {
  const input = entry.input;
  const kind = input.type === "act" || input.type === "preparation" ? input.signed.intent.kind : input.type === "genesis" ? input.kind : input.type === "outcome" ? `${input.kind} ${input.result}` : input.type;
  const signer = input.type === "act" || input.type === "preparation" ? input.signed.intent.actor : null;
  return { seq: entry.seq, time: entry.time, input: input.type, kind, signer, effects: entry.effects.length, sends: entry.sends.length };
}

/** The value of a creation's identity: the platform name or the digest. */
function creationName(definition: unknown): Digest | PlatformDefinition | null {
  if (typeof definition === "string" && (isPlatformDefinition(definition) || isDigest(definition))) return definition;
  if (isRecord(definition)) { try { return definitionDigest(definition as unknown as DeclaredDefinition); } catch { return null; } }
  return null;
}

/** The digest of a value in its byte domain, as the scope computes it to match a field. */
function valueDigest(domain: string, bytes: string): string {
  return digestBytes(utf8(`${domain}\n${bytes}`));
}

export type { Item };
