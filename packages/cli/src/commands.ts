/**
 * The commands, as functions over a scope service's base URL and a signing
 * key. Each takes a `Context` and returns an `Outcome`: an exit code and
 * one or two plain lines. `main.ts` runs them under Node with the files of
 * `files.ts` and the runtime's `fetch`; a test runs the same functions
 * against the test Worker's routes, with a store in memory.
 *
 * The command judges nothing. Whether an act takes effect is the scope's
 * judgment, and its answer is printed as it came: a refusal writes nothing,
 * and its reason is the outcome. What the command reads to build an intent
 * (an item's revision, the caller's role) is a reading, and the scope
 * checks each part of the intent again.
 *
 * | Command | What it does |
 * |---|---|
 * | `install` | Founds the register by an `install` intent, signed by a new operator key that is also the one founder key. |
 * | `claim` | Signs the register's `found` act, then waits until the directory, membership, rules scope and destination are created and confirmed. Then it takes the founder's seat and first key in membership. A claim it gave up waiting on is kept as pending, and the next `claim` goes on from it; `--again` signs a new one. |
 * | `invite`, `join` | Membership's `invite-member` and `join`. The link carries the invitation's number and secret; the joining key is made and kept locally. |
 * | `acts` | The acts of a scope's definition, with the ones the caller's role holds. |
 * | `act` | One act of any kind, through the client's declared handle for a declared definition, or as a signed intent for a platform one. |
 * | `log`, `show` | The scope's history, and one entry, over the read routes. |
 * | `verify` | The replay verifier over the read routes: with the caller's session, and by signed reads where the session is refused. |
 */

import type { Answer, DeclaredDefinition, Digest, Entry, FactRef, FieldValue, Founded, Item, KeyId, PlatformDefinition, ScopeId, ScopeRef, Seed, Summary } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, factRefOf, intentDigest, isDigest, isFactRef, isIncarnation, isScopeId, keyIdOfSecret, parseStrict, scopeIdOf, seedDigest, textDigest, timeOf, unb64url, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import {
  ScopeHandle, TransportError, declaredHandle, found, httpTransport, requestSession, secretSigner, sessionRequest, signedIntent, signedLogReader, signedReads,
  type Fetch, type ReadSigning, type Signing, type Transport,
} from "@generalbusiness/artroom-client";
import { DIRECTORY, MEMBERSHIP, REGISTER, ROLE_LISTS, platform, type Role } from "@generalbusiness/artroom-platform";
import { SourceError, httpSource, render, verify as replay, type HistorySource } from "@generalbusiness/artroom-replay";
import type { ClaimStep, Config, PendingClaim, Repository, Store } from "./store.ts";

export interface Context {
  store: Store;
  /** Replaces the runtime's `fetch`: a test passes the Worker's routes. */
  fetch?: Fetch;
  /** The clock that intents are signed by, in milliseconds. The default is the runtime's. */
  now?: () => number;
  /**
   * Called between two reads while a command waits for scopes to be created
   * and confirmed, with the scopes it waits on. The default waits one
   * second. A deployment's alarms do the work meanwhile; a test drives the
   * dispatchers here instead.
   */
  pause?: (waiting: readonly ScopeId[]) => Promise<void>;
  /** How many reads a wait makes before it gives up. The default is 120. */
  tries?: number;
}

/** What a command ends with: its exit code, and the lines it prints. 0: done. 1: refused, unavailable or not found. 2: not a command this can run. */
export interface Outcome { code: 0 | 1 | 2; lines: string[] }

const done = (...lines: string[]): Outcome => ({ code: 0, lines });
const failed = (...lines: string[]): Outcome => ({ code: 1, lines });
const usage = (...lines: string[]): Outcome => ({ code: 2, lines });

/** A command that cannot go on: it ends with this outcome. */
class Stop extends Error {
  constructor(readonly outcome: Outcome) { super(outcome.lines.join(" ")); }
}
const stop = (outcome: Outcome): never => { throw new Stop(outcome); };

/**
 * Runs a command, and turns a stop, a lost reply and a history that cannot be read into its outcome. A lost reply says what the
 * transport says: whether anything may have been recorded. A history that cannot be read says why: "... cannot be read: <reason>".
 */
async function run(command: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await command();
  } catch (error) {
    if (error instanceof Stop) return error.outcome;
    if (error instanceof TransportError) return failed(`No answer: ${error.message}`);
    if (error instanceof SourceError) return failed(error.message);
    throw error;
  }
}

// ---------------------------------------------------------------- what every command reads

const fresh = (bytes: number): Uint8Array => crypto.getRandomValues(new Uint8Array(bytes));
const short = (text: string): string => (text.length > 16 ? `${text.slice(0, 12)}...` : text);

async function configOf(ctx: Context): Promise<Config> {
  const config = await ctx.store.config();
  return config ?? stop(usage("No room is set up here. Run: artroom install <base-url>, or artroom join <link>."));
}

/** The named key, made and kept when it does not exist yet. */
async function keyOf(ctx: Context, name: string): Promise<Uint8Array> {
  const kept = await ctx.store.secret(name);
  if (kept) return kept;
  const secret = fresh(32);
  await ctx.store.keep(name, secret);
  return secret;
}

async function signerOf(ctx: Context, config: Config): Promise<Uint8Array> {
  return (await ctx.store.secret(config.key)) ?? stop(failed(`The key ${config.key} is missing from the config directory; nothing was signed.`));
}

const signing = (ctx: Context): Signing => (ctx.now ? { now: ctx.now() } : {});
const readSigning = (ctx: Context): ReadSigning => (ctx.now ? { now: ctx.now } : {});
const transportOf = (ctx: Context, service: string): Transport => httpTransport(service, ctx.fetch ? { fetch: ctx.fetch } : {});

