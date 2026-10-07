/** Destination outside effects. Provider calls happen outside the scope's commit;
 * platform rules alone judge their evidence. Plaintexts stay in private custody. */
import type { Entry, FactRef, FieldValue, OperationId, RetainedInput, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, isFactRef, isOperationId, parseStrict, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { isEntryOf, type Operation } from "@generalbusiness/artroom-derive";
import { DESTINATION, DESTINATION_KINDS, destinationBranch, destinationMint, destinationRead, destinationReceipt, destinationRevokedMint, destinationSends, destinationStatement, destinationTarget, destinationWrite, firstHeadCommit, foundingObjects, isRecordedJudgeEvidence, revokedToken, type DestinationObject, type ObjectFormat, type RecordedJudgeEvidence } from "@generalbusiness/artroom-platform";
import type { CredentialPosition, CredentialStore } from "./credential-store.ts";
import type { OutsideGiven } from "./object.ts";
import type { EffectAnswer, EffectRequest, Outside } from "./operations.ts";
import type { Sealed } from "./store.ts";

export interface DestinationRepository { host: string; namespace: string; name: string; id: string }
export interface DestinationBinding { scope: ScopeRef; mint: OperationId; attempt: number; write: OperationId; writeAttempt: number; ref: string }
export interface DestinationInspection { repository: DestinationRepository; ref: string; recorded: string | null; base: string; integration: string; tree: string; reports: readonly string[] }
export interface DestinationProvider {
  format(repository: DestinationRepository): Promise<ObjectFormat>;
  /** Own reply: {id, ends, plaintext}, or {minted:false}. No request is retried here. */
  mint(repository: DestinationRepository, binding: DestinationBinding): Promise<unknown>;
  /** Own reply: {revoked:boolean, id}. */
  revoke(id: string, plaintext: string): Promise<unknown>;
  ref(repository: DestinationRepository, ref: string): Promise<string | null>;
  /** Read and validate the complete object closure before returning it. */
  objects(repository: DestinationRepository, commit: string): Promise<readonly DestinationObject[]>;
  /** Validate object closure and ancestry at the actual send boundary. Own reply: {send:...}. */
  send(request: { repository: DestinationRepository; ref: string; old: string | null; commit: string; objects: readonly DestinationObject[]; expectedTree?: string; requireParentless: boolean; token: string; binding: DestinationBinding; allowed(): boolean }): Promise<unknown>;
  inspect(context: DestinationInspection): Promise<{ evidence: RecordedJudgeEvidence; retain?: readonly RetainedInput[] }>;
}
export interface DestinationHostOptions { host: string; namespace: string; provider: DestinationProvider; custody: Pick<CredentialStore, "put" | "reply" | "live" | "read" | "judged" | "revoked" | "pending"> }

const sameScope = (a: ScopeRef, b: ScopeRef) => canonicalize(a) === canonicalize(b);
const objectId = (v: unknown): v is string => typeof v === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && utf8(v).length <= 256;
function members(reply: unknown, names: readonly string[]): Record<string, unknown> | null {
  if (typeof reply !== "object" || reply === null || Array.isArray(reply)) return null;
  try {
    const keys = Object.keys(reply);
    if (keys.length !== names.length || !names.every((name) => Object.hasOwn(reply, name))) return null;
    return Object.fromEntries(keys.map((key) => [key, (reply as Record<string, unknown>)[key]]));
  } catch { return null; }
}
const answer = (result: EffectAnswer["result"], body: unknown, basis: "own-answer" | "read" = "own-answer"): EffectAnswer => ({ result, evidence: { basis, body: body as FieldValue } });

export class DestinationHost implements Outside {
  readonly #given: OutsideGiven;
  readonly #options: DestinationHostOptions;
  #replyCursor: CredentialPosition | null = null;
  constructor(given: OutsideGiven, options: DestinationHostOptions) { this.#given = given; this.#options = options; }

  accepts(owner: string, kind: string): boolean { return owner === DESTINATION && (Object.values(DESTINATION_KINDS) as string[]).includes(kind); }
  /** Repeating these reads never repeats a host mutation. The driver keeps the same attempt. */
  readonly recovery = {
    accepts: (owner: string, kind: string): boolean => owner === DESTINATION && [DESTINATION_KINDS.judge, DESTINATION_KINDS.read, DESTINATION_KINDS.adoptRead].includes(kind as "judge" | "read" | "adopt-read"),
    read: (request: EffectRequest): Promise<EffectAnswer | null> => this.recovery.accepts(request.owner, request.kind) ? this.send(request) : Promise.resolve(null),
  };

  /** One indexed page of retained own mint replies. Retrieval sends nothing. */
  replies(limit: number): { answers: { operation: OperationId; attempt: number; answer: EffectAnswer }[]; more: boolean } {
    const scope = this.#given.scope();
    if (!scope || !Number.isSafeInteger(limit) || limit < 1) return { answers: [], more: false };
    const page = this.#options.custody.pending(this.#replyCursor, limit);
    const last = page.items.at(-1);
    // Operation IDs sort as text. A completed walk starts afresh on the next
    // pass so a later mint whose text sorts earlier is still found.
    this.#replyCursor = page.more && last ? { mint: last.mint, attempt: last.attempt } : null;
    const answers: { operation: OperationId; attempt: number; answer: EffectAnswer }[] = [];
    for (const held of page.items) {
      const operation = this.#given.state.operation(held.mint);
      if (operation?.owner !== DESTINATION || operation.kind !== DESTINATION_KINDS.mint || !text(held.id) || timeMs(held.ends) === null) continue;
      const origin = this.#given.own(Number(held.mint.split(":")[0]));
      if (!origin || !this.#bound({ scope: scope.at, operation: held.mint, attempt: held.attempt, owner: operation.owner, kind: operation.kind, origin })) continue;
      answers.push({ operation: held.mint, attempt: held.attempt, answer: answer("confirmed", { token: held.id, ends: held.ends }) });
    }
    return { answers, more: page.more && page.items.length > 0 };
  }

  async send(request: EffectRequest): Promise<EffectAnswer | null> {
    try {
      const context = this.#bound(request);
      if (!context) return null;
      const { operation, repository, ref } = context;
      if (operation.kind === DESTINATION_KINDS.mint) {
        const served = destinationWrite(this.#given.state, this.#given.own, operation);
        if (!served) return null;
        const binding = this.#binding(request, served.write, served.attempt, ref);
        const reply = await this.#options.provider.mint(repository, binding);
        if (members(reply, ["minted"])?.["minted"] === false) return answer("refused", {});
        const body = members(reply, ["id", "ends", "plaintext"]);
        if (!body || !text(body["id"]) || typeof body["ends"] !== "string" || timeMs(body["ends"]) === null || typeof body["plaintext"] !== "string" || body["plaintext"].length === 0 || utf8(body["plaintext"]).length > 4096) return null;
        const held = this.#options.custody.put({ id: body["id"], ends: body["ends"], plaintext: body["plaintext"], mint: operation.id, attempt: request.attempt });
        return held === "stored" || held === "repeat" ? answer("confirmed", { token: body["id"], ends: body["ends"] }) : null;
      }
      if (operation.kind === DESTINATION_KINDS.revoke) {
        const mint = destinationRevokedMint(this.#given.state, this.#given.own, operation);
        const token = revokedToken(this.#given.state, this.#given.own, operation);
        const held = mint ? this.#options.custody.read(mint.id, 1) : null;
        if (!token || held?.id !== token || !held.plaintext) return null;
        const reply = members(await this.#options.provider.revoke(token, held.plaintext), ["revoked", "id"]);
        if (reply?.["id"] !== token || typeof reply["revoked"] !== "boolean") return null;
        return answer(reply["revoked"] ? "confirmed" : "refused", { token });
      }
      if (operation.kind === DESTINATION_KINDS.judge) {
        const inspection = this.#inspection(repository, ref);
        if (!inspection) return null;
        const reply = await this.#options.provider.inspect(inspection);
        return isRecordedJudgeEvidence(reply.evidence) ? { ...answer("confirmed", reply.evidence), ...(reply.retain === undefined ? {} : { retain: reply.retain }) } : null;
      }
      if (operation.kind === DESTINATION_KINDS.read || operation.kind === DESTINATION_KINDS.adoptRead) {
        const readRef = this.#readRef(operation, ref);
        if (!readRef) return null;
        const seen = await this.#seen(repository, readRef);
        // The platform's deciding-read rule decides whether this observation is decisive.
        return seen === "failed" ? null : answer("confirmed", { seen });
      }
      return await this.#write(request, operation, repository, ref);
    } catch { return null; } // Provider errors may contain secrets.
  }

  /** Only the actual committed outcome releases custody for use or drops a revoked secret. */
  judged(at: { scope: ScopeRef; operation: OperationId; attempt: number }, sealed: Sealed | null): void {
    const scope = this.#given.scope();
    const operation = this.#given.state.operation(at.operation);
    if (!scope || !sameScope(scope.at, at.scope) || operation?.owner !== DESTINATION || (operation.kind !== DESTINATION_KINDS.mint && operation.kind !== DESTINATION_KINDS.revoke)) return;
    // A repeat/conflict notification carries no new entry. Keep custody backed
    // by the exact confirmed outcome this scope previously committed.
    const confirmed = sealed === null && operation.kind === DESTINATION_KINDS.mint ? operation.attempts.find((attempt) => attempt.attempt === at.attempt)?.outcomes.find((outcome) => outcome.result === "confirmed") : undefined;
    const outcome = sealed ?? (confirmed ? this.#given.own(confirmed.seq) : null);
    const recorded = outcome ? this.#given.own(outcome.entry.seq) : null;
    const input = recorded?.entry.input;
    const valid = outcome && recorded?.hash === outcome.hash && canonicalize(recorded.entry) === canonicalize(outcome.entry) && input?.type === "outcome" && input.operation === at.operation && input.attempt === at.attempt && input.owner === DESTINATION && input.kind === operation.kind && input.result === "confirmed" && input.evidence.basis === "own-answer";
    if (operation.kind === DESTINATION_KINDS.revoke) {
      const body = valid && input.type === "outcome" ? members(input.evidence.body, ["token"]) : null;
      const mint = body ? destinationRevokedMint(this.#given.state, this.#given.own, operation) : null;
      if (mint && body?.["token"] === revokedToken(this.#given.state, this.#given.own, operation)) this.#options.custody.revoked(mint.id, 1);
      return;
    }
    const body = valid && input.type === "outcome" ? members(input.evidence.body, ["token", "ends"]) : null;
    this.#options.custody.judged(at.operation, at.attempt, body && text(body["token"]) && typeof body["ends"] === "string" && timeMs(body["ends"]) !== null ? { id: body["token"], ends: body["ends"] } : null);
  }

  #bound(request: EffectRequest): { operation: Operation; repository: DestinationRepository; ref: string } | null {
    const scope = this.#given.scope();
    if (!scope || scope.at.kind !== "destination" || !sameScope(scope.at, request.scope) || this.#given.genesis()?.seed.definition !== DESTINATION || !this.accepts(request.owner, request.kind) || !isOperationId(request.operation) || !Number.isSafeInteger(request.attempt) || request.attempt < 1) return null;
    const operation = this.#given.state.operation(request.operation);
    if (!operation || operation.owner !== request.owner || operation.kind !== request.kind || !operation.attempts.some((attempt) => attempt.attempt === request.attempt)) return null;
    const [seq, k] = request.operation.split(":").map(Number);
    const origin = this.#given.own(seq!);
    if (!origin || !sameScope(origin.entry.at, request.scope) || origin.hash !== request.origin.hash || entryHash(request.origin.entry) !== origin.hash || canonicalize(origin.entry) !== canonicalize(request.origin.entry)) return null;
    const opening = origin.entry.effects.filter((effect) => effect.effect === "operation" && effect.k === k);
    if (opening.length !== 1 || opening[0]!.effect !== "operation" || opening[0]!.owner !== operation.owner || opening[0]!.kind !== operation.kind) return null;
    const branch = destinationBranch(this.#given.state);
    const repository = members(branch?.values["repository"], ["host", "namespace", "name", "id"]);
    const name = branch?.values["name"];
    if (!repository || !Object.values(repository).every(text) || repository["host"] !== this.#options.host || repository["namespace"] !== this.#options.namespace || !text(name)) return null;
    return { operation, repository: repository as unknown as DestinationRepository, ref: `refs/heads/${name}` };
  }

  #binding(request: EffectRequest, write: Operation, attempt: number, ref: string): DestinationBinding {
    const mint = destinationMint(this.#given.state, write, attempt);
    if (!mint) throw new Error("missing mint");
    return { scope: request.scope, mint: mint.id, attempt: 1, write: write.id, writeAttempt: attempt, ref: write.kind === DESTINATION_KINDS.receipt ? this.#receipt(write).ref : ref };
  }
  #receipt(write: Operation) {
    const target = destinationTarget(this.#given.state, this.#given.own, write);
    if (target?.type !== "receipt") throw new Error("missing receipt");
    // Refs depend on recorded facts, not object format.
    return destinationReceipt(this.#given.state, this.#given.own, target, "sha1");
  }
  async #seen(repository: DestinationRepository, ref: string): Promise<string> {
    try { const seen = await this.#options.provider.ref(repository, ref); return seen === null ? "absent" : objectId(seen) ? seen : "failed"; } catch { return "failed"; }
  }
  async #write(request: EffectRequest, write: Operation, repository: DestinationRepository, branchRef: string): Promise<EffectAnswer | null> {
    const state = this.#given.state;
    const own = this.#given.own;
    const binding = this.#binding(request, write, request.attempt, branchRef);
    const target = destinationTarget(state, own, write);
    const mint = destinationMint(state, write, request.attempt);
    const credential = mint ? this.#options.custody.live(mint.id, 1, this.#given.clock.read()) : null;
    if (!destinationSends(state, own, write, request.attempt) || !credential) return answer("refused", { send: "not-sent", seen: await this.#seen(repository, binding.ref) });
    const format = await this.#options.provider.format(repository);
    if (format !== "sha1" && format !== "sha256") return null;
    let commit: string;
    let objects: readonly DestinationObject[];
    let old: string | null = null;
    let expectedTree: string | undefined;
    let requireParentless = false;
    if (write.kind === DESTINATION_KINDS.receipt) {
      if (!target) return null;
      const receipt = destinationReceipt(state, own, target, format);
      ({ commit, objects } = receipt);
      expectedTree = objects.find((object) => object.kind === "tree")!.id;
      requireParentless = true;
    } else if (write.kind === DESTINATION_KINDS.firstHead) {
      commit = firstHeadCommit(state, own, write, format);
      const claim = destinationBranch(state)?.refs["claim"];
      const genesis = own(0)?.entry;
      if (!genesis || !isFactRef(claim)) return null;
      const founding = foundingObjects(format, genesis.at.scope, genesis.time, claim);
      objects = commit === founding.commit ? founding.objects : await this.#options.provider.objects(repository, commit);
      if (commit === founding.commit) { expectedTree = founding.objects[0]!.id; requireParentless = true; }
    } else {
      const head = destinationBranch(state)?.values["head"];
      const integration = target?.values["integration"];
      if (!objectId(head) || !objectId(integration)) return null;
      old = head;
      commit = integration;
      // The confirmed reservation compared this tree with its retained manifest.
      const reservedAt = target?.values["reservedAt"];
      const reserved = typeof reservedAt === "number" ? own(reservedAt)?.entry.input : null;
      const evidence = reserved?.type === "outcome" && reserved.owner === DESTINATION && reserved.kind === DESTINATION_KINDS.judge && reserved.result === "confirmed" && isRecordedJudgeEvidence(reserved.evidence.body) ? reserved.evidence.body : null;
      const tree = evidence?.tree;
      if (!objectId(tree)) return null;
      expectedTree = tree;
      objects = await this.#options.provider.objects(repository, commit);
    }
    // Async preparation may have let a read or compromise close the target.
    const live = this.#options.custody.live(binding.mint, 1, this.#given.clock.read());
    if (!destinationSends(state, own, write, request.attempt) || live?.id !== credential.id || live?.plaintext !== credential.plaintext) return answer("refused", { send: "not-sent", seen: await this.#seen(repository, binding.ref) });
    const allowed = () => {
      const held = this.#options.custody.live(binding.mint, 1, this.#given.clock.read());
      return destinationSends(state, own, write, request.attempt) && held?.id === credential.id && held?.plaintext === credential.plaintext;
    };
    const reply = members(await this.#options.provider.send({ repository, ref: binding.ref, old, commit, objects, ...(expectedTree === undefined ? {} : { expectedTree }), requireParentless, token: live.plaintext!, binding, allowed }), ["send"]);
    const sent = reply?.["send"];
    if (sent !== "accepted" && sent !== "refused" && sent !== "not-sent") return null;
    return answer(sent === "accepted" ? "confirmed" : "refused", { send: sent, seen: await this.#seen(repository, binding.ref) });
  }

  #readRef(read: Operation, branchRef: string): string | null {
    if (read.kind === DESTINATION_KINDS.adoptRead) return branchRef;
    const of = destinationRead(this.#given.state, this.#given.own, read);
    if (!of) return null;
    if (of !== "receipt") return branchRef;
    const input = this.#given.own(Number(read.id.split(":")[0]))?.entry.input;
    const write = input?.type === "outcome" ? this.#given.state.operation(input.operation) : null;
    return write ? this.#receipt(write).ref : null;
  }
  #fact(entry: Entry, fact: FactRef): Entry | null {
    const use = entry.uses.find((use) => canonicalize(use.fact) === canonicalize(fact));
    const kept = use ? this.#given.retained("entry", use.content) : null;
    if (!kept) return null;
    const copy = parseStrict(kept.bytes) as unknown as Entry;
    return isEntryOf(copy, fact) ? copy : null;
  }
  #inspection(repository: DestinationRepository, ref: string): DestinationInspection | null {
    const branch = destinationBranch(this.#given.state);
    const id = branch?.refs["judging"];
    const publication = typeof id === "number" ? this.#given.state.item(id) : null;
    if (!publication) return null;
    const statement = destinationStatement(this.#given.own, publication);
    const reserve = this.#given.own(publication.id)?.entry;
    if (!reserve) return null;
    const manifest = this.#fact(reserve, statement.manifest);
    if (manifest?.input.type !== "act") return null;
    const { base, integration, tree } = manifest.input.signed.intent.fields;
    if (!objectId(base) || !objectId(integration) || !objectId(tree)) return null;
    const reports: string[] = [];
    for (const fact of statement.reports) {
      const report = this.#fact(reserve, fact);
      const set = report?.effects.find((effect) => effect.effect === "value" && effect.item === report.seq && effect.slot === "commit");
      if (set?.effect !== "value" || !objectId(set.value)) return null;
      reports.push(set.value);
    }
    const recorded = branch?.values["head"];
    return { repository, ref, recorded: objectId(recorded) ? recorded : null, base, integration, tree, reports };
  }
}
