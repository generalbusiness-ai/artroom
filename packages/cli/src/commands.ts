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
 * | `install` | Founds the register by an `install` intent, signed by a new operator key that is also the one founder key. With `--plan`, it signs the intent and prints the register ID it will found, and founds nothing; `--planned` founds that plan. |
 * | `claim` | Signs the register's `found` act, then waits until the directory, membership, rules scope and destination are created and confirmed. Then it takes the founder's seat and first key in membership. A claim it gave up waiting on is kept as pending, and the next `claim` goes on from it; `--again` signs a new one. |
 * | `invite`, `join` | Membership's `invite-member` and `join`. The link carries the invitation's number and secret; the joining key is made and kept locally. |
 * | `acts` | The acts of a scope's definition, with the ones the caller's role holds. |
 * | `act` | One act of any kind, through the client's declared handle for a declared definition, or as a signed intent for a platform one. |
 * | `log`, `show` | The scope's history, and one entry, over the read routes. |
 * | `verify` | The replay verifier over the read routes: with the caller's session, and by signed reads where the session is refused. With `--all`, every scope of the room, one line each. |
 * | `remote` | The repository's host, namespace, name and remote URL, from the destination's branch item. |
 * | `clone` | Signs the destination's `read-token`, waits for its outcome, reads the read token once, and runs `git clone` with it in an `Authorization` header that git reads from its environment. The token is never an argument and never printed. |
 * | `edit` | Opens a change through the directory under the change definition that the rules scope holds active, proposes one file as its only version (`propose-file`), and merges it as `merge` does. The room, not the person, writes the repository. |
 * | `merge` | Signs `merge` of a change's current version, and waits until the room has published it or refused it. `edit` and `merge` take `--closes <issue>`: the lane's `link-own` first. |
 * | `issue`, `issues` | `open` is the directory's `open-issue`; `comment`, `assign` and `close` are the issue lane's own acts. `issues` lists each issue as its lane has it. |
 */