/**
 * What this caller presents to the read routes: a read session from the
 * repository's membership scope, signed for by the caller's key, or none.
 * A deployment with no session secret answers `sessions-unavailable`, and a
 * key that is not an active member's is refused one: the reads then go
 * without one, as signed reads by the caller's key (`handleOf`), and the
 * scope decides whether they may read.
 */
async function readerOf(ctx: Context, config: Config): Promise<string | null> {
  const membership = config.repository?.membership;
  const secret = await ctx.store.secret(config.key);
  if (!membership || !secret) return null;
  const now = ctx.now?.() ?? Date.now();
  const asked = sessionRequest(membership, secret, timeOf(Math.floor(now / 1000) * 1000 + 60_000), b64url(fresh(16)));
  const answer = await requestSession(config.service, membership.scope, asked, ctx.fetch ? { fetch: ctx.fetch } : {});
  return answer.ok ? answer.session.reader() : null;
}

/**
 * A handle on one scope. A read with no session is a signed read by the
 * caller's key: the scope answers it where that key signed an entry, or the
 * root of the scope's cause chain, within the window of an intent.
 */
async function handleOf(ctx: Context, config: Config, scope: ScopeId, reader?: string | null): Promise<ScopeHandle> {
  const transport = signedReads(transportOf(ctx, config.service), secretSigner(await signerOf(ctx, config)), readSigning(ctx));
  return new ScopeHandle(transport, scope, reader === undefined ? await readerOf(ctx, config) : reader);
}

async function summaryOf(handle: ScopeHandle): Promise<Summary> {
  const read = await handle.summary();
  return read.ok ? read.value : stop(failed(`Cannot read ${handle.scope}: ${read.reason}.`));
}

/** A scope by the name `claim` or `join` gave it, or by its ID. */
function scopeNamed(config: Config, named: string | undefined): ScopeId {
  const r = config.repository;
  const names: Record<string, ScopeId | undefined> = {
    register: config.register?.scope, directory: r?.directory.scope, membership: r?.membership.scope, rules: r?.rules, destination: r?.destination, inbox: r?.inbox,
  };
  const name = named ?? "directory";
  if (/^sc_[a-z2-7]+$/.test(name)) return name as ScopeId;
  return names[name] ?? stop(usage(`No scope named ${name} is known here. Name one of: ${Object.keys(names).filter((n) => names[n]).join(", ") || "none yet"}; or give a scope ID.`));
}

// ---------------------------------------------------------------- a definition, as this command reads it

/** The parts of an act's declaration that this command reads. A platform definition's grant, `also` name or field type may be a mark, whose rule the scope runs. */
interface ActShape {
  step: "open" | "transition" | "comment";
  on: string | null;
  grant: string | { code: string; grant?: string };
  also: Record<string, { item: string; one?: true; by?: string; code?: string }>;
  fields: Record<string, { type?: string; code?: string; required?: boolean }>;
}
interface DefinitionShape { name: string; genesis: string; acts: Record<string, ActShape> }

/** The definition a scope pins: a platform one from the platform package, a declared one as the scope retains it. */
async function definitionOf(handle: ScopeHandle, summary: Summary): Promise<{ shape: DefinitionShape; declared: DeclaredDefinition | null; named: Digest | PlatformDefinition }> {
  const named = summary.definition;
  const supplied = platform(named);
  if (supplied) return { shape: supplied.data as unknown as DefinitionShape, declared: null, named };
  const read = await handle.definition();
  if (!read.ok) return stop(failed(`Cannot read the definition of ${handle.scope}: ${read.reason}.`));
  return { shape: read.value as unknown as DefinitionShape, declared: read.value, named };
}

const typeName = (field: { type?: string; code?: string }): string => field.type === "code" || field.type === undefined ? `${field.code ?? "code"} (rule)` : field.type;
const fieldsLine = (act: ActShape): string => Object.entries(act.fields).map(([name, field]) => `${name}${field.required ? "" : "?"}:${typeName(field)}`).join(" ") || "none";
const grantName = (act: ActShape): string | null => (typeof act.grant === "string" ? act.grant : act.grant.grant ?? null);

/**
 * One line about an act, from its declaration. The definition format has no
 * text that describes an act, so the line is made from what the declaration
 * states: its step, its item and what may sign it.
 */
function describe(kind: string, act: ActShape): string {
  const what = act.step === "open" ? `opens a ${act.on}` : act.step === "transition" ? `moves a ${act.on}` : act.on === null ? "comments on no item" : `comments on a ${act.on}`;
  const who = typeof act.grant === "string" ? `needs ${act.grant}` : `the rule ${act.grant.code} decides who may sign${act.grant.grant ? `, with ${act.grant.grant}` : ""}`;
  return `${kind}: ${what}; ${who}. Fields: ${fieldsLine(act)}.`;
}

/**
 * The revision of each item the act names, as the scope's summary has them
 * now: the target for a transition, the one item of a type, and an item a
 * field names. A name that a rule selects has no key: the scope resolves it.
 * The scope checks every revision again and refuses one that moved.
 */
function expectedOf(act: ActShape, items: readonly Item[], target: number | null, fields: Record<string, FieldValue>): Record<string, number> {
  const expected: Record<string, number> = {};
  const revision = (id: number | null | undefined) => items.find((item) => item.id === id)?.revision;
  if (act.step === "transition" && target !== null) {
    const at = revision(target);
    if (at !== undefined) expected["on"] = at;
  }
  for (const [name, rule] of Object.entries(act.also)) {
    if (rule.code !== undefined) continue;
    const at = rule.one ? items.find((item) => item.type === rule.item)?.revision : rule.by !== undefined && typeof fields[rule.by] === "number" ? revision(fields[rule.by] as number) : undefined;
    if (at !== undefined) expected[name] = at;
  }
  return expected;
}

