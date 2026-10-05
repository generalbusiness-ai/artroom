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
 *   client in another Worker.
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
 * | `POST /v1/scopes` | Found a directory. Body `{ founding, definition, definitions? }`. |
 * | `POST /v1/scopes/:scope/acts` | Submit an act. Body `{ signed, grants }`. |
 * | `POST /v1/scopes/:scope/settle` | The receipt of an accepted act. Body `{ signed }`. |
 * | `GET /v1/scopes/:scope` | The summary. |
 * | `GET /v1/scopes/:scope/items/:type?cursor=` | A page of retained final items. |
 * | `GET /v1/scopes/:scope/history?cursor=` | A page of the history. |
 * | `GET /v1/scopes/:scope/entries/:seq` | One entry. |
 * | `GET /v1/scopes/:scope/outbox?cursor=` | A page of the outbox. |
 *
 * A reader presents itself in the `Authorization` header. What it must be is
 * the authority note's; the production readers port lets nobody read.
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import type { Answer, Cursor, DeclaredDefinition, Digest, Grant, PlatformDefinition, Read, ReadRefusal, ScopeId, Seed, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { definitionDigest, intentDigest, isScopeId, scopeIdOf } from "@generalbusiness/artroom-bytes";
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
  found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions?: readonly DeclaredDefinition[]): Promise<Founded>;
  submit(signed: SignedIntent, grants: readonly Grant[]): Promise<Answer>;
  settle(signed: SignedIntent): Promise<Settlement>;
  summary(reader: unknown): Promise<Read<Summary>>;
  items(reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>>;
  history(reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>>;
  entry(reader: unknown, seq: number): Promise<Read<Sealed>>;
  outbox(reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>>;
}

const MISSING = { ok: false, reason: "not-found" } as const;

/** Every operation, each on the object the scope ID names. A name that is no scope ID names nothing. */
export function api(binding: Binding) {
  const at = (scope: string): Remote | null => (isScopeId(scope) ? binding.get(binding.idFromName(scope)) as Remote : null);
  return {
    /**
     * Section 7.1: the service computes the seed from the signed intent and
     * the definition, and the scope ID is the seed's digest. The object with
     * that name checks both again. `definition` is a declaration, or the
     * digest or platform name of one. `definitions`: the declarations it
     * names in `create` sends, which the directory retains for its children.
     */
    async found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = []): Promise<Founded> {
      let name: ScopeId;
      try {
        const seed: Seed = { v: 1, kind: "directory", definition: typeof definition === "string" ? definition : definitionDigest(definition), creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
        name = scopeIdOf(seed);
      } catch {
        return { answer: "refused", reason: "source-unverified" };   // not values that have canonical bytes
      }
      return at(name)!.found(founding, definition, definitions);
    },
    async submit(scope: string, signed: SignedIntent, grants: readonly Grant[]): Promise<Answer> { return (await at(scope)?.submit(signed, grants)) ?? { answer: "unavailable", reason: "unavailable" }; },
    async settle(scope: string, signed: SignedIntent): Promise<Settlement> { return (await at(scope)?.settle(signed)) ?? MISSING; },
    async summary(scope: string, reader: unknown): Promise<Read<Summary>> { return (await at(scope)?.summary(reader)) ?? MISSING; },
    async items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return (await at(scope)?.items(reader, type, cursor)) ?? MISSING; },
    async history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return (await at(scope)?.history(reader, cursor)) ?? MISSING; },
    async entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>> { return (await at(scope)?.entry(reader, seq)) ?? MISSING; },
    async outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>> { return (await at(scope)?.outbox(reader, cursor)) ?? MISSING; },
  };
}
export type Api = ReturnType<typeof api>;

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

/** The JSON object of a request body, or null. */
async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    const value: unknown = text.length > BODY_BYTES ? null : JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** One request to the routes in the table above. */
export async function route(request: Request, binding: Binding): Promise<Response> {
  const scopes = api(binding);
  const url = new URL(request.url);
  const [v, root, scope, what, which, ...more] = url.pathname.split("/").slice(1).map(decodeURIComponent);
  if (v !== "v1" || root !== "scopes" || more.length > 0) return json(404, { error: "not-found" });
  const reader = request.headers.get("authorization");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const posts = (scope === undefined && what === undefined) || ((what === "acts" || what === "settle") && which === undefined);
  if (request.method !== (posts ? "POST" : "GET")) return json(405, { error: "method-not-allowed" });

  if (posts) {
    const given = await body(request);
    if (!given) return json(400, { error: "bad-request" });
    if (scope === undefined) return answered(await scopes.found(given["founding"] as SignedIntent, given["definition"] as DeclaredDefinition, (given["definitions"] ?? []) as DeclaredDefinition[]), 201);
    if (what === "acts") return answered(await scopes.submit(scope, given["signed"] as SignedIntent, (given["grants"] ?? []) as Grant[]), 200);
    return read(await scopes.settle(scope, given["signed"] as SignedIntent));
  }
  if (scope === undefined) return json(404, { error: "not-found" });
  if (what === undefined) return read(await scopes.summary(scope, reader));
  if (what === "items" && which !== undefined) return read(await scopes.items(scope, reader, which, cursor));
  if (what === "history" && which === undefined) return read(await scopes.history(scope, reader, cursor));
  if (what === "entries" && which !== undefined && /^(0|[1-9][0-9]{0,15})$/.test(which)) return read(await scopes.entry(scope, reader, Number(which)));
  if (what === "outbox" && which === undefined) return read(await scopes.outbox(scope, reader, cursor));
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
export class ScopeService<E extends Env = Env> extends WorkerEntrypoint<E> {
  /** The one scope namespace. */
  protected scopes(): Binding { return this.env.SCOPES; }
  found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = []): Promise<Founded> { return api(this.scopes()).found(founding, definition, definitions); }
  submit(scope: string, signed: SignedIntent, grants: readonly Grant[]): Promise<Answer> { return api(this.scopes()).submit(scope, signed, grants); }
  settle(scope: string, signed: SignedIntent): Promise<Settlement> { return api(this.scopes()).settle(scope, signed); }
  summary(scope: string, reader: unknown): Promise<Read<Summary>> { return api(this.scopes()).summary(scope, reader); }
  items(scope: string, reader: unknown, type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return api(this.scopes()).items(scope, reader, type, cursor); }
  history(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return api(this.scopes()).history(scope, reader, cursor); }
  entry(scope: string, reader: unknown, seq: number): Promise<Read<Sealed>> { return api(this.scopes()).entry(scope, reader, seq); }
  outbox(scope: string, reader: unknown, cursor?: Cursor): Promise<Read<readonly Duty[]>> { return api(this.scopes()).outbox(scope, reader, cursor); }
}

export default { fetch: (request: Request, env: Env): Promise<Response> => route(request, env.SCOPES) };
