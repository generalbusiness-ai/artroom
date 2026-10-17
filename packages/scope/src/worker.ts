import { health } from "./health.ts";
/**
 * The Worker (scope contract, sections 2.3, 7.1 and 9.1): the routes of a
 * deployment, addressed by scope, over the one scope namespace.
 *
 * - `api(binding)`: every operation, as a call on the object a scope ID
 *   names. `route` and `ScopeService` are both this and nothing more.
 * - `route(request, binding)`: the same operations over HTTP, JSON in and
 *   JSON out. A body is the contract's own answer; the status code says the
 *   same thing in HTTP's terms.
 * - `ScopeService`: the same operations over a service binding, for a
 *   client in another Worker. It implements the contract's `ScopeApi`,
 *   which a client's transport also is.
 * - `DeployedScope`: the scope's object class as it is deployed, with the
 *   namespace as its resolver, its transport and its source of
 *   declarations. Its authority is the production authority of a
 *   repository: a membership scope judges its own acts on its own head, and
 *   every other scope reads the membership scope that its genesis records,
 *   through the namespace. No grant that a caller presents is read. Its
 *   readers port is read sessions (authority note, section 3.9;
 *   `sessions.ts`), under the deployment's session secret, which is the
 *   binding `SESSION_SECRET`, and the deployment's name, the binding
 *   `DEPLOYMENT`. With either missing, or a secret shorter than 32 bytes,
 *   no session is issued and none is accepted, and no reader may read.
 *
 * Nothing here reaches a test port. A test builds its own Worker from
 * `route`, and its own classes from these, in its own files.
 *
 * | Route | Operation |
 * |---|---|
 * | `POST /v1/scopes` | Create a scope with no creator: under `platform:register@1` the initial register, by an `install` intent; under another definition a directory. Body `{ creation, definition, definitions?, texts? }`. |
 * | `POST /v1/scopes/:scope/acts` | Submit an act. Body `{ signed, grants, texts?, presented?, values? }`. `texts`: each detached text that a field names by digest. `presented`: the facts presented beside the intent, by name. `values`: each value that a place of the act names by digest, as its canonical bytes; only an act of a platform definition has a place. |
 * | `POST /v1/scopes/:scope/preparations` | Ask for one step of a capability. Body `{ signed, grants, capability, step }`. `signed`: the signed intent that the step prepares for. |
 * | `POST /v1/scopes/:scope/settle` | The receipt of an accepted act. Body `{ signed }`. |
 * | `GET /v1/scopes/:scope` | The summary. |
 * | `GET /v1/scopes/:scope/items/:type?cursor=` | A page of retained final items. |
 * | `GET /v1/scopes/:scope/history?cursor=` | A page of the history. |
 * | `GET /v1/scopes/:scope/entries/:seq` | One entry. |
 * | `GET /v1/scopes/:scope/outbox?cursor=` | A page of the outbox. |
 * | `GET /v1/scopes/:scope/outbox/:duty` | The outbox status of one send. |
 * | `GET /v1/scopes/:scope/log?cursor=` | A page of the history as stored: each entry's canonical bytes. |
 * | `GET /v1/scopes/:scope/retained/:kind/:digest` | One retained input. For `value`, `?domain=` names its byte domain. |
 * | `POST /v1/scopes/:scope/sessions` | Ask a membership scope for a read session. Body: a signed session request, `{ request, sig }`. The answer holds the token, and is marked not to be stored. |
 * | `GET /v1/scopes/:scope/stream` | A stream of the scope's head, one line of JSON for each, for a read session. |
 * | `GET /v1/scopes/:scope/incidents?cursor=` | A page of the operator's record of the scope, for the session of an admin. |
 * | `GET /v1/scopes/:scope/waiting/:list?cursor=` | One page of the list `diagnosed` or `unanswered` of the requests that wait, for the session of an admin. |
 * | `GET /v1/scopes/:destination/credential/:handle` | A member's read token, once, for the session of the key that signed its `read-token` act. The answer holds a credential, and is marked not to be stored. |
 *
 * A reader presents a read session in the `Authorization` header, as
 * `Session <token>`, set from memory. A reader with no session may present
 * a signed read there instead, as `Signed <signed read>` (`signed-reads.ts`):
 * the summary, the genesis and its own entries, of a scope where its key
 * signed an entry within the authority window of an intent. A reader that
 * presents neither is answered `forbidden`. A request whose URL holds a credential, in its path
 * or its query, is refused `credential-in-url` before anything else, and
 * the credential is not used (authority note, section 5.3).
 *
 * A join is served through the serving limits of its membership scope
 * (`limits.ts`), keyed by the caller's address, which is the header
 * `CF-Connecting-IP` as the platform sets it. A caller over the service
 * binding has no address, and nothing is counted for it.
 *
 * The operator's instruction to send a waiting request again has no route:
 * an operator's authentication is the installation design's.
 *
 * An object also answers `observe`, to another object of the namespace: the
 * observation read of a membership scope. It has no route here.
 */