/**
 * A value given as `name=value`, read by the field's declared type. A list,
 * a record and a reference are read as JSON. `@handle` for a member is that
 * member of this repository's membership.
 */
function valueOf(config: Config, field: { type?: string } | undefined, text: string): FieldValue {
  switch (field?.type) {
    case "text": case "digest": case "time": case "enum": case "commit": case "tree": return text;
    case "int": case "item": return /^-?\d+$/.test(text) ? Number(text) : text;
    case "bool": return text === "true" ? true : text === "false" ? false : text;
    case "member":
      if (text.startsWith("@") && config.repository) return { membership: config.repository.membership, member: text } as unknown as FieldValue;
  }
  try {
    return JSON.parse(text) as FieldValue;
  } catch {
    return text;
  }
}

/** The answer to an act, in one or two lines. A refusal names its reason and, when the failed guard has one, its name. */
function answered(scope: ScopeId, answer: Answer, took: string): Outcome {
  switch (answer.answer) {
    case "accepted": return done(`${took}: entry ${scope}:${answer.receipt.fact.seq}, hash ${answer.receipt.fact.hash.slice(0, 19)}.`);
    case "refused": return failed(`Refused: ${answer.reason}${"name" in answer && answer.name ? ` (${answer.name})` : ""}, judged at entry ${scope}:${answer.judgedAt.seq}. Nothing was written.`);
    case "unavailable": return failed(`Unavailable: ${answer.reason}. Send the same command again later.`);
    case "mismatch": return failed(`Mismatch: ${answer.reason}.`);
  }
}

const accepted = (answer: Answer | Founded, scope: ScopeId | null, took: string): Extract<Answer, { answer: "accepted" }> =>
  answer.answer === "accepted" ? answer : stop(answer.answer === "refused" && "judgedAt" in answer ? answered(scope!, answer, took) : failed(`${answer.answer === "refused" ? "Refused" : "Unavailable"}: ${answer.reason}. Nothing was written.`));

// ---------------------------------------------------------------- waiting for scopes

/** Reads until `ready` holds, pausing between reads. `then`: what the person may do after the command gives up. */
async function waitFor<T>(ctx: Context, waiting: () => readonly ScopeId[], read: () => Promise<T | null>, what: string, then = "run the command's reads again later."): Promise<T> {
  const tries = ctx.tries ?? 120;
  for (let n = 0; n < tries; n++) {
    const got = await read();
    if (got !== null) return got;
    await (ctx.pause ?? (() => new Promise<void>((resolve) => { setTimeout(resolve, 1000); })))(waiting());
  }
  return stop(failed(`Gave up waiting for ${what} after ${tries} reads. What was asked may still take effect; ${then}`));
}

/** The scope's summary once it is `active`: created and confirmed. */
const active = async (handle: ScopeHandle): Promise<Summary | null> => {
  const read = await handle.summary();
  return read.ok && read.value.status === "active" ? read.value : null;
};

/** The scopes that entry `seq` of a scope creates, by the seed of each send, with the send's number. */
async function createdBy(handle: ScopeHandle, seq: number): Promise<{ n: number; seed: Seed; scope: ScopeId }[]> {
  const read = await handle.entry(seq);
  if (!read.ok) return stop(failed(`Cannot read entry ${handle.scope}:${seq}: ${read.reason}.`));
  return read.value.entry.sends.flatMap((send) => ("creator" in send.to ? [{ n: send.n, seed: send.to as Seed, scope: scopeIdOf(send.to as Seed) }] : []));
}

// ---------------------------------------------------------------- the commands

/** `artroom install <base-url>`: found the register. Its host and namespace are where the Git host keeps the repositories. */
export function install(ctx: Context, service: string, options: { host?: string; namespace?: string } = {}): Promise<Outcome> {
  return run(async () => {
    const before = await ctx.store.config();
    if (before?.register) return usage(`This config directory has a register already: ${before.register.scope}.`);
    const secret = await keyOf(ctx, "operator");
    const signer = secretSigner(secret);
    const fields = { host: options.host ?? "github.com", namespace: options.namespace ?? "artroom", policy: "keys", founders: [signer.key] };
    const signed = await signedIntent(signer, { to: null, kind: "install", fields }, signing(ctx));
    const { answer } = await found(transportOf(ctx, service), signed, REGISTER);
    const receipt = accepted(answer, null, "Installed").receipt;
    await ctx.store.save({ v: 1, service, key: "operator", register: receipt.fact.at });
    return done(`Installed: register ${receipt.fact.at.scope}.`, `The operator key ${signer.key} is kept in the config directory, readable only by you. It is the one founder key.`);
  });
}

/** Saved envelopes are checked against their actual caller and destination,
 * never re-signed from metadata. An accepted marker belongs to that scope. */
