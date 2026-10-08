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
 * | `verify` | The replay verifier over the read routes: with the caller's session, and by signed reads where the session is refused. |
 * | `remote` | The repository's host, namespace, name and remote URL, from the destination's branch item. |
 * | `clone` | Signs the destination's `read-token`, waits for its outcome, reads the read token once, and runs `git clone` with it in an `Authorization` header that git reads from its environment. The token is never an argument and never printed. |
 * | `edit` | Opens a change through the directory under the change definition that the rules scope holds active, proposes one file as its only version (`propose-file`), and merges it as `merge` does. The room, not the person, writes the repository. |
 * | `merge` | Signs `merge` of a change's current version, and waits until the room has published it or refused it. |
 */

import { PROPOSED_BOUNDS, type Answer, type DeclaredDefinition, type Digest, type Entry, type FieldValue, type Founded, type Item, type KeyId, type OperationId, type PlatformDefinition, type ScopeId, type Seed, type SignedIntent, type Summary } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, definitionDigest, digestBytes, intentDigest, isScopeId, isSignedIntentShape, keyIdOfSecret, parseStrict, scopeIdOf, textDigest, timeMs, timeOf, unb64url, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import {
  ScopeHandle, TransportError, declaredHandle, found, httpTransport, requestSession, secretSigner, sessionRequest, signedIntent, signedLogReader, signedReads,
  type Fetch, type ReadSigning, type Signing, type Transport,
} from "@generalbusiness/artroom-client";
import { DIRECTORY_OF, MEMBERSHIP, READ_TOKEN_HOURS, REGISTER, ROLE_LISTS, isOf, platform, type Role } from "@generalbusiness/artroom-platform";
import { SourceError, httpSource, render, verify as replay, type HistorySource } from "@generalbusiness/artroom-replay";
import type { Config, PlannedInstall, Repository, Store } from "./store.ts";

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
  /** The `git` program, for `clone`. `main.ts` gives Node's (`git.ts`); a test gives a stand-in. Absent: there is none. */
  git?: Git;
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

/** Local recovery identity only. The signature and server decide authority. */
const installAttemptOf = (plan: PlannedInstall): Digest => textDigest(canonicalize({
  service: plan.service, operator: plan.founding.intent.actor, founding: plan.founding, definition: plan.definition, register: plan.register,
}));

/**
 * `artroom install --plan <base-url>`: sign the `install` intent and print the ID of the register that it will found, and found
 * nothing. The intent lives as long as an intent may, so it can be founded until its `notAfter`, the time printed. The plan is
 * kept in the config, so that the operator can pin that ID in the Worker's host setting before the register exists, and then
 * run `install --planned`. A later plan replaces only a never-attempted plan.
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
 * a supported pinned version. A marker is saved before possible submission.
 * A never-attempted expired plan sends nothing; an attempted exact replay
 * leaves expiry and identity to the server. The full receipt/genesis is
 * checked before the plan is replaced by installed configuration.
 */
