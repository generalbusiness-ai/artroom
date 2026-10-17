/**
 * A STAND-IN scope service for the Node tests: the scope routes over HTTP, answered from memory. It judges nothing: each act is
 * accepted and written as an entry, unless the test scripts another answer for its kind. Its membership issues a read session
 * whose token is a test secret, its destination mints a read credential once for each `read-token` it accepted, and it counts
 * every request. It shows what the server sends, reads and returns; it shows nothing about a scope's judgment, which the
 * `*.scope.test.ts` stories show on the real test Worker.
 */
import type { Answer, DeclaredDefinition, Digest, Entry, Input, Item, KeyId, PlatformDefinition, Receipt, ScopeId, ScopeKind, ScopeRef, Sealed, Seed, SignedIntent } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, entryHash, factRefOf, intentDigest, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import type { McpConfig } from "../../src/index.ts";

export const SERVICE = "https://scopes.test";
export const SESSION_TOKEN = "STANDIN-SESSION-TOKEN-must-never-appear";
export const READ_CREDENTIAL = "STANDIN-READ-CREDENTIAL-must-appear-once";
const T = "2099-01-01T00:00:00Z";

/**
 * One scope of the stand-in. Its items are two traversals, as a scope's are: `items`, the live ones its summary holds, and
 * `final`, the retained final ones its items route pages; the items tool's `final: true` reads the second, separately.
 */
interface Scope { ref: ScopeRef; definition: Digest | PlatformDefinition; entries: Sealed[]; items: Item[]; retained: Map<string, string>; final: Item[] }

/** How many retained final items one page of the stand-in's items route holds: small, so a search crosses pages. */
export const FINAL_PAGE = 2;

const item = (id: number, type: string, state: string, values: Record<string, unknown> = {}, refs: Record<string, unknown> = {}): Item =>
  ({ id, type, state, revision: 0, opened: null, parties: {}, refs, values, attributed: [] }) as unknown as Item;

export class StandIn {
  readonly scopes = new Map<ScopeId, Scope>();
  /** Scripted answers by act kind: a function of the signed intent, or undefined to accept. */
  readonly answers = new Map<string, (signed: SignedIntent) => Answer | undefined>();
  /** Every request, as `METHOD path`. */
  readonly requests: string[] = [];
  readonly credentials = new Map<string, boolean>();
  /** How membership answers a session request, and whether reads with a session are then refused: issue, refuse, or forbid. */
  sessions: "issue" | "refuse" | "forbid" = "issue";
  /** When an issued session ends. */
  sessionEnds = "2099-01-01T00:10:00Z";
  /** Timed entries written between a read token's act and its mint's outcome: a long history between them. */
  fillerBeforeOutcome = 0;
  membership!: ScopeRef; directory!: ScopeRef; rules!: ScopeRef; destination!: ScopeRef;

  constructor(readonly key: KeyId, role = "admin", actions: readonly string[] = ["membership.manage", "membership.invite", "rules.activate", "rules.publish", "destination.read-token", "issue.open", "inbox.own"]) {
    this.membership = this.add("membership", "platform:membership@2", [item(0, "roster", "active", { adminActions: [], maintainerActions: [], memberActions: [], agentActions: [], checkerActions: [], [`${role}Actions`]: actions }), item(1, "member", "active", { handle: "@agent", role, kind: "person" }), item(2, "key", "active", { id: key }, { member: 1 })]);
    this.rules = this.add("rules", "platform:rules@2", [item(0, "rules", "published")]);
    this.destination = this.add("destination", "platform:destination@3", [item(0, "branch", "ready", { repository: { host: "artifacts", namespace: "n", name: "r", id: "1" } })]);
    this.directory = this.add("directory", "platform:directory@3", [item(0, "repository", "open", {}, { membership: this.membership, rules: this.rules, destination: this.destination })]);
  }

  add(kind: ScopeKind, definition: Digest | PlatformDefinition | DeclaredDefinition, items: Item[] = []): ScopeRef {
    const named = typeof definition === "string" ? definition : definitionDigest(definition);
    const scope = scopeIdOf({ v: 1, kind, definition: named, creator: null, cause: textDigest(`${kind} ${this.scopes.size}`), ordinal: 0 });
    const ref: ScopeRef = { scope, inc: newIncarnation(new Uint8Array(16).fill(this.scopes.size + 1)), kind };
    const retained = new Map<string, string>();
    if (typeof definition !== "string") retained.set(`definition ${named}`, canonicalize(definition));
    const s: Scope = { ref, definition: named, entries: [], items, retained, final: [] };
    this.scopes.set(scope, s);
    this.append(s, { type: "genesis", seed: { v: 1, kind, definition: named, creator: null, cause: textDigest(kind), ordinal: 0 }, inc: ref.inc, kind: "establish", "founding": null, source: null, n: null, message: null, decision: "applied" } as Input);
    return ref;
  }