function validStep(step: ClaimStep, to: ScopeRef, key: KeyId, kind: string): boolean {
  try {
    return verifySignedIntent(step?.signed) && step.signed.intent.actor === key && step.signed.intent.kind === kind && canonicalize(step.signed.intent.to) === canonicalize(to)
      && (step.accepted === undefined || (isFactRef(step.accepted) && step.accepted.seq > 0 && canonicalize(step.accepted.at) === canonicalize(to)));
  } catch { return false; }
}
function validRepository(repository: Repository, directory: Seed): boolean {
  try {
    const sibling = (kind: "membership" | "rules" | "destination", ordinal: number) => scopeIdOf({ v: 1, kind, definition: `platform:${kind}@1`, creator: repository.directory, cause: seedDigest(directory), ordinal });
    // Directory@1 creates these three fixed siblings in order. Both its exact
    // seed and full confirmed reference determine their IDs; the same founder
    // key/handle in another room cannot authorize a substituted cache.
    return repository.directory.scope === scopeIdOf(directory) && repository.directory.kind === "directory" && isIncarnation(repository.directory.inc)
      && isScopeId(repository.membership.scope) && repository.membership.kind === "membership" && isIncarnation(repository.membership.inc)
      && repository.membership.scope === sibling("membership", 0) && repository.rules === sibling("rules", 1) && repository.destination === sibling("destination", 2)
      && (repository.inbox === undefined || isScopeId(repository.inbox));
  } catch { return false; }
}
function foundingMembership(summary: Summary, at: ScopeRef, key: KeyId, handle: string): boolean {
  const roster = summary.items.find((item) => item.type === "roster");
  return canonicalize(summary.scope) === canonicalize(at) && summary.definition === MEMBERSHIP
    && roster?.values["foundingKey"] === key && roster.values["foundingHandle"] === handle;
}
async function recordedStep(handle: ScopeHandle, seq: number, at: ScopeRef, key: KeyId, kind: string): Promise<ClaimStep> {
  const got = await handle.entry(seq);
  if (!got.ok || got.value.entry.input.type !== "act") return stop(failed(`Cannot recover the admitted ${kind} entry; the claim remains pending.`));
  const entry = got.value.entry;
  const step: ClaimStep = { signed: entry.input.type === "act" ? entry.input.signed : stop(failed("The enrollment entry is not an act.")), accepted: factRefOf(entry) };
  if (!validStep(step, at, key, kind) || step.accepted!.seq !== seq || step.accepted!.hash !== got.value.hash) return stop(failed(`The admitted ${kind} entry does not match this membership and signing key; nothing was submitted.`));
  return step;
}

/**
 * `artroom claim <name>`: the register's `found` act, signed by the founder
 * key. The register fixes the directory's seed, so its ID is known from the
 * signed intent; the directory, once it exists, creates membership, the
 * rules scope and the destination. Then the founder takes the seat and the
 * first key in membership, and so becomes its first admin.
 *
 * Every read here is a signed read by the founder key, which is the
 * operator key: the register's summary, where that key signed `install`;
 * then the directory that the claim caused, and the scopes that the
 * directory caused; then membership, where the key has signed `seat`.
 *
 * **Resume.** Keep each exact signed found, seat and first-key before sending
 * it, then keep its accepted fact. An uncertain delivery retries that same
 * envelope; an accepted step is skipped. Never refresh a saved deadline.
 * Learned child references are kept before enrollment. Only `--again` opens
 * another found. An older digest-only record can continue from its actual
 * admitted directory and checked retained claim; absence or ambiguity never
 * invents its missing signature. No signing key is in config.
 */