import { PROPOSED_BOUNDS, type Answer, type DeclaredDefinition, type Digest, type EffectForm, type Entry, type FactRef, type FieldValue, type Founded, type Item, type KeyId, type PlatformDefinition, type ScopeId, type ScopeRef, type Seed, type SignedIntent, type Summary } from "@generalbusiness/artroom-contract";
import { READ_REFUSALS, b64url, canonicalize, definitionDigest, digestBytes, factRefOf, intentDigest, isReceipt, isSignedIntentShape, isDigest, isFactRef, isIncarnation, isScopeId, isScopeRef, keyIdOfSecret, parseStrict, scopeIdOf, seedDigest, textDigest, timeMs, timeOf, unb64url, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import {
  ScopeHandle, TransportError, readCredential, declaredHandle, found, httpTransport, requestSession, secretSigner, sessionRequest, shapeDeclaredAct, signedIntent, signedLogReader, signedReads,
  type Fetch, type ReadSigning, type Signing, type Transport,
} from "@generalbusiness/artroom-client";
import { TOKENS_FLOOR, capabilitiesOf, gitRead, holdCapability } from "@generalbusiness/artroom-derive";
import { DIRECTORY_OF, SIBLINGS_OF, READ_TOKEN_HOURS, REGISTER, ROLE_LISTS, platform, type Role } from "@generalbusiness/artroom-platform";
import { SourceError, httpSource, render, verify as replay, type HistorySource } from "@generalbusiness/artroom-replay";
import type { ClaimStep, Config, PendingClaim, PendingJoin, PlannedInstall, Repository, Store } from "./store.ts";
import { outcomeFetch, outcomeWaitLines, pauseOutcome, waitOutcome, type CloneWait } from "./clone-outcome.ts";
import { readTokenEntry, readTokenOpening, readTokenOutcome, readTokenReceipt } from "./clone-proof.ts";

export interface Context {
  store: Store;
  /** Replaces the runtime's `fetch`: a test passes the Worker's routes. */
  fetch?: Fetch;
  /** Internal configured-service trust for this exact injected founding
   * transport. It authenticates no independent remote history. */
  trustedFoundingService?: { service: string; fetch: Fetch };
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
  /** History pages per scope while discovering the room for `verify --all`. The default is 1,000. */
  historyPages?: number;
  /** The `git` program, for `clone`. `main.ts` gives Node's (`git.ts`); a test gives a stand-in. Absent: there is none. */
  git?: Git;
  /** Read-token outcome bounds and caller cancellation; never mint authority. */
  cloneWait?: CloneWait;
  /** A local file's bytes, for `edit --file` and `act --value`, or null when it cannot be read. `main.ts` gives Node's; a test gives its own. */
  read?: (path: string) => Promise<Uint8Array | null>;
}

/**
 * One run of `git`: its arguments, and the environment it adds. The answer is its exit code, or null when there is no `git` to
 * run. `env` is how a secret reaches git: as configuration that git reads from its environment, never as an argument.
 */
export interface Git { run(args: readonly string[], env: Readonly<Record<string, string>>): Promise<number | null> }

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
export interface ActShape {
  step: "open" | "transition" | "comment";
  on: string | null;
  grant: string | { code: string; grant?: string };
  also: Record<string, { item: string; one?: true; by?: string; code?: string }>;
  fields: Record<string, { type?: string; code?: string; required?: boolean }>;
}
export interface DefinitionShape { name: string; genesis: string; acts: Record<string, ActShape> }

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
export function describe(kind: string, act: ActShape): string {
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
export function expectedOf(act: ActShape, items: readonly Item[], target: number | null, fields: Record<string, FieldValue>): Record<string, number> {
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
export function valueOf(config: Pick<Config, "repository">, field: { type?: string } | undefined, text: string): FieldValue {
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

/** A lane's summary once it is `active`; a stop once its genesis is refused, which no wait changes. */
const laneActive = async (handle: ScopeHandle, opened: string): Promise<Summary | null> => {
  const read = await handle.summary();
  if (read.ok && read.value.status === "refused") return stop(failed(`The lane ${handle.scope} refused its creation by ${opened}; nothing else was written there.`));
  return read.ok && read.value.status === "active" ? read.value : null;
};

/** The scopes that entry `seq` of a scope creates, by the seed of each send, with the send's number. */
async function createdBy(handle: ScopeHandle, seq: number): Promise<{ n: number; seed: Seed; scope: ScopeId }[]> {
  const read = await handle.entry(seq);
  if (!read.ok) return stop(failed(`Cannot read entry ${handle.scope}:${seq}: ${read.reason}.`));
  return read.value.entry.sends.flatMap((send) => ("creator" in send.to ? [{ n: send.n, seed: send.to as Seed, scope: scopeIdOf(send.to as Seed) }] : []));
}

// ---------------------------------------------------------------- the commands

/**
 * `artroom install <base-url>`: found the register, at the newest version of the register that this command's platform package
 * ships. Its host and namespace are where the Git host keeps the repositories.
 */
export function install(ctx: Context, service: string, options: { host?: string; namespace?: string } = {}): Promise<Outcome> {
  return run(async () => {
    const before = await ctx.store.config();
    if (before?.register) return usage(`This config directory has a register already: ${before.register.scope}.`);
    if (before?.plan?.attempted !== undefined) return failed("Refused: install-pending. Retry artroom install --planned with the original plan; an attempted install cannot be replaced silently.");
    const { signed, key } = await installing(ctx, options, signing(ctx));
    const { answer } = await found(transportOf(ctx, service), signed, REGISTER);
    const receipt = accepted(answer, null, "Installed").receipt;
    await ctx.store.save({ v: 1, service, key: "operator", register: receipt.fact.at });
    return done(`Installed: register ${receipt.fact.at.scope}, under ${REGISTER}.`, `The operator key ${key} is kept in the config directory, readable only by you. It is the one founder key.`);
  });
}

/** The signed `install` intent, by the operator key, which is made and kept when it does not exist yet. */
async function installing(ctx: Context, options: { host?: string; namespace?: string }, at: Signing): Promise<{ signed: SignedIntent; key: KeyId }> {
  const signer = secretSigner(await keyOf(ctx, "operator"));
  const fields = { host: options.host ?? "github.com", namespace: options.namespace ?? "artroom", policy: "keys", founders: [signer.key] };
  return { signed: await signedIntent(signer, { to: null, kind: "install", fields }, at), key: signer.key };
}

/**
 * The ID of the register that a founding by this intent, under this version, makes: a scope's ID is a function of its seed, and
 * a register's seed of the founding intent and the version alone (the scope's `found`).
 */
const registerIdOf = (founding: SignedIntent, definition: PlatformDefinition): ScopeId =>
  scopeIdOf({ v: 1, kind: "register", definition, creator: null, cause: intentDigest(founding.intent), ordinal: 0 });

/** Exact closed catalog selection; no name-only or newest provenance fallback. */
function knownPlatform(named: unknown, name: string): ReturnType<typeof platform> {
  const supplied = typeof named === "string" ? platform(named) : null;
  return supplied?.data.name === name ? supplied : null;
}
/** Local recovery identity only. The signature and server decide authority. */
const installAttemptOf = (plan: PlannedInstall): Digest => textDigest(canonicalize({
  service: plan.service, operator: plan.founding.intent.actor, founding: plan.founding, definition: plan.definition, register: plan.register,
}));

/**
 * `artroom install --plan <base-url>`: sign the `install` intent and print the ID of the register that it will found, and found
 * nothing. The intent lives as long as an intent may, so it can be founded until its `notAfter`, the time printed. The plan is
 * kept in the config, so that the operator can pin that ID in the Worker's host setting before the register exists, and then
 * run `install --planned`. A later plan replaces it.
 */
export function planInstall(ctx: Context, service: string, options: { host?: string; namespace?: string } = {}): Promise<Outcome> {
  return run(async () => {
    const before = await ctx.store.config();
    if (before?.register) return usage(`This config directory has a register already: ${before.register.scope}.`);
    if (before?.plan?.attempted !== undefined) return failed("Refused: install-pending. Retry artroom install --planned with the original plan; an attempted install cannot be replaced silently.");
    const { signed } = await installing(ctx, options, { ...signing(ctx), lifetimeSeconds: PROPOSED_BOUNDS.intentLifetimeSeconds - 60 });
    const register = registerIdOf(signed, REGISTER);
    await ctx.store.save({ v: 1, service, key: "operator", plan: { service, definition: REGISTER, founding: signed, register } });
    const { host, namespace } = signed.intent.fields as { host: string; namespace: string };
    return done(
      `Planned: register ${register}, under ${REGISTER}, on host ${host}, namespace ${namespace}. The seed's time is ${signed.intent.notAfter}.`,
      `Set registerScope to ${register} in the Worker's host setting, then run artroom install --planned before ${signed.intent.notAfter}.`,
    );
  });
}

/**
 * `artroom install --planned`: found the register that `install --plan` planned, with the intent it kept. Before anything is
 * sent, the plan is checked: the register ID that its intent and version make must be the one it printed, and the version must be
 * a supported exact pinned version. A durable attempted marker precedes any
 * submission. Exact attempted late recovery retains the original plan and
 * configured-service acknowledgement; it claims no independent history proof.
 */
export function installPlanned(ctx: Context): Promise<Outcome> {
  return run(async () => {
    const before = await ctx.store.config();
    if (before?.register) return usage(`This config directory has a register already: ${before.register.scope}.`);
    const plan = before?.plan ?? stop(usage("No install is planned here. Run: artroom install --plan <base-url>."));
    const operator = await ctx.store.secret("operator");
    const now = ctx.now?.() ?? Date.now();
    if (!knownPlatform(plan.definition, "platform:register")) return failed("Unsupported install provenance: this command cannot serve the plan's exact pinned register version. The pending plan is kept; nothing was sent.");
    const valid = isSignedIntentShape(plan.founding) && verifySignedIntent(plan.founding)
      && plan.founding.intent.kind === "install" && plan.founding.intent.to === null && plan.founding.intent.on === null
      && Object.keys(plan.founding.intent.expected).length === 0
      && before!.key === "operator" && operator instanceof Uint8Array && operator.length === 32 && plan.founding.intent.actor === keyIdOfSecret(operator)
      && typeof plan.service === "string" && plan.service === before!.service
      && isScopeId(plan.register) && registerIdOf(plan.founding, plan.definition) === plan.register
      && timeMs(plan.founding.intent.notAfter)! - now <= PROPOSED_BOUNDS.intentLifetimeSeconds * 1000;
    if (!valid) {
      return failed("Refused: plan-mismatch. The saved plan does not match this service, operator key and supported register version. Nothing was sent. Keep the original plan for recovery; do not silently replace it.");
    }
    const attempt = installAttemptOf(plan);
    if (plan.attempted !== undefined && plan.attempted !== attempt) return failed("Refused: plan-mismatch. The attempted marker belongs to another service, operator, envelope, version or register. The pending plan is kept; nothing was sent.");
    if (plan.attempted === undefined && now >= timeMs(plan.founding.intent.notAfter)!) {
      return failed(`Refused: plan-expired. The planned install could be founded until ${plan.founding.intent.notAfter}. Nothing was sent. Plan again, and set the new register ID.`);
    }
    const matches = (receipt: unknown): receipt is NonNullable<PlannedInstall["acknowledged"]>["receipt"] => isReceipt(receipt)
      && receipt.definition === plan.definition && receipt.intent === intentDigest(plan.founding.intent)
      && receipt.fact.at.scope === plan.register && receipt.fact.at.kind === "register" && receipt.fact.seq === 0;
    const prior = plan.acknowledged;
    if (prior !== undefined && (!prior || prior.status !== "service-acknowledged" || prior.service !== plan.service || !matches(prior.receipt))) {
      return failed("Held: the retained install acknowledgement does not match the original plan. The plan is kept.");
    }
    if (ctx.fetch !== undefined && (ctx.trustedFoundingService?.service !== plan.service || ctx.trustedFoundingService.fetch !== ctx.fetch)) {
      return failed("Held: this injected transport has no configured-service acknowledgement trust. The plan is kept; no request was sent.");
    }
    // The durable marker must precede the first possible request. An exact
    // attempted replay may recover an accepted genesis after expiry; the
    // server still refuses an expired founding that was never accepted.
    if (plan.attempted === undefined) await ctx.store.save({ ...before!, plan: { ...plan, attempted: attempt } });
    const { answer } = await found(transportOf(ctx, plan.service), plan.founding, plan.definition);
    const receipt = accepted(answer, null, "Installed").receipt;
    if (!matches(receipt)) {
      return failed("Held: the install acknowledgement does not match the planned register's exact identity. The plan is kept.");
    }
    if (prior !== undefined && canonicalize(prior.receipt.fact) !== canonicalize(receipt.fact)) {
      return failed("Held: the install acknowledgement conflicts with the retained accepted fact. The plan is kept.");
    }
    // Save acceptance evidence before the final installed config. A lost final
    // save can recover only the same fact; neither save erases the envelope.
    const acknowledged: PlannedInstall = { ...plan, attempted: attempt, acknowledged: { status: "service-acknowledged", service: plan.service, receipt } };
    await ctx.store.save({ ...before!, plan: acknowledged });
    await ctx.store.save({ ...before!, plan: acknowledged, register: receipt.fact.at });
    return done(`Installed: register ${receipt.fact.at.scope}, under ${plan.definition}, as planned.`, "Service-acknowledged identity recovery. The original plan and receipt are retained for later history verification.");
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
    const siblings = SIBLINGS_OF[directory.definition];
    if (!siblings) return false;
    const sibling = (kind: "membership" | "rules" | "destination", ordinal: number) => scopeIdOf({ v: 1, kind, definition: siblings[kind], creator: repository.directory, cause: seedDigest(directory), ordinal });
    // The pinned directory creates these three exact siblings in order. Both its exact
    // seed and full confirmed reference determine their IDs; the same founder
    // key/handle in another room cannot authorize a substituted cache.
    return repository.directory.scope === scopeIdOf(directory) && repository.directory.kind === "directory" && isIncarnation(repository.directory.inc)
      && isScopeId(repository.membership.scope) && repository.membership.kind === "membership" && isIncarnation(repository.membership.inc)
      && repository.membership.scope === sibling("membership", 0) && repository.rules === sibling("rules", 1) && repository.destination === sibling("destination", 2)
      && (repository.inbox === undefined || isScopeId(repository.inbox));
  } catch { return false; }
}
function foundingMembership(summary: Summary, at: ScopeRef, key: KeyId, handle: string, definition: PlatformDefinition): boolean {
  const roster = summary.items.find((item) => item.type === "roster");
  return canonicalize(summary.scope) === canonicalize(at) && summary.definition === definition
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
    // A resumed accepted envelope obtains its exact pin from checked
    // settlement, before any aged summary is needed for routing.
    let registerDefinition: Digest | PlatformDefinition | null = null;
    const { claim: _, ...base } = config;
    let pending: PendingClaim;
    if (config.claim && !options.again) {
      pending = config.claim;
      if (pending.register !== register.scope || !isDigest(pending.intent) || typeof pending.handle !== "string") return failed("The pending claim does not identify this register and a valid recorded intent; nothing was submitted.");
      if (pending.found && (!validStep(pending.found, register, signer.key, "found") || intentDigest(pending.found.signed.intent) !== pending.intent || pending.found.signed.intent.fields["founderHandle"] !== pending.handle)) return failed("The pending claim does not match this register, signing key and recorded intent; nothing was submitted.");
    } else {
      const recovery = keyIdOfSecret(await keyOf(ctx, "recovery"));
      const handle = options.handle ?? "@founder";
      const registered = await summaryOf(R);
      if (canonicalize(registered.scope) !== canonicalize(register)) return failed("The register read does not match the saved register reference; nothing was submitted.");
      if (!DIRECTORY_OF[registered.definition]) return failed(`The register ${register.scope} is under ${registered.definition}, which this command does not know.`);
      registerDefinition = registered.definition;
      const shape = platform(registered.definition)!.data as unknown as DefinitionShape;
      const fields = { branch: options.branch ?? "main", founderHandle: handle, recoveryKey: recovery };
      const signed = await signedIntent(signer, { to: register, kind: "found", fields, expected: expectedOf(shape.acts["found"]!, registered.items, null, fields) }, signing(ctx));
      pending = { register: register.scope, intent: intentDigest(signed.intent), handle, found: { signed } };
      await ctx.store.save({ ...base, claim: pending });
    }
    const keep = async (next: PendingClaim) => { await ctx.store.save({ ...base, claim: next }); pending = next; };
    if (!pending.found) {
      // Legacy records did not preserve the envelope. A real admitted
      // directory retains the original claim, so recover that exact signature
      // as already accepted. Never submit a reconstructed or fresh found.
      const registered = await R.summary();
      // Digest-only records from main used the exact native directory@1.
      // A readable exact register pin can identify a tagged successor;
      // an unreadable pin never guesses that successor from newest aliases.
      if (registered.ok && canonicalize(registered.value.scope) !== canonicalize(register)) return failed("The register read does not match the saved register reference; nothing was submitted.");
      const legacyDefinition = registered.ok ? DIRECTORY_OF[registered.value.definition] : "platform:directory@1";
      if (!legacyDefinition) return failed("The legacy claim's register definition is unknown; nothing was submitted.");
      const legacySeed: Seed = { v: 1, kind: "directory", definition: legacyDefinition, creator: register, cause: pending.intent, ordinal: 0 };
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
        if (step.signed.intent.kind === "found" && canonicalize(at) === canonicalize(register)) registerDefinition = settled.value.definition;
        return step.accepted;
      }
      const receipt = accepted(await handle.submit(step.signed), at.scope, took).receipt;
      if (!isFactRef(receipt.fact) || canonicalize(receipt.fact.at) !== canonicalize(at) || receipt.intent !== digest) throw new TransportError("The accepted reply does not match this exact claim step; its saved request remains pending.");
      if (step.signed.intent.kind === "found" && canonicalize(at) === canonicalize(register)) {
        if (registerDefinition !== null && receipt.definition !== registerDefinition) throw new TransportError("The accepted reply names another register definition; its exact saved request remains pending.");
        registerDefinition = receipt.definition;
      }
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

    // The checked register receipt selects the exact directory/sibling tuple.
    const directoryDefinition = registerDefinition === null ? undefined : DIRECTORY_OF[registerDefinition];
    if (!directoryDefinition) return failed(`The accepted claim's register definition ${String(registerDefinition)} is unknown; the claim remains pending.`);
    const siblings = SIBLINGS_OF[directoryDefinition];
    if (!siblings) return failed(`The directory ${directoryDefinition} has no known sibling versions; the claim remains pending.`);
    // The register's rule fixes the directory's seed from the claim's own intent (`directorySeed`).
    const seed: Seed = { v: 1, kind: "directory", definition: directoryDefinition, creator: register, cause: pending.intent, ordinal: 0 };
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
      if (directory.scope.scope !== D.scope || directory.scope.kind !== "directory" || directory.definition !== directoryDefinition || summaries.some((summary, n) => summary.scope.scope !== children[n] || summary.scope.kind !== ["membership", "rules", "destination"][n] || summary.definition !== [siblings.membership, siblings.rules, siblings.destination][n])) return failed("A creation read names another scope; the claim remains pending.");
      repository = { directory: directory.scope, membership: summaries[0]!.scope, rules: children[1]!, destination: children[2]! };
      await keep({ ...pending, repository });
    }
    if (!validRepository(repository, seed)) return failed("The saved repository references do not match this claim; nothing was submitted.");
    const handle = pending.handle;

    // The founder's seat and first key (`founding-key`): the first admin of the repository.
    const enrollment = { ...base, repository };
    const M = await handleOf(ctx, enrollment, repository.membership.scope);
    const mShape = platform(siblings.membership)!.data as unknown as DefinitionShape;
    if (!pending.seat) {
      const summary = await summaryOf(M);
      if (!foundingMembership(summary, repository.membership, signer.key, pending.handle, siblings.membership)) return failed("Membership does not record this claim's founding key and handle; nothing was submitted.");
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
      if (!foundingMembership(summary, repository.membership, signer.key, pending.handle, siblings.membership)) return failed("Membership does not record this claim's founding key and handle; nothing was submitted.");
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
      `Definitions: ${directoryDefinition}, ${[siblings.membership, siblings.rules, siblings.destination].join(", ")}.`,
      `You are ${handle}, an admin, on key ${signer.key}${inbox ? `; your inbox is ${inbox}` : ""}.`,
    );
  });
}

/** What an invitation link carries. Its secret is the invitation's, which `join` presents once; it is no signing key. */
/** `definition`: the version of membership that the invitation is in. A link made before it was carried names none. */
/** What an invitation link holds: the service, the repository's scopes, the invitation and its secret, the handle, and membership's version. */
export interface Link { v: 1; service: string; repository: Omit<Repository, "inbox">; invitation: number; secret: string; handle: string; definition?: string }
export const LINK = "artroom-invite:";

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
    const link: Link = { v: 1, service: config.service, repository: shared, invitation, secret, handle: member, definition: summary.definition };
    return done(
      `Invited ${member} as ${options.role}: invitation ${repository.membership.scope}:${invitation}, until ${fields.inviteEnds}.`,
      `Link for ${member} only (it holds the invitation's secret): ${LINK}${b64url(utf8(JSON.stringify(link)))}`,
    );
  });
}

