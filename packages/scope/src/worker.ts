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
 *   declarations. Its authority and readers ports are the production
 *   defaults, which refuse.
 *
 * Nothing here reaches a test port. A test builds its own Worker from
 * `route`, and its own classes from these, in its own files.
 *
 * | Route | Operation |
 * |---|---|
 * | `POST /v1/scopes` | Found a directory. Body `{ founding, definition, definitions?, texts? }`. |
 * | `POST /v1/scopes/:scope/acts` | Submit an act. Body `{ signed, grants, texts?, presented? }`. `texts`: each detached text that a field names by digest. `presented`: the facts presented beside the intent, by name. |
 * | `POST /v1/scopes/:scope/preparations` | Ask for one step of a capability. Body `{ signed, grants, capability, step }`. `signed`: the signed intent that the step prepares for. |
 * | `POST /v1/scopes/:scope/settle` | The receipt of an accepted act. Body `{ signed }`. |
 * | `GET /v1/scopes/:scope` | The summary. |
 * | `GET /v1/scopes/:scope/items/:type?cursor=` | A page of retained final items. |
 * | `GET /v1/scopes/:scope/history?cursor=` | A page of the history. |
 * | `GET /v1/scopes/:scope/entries/:seq` | One entry. |
 * | `GET /v1/scopes/:scope/outbox?cursor=` | A page of the outbox. |
 * | `GET /v1/scopes/:scope/outbox/:duty` | The outbox status of one send. |
 * | `GET /v1/scopes/:scope/log?cursor=` | A page of the history as stored: each entry's canonical bytes. |
 * | `GET /v1/scopes/:scope/retained/:kind/:digest` | One retained input. The kind `text` is a detached text, until it is redacted. |
 *
 * A reader presents itself in the `Authorization` header. What it must be is
 * the authority note's; the production readers port lets nobody read.
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import type { Answer, Beside, Cursor, DeclaredDefinition, Digest, DutyId, Grant, LogPage, PlatformDefinition, Read, ReadRefusal, RetainedInput, ScopeApi, ScopeId, Seed, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { definitionDigest, intentDigest, isScopeId, positionOf, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { isObject, type Item } from "@generalbusiness/artroom-derive";
import type { Founded } from "./core.ts";
import { namespace, type Binding } from "./namespace.ts";
import { ScopeObject, type Wiring } from "./object.ts";
import type { Summary } from "./reads.ts";
import type { Duty, Sealed } from "./store.ts";

/** The bindings of the deployed Worker (`wrangler.jsonc`): the one scope namespace. */
export interface Env { SCOPES: DurableObjectNamespace }

/** A scope's surface as a caller over RPC has it. */
interface Remote {
  found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions?: readonly DeclaredDefinition[], beside?: Beside): Promise<Founded>;
  submit(signed: SignedIntent, grants: readonly Grant[], beside?: Beside): Promise<Answer>;
  prepare(signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer>;
  settle(signed: SignedIntent): Promise<Settlement>;
  summary(reader: unknown): Promise<Read<Summary>>;
  items(reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>>;
  history(reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>>;
  entry(reader: unknown, seq: number): Promise<Read<Sealed>>;
  outbox(reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>>;
  duty(reader: unknown, duty: DutyId): Promise<Read<Duty>>;
  log(reader: unknown, cursor?: Cursor): Promise<Read<LogPage>>;
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest): Promise<Read<RetainedInput>>;
}

const MISSING = { ok: false, reason: "not-found" } as const;

/** Every operation, each on the object the scope ID names. A name that is no scope ID names nothing. */
export function api(binding: Binding): ScopeApi {
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
        const seed: Seed = { v: 1, kind: "directory", definition: typeof definition === "string" ? definition : definitionDigest(definition), creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
        name = scopeIdOf(seed);
      } catch {
        return { answer: "refused", reason: "source-unverified" };   // not values that have canonical bytes
      }
      return at(name)!.found(founding, definition, definitions, beside);
    },
    async submit(scope: string, signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> { return (await at(scope)?.submit(signed, grants, beside)) ?? { answer: "unavailable", reason: "unavailable" }; },
    async prepare(scope: string, signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> { return (await at(scope)?.prepare(signed, grants, capability, step)) ?? { answer: "unavailable", reason: "unavailable" }; },
    async settle(scope: string, signed: SignedIntent): Promise<Settlement> { return (await at(scope)?.settle(signed)) ?? MISSING; },
    async summary(scope: string, reader: unknown): Promise<Read<Summary>> { return (await at(scope)?.summary(reader)) ?? MISSING; },
    async items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return (await at(scope)?.items(reader, type, cursor)) ?? MISSING; },
    async history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return (await at(scope)?.history(reader, cursor)) ?? MISSING; },
    async entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>> { return (await at(scope)?.entry(reader, seq)) ?? MISSING; },
    async outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>> { return (await at(scope)?.outbox(reader, cursor)) ?? MISSING; },
    async duty(scope: string, reader: unknown, duty: DutyId): Promise<Read<Duty>> { return (await at(scope)?.duty(reader, duty)) ?? MISSING; },
    async log(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<LogPage>> { return (await at(scope)?.log(reader, cursor)) ?? MISSING; },
    async retained(scope: string, reader: unknown, kind: RetainedInput["kind"], digest: Digest): Promise<Read<RetainedInput>> { return (await at(scope)?.retained(reader, kind, digest)) ?? MISSING; },
  };
}
export type Api = ScopeApi;

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
};
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
  const scopes = api(binding);
  const url = new URL(request.url);
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
  const reader = request.headers.get("authorization");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const posts = (scope === undefined && what === undefined) || ((what === "acts" || what === "preparations" || what === "settle") && which === undefined);
  if (request.method !== (posts ? "POST" : "GET")) return json(405, { error: "method-not-allowed" });

  if (posts) {
    const given = await body(request);
    if (!given) return json(400, { error: "bad-request" });
    // What travels beside the intent is untrusted, like the rest of the body: the scope reads each text and each presented fact itself.
    const beside = { ...("texts" in given ? { texts: given["texts"] } : {}), ...("presented" in given ? { presented: given["presented"] } : {}) } as Beside;
    if (scope === undefined) return answered(await scopes.found(given["founding"] as SignedIntent, given["definition"] as DeclaredDefinition, (given["definitions"] ?? []) as DeclaredDefinition[], beside), 201);
    if (what === "acts") return answered(await scopes.submit(scope, given["signed"] as SignedIntent, (given["grants"] ?? []) as Grant[], beside), 200);
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
  if (what === "retained") return read(await scopes.retained(scope, reader, which as RetainedInput["kind"], last as Digest));
  return json(404, { error: "not-found" });
}

// ---------------------------------------------------------------- the deployed classes

/**
 * The scope's object as deployed: the namespace is its resolver, its
 * transport and its source of declarations. Every other port is the
 * production default.
 */
export class DeployedScope<E extends Env = Env> extends ScopeObject<E> {
  /** The one scope namespace. */
  protected scopes(): Binding { return this.env.SCOPES; }
  protected override wiring(_name: string | undefined): Wiring { return { ports: namespace(this.scopes()) }; }
}

/** The same operations over a service binding. */
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
  retained(scope: string, reader: unknown, kind: RetainedInput["kind"], digest: Digest): Promise<Read<RetainedInput>> { return api(this.scopes()).retained(scope, reader, kind, digest); }
}

export default { fetch: (request: Request, env: Env): Promise<Response> => route(request, env.SCOPES) };