export function claim(ctx: Context, name: string, options: { handle?: string; branch?: string; again?: boolean } = {}): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const register = config.register ?? stop(usage("No register is known here. Run: artroom install <base-url>."));
    if (config.repository) return usage(`A repository is claimed here already: directory ${config.repository.directory.scope}.`);
    const secret = await signerOf(ctx, config);
    const signer = secretSigner(secret);
    const R = await handleOf(ctx, config, register.scope, null);
    const { claim: _, ...base } = config;
    let pending: PendingClaim;
    if (config.claim && !options.again) {
      pending = config.claim;
      if (pending.register !== register.scope || !isDigest(pending.intent) || typeof pending.handle !== "string") return failed("The pending claim does not identify this register and a valid recorded intent; nothing was submitted.");
      if (pending.found && (!validStep(pending.found, register, signer.key, "found") || intentDigest(pending.found.signed.intent) !== pending.intent || pending.found.signed.intent.fields["founderHandle"] !== pending.handle)) return failed("The pending claim does not match this register, signing key and recorded intent; nothing was submitted.");
    } else {
      const recovery = keyIdOfSecret(await keyOf(ctx, "recovery"));
      const handle = options.handle ?? "@founder";
      const shape = platform(REGISTER)!.data as unknown as DefinitionShape;
      const fields = { branch: options.branch ?? "main", founderHandle: handle, recoveryKey: recovery };
      const signed = await signedIntent(signer, { to: register, kind: "found", fields, expected: expectedOf(shape.acts["found"]!, (await summaryOf(R)).items, null, fields) }, signing(ctx));
      pending = { register: register.scope, intent: intentDigest(signed.intent), handle, found: { signed } };
      await ctx.store.save({ ...base, claim: pending });
    }
    const keep = async (next: PendingClaim) => { await ctx.store.save({ ...base, claim: next }); pending = next; };
    if (!pending.found) {
      // Legacy records did not preserve the envelope. A real admitted
      // directory retains the original claim, so recover that exact signature
      // as already accepted. Never submit a reconstructed or fresh found.
      await R.summary();
      const legacySeed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: register, cause: pending.intent, ordinal: 0 };
      const D = await handleOf(ctx, config, scopeIdOf(legacySeed), null);
      const genesis = await D.entry(0);
      let found: ClaimStep | null = null;
      let unread = genesis.ok ? "no matching retained claim" : `directory genesis read: ${genesis.reason}`;
      if (genesis.ok && genesis.value.entry.input.type === "genesis" && canonicalize(genesis.value.entry.input.seed) === canonicalize(legacySeed)) {
        for (const use of genesis.value.entry.uses) {
          if (canonicalize(use.fact.at) !== canonicalize(register)) continue;
          const kept = await signedReads(transportOf(ctx, config.service), signer, readSigning(ctx)).retained(D.scope, null, "entry", use.content);
          if (!kept.ok) { unread = `retained claim read: ${kept.reason}`; continue; }
          try {
            const entry = parseStrict(kept.value.bytes) as unknown as Entry;
            if (entry.input.type !== "act" || canonicalize(factRefOf(entry)) !== canonicalize(use.fact)) continue;
            const candidate: ClaimStep = { signed: entry.input.signed, accepted: use.fact };
            if (validStep(candidate, register, signer.key, "found") && intentDigest(candidate.signed.intent) === pending.intent && candidate.signed.intent.fields["founderHandle"] === pending.handle) { found = candidate; break; }
          } catch { /* Not a checked copy of this legacy claim. */ }
        }
      }
      if (!found) return failed(`This pending claim has only a digest and no readable admitted directory with its exact found signature (${unread}). Nothing was submitted. Retry the reads later, recover it manually, or use --again to sign a new claim, which may create another repository.`);
      await keep({ ...pending, found });
    }
    const submitted = async (step: ClaimStep, at: ScopeRef, handle: ScopeHandle, took: string): Promise<FactRef> => {
      const digest = intentDigest(step.signed.intent);
      if (step.accepted) {
        // Settlement admits nothing and is bound to the exact envelope. A
        // saved marker alone cannot stand for some other accepted request.
        const settled = await handle.settle(step.signed);
        if (!settled.ok) return stop(failed(`Cannot confirm the saved ${step.signed.intent.kind} step: ${settled.reason}. The exact request remains pending; nothing was submitted.`));
        if (settled.value.intent !== digest || canonicalize(settled.value.fact) !== canonicalize(step.accepted)) return stop(failed("The saved accepted fact does not match this exact claim step; nothing was submitted."));
        return step.accepted;
      }
      const receipt = accepted(await handle.submit(step.signed), at.scope, took).receipt;
      if (!isFactRef(receipt.fact) || canonicalize(receipt.fact.at) !== canonicalize(at) || receipt.intent !== digest) throw new TransportError("The accepted reply does not match this exact claim step; its saved request remains pending.");
      return receipt.fact;
    };
    const foundFact = await submitted(pending.found!, register, R, "Claimed");
    if (!pending.found!.accepted) {
      // An unavailable answer also requires the same request on retry. Even
      // an expired/refused envelope remains saved: only --again replaces it.
      await keep({ ...pending, found: { signed: pending.found!.signed, accepted: foundFact } });
    } else if (!pending.repository) {
      // Wake recorded creation after a settings restart. This read does not
      // settle the found or change its already accepted request bytes.
      await R.summary();
    }
    const resume = `run artroom claim ${name} again to go on waiting for this claim, or with --again to sign a new one, which creates a second repository.`;

    // The register's rule fixes the directory's seed from the claim's own intent (`directorySeed`).
    const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: register, cause: pending.intent, ordinal: 0 };
    let repository = pending.repository;
    if (!repository) {
      const D = await handleOf(ctx, config, scopeIdOf(seed), null);
      const children: ScopeId[] = [];
      const directory = await waitFor(ctx, () => [register.scope, D.scope, ...children], () => active(D), "the directory", resume);
      const made = await createdBy(D, 0);
      const kind = (k: string) => made.find((m) => m.seed.kind === k)?.scope ?? stop(failed(`The directory's genesis creates no ${k}.`));
      children.push(kind("membership"), kind("rules"), kind("destination"));
      const handles = await Promise.all(children.map((scope) => handleOf(ctx, config, scope, null)));
      const summaries = await waitFor(ctx, () => [register.scope, D.scope, ...children], async () => {
        const all = await Promise.all(handles.map(active));
        return all.every((s) => s !== null) ? (all as Summary[]) : null;
      }, "membership, the rules scope and the destination", resume);
      if (directory.scope.scope !== D.scope || directory.scope.kind !== "directory" || summaries.some((summary, n) => summary.scope.scope !== children[n] || summary.scope.kind !== ["membership", "rules", "destination"][n])) return failed("A creation read names another scope; the claim remains pending.");
      repository = { directory: directory.scope, membership: summaries[0]!.scope, rules: children[1]!, destination: children[2]! };
      await keep({ ...pending, repository });
    }
    if (!validRepository(repository, seed)) return failed("The saved repository references do not match this claim; nothing was submitted.");
    const handle = pending.handle;

    // The founder's seat and first key (`founding-key`): the first admin of the repository.
    const enrollment = { ...base, repository };
    const M = await handleOf(ctx, enrollment, repository.membership.scope);
    const mShape = platform(MEMBERSHIP)!.data as unknown as DefinitionShape;
    if (!pending.seat) {
      const summary = await summaryOf(M);
      if (!foundingMembership(summary, repository.membership, signer.key, pending.handle)) return failed("Membership does not record this claim's founding key and handle; nothing was submitted.");
      const members = summary.items.filter((item) => item.type === "member");
      const own = members.filter((item) => item.values["handle"] === pending.handle);
      if (own.length === 1 && own[0]!.state === "active") await keep({ ...pending, seat: await recordedStep(M, own[0]!.id, repository.membership, signer.key, "seat") });
      else if (members.length !== 0) return failed("Existing membership makes the missing seat stage ambiguous; nothing was submitted.");
      else {
        const signed = await signedIntent(signer, { to: repository.membership, kind: "seat", expected: expectedOf(mShape.acts["seat"]!, summary.items, null, {}) }, signing(ctx));
        await keep({ ...pending, seat: { signed } });
      }
    }
    if (!validStep(pending.seat!, repository.membership, signer.key, "seat")) return failed("The saved seat does not match this membership and signing key; nothing was submitted.");
    const seat = await submitted(pending.seat!, repository.membership, M, "Seated");
    if (!pending.seat!.accepted) await keep({ ...pending, seat: { signed: pending.seat!.signed, accepted: seat } });
    const keyFields = { member: seat.seq };
    if (!pending.firstKey) {
      const summary = await summaryOf(M);
      if (!foundingMembership(summary, repository.membership, signer.key, pending.handle)) return failed("Membership does not record this claim's founding key and handle; nothing was submitted.");
      const keys = summary.items.filter((item) => item.type === "key");
      const own = keys.filter((item) => item.values["id"] === signer.key && item.refs["member"] === seat.seq);
      if (own.length === 1 && own[0]!.state === "active") await keep({ ...pending, firstKey: await recordedStep(M, own[0]!.id, repository.membership, signer.key, "first-key") });
      else if (keys.length !== 0) return failed("Existing membership makes the missing first-key stage ambiguous; nothing was submitted.");
      else {
        const signed = await signedIntent(signer, { to: repository.membership, kind: "first-key", fields: keyFields, expected: expectedOf(mShape.acts["first-key"]!, summary.items, null, keyFields) }, signing(ctx));
        await keep({ ...pending, firstKey: { signed } });
      }
    }
    if (!validStep(pending.firstKey!, repository.membership, signer.key, "first-key") || pending.firstKey!.signed.intent.fields["member"] !== seat.seq) return failed("The saved first key does not match this seat and signing key; nothing was submitted.");
    const firstKey = await submitted(pending.firstKey!, repository.membership, M, "First key");
    if (!pending.firstKey!.accepted) await keep({ ...pending, firstKey: { signed: pending.firstKey!.signed, accepted: firstKey } });
    const inbox = (await createdBy(M, seat.seq)).find((m) => m.seed.kind === "inbox")?.scope;
    if (inbox) {
      const I = await handleOf(ctx, enrollment, inbox);
      await waitFor(ctx, () => [M.scope, inbox], () => active(I), "the founder's inbox");
      repository.inbox = inbox;
    }
    await ctx.store.save({ ...base, repository, handle });
    return done(
      `Claimed ${name}: directory ${repository.directory.scope}, membership ${repository.membership.scope}, rules ${repository.rules}, destination ${repository.destination}; each created and confirmed.`,
      `You are ${handle}, an admin, on key ${signer.key}${inbox ? `; your inbox is ${inbox}` : ""}.`,
    );
  });
}