/** The invitation that a link from `artroom invite` holds, or null when the text is no such link. */
export function linkOf(text: string): Link | null {
  if (!text.startsWith(LINK)) return null;
  try {
    const bytes = unb64url(text.slice(LINK.length));
    const link = bytes && (JSON.parse(new TextDecoder().decode(bytes)) as Link);
    return link && link.v === 1 && typeof link.secret === "string" && Number.isSafeInteger(link.invitation) ? link : null;
  } catch {
    return null;
  }
}

/** `artroom join <link>` resumes the exact enrollment kept before delivery. */
export function join(ctx: Context, text: string): Promise<Outcome> {
  return run(async () => {
    const link = linkOf(text) ?? stop(usage("That is not an invitation link from artroom invite."));
    if (typeof link.service !== "string" || typeof link.handle !== "string" || link.invitation < 1
      || !isScopeRef(link.repository?.directory) || link.repository.directory.kind !== "directory"
      || !isScopeRef(link.repository?.membership) || link.repository.membership.kind !== "membership"
      || !isScopeId(link.repository?.rules) || !isScopeId(link.repository?.destination)) return usage("That invitation link has invalid repository references.");
    const before = await ctx.store.config();
    if (before?.repository) return usage(`This config directory has a repository already: directory ${before.repository.directory.scope}.`);
    if (before && !before.join) return usage("This config directory is set up already; use another config directory to join.");
    const linkDigest = textDigest(canonicalize(link));
    let pending: PendingJoin | undefined = before?.join;
    const shared = pending && (({ inbox: _inbox, ...repository }) => repository)(pending.repository);
    if (pending && (pending.link !== linkDigest || before!.service !== link.service || canonicalize(shared) !== canonicalize(link.repository) || pending.handle !== link.handle)) return failed("The invitation link does not match the pending join; nothing was submitted. Retry the original invitation link.");
    const base: Config = before ? { v: 1, service: before.service, key: before.key } : { v: 1, service: link.service, key: "device" };
    const signer = secretSigner(pending ? await signerOf(ctx, base) : await keyOf(ctx, base.key));
    let signed: SignedIntent;
    const keep = async (next: PendingJoin) => { await ctx.store.save({ ...base, join: next }); pending = next; };
    if (!pending) {
      // No pre-join membership reads are authorized. Its pinned definition
      // names the invitation by a mark, with no revision in expected.
      // Main's untagged links named native membership@1. New links carry
      // their exact pin; missing tags never select the newest alias.
      const named = link.definition ?? "platform:membership@1";
      const loaded = platform(named);
      if (!loaded || loaded.data.name !== "platform:membership") return failed(`The invitation is in ${named}, which this command does not know as membership.`);
      const shape = loaded.data as unknown as DefinitionShape;
      const fields = { invitation: link.invitation, secret: link.secret };
      signed = await signedIntent(signer, { to: link.repository.membership, kind: "join", fields, expected: expectedOf(shape.acts["join"]!, [], null, fields) }, signing(ctx));
      const request = `join-${b64url(fresh(12)).toLowerCase().replace(/_/g, "a")}`;
      // The envelope includes the invitation secret. Publish it privately,
      // then its public pointer, before any mutation can leave this process.
      await ctx.store.keepPrivate(request, utf8(JSON.stringify(signed)));
      await keep({ request, intent: intentDigest(signed.intent), link: linkDigest, repository: link.repository, handle: link.handle });
    } else {
      const bytes = await ctx.store.private(pending.request);
      if (!bytes) return failed("The exact private join request is missing; nothing was submitted. Restore its private record before retrying.");
      try { signed = JSON.parse(new TextDecoder().decode(bytes)) as SignedIntent; }
      catch { return failed("The private join request cannot be read; nothing was submitted."); }
    }
    const at = link.repository.membership;
    if (!validStep({ signed, ...(pending!.accepted ? { accepted: pending!.accepted } : {}) }, at, signer.key, "join")
      || intentDigest(signed.intent) !== pending!.intent || signed.intent.fields["invitation"] !== link.invitation || signed.intent.fields["secret"] !== link.secret) return failed("The saved join does not match this invitation, membership and signing key; nothing was submitted.");
    const config: Config = { ...base, repository: link.repository };
    const M = await handleOf(ctx, config, at.scope, null);
    const digest = intentDigest(signed.intent);
    let fact: FactRef;
    if (pending!.accepted) {
      const settled = await M.settle(signed);
      if (!settled.ok) return failed(`Cannot confirm the saved join: ${settled.reason}. The exact request remains pending; nothing was submitted.`);
      if (settled.value.intent !== digest || canonicalize(settled.value.fact) !== canonicalize(pending!.accepted)) return failed("The saved accepted fact does not match this exact join; nothing was submitted.");
      fact = pending!.accepted;
    } else {
      const receipt = accepted(await M.submit(signed), M.scope, "Joined").receipt;
      if (!isFactRef(receipt.fact) || canonicalize(receipt.fact.at) !== canonicalize(at) || receipt.intent !== digest) throw new TransportError("The accepted reply does not match this exact join; its saved request remains pending.");
      fact = receipt.fact;
      await keep({ ...pending!, accepted: fact });
    }
    const entry = await M.entry(fact.seq);
    if (!entry.ok) return failed(`Cannot read entry ${M.scope}:${fact.seq}: ${entry.reason}. The join remains pending; retry the original invitation link.`);
    if (canonicalize(factRefOf(entry.value.entry)) !== canonicalize(fact) || entry.value.hash !== fact.hash
      || entry.value.entry.input.type !== "act" || canonicalize(entry.value.entry.input.signed) !== canonicalize(signed)) return failed("The admitted entry does not match this exact join; nothing was submitted.");
    const inbox = entry.value.entry.sends.flatMap((send) => "creator" in send.to && send.to.kind === "inbox" ? [scopeIdOf(send.to as Seed)] : [])[0]
      ?? stop(failed(`Joined, but entry ${M.scope}:${fact.seq} creates no inbox. The join remains pending.`));
    if (pending!.repository.inbox && pending!.repository.inbox !== inbox) return failed("The saved inbox does not match this join; nothing was submitted.");
    await keep({ ...pending!, repository: { ...link.repository, inbox } });
    const I = await handleOf(ctx, config, inbox, null);
    await waitFor(ctx, () => [M.scope, inbox], () => active(I), "your inbox", "retry the original artroom join invitation link to continue this enrollment.");
    await ctx.store.save({ ...config, repository: { ...link.repository, inbox }, handle: link.handle });
    return done(`Joined as ${link.handle} on key ${signer.key}.`, `Your inbox: ${inbox}.`);
  });
}