import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { CONTROL_BODY_BYTES, HostedAgent, HostedRegistry, controlOf, type AgentPorts, type ControlAnswer, type RegistryPorts } from "@generalbusiness/dap-mcp";
import { PROPOSED_BOUNDS, ITEM_QUERY_WIRE_BOUNDS } from "@generalbusiness/dap-contract";
import type { FactRef, Entry, ItemQueryRead, ItemQueryRefusal, Answer, Beside, Cursor, DeclaredDefinition, Digest, OutboxId, Grant, LogPage, PlatformDefinition, Read, ReadRefusal, RetainedInput, ScopeApi, ScopeId, Seed, SessionAnswer, SessionRefusal, Settlement, SignedIntent } from "@generalbusiness/dap-contract";
import { b64url, parseStrict, readItemQueryReply, utf8, definitionDigest, intentDigest, isScopeId, positionOf, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { isObject, type Item } from "@generalbusiness/dap-derive";
import { creationKind, type Created } from "./core.ts";
import { repositorySessionMembership, fixedMembership, repositoryAuthority } from "./authority.ts";
import { membershipIn, namespace, sessionReferencesIn, type Binding } from "./namespace.ts";
import { ScopeObject, type OutsideGiven, type Wiring } from "./object.ts";
import type { Incident } from "./operator.ts";
import type { Summary } from "./reads.ts";
import { credentialInUrl, relay, sessionReaders, sessionsOf, type Opened, type Sessions, type StreamRefusal } from "./sessions.ts";
import type { OutboxItem, Sealed } from "./store.ts";
import type { ReadCredential } from "./destination-host.ts";
import { gitHubOutside, type GitHubBindings } from "./github-wiring.ts";
import { within } from "./turn.ts";
import { ARTIFACTS_HOST, artifactsOutside, type ArtifactsBindings } from "./artifacts-wiring.ts";
import { recordedHost } from "./host-wiring.ts";
import { NO_OUTSIDE, type Outside } from "./operations.ts";
import type { NativeItemQuery } from "./item-queries.ts";
import { admittedRequestUrl, itemQueryWire } from "./item-query-wire.ts";
import { isSite, site } from "./site/route.ts";
import { requestQuery, type RequestPage } from "./request-index.ts";
import { measuredRequest, OBSERVED_METHODS, operational, operationPlace, unknownTurnMark, type MetricEnvironment, type OperationalIdentity, type ObservedMethod } from "./operational.ts";
import type { MetricPoint } from "./metrics.ts";

/**
 * The bindings of the deployed Worker (`wrangler.jsonc`): the one scope
 * namespace, and the two that read sessions need. `SESSION_SECRET` is a
 * secret of the deployment's secret store (authority note, section 5.5):
 * the operator sets it, and no file of this repository holds one.
 * `DEPLOYMENT` is the deployment's name, which a session's token names.
 */
export interface Env extends GitHubBindings, ArtifactsBindings, MetricEnvironment { SCOPES: DurableObjectNamespace; SESSION_SECRET?: string; DEPLOYMENT?: string }
/** The two namespaces of the hosted MCP endpoint (`McpRegistry`, `McpAgent`): one registry per repository, one object per agent. */
export interface McpEnv extends Env { REGISTRIES: DurableObjectNamespace; AGENTS: DurableObjectNamespace }

/** A scope's surface as a caller over RPC has it. */
interface Remote {
  observed?(method: ObservedMethod, args: unknown[], identity: OperationalIdentity, httpPublic?: boolean): Promise<{ value: unknown; turn: boolean }>;
  reservationSnapshot(asked: SignedIntent): Promise<import("@generalbusiness/dap-contract").ReservationSnapshot | { refused: "reservation-stage-missing" | "reservation-stage-mismatch" } | null>;
  create(creation: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions?: readonly DeclaredDefinition[], beside?: Beside): Promise<Created>;
  submit(signed: SignedIntent, grants: readonly Grant[], beside?: Beside, address?: string | null): Promise<Answer>;
  prepare(signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer>;
  settle(signed: SignedIntent): Promise<Settlement>;
  summary(reader: unknown): Promise<Read<Summary>>;
  items(reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>>;
  history(reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>>;
  entry(reader: unknown, seq: number): Promise<Read<Sealed>>;
  outbox(reader: unknown, cursor?: Cursor): Promise<Read<readonly OutboxItem[]>>;
  outboxItem(reader: unknown, outboxId: OutboxId): Promise<Read<OutboxItem>>;
  log(reader: unknown, cursor?: Cursor): Promise<Read<LogPage>>;
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Promise<Read<RetainedInput>>;
  queryItems(encoded: unknown, reader: unknown): Promise<NativeItemQuery>;
  session(asked: unknown): Promise<SessionAnswer>;
  stream(reader: unknown): Promise<Opened | StreamRefusal>;
  release(id: string): Promise<void>;
  incidents(reader: unknown, cursor?: Cursor): Promise<Read<readonly Incident[]>>;
  waiting(reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Promise<Read<readonly OutboxItem[]>>;
  credential(reader: unknown, handle: string): Promise<Read<ReadCredential>>;
  requests(reader: unknown, request?: string, trace?: string, cursor?: string): Promise<Read<Pick<RequestPage, "rows" | "window">>>;
}

const MISSING = { ok: false, reason: "not-found" } as const;

/** The contract's operations, and the four that sessions and the operator's lists add. None of the four writes an entry. */
export interface Api extends ScopeApi {
  reservationSnapshot(scope: string, asked: SignedIntent): Promise<import("@generalbusiness/dap-contract").ReservationSnapshot | { refused: "reservation-stage-missing" | "reservation-stage-mismatch" } | null>;
  session(scope: string, asked: unknown): Promise<SessionAnswer>;
  /** The body is the reader's side of the stream (`relay`): cancelling it releases the scope's subscription at once. */
  stream(scope: string, reader: unknown): Promise<ReadableStream<Uint8Array> | StreamRefusal | typeof MISSING>;
  incidents(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Incident[]>>;
  waiting(scope: string, reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Promise<Read<readonly OutboxItem[]>>;
  /** A member's read token at a destination, once (I5). */
  credential(scope: string, reader: unknown, handle: string): Promise<Read<ReadCredential>>;
  requests(scope: string, reader: unknown, request?: string, trace?: string, cursor?: string): Promise<Read<Pick<RequestPage, "rows" | "window">>>;
}


/**
 * Every operation, each on the object the scope ID names. A name that is no
 * scope ID names nothing. `address`: the caller's address, for the serving
 * limits of a join, or null when the caller has none.
 */
export function api(binding: Binding, address: string | null = null): Api {
  const at = (scope: string): Remote | null => {
    if (!isScopeId(scope)) return null;
    const remote = binding.get(binding.idFromName(scope)) as Remote, context = operational();
    if (!context) return remote;
    context.invocation.metrics.scope(scope);
    return new Proxy(remote, { get(target, key) {
      if (typeof key !== "string" || !(OBSERVED_METHODS as readonly string[]).includes(key)) return Reflect.get(target, key);
      return async (...args: unknown[]) => {
        const httpPublic = context.httpPublic && context.place === operationPlace(key as ObservedMethod) && ["create", "submit", "prepare"].includes(key);
        if (typeof target.observed !== "function") {
          if (httpPublic) unknownTurnMark(context);
          return Reflect.apply(Reflect.get(target, key) as (...args: unknown[]) => unknown, target, args);
        }
        try {
          const reply = await target.observed(key as ObservedMethod, args, context.identity, httpPublic);
          if (typeof reply?.turn === "boolean") context.turn.entered ||= reply.turn;
          else if (httpPublic) unknownTurnMark(context);
          return reply.value;
        } catch (error) { if (httpPublic) unknownTurnMark(context); throw error; }
      };
    } });
  };
  return {
    /**
     * Section 7.1: the service computes the seed from the signed intent and
     * the definition, and the scope ID is the seed's digest. The object with
     * that name checks both again. `definition` is a declaration, or the
     * digest or platform name of one. `definitions`: the declarations it
     * names in `create` sends, which the directory retains for its children.
     * `beside`: the detached texts that the creation intent's fields name.
     */
    async create(creation: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Created> {
      let name: ScopeId;
      try {
        const names = typeof definition === "string" ? definition : definitionDigest(definition);
        // Under the register's platform definition the scope is the creation register, of the kind `register` (I3 delta EP2).
        const seed: Seed = { v: 1, kind: creationKind(names), definition: names, creator: null, cause: intentDigest(creation.intent), ordinal: 0 };
        name = scopeIdOf(seed);
      } catch {
        return { answer: "refused", reason: "source-unverified" };   // not values that have canonical bytes
      }
      return at(name)!.create(creation, definition, definitions, beside);
    },
    async submit(scope: string, signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> { return (await at(scope)?.submit(signed, grants, beside, address)) ?? { answer: "unavailable", reason: "unavailable" }; },
    async prepare(scope: string, signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> { return (await at(scope)?.prepare(signed, grants, capability, step)) ?? { answer: "unavailable", reason: "unavailable" }; },
    async settle(scope: string, signed: SignedIntent): Promise<Settlement> { return (await at(scope)?.settle(signed)) ?? MISSING; },
    async summary(scope: string, reader: unknown): Promise<Read<Summary>> { return (await at(scope)?.summary(reader)) ?? MISSING; },
    async items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return (await at(scope)?.items(reader, type, cursor)) ?? MISSING; },
    async queryItems(scope: string, reader: unknown, encoded: string): Promise<ItemQueryRead> {
      const result = await at(scope)?.queryItems(encoded, reader);
      return result?.ok ? readItemQueryReply(utf8(result.serialized)) ?? { ok: false, reason: "unavailable" } : result ?? { ok: false, reason: "invalid-query" };
    },
    async history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return (await at(scope)?.history(reader, cursor)) ?? MISSING; },
    async entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>> { return (await at(scope)?.entry(reader, seq)) ?? MISSING; },
    async outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly OutboxItem[]>> { return (await at(scope)?.outbox(reader, cursor)) ?? MISSING; },
    async outboxItem(scope: string, reader: unknown, outboxId: OutboxId): Promise<Read<OutboxItem>> { return (await at(scope)?.outboxItem(reader, outboxId)) ?? MISSING; },
    async log(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<LogPage>> { return (await at(scope)?.log(reader, cursor)) ?? MISSING; },
    async retained(scope: string, reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Promise<Read<RetainedInput>> { return (await at(scope)?.retained(reader, kind, digest, domain)) ?? MISSING; },
    async session(scope: string, asked: unknown): Promise<SessionAnswer> { return (await at(scope)?.session(asked)) ?? MISSING; },
    async stream(scope: string, reader: unknown) {
      const object = at(scope);
      const opened = await object?.stream(reader);
      if (!object || !opened) return MISSING;
      return "body" in opened ? relay(opened, () => object.release(opened.id)) : opened;
    },
    async incidents(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Incident[]>> { return (await at(scope)?.incidents(reader, cursor)) ?? MISSING; },
    async waiting(scope: string, reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Promise<Read<readonly OutboxItem[]>> { return (await at(scope)?.waiting(reader, list, cursor)) ?? MISSING; },
    async reservationSnapshot(scope: string, asked: SignedIntent) { return (await at(scope)?.reservationSnapshot(asked)) ?? null; },
    async credential(scope: string, reader: unknown, handle: string): Promise<Read<ReadCredential>> { return (await at(scope)?.credential(reader, handle)) ?? MISSING; },
    async requests(scope: string, reader: unknown, request?: string, trace?: string, cursor?: string) { return requestQuery(request, trace, cursor) ? (await at(scope)?.requests(reader, request, trace, cursor)) ?? MISSING : MISSING; },
  };
}

// ---------------------------------------------------------------- HTTP

/** The most bytes a request body may have: more than one entry, which is the most an act can become. */
const BODY_BYTES = 1024 * 1024;

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The status of an answer to a creation or an act (section 4.2). The body says which. */
function answered(answer: Created | Answer, accepted: number): Response {
  const status = answer.answer === "accepted" ? accepted : answer.answer === "unavailable" ? 503 : answer.answer === "mismatch" ? 409 : answer.reason === "unauthorized" ? 403 : 422;
  return json(status, answer);
}

const READ_STATUS: Record<ReadRefusal, number> = {
  "not-found": 404, "wrong-incarnation": 409, forbidden: 403, "scope-provisional": 409, "unsupported-definition": 501, "history-unavailable": 503, "too-large": 413, unavailable: 503,
  "sessions-unavailable": 503, "clock-behind": 503,
};
const SESSION_STATUS: Record<SessionRefusal, number> = { "sessions-unavailable": 503, "bad-request": 400, "not-found": 404, misaddressed: 422, "clock-behind": 503, expired: 422, unauthorized: 403, replayed: 409, "rate-limited": 429 };
const read = (result: Read<unknown>): Response => json(result.ok ? 200 : READ_STATUS[result.reason], result);

/**
 * The JSON object of a request body, or null. The budget is of raw bytes and
 * is counted while the body is read: a body that declares more is not read,
 * and one that sends more is cancelled at the chunk that passes the budget.
 * Bytes that are not UTF-8 are no JSON.
 */
async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    if (!request.body || Number(request.headers.get("content-length") ?? 0) > BODY_BYTES) return null;
    const reader = request.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
    let text = "";
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    const value: unknown = JSON.parse(text + decoder.decode());
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

const QUERY_STATUS: Record<ItemQueryRefusal, number> = {
  "invalid-query": 400, "wrong-scope": 409, "invalid-cursor": 400, "stale-cursor": 409, "query-mismatch": 409,
  "unknown-type": 400, "unknown-state": 400, "query-not-ready": 409, "too-large": 413, "invalid-metadata": 503,
  "invalid-item": 503, "row-too-large": 413, forbidden: 403, "sessions-unavailable": 503, "clock-behind": 503, unavailable: 503,
};
/** Success is the owner's exact canonical full envelope, already byte capped. */
function queryResponse(result: NativeItemQuery): Response {
  return new Response(result.ok ? result.serialized : JSON.stringify(result), { status: result.ok ? 200 : QUERY_STATUS[result.reason], headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** One request to the routes in the table above. */
export async function route(request: Request, binding: Binding, env: MetricEnvironment = {}): Promise<Response> {
  return measuredRequest(request, env, () => routedRequest(request, binding));
}
async function routedRequest(request: Request, binding: Binding): Promise<Response> {
  if (!admittedRequestUrl(request.url)) return json(413, { error: "too-large" });
  const url = new URL(request.url);
  // Section 5.3: a credential in a URL is refused before anything is routed, and is not used. That does not undo the exposure.
  if (credentialInUrl(url)) return json(400, { error: "credential-in-url" });
  const scopes = api(binding, request.headers.get("cf-connecting-ip"));
  let parts: string[];
  try {
    parts = url.pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return json(400, { error: "bad-request" });   // a path part that is not percent-encoded UTF-8 names nothing
  }
  const [v, root, scope, what, which, last, ...more] = parts;
  if (v !== "v1" || root !== "scopes" || more.length > 0) return json(404, { error: "not-found" });
  // Only a retained input is named by two parts: its kind and its digest.
  if (what === "retained" ? which === undefined || last === undefined : last !== undefined) return json(404, { error: "not-found" });
  if ((what === "sessions" || what === "stream" || what === "incidents" || what === "requests") && (scope === undefined || which !== undefined)) return json(404, { error: "not-found" });
  const reader = request.headers.get("authorization");
  if (what === "query-items") {
    const wire = itemQueryWire(request, scope ?? "");
    if (!wire.ok) return queryResponse(wire);
    // Fixed header admission before namespace lookup; decoding, hashing and
    // all protected work belong to the object's one owned flight.
    if (typeof reader !== "string" || reader.length > (reader.startsWith("Signed ") ? ITEM_QUERY_WIRE_BOUNDS.signedChars : ITEM_QUERY_WIRE_BOUNDS.sessionChars)) return queryResponse({ ok: false, reason: "forbidden" });
    const object = binding.get(binding.idFromName(scope!)) as Remote;
    return queryResponse(await object.queryItems(wire.encoded, reader));
  }
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const requestId = url.searchParams.get("request") ?? undefined, traceId = url.searchParams.get("trace") ?? undefined;
  if (what === "requests") {
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => !["request", "trace", "cursor"].includes(key)) || new Set(keys).size !== keys.length || !requestQuery(requestId, traceId, cursor)) return read(MISSING);
  }
  const posts = (scope === undefined && what === undefined) || ((what === "acts" || what === "preparations" || what === "settle" || what === "sessions" || what === "reservation-snapshot") && which === undefined);
  if (request.method !== (posts ? "POST" : "GET")) return json(405, { error: "method-not-allowed" });

  if (posts) {
    const given = await body(request);
    if (!given) return json(400, { error: "bad-request" });
    // What travels beside the intent is untrusted, like the rest of the body: the scope reads each text and each presented fact itself.
    const beside = { ...("texts" in given ? { texts: given["texts"] } : {}), ...("presented" in given ? { presented: given["presented"] } : {}), ...("values" in given ? { values: given["values"] } : {}) } as Beside;
    if (scope === undefined) return answered(await scopes.create(given["creation"] as SignedIntent, given["definition"] as DeclaredDefinition, (given["definitions"] ?? []) as DeclaredDefinition[], beside), 201);
    if (what === "reservation-snapshot") {
      const snapshot = await scopes.reservationSnapshot(scope, given["signed"] as SignedIntent);
      if (snapshot && "refused" in snapshot) return new Response(JSON.stringify(snapshot), { status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      return new Response(JSON.stringify(snapshot ? { ...snapshot, objects: snapshot.objects.map((object) => ({ ...object, data: b64url(object.data) })) } : { error: "forbidden" }), { status: snapshot ? 200 : 403, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (what === "acts") return answered(await scopes.submit(scope, given["signed"] as SignedIntent, (given["grants"] ?? []) as Grant[], beside), 200);
    if (what === "sessions") {
      // The whole body is the signed request. The answer holds a credential: it is marked so that nothing between here and the device stores it.
      const answer = await scopes.session(scope, given);
      return new Response(JSON.stringify(answer), { status: answer.ok ? 200 : (SESSION_STATUS[answer.reason] ?? 400), headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (what === "preparations") return answered(await scopes.prepare(scope, given["signed"] as SignedIntent, (given["grants"] ?? []) as Grant[], given["capability"] as string, given["step"] as string), 200);
    return read(await scopes.settle(scope, given["signed"] as SignedIntent));
  }
  if (scope === undefined) return json(404, { error: "not-found" });
  if (what === undefined) return read(await scopes.summary(scope, reader));
  if (what === "items" && which !== undefined) return read(await scopes.items(scope, reader, which, cursor));
  if (what === "history" && which === undefined) return read(await scopes.history(scope, reader, cursor));
  const seq = what === "entries" ? positionOf(which) : null;
  if (seq !== null) return read(await scopes.entry(scope, reader, seq));
  if (what === "outbox") return read(which === undefined ? await scopes.outbox(scope, reader, cursor) : await scopes.outboxItem(scope, reader, which as OutboxId));
  if (what === "log" && which === undefined) return read(await scopes.log(scope, reader, cursor));
  if (what === "retained") return read(await scopes.retained(scope, reader, which as RetainedInput["kind"], last as Digest, url.searchParams.get("domain") ?? undefined));
  if (what === "incidents") return read(await scopes.incidents(scope, reader, cursor));
  if (what === "requests") return read(await scopes.requests(scope, reader, requestId, traceId, cursor));
  if (what === "waiting" && (which === "diagnosed" || which === "unanswered")) return read(await scopes.waiting(scope, reader, which, cursor));
  if (what === "credential" && which !== undefined) {
    // The answer holds a credential: it is marked so that nothing between here and the device stores it.
    const answer = await scopes.credential(scope, reader, which);
    return new Response(JSON.stringify(answer), { status: answer.ok ? 200 : READ_STATUS[answer.reason], headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  if (what === "stream") {
    const stream = await scopes.stream(scope, reader);
    // The body is the reader's side of the scope's stream. A reader that goes away cancels it, and the scope releases the subscription at once.
    return stream instanceof ReadableStream ? new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } }) : read(stream);
  }
  return json(404, { error: "not-found" });
}

// ---------------------------------------------------------------- the deployed classes

/**
 * The outside port of a deployment: one wiring for each Git host that is
 * configured, GitHub and Cloudflare Artifacts, and each call routed
 * by the host that the object's own history records, the register's or its
 * destination's. A scope whose recorded host matches no configured wiring,
 * or that records none, gets `NO_OUTSIDE`. Each wiring still checks its own
 * authority.
 */
export function outsideOf(given: OutsideGiven, sql: Pick<SqlStorage, "exec">, env: GitHubBindings & ArtifactsBindings, fetch?: (request: Request) => Promise<Response>, snapshotReader?: import("./destination-host.ts").SnapshotReader): Outside {
  // The settings are read from the environment at every call, and a host's wiring is made again only when one of its values
  // changed. So a setting that appears in this object's life takes effect at its next call, with no restart.
  const wired = new Map<string, { values: readonly unknown[]; outside: Outside }>();
  const wiring = (host: string, values: readonly unknown[], make: () => Outside): Outside => {
    const last = wired.get(host);
    if (last && last.values.length === values.length && last.values.every((value, i) => value === values[i])) return last.outside;
    const outside = make();
    wired.set(host, { values, outside });
    return outside;
  };
  const pick = (): Outside => {
    const host = recordedHost(given);
    if (host === "github.com" && env.GITHUB_APP_CONFIG) return wiring(host, [env.GITHUB_APP_CONFIG, env.GITHUB_APP_PRIVATE_KEY, env.GITHUB_CREATION_TOKEN, env.GITHUB_READ_TOKEN, env.GITHUB_CLEANUP_TOKENS, env.DEMO_START_CONFIG, env.DEPLOYMENT], () => gitHubOutside(given, sql, env, fetch, snapshotReader));
    if (host === ARTIFACTS_HOST && env.ARTIFACTS_CONFIG) return wiring(host, [env.ARTIFACTS_CONFIG, env.ARTIFACTS_NAMESPACE, env.ARTIFACTS], () => artifactsOutside(given, sql, env, fetch, snapshotReader));
    return NO_OUTSIDE;
  };
  return {
    snapshot: (asked) => pick().snapshot?.(asked) ?? Promise.resolve(null),
    accepts: (owner, kind) => pick().accepts(owner, kind),
    send: (request) => pick().send(request),
    judged: (at, sealed) => pick().judged?.(at, sealed),
    recovery: {
      accepts: (owner, kind) => pick().recovery?.accepts(owner, kind) ?? false,
      read: (request) => pick().recovery?.read(request) ?? Promise.resolve(null),
    },
    replies: (limit) => pick().replies?.(limit) ?? { answers: [], more: false },
    credential: (handle, key) => pick().credential?.(handle, key) ?? null,
  };
}

/**
 * The two parts of a wiring that read sessions need, over one source of the
 * session configuration, which is asked at every use. The readers port
 * accepts a session only for the membership scope that the scope itself
 * records: the reference that its authority reads, with its incarnation (`fixedMembership`).
 */
export function sessionWiring(sessions: () => Sessions | null, binding?: Binding, fetchSeconds = PROPOSED_BOUNDS.fetchSeconds): Required<Pick<Wiring, "readers" | "sessions">> & Pick<Wiring, "sessionReferenceSource"> {
  return {
    readers: (given) => sessionReaders({
      sessions, clock: given.clock, scope: given.scope, membership: (scope) => fixedMembership(given, scope),
      ...(binding ? { membershipPreparation: repositorySessionMembership(given, (directory, reader) => within(() => (binding.get(binding.idFromName(directory.scope)) as Remote).summary(reader), fetchSeconds)) } : {}),
    }), sessions, ...(binding ? { sessionReferenceSource: sessionReferencesIn(binding) } : {}),
  };
}

/**
 * The scope's object as deployed: the namespace is its resolver, its
 * transport and its source of declarations, and how it reads its membership
 * scope. Its authority is `repositoryAuthority`: a real observation, read
 * before the turn from the membership scope that the scope's own genesis
 * records, or for a membership scope its own head. Its readers port is
 * `sessionReaders`: a read session, checked under the deployment's secret
 * against the membership reference that the scope itself records, which is
 * the one that its authority reads, and against the scope's own clock. A
 * membership scope also issues sessions. Explicit configuration of GitHub or
 * of Artifacts (`ARTIFACTS_CONFIG`) enables the outside
 * factory (`outsideOf`), which reads them at each call; with neither, outside
 * effects remain unsent.
 *
 * With no secret bound, or a short one, the session configuration is null
 * at every use: no session is issued, none is accepted, and no reader may
 * read (authority note, section 5.5).
 */
export function snapshotReaderOf(binding: Binding): import("./destination-host.ts").SnapshotReader {
  return {
    job: async (fact) => {
      const peer = binding.get(binding.idFromName(fact.at.scope)) as { source(seq: number): Promise<{ bytes: string | null; under: string } | null>; summary(reader: unknown): Promise<unknown>; jobState(fact: FactRef): Promise<{ state: string; decidedBy: FactRef | null } | null> };
      const read = await peer.source(fact.seq);
      if (!read?.bytes) return null;
      const entry = parseStrict(read.bytes) as unknown as Entry;
      const standing = await peer.jobState(fact);
      return { entry, under: read.under, state: standing?.state ?? "absent", decidedBy: standing?.decidedBy ?? null };
    },
    key: async (membership, key) => (binding.get(binding.idFromName(membership)) as { observe(ask: unknown): Promise<unknown> }).observe({ of: { scope: membership, kind: "membership" }, key }),
  };
}

export class DeployedScope<E extends Env = Env> extends ScopeObject<E> {
  /** The one scope namespace. */
  protected scopes(): Binding { return this.env.SCOPES; }
  protected override wiring(_name: string | undefined): Wiring {
    return {
      ports: namespace(this.scopes()),
      authority: (given) => repositoryAuthority({ ...given, reader: membershipIn(this.scopes()) }),
      // Wired whether or not a host is configured now: `outsideOf` reads the settings at each call, and with neither it sends nothing.
      outside: (given: OutsideGiven) => outsideOf(given, this.ctx.storage.sql, this.env, undefined, snapshotReaderOf(this.scopes())),
      ...sessionWiring(() => sessionsOf(this.env.SESSION_SECRET, this.env.DEPLOYMENT), this.scopes()),
    };
  }
}

/**
 * The same operations over a service binding: the contract's `ScopeApi`, and
 * nothing more. The contract's interface has no operation for a session, a
 * stream or the operator's lists, so a caller over the binding has none of
 * them, and presents a session it got over the HTTP route as its reader
 * (I3 deltas, entry ES9).
 */
export class ScopeService<E extends Env = Env> extends WorkerEntrypoint<E> implements ScopeApi {
  /** The one scope namespace. */
  protected scopes(): Binding { return this.env.SCOPES; }
  create(creation: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Created> { return api(this.scopes()).create(creation, definition, definitions, beside); }
  submit(scope: string, signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> { return api(this.scopes()).submit(scope, signed, grants, beside); }
  prepare(scope: string, signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> { return api(this.scopes()).prepare(scope, signed, grants, capability, step); }
  settle(scope: string, signed: SignedIntent): Promise<Settlement> { return api(this.scopes()).settle(scope, signed); }
  summary(scope: string, reader: unknown): Promise<Read<Summary>> { return api(this.scopes()).summary(scope, reader); }
  items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return api(this.scopes()).items(scope, reader, type, cursor); }
  queryItems(scope: string, reader: unknown, encoded: string): Promise<ItemQueryRead> { return api(this.scopes()).queryItems(scope, reader, encoded); }
  history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return api(this.scopes()).history(scope, reader, cursor); }
  entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>> { return api(this.scopes()).entry(scope, reader, seq); }
  outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly OutboxItem[]>> { return api(this.scopes()).outbox(scope, reader, cursor); }
  outboxItem(scope: string, reader: unknown, outboxId: OutboxId): Promise<Read<OutboxItem>> { return api(this.scopes()).outboxItem(scope, reader, outboxId); }
  log(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<LogPage>> { return api(this.scopes()).log(scope, reader, cursor); }
  retained(scope: string, reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Promise<Read<RetainedInput>> { return api(this.scopes()).retained(scope, reader, kind, digest, domain); }
}

/** Generic Scope, Site and MCP dispatch. Application pages and demo offers belong to apps/room. */
export default {
  fetch: async (request: Request, env: Env & Partial<Pick<McpEnv, "REGISTRIES" | "AGENTS">>): Promise<Response> => {
    return measuredRequest(request, env, async () => {
    if (!admittedRequestUrl(request.url)) return json(413, { error: "too-large" });
    if (credentialInUrl(new URL(request.url))) return json(400, { error: "credential-in-url" });
    const healthy = await health(request, env);
    if (healthy) return healthy;
    const hosted = await mcpRoute(request, env);
    return hosted ?? (isSite(request) ? site(request, env) : route(request, env.SCOPES));
    });
  },
};

// ---------------------------------------------------------------- the hosted MCP endpoint

/**
 * The routes of the hosted MCP endpoint (notes/2026-10-13-hosted-mcp-endpoint.md,
 * section 3.4), over the two namespaces. `POST /mcp/agents` goes to the
 * repository's registry, named by the membership scope the control request
 * names; the agent routes go to the agent object the path names; `/mcp`
 * itself goes to the agent the bearer names. Null: not a hosted route.
 *
 * | Route | Authorization | Object |
 * |---|---|---|
 * | `POST /mcp/agents` | `Control`, action `create` | the registry of the membership |
 * | `POST /mcp/agents/<id>/bearer` | `Control`, action `bearer` | the agent |
 * | `DELETE /mcp/agents/<id>` | `Control`, action `retire` | the agent |
 * | `POST`, `GET`, `DELETE /mcp` | `Bearer <id>.<secret>` | the agent |
 */
export async function mcpRoute(request: Request, env: Partial<Pick<McpEnv, "REGISTRIES" | "AGENTS">>): Promise<Response | null> {
  if (!admittedRequestUrl(request.url)) return json(413, { error: "too-large" });
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== "/mcp" && !path.startsWith("/mcp/")) return null;
  // A Worker without the two namespaces bound serves no hosted endpoint.
  if (!env.REGISTRIES || !env.AGENTS) return json(404, { error: "not-found" });
  const { REGISTRIES, AGENTS } = env;
  const answered = (a: ControlAnswer): Response => new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (path === "/mcp") {
    const named = /^Bearer ([0-9a-f]{64})\./.exec(request.headers.get("authorization") ?? "");
    if (!named) return new Response(null, { status: 401 });
    let id: DurableObjectId;
    try { id = AGENTS.idFromString(named[1]!); } catch { return new Response(null, { status: 401 }); }
    return AGENTS.get(id).fetch(request);
  }
  const agentPath = /^\/mcp\/agents\/([0-9a-f]{64})(\/bearer)?$/.exec(path);
  const control = path === "/mcp/agents" && request.method === "POST" ? { action: "create" as const, agent: null }
    : agentPath && agentPath[2] && request.method === "POST" ? { action: "bearer" as const, agent: agentPath[1]! }
    : agentPath && !agentPath[2] && request.method === "DELETE" ? { action: "retire" as const, agent: agentPath[1]! }
    : null;
  if (!control) return json(path === "/mcp/agents" || agentPath ? 405 : 404, { error: path === "/mcp/agents" || agentPath ? "method-not-allowed" : "not-found" });
  const signed = controlOf(request.headers.get("authorization"));
  if (!signed) return json(400, { error: "control", rule: "header" });
  if (signed.request.action !== control.action || signed.request.agent !== control.agent) return json(400, { error: "control", rule: "binding" });
  // The body, within its bound, as the exact bytes the object digests against the request's binding: read in chunks and
  // cancelled at the chunk that passes the bound, before anything is authenticated or any object is reached.
  const bytes = await boundedBytes(request, CONTROL_BODY_BYTES);
  if (bytes === "too-large") return json(413, { error: "too-large" });
  if (bytes === "unreadable") return json(400, { error: "bad-request" });
  if (control.action === "create") {
    const registry = REGISTRIES.get(REGISTRIES.idFromName(signed.request.membership.scope)) as unknown as { create(signed: unknown, body: Uint8Array, origin: string): Promise<ControlAnswer> };
    return answered(await registry.create(signed, bytes, url.origin));
  }
  let id: DurableObjectId;
  try { id = AGENTS.idFromString(control.agent); } catch { return json(404, { error: "agent" }); }
  const agent = AGENTS.get(id) as unknown as { control(signed: unknown, action: "bearer" | "retire", body: Uint8Array, origin: string): Promise<ControlAnswer> };
  return answered(await agent.control(signed, control.action, bytes, url.origin));
}

/** A request body as exact bytes within `most`: cancelled at the chunk that passes the bound; a declared length over it is not read. */
async function boundedBytes(request: Request, most: number): Promise<Uint8Array | "too-large" | "unreadable"> {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > most) return "too-large";
    if (!request.body) return new Uint8Array(0);
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > most) { await reader.cancel(); return "too-large"; }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  } catch { return "unreadable"; }
}

/** The membership object's observation read, as the hosted objects check authority: a real read of the membership now. */
function observeThrough(binding: Binding): RegistryPorts["observe"] {
  return (membership, ask) => (binding.get(binding.idFromName(membership.scope)) as unknown as { observe(asked: unknown): Promise<unknown> }).observe({ of: membership, ...ask });
}

const sqlOf = (ctx: DurableObjectState) => ({
  exec: (query: string, ...bindings: (string | number | null | ArrayBuffer | Uint8Array)[]) => ctx.storage.sql.exec(query, ...bindings),
  transaction: <T>(closure: () => T): T => ctx.storage.transactionSync(closure),
});

/** One repository's registry of hosted agents, named by its membership scope ID. */
export class McpRegistry<E extends McpEnv = McpEnv> extends DurableObject<E> {
  #registry: HostedRegistry | null = null;
  /** The persisted answer bodies, for a test's subclass. */
  protected answers(): { op: string; answer: boolean }[] {
    return this.ctx.storage.sql.exec(`SELECT op, answer IS NOT NULL AS held FROM control ORDER BY created`).toArray().map((r) => ({ op: String(r["op"]), answer: Number(r["held"]) === 1 }));
  }
  protected scopes(): Binding { return this.env.SCOPES; }
  protected now(): number { return Date.now(); }
  protected ports(): Partial<RegistryPorts> { return {}; }
  /** Drop this instance's memory, as an eviction would. For a test's subclass. */
  protected evict(): void { this.#registry = null; }
  #of(): HostedRegistry {
    if (this.#registry) return this.#registry;
    const agents = this.env.AGENTS;
    this.#registry = new HostedRegistry(sqlOf(this.ctx), {
      now: () => this.now(), observe: observeThrough(this.scopes()), ...this.ports(),
      mintId: () => agents.newUniqueId().toString(),
      agent: (id) => agents.get(agents.idFromString(id)) as unknown as ReturnType<RegistryPorts["agent"]>,
    });
    return this.#registry;
  }
  async create(signed: Parameters<HostedRegistry["create"]>[0], body: Uint8Array, origin: string): Promise<ControlAnswer> { return this.#of().create(signed, body, origin); }
  agents(): ReturnType<HostedRegistry["agents"]> { return this.#of().agents(); }
  reservedAgent(op: string): string | null { return this.#of().reservedAgent(op); }
}

/** One hosted agent: its key, bearer, sessions, custody and control identities. */
export class McpAgent<E extends McpEnv = McpEnv> extends DurableObject<E> {
  #agent: HostedAgent | null = null;
  protected scopes(): Binding { return this.env.SCOPES; }
  protected ports(): Partial<AgentPorts> { return {}; }
  #of(): HostedAgent {
    if (this.#agent) return this.#agent;
    const scopes = this.scopes();
    this.#agent = new HostedAgent(sqlOf(this.ctx), {
      id: this.ctx.id.toString(), now: () => Date.now(), random: (n) => crypto.getRandomValues(new Uint8Array(n)), observe: observeThrough(scopes),
      ...(this.env.METRICS ? { metrics: { deployment: this.env.DEPLOYMENT ?? "unknown", version: this.env.VERSION_METADATA?.id ?? "unknown", report: (point: MetricPoint) => this.env.METRICS?.writeDataPoint(point) } } : {}),
      fetch: ((url: string, init?: RequestInit) => route(new Request(url, init), scopes)) as unknown as AgentPorts["fetch"],
      ...this.ports(),
    });
    return this.#agent;
  }
  async create(op: string, request: Parameters<HostedAgent["create"]>[1], link: Parameters<HostedAgent["create"]>[2]): Promise<ControlAnswer> { return this.#of().create(op, request, link); }
  async control(signed: Parameters<HostedAgent["control"]>[0], action: "bearer" | "retire", body: Uint8Array): Promise<ControlAnswer> { return this.#of().control(signed, action, body); }
  override async fetch(request: Request): Promise<Response> { return this.#of().fetch(request); }
  /** Drop this instance's memory, as an eviction would: streams end with no event, storage stays. For a test's subclass. */
  protected evict(): void { this.#agent?.abrupt(); this.#agent = null; }
  /** The durable facts a witness compares across a reset. For a test's subclass. */
  protected durable(): ReturnType<HostedAgent["durable"]> { return this.#of().durable(); }
  protected custodyOf(key: string): ReturnType<HostedAgent["custodyOf"]> { return this.#of().custodyOf(key); }
  /** What this instance holds in memory now. For a test's subclass. */
  protected held(): HostedAgent | null { return this.#agent; }
  /** The control budget's used bytes, for a test's subclass. */
  protected controlUsed(): number { return this.#of().controlUsed(); }
  /** The persisted answer bodies, for a test's subclass: whether each control row and the agent row still hold one. */
  protected answers(): { control: { op: string; answer: boolean }[]; agent: boolean } {
    const rows = this.ctx.storage.sql.exec(`SELECT op, answer IS NOT NULL AS held FROM control ORDER BY created`).toArray();
    const agent = this.ctx.storage.sql.exec(`SELECT answer IS NOT NULL AS held FROM agent WHERE id = 1`).toArray()[0];
    return { control: rows.map((r) => ({ op: String(r["op"]), answer: Number(r["held"]) === 1 })), agent: agent ? Number(agent["held"]) === 1 : false };
  }
}