/** What an invitation link carries. Its secret is the invitation's, which `join` presents once; it is no signing key. */
interface Link { v: 1; service: string; repository: Omit<Repository, "inbox">; invitation: number; secret: string; handle: string }
const LINK = "artroom-invite:";

/**
 * `artroom invite <member> --role <role>`: membership's `invite-member`. The
 * invitation holds the digest of a new secret; the link holds the secret,
 * and is printed once, for the inviter to pass to the member.
 */
export function invite(ctx: Context, member: string, options: { role?: string; acts?: string; hours?: number } = {}): Promise<Outcome> {
  return run(async () => {
    if (options.acts !== undefined) {
      return usage("--acts is not supported: membership's invite-member has the fields handle, role, inviteHash and inviteEnds, and no list of acts for one member. A role's actions are the roster's, for every member of that role.");
    }
    if (!options.role || !(options.role in ROLE_LISTS)) return usage(`Name a role with --role: one of ${Object.keys(ROLE_LISTS).join(", ")}.`);
    const config = await configOf(ctx);
    const repository = config.repository ?? stop(usage("No repository is known here. Run: artroom claim <name>."));
    const signer = secretSigner(await signerOf(ctx, config));
    const M = await handleOf(ctx, config, repository.membership.scope);
    const summary = await summaryOf(M);
    const shape = (await definitionOf(M, summary)).shape;
    const secret = b64url(fresh(32));
    const now = ctx.now?.() ?? Date.now();
    const fields = { handle: member, role: options.role, inviteHash: textDigest(secret), inviteEnds: timeOf(Math.floor(now / 1000) * 1000 + (options.hours ?? 24) * 3600_000) };
    const signed = await signedIntent(signer, { to: repository.membership, kind: "invite-member", fields, expected: expectedOf(shape.acts["invite-member"]!, summary.items, null, fields) }, signing(ctx));
    const invitation = accepted(await M.submit(signed), M.scope, "Invited").receipt.fact.seq;
    const { inbox: _inbox, ...shared } = repository;
    const link: Link = { v: 1, service: config.service, repository: shared, invitation, secret, handle: member };
    return done(
      `Invited ${member} as ${options.role}: invitation ${repository.membership.scope}:${invitation}, until ${fields.inviteEnds}.`,
      `Link for ${member} only (it holds the invitation's secret): ${LINK}${b64url(utf8(JSON.stringify(link)))}`,
    );
  });
}

function linkOf(text: string): Link | null {
  if (!text.startsWith(LINK)) return null;
  try {
    const bytes = unb64url(text.slice(LINK.length));
    const link = bytes && (JSON.parse(new TextDecoder().decode(bytes)) as Link);
    return link && link.v === 1 && typeof link.secret === "string" && Number.isSafeInteger(link.invitation) ? link : null;
  } catch {
    return null;
  }
}