/** A caller's role in membership, the actions that role holds, and the caller's handle. */
export interface Standing { role: Role; actions: readonly string[]; handle: string }

/** The caller's role and the actions it holds, as membership's summary has them now; null when the key is no active member's. */
export function standing(items: readonly Item[], key: KeyId): Standing | null {
  const own = items.find((item) => item.type === "key" && item.state === "active" && item.values["id"] === key);
  const member = own && items.find((item) => item.type === "member" && item.id === own.refs["member"] && item.state === "active");
  const roster = items.find((item) => item.type === "roster");
  const role = member?.values["role"] as Role | undefined;
  if (!member || !roster || !role) return null;
  return { role, actions: (roster.values[ROLE_LISTS[role]] as readonly string[] | null) ?? [], handle: String(member.values["handle"]) };
}

/**
 * The acts of a definition that a caller may sign now: each whose grant
 * action the caller's role holds, and each that a rule decides, which is
 * always listed. The genesis act is no act on a scope that exists.
 * `hidden`: how many need an action the role does not hold. The scope can
 * still refuse a listed act on its guards or its state.
 */
export function heldActs(shape: DefinitionShape, held: Standing | null): { acts: [kind: string, act: ActShape][]; hidden: number } {
  const acts: [string, ActShape][] = [];
  let hidden = 0;
  for (const [kind, act] of Object.entries(shape.acts)) {
    if (kind === shape.genesis) continue;
    const action = grantName(act);
    if (typeof act.grant !== "string" || (action !== null && held?.actions.includes(action))) acts.push([kind, act]);
    else hidden++;
  }
  return { acts, hidden };
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
    const { acts: listed, hidden } = heldActs(shape, held);
    const shown = listed.map(([kind, act]) => `  ${describe(kind, act)}`);
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
export function act(ctx: Context, kind: string, options: { on?: string; target?: number; set?: readonly string[]; value?: readonly string[] } = {}): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    // A value beside the intent, for a field that names one by its digest, such as the bytes of a definition that `activate` or
    // `open-issue` names: each file's text, as it is. The scope reads it only at a place that its definition states.
    const values: string[] = [];
    for (const path of options.value ?? []) values.push(textOf(await fileOf(ctx, path), path));
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
      return answered(scope, await typed.handle.submit(signed, [], { ...beside, ...(values.length > 0 ? { values } : {}) }), "Took effect");
    }
    const signed = await signedIntent(signer, { to: summary.scope, kind, on: target, fields, expected }, signing(ctx));
    return answered(scope, await handle.submit(signed, [], values.length > 0 ? { values } : {}), "Took effect");
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
 * read by the caller's key. Every scope of the room and the register accept a session of the room's membership (the planner's
 * decision ca8ad1cf), so the fallback serves a scope of another room or register that the caller's key signed an entry of.
 */
function sessionFirst(session: HistorySource, signed: HistorySource): HistorySource {
  return {
    page: async (scope, from, allow) => { const got = await session.page(scope, from, allow); return !got.ok && got.reason === "forbidden" ? signed.page(scope, from, allow) : got; },
    retained: async (scope, kind, digest, allow, domain) => { const got = await session.retained(scope, kind, digest, allow, domain); return !got.ok && got.reason === "forbidden" ? signed.retained(scope, kind, digest, allow, domain) : got; },
  };
}

/**
 * The code of the lanes' two capability versions, `hold@1` and `git-read@1`, with the numbers of `hold@1` that the runtime runs
 * (`CAPABILITY_CODE` and `HOLD_VERSION` of the scope package's `ports.ts`). It is derive's code: pure functions, which let the
 * verifier derive a lane's entries again.
 */
const CAPABILITIES = capabilitiesOf(holdCapability({ tokensPerHold: TOKENS_FLOOR, rootRetentionSeconds: null }), gitRead());

/** The replay of one scope's history over the read routes: with the caller's session first, then by signed reads. */
async function replayOf(ctx: Context, config: Config, reader: string | null, scope: ScopeId) {
  const options = ctx.fetch ? { fetch: ctx.fetch } : {};
  const signed = httpSource(config.service, { ...options, reader: signedLogReader(secretSigner(await signerOf(ctx, config)), readSigning(ctx)) });
  const source = reader === null ? signed : sessionFirst(httpSource(config.service, { ...options, reader }), signed);
  return replay(source, { mode: "replay", scope, platform, grants: "proven", capabilities: CAPABILITIES, owners: CAPABILITIES });
}

export function verify(ctx: Context, named: string | undefined, options: { all?: boolean } = {}): Promise<Outcome> {
  if (options.all) return named === undefined ? verifyAll(ctx) : Promise.resolve(usage("verify --all takes no scope: it verifies every scope of the room."));
  return run(async () => {
    const config = await configOf(ctx);
    const scope = scopeNamed(config, named);
    const { report, why } = await replayOf(ctx, config, await readerOf(ctx, config), scope);
    const lines = render(report, why).split("\n").filter((line) => line.length > 0);
    return report.result === "consistent" ? done(...lines) : failed(...lines);
  });
}

/**
 * The scopes of the room: the register, the directory, and every scope that the directory created and each of those created, in
 * the order of their histories. A scope is found by the creation that its creator's entry sends; the register's other creations
 * are other rooms', and are not followed.
 */
async function roomScopes(ctx: Context, config: Config, reader: string | null): Promise<{ kind: string; scope: ScopeId }[]> {
  const pageLimit = ctx.historyPages ?? 1000;
  if (!Number.isSafeInteger(pageLimit) || pageLimit < 1) return stop(usage("The room history page limit must be a positive integer."));
  const directory = config.repository!.directory.scope;
  const D = await handleOf(ctx, config, directory, reader);
  const register = ((await summaryOf(D)).items.find((item) => item.type === "repository")?.refs["register"] as ScopeRef | undefined)?.scope;
  const found = [...(register ? [{ kind: "register", scope: register }] : []), { kind: "directory", scope: directory }];
  // From the directory on: each scope found is read in turn, and what its history creates is added at the end.
  for (let i = found.length - 1; i < found.length; i++) {
    const handle = await handleOf(ctx, config, found[i]!.scope, reader);
    for (let cursor: string | undefined, pages = 0; pages < pageLimit; pages++) {
      const page = await handle.history(cursor);
      if (!page.ok) return stop(failed(`Cannot read the history of ${handle.scope}: ${page.reason}.`));
      for (const { entry } of page.value) {
        for (const send of entry.sends) {
          if (!("creator" in send.to)) continue;
          const seed = send.to as Seed;
          const scope = scopeIdOf(seed);
          if (!found.some((f) => f.scope === scope)) found.push({ kind: seed.kind, scope });
        }
      }
      if (page.next === undefined) break;
      if (pages + 1 === pageLimit) return stop(failed(`Incomplete: room discovery for ${handle.scope} reached ${pageLimit} history pages; next cursor ${JSON.stringify(page.next)}. The whole room was not verified.`));
      cursor = page.next;
    }
  }
  return found;
}

/**
 * `artroom verify --all`: the replay of the register and of every scope of the room, one line for each: its kind, its ID, the
 * entry the replay reached and the result. The last line is "All consistent" or the first finding. A history that cannot be read
 * is a finding.
 */