  /** Activate a definition in the rules scope: its row, and its bytes retained there. */
  activate(definition: DeclaredDefinition): void {
    const rules = this.scopes.get(this.rules.scope)!;
    const digest = definitionDigest(definition);
    rules.items.push(item(rules.items.length + 1, "definition", "active", { name: definition.name, digest }));
    rules.retained.set(`definition ${digest}`, canonicalize(definition));
    this.append(rules, { type: "timed", item: 0, rule: "stand-in", due: T } as Input);
  }

  /** A lane under a declared definition: its scope, its row in the directory, and the definition active in the rules scope. */
  lane(definition: DeclaredDefinition, title = definition.name): ScopeRef {
    const ref = this.add("lane", definition);
    const directory = this.scopes.get(this.directory.scope)!;
    const number = directory.items.filter((i) => i.type === "lane").length + 1;
    directory.items.push(item(directory.items.length, "lane", "open", { number, kind: definition.name, title, state: "open" }, { scope: ref }));
    this.append(directory, { type: "timed", item: 0, rule: "stand-in", due: T } as Input);
    if (!this.scopes.get(this.rules.scope)!.items.some((i) => i.values["digest"] === definitionDigest(definition))) this.activate(definition);
    return ref;
  }

  config(): McpConfig {
    return { service: SERVICE, repository: { directory: this.directory, membership: this.membership, rules: this.rules.scope, destination: this.destination.scope } };
  }

  /** A scope under exactly this seed, so its ID is the one a send names. */
  seeded(seed: Seed, items: Item[] = []): ScopeRef {
    const scope = scopeIdOf(seed);
    const ref: ScopeRef = { scope, inc: newIncarnation(new Uint8Array(16).fill(this.scopes.size + 1)), kind: seed.kind };
    const s: Scope = { ref, definition: seed.definition, entries: [], items, retained: new Map(), final: [] };
    this.scopes.set(scope, s);
    this.append(s, { type: "genesis", seed, inc: ref.inc, kind: "establish", "founding": null, source: null, n: null, message: null, decision: "applied" } as Input);
    return ref;
  }

  append(s: Scope, input: Input, effects: Entry["effects"] = [], sends: Entry["sends"] = []): Sealed {
    const seq = s.entries.length;
    const entry: Entry = { v: 1, at: s.ref, seq, prev: seq === 0 ? null : s.entries[seq - 1]!.hash, time: T, clamped: false, epoch: 0, input, uses: [], prepared: [], effects, sends };
    const sealed = { entry, hash: entryHash(entry) };
    s.entries.push(sealed);
    return sealed;
  }

  head(s: Scope) { const last = s.entries.at(-1)!; return { seq: last.entry.seq, hash: last.hash }; }
  read<T>(s: Scope, value: T) { return { ok: true, at: this.head(s), value, complete: true }; }