/**
 * `artroom join <link>`: membership's `join`, signed by a new key kept here. Prints the inbox that membership creates for the member.
 *
 * **Resume.** The exact signed join is kept before it is sent, and its accepted fact once the scope answers. A later run of the
 * same link sends those bytes again, or, with the fact kept, goes straight to the inbox that entry created. It never signs a
 * second join: membership would refuse the enrolled key as in use, and the invitation is spent.
 */
export function join(ctx: Context, text: string): Promise<Outcome> {
  return run(async () => {
    const link = linkOf(text) ?? stop(usage("That is not an invitation link from artroom invite."));
    const before = await ctx.store.config();
    if (before?.repository) return usage(`This config directory has a repository already: directory ${before.repository.directory.scope}.`);
    const secret = await keyOf(ctx, "device");
    const signer = secretSigner(secret);
    const base: Config = { v: 1, service: link.service, key: "device" };
    const M = await handleOf(ctx, { ...base, repository: link.repository }, link.repository.membership.scope, null);
    let pending = before?.join;
    if (pending) {
      const mine = pending.step.signed.intent;
      if (canonicalize(pending.repository.membership) !== canonicalize(link.repository.membership) || mine.fields["invitation"] !== link.invitation || mine.fields["secret"] !== link.secret || pending.handle !== link.handle || !validStep(pending.step, link.repository.membership, signer.key, "join")) {
        return failed("A join is pending here for another invitation or key; nothing was submitted.");
      }
    } else {
      // The new key has signed nothing yet, so it reads nothing in membership before the join. Membership is the directory's
      // `platform:membership@1`, whose `join` names its member by a mark, which has no key in `expected`: no revision is read.
      const shape = platform(MEMBERSHIP)!.data as unknown as DefinitionShape;
      const fields = { invitation: link.invitation, secret: link.secret };
      const signed = await signedIntent(signer, { to: link.repository.membership, kind: "join", fields, expected: expectedOf(shape.acts["join"]!, [], null, fields) }, signing(ctx));
      pending = { repository: link.repository, handle: link.handle, step: { signed } };
      await ctx.store.save({ ...base, join: pending });
    }
    let step = pending.step;
    if (!step.accepted) {
      const receipt = accepted(await M.submit(step.signed), M.scope, "Joined").receipt;
      if (!isFactRef(receipt.fact) || canonicalize(receipt.fact.at) !== canonicalize(link.repository.membership) || receipt.intent !== intentDigest(step.signed.intent)) throw new TransportError("The accepted reply does not match the saved join; it remains pending.");
      step = { signed: step.signed, accepted: receipt.fact };
      await ctx.store.save({ ...base, join: { ...pending, step } });
    }
    const seq = step.accepted!.seq;
    const inbox = (await createdBy(M, seq)).find((m) => m.seed.kind === "inbox")?.scope ?? stop(failed(`Joined, but entry ${M.scope}:${seq} creates no inbox.`));
    const I = await handleOf(ctx, { ...base, repository: link.repository }, inbox, null);
    await waitFor(ctx, () => [M.scope, inbox], () => active(I), "your inbox", "run artroom join with the same link again to go on waiting for it.");
    await ctx.store.save({ ...base, repository: { ...link.repository, inbox }, handle: link.handle });
    return done(`Joined as ${link.handle} on key ${signer.key}.`, `Your inbox: ${inbox}.`);
  });
}

/** The caller's role and the actions it holds, as membership's summary has them now; null when the key is no active member's. */
function standing(items: readonly Item[], key: KeyId): { role: Role; actions: readonly string[]; handle: string } | null {
  const own = items.find((item) => item.type === "key" && item.state === "active" && item.values["id"] === key);
  const member = own && items.find((item) => item.type === "member" && item.id === own.refs["member"] && item.state === "active");
  const roster = items.find((item) => item.type === "roster");
  const role = member?.values["role"] as Role | undefined;
  if (!member || !roster || !role) return null;
  return { role, actions: (roster.values[ROLE_LISTS[role]] as readonly string[] | null) ?? [], handle: String(member.values["handle"]) };
}

/**
 * `artroom acts [<scope>]`: the acts of the scope's definition that the
 * caller's role holds now, and those a rule decides, each with its fields.
 * What the scope will answer still depends on its guards and its state.
 */
export function acts(ctx: Context, named?: string): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const scope = scopeNamed(config, named);
    const reader = await readerOf(ctx, config);
    const handle = await handleOf(ctx, config, scope, reader);
    const { shape, named: definition } = await definitionOf(handle, await summaryOf(handle));
    const key = keyIdOfSecret(await signerOf(ctx, config));
    const held = config.repository ? standing((await summaryOf(await handleOf(ctx, config, config.repository.membership.scope, reader))).items, key) : null;
    const shown: string[] = [];
    let hidden = 0;
    for (const [kind, act] of Object.entries(shape.acts)) {
      if (kind === shape.genesis) continue;
      const action = grantName(act);
      if (typeof act.grant !== "string" || (action !== null && held?.actions.includes(action))) shown.push(`  ${describe(kind, act)}`);
      else hidden++;
    }
    const who = held ? `${held.handle} (${held.role})` : `key ${key}, which is no active member's`;
    return done(`Acts on ${scope} (${definition}) for ${who}:`, ...shown, ...(hidden > 0 ? [`Not shown: ${hidden} that need an action your role does not hold.`] : []));
  });
}

/**
 * `artroom act <kind> --on <scope> [--target <item>] [--set name=value ...]`:
 * one act. A declared definition's act goes through the client's declared
 * handle, which checks each field's shape before it signs; a platform
 * definition's is signed as given. The scope judges both.
 */