function verifyAll(ctx: Context): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    if (!config.repository) return usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>.");
    const reader = await readerOf(ctx, config);
    const lines: string[] = [];
    let first: string | null = null;
    const scopes = await roomScopes(ctx, config, reader);
    for (const { kind, scope } of scopes) {
      try {
        const { report, why } = await replayOf(ctx, config, reader, scope);
        lines.push(`${kind} ${scope}, entry ${report.target.seq}: ${report.result}.`);
        if (report.result !== "consistent") first ??= `First finding: ${kind} ${scope} is ${report.result}${why ? `: ${why}` : ""}.`;
      } catch (error) {
        if (!(error instanceof SourceError)) throw error;
        lines.push(`${kind} ${scope}: not read.`);
        first ??= `First finding: ${kind} ${scope}: ${error.message}.`;
      }
    }
    return first === null ? done(...lines, `All consistent: ${scopes.length} scopes.`) : failed(...lines, first);
  });
}

// ---------------------------------------------------------------- the repository's remote, and a clone

/** The repository record of the destination's branch item: `{ host, namespace, name, id }`. */
interface Recorded { host: string; namespace: string; name: string; id: string }

/** The host of the hosting's own Git service, as a register records it. */
const OWN_HOST = "artifacts";

/**
 * The remote URL of a recorded repository, in its host's form, or null where the room's record does not give it. GitHub's is
 * whole. The hosting's own Git service names its hostname in the Worker's setting, which no scope records: a clone learns it
 * from the credential's answer, and the config keeps it.
 */
function remoteOf(config: Config, repository: Recorded): string | null {
  if (repository.host === "github.com") return `https://github.com/${repository.namespace}/${repository.name}.git`;
  const path = `/git/${repository.namespace}/${repository.name}.git`;
  return repository.host === OWN_HOST && config.remote?.endsWith(path) ? config.remote : null;
}
/** The remote URL as the person is told it: whole, or in its host's form with the part the room does not record marked. */
const remoteLine = (config: Config, repository: Recorded): string =>
  remoteOf(config, repository) ?? (repository.host === OWN_HOST ? `https://<service host>/git/${repository.namespace}/${repository.name}.git (the service host is the deployment's setting; artroom clone prints it whole)` : `not known for the host ${repository.host}`);

/**
 * The destination's summary. The caller's session is presented first; the destination accepts a session of the membership its
 * genesis names. A caller with no session, or one that is refused, reads again by a signed read of the caller's key, which the
 * destination answers where the key's claim caused it, within the intent window.
 */
async function destinationOf(ctx: Context, config: Config): Promise<{ summary: Summary; reader: string | null; repository: Recorded }> {
  const scope = config.repository?.destination ?? stop(usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>."));
  const reader = await readerOf(ctx, config);
  let read = await (await handleOf(ctx, config, scope, reader)).summary();
  if (!read.ok && read.reason === "forbidden" && reader !== null) read = await (await handleOf(ctx, config, scope, null)).summary();
  if (!read.ok) return stop(failed(`Cannot read ${scope}: ${read.reason}.`));
  if (read.value.scope.scope !== scope || read.value.scope.kind !== "destination" || !knownPlatform(read.value.definition, "platform:destination")) return stop(failed(`${scope} is no supported destination.`));
  const branch = read.value.items.find((item) => item.type === "branch");
  const repository = branch?.values["repository"] as Recorded | undefined;
  if (!branch || !repository || typeof repository.host !== "string" || typeof repository.name !== "string" || typeof repository.namespace !== "string" || typeof repository.id !== "string") return stop(failed(`The destination ${scope} records no repository.`));
  return { summary: read.value, reader, repository };
}

/** `artroom remote`: the repository's host, namespace, name and remote URL, as the destination's branch item records them. */
export function remote(ctx: Context): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const { repository } = await destinationOf(ctx, config);
    return done(`Host: ${repository.host}`, `Namespace: ${repository.namespace}`, `Name: ${repository.name}`, `Remote URL: ${remoteLine(config, repository)}`);
  });
}

/** The value of the `Authorization` header that git sends with a read token: a bearer token, and GitHub's documented form for an installation token. */
const authorization = (repository: Recorded, token: string): string =>
  repository.host === "github.com" ? `Basic ${b64(`x-access-token:${token}`)}` : `Bearer ${token}`;
const b64 = (text: string): string => btoa(String.fromCharCode(...utf8(text)));
/** The configuration that carries the header, as git reads it from its environment: the same as `-c http.extraHeader=...`, but in no argument. */
const headerEnv = (value: string): Record<string, string> => ({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: ${value}` });

/**
 * `artroom clone [directory] [--hours n]`: a clone of the room's repository, with a read token of its own.
 *
 * 1. Without `git` here, it signs nothing: it prints the clone command, with the token's place marked.
 * 2. It signs the destination's `read-token` for `hours` (default 1, from 1 to 24), and waits for the outcome of its `mint-read`.
 * 3. It reads the token once, with the caller's session, from the destination's credential route.
 * 4. It runs `git clone -- <remote> [directory]`, with the header in git's environment configuration. The token is in no
 *    argument, command-printed line or command-written file. Ambient Git
 *    configuration and Git's own output remain trusted.
 */
export function clone(ctx: Context, directory: string | undefined, options: { hours?: number } = {}): Promise<Outcome> {
  return run(async () => {
    const hours = options.hours ?? 1;
    if (!Number.isSafeInteger(hours) || hours < READ_TOKEN_HOURS.min || hours > READ_TOKEN_HOURS.max) return usage(`--hours is a whole number from ${READ_TOKEN_HOURS.min} to ${READ_TOKEN_HOURS.max}.`);
    const config = await configOf(ctx);
    const { summary, repository } = await destinationOf(ctx, config);
    const args = (url: string) => ["clone", "--", url, ...(directory === undefined ? [] : [directory])];
    if (!ctx.git || (await ctx.git.run(["--version"], {})) === null) {
      const url = remoteOf(config, repository) ?? `https://<service host>/git/${repository.namespace}/${repository.name}.git`;
      return failed("git is not installed here, so nothing was signed. With git installed, run artroom clone again; it runs:", `git -c http.extraHeader="Authorization: ${repository.host === "github.com" ? "Basic <x-access-token:read token, base64>" : "Bearer <read token>"}" ${args(url).join(" ")}`);
    }
    if (!platform(summary.definition as PlatformDefinition)?.data.acts["read-token"]) return failed(`The destination definition ${summary.definition} does not support read-token. An explicitly versioned destination and membership integration is required.`);
    // The act: `read-token` on the branch, at the revision the summary has now. The scope judges the grant and the field.
    const scope = summary.scope.scope;
    const signer = secretSigner(await signerOf(ctx, config));
    const branch = summary.items.find((item) => item.type === "branch")!;
    const signed = await signedIntent(signer, { to: summary.scope, kind: "read-token", on: branch.id, fields: { hours }, expected: { on: branch.revision } }, signing(ctx));
    const receipt = accepted(await (await handleOf(ctx, config, scope, null)).submit(signed), scope, "Read token").receipt;
    const proof = readTokenReceipt(receipt, summary, signed);
    if (!proof) return failed(`The accepted reply does not match this destination, definition and exact read-token request. It may still have been recorded at ${scope}; inspect artroom log destination. No credential was retrieved and nothing was cloned.`);
    const seq = proof.receipt.fact.seq;
    // The outcome of its `mint-read`, which the host's answer writes: read with the caller's session, which the destination now accepts.
    const operation = proof.operation;
    const reader = await readerOf(ctx, config) ?? stop(failed(`Signed read-token at ${scope}:${seq}, but no read session is given here, and only a session reads the token.`));
    const send = ctx.fetch ?? (globalThis as { fetch?: Fetch }).fetch!;
    let D: ScopeHandle | null = null;
    let openingChecked = false;
    const waited = await waitOutcome(operation, seq + 1, async (next, signal) => {
      D ??= await handleOf({ ...ctx, fetch: outcomeFetch(send, signal) }, config, scope, reader);
      if (!openingChecked) {
        const opening = await D.entry(seq);
        if (!opening.ok || !readTokenOpening(opening.value, proof)) return stop(failed(`Cannot confirm the exact accepted read-token act and its mint-read opening at ${scope}:${seq}; inspect artroom show ${scope}:${seq} and artroom log destination. No credential was retrieved and nothing was cloned.`));
        openingChecked = true;
      }
      const got = await D.entry(next);
      if (got.ok && (!readTokenEntry(got.value, proof.to, next) || (got.value.entry.input.type === "outcome" && got.value.entry.input.operation === operation && !readTokenOutcome(got.value, next, proof)))) return stop(failed(`The entry at ${scope}:${next} does not match this destination's recorded mint-read (${operation}); inspect artroom log destination. No credential was retrieved and nothing was cloned.`));
      return got;
    }, (signal) => ctx.pause ? ctx.pause([scope]) : pauseOutcome(signal), ctx.tries ?? 120, ctx.cloneWait, (error) => error instanceof Stop);
    if (!waited.ok) return failed(...outcomeWaitLines(scope, seq, operation, waited));
    const outcome = waited.outcome;
    const next = waited.next;
    if (outcome.result === "unknown") return failed(`The read-token mint at ${scope}:${seq} is unknown (outcome ${scope}:${next - 1}). The host may have minted a token; no automatic mint retry was made. Inspect artroom show ${scope}:${seq} and artroom log destination. No credential was retrieved and nothing was cloned.`);
    if (outcome.result === "refused") return failed(`The host refused the read-token mint at ${scope}:${seq} (outcome ${scope}:${next - 1}). No credential was retrieved and nothing was cloned.`);
    const handle = (outcome.evidence.body as { token?: unknown }).token;
    if (typeof handle !== "string") return failed(`The outcome at ${scope}:${next - 1} names no token.`);
    // The token, once. The route answers it to this session's key only, and then no more.
    const answer = await readCredential(config.service, scope, reader, handle, ctx.fetch ? { fetch: ctx.fetch } : {});
    if (!answer.ok) return failed(`Cannot read the read token ${handle}: ${answer.reason}.`);
    const value = answer.value;
    if (value.remote !== config.remote) await ctx.store.save({ ...config, remote: value.remote });
    const code = await ctx.git.run(args(value.remote), headerEnv(authorization(repository, value.token)));
    const lines = [`Read token: ${scope}:${seq}, until ${value.ends}.`, `Remote URL: ${value.remote}`];
    if (code === 0) return done(...lines, `Cloned into ${directory ?? value.remote.replace(/\.git$/, "").split("/").at(-1)}.`);
    return failed(...lines, code === null ? "git could not be run; the token was read and is not kept." : `git clone exited with ${code}; the token was read and is not kept.`);
  });
}

