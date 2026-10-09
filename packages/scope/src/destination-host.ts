/** Destination outside effects. Provider calls happen outside the scope's commit;
 * platform rules alone judge their evidence. Plaintexts stay in private custody.
 *
 * A one-file manifest (i5 edit) names no integration commit: this port writes it.
 * For its `judge` it reads the base's closure from the host, writes the file into
 * the published tree with the platform's `editObjects`, and answers the shared
 * inspection of those objects. For its push it builds the same objects again, with
 * the time of the entry that reserved it, and sends them with the base's closure.
 * Every provider sends them the same way. */
import type { ReservationSnapshot, SignedIntent, Entry, FactRef, FieldValue, KeyId, OperationId, RetainedInput, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, isOperationId, isFactRef, verifySignedIntent, parseStrict, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { isEntryOf, valueDigest, type Item, type Operation } from "@generalbusiness/artroom-derive";
import { DESTINATION_KINDS, READ_TOKEN_HOURS, destinationBranch, destinationMint, destinationRead, destinationReceipt, destinationRevokedMint, destinationSends, destinationStatement, destinationTarget, destinationWrite, editObjects, editTree, manifestCommit, editPath, fileOf, sourcesOf, manifestFiles, fileSound, firstHeadCommit, foundingOf, isOf, isRecordedJudgeEvidence, revokedToken, type DestinationObject, type EditFile, type ObjectFormat, type RecordedJudgeEvidence } from "@generalbusiness/artroom-platform";
import { GitRefusal, READ_BOUNDS, Reader, type GitSource } from "@generalbusiness/artroom-git";
import type { CredentialPosition, CredentialStore, RevocationPosition } from "./credential-store.ts";
import type { OutsideGiven } from "./object.ts";
import type { EffectAnswer, EffectRequest, Outside } from "./operations.ts";
import type { Sealed } from "./store.ts";
import { inspectGit } from "./github-host.ts";

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
  send(request: { repository: DestinationRepository; ref: string; old: string | null; commit: string; objects: readonly DestinationObject[]; expectedTree?: string; requireParentless: boolean; token: string; binding: DestinationBinding; allowed(): boolean; sentAt?: Timestamp }): Promise<unknown>;
  deleteRef?(request: { repository: DestinationRepository; ref: string; old: string; token: string; binding: DestinationBinding; allowed(): boolean; sentAt?: Timestamp }): Promise<unknown>;
  inspect(context: DestinationInspection): Promise<{ evidence: RecordedJudgeEvidence; retain?: readonly RetainedInput[] }>;
  /**
   * One read credential for the repository, for a member's `read-token`: `handle` is the host's nonsecret name for it, chosen
   * before the request; `seconds` the lifetime that the act asked for. Own reply: {id, ends, plaintext}, or {minted:false}.
   * No request is retried here.
   */
  mintRead(repository: DestinationRepository, request: { handle: string; seconds: number }): Promise<unknown>;
  /** The repository's remote URL at this host, as a person clones it. */
  remote(repository: DestinationRepository): string;
}
/** What the one-time credential read answers: the plaintext, its end, and the remote URL it opens. */
export interface ReadCredential { token: string; ends: string; remote: string }
export interface SnapshotReader {
  job(fact: FactRef): Promise<{ entry: Entry; under: string; state: string; decidedBy?: FactRef | null } | null>;
  key(membership: string, key: KeyId): Promise<unknown>;
}
export interface DestinationHostOptions { snapshotReader?: SnapshotReader; host: string; namespace: string; provider: DestinationProvider; custody: Pick<CredentialStore, "put" | "reply" | "live" | "read" | "judged" | "revoked" | "pending" | "expectRevoke" | "revocations" | "held" | "take"> }