export function act(ctx: Context, kind: string, options: { on?: string; target?: number; set?: readonly string[] } = {}): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const scope = scopeNamed(config, options.on);
    const secret = await signerOf(ctx, config);
    const signer = secretSigner(secret);
    const handle = await handleOf(ctx, config, scope);
    const summary = await summaryOf(handle);
    const { shape, declared } = await definitionOf(handle, summary);
    const declaration = shape.acts[kind];
    if (!declaration || kind === shape.genesis) return usage(`${kind} is not an act of ${shape.name}. Run: artroom acts ${options.on ?? ""}`.trim());
    const fields: Record<string, FieldValue> = {};
    for (const pair of options.set ?? []) {
      const at = pair.indexOf("=");
      if (at < 1) return usage(`--set takes name=value, not ${pair}.`);
      const name = pair.slice(0, at);
      fields[name] = valueOf(config, declaration.fields[name], pair.slice(at + 1));
    }
    const target = options.target ?? null;
    const expected = expectedOf(declaration, summary.items, target, fields);
    if (declared) {
      const typed = await declaredHandle(handle, declared);
      if (!typed.ok) return failed(`Cannot act on ${scope}: ${typed.reason}.`);
      const { signed, beside } = await typed.handle.intent(signer, kind as never, { on: target, fields, expected } as never, signing(ctx));
      return answered(scope, await typed.handle.submit(signed, [], beside), "Took effect");
    }
    const signed = await signedIntent(signer, { to: summary.scope, kind, on: target, fields, expected }, signing(ctx));
    return answered(scope, await handle.submit(signed), "Took effect");
  });
}

/** One entry in one line: where, when, what and by which key. */
function entryLine(scope: ScopeId, entry: Entry): string {
  const input = entry.input;
  const what = input.type === "act" ? `act ${input.signed.intent.kind} by ${short(input.signed.intent.actor)}`
    : input.type === "genesis" ? `genesis ${input.kind}`
    : input.type === "delivery" ? `delivery ${"type" in input.message ? input.message.type : input.message.class} from ${input.from.at.kind}:${input.from.seq}`
    : input.type;
  return `${scope}:${entry.seq}  ${entry.time}  ${what}; ${entry.effects.length} effects, ${entry.sends.length} sends`;
}

/** `artroom log <scope> [--limit n]`: the last entries of the scope's history, oldest first. */
export function log(ctx: Context, named: string | undefined, options: { limit?: number } = {}): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const scope = scopeNamed(config, named);
    const handle = await handleOf(ctx, config, scope);
    const entries: Entry[] = [];
    for (let cursor: string | undefined, pages = 0; pages < 1000; pages++) {
      const page = await handle.history(cursor);
      if (!page.ok) return failed(`Cannot read the history of ${scope}: ${page.reason}.`);
      entries.push(...page.value.map((sealed) => sealed.entry));
      if (page.next === undefined) break;
      cursor = page.next;
    }
    const limit = options.limit ?? 20;
    return done(...entries.slice(-limit).map((entry) => entryLine(scope, entry)), `${entries.length} entries in all.`);
  });
}

/** `artroom show <scope>:<seq>`: one entry, with its hash computed by the client from the entry's bytes. */
export function show(ctx: Context, named: string): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const match = /^(.+):(\d+)$/.exec(named) ?? stop(usage("Name an entry as <scope>:<seq>, as log prints it."));
    const scope = scopeNamed(config, match[1]);
    const handle = await handleOf(ctx, config, scope);
    const read = await handle.entry(Number(match[2]));
    if (!read.ok) return failed(`Cannot read entry ${named}: ${read.reason}.`);
    const { entry, hash } = read.value;
    const input = entry.input;
    const detail = input.type === "act" ? `Fields: ${JSON.stringify(input.signed.intent.fields)}. Grants recorded: ${input.authority.length}.` : `Effects: ${JSON.stringify(entry.effects)}.`;
    return done(`${entryLine(scope, entry)}; hash ${hash}.`, detail);
  });
}

/**
 * `artroom verify <scope>`: the replay verifier over the read routes, with
 * the platform package's data and rules for a platform definition. It
 * prints the report: what it checked, and what it took on trust.
 */
/**
 * A source whose reads go with the caller's session, and a read that the session is refused (`forbidden`) goes again as a signed
 * read by the caller's key. So a scope that accepts no session of this repository yet, as a rules scope that records membership's
 * ID with no incarnation before its first act, is read by the key's cause chain while that holds.
 */
function sessionFirst(session: HistorySource, signed: HistorySource): HistorySource {
  return {
    page: async (scope, from, allow) => { const got = await session.page(scope, from, allow); return !got.ok && got.reason === "forbidden" ? signed.page(scope, from, allow) : got; },
    retained: async (scope, kind, digest, allow, domain) => { const got = await session.retained(scope, kind, digest, allow, domain); return !got.ok && got.reason === "forbidden" ? signed.retained(scope, kind, digest, allow, domain) : got; },
  };
}

export function verify(ctx: Context, named: string | undefined): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const scope = scopeNamed(config, named);
    const reader = await readerOf(ctx, config);
    const options = ctx.fetch ? { fetch: ctx.fetch } : {};
    const signed = httpSource(config.service, { ...options, reader: signedLogReader(secretSigner(await signerOf(ctx, config)), readSigning(ctx)) });
    const source = reader === null ? signed : sessionFirst(httpSource(config.service, { ...options, reader }), signed);
    const { report, why } = await replay(source, { mode: "replay", scope, platform, grants: "proven" });
    const lines = render(report, why).split("\n").filter((line) => line.length > 0);
    return report.result === "consistent" ? done(...lines) : failed(...lines);
  });
}