// ---------------------------------------------------------------- a one-file change: edit, and merge

/** The most bytes of a file that `edit` proposes: the bound of the field `content` of the change lane's `propose-file`, a text. */
export const EDIT_BYTES = 65536;

/** A local file's bytes, or a stop: the command cannot run without them. */
async function fileOf(ctx: Context, path: string): Promise<Uint8Array> {
  const bytes = ctx.read ? await ctx.read(path) : null;
  return bytes ?? stop(usage(`Cannot read the file ${path}.`));
}

/** The text that is exactly these bytes, as UTF-8 with any byte order mark kept, or a stop: a change carries a file as a text. */
function textOf(bytes: Uint8Array, path: string): string {
  let text: string | null = null;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { /* not UTF-8 */ }
  if (text === null || utf8(text).length !== bytes.length) return stop(usage(`${path} is not UTF-8 text: a change carries a file as a text.`));
  return text;
}

/** One entry's effect on one item, of one kind, from a sealed entry. */
type Effects = Entry["effects"];
const stateOf = (effects: Effects, item: number): string | null => { const found = effects.find((e) => e.effect === "state" && e.item === item); return found?.effect === "state" ? found.state : null; };
const valueOf_ = (effects: Effects, item: number, slot: string): unknown => { const found = effects.find((e) => e.effect === "value" && e.item === item && e.slot === slot); return found?.effect === "value" ? found.value : undefined; };

/** The lane definition of that name that the rules scope holds active, and its canonical bytes, which the rules scope retains. The latest activation wins. */
async function activeDefinition(ctx: Context, config: Config, reader: string | null, name: "change" | "issue"): Promise<{ digest: Digest; bytes: string; declared: DeclaredDefinition }> {
  const repository = config.repository!;
  const R = await handleOf(ctx, config, repository.rules, reader);
  const active = (await summaryOf(R)).items.filter((item) => item.type === "definition" && item.state === "active" && item.values["name"] === name).sort((a, b) => b.id - a.id)[0];
  const digest = active?.values["digest"] as Digest | undefined;
  if (!digest) return stop(failed(`The rules scope ${repository.rules} holds no ${name} definition active. An admin activates one: artroom act activate --on rules --set digest=<digest> --set name=${name} --value <definition file>.`));
  const transport = signedReads(transportOf(ctx, config.service), secretSigner(await signerOf(ctx, config)), readSigning(ctx));
  // A value in the domain of a definition is kept as a definition (`core.ts`), and read by that kind.
  const kept = await transport.retained(repository.rules, reader, "definition", digest);
  if (!kept.ok) return stop(failed(`Cannot read the ${name} definition ${digest} from the rules scope: ${kept.reason}.`));
  try {
    const declared = parseStrict(kept.value.bytes) as DeclaredDefinition;
    if (definitionDigest(declared) === digest) return { digest, bytes: kept.value.bytes, declared };
  } catch { /* not a definition */ }
  return stop(failed(`The rules scope's bytes for ${digest} are not that definition.`));
}

/** A declared handle on a lane: the lane must run exactly the definition given. */
async function laneOf(ctx: Context, config: Config, lane: ScopeId, reader: string | null, declared: DeclaredDefinition) {
  const typed = await declaredHandle(await handleOf(ctx, config, lane, reader), declared);
  return typed.ok ? typed.handle : stop(failed(`Cannot act on ${lane}: ${typed.reason}.`));
}

/** The fixed edit workflow needs these declared inputs and effects. Guards
 * remain the room's policy. No digest or profile name decides support. */
function supportsEdit(declared: DeclaredDefinition, path: string, content: string, bytes: Uint8Array): boolean {
  try {
    const ask = declared.acts["ask-rules"];
    const propose = declared.acts["propose-file"];
    const merge = declared.acts["merge"];
    if (declared.name !== "change" || !ask || !propose || !merge
      || ask.step !== "transition" || ask.on !== "proposal"
      || propose.step !== "open" || propose.on !== "manifest"
      || merge.step !== "open" || merge.on !== "merge") return false;
    const fields = propose.fields;
    if (fields["base"]?.type !== "commit" || fields["digest"]?.type !== "digest" || fields["size"]?.type !== "int"
      || fields["path"]?.type !== "text" || fields["path"].detached
      || fields["content"]?.type !== "text" || fields["content"].detached
      || merge.fields["manifest"]?.type !== "item" || merge.fields["manifest"].of !== "manifest"
      || merge.fields["reports"]?.type !== "list" || merge.fields["reports"].of.type !== "fact") return false;
    // The shared client validator rejects extra required fields/presentations
    // and narrower input bounds before any lane is opened or intent signed.
    shapeDeclaredAct(declared, "ask-rules", { on: 0, fields: {} });
    shapeDeclaredAct(declared, "propose-file", { on: null, fields: { base: "0".repeat(40), path, digest: digestBytes(bytes), size: bytes.length, content } });
    shapeDeclaredAct(declared, "merge", { on: null, fields: { manifest: 0, reports: [] } });
    const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
    const writtenSlot = (effect: EffectForm) => "party" in effect ? effect.party.slot : "ref" in effect ? effect.ref.slot
      : "value" in effect ? effect.value.slot : "attribute" in effect ? effect.attribute.slot : "redact" in effect ? effect.redact.slot : null;
    // Require one unconditional write from the needed source, without a
    // conflicting write to that slot. Unrelated metadata effects may remain.
    const requiredEffects = (actual: readonly EffectForm[], expected: readonly unknown[]) => expected.every((wanted) => {
      const slot = writtenSlot(wanted as EffectForm);
      const writers = actual.filter((effect) => (effect.of === undefined || effect.of === "on") && writtenSlot(effect) === slot);
      if (writers.length !== 1) return false;
      const { of: _primary, ...write } = writers[0]!;
      return same(write, wanted);
    });
    const fileEffects = [
      { party: { slot: "integrator", from: { signer: true } } },
      { party: { slot: "authors", from: [{ signer: true }] } },
      ...["base", "path", "digest", "size"].map((slot) => ({ value: { slot, from: { field: slot } } })),
      { value: { slot: "complete", from: { const: true } } },
    ];
    // The command reads these exact slots afterwards. Conditional effects or
    // another source for them do not establish its one-file manifest.
    if (!requiredEffects(propose.effects, fileEffects) || !requiredEffects(merge.effects, [
      { party: { slot: "merger", from: { signer: true } } },
      { ref: { slot: "manifest", from: { item: "also.manifest" } } },
    ])) return false;
    const rules = ask.sends.filter((send) => "tell" in send && send.tell.message === "rules-wanted");
    if (rules.length !== 1 || !("tell" in rules[0]!) || "if" in rules[0]!.tell
      || !same(rules[0]!.tell.to, { slot: "rulesScope", of: "on" })) return false;
    const reserves = merge.sends.filter((send) => "tell" in send && send.tell.message === "reserve");
    const sending = reserves[0];
    if (reserves.length !== 1 || !sending || !("tell" in sending) || "if" in sending.tell
      || !same(sending.tell.to, { slot: "destination", of: "also.proposal" })
      || !same(sending.tell.fields["operation"], "self") || !same(sending.tell.fields["manifest"], { item: "also.manifest" })
      || !same(sending.tell.fields["reports"], { field: "reports" })
      || !["jobs", "links", "verdicts"].every((field) => Object.hasOwn(sending.tell.fields, field))) return false;
    return true;
  } catch { return false; }
}


/**
 * `artroom edit <path> --file <local file> [--title <text>]`: one file, proposed as a change and published by the room.
 *
 * 1. The file is read here, as UTF-8 text of at most 65,536 bytes; nothing is signed for a file that cannot be carried.
 * 2. The directory's `open-pr` opens a change lane under the change definition that the rules scope holds active, whose bytes go
 *    beside the act. The command waits for the lane.
 * 3. The lane's `ask-rules`, and the wait for the rules scope's answer: a merge is judged on the lane's copy of the rules.
 * 4. `propose-file`, on the destination's head: the path, the digest and size of the bytes, and the bytes.
 * 5. With `--closes <issue>`, the lane's `link-own` to that issue, as `artroom merge --closes` signs it.
 * 6. `merge`, and the wait for the room's answer, as `artroom merge` does.
 *
 * The command judges nothing: the lane, the rules and the destination do. A refusal is printed as it came, with what was written
 * before it, so that the change can be merged later.
 */