export function installPlanned(ctx: Context): Promise<Outcome> {
  return run(async () => {
    const before = await ctx.store.config();
    if (before?.register) return usage(`This config directory has a register already: ${before.register.scope}.`);
    const plan = before?.plan ?? stop(usage("No install is planned here. Run: artroom install --plan <base-url>."));
    const operator = await ctx.store.secret("operator");
    const now = ctx.now?.() ?? Date.now();
    if (!isOf(plan.definition, "platform:register") || platform(plan.definition) === null) return failed("Unsupported install provenance: this command cannot serve the plan's exact pinned register version. The pending plan is kept; nothing was sent.");
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
    // The durable marker must precede the first possible request. An exact
    // attempted replay may recover an accepted genesis after expiry; the
    // server still refuses an expired founding that was never accepted.
    if (plan.attempted === undefined) await ctx.store.save({ ...before!, plan: { ...plan, attempted: attempt } });
    const { answer } = await found(transportOf(ctx, plan.service), plan.founding, plan.definition);
    const receipt = accepted(answer, null, "Installed").receipt;
    if (receipt.fact.at.scope !== plan.register) return failed(`The register founded is ${receipt.fact.at.scope}, not the planned ${plan.register}. The plan is kept; report this.`);
    const handle = new ScopeHandle(signedReads(transportOf(ctx, plan.service), secretSigner(operator!), readSigning(ctx)), plan.register, null);
    const followed = await handle.followReceipt(receipt);
    if (!followed.ok || followed.entry.seq !== 0 || followed.entry.at.kind !== "register" || followed.entry.input.type !== "genesis"
      || followed.entry.input.seed.definition !== plan.definition || followed.entry.input.decision !== "applied"
      || canonicalize(followed.entry.input.founding) !== canonicalize(plan.founding)) {
      return failed("The install receipt does not prove the planned register's exact founding. The plan is kept; report this.");
    }
    await ctx.store.save({ v: 1, service: plan.service, key: before!.key, register: receipt.fact.at });
    return done(`Installed: register ${receipt.fact.at.scope}, under ${plan.definition}, as planned.`, `The operator key ${plan.founding.intent.actor} is kept in the config directory, readable only by you. It is the one founder key.`);
  });
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
 * **Resume.** Before it submits the `found`, the command saves the signed
 * intent's digest, the register and the handle in the config as a pending
 * claim. A refusal or an unavailable answer wrote nothing, and removes it.
 * If the command gives up waiting, the claim stays pending, and the next
 * `claim` submits nothing: it reads the register once, which is the first
 * call that a register restarted since the claim gets, and goes on waiting
 * for the directory whose seed that digest gives. Only `--again` signs a
 * second `found`, which creates a second repository. The config holds no
 * secret.
 */
export function claim(ctx: Context, name: string, options: { handle?: string; branch?: string; again?: boolean } = {}): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const register = config.register ?? stop(usage("No register is known here. Run: artroom install <base-url>."));
    if (config.repository) return usage(`A repository is claimed here already: directory ${config.repository.directory.scope}.`);
    const secret = await signerOf(ctx, config);
    const signer = secretSigner(secret);
    const R = await handleOf(ctx, config, register.scope, null);
    const pending = config.claim?.register === register.scope && !options.again ? config.claim : null;
    // The register's version, which its genesis pinned: it decides the directory's version, and so the versions of the room.
    const registered = await summaryOf(R);
    const directoryDefinition = DIRECTORY_OF[registered.definition] ?? stop(failed(`The register ${register.scope} is under ${registered.definition}, which this command does not know.`));
    let cause: Digest;
    let handle: string;
    if (pending) {
      // Nothing is signed. The read above was the first call: a register that restarted sends what it recorded at that call.
      [cause, handle] = [pending.intent, pending.handle];
    } else {
      const recovery = keyIdOfSecret(await keyOf(ctx, "recovery"));
      handle = options.handle ?? "@founder";
      const shape = platform(registered.definition)!.data as unknown as DefinitionShape;
      const fields = { branch: options.branch ?? "main", founderHandle: handle, recoveryKey: recovery };
      const signed = await signedIntent(signer, { to: register, kind: "found", fields, expected: expectedOf(shape.acts["found"]!, registered.items, null, fields) }, signing(ctx));
      cause = intentDigest(signed.intent);
      const { claim: _, ...without } = config;
      await ctx.store.save({ ...without, claim: { register: register.scope, intent: cause, handle } });
      try {
        accepted(await R.submit(signed), register.scope, "Claimed");
      } catch (error) {
        // A refusal or an unavailable answer wrote nothing: no claim is pending. A lost reply may have been recorded, and stays pending.
        if (error instanceof Stop) await ctx.store.save(without);
        throw error;
      }
    }
    const resume = `run artroom claim ${name} again to go on waiting for this claim, or with --again to sign a new one, which creates a second repository.`;

    // The register's rule fixes the directory's seed from the claim's own intent (`directorySeed`).
    const seed: Seed = { v: 1, kind: "directory", definition: directoryDefinition, creator: register, cause, ordinal: 0 };
    const D = await handleOf(ctx, config, scopeIdOf(seed), null);
    const children: ScopeId[] = [];
    const directory = await waitFor(ctx, () => [register.scope, D.scope, ...children], () => active(D), "the directory", resume);
    const made = await createdBy(D, 0);
    const kind = (k: string) => made.find((m) => m.seed.kind === k)?.scope ?? stop(failed(`The directory's genesis creates no ${k}.`));
    children.push(kind("membership"), kind("rules"), kind("destination"));
    const [membership, rules, destination] = await Promise.all(children.map((scope) => handleOf(ctx, config, scope, null)));
    const summaries = await waitFor(ctx, () => [register.scope, D.scope, ...children], async () => {
      const all = await Promise.all([membership!, rules!, destination!].map(active));
      return all.every((s) => s !== null) ? (all as Summary[]) : null;
    }, "membership, the rules scope and the destination", resume);
    const repository: Repository = { directory: directory.scope, membership: summaries[0]!.scope, rules: rules!.scope, destination: destination!.scope };

    // The founder's seat and first key (`founding-key`): the first admin of the repository.
    const M = membership!;
    const mShape = platform(summaries[0]!.definition)!.data as unknown as DefinitionShape;
    const seat = accepted(await M.submit(await signedIntent(signer, { to: repository.membership, kind: "seat", expected: expectedOf(mShape.acts["seat"]!, (await summaryOf(M)).items, null, {}) }, signing(ctx))), M.scope, "Seated").receipt.fact.seq;
    const keyFields = { member: seat };
    accepted(await M.submit(await signedIntent(signer, { to: repository.membership, kind: "first-key", fields: keyFields, expected: expectedOf(mShape.acts["first-key"]!, (await summaryOf(M)).items, null, keyFields) }, signing(ctx))), M.scope, "First key");
    const inbox = (await createdBy(M, seat)).find((m) => m.seed.kind === "inbox")?.scope;
    if (inbox) {
      const I = await handleOf(ctx, config, inbox, null);
      await waitFor(ctx, () => [M.scope, inbox], () => active(I), "the founder's inbox");
      repository.inbox = inbox;
    }
    const { claim: _, ...rest } = config;
    await ctx.store.save({ ...rest, repository, handle });
    return done(
      `Claimed ${name}: directory ${repository.directory.scope}, membership ${repository.membership.scope}, rules ${repository.rules}, destination ${repository.destination}; each created and confirmed.`,
      `Definitions: ${directoryDefinition}, ${summaries.map((summary) => summary.definition).join(", ")}.`,
      `You are ${handle}, an admin, on key ${signer.key}${inbox ? `; your inbox is ${inbox}` : ""}.`,
    );
  });
}

