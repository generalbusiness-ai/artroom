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
 * | `POST /v1/scopes` | Found a scope with no creator: under `platform:register@1` the founding register, by an `install` intent; under another definition a directory. Body `{ founding, definition, definitions?, texts? }`. |
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

import { WorkerEntrypoint } from "cloudflare:workers";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Beside, Cursor, DeclaredDefinition, Digest, DutyId, Grant, LogPage, PlatformDefinition, Read, ReadRefusal, RetainedInput, ScopeApi, ScopeId, Seed, SessionAnswer, SessionRefusal, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { definitionDigest, intentDigest, isScopeId, positionOf, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { isObject, type Item } from "@generalbusiness/artroom-derive";
import { foundedKind, type Founded } from "./core.ts";
import { destinationSessionMembership, fixedMembership, repositoryAuthority } from "./authority.ts";
import { membershipIn, namespace, type Binding } from "./namespace.ts";
import { ScopeObject, type OutsideGiven, type Wiring } from "./object.ts";
import type { Incident } from "./operator.ts";
import type { Summary } from "./reads.ts";
import { credentialInUrl, relay, sessionReaders, sessionsOf, type Opened, type Sessions, type StreamRefusal } from "./sessions.ts";
import type { Duty, Sealed } from "./store.ts";
import { gitHubOutside, type GitHubBindings } from "./github-wiring.ts";
import { within } from "./turn.ts";
import { ARTIFACTS_HOST, artifactsOutside, type ArtifactsBindings } from "./artifacts-wiring.ts";
import { recordedHost } from "./host-wiring.ts";
import { NO_OUTSIDE, type Outside } from "./operations.ts";

/**
 * The bindings of the deployed Worker (`wrangler.jsonc`): the one scope
 * namespace, and the two that read sessions need. `SESSION_SECRET` is a
 * secret of the deployment's secret store (authority note, section 5.5):
 * the operator sets it, and no file of this repository holds one.
 * `DEPLOYMENT` is the deployment's name, which a session's token names.
 */
export interface Env extends GitHubBindings, ArtifactsBindings { SCOPES: DurableObjectNamespace; SESSION_SECRET?: string; DEPLOYMENT?: string }

/** A scope's surface as a caller over RPC has it. */
interface Remote {
  found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions?: readonly DeclaredDefinition[], beside?: Beside): Promise<Founded>;
  submit(signed: SignedIntent, grants: readonly Grant[], beside?: Beside, address?: string | null): Promise<Answer>;
  prepare(signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer>;
  settle(signed: SignedIntent): Promise<Settlement>;
  summary(reader: unknown): Promise<Read<Summary>>;
  items(reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>>;
  history(reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>>;
  entry(reader: unknown, seq: number): Promise<Read<Sealed>>;
  outbox(reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>>;
  duty(reader: unknown, duty: DutyId): Promise<Read<Duty>>;
  log(reader: unknown, cursor?: Cursor): Promise<Read<LogPage>>;
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Promise<Read<RetainedInput>>;
  session(asked: unknown): Promise<SessionAnswer>;
  stream(reader: unknown): Promise<Opened | StreamRefusal>;
  release(id: string): Promise<void>;
  incidents(reader: unknown, cursor?: Cursor): Promise<Read<readonly Incident[]>>;
  waiting(reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Promise<Read<readonly Duty[]>>;
}

const MISSING = { ok: false, reason: "not-found" } as const;

/** The contract's operations, and the four that sessions and the operator's lists add. None of the four writes an entry. */
export interface Api extends ScopeApi {
  session(scope: string, asked: unknown): Promise<SessionAnswer>;
  /** The body is the reader's side of the stream (`relay`): cancelling it releases the scope's subscription at once. */
  stream(scope: string, reader: unknown): Promise<ReadableStream<Uint8Array> | StreamRefusal | typeof MISSING>;
  incidents(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Incident[]>>;
  waiting(scope: string, reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Promise<Read<readonly Duty[]>>;
}


/**
 * Every operation, each on the object the scope ID names. A name that is no
 * scope ID names nothing. `address`: the caller's address, for the serving
 * limits of a join, or null when the caller has none.
 */
export function api(binding: Binding, address: string | null = null): Api {
  const at = (scope: string): Remote | null => (isScopeId(scope) ? binding.get(binding.idFromName(scope)) as Remote : null);
  return {
    /**
     * Section 7.1: the service computes the seed from the signed intent and
     * the definition, and the scope ID is the seed's digest. The object with
     * that name checks both again. `definition` is a declaration, or the
     * digest or platform name of one. `definitions`: the declarations it
     * names in `create` sends, which the directory retains for its children.
     * `beside`: the detached texts that the founding intent's fields name.
     */
    async found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Founded> {
      let name: ScopeId;
      try {
        const names = typeof definition === "string" ? definition : definitionDigest(definition);
        // Under the register's platform definition the scope is the founding register, of the kind `register` (I3 delta EP2).
        const seed: Seed = { v: 1, kind: foundedKind(names), definition: names, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
        name = scopeIdOf(seed);
      } catch {
        return { answer: "refused", reason: "source-unverified" };   // not values that have canonical bytes
      }
      return at(name)!.found(founding, definition, definitions, beside);
    },
    async submit(scope: string, signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> { return (await at(scope)?.submit(signed, grants, beside, address)) ?? { answer: "unavailable", reason: "unavailable" }; },
    async prepare(scope: string, signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> { return (await at(scope)?.prepare(signed, grants, capability, step)) ?? { answer: "unavailable", reason: "unavailable" }; },
    async settle(scope: string, signed: SignedIntent): Promise<Settlement> { return (await at(scope)?.settle(signed)) ?? MISSING; },
    async summary(scope: string, reader: unknown): Promise<Read<Summary>> { return (await at(scope)?.summary(reader)) ?? MISSING; },
    async items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return (await at(scope)?.items(reader, type, cursor)) ?? MISSING; },
    async history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return (await at(scope)?.history(reader, cursor)) ?? MISSING; },
    async entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>> { return (await at(scope)?.entry(reader, seq)) ?? MISSING; },
    async outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>> { return (await at(scope)?.outbox(reader, cursor)) ?? MISSING; },
    async duty(scope: string, reader: unknown, duty: DutyId): Promise<Read<Duty>> { return (await at(scope)?.duty(reader, duty)) ?? MISSING; },
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
    async waiting(scope: string, reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Promise<Read<readonly Duty[]>> { return (await at(scope)?.waiting(reader, list, cursor)) ?? MISSING; },
  };
}

// ---------------------------------------------------------------- HTTP

/** The most bytes a request body may have: more than one entry, which is the most an act can become. */
const BODY_BYTES = 1024 * 1024;

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The status of an answer to a founding or an act (section 4.2). The body says which. */
function answered(answer: Founded | Answer, accepted: number): Response {
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

/** One request to the routes in the table above. */
export async function route(request: Request, binding: Binding): Promise<Response> {
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
  if ((what === "sessions" || what === "stream" || what === "incidents") && (scope === undefined || which !== undefined)) return json(404, { error: "not-found" });
  const reader = request.headers.get("authorization");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const posts = (scope === undefined && what === undefined) || ((what === "acts" || what === "preparations" || what === "settle" || what === "sessions") && which === undefined);
  if (request.method !== (posts ? "POST" : "GET")) return json(405, { error: "method-not-allowed" });

  if (posts) {
    const given = await body(request);
    if (!given) return json(400, { error: "bad-request" });
    // What travels beside the intent is untrusted, like the rest of the body: the scope reads each text and each presented fact itself.
    const beside = { ...("texts" in given ? { texts: given["texts"] } : {}), ...("presented" in given ? { presented: given["presented"] } : {}), ...("values" in given ? { values: given["values"] } : {}) } as Beside;
    if (scope === undefined) return answered(await scopes.found(given["founding"] as SignedIntent, given["definition"] as DeclaredDefinition, (given["definitions"] ?? []) as DeclaredDefinition[], beside), 201);
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
  if (what === "outbox") return read(which === undefined ? await scopes.outbox(scope, reader, cursor) : await scopes.duty(scope, reader, which as DutyId));
  if (what === "log" && which === undefined) return read(await scopes.log(scope, reader, cursor));
  if (what === "retained") return read(await scopes.retained(scope, reader, which as RetainedInput["kind"], last as Digest, url.searchParams.get("domain") ?? undefined));
  if (what === "incidents") return read(await scopes.incidents(scope, reader, cursor));
  if (what === "waiting" && (which === "diagnosed" || which === "unanswered")) return read(await scopes.waiting(scope, reader, which, cursor));
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
 * configured, GitHub and the hosting's own Git service, and each call routed
 * by the host that the object's own history records, the register's or its
 * destination's. A scope whose recorded host matches no configured wiring,
 * or that records none, gets `NO_OUTSIDE`. Each wiring still checks its own
 * authority.
 */
export function outsideOf(given: OutsideGiven, sql: Pick<SqlStorage, "exec">, env: GitHubBindings & ArtifactsBindings, fetch?: (request: Request) => Promise<Response>): Outside {
  const hosts = new Map<string, Outside>();
  if (env.GITHUB_APP_CONFIG) hosts.set("github.com", gitHubOutside(given, sql, env, fetch));
  if (env.ARTIFACTS_CONFIG) hosts.set(ARTIFACTS_HOST, artifactsOutside(given, sql, env, fetch));
  const pick = (): Outside => hosts.get(recordedHost(given) ?? "") ?? NO_OUTSIDE;
  return {
    accepts: (owner, kind) => pick().accepts(owner, kind),
    send: (request) => pick().send(request),
    judged: (at, sealed) => pick().judged?.(at, sealed),
    recovery: {
      accepts: (owner, kind) => pick().recovery?.accepts(owner, kind) ?? false,
      read: (request) => pick().recovery?.read(request) ?? Promise.resolve(null),
    },
    replies: (limit) => pick().replies?.(limit) ?? { answers: [], more: false },
  };
}

/**
 * The two parts of a wiring that read sessions need, over one source of the
 * session configuration, which is asked at every use. The readers port
 * accepts a session only for the membership scope that the scope itself
 * records: the reference that its authority reads, with its incarnation (`fixedMembership`).
 */
export function sessionWiring(sessions: () => Sessions | null, binding?: Binding, fetchSeconds = PROPOSED_BOUNDS.fetchSeconds): Required<Pick<Wiring, "readers" | "sessions">> {
  return {
    readers: (given) => sessionReaders({
      sessions, clock: given.clock, scope: given.scope, membership: (scope) => fixedMembership(given, scope),
      ...(binding ? { membershipPreparation: destinationSessionMembership(given, (directory, reader) => within(() => (binding.get(binding.idFromName(directory.scope)) as Remote).summary(reader), fetchSeconds)) } : {}),
    }), sessions,
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
 * of the hosting's own Git service (`ARTIFACTS_CONFIG`) enables the outside
 * factory (`outsideOf`); with neither, outside effects remain unsent.
 *
 * With no secret bound, or a short one, the session configuration is null
 * at every use: no session is issued, none is accepted, and no reader may
 * read (authority note, section 5.5).
 */
export class DeployedScope<E extends Env = Env> extends ScopeObject<E> {
  /** The one scope namespace. */
  protected scopes(): Binding { return this.env.SCOPES; }
  protected override wiring(_name: string | undefined): Wiring {
    return {
      ports: namespace(this.scopes()),
      authority: (given) => repositoryAuthority({ ...given, reader: membershipIn(this.scopes()) }),
      ...(this.env.GITHUB_APP_CONFIG || this.env.ARTIFACTS_CONFIG ? { outside: (given: OutsideGiven) => outsideOf(given, this.ctx.storage.sql, this.env) } : {}),
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
  found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Founded> { return api(this.scopes()).found(founding, definition, definitions, beside); }
  submit(scope: string, signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> { return api(this.scopes()).submit(scope, signed, grants, beside); }
  prepare(scope: string, signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> { return api(this.scopes()).prepare(scope, signed, grants, capability, step); }
  settle(scope: string, signed: SignedIntent): Promise<Settlement> { return api(this.scopes()).settle(scope, signed); }
  summary(scope: string, reader: unknown): Promise<Read<Summary>> { return api(this.scopes()).summary(scope, reader); }
  items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return api(this.scopes()).items(scope, reader, type, cursor); }
  history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return api(this.scopes()).history(scope, reader, cursor); }
  entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>> { return api(this.scopes()).entry(scope, reader, seq); }
  outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>> { return api(this.scopes()).outbox(scope, reader, cursor); }
  duty(scope: string, reader: unknown, duty: DutyId): Promise<Read<Duty>> { return api(this.scopes()).duty(scope, reader, duty); }
  log(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<LogPage>> { return api(this.scopes()).log(scope, reader, cursor); }
  retained(scope: string, reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Promise<Read<RetainedInput>> { return api(this.scopes()).retained(scope, reader, kind, digest, domain); }
}

export default { fetch: (request: Request, env: Env): Promise<Response> => route(request, env.SCOPES) };