  readonly fetch: Fetch = async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    this.requests.push(`${method} ${u.pathname}`);
    const json = (body: unknown, status = 200) => { const bytes = new TextEncoder().encode(JSON.stringify(body)); return { status, body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) as never }; };
    const parts = u.pathname.replace(/^\/v1\/scopes\/?/, "").split("/").map(decodeURIComponent);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (parts[0] === "" && method === "POST") return json({ answer: "unavailable", reason: "unavailable" });
    const s = this.scopes.get(parts[0] as ScopeId);
    if (!s) return json({ ok: false, reason: "not-found" }, 404);
    const route = parts.slice(1);
    if (route[0] === "sessions") {
      if (this.sessions === "refuse") return json({ ok: false, reason: "unauthorized" });
      return json({ ok: true, token: SESSION_TOKEN, session: { v: 1, deployment: "standin", membership: s.ref, member: "@agent", key: this.key, reads: [], ends: this.sessionEnds } });
    }
    const authorization = (init?.headers as Record<string, string> | undefined)?.["authorization"];
    if (this.sessions === "forbid" && authorization?.includes(SESSION_TOKEN)) return json({ ok: false, reason: "forbidden" });
    if (route.length === 0) return json(this.read(s, { scope: s.ref, status: "active", definition: s.definition, time: T, items: s.items, counts: [] }));
    switch (route[0]) {
      case "entries": { const e = s.entries[Number(route[1])]; return e ? json(this.read(s, e)) : json({ ok: false, reason: "not-found" }); }
      case "history": return json(this.read(s, s.entries));
      case "log": return json(this.read(s, { scope: s.ref, definition: s.definition, entries: s.entries.map((e) => ({ seq: e.entry.seq, hash: e.hash, bytes: canonicalize(e.entry) })) }));
      case "items": {
        const from = Number(u.searchParams.get("cursor") ?? 0);
        const of = s.final.filter((i) => i.type === route[1]);
        const page = of.slice(from, from + FINAL_PAGE);
        return json({ ...this.read(s, page), ...(from + FINAL_PAGE < of.length ? { next: String(from + FINAL_PAGE) } : {}) });
      }
      case "outbox": return route[1] ? json({ ok: false, reason: "not-found" }) : json(this.read(s, []));
      case "retained": {
        const bytes = s.retained.get(`${route[1]} ${route[2]}`);
        return bytes === undefined ? json({ ok: false, reason: "not-found" }) : json(this.read(s, { kind: route[1], digest: route[2], bytes }));
      }
      case "credential": {
        const handle = route[1]!;
        if (!this.credentials.has(handle) || this.credentials.get(handle)) return json({ ok: false, reason: "not-found" });
        this.credentials.set(handle, true);
        return json(this.read(s, { token: READ_CREDENTIAL, ends: "2099-01-01T01:00:00Z", remote: "https://git.test/n/r.git" }));
      }
      case "settle": {
        const signed = body["signed"] as SignedIntent;
        const matched = s.entries.find((e) => e.entry.input.type === "act" && intentDigest(e.entry.input.signed.intent) === intentDigest(signed.intent));
        return json(matched ? this.read(s, this.receipt(s, matched)) : { ok: false, reason: "not-found" });
      }
      case "preparations": return json({ answer: "refused", reason: "capability-refused", name: "not-staged", judgedAt: this.head(s) });
      case "acts": {
        const signed = body["signed"] as SignedIntent;
        const scripted = this.answers.get(signed.intent.kind)?.(signed);
        if (scripted) return json(scripted);
        const prior = s.entries.find((e) => e.entry.input.type === "act" && e.entry.input.signed.intent.idempotencyKey === signed.intent.idempotencyKey && e.entry.input.signed.intent.actor === signed.intent.actor);
        if (prior) return json(intentDigest((prior.entry.input as { signed: SignedIntent }).signed.intent) === intentDigest(signed.intent) ? { answer: "accepted", receipt: this.receipt(s, prior) } : { answer: "mismatch", reason: "idempotency-mismatch" });
        const sealed = this.append(s, { type: "act", signed, authority: [], presented: {} } as Input,
          signed.intent.kind === "read-token" ? [{ effect: "operation", k: 0, owner: s.definition as PlatformDefinition, kind: "mint-read", attempts: 1, for: 0 }] : []);
        if (signed.intent.kind === "read-token") {
          const handle = `handle-${sealed.entry.seq}`;
          this.credentials.set(handle, false);
          for (let i = 0; i < this.fillerBeforeOutcome; i++) this.append(s, { type: "timed", item: 0, rule: "stand-in", due: T } as Input);
          this.append(s, { type: "outcome", operation: `${sealed.entry.seq}:0`, attempt: 1, owner: s.definition, kind: "mint-read", result: "confirmed", evidence: { basis: "own-answer", body: { token: handle, ends: "2099-01-01T01:00:00Z" } } } as Input);
        }
        return json({ answer: "accepted", receipt: this.receipt(s, sealed) });
      }
    }
    return json({ ok: false, reason: "not-found" }, 404);
  };

  receipt(s: Scope, sealed: Sealed): Receipt {
    const input = sealed.entry.input;
    return { fact: factRefOf(sealed.entry), definition: s.definition, intent: input.type === "act" ? intentDigest(input.signed.intent) : null, effects: sealed.entry.effects, sends: [], epoch: 0 };
  }
}