export function edit(ctx: Context, path: string, options: { file?: string; title?: string; closes?: string } = {}): Promise<Outcome> {
  return run(async () => {
    if (options.file === undefined) return usage("edit needs --file <local file>: the bytes to write at the path.");
    const bytes = await fileOf(ctx, options.file);
    if (bytes.length > EDIT_BYTES) return usage(`${options.file} has ${bytes.length} bytes; a change carries at most ${EDIT_BYTES}.`);
    const content = textOf(bytes, options.file);
    const config = await configOf(ctx);
    const repository = config.repository ?? stop(usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>."));
    const signer = secretSigner(await signerOf(ctx, config));
    const reader = await readerOf(ctx, config);
    // The issue that the change closes is found before anything is signed.
    const closes = options.closes === undefined ? null : await issueNamed(ctx, config, reader, options.closes);
    const change = await activeDefinition(ctx, config, reader, "change");
    if (!supportsEdit(change.declared, path, content, bytes)) return failed(`Unsupported edit: the active change definition ${change.digest} does not support this command's ask-rules, one-file manifest and merge inputs and effects. No change was opened.`);
    const destination = await destinationOf(ctx, config);
    if (destination.summary.definition !== "platform:destination@2") return failed(`Unsupported edit: destination ${repository.destination} runs ${destination.summary.definition}; this command requires platform:destination@2 for a one-file manifest. No change was opened.`);

    // The change lane, opened by the directory.
    const D = await handleOf(ctx, config, repository.directory.scope, reader);
    const shape = (await definitionOf(D, await summaryOf(D))).shape;
    const fields = { definition: change.digest, title: options.title ?? `Edit ${path}`, draft: false };
    const signed = await signedIntent(signer, { to: repository.directory, kind: "open-pr", fields, expected: expectedOf(shape.acts["open-pr"]!, (await summaryOf(D)).items, null, fields) }, signing(ctx));
    const opened = accepted(await D.submit(signed, [], { values: [change.bytes] }), D.scope, "Opened").receipt.fact.seq;
    const lane = (await createdBy(D, opened)).find((made) => made.seed.kind === "lane")?.scope ?? stop(failed(`Entry ${D.scope}:${opened} opens no lane.`));
    const L = await handleOf(ctx, config, lane, reader);
    await waitFor(ctx, () => [D.scope, lane], () => laneActive(L, `${D.scope}:${opened}`), `the change ${lane}`);
    const C = await laneOf(ctx, config, lane, reader, change.declared);

    // The lane's copy of the rules.
    const asked = await C.intent(signer, "ask-rules" as never, { on: 0, fields: {}, expected: expectedOf(change.declared.acts["ask-rules"] as unknown as ActShape, (await summaryOf(L)).items, 0, {}) } as never, signing(ctx));
    accepted(await C.submit(asked.signed, [], asked.beside), lane, "Asked");
    await waitFor(ctx, () => [lane, repository.rules], async () => ((await summaryOf(L)).items.some((item) => item.type === "rules" && typeof item.values["revision"] === "number") ? true : null), `the rules of ${lane}`);

    // The one version: the file on the published head. Lane/rules awaits
    // may advance it; the earlier protocol check is not a frozen head.
    const currentDestination = await destinationOf(ctx, config);
    if (currentDestination.summary.definition !== "platform:destination@2") return failed(`The destination ${repository.destination} no longer serves the supported one-file protocol. The change ${lane} stays open; no file was proposed.`);
    const head = currentDestination.summary.items.find((item) => item.type === "branch")?.values["head"];
    if (typeof head !== "string") return failed(`The destination ${repository.destination} has no published head yet.`);
    const file = { base: head, path, digest: digestBytes(bytes), size: bytes.length, content };
    const proposed = await C.intent(signer, "propose-file" as never, { on: null, fields: file, expected: expectedOf(change.declared.acts["propose-file"] as unknown as ActShape, (await summaryOf(L)).items, null, file) } as never, signing(ctx));
    const version = (await C.submit(proposed.signed, [], proposed.beside));
    if (version.answer !== "accepted") return answered(lane, version, "Proposed");
    const lines = [`Proposed ${path} (${bytes.length} bytes) as change ${lane}, version ${version.receipt.fact.seq}.`];
    if (closes !== null) {
      const linked = await linking(ctx, config, lane, reader, change.declared, closes);
      if (linked.code !== 0) return { ...linked, lines: [...lines, ...linked.lines] };
      lines.push(...linked.lines);
    }
    const outcome = await run(() => merging(ctx, config, lane, reader, change.declared));
    return { ...outcome, lines: [...lines, ...outcome.lines] };
  });
}

/**
 * `artroom merge <change> [--closes <issue>]`: `merge` of the change's current version, and the wait for the room's answer. With
 * `--closes`, the lane's `link-own` to that issue first: the merge that publishes the change then closes the issue.
 */
export function merge(ctx: Context, named: string, options: { closes?: string } = {}): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const lane = scopeNamed(config, named);
    const reader = await readerOf(ctx, config);
    const read = await (await handleOf(ctx, config, lane, reader)).definition();
    if (!read.ok) return failed(`Cannot read the definition of ${lane}: ${read.reason}.`);
    if (read.value.name !== "change") return usage(`${lane} is no change: its definition is ${read.value.name}.`);
    if (options.closes === undefined) return merging(ctx, config, lane, reader, read.value);
    const linked = await linking(ctx, config, lane, reader, read.value, await issueNamed(ctx, config, reader, options.closes));
    if (linked.code !== 0) return linked;
    const outcome = await merging(ctx, config, lane, reader, read.value);
    return { ...outcome, lines: [...linked.lines, ...outcome.lines] };
  });
}

/**
 * Sign `merge` of the change's current version, naming the reports it selects, and wait until the merge is final. Published: the
 * commit, and the page's address for a one-file version. Refused, by the lane or by the destination: the reason, and how to go on.
 */