/** What an invitation link carries. Its secret is the invitation's, which `join` presents once; it is no signing key. */
/** `definition`: the version of membership that the invitation is in. A link made before it was carried names none. */
interface Link { v: 1; service: string; repository: Omit<Repository, "inbox">; invitation: number; secret: string; handle: string; definition?: string }
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
    const link: Link = { v: 1, service: config.service, repository: shared, invitation, secret, handle: member, definition: summary.definition };
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

/** `artroom join <link>`: membership's `join`, signed by a new key kept here. Prints the inbox that membership creates for the member. */
export function join(ctx: Context, text: string): Promise<Outcome> {
  return run(async () => {
    const link = linkOf(text) ?? stop(usage("That is not an invitation link from artroom invite."));
    const before = await ctx.store.config();
    if (before?.repository) return usage(`This config directory has a repository already: directory ${before.repository.directory.scope}.`);
    const secret = await keyOf(ctx, "device");
    const signer = secretSigner(secret);
    const config: Config = { v: 1, service: link.service, key: "device", repository: link.repository };
    const M = await handleOf(ctx, config, link.repository.membership.scope, null);
    // The new key has signed nothing yet, so it reads nothing in membership before the join. The link names membership's version;
    // a link that names none is of the newest. Its `join` names its member by a mark, which has no key in `expected`: no revision is read.
    const shape = (platform(link.definition ?? MEMBERSHIP) ?? stop(failed(`The invitation is in ${link.definition}, which this command does not know.`))).data as unknown as DefinitionShape;
    const fields = { invitation: link.invitation, secret: link.secret };
    const signed = await signedIntent(signer, { to: link.repository.membership, kind: "join", fields, expected: expectedOf(shape.acts["join"]!, [], null, fields) }, signing(ctx));
    const seq = accepted(await M.submit(signed), M.scope, "Joined").receipt.fact.seq;
    const inbox = (await createdBy(M, seq)).find((m) => m.seed.kind === "inbox")?.scope ?? stop(failed(`Joined, but entry ${M.scope}:${seq} creates no inbox.`));
    const I = await handleOf(ctx, config, inbox, null);
    await waitFor(ctx, () => [M.scope, inbox], () => active(I), "your inbox");
    await ctx.store.save({ ...config, repository: { ...link.repository, inbox }, handle: link.handle });
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
  if (!isOf(read.value.definition, "platform:destination")) return stop(failed(`${scope} is no destination.`));
  const branch = read.value.items.find((item) => item.type === "branch");
  const repository = branch?.values["repository"] as Recorded | undefined;
  if (!branch || !repository || typeof repository.host !== "string" || typeof repository.name !== "string") return stop(failed(`The destination ${scope} records no repository.`));
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

/** The JSON of a reply's body, at most 64 KiB, or null. */
async function bodyOf(body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array | undefined }> } } | null): Promise<unknown> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done: ended, value } = await reader.read();
    if (ended) break;
    if (value) { size += value.length; chunks.push(value); }
    if (size > 65536) return null;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes)); } catch { return null; }
}

