/**
 * The register's outside port (authority note, section 12.1.1). The scope's
 * operations driver owns sending and retrying; this adapter makes one provider
 * call and accepts only that call's own answer. No listing settles an attempt.
 */
import type { FieldValue, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, intentDigest, isDigest, isOperationId, seedDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { DIRECTORY_OF, isOf, repositoryName } from "@generalbusiness/artroom-platform";
import type { OutsideGiven } from "./object.ts";
import type { EffectAnswer, EffectRequest, Outside } from "./operations.ts";

/** Each method sends once. Missing, lost or malformed replies are no answer. */
export interface RegisterProvider {
  createRepository(name: string): Promise<unknown>;
  deleteRepository(id: string, name: string): Promise<unknown>;
  revokeCredential(id: string): Promise<unknown>;
}
export type RepositoryCreation =
  | { created: true; name: string; id: string; credential?: string }
  | { created: false; name: string; nameExists: boolean };
export type RepositoryDeletion = { deleted: boolean; id: string };
export type CredentialRevocation = { revoked: boolean; credential: string };
export interface RegisterHostOptions { host: string; namespace: string; provider: RegisterProvider }

const sameScope = (a: ScopeRef, b: ScopeRef): boolean => a.scope === b.scope && a.inc === b.inc && a.kind === b.kind;
const text = (value: unknown): value is string => typeof value === "string" && utf8(value).length <= 256;

/** Snapshot untrusted members once, including getters, then validate that snapshot. */
function members(reply: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (typeof reply !== "object" || reply === null || Array.isArray(reply)) return null;
  const value = reply as Record<string, unknown>;
  try {
    const keys = Object.keys(value);
    if (!required.every((key) => Object.hasOwn(value, key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) return null;
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
  } catch { return null; }
}
const answer = (result: "confirmed" | "refused", body: Record<string, FieldValue>): EffectAnswer => ({ result, evidence: { basis: "own-answer", body } });

export class RegisterHost implements Outside {
  readonly #given: OutsideGiven;
  readonly #host: string;
  readonly #namespace: string;
  readonly #provider: RegisterProvider;
  constructor(given: OutsideGiven, options: RegisterHostOptions) {
    this.#given = given;
    this.#host = options.host;
    this.#namespace = options.namespace;
    this.#provider = options.provider;
  }

  accepts(owner: string, kind: string): boolean {
    return isOf(owner, "platform:register") && ["create-repository", "delete-repository", "revoke-credential"].includes(kind);
  }

  async send(request: EffectRequest): Promise<EffectAnswer | null> {
    try {
      if (!this.#bound(request)) return null;
      if (request.kind === "create-repository") {
        const name = this.#name(request);
        if (name === null) return null;
        return this.#created(name, await this.#provider.createRepository(name));
      }
      const opening = request.origin.entry.input;
      if (opening.type !== "outcome" || !isOf(opening.owner, "platform:register") || opening.kind !== "create-repository" || opening.result !== "confirmed" || opening.evidence.basis !== "own-answer") return null;
      const body = members(opening.evidence.body, ["name", "id"], ["credential"]);
      if (!body || !text(body["name"]) || !text(body["id"]) || (body["credential"] !== undefined && !text(body["credential"]))) return null;
      if (request.kind === "delete-repository") {
        const id = body["id"];
        const reply = members(await this.#provider.deleteRepository(id, body["name"]), ["deleted", "id"]);
        return reply?.["id"] === id && typeof reply["deleted"] === "boolean" ? answer(reply["deleted"] ? "confirmed" : "refused", { id }) : null;
      }
      const credential = body["credential"];
      if (!text(credential)) return null;
      const reply = members(await this.#provider.revokeCredential(credential), ["revoked", "credential"]);
      return reply?.["credential"] === credential && typeof reply["revoked"] === "boolean" ? answer(reply["revoked"] ? "confirmed" : "refused", { credential }) : null;
    } catch {
      // A failure supplies no answer. Provider error text may contain secrets.
      return null;
    }
  }

  /** Bind a request to this scope, its recorded operation and its sealed opening. */
  #bound(request: EffectRequest): boolean {
    const given = this.#given;
    const scope = given.scope();
    const genesis = given.genesis();
    if (!scope || !sameScope(scope.at, request.scope) || scope.at.kind !== "register" || genesis?.seed.definition !== request.owner || !this.accepts(request.owner, request.kind) || !isOperationId(request.operation) || !Number.isSafeInteger(request.attempt) || request.attempt < 1) return false;
    const operation = given.state.operation(request.operation);
    if (!operation || operation.owner !== request.owner || operation.kind !== request.kind || !operation.attempts.some((attempt) => attempt.attempt === request.attempt)) return false;
    const [seq, k] = request.operation.split(":").map(Number);
    const origin = given.own(seq!);
    if (!origin || origin.entry.seq !== seq || !sameScope(origin.entry.at, scope.at) || origin.hash !== request.origin.hash || entryHash(request.origin.entry) !== origin.hash || canonicalize(origin.entry) !== canonicalize(request.origin.entry)) return false;
    const openings = origin.entry.effects.filter((effect) => effect.effect === "operation" && effect.k === k);
    if (openings.length !== 1 || openings[0]!.effect !== "operation" || openings[0]!.owner !== operation.owner || openings[0]!.kind !== operation.kind) return false;
    const register = given.state.page("register", ["open"], null, 1).items[0];
    return register?.values["host"] === this.#host && register.values["namespace"] === this.#namespace;
  }

  /** The sealed found entry and the live claim must hold the same actual seed. */
  #name(request: EffectRequest): string | null {
    const entry = request.origin.entry;
    if (entry.input.type !== "act" || entry.input.signed.intent.kind !== "found") return null;
    const claim = this.#given.state.item(entry.seq);
    const seeds = entry.effects.filter((effect) => effect.effect === "value" && effect.item === entry.seq && effect.slot === "seed");
    const seed = claim?.values["seed"];
    if (claim?.type !== "claim" || !isDigest(seed) || seeds.length !== 1 || seeds[0]!.effect !== "value" || seeds[0]!.value !== seed) return null;
    // The directory's version is the one that the register's own version creates.
    const definition = DIRECTORY_OF[this.#given.genesis()?.seed.definition ?? ""];
    if (!definition) return null;
    const derived = seedDigest({ v: 1, kind: "directory", definition, creator: request.scope, cause: intentDigest(entry.input.signed.intent), ordinal: 0 });
    return seed === derived ? repositoryName(seed, request.attempt) : null;
  }

  #created(name: string, reply: unknown): EffectAnswer | null {
    const body = members(reply, ["created", "name"], ["id", "credential", "nameExists"]);
    if (!body || body["name"] !== name) return null;
    if (body["created"] === true && Object.hasOwn(body, "id") && !Object.hasOwn(body, "nameExists") && text(body["id"]) && (!Object.hasOwn(body, "credential") || text(body["credential"]))) {
      return answer("confirmed", { name, id: body["id"], ...(Object.hasOwn(body, "credential") ? { credential: body["credential"] as string } : {}) });
    }
    if (body["created"] === false && typeof body["nameExists"] === "boolean" && !Object.hasOwn(body, "id") && !Object.hasOwn(body, "credential")) return answer("refused", { name, nameExists: body["nameExists"] });
    return null;
  }
}