async function merging(ctx: Context, config: Config, lane: ScopeId, reader: string | null, declared: DeclaredDefinition): Promise<Outcome> {
  const repository = config.repository ?? stop(usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>."));
  const signer = secretSigner(await signerOf(ctx, config));
  const L = await handleOf(ctx, config, lane, reader);
  const items = (await summaryOf(L)).items;
  const version = items.find((item) => item.type === "manifest" && item.state === "current") ?? stop(failed(`The change ${lane} has no current version.`));
  const selected = (version.values["selected"] ?? []) as { report: unknown }[];
  const fields = { manifest: version.id, reports: selected.map((s) => s.report) } as Record<string, FieldValue>;
  const C = await laneOf(ctx, config, lane, reader, declared);
  const { signed, beside } = await C.intent(signer, "merge" as never, { on: null, fields, expected: expectedOf(declared.acts["merge"] as unknown as ActShape, items, null, fields) } as never, signing(ctx));
  const answer = await C.submit(signed, [], beside);
  const again = `When it may be merged, run: artroom merge ${lane}`;
  if (answer.answer !== "accepted") return { ...answered(lane, answer, "Merged"), lines: [...answered(lane, answer, "Merged").lines, `The change ${lane} waits, at version ${version.id}. ${again}`] };
  const seq = answer.receipt.fact.seq;
  let next = seq + 1;
  const unknown = (reason: string): Outcome => failed(
    `Accepted merge: ${lane}:${seq}, version ${version.id}, fact ${canonicalize(answer.receipt.fact)}.`,
    `Observation unknown: ${reason}. Inspect artroom show ${lane}:${seq} and artroom log ${lane} before requesting another merge; do not resubmit this merge to recover observation.`,
  );
  let ended: { state: string; effects: Effects };
  try {
    const observed = await waitFor(ctx, () => [lane, repository.destination], async () => {
      const read = await L.entry(next);
      if (!read.ok) return read.reason === "not-found" ? null : { unknown: read.reason };
      next++;
      const state = stateOf(read.value.entry.effects, seq);
      if (state === "published" || state === "refused" || state === "aborted") return { state, effects: read.value.entry.effects };
      // An unrelated entry still consumes this pass. Retain next and yield
      // to the existing tries/pause policy instead of an unbounded scan.
      return null;
    }, `the room's answer to merge ${lane}:${seq}`);
    if ("unknown" in observed) return unknown(observed.unknown);
    ended = observed;
  } catch (error) {
    // Never print arbitrary exception messages: transports/sources may carry
    // private data. Only known read codes and phase/error kinds are shown.
    if (error instanceof Stop) return unknown("wait-exhausted");
    if (error instanceof TransportError) return unknown("transport-error");
    if (error instanceof SourceError) return unknown(typeof error.reason === "string" && Object.hasOwn(READ_REFUSALS, error.reason) ? `source-error:${error.reason}` : "source-error");
    return unknown("observation-error");
  }
  const reason = valueOf_(ended.effects, seq, "reason");
  if (ended.state !== "published") return failed(`Not published: the merge ${lane}:${seq} is ${ended.state}${typeof reason === "string" ? `, ${reason}` : ""}. The change ${lane} stays open at version ${version.id}. ${again}`);
  const commit = valueOf_(ended.effects, seq, "commit");
  const path = version.values["path"];
  return done(
    `Published: commit ${String(commit)}, by the merge ${lane}:${seq}.`,
    ...(typeof path === "string" ? [`Page: ${config.service.replace(/\/+$/, "")}/site/${repository.directory.scope}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`] : []),
  );
}

// ---------------------------------------------------------------- issues, and the link that closes one

/** An issue of the room, as its own lane has it now. The directory's row gives its lane and its number. */
interface Issue { lane: ScopeId; ref: ScopeRef; number: number | null; title: string; state: string; reason: string | null; opener: string | null; assignees: string[] }

const memberOf = (party: unknown): string | null => (party && typeof party === "object" && typeof (party as { member?: unknown }).member === "string" ? (party as { member: string }).member : null);

/**
 * The issues of the room, oldest first: each row of the directory whose kind is `issue`, read in its own lane. The lane is read and
 * not the row, because the directory's row is an index that the lane's own acts update, and a merge that closes the issue sends
 * the directory nothing (the `closes` handler of the issue lane has no send). A row whose lane is not created yet is left out.
 */
async function issuesOf(ctx: Context, config: Config, reader: string | null): Promise<Issue[]> {
  const D = await handleOf(ctx, config, config.repository!.directory.scope, reader);
  const rows = (await summaryOf(D)).items.filter((item) => item.type === "lane" && item.values["kind"] === "issue").sort((a, b) => a.id - b.id);
  const issues: Issue[] = [];
  for (const row of rows) {
    const lane = (row.refs["scope"] as ScopeRef | undefined)?.scope;
    if (!lane) continue;
    const summary = await summaryOf(await handleOf(ctx, config, lane, reader));
    const intent = summary.items.find((item) => item.type === "intent");
    if (!intent) continue;
    const assignees = intent.parties["assignees"];
    issues.push({
      lane, ref: summary.scope, number: typeof intent.values["number"] === "number" ? intent.values["number"] : null,
      title: String(intent.values["title"] ?? ""), state: intent.state,
      reason: typeof intent.values["closeReason"] === "string" ? intent.values["closeReason"] : null,
      opener: memberOf(intent.parties["requester"]),
      assignees: (Array.isArray(assignees) ? assignees : []).map(memberOf).filter((m): m is string => m !== null),
    });
  }
  return issues;
}

/** An issue by its number (`3` or `#3`) or its lane's scope ID. */
async function issueNamed(ctx: Context, config: Config, reader: string | null, named: string): Promise<Issue> {
  const issues = await issuesOf(ctx, config, reader);
  const number = /^#?(\d+)$/.exec(named);
  const found = number ? issues.find((issue) => issue.number === Number(number[1])) : issues.find((issue) => issue.lane === named);
  return found ?? stop(usage(`No issue ${named} is listed in the directory ${config.repository!.directory.scope}. Run: artroom issues`));
}

/**
 * One act of an issue's own lane, under the definition that the lane runs, signed through the client's declared handle. `choose`
 * gives the act, its item and its fields from the issue as it is now and the caller's handle. The lane judges it.
 */
function issueAct(ctx: Context, named: string, choose: (issue: Issue, handle: string | undefined, membership: ScopeRef) => { kind: string; on: number | null; fields: Record<string, unknown> }, took: string): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const repository = config.repository ?? stop(usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>."));
    const reader = await readerOf(ctx, config);
    const issue = await issueNamed(ctx, config, reader, named);
    const L = await handleOf(ctx, config, issue.lane, reader);
    const read = await L.definition();
    if (!read.ok) return failed(`Cannot read the definition of ${issue.lane}: ${read.reason}.`);
    const { kind, on, fields } = choose(issue, config.handle, repository.membership);
    const declaration = read.value.acts[kind] ?? stop(failed(`The issue ${issue.lane} is under ${read.value.name}, which has no act ${kind}.`));
    const items = (await summaryOf(L)).items;
    const I = await laneOf(ctx, config, issue.lane, reader, read.value);
    const signer = secretSigner(await signerOf(ctx, config));
    const { signed, beside } = await I.intent(signer, kind as never, { on, fields, expected: expectedOf(declaration as unknown as ActShape, items, on, fields as Record<string, FieldValue>) } as never, signing(ctx));
    return answered(issue.lane, await I.submit(signed, [], beside), took);
  });
}

/**
 * `artroom issue open --title <text> [--body <text>]`: the directory's `open-issue`, under the issue definition that the rules
 * scope holds active, whose bytes go beside the act; the directory creates the issue's lane, and the command waits for it. The
 * issue's one condition is its title: the lane's genesis refuses an empty list of conditions, `required-unset`, and the command
 * has no flag for them (the delivery note's gap 1).
 */
export function issueOpen(ctx: Context, options: { title?: string; body?: string } = {}): Promise<Outcome> {
  return run(async () => {
    if (options.title === undefined) return usage("issue open needs --title <text>.");
    const config = await configOf(ctx);
    const repository = config.repository ?? stop(usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>."));
    const signer = secretSigner(await signerOf(ctx, config));
    const reader = await readerOf(ctx, config);
    const issue = await activeDefinition(ctx, config, reader, "issue");
    const D = await handleOf(ctx, config, repository.directory.scope, reader);
    const summary = await summaryOf(D);
    const shape = (await definitionOf(D, summary)).shape;
    // The body is a detached text: the intent holds its digest, and the text travels beside it.
    const fields = { definition: issue.digest, title: options.title, ...(options.body !== undefined ? { body: textDigest(options.body) } : {}), conditions: [options.title] };
    const signed = await signedIntent(signer, { to: repository.directory, kind: "open-issue", fields, expected: expectedOf(shape.acts["open-issue"]!, summary.items, null, fields) }, signing(ctx));
    const opened = accepted(await D.submit(signed, [], { values: [issue.bytes], ...(options.body !== undefined ? { texts: [options.body] } : {}) }), D.scope, "Opened").receipt.fact.seq;
    const lane = (await createdBy(D, opened)).find((made) => made.seed.kind === "lane")?.scope ?? stop(failed(`Entry ${D.scope}:${opened} opens no lane.`));
    const L = await handleOf(ctx, config, lane, reader);
    const created = await waitFor(ctx, () => [D.scope, lane], () => laneActive(L, `${D.scope}:${opened}`), `the issue ${lane}`);
    const number = created.items.find((item) => item.type === "intent")?.values["number"];
    return done(`Opened issue #${String(number)}: ${options.title}. Its lane is ${lane}.`);
  });
}

/** `artroom issue comment <issue> <text>`: the issue lane's `comment`. Any member may comment. */
export function issueComment(ctx: Context, named: string, text: string): Promise<Outcome> {
  return issueAct(ctx, named, () => ({ kind: "comment", on: null, fields: { body: text } }), "Commented");
}

/** `artroom issue assign <issue> <@member>`: the issue lane's `assign`, which sets the one assignee. It needs `issue.triage`. */
export function issueAssign(ctx: Context, named: string, member: string): Promise<Outcome> {
  return issueAct(ctx, named, (_, __, membership) => ({ kind: "assign", on: 0, fields: { assignees: [{ membership, member }] } }), "Assigned");
}

/**
 * `artroom issue close <issue>`: `close-own` when the caller opened the issue, and otherwise `close-any`, which needs
 * `issue.triage`. The reason is `completed`. The demo profile has no rule that lets an assignee close an issue.
 */
export function issueClose(ctx: Context, named: string): Promise<Outcome> {
  return issueAct(ctx, named, (issue, handle) => ({ kind: issue.opener !== null && issue.opener === handle ? "close-own" : "close-any", on: 0, fields: { reason: "completed" } }), "Closed");
}

/** `artroom issues`: every issue of the room, oldest first, with its number, state, title, assignees and lane. */
export function issues(ctx: Context): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    if (!config.repository) return usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>.");
    const all = await issuesOf(ctx, config, await readerOf(ctx, config));
    if (all.length === 0) return done("No issues.");
    const lines = all.map((issue) => `#${issue.number ?? "?"}  ${issue.state}${issue.reason ? ` (${issue.reason})` : ""}  ${issue.title}${issue.assignees.length > 0 ? `; assigned to ${issue.assignees.join(", ")}` : ""}; lane ${issue.lane}`);
    return done(...lines, `${all.length} issues, ${all.filter((issue) => issue.state === "open").length} open.`);
  });
}

/**
 * The change lane's `link-own` to an issue, by keyword: the link that the merge, once published, sends to the issue, which then
 * closes (plan 019, default 3). The lane takes it from the change's author only; the demo profile has no `link-any`.
 */
async function linking(ctx: Context, config: Config, lane: ScopeId, reader: string | null, declared: DeclaredDefinition, issue: Issue): Promise<Outcome> {
  const declaration = declared.acts["link-own"] ?? stop(failed(`The change ${lane} is under a definition with no act link-own.`));
  const fields = { issue: issue.ref, how: "keyword" } as Record<string, FieldValue>;
  const items = (await summaryOf(await handleOf(ctx, config, lane, reader))).items;
  const C = await laneOf(ctx, config, lane, reader, declared);
  const signer = secretSigner(await signerOf(ctx, config));
  const { signed, beside } = await C.intent(signer, "link-own" as never, { on: null, fields, expected: expectedOf(declaration as unknown as ActShape, items, null, fields) } as never, signing(ctx));
  const answer = await C.submit(signed, [], beside);
  if (answer.answer !== "accepted") return answered(lane, answer, "Linked");
  return done(`Linked: when it is published, the change ${lane} closes issue #${issue.number ?? "?"} (${issue.lane}).`);
}