/** The byte domain of the nonsecret handle of a member's read credential. */
const READ_HANDLE = "artroom.read-credential.v1";
/** The kinds whose confirmed outcome puts a plaintext in custody: a write's token, and a member's read token. */
const MINTS: readonly string[] = [DESTINATION_KINDS.mint, DESTINATION_KINDS.mintRead];
/** The destination, without its version: every version that the platform package serves is written by this host. */
const OWNER = "platform:destination";

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
  #revokeCursor: RevocationPosition | null = null;
  constructor(given: OutsideGiven, options: DestinationHostOptions) { this.#given = given; this.#options = options; }

  accepts(owner: string, kind: string): boolean { return isOf(owner, OWNER) && ([...Object.values(DESTINATION_KINDS), "check-judge", "reservation-stage", "reservation-delete"] as string[]).includes(kind); }
  /** Repeating these reads never repeats a host mutation. The driver keeps the same attempt. */
  readonly recovery = {
    accepts: (owner: string, kind: string): boolean => isOf(owner, OWNER) && [DESTINATION_KINDS.judge, DESTINATION_KINDS.read, DESTINATION_KINDS.adoptRead, "check-judge"].includes(kind as "judge" | "read" | "adopt-read" | "check-judge"),
    read: (request: EffectRequest): Promise<EffectAnswer | null> => this.recovery.accepts(request.owner, request.kind) ? this.send(request) : Promise.resolve(null),
  };

  /** At most one page from each private index: confirmed revocations first,
   * then retained mint replies within the remaining batch. Retrieval writes
   * nothing and sends nothing. An unknown revocation supplies no answer. */
  replies(limit: number): { answers: { operation: OperationId; attempt: number; answer: EffectAnswer }[]; more: boolean } {
    const scope = this.#given.scope();
    if (!scope || !Number.isSafeInteger(limit) || limit < 1) return { answers: [], more: false };
    const answers: { operation: OperationId; attempt: number; answer: EffectAnswer }[] = [];
    const revocations = this.#options.custody.revocations(this.#revokeCursor, limit);
    const lastRevoke = revocations.items.at(-1);
    this.#revokeCursor = revocations.more && lastRevoke ? { revoke: lastRevoke.revoke, attempt: lastRevoke.attempt } : null;
    for (const expected of revocations.items) {
      const operation = this.#given.state.operation(expected.revoke);
      if (!isOf(operation?.owner, OWNER) || operation.kind !== DESTINATION_KINDS.revoke) continue;
      const origin = this.#given.own(Number(expected.revoke.split(":")[0]));
      if (!origin || !this.#bound({ scope: scope.at, operation: expected.revoke, attempt: expected.attempt, owner: operation.owner, kind: operation.kind, origin })) continue;
      const mint = destinationRevokedMint(this.#given.state, this.#given.own, operation);
      if (mint?.id !== expected.mint || expected.mintAttempt !== 1 || revokedToken(this.#given.state, this.#given.own, operation) !== expected.id) continue;
      const confirmed = this.#confirmation(operation, expected.attempt)?.entry.input;
      const body = confirmed?.type === "outcome" ? members(confirmed.evidence.body, ["token"]) : null;
      if (body?.["token"] !== expected.id) continue;
      answers.push({ operation: expected.revoke, attempt: expected.attempt, answer: answer("confirmed", { token: expected.id }) });
    }
    // A full revocation batch leaves mint replies for the next pass only when
    // another indexed page or a retained mint actually remains. A lost private
    // callback alone must not create an immediate alarm loop.
    if (answers.length === limit) {
      const pending = this.#options.custody.pending(null, 1);
      return { answers, more: (revocations.more && revocations.items.length > 0) || pending.items.length > 0 };
    }
    const page = this.#options.custody.pending(this.#replyCursor, limit - answers.length);
    const last = page.items.at(-1);
    // Operation IDs sort as text. A completed walk starts afresh on the next
    // pass so a later mint whose text sorts earlier is still found.
    this.#replyCursor = page.more && last ? { mint: last.mint, attempt: last.attempt } : null;
    for (const held of page.items) {
      const operation = this.#given.state.operation(held.mint);
      if (!isOf(operation?.owner, OWNER) || !MINTS.includes(operation.kind) || !text(held.id) || timeMs(held.ends) === null) continue;
      const origin = this.#given.own(Number(held.mint.split(":")[0]));
      if (!origin || !this.#bound({ scope: scope.at, operation: held.mint, attempt: held.attempt, owner: operation.owner, kind: operation.kind, origin })) continue;
      answers.push({ operation: held.mint, attempt: held.attempt, answer: answer("confirmed", { token: held.id, ends: held.ends }) });
    }
    return { answers, more: (revocations.more && revocations.items.length > 0) || (page.more && page.items.length > 0) };
  }

  async send(request: EffectRequest): Promise<EffectAnswer | null> {
    try {
      const context = this.#bound(request);
      if (!context) return null;
      const { operation, repository, ref } = context;
      if (operation.kind === "check-judge") {
        const input = request.origin.entry.input;
        const body = input.type === "delivery" && input.message.class === "request" && input.message.type === "tell" ? input.message.body as { fields: Record<string, FieldValue> } : null;
        const job = body?.fields["job"];
        const result = isFactRef(body?.fields["result"]) ? body.fields["result"] : input.type === "delivery" ? input.from : null;
        if (!isFactRef(job) || !result || !this.#options.snapshotReader) return null;
        const readAt = this.#given.clock.read();
        const read = await this.#options.snapshotReader.job(job);
        const current = !!read && ["passed", "failed", "errored"].includes(read.state) && canonicalize(read.decidedBy ?? null) === canonicalize(result);
        return answer("confirmed", { current, job, result, readAt });
      }
      if (operation.kind === DESTINATION_KINDS.mintRead) {
        const hours = this.#hours(operation);
        if (hours === null) return null;
        const id = this.#readHandle(request);
        const reply = await this.#options.provider.mintRead(repository, { handle: id, seconds: hours * 3600 });
        if (members(reply, ["minted"])?.["minted"] === false) return answer("refused", {});
        const body = members(reply, ["id", "ends", "plaintext"]);
        if (!body || body["id"] !== id || typeof body["ends"] !== "string" || timeMs(body["ends"]) === null || typeof body["plaintext"] !== "string" || body["plaintext"].length === 0 || utf8(body["plaintext"]).length > 4096) return null;
        const held = this.#options.custody.put({ id, ends: body["ends"], plaintext: body["plaintext"], mint: operation.id, attempt: request.attempt });
        return held === "stored" || held === "repeat" ? answer("confirmed", { token: id, ends: body["ends"] }) : null;
      }
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
        if (!this.#options.custody.expectRevoke({ revoke: operation.id, attempt: request.attempt, mint: mint!.id, mintAttempt: 1, id: token })) return null;
        const reply = members(await this.#options.provider.revoke(token, held.plaintext), ["revoked", "id"]);
        if (reply?.["id"] !== token || typeof reply["revoked"] !== "boolean") return null;
        return answer(reply["revoked"] ? "confirmed" : "refused", { token });
      }
      if (operation.kind === DESTINATION_KINDS.judge) {
        const list = this.#list(this.#judging());
        if (list) return await this.#inspectList(repository, ref, list);
        const edit = this.#edit(this.#judging());
        if (edit) return await this.#inspectEdit(repository, ref, edit);
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
    if (!scope || !sameScope(scope.at, at.scope) || !isOf(operation?.owner, OWNER) || (!MINTS.includes(operation.kind) && operation.kind !== DESTINATION_KINDS.revoke)) return;
    // A repeat/conflict notification carries no new entry. Keep custody backed
    // by the exact confirmed outcome this scope previously committed.
    const outcome = sealed ?? this.#confirmation(operation, at.attempt);
    const recorded = outcome ? this.#given.own(outcome.entry.seq) : null;
    const input = recorded?.entry.input;
    const valid = outcome && recorded?.hash === outcome.hash && canonicalize(recorded.entry) === canonicalize(outcome.entry) && sameScope(recorded.entry.at, at.scope) && input?.type === "outcome" && input.operation === at.operation && input.attempt === at.attempt && isOf(input.owner, OWNER) && input.kind === operation.kind && input.result === "confirmed" && input.evidence.basis === "own-answer";
    if (operation.kind === DESTINATION_KINDS.revoke) {
      const body = valid && input.type === "outcome" ? members(input.evidence.body, ["token"]) : null;
      const mint = body ? destinationRevokedMint(this.#given.state, this.#given.own, operation) : null;
      if (mint && body?.["token"] === revokedToken(this.#given.state, this.#given.own, operation)) this.#options.custody.revoked(mint.id, 1);
      return;
    }
    const body = valid && input.type === "outcome" ? members(input.evidence.body, ["token", "ends"]) : null;
    this.#options.custody.judged(at.operation, at.attempt, body && text(body["token"]) && typeof body["ends"] === "string" && timeMs(body["ends"]) !== null ? { id: body["token"], ends: body["ends"] } : null);
  }

  /**
   * The one-time read of a member's read credential (the planner's decision for I5). It answers only for a `mint-read` whose
   * confirmed own answer this scope committed, naming that handle; only to the key that signed the `read-token` that opened it;
   * only before its end; and only once: the plaintext leaves custody as it is answered. Every other case is null, and a read
   * after the end drops the plaintext. It writes no entry.
   */
  credential(handle: string, key: KeyId): ReadCredential | null {
    try {
      if (!text(handle) || !this.#given.scope()) return null;
      const held = this.#options.custody.held(handle);
      const operation = held ? this.#given.state.operation(held.mint) : null;
      if (!held || held.state !== "live" || !isOf(operation?.owner, OWNER) || operation.kind !== DESTINATION_KINDS.mintRead) return null;
      const confirmed = this.#confirmation(operation, held.attempt)?.entry.input;
      const body = confirmed?.type === "outcome" ? members(confirmed.evidence.body, ["token", "ends"]) : null;
      const opening = this.#given.own(Number(operation.id.split(":")[0]))?.entry.input;
      if (body?.["token"] !== handle || body["ends"] !== held.ends || opening?.type !== "act" || opening.signed.intent.kind !== "read-token" || opening.signed.intent.actor !== key) return null;
      const branch = destinationBranch(this.#given.state);
      const repository = members(branch?.values["repository"], ["host", "namespace", "name", "id"]);
      if (!repository || repository["host"] !== this.#options.host || repository["namespace"] !== this.#options.namespace) return null;
      const remote = this.#options.provider.remote(repository as unknown as DestinationRepository);
      const taken = this.#options.custody.take(handle, this.#given.clock.read());
      return taken ? { token: taken.plaintext, ends: taken.ends, remote } : null;
    } catch { return null; }
  }

  /** One readonly snapshot for the requested job's configured checker.
   * Public object bytes are read from the confirmed staged ref and checked
   * against retained signed sources;
   * nothing is staged, minted, pushed, or recorded by this read. */
  async snapshot(asked: SignedIntent): Promise<ReservationSnapshot | { refused: "reservation-stage-missing" | "reservation-stage-mismatch" } | null> {
    const reader = this.#options.snapshotReader;
    const scope = this.#given.scope();
    const intent = asked?.intent;
    if (!reader || scope?.at.kind !== "destination" || this.#given.genesis()?.seed.definition !== "platform:destination@3" || !verifySignedIntent(asked)
      || intent.kind !== "git-read@1:job-read" || intent.on !== null || Object.keys(intent.expected).length || Object.keys(intent.fields).length !== 1 || !isFactRef(intent.fields["job"])) return null;
    const jobFact = intent.fields["job"];
    if (!intent.to || canonicalize(intent.to) !== canonicalize(jobFact.at)) return null;
    const now = timeMs(this.#given.clock.read()), until = timeMs(intent.notAfter);
    if (now === null || until === null || until <= now || until - now > 900_000) return null;
    const jobRead = await reader.job(jobFact);
    if (!jobRead || jobRead.under !== "change" || jobRead.state !== "requested" || !isEntryOf(jobRead.entry, jobFact) || jobRead.entry.input.type !== "act" || jobRead.entry.input.signed.intent.kind !== "request-check") return null;
    const job = jobRead.entry;
    const fields = job.input.type === "act" ? job.input.signed.intent.fields : {};
    const manifestId = fields["manifest"];
    const branch = destinationBranch(this.#given.state);
    const publicationId = branch?.refs["slot"];
    const publication = typeof publicationId === "number" ? this.#given.state.item(publicationId) : null;
    const manifestFact = publication?.refs["manifest"];
    if (!publication || publication.state !== "reserved" || !isFactRef(manifestFact) || manifestFact.seq !== manifestId || canonicalize(manifestFact.at) !== canonicalize(jobFact.at)) return null;
    const reservedAt = publication.values["reservedAt"];
    const reservation = typeof reservedAt === "number" ? this.#given.own(reservedAt) : null;
    const reserve = this.#given.own(publication.id)?.entry;
    const manifest = reserve ? this.#fact(reserve, manifestFact) : null;
    const list = this.#list(publication);
    if (!reservation || !manifest || !list) return null;
    const recordedRules = reservation.entry.input.type === "outcome" ? reservation.entry.input.observed?.map((use) => use.observation).find((seen) => "subject" in seen && seen.subject === "rules") : null;
    const check = recordedRules && "content" in recordedRules && recordedRules.content.asked === "rules" ? recordedRules.content.checks.find((check) => check.name === fields["name"] && check.configuration === fields["configuration"]) : null;
    const membership = branch?.values["membership"];
    if (!check || typeof membership !== "string") return null;
    const generationFits = () => ((this.#given.state.item(publication.id)?.values["passes"] ?? []) as unknown as { name: string; job: FactRef }[]).some((row) => row.name === fields["name"] && canonicalize(row.job) === canonicalize(jobFact));
    if (!generationFits()) return null;
    const readAt = timeMs(this.#given.clock.read());
    const standing = await reader.key(membership, intent.actor) as { key?: unknown; keyState?: unknown; member?: unknown; memberState?: unknown; actions?: unknown; at?: unknown; controllerActive?: unknown } | null;
    if (!standing || standing.key !== intent.actor || standing.keyState !== "active" || standing.memberState !== "active" || standing.member !== check.checker || !Array.isArray(standing.actions) || !standing.actions.includes("change.check") || standing.controllerActive === false) return null;
    const observedAt = readAt;
    const afterRead = timeMs(this.#given.clock.read());
    const deadline = job.effects.find((effect) => effect.effect === "value" && effect.item === job.seq && effect.slot === "deadline");
    const end = deadline?.effect === "value" ? timeMs(deadline.value) : null;
    if (observedAt === null || afterRead === null || afterRead < observedAt || afterRead - observedAt > 10_000 || end === null || now >= end) return null;
    const repository = branch!.values["repository"] as unknown as DestinationRepository;
    const stagedRef = this.#reservationRef(publication);
    const staged = await this.#options.provider.ref(repository, stagedRef);
    if (staged === null) return { refused: "reservation-stage-missing" };
    if (!objectId(staged) || staged !== publication.values["integration"]) return { refused: "reservation-stage-mismatch" };
    const base = await this.#options.provider.objects(destinationBranch(this.#given.state)!.values["repository"] as unknown as DestinationRepository, list.base);
    const format = await this.#options.provider.format(branch!.values["repository"] as unknown as DestinationRepository);
    const built = this.#buildList(format, base, list, reservation.entry.time);
    if (!built || built.tree !== publication.values["tree"] || built.commit !== publication.values["integration"]) return null;
    const objects = await this.#options.provider.objects(repository, staged);
    const stagedCommit = objects.find((object) => object.id === staged && object.kind === "commit");
    if (!stagedCommit || !new TextDecoder().decode(stagedCommit.body).startsWith(`tree ${built.tree}\n`)) return { refused: "reservation-stage-mismatch" };
    const overlay = new Map(objects.map((object) => [object.id, object]));
    const reached = new Set<string>();
    const closureReader = new Reader({ object: async (id) => { const object = overlay.get(id); if (!object) return null; reached.add(id); return { type: object.kind, size: object.body.length, data: object.body }; }, ref: async () => null, refs: async () => [] }, READ_BOUNDS);
    if (!(await closureReader.closure(built.commit)).complete) return null;
    const currentJob = await reader.job(jobFact);
    const finalReadAt = timeMs(this.#given.clock.read());
    const currentKey = await reader.key(membership, intent.actor) as { key?: unknown; keyState?: unknown; member?: unknown; memberState?: unknown; actions?: unknown; controllerActive?: unknown } | null;
    const completed = timeMs(this.#given.clock.read());
    if (!generationFits() || completed === null || finalReadAt === null || completed < finalReadAt || completed - finalReadAt > 10_000 || completed >= end || completed >= until || !currentJob || currentJob.state !== "requested" || this.#given.state.item(publication.id)?.state !== "reserved"
      || !currentKey || currentKey.key !== intent.actor || currentKey.keyState !== "active" || currentKey.memberState !== "active" || currentKey.member !== check.checker || currentKey.controllerActive === false || !Array.isArray(currentKey.actions) || !currentKey.actions.includes("change.check")) return null;
    const sources = sourcesOf(manifest)!.map((row) => this.#fact(reserve!, row.entry)!);
    return { destination: scope.at, job: { entry: job, hash: entryHash(job) }, manifest: { entry: manifest, hash: entryHash(manifest) }, reservation,
      sources: sources.map((entry) => ({ entry, hash: entryHash(entry) })), base: list.base, tree: built.tree, commit: built.commit, ref: stagedRef, remote: this.#options.provider.remote(repository),
      objects: objects.filter((object) => reached.has(object.id)).map((object) => ({ id: object.id, type: object.kind, data: new Uint8Array(object.body) })) };
  }

  /** The lifetime that the `read-token` act asked for, in hours, from the entry that opened the `mint-read`. */
  #hours(operation: Operation): number | null {
    const input = this.#given.own(Number(operation.id.split(":")[0]))?.entry.input;
    const hours = input?.type === "act" && input.signed.intent.kind === "read-token" ? input.signed.intent.fields["hours"] : null;
    return typeof hours === "number" && Number.isSafeInteger(hours) && hours >= READ_TOKEN_HOURS.min && hours <= READ_TOKEN_HOURS.max ? hours : null;
  }
  /** A read credential's nonsecret handle, fixed by the sealed operation and its attempt before the request leaves. */
  #readHandle(request: EffectRequest): string {
    return `read:${valueDigest(READ_HANDLE, { scope: request.scope, operation: request.operation, attempt: request.attempt, origin: request.origin.hash } as unknown as FieldValue)}`;
  }

  #confirmation(operation: Operation, attempt: number): Sealed | null {
    const scope = this.#given.scope();
    const confirmed = operation.attempts.find((opened) => opened.attempt === attempt)?.outcomes.find((outcome) => outcome.result === "confirmed");
    const sealed = confirmed ? this.#given.own(confirmed.seq) : null;
    const input = sealed?.entry.input;
    return scope && sealed && sameScope(sealed.entry.at, scope.at) && entryHash(sealed.entry) === sealed.hash && input?.type === "outcome" && input.operation === operation.id && input.attempt === attempt && isOf(input.owner, OWNER) && input.kind === operation.kind && input.result === "confirmed" && input.evidence.basis === "own-answer" ? sealed : null;
  }

  #bound(request: EffectRequest): { operation: Operation; repository: DestinationRepository; ref: string } | null {
    const scope = this.#given.scope();
    if (!scope || scope.at.kind !== "destination" || !sameScope(scope.at, request.scope) || this.#given.genesis()?.seed.definition !== request.owner || !this.accepts(request.owner, request.kind) || !isOperationId(request.operation) || !Number.isSafeInteger(request.attempt) || request.attempt < 1) return null;
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
    return { scope: request.scope, mint: mint.id, attempt: 1, write: write.id, writeAttempt: attempt, ref: write.kind === DESTINATION_KINDS.receipt ? this.#receipt(write).ref : write.kind === "reservation-stage" ? this.#reservationRef(destinationTarget(this.#given.state, this.#given.own, write)!) : write.kind === "reservation-delete" ? this.#reservationRef(destinationTarget(this.#given.state, this.#given.own, write)!) : ref };
  }
  #reservationRef(publication: Item): string {
    const reservation = this.#given.own(publication.values["reservedAt"] as number);
    if (!reservation) throw new Error("missing reservation");
    return `refs/artroom/reservations/${reservation.hash.slice(7)}`;
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
    // After the driver's mark a local denial supplies no decisive host answer.
    if (!(write.kind === "reservation-delete" ? target && ["published", "cleanup-aborted"].includes(target.state) && target.values["token"] === mint?.id : destinationSends(state, own, write, request.attempt)) || !credential) return request.sentAt === undefined ? answer("refused", { send: "not-sent", seen: await this.#seen(repository, binding.ref) }) : null;
    if (write.kind === "reservation-delete") {
      const old = target?.values["integration"];
      if (!objectId(old) || !this.#options.provider.deleteRef) return null;
      const allowed = () => !!target && ["published", "cleanup-aborted"].includes(target.state) && target.values["token"] === mint?.id && this.#options.custody.live(mint!.id, 1, this.#given.clock.read())?.plaintext === credential.plaintext;
      const reply = members(await this.#options.provider.deleteRef({ repository, ref: binding.ref, old, token: credential.plaintext!, binding, allowed, ...(request.sentAt ? { sentAt: request.sentAt } : {}) }), ["send"]);
      const sent = reply?.["send"];
      if (!["accepted", "refused", "not-sent"].includes(sent as string)) return null;
      return answer(sent === "accepted" ? "confirmed" : "refused", { send: sent, seen: await this.#seen(repository, binding.ref) });
    }
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
      // The founding commit of the scope's own version: the empty tree at version 1, a README at version 2.
      const founding = foundingOf(state, own, format);
      objects = commit === founding.commit ? founding.objects : await this.#options.provider.objects(repository, commit);
      if (commit === founding.commit) { expectedTree = founding.objects.find((object) => object.kind === "tree")!.id; requireParentless = true; }
    } else if (write.kind === "reservation-stage") {
      if (!target) return null;
      const list = this.#list(target);
      const reserved = this.#given.own(target.values["reservedAt"] as number);
      if (!list || !reserved) return null;
      const base = await this.#options.provider.objects(repository, list.base);
      const built = this.#buildList(format, base, list, reserved.entry.time);
      if (!built || built.commit !== target.values["integration"] || built.tree !== target.values["tree"]) return null;
      old = null; commit = built.commit; expectedTree = built.tree;
      objects = [...new Map([...base, ...built.objects].map((object) => [object.id, object])).values()];
    } else {
      const head = destinationBranch(state)?.values["head"];
      const integration = target?.values["integration"];
      if (!objectId(head) || !objectId(integration)) return null;
      old = head;
      commit = integration;
      // The confirmed reservation compared this tree with its retained manifest.
      const reservedAt = target?.values["reservedAt"];
      const reserved = typeof reservedAt === "number" ? own(reservedAt)?.entry.input : null;
      const evidence = reserved?.type === "outcome" && isOf(reserved.owner, OWNER) && reserved.kind === DESTINATION_KINDS.judge && reserved.result === "confirmed" && isRecordedJudgeEvidence(reserved.evidence.body) ? reserved.evidence.body : null;
      const tree = evidence?.tree;
      if (!objectId(tree)) return null;
      expectedTree = tree;
      const list = target ? this.#list(target) : null;
      const edit = target ? this.#edit(target) : null;
      if (list) {
        const time = typeof reservedAt === "number" ? own(reservedAt)?.entry.time : undefined;
        if (time === undefined || list.base !== head) return null;
        const base = await this.#options.provider.objects(repository, list.base);
        const built = this.#buildList(format, base, list, time);
        if (!built || built.commit !== commit || built.tree !== tree) return null;
        objects = [...new Map([...base, ...built.objects].map((object) => [object.id, object])).values()];
      } else
      if (edit) {
        // A one-file manifest: the objects that the reservation's tree and commit name, built again on the base's closure.
        const time = typeof reservedAt === "number" ? own(reservedAt)?.entry.time : undefined;
        if (time === undefined || edit.base !== head) return null;
        const base = await this.#options.provider.objects(repository, edit.base);
        const built = this.#build(format, base, edit, time);
        if (!built || built.commit !== commit || built.tree !== tree) return null;
        objects = [...new Map([...base, ...built.objects].map((object) => [object.id, object])).values()];
      } else objects = await this.#options.provider.objects(repository, commit);
    }
    // Async preparation may have let a read or compromise close the target.
    const live = this.#options.custody.live(binding.mint, 1, this.#given.clock.read());
    if (!destinationSends(state, own, write, request.attempt) || live?.id !== credential.id || live?.plaintext !== credential.plaintext) return request.sentAt === undefined ? answer("refused", { send: "not-sent", seen: await this.#seen(repository, binding.ref) }) : null;
    const allowed = () => {
      const held = this.#options.custody.live(binding.mint, 1, this.#given.clock.read());
      return destinationSends(state, own, write, request.attempt) && held?.id === credential.id && held?.plaintext === credential.plaintext;
    };
    const reply = members(await this.#options.provider.send({ repository, ref: binding.ref, old, commit, objects, ...(expectedTree === undefined ? {} : { expectedTree }), ...(request.sentAt === undefined ? {} : { sentAt: request.sentAt }), requireParentless, token: live.plaintext!, binding, allowed }), ["send"]);
    const sent = reply?.["send"];
    if (sent !== "accepted" && sent !== "refused" && sent !== "not-sent") return null;
    if (sent === "not-sent" && request.sentAt !== undefined) return null;
    if (write.kind === "reservation-stage") {
      const seen = await this.#seen(repository, binding.ref);
      let tree: string | null = null;
      if (objectId(seen)) { const closure = await this.#options.provider.objects(repository, seen); const source = new Map(closure.map((object) => [object.id, object])); const reader = new Reader({ object: async (id) => { const object = source.get(id); return object ? { type: object.kind, size: object.body.length, data: object.body } : null; }, ref: async () => seen, refs: async () => [] }); tree = (await reader.commit(seen)).tree; }
      return answer(sent === "accepted" ? "confirmed" : "refused", { send: sent, seen, tree });
    }
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
  /** The publication whose `judge` is open. */
  #judging(): Item | null {
    const id = destinationBranch(this.#given.state)?.refs["judging"];
    return typeof id === "number" ? this.#given.state.item(id) : null;
  }
  /** The one-file manifest of a publication, from the manifest's entry that its `reserve` retained, with its base and operation; null for any other manifest. */
  #edit(publication: Item | null): { file: EditFile; base: string; operation: FactRef } | null {
    const reserve = publication ? this.#given.own(publication.id)?.entry : null;
    if (!publication || !reserve) return null;
    const statement = destinationStatement(this.#given.own, publication);
    const manifest = this.#fact(reserve, statement.manifest);
    const file = fileOf(manifest);
    const base = manifest?.input.type === "act" ? manifest.input.signed.intent.fields["base"] : null;
    return file && objectId(base) ? { file, base, operation: statement.operation } : null;
  }
  /** The objects of a one-file edit on the base's closure, or null when the published tree does not let the file be written. */
  #build(format: ObjectFormat, base: readonly DestinationObject[], edit: { file: EditFile; base: string; operation: FactRef }, time: Entry["time"]) {
    const scope = this.#given.scope();
    if (!scope) return null;
    const read = new Map(base.map((object) => [object.id, object]));
    return editObjects(format, (id) => read.get(id) ?? null, edit.base, edit.file.path, utf8(edit.file.content), { scope: scope.at.scope, time, operation: edit.operation });
  }
  /**
   * The evidence of `judge` for a one-file manifest. The branch's head, as the host shows it. A path that no tree may hold, bytes
   * that are not the ones the manifest states, and a published tree that does not let the file be written there give evidence that
   * the integration is not present. Otherwise the base's closure with the file written is inspected as any integration is, by
   * `inspectGit`: its tree, its first parent and its changed set.
   */
  async #inspectEdit(repository: DestinationRepository, ref: string, edit: { file: EditFile; base: string; operation: FactRef }): Promise<EffectAnswer | null> {
    const seen = await this.#options.provider.ref(repository, ref);
    const head = objectId(seen) ? seen : null;
    const absent: RecordedJudgeEvidence = { head, present: false, tree: null, firstParent: null, ancestors: [], changes: null };
    if (editPath(edit.file.path) === null || !fileSound(edit.file)) return answer("confirmed", absent);
    const format = await this.#options.provider.format(repository);
    const base = await this.#options.provider.objects(repository, edit.base);
    // The commit's time is not judged here: the tree, the parent and the changed set do not depend on it.
    const built = this.#build(format, base, edit, this.#given.clock.read());
    if (!built) return answer("confirmed", absent);
    const objects = new Map([...base, ...built.objects].map((object) => [object.id, object]));
    const source: GitSource = {
      object: async (id) => { const object = objects.get(id); return object ? { type: object.kind, size: object.body.length, data: new Uint8Array(object.body) } : null; },
      ref: async (name) => (name === ref ? head : null),
      refs: async () => { throw new GitRefusal("unreadable", "an edit's inspection lists no refs"); },
    };
    const branch = destinationBranch(this.#given.state)?.values["head"];
    const reply = await inspectGit(new Reader(source, READ_BOUNDS), { repository, ref, recorded: objectId(branch) ? branch : null, base: edit.base, integration: built.commit, tree: built.tree, reports: [] });
    return isRecordedJudgeEvidence(reply.evidence) ? { ...answer("confirmed", reply.evidence), ...(reply.retain === undefined ? {} : { retain: reply.retain }) } : null;
  }
  #list(publication: Item | null): { files: readonly EditFile[]; base: string; operation: FactRef } | null {
    const reserve = publication ? this.#given.own(publication.id)?.entry : null;
    if (!publication || !reserve) return null;
    const statement = destinationStatement(this.#given.own, publication);
    const manifest = this.#fact(reserve, statement.manifest);
    if (!manifest || !sourcesOf(manifest) || manifest.input.type !== "act") return null;
    const uses = reserve.uses.flatMap((use) => { const entry = this.#fact(reserve, use.fact); return entry ? [{ fact: use.fact, entry }] : []; });
    const files = manifestFiles(manifest, uses);
    const base = manifest.input.signed.intent.fields["base"];
    return objectId(base) ? { files: files ?? [], base, operation: statement.operation } : null;
  }
  #buildList(format: ObjectFormat, base: readonly DestinationObject[], list: { files: readonly EditFile[]; base: string; operation: FactRef }, time: Entry["time"]) {
    const scope = this.#given.scope();
    if (!scope || list.files.some((file) => !fileSound(file))) return null;
    const objects = new Map(base.map((object) => [object.id, object]));
    const tree = editTree(format, (id) => objects.get(id) ?? null, list.base, list.files.map((file) => ({ path: file.path, bytes: utf8(file.content) })));
    if (!tree) return null;
    const commit = manifestCommit(format, scope.at.scope, time, tree.tree, list.base, list.operation);
    return { tree: tree.tree, commit: commit.id, objects: [...tree.objects, commit] };
  }
  async #inspectList(repository: DestinationRepository, ref: string, list: { files: readonly EditFile[]; base: string; operation: FactRef }): Promise<EffectAnswer | null> {
    const head = await this.#options.provider.ref(repository, ref);
    const base = await this.#options.provider.objects(repository, list.base);
    const built = this.#buildList(await this.#options.provider.format(repository), base, list, this.#given.clock.read());
    if (!built) return answer("confirmed", { head, present: false, tree: null, firstParent: null, ancestors: [], changes: null });
    const objects = new Map([...base, ...built.objects].map((object) => [object.id, object]));
    const source: GitSource = { object: async (id) => { const object = objects.get(id); return object ? { type: object.kind, size: object.body.length, data: object.body } : null; },
      ref: async () => head, refs: async () => [] };
    const reply = await inspectGit(new Reader(source, READ_BOUNDS), { repository, ref, recorded: head, base: list.base, integration: built.commit, tree: built.tree, reports: [] });
    return { ...answer("confirmed", reply.evidence), ...(reply.retain ? { retain: reply.retain } : {}) };
  }
  #inspection(repository: DestinationRepository, ref: string): DestinationInspection | null {
    const branch = destinationBranch(this.#given.state);
    const publication = this.#judging();
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