/**
 * `artroom clone [directory] [--hours n]`: a clone of the room's repository, with a read token of its own.
 *
 * 1. Without `git` here, it signs nothing: it prints the clone command, with the token's place marked.
 * 2. It signs the destination's `read-token` for `hours` (default 1, from 1 to 24), and waits for the outcome of its `mint-read`.
 * 3. It reads the token once, with the caller's session, from the destination's credential route.
 * 4. It runs `git clone -- <remote> [directory]`, with the header in git's environment configuration. The token is in no
 *    argument, in no line printed, and in no file this command writes; git does not keep it in the clone's config.
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
    // The act: `read-token` on the branch, at the revision the summary has now. The scope judges the grant and the field.
    const scope = summary.scope.scope;
    const signer = secretSigner(await signerOf(ctx, config));
    const branch = summary.items.find((item) => item.type === "branch")!;
    const signed = await signedIntent(signer, { to: summary.scope, kind: "read-token", on: branch.id, fields: { hours }, expected: { on: branch.revision } }, signing(ctx));
    const seq = accepted(await (await handleOf(ctx, config, scope, null)).submit(signed), scope, "Read token").receipt.fact.seq;
    // The outcome of its `mint-read`, which the host's answer writes: read with the caller's session, which the destination now accepts.
    const operation: OperationId = `${seq}:0`;
    const reader = await readerOf(ctx, config) ?? stop(failed(`Signed read-token at ${scope}:${seq}, but no read session is given here, and only a session reads the token.`));
    const D = await handleOf(ctx, config, scope, reader);
    let next = seq + 1;
    const outcome = await waitFor(ctx, () => [scope], async () => {
      for (;;) {
        const read = await D.entry(next);
        if (!read.ok) return read.reason === "not-found" ? null : stop(failed(`Cannot read entry ${scope}:${next}: ${read.reason}.`));
        next++;
        const input = read.value.entry.input;
        if (input.type === "outcome" && input.operation === operation) return input;
      }
    }, `the read token of ${scope}:${seq}`, "the token, if minted, ends at its end unread.");
    if (outcome.result !== "confirmed") return failed(`The host did not mint a read token: the outcome at ${scope}:${next - 1} is ${outcome.result}. Nothing was cloned.`);
    const handle = (outcome.evidence.body as { token?: unknown }).token;
    if (typeof handle !== "string") return failed(`The outcome at ${scope}:${next - 1} names no token.`);
    // The token, once. The route answers it to this session's key only, and then no more.
    const fetch = ctx.fetch ?? (globalThis as { fetch?: Fetch }).fetch!;
    const reply = await fetch(`${config.service.replace(/\/+$/, "")}/v1/scopes/${scope}/credential/${encodeURIComponent(handle)}`, { method: "GET", headers: { authorization: reader } });
    const answer = await bodyOf(reply.body) as { ok?: boolean; reason?: string; value?: { token?: unknown; ends?: unknown; remote?: unknown } } | null;
    const value = answer?.ok === true ? answer.value : undefined;
    if (typeof value?.token !== "string" || typeof value.remote !== "string" || typeof value.ends !== "string") return failed(`Cannot read the read token ${handle}: ${answer?.reason ?? `status ${reply.status}`}.`);
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

/** The change definition that the rules scope holds active, and its canonical bytes, which the rules scope retains. The latest activation wins. */
async function changeDefinition(ctx: Context, config: Config, reader: string | null): Promise<{ digest: Digest; bytes: string; declared: DeclaredDefinition }> {
  const repository = config.repository!;
  const R = await handleOf(ctx, config, repository.rules, reader);
  const active = (await summaryOf(R)).items.filter((item) => item.type === "definition" && item.state === "active" && item.values["name"] === "change").sort((a, b) => b.id - a.id)[0];
  const digest = active?.values["digest"] as Digest | undefined;
  if (!digest) return stop(failed(`The rules scope ${repository.rules} holds no change definition active. An admin activates one: artroom act activate --on rules --set digest=<digest> --set name=change --value <definition file>.`));
  const transport = signedReads(transportOf(ctx, config.service), secretSigner(await signerOf(ctx, config)), readSigning(ctx));
  // A value in the domain of a definition is kept as a definition (`core.ts`), and read by that kind.
  const kept = await transport.retained(repository.rules, reader, "definition", digest);
  if (!kept.ok) return stop(failed(`Cannot read the change definition ${digest} from the rules scope: ${kept.reason}.`));
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

/**
 * `artroom edit <path> --file <local file> [--title <text>]`: one file, proposed as a change and published by the room.
 *
 * 1. The file is read here, as UTF-8 text of at most 65,536 bytes; nothing is signed for a file that cannot be carried.
 * 2. The directory's `open-pr` opens a change lane under the change definition that the rules scope holds active, whose bytes go
 *    beside the act. The command waits for the lane.
 * 3. The lane's `ask-rules`, and the wait for the rules scope's answer: a merge is judged on the lane's copy of the rules.
 * 4. `propose-file`, on the destination's head: the path, the digest and size of the bytes, and the bytes.
 * 5. `merge`, and the wait for the room's answer, as `artroom merge` does.
 *
 * The command judges nothing: the lane, the rules and the destination do. A refusal is printed as it came, with what was written
 * before it, so that the change can be merged later.
 */
export function edit(ctx: Context, path: string, options: { file?: string; title?: string } = {}): Promise<Outcome> {
  return run(async () => {
    if (options.file === undefined) return usage("edit needs --file <local file>: the bytes to write at the path.");
    const bytes = await fileOf(ctx, options.file);
    if (bytes.length > EDIT_BYTES) return usage(`${options.file} has ${bytes.length} bytes; a change carries at most ${EDIT_BYTES}.`);
    const content = textOf(bytes, options.file);
    const config = await configOf(ctx);
    const repository = config.repository ?? stop(usage("No repository is known here. Run: artroom claim <name>, or artroom join <link>."));
    const signer = secretSigner(await signerOf(ctx, config));
    const reader = await readerOf(ctx, config);
    const change = await changeDefinition(ctx, config, reader);

    // The change lane, opened by the directory.
    const D = await handleOf(ctx, config, repository.directory.scope, reader);
    const shape = (await definitionOf(D, await summaryOf(D))).shape;
    const fields = { definition: change.digest, title: options.title ?? `Edit ${path}`, draft: false };
    const signed = await signedIntent(signer, { to: repository.directory, kind: "open-pr", fields, expected: expectedOf(shape.acts["open-pr"]!, (await summaryOf(D)).items, null, fields) }, signing(ctx));
    const opened = accepted(await D.submit(signed, [], { values: [change.bytes] }), D.scope, "Opened").receipt.fact.seq;
    const lane = (await createdBy(D, opened)).find((made) => made.seed.kind === "lane")?.scope ?? stop(failed(`Entry ${D.scope}:${opened} opens no lane.`));
    const L = await handleOf(ctx, config, lane, reader);
    await waitFor(ctx, () => [D.scope, lane], () => active(L), `the change ${lane}`);
    const C = await laneOf(ctx, config, lane, reader, change.declared);

    // The lane's copy of the rules.
    const asked = await C.intent(signer, "ask-rules" as never, { on: 0, fields: {}, expected: expectedOf(change.declared.acts["ask-rules"] as unknown as ActShape, (await summaryOf(L)).items, 0, {}) } as never, signing(ctx));
    accepted(await C.submit(asked.signed, [], asked.beside), lane, "Asked");
    await waitFor(ctx, () => [lane, repository.rules], async () => ((await summaryOf(L)).items.some((item) => item.type === "rules" && typeof item.values["revision"] === "number") ? true : null), `the rules of ${lane}`);

    // The one version: the file on the published head.
    const head = (await destinationOf(ctx, config)).summary.items.find((item) => item.type === "branch")?.values["head"];
    if (typeof head !== "string") return failed(`The destination ${repository.destination} has no published head yet.`);
    const file = { base: head, path, digest: digestBytes(bytes), size: bytes.length, content };
    const proposed = await C.intent(signer, "propose-file" as never, { on: null, fields: file, expected: expectedOf(change.declared.acts["propose-file"] as unknown as ActShape, (await summaryOf(L)).items, null, file) } as never, signing(ctx));
    const version = (await C.submit(proposed.signed, [], proposed.beside));
    if (version.answer !== "accepted") return answered(lane, version, "Proposed");
    const lines = [`Proposed ${path} (${bytes.length} bytes) as change ${lane}, version ${version.receipt.fact.seq}.`];
    const outcome = await merging(ctx, config, lane, reader, change.declared);
    return { ...outcome, lines: [...lines, ...outcome.lines] };
  });
}

/** `artroom merge <change>`: `merge` of the change's current version, and the wait for the room's answer. */
export function merge(ctx: Context, named: string): Promise<Outcome> {
  return run(async () => {
    const config = await configOf(ctx);
    const lane = scopeNamed(config, named);
    const reader = await readerOf(ctx, config);
    const read = await (await handleOf(ctx, config, lane, reader)).definition();
    if (!read.ok) return failed(`Cannot read the definition of ${lane}: ${read.reason}.`);
    if (read.value.name !== "change") return usage(`${lane} is no change: its definition is ${read.value.name}.`);
    return merging(ctx, config, lane, reader, read.value);
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
  const ended = await waitFor(ctx, () => [lane, repository.destination], async () => {
    for (;;) {
      const read = await L.entry(next);
      if (!read.ok) return read.reason === "not-found" ? null : stop(failed(`Cannot read entry ${lane}:${next}: ${read.reason}.`));
      next++;
      const state = stateOf(read.value.entry.effects, seq);
      if (state === "published" || state === "refused" || state === "aborted") return { state, effects: read.value.entry.effects };
    }
  }, `the room's answer to merge ${lane}:${seq}`, `run artroom merge ${lane} again only after artroom log ${lane} shows the merge ${seq} ended.`);
  const reason = valueOf_(ended.effects, seq, "reason");
  if (ended.state !== "published") return failed(`Not published: the merge ${lane}:${seq} is ${ended.state}${typeof reason === "string" ? `, ${reason}` : ""}. The change ${lane} stays open at version ${version.id}. ${again}`);
  const commit = valueOf_(ended.effects, seq, "commit");
  const path = version.values["path"];
  return done(
    `Published: commit ${String(commit)}, by the merge ${lane}:${seq}.`,
    ...(typeof path === "string" ? [`Page: ${config.service.replace(/\/+$/, "")}/site/${repository.directory.scope}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`] : []),
  );
}
