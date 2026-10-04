/**
 * The `artroom` command. `run()` takes the arguments and an `Io`, and
 * returns the exit code, so tests run it in process:
 *
 *   0  done
 *   1  failed: the room could not be reached, a wait ran out, or another error
 *   2  usage: the command line is wrong
 *   3  refused: the room said no; the output gives the rule, reason and fix
 *
 * Every act, login and redemption is written to the journal (config.ts)
 * before it goes out, and removed only when every local step is done. So a
 * command that fails part way is finished by running it again: it repeats
 * the same signed act, the same join, or nothing at all for a one-time
 * redemption, and never rebuilds the request from changed state.
 */

import { rmSync } from "node:fs";
import { dirname } from "node:path";
import type { Readable, Writable } from "node:stream";
import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  agentsMd,
  connect,
  fieldsOf,
  generateSigner,
  governs,
  isArtroomError,
  isRefusal,
  join,
  meaningOf,
  shapeOf,
  targetsOf,
  threadTitle,
  LOST_REDEMPTION,
  newIdempotencyKey,
  redeem,
  signerFromJwk,
  resubmit,
  type ClientActOptions,
  type ClientOptions,
  type HttpRoomClient,
  type PreparedAct,
} from "@generalbusiness/artroom-client";
import { envelopeOf, isActId } from "@generalbusiness/artroom-contract";
import type {
  ActId,
  Binding,
  Catalogue,
  Claim,
  DeclaredRecord,
  DeclaredTarget,
  Held,
  Json,
  HttpRoom,
  LandOp,
  Landing,
  Lane,
  LaneId,
  Note,
  NoteAnchor,
  OpId,
  Proposal,
  Reason,
  RecordMeaning,
  Seq,
  Refusal,
  Release,
  Renewal,
  Result,
  Review,
  RoomId,
  Sha,
} from "@generalbusiness/artroom-contract";
import { SCHEMA, SchemaError, Store, type Config, type JournalEntry, type LocalIntent, type RoomConfig } from "./config.ts";
import { attentionText, claimText, errorText, explainText, landText, logText, proposalText, refusalText, short } from "./format.ts";
import { checkGrant, checkMarker, checkRedeemed, configureWorkspace, credentialFileIn, credentialOwner, gitDir, head as gitHead, readOwner, REMOTE, withDestination, type Party } from "./git.ts";
import { parseInvitation } from "./link.ts";
import { actText, actsText, bodyOf, FieldError, meaningChanges, missing } from "./declared.ts";

export interface Io {
  out(line: string): void;
  err(line: string): void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  /** For tests: the fetch the client uses. */
  readonly fetch?: typeof fetch;
  /** For tests: called after each durable local step, by name. Throwing here simulates an interruption. */
  readonly step?: (name: string) => void;
  /**
   * For tests: how many times the client sends a request again within one
   * run after a retryable failure (`ClientOptions.retries`). Default: the
   * client's own, with its waits between attempts.
   */
  readonly retries?: number;
  /** For tests: the streams `artroom mcp` serves on. Default: this process's stdin and stdout. */
  readonly stdio?: { readonly stdin: Readable; readonly stdout: Writable };
}

export const EXIT = { ok: 0, failed: 1, usage: 2, refused: 3 } as const;

const USAGE = `artroom: work in an Artroom with git.

Joining
  artroom login <invitation-link>       Join with a new key kept on this machine.
  artroom redeem <invitation-link>      Get an MCP token for an agent; the room keeps the key.

Working on a lane
  artroom claim <glob>... --goal TEXT   Claim paths before you change them. [--plan TEXT] [--because REF]
                                        To change or take over a lane: --lane LANE --expect N
  artroom workspace                     Get the lane's git remote, and set up git to push to it.
  artroom propose -m SUMMARY            Propose the pushed HEAD. [--head SHA] [--expect N]
  artroom land [--wait] [--timeout S]   Start landing the latest proposal; --wait waits for the outcome.
  artroom wait [OP] [--timeout S]       Wait for the landing you started (or OP) to finish.
  artroom renew                         Keep the lane: extend the lease.
  artroom release [-m NOTE]             Give the lane up, with a handover note.

Working with others
  artroom note <act|lane#gen:path:line> -m TEXT [--reply-to ACT]
  artroom review <lane#gen> --approve|--object --scope GLOB... -m TEXT [--depends-on GLOB]...
  artroom attention [--cursor C] [--all]    What needs you.
  artroom explain <act>                     Why an act was accepted or refused.
  artroom log [--after SEQ] [--limit N]     The room's log.

Acts this room declares
  artroom acts [KIND] [--at SEQ | --policy VERSION]   The declared acts; with KIND, its fields and binding.
  artroom act KIND --binding BINDING [--lane LANE [--generation N] | --entry ACT | --target JSON]
              [--set FIELD=VALUE]... [--body JSON] [--because REF]...
                                        Do a declared act. BINDING is the one artroom acts KIND printed:
                                        it names the meaning you read, and the room refuses the act if
                                        that meaning has changed.

Agents
  artroom agents-md [--mcp]             Print the block that teaches an agent the loop, for AGENTS.md.
  artroom mcp [--toolset NAME]          Run the MCP tools over stdio, signing with your key.

Options: --json for JSON output; --room ROOM and --lane LANE to choose; --idempotency-key KEY to
finish an act that did not get an answer; --verbose to show each request.
Exit codes: 0 done, 1 failed, 2 usage, 3 refused.`;

class UsageError extends Error {}

/** One command's options, for parseArgs. */
const COMMON = {
  json: { type: "boolean" },
  room: { type: "string" },
  lane: { type: "string" },
  "idempotency-key": { type: "string" },
  verbose: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const satisfies ParseArgsConfig["options"];

type Values = Record<string, string | boolean | string[] | undefined>;

interface Ctx {
  readonly io: Io;
  readonly store: Store;
  readonly values: Values;
  readonly args: string[];
  readonly json: boolean;
  /** Every credential this run has seen. No line printed may contain one (R-WS-4). */
  readonly secrets: Set<string>;
  /** The act this run journaled, so a failure can say how to finish it. */
  act?: { readonly room: RoomId; readonly key: string } | undefined;
  opened?: Promise<Opened>;
  step(name: string): void;
}

// ------------------------------------------------------------------ output

function scrub(secrets: ReadonlySet<string>, line: string): string {
  let out = line;
  for (const s of secrets) if (s.length >= 8) out = out.split(s).join("[redacted]");
  return out;
}

function print(ctx: Ctx, json: unknown, lines: () => string[], code: number = EXIT.ok): number {
  if (ctx.json) ctx.io.out(JSON.stringify(json, null, 2));
  else for (const l of lines()) ctx.io.out(l);
  return code;
}

function refused(ctx: Ctx, r: Refusal): number {
  if (ctx.json) ctx.io.out(JSON.stringify(r, null, 2));
  else for (const l of refusalText(r)) ctx.io.err(l);
  return EXIT.refused;
}

/** A failure part way through work the journal holds: say that running the command again finishes it. */
function unfinished(ctx: Ctx, e: unknown, command: string): number {
  if (ctx.json) ctx.io.out(JSON.stringify(isArtroomError(e) ? e : { error: String(e) }, null, 2));
  else {
    ctx.io.err(isArtroomError(e) ? errorText(e)[0]! : `artroom ${command}: ${e instanceof Error ? e.message : String(e)}`);
    ctx.io.err(`  Nothing is lost. Run the same artroom ${command} command again to finish; it reuses the same key and request.`);
  }
  return EXIT.failed;
}

const str = (v: Values, k: string) => (typeof v[k] === "string" ? (v[k] as string) : undefined);
const list = (v: Values, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
const int = (v: Values, k: string): number | undefined => {
  const s = str(v, k);
  if (s === undefined) return undefined;
  if (!/^\d+$/.test(s)) throw new UsageError(`--${k} takes a whole number.`);
  return Number(s);
};

// ---------------------------------------------------------- room and lane

function roomOf(ctx: Ctx): { config: Config; id: RoomId; room: RoomConfig } {
  const config = ctx.store.read();
  const id = (str(ctx.values, "room") ?? config.current) as RoomId | undefined;
  if (id === undefined) throw new UsageError("You have not joined a room here. Run: artroom login <invitation-link>");
  const byName = Object.entries(config.rooms).find(([, r]) => r.name === id)?.[0] as RoomId | undefined;
  const key = config.rooms[id] ? id : byName;
  if (key === undefined) throw new UsageError(`You have not joined ${id}. Run: artroom login <invitation-link>`);
  return { config, id: key, room: config.rooms[key]! };
}

function clientOptions(ctx: Ctx): ClientOptions {
  return {
    ...(ctx.io.fetch ? { fetch: ctx.io.fetch } : {}),
    ...(ctx.io.retries !== undefined ? { retries: ctx.io.retries } : {}),
    ...(ctx.values["verbose"] === true ? { log: (l: string) => ctx.io.err(`  ${l}`) } : {}),
  };
}

type Opened = { api: HttpRoomClient; id: RoomId; room: RoomConfig };

/** Connects once per run, with the full checks; only work that needs a session or new signatures calls it. */
function open(ctx: Ctx): Promise<Opened> {
  ctx.opened ??= connectRoom(ctx);
  return ctx.opened;
}

async function connectRoom(ctx: Ctx): Promise<Opened> {
  const { id, room } = roomOf(ctx);
  let creds;
  if (room.custody === "room") {
    const token = ctx.store.loadBearer(id);
    ctx.secrets.add(token); // registered before any request
    creds = { kind: "bearer" as const, token };
  } else creds = { kind: "key" as const, signer: await signerFromJwk(ctx.store.loadKey(id).jwk) };
  try {
    // connect() over HTTPS returns the client's HttpRoomClient, which can also replay a journaled act.
    const api = (await connect({ url: room.url }, id, creds, clientOptions(ctx))) as HttpRoomClient;
    return { api, id, room };
  } catch (e) {
    if (isArtroomError(e) && e.code === "unauthenticated" && room.custody === "room") {
      // A refused bearer can never resend an unsigned act (R-CRED-10): forget them, and say what to do.
      const dropped = ctx.store.forgetBearerActs(id);
      throw {
        ...e,
        message: `The bearer token is no longer valid${dropped > 0 ? `, so ${dropped} unfinished act(s) cannot be sent again` : ""}. Ask an admin for a new MCP invitation. If an act was recorded, a member with a read session can find it with artroom log.`,
      };
    }
    throw e;
  }
}

/** Reads, changes and writes the config in one step. */
function updateRoom(ctx: Ctx, id: RoomId, change: (room: RoomConfig) => void): void {
  const config = ctx.store.read();
  const room = config.rooms[id];
  if (room === undefined) return;
  change(room);
  ctx.store.write(config);
}

function laneOf(ctx: Ctx, room: RoomConfig): LaneId {
  const lane = (str(ctx.values, "lane") ?? room.lane) as LaneId | undefined;
  if (lane === undefined) throw new UsageError("No lane chosen. Claim one with artroom claim, or pass --lane LANE.");
  // A lane ID reaches file names, the credential's mark and printed commands: only the canonical form (request 55be0661).
  if (!isActId(lane)) throw new UsageError("That is not a lane ID. A lane ID looks like act_12_0a1b2c3d.");
  return lane;
}

/** The lane, read now, when this member holds it (a held `Lane` is a `Held`); otherwise a refusal. */
async function held(api: HttpRoom, lane: LaneId, me: string): Promise<Extract<Lane, { state: "held" }> | Refusal> {
  const l = await api.lane(lane);
  if (l === null) return { refused: true, rule: "lane-unknown", reason: `There is no lane ${lane}.`, fix: "Check the lane ID with artroom log." };
  if (l.state !== "held" || l.lease.holder !== me) {
    return {
      refused: true,
      rule: "not-holder",
      reason: l.state === "held" ? `${l.lease.holder} holds lane ${lane}.` : `Nobody holds lane ${lane}; it was ${l.why}.`,
      fix: l.state === "held" ? "Write the holder a note, or claim other paths." : `Take it over: artroom claim ${l.scope.join(" ")} --lane ${lane} --expect ${l.generation}`,
    };
  }
  return l;
}

/**
 * A fresh idempotency key the user can pass back on a command line: never
 * starting with "-", which the option parser would read as an option.
 */
function commandKey(): string {
  for (;;) {
    const key = newIdempotencyKey();
    if (!key.startsWith("-")) return key;
  }
}

/** One act command: how to start new work, the local steps after the room's answer, and what to print. */
interface ActSpec<T> {
  readonly command: string;
  /** Resolves the act from current state and sends it. Runs only for new work, never for a journaled act. */
  start(api: HttpRoomClient, room: RoomConfig, opts: ClientActOptions): Promise<Result<T>>;
  /** The local change this act will own, fixed from the config and the prepared act just before it is sent. Default: none. */
  intent?(room: RoomConfig, act: PreparedAct, id: RoomId): LocalIntent;
}

/**
 * True when the installation `install` provably no longer has a credential
 * in the file whose mark is `now`: the file is gone, or it names another
 * installation. An unreadable mark (null) proves nothing.
 */
function credentialSettled(now: ReturnType<typeof credentialOwner>, install: string): boolean {
  return now === undefined || (now !== null && now.install !== install);
}

/** Changes the selected lane; every change, even back to an earlier lane, gets a new revision (R: review 80d3710c). */
function setLane(r: RoomConfig, lane: LaneId | undefined, by: string): void {
  if (lane === undefined) delete r.lane;
  else r.lane = lane;
  r.laneRev = (r.laneRev ?? 0) + 1;
  r.laneBy = by;
}

/** Changes the followed landing, with a new revision. */
function setLanding(r: RoomConfig, landing: RoomConfig["landing"], by: string): void {
  if (landing === undefined) delete r.landing;
  else r.landing = landing;
  r.landingRev = (r.landingRev ?? 0) + 1;
  r.landingBy = by;
}

/**
 * The one place an act's local change is made, for a fresh answer and a
 * recovered one alike. The act recorded, before it was sent, the revisions
 * it expects and the credential installation it owns. A change is made only
 * if that is still so; if this act already made it (`laneBy`, `landingBy`
 * name its key), nothing is done again. Newer local work, including a later
 * reselection of the same lane or a newer lease's credential, is never
 * overwritten or deleted, and the lines returned say what was kept.
 */
function applyLocal(ctx: Ctx, id: RoomId, key: string, local: LocalIntent, out: unknown): string[] {
  const lines: string[] = [];
  switch (local.kind) {
    case "none":
      return lines;
    case "manual":
      return local.steps.map((step) => `Manual local step: ${step}`);
    case "select-lane": {
      const lane = (out as Claim).lane;
      // Never stored unless canonical: a selected lane is later written into the workspace credential's mark (request 55be0661).
      if (!isActId(lane)) throw new Error("The room answered the claim with a lane ID that is not one, so it was not selected. Tell the room's admin.");
      updateRoom(ctx, id, (r) => {
        if (r.laneBy === key) return;
        if ((r.laneRev ?? 0) === local.rev) setLane(r, lane, key);
        else lines.push(`Kept lane ${r.lane ?? "(none)"} selected: the selection changed after this claim was sent. To work on ${lane}, pass --lane ${lane}.`);
      });
      ctx.step("config-written");
      return lines;
    }
    case "follow-landing": {
      const l = out as Landing;
      updateRoom(ctx, id, (r) => {
        if (r.landingBy === key) return;
        if ((r.landingRev ?? 0) === local.rev) setLanding(r, { op: l.op.id, lane: l.lane }, key);
        else lines.push(`Kept following ${r.landing?.op ?? "no landing"}: that changed after this landing started. To follow this one: artroom wait ${l.op.id}`);
      });
      ctx.step("config-written");
      return lines;
    }
    case "release-lane": {
      // At each repository: remove exactly a credential whose file names one of this lane's own installations,
      // recorded before the release was sent. Newer installations, any Room's, are left; so is a newer reservation.
      for (const d of local.dirs) {
        const file = credentialFileIn(d.dir);
        withDestination(d.dir, (o) => {
          const marker = credentialOwner(file);
          if (marker && local.installs.includes(marker.install)) {
            rmSync(file);
            lines.push(`Removed the workspace credential for lane ${local.lane}, lease ${marker.lease}, from ${file}.`);
          } else if (marker && d.held) {
            lines.push(`Left the workspace credential at ${file}: a newer workspace installed it.`);
          } else if (marker === null && d.held) {
            lines.push(`Manual local step: ${file} has no installation mark artroom can read. If it still holds lane ${local.lane}'s credential, remove it by hand.`);
          }
          // One evidence rule, the same as for the Room's mapping: an owned installation is settled only when its
          // credential was removed now, the file is gone, or the file provably belongs to another installation.
          // An unreadable file proves nothing, so the evidence (the cleanup duty) stays.
          const now = credentialOwner(file);
          const settle = (p: Party | undefined) => p !== undefined && local.installs.includes(p.install) && credentialSettled(now, p.install);
          const cancel = o.reservation !== undefined && local.reservations.includes(o.reservation.install);
          const pending = o.pending ?? [];
          if (!settle(o.installed) && !pending.some(settle) && !cancel) return undefined;
          const { installed, pending: _settled, reservation, ...rest } = o;
          const unsettled = pending.filter((p) => !settle(p));
          return {
            ...rest,
            rev: o.rev + 1,
            ...(installed && !settle(installed) ? { installed } : {}),
            ...(unsettled.length > 0 ? { pending: unsettled } : {}),
            ...(reservation && !cancel ? { reservation } : {}),
          };
        });
      }
      ctx.step("credential-removed");
      updateRoom(ctx, id, (r) => {
        const mapped = r.workspaces?.[local.lane];
        // The mapping is this Room's evidence of what it installed. Forget it only when that duty is done:
        // its credential was removed now, or the file there is provably another installation's (or gone).
        if (mapped !== undefined && mapped.install !== "" && local.installs.includes(mapped.install)) {
          if (credentialSettled(credentialOwner(mapped.file), mapped.install)) delete r.workspaces![local.lane];
        }
        if (mapped !== undefined && mapped.install === "") {
          // A mapping from an older artroom names no installation: nothing proves the file is this lease's.
          lines.push(`Manual local step: ${mapped.file} was set up by an older artroom for lane ${local.lane}. If it still holds this lane's credential, remove it by hand.`);
        }
        if (r.lane === local.lane && r.laneBy !== key) {
          if ((r.laneRev ?? 0) === local.laneRev) setLane(r, undefined, key);
          else lines.push(`Kept lane ${local.lane} selected: it was selected again after this release of lease ${local.lease} was sent.`);
        }
        if (r.landing?.lane === local.lane && r.landingBy !== key && (r.landingRev ?? 0) === local.landingRev) setLanding(r, undefined, key);
      });
      ctx.step("config-written");
      return lines;
    }
  }
}

/**
 * Runs one act through the journal, whose entry moves from `prepared` to
 * `answered` and is removed only after the local steps are done.
 *
 * - New work: `start` resolves the act from current state; the client hands
 *   back the prepared act, which is journaled before it is first sent.
 * - `prepared` (sent, no answer kept): a signed act goes straight back to
 *   the room with `resubmit`, needing no read session, new signature or
 *   current state, so a retired key still gets its receipt (R-IDEM-2). An
 *   unsigned bearer act needs its token judged first (R-CRED-10).
 * - `answered`: nothing is sent; the local steps run again from the kept
 *   answer, and `kept` is true in what is returned.
 */
async function journaled<T>(ctx: Ctx, spec: ActSpec<T>): Promise<{ out: Result<T>; extra: string[]; prepared?: PreparedAct; kept?: boolean }> {
  const { id, room } = roomOf(ctx);
  const key = str(ctx.values, "idempotency-key") ?? commandKey();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) throw new UsageError("An idempotency key is 1 to 64 characters from A-Z, a-z, 0-9, '_' and '-'.");
  ctx.act = { room: id, key };
  let entry: Extract<JournalEntry, { type: "act" }> | undefined = ctx.store.entry(id, "act", key);
  if (entry !== undefined && entry.command !== spec.command) {
    throw new UsageError(`The idempotency key ${key} belongs to an unfinished artroom ${entry.command}. Repeat that command with it.`);
  }
  let out: Result<T>;
  // True when the journal already held the answer, so this run sends nothing.
  const kept = entry?.state === "answered";
  if (entry?.state === "answered") out = entry.result as Result<T>;
  else {
    if (entry === undefined) {
      const { api } = await open(ctx);
      out = await spec.start(api, room, {
        idempotencyKey: key,
        onPrepared: (prepared) => {
          // Fixed now, before anything is sent: what this act owns locally, and the revisions it expects.
          const now = ctx.store.read().rooms[id] ?? room;
          const local = spec.intent?.(now, prepared, id) ?? { kind: "none" as const };
          entry = { v: SCHEMA, type: "act", id: key, room: id, command: spec.command, state: "prepared", prepared, local };
          ctx.store.journal(entry);
          ctx.step("act-journaled");
        },
      });
      // A preflight refusal or usage error never prepared anything: there is nothing to finish.
      if (entry === undefined) {
        ctx.act = undefined;
        return { out, extra: [] };
      }
    } else if (entry.prepared.signed !== undefined) {
      out = (await resubmit({ url: room.url }, id, entry.prepared.signed, clientOptions(ctx))) as Result<T>;
    } else {
      const { api } = await open(ctx);
      try {
        out = (await api.replay(entry.prepared)) as Result<T>;
      } catch (e) {
        // A bearer act has no signed envelope to keep: once the token is refused, there is nothing to resend (R-CRED-10).
        if (isArtroomError(e) && e.code === "unauthenticated") {
          ctx.store.finish(id, "act", key);
          ctx.act = undefined;
          throw { ...e, message: "The bearer token is no longer valid, so this act cannot be sent again. If the room recorded it, a member with a read session can find it with artroom log." };
        }
        throw e;
      }
    }
    entry = { ...entry!, state: "answered", result: out };
    ctx.store.journal(entry);
    ctx.step("act-answered");
  }
  const extra = isRefusal(out) ? [] : applyLocal(ctx, id, key, entry!.local ?? { kind: "none" }, out);
  ctx.step("act-completed");
  ctx.store.finish(id, "act", key);
  ctx.act = undefined;
  // The act as it was prepared, and so as it was sent: what the journal kept, whichever run prepared it.
  return { out, extra, prepared: entry!.prepared, kept };
}

/**
 * The meaning a recorded act's kind had at the act's own seq, `D(seq)`
 * (R-DECL-23), or undefined when it cannot be read. An act is shown in the
 * words of the declaration it was admitted under: not those read while it
 * was prepared, since a label can change before admission and leave the
 * binding as it was, and not the latest, which may be later still. This is
 * a read for display only. The act is already recorded, so a failure here
 * changes the words printed and nothing else: nothing is sent again, and
 * the receipt is still given.
 */
async function recordedMeaning(ctx: Ctx, seq: Seq, kind: string): Promise<RecordMeaning | undefined> {
  try {
    // The run's one handle: the one that sent a new act, or a new one for an act finished from the journal.
    const { api } = await open(ctx);
    const c: Catalogue | null = await api.actsAt({ seq }); // G5:cli-recorded-seq
    return c === null ? undefined : meaningOf(c, kind); // G5:cli-recorded-null
  } catch {
    return undefined; // G5:cli-recorded-unread
  }
}

/** The target of a generic act, from the command line: null, an entry, a thread, a version, or the JSON given. */
function targetOf(ctx: Ctx, room: RoomConfig): DeclaredTarget {
  const raw = str(ctx.values, "target");
  const entry = str(ctx.values, "entry");
  const generation = int(ctx.values, "generation");
  const explicit = str(ctx.values, "lane") !== undefined;
  if (raw !== undefined) {
    if (entry !== undefined || generation !== undefined || explicit) throw new UsageError("Give --target, or --lane, --generation and --entry, not both.");
    try {
      return JSON.parse(raw) as DeclaredTarget;
    } catch {
      throw new UsageError("--target takes JSON: null, or an object such as {\"lane\":\"act_12_0a1b2c3d\"}.");
    }
  }
  if (entry !== undefined) {
    if (generation !== undefined || explicit) throw new UsageError("Give --entry alone, or --lane with --generation.");
    if (!isActId(entry)) throw new UsageError("An entry ID looks like act_12_0a1b2c3d.");
    return { act: entry };
  }
  if (generation !== undefined) return { lane: laneOf(ctx, room), generation };
  if (explicit) return { lane: laneOf(ctx, room) };
  return null;
}

/**
 * What to tell the user after `binding-stale`: the active meaning, what
 * changed since the one they read where the room still retains it, and the
 * command that acts under the active meaning. Nothing here acts again.
 */
async function staleText(ctx: Ctx, api: HttpRoomClient | undefined, kind: string, given: string): Promise<string[]> {
  try {
    const client = api ?? (await open(ctx)).api;
    const c = await client.acts();
    const now = c.vocabulary === "declared" && Object.hasOwn(c.acts, kind) ? c.acts[kind] : undefined;
    if (c.vocabulary !== "declared" || now === undefined) return [`  ${kind} is not declared in the active policy version ${c.policy}. See: artroom acts`];
    const lines = [`  Nothing was done. In policy version ${c.policy}, ${kind} now means:`, ...actText(c, kind).slice(0, -1).map((l) => `  ${l}`)];
    // The meaning the user read, if one of the last versions still holds it under that binding.
    let before: Catalogue | null = c;
    let old;
    for (let i = 0; i < 8 && before !== null && before.since > 0 && old === undefined; i++) {
      before = await client.actsAt({ seq: before.since - 1 });
      if (before?.vocabulary === "declared" && Object.hasOwn(before.acts, kind) && before.acts[kind]!.binding === given) old = before.acts[kind]!.declaration; // G5:cli-stale-old
    }
    if (old !== undefined) {
      const changed = meaningChanges(old, now.declaration);
      lines.push("  What changed since the meaning you read:", ...changed.map((l) => `    ${l}`));
    } else lines.push("  The meaning you read is not in the room's recent policy versions, so the change cannot be listed.");
    lines.push(`  If this is still what you intend, act under it: artroom act ${kind} --binding ${now.binding} …`);
    return lines;
  } catch {
    return [`  To read the active meaning: artroom acts ${kind}`];
  }
}

function parseReason(ref: string): Reason {
  if (/^act_\d+_[0-9a-f]{8}$/.test(ref)) return { act: ref as ActId };
  if (/^[0-9a-f]{40}$/.test(ref)) return { commit: ref as Sha };
  if (ref.startsWith("https://")) return { url: ref as `https://${string}` };
  throw new UsageError(`--because takes an act ID, a full commit SHA or an https link, not ${ref}.`);
}

/** `lane#generation`, as printed by the CLI. */
function parseProposalRef(text: string | undefined): { lane: LaneId; generation: number } {
  const m = /^(act_\d+_[0-9a-f]{8})#(\d+)$/.exec(text ?? "");
  if (!m) throw new UsageError("Name the proposal as LANE#GENERATION, for example act_5_1a2b3c4d#1.");
  return { lane: m[1] as LaneId, generation: Number(m[2]) };
}

// ---------------------------------------------------------------- landing

const LAND_DONE = ["landed", "aborted", "retryable", "failed", "unresolved"] as const;

/**
 * The one wait path: follows a landing operation that was already started.
 * It never submits a `land`. Out of time, it says how to keep waiting on the
 * same operation; a finished operation is forgotten.
 */
async function waitLanding(ctx: Ctx, api: HttpRoom, id: RoomId, op: OpId, timeoutMs: number): Promise<number> {
  let reached: LandOp;
  try {
    reached = await api.wait({ id: op, kind: "land" }, { until: LAND_DONE, timeoutMs });
  } catch (e) {
    if (!(isArtroomError(e) && e.code === "timeout")) throw e;
    const now = await api.op({ id: op, kind: "land" });
    return print(ctx, now, () => [`Landing ${op} is still ${now.state}.`, `Next: artroom wait ${op}`], EXIT.failed);
  }
  if (reached.state !== "unresolved") {
    updateRoom(ctx, id, (r) => {
      if (r.landing?.op === op) setLanding(r, undefined, "wait");
    });
  }
  return print(ctx, reached, () => [`Landing ${op}, generation ${reached.generation}: ${short(reached.head)}.`, ...landText(reached)], reached.state === "landed" ? EXIT.ok : EXIT.failed);
}

// --------------------------------------------------------------- commands

type Command = { readonly options: ParseArgsConfig["options"]; run(ctx: Ctx): Promise<number> };

const COMMANDS: Record<string, Command> = {
  login: {
    options: {},
    async run(ctx) {
      const inv = parseInvitation(ctx.args[0] ?? "");
      if (typeof inv === "string") throw new UsageError(inv);
      ctx.secrets.add(inv.secret);
      const done = ctx.store.read().rooms[inv.room];
      let entry = ctx.store.entry(inv.room, "login", inv.invitation);
      if (entry === undefined && done?.invitation === inv.invitation) {
        return print(ctx, { room: inv.room, name: done.name, member: done.member, role: done.role, key: done.key }, () => [
          `Already joined ${done.name} as ${done.member} with this invitation. Nothing to do.`,
        ]);
      }
      // The new key and the join's idempotency key are journaled before the join goes out (R-IDEM-2).
      if (entry === undefined) {
        const made = await generateSigner({ extractable: true });
        entry = { v: SCHEMA, type: "login", id: inv.invitation, room: inv.room, url: inv.url, idempotencyKey: newIdempotencyKey(), key: made.signer.key, jwk: made.jwk! };
        ctx.store.journal(entry);
        ctx.step("login-journaled");
      }
      const signer = await signerFromJwk(entry.jwk);
      if (entry.joined === undefined) {
        let joined;
        try {
          joined = await join({ url: entry.url }, inv.room, { invitation: inv.invitation, secret: inv.secret, signer }, { ...clientOptions(ctx), idempotencyKey: entry.idempotencyKey });
        } catch (e) {
          return unfinished(ctx, e, "login");
        }
        if (isRefusal(joined)) {
          ctx.store.finish(inv.room, "login", inv.invitation);
          return refused(ctx, joined);
        }
        entry = { ...entry, joined: { member: joined.member, role: joined.role, record: joined.record.id } };
        ctx.store.journal(entry);
        ctx.step("joined");
      }
      let name: string;
      try {
        name = (await connect({ url: entry.url }, inv.room, { kind: "key", signer }, clientOptions(ctx))).name;
      } catch (e) {
        return unfinished(ctx, e, "login");
      }
      const { member, role, record } = entry.joined!;
      const path = ctx.store.saveKey({ v: 1, room: inv.room, member, key: signer.key, jwk: entry.jwk });
      ctx.step("key-saved");
      const config = ctx.store.read();
      config.rooms[inv.room] = { url: entry.url, name, member, role, custody: "client", key: signer.key, invitation: inv.invitation };
      config.current = inv.room;
      ctx.store.write(config);
      ctx.step("config-written");
      ctx.store.finish(inv.room, "login", inv.invitation);
      return print(ctx, { room: inv.room, name, member, role, key: signer.key, keyFile: path, record }, () => [
        `Joined ${name} as ${member} (${role}).`,
        `Your key ${signer.key} is in ${path}, readable only by you.`,
        'Next: artroom claim <paths> --goal "<what you will do>"',
      ]);
    },
  },

  redeem: {
    options: {},
    async run(ctx) {
      const inv = parseInvitation(ctx.args[0] ?? "");
      if (typeof inv === "string") throw new UsageError(inv);
      ctx.secrets.add(inv.secret);
      const done = ctx.store.read().rooms[inv.room];
      let entry = ctx.store.entry(inv.room, "redeem", inv.invitation);
      if (entry === undefined && done?.invitation === inv.invitation) {
        return print(ctx, { room: inv.room, member: done.member, mcp: done.mcp, bearerFile: ctx.store.bearerPath(inv.room) }, () => [
          `Already redeemed this invitation for ${done.member}. The token is in ${ctx.store.bearerPath(inv.room)}.`,
        ]);
      }
      const lost = () => {
        if (ctx.json) ctx.io.out(JSON.stringify({ name: "ArtroomError", code: "unavailable", message: LOST_REDEMPTION, retryable: false, maybeRecorded: true }, null, 2));
        else ctx.io.err(`Error (unavailable): ${LOST_REDEMPTION}`);
        return EXIT.failed;
      };
      // A redemption is one-time: once it may have reached the room, it is never sent again.
      if (entry !== undefined && entry.redeemed === undefined) return lost();
      if (entry === undefined) {
        entry = { v: SCHEMA, type: "redeem", id: inv.invitation, room: inv.room, url: inv.url };
        ctx.store.journal(entry);
        ctx.step("redeem-journaled");
        let out;
        try {
          out = await redeem({ url: inv.url }, inv.room, { invitation: inv.invitation, secret: inv.secret }, clientOptions(ctx));
        } catch (e) {
          if (isArtroomError(e) && e.maybeRecorded) return lost();
          // The room answered, and recorded nothing: the invitation is still unused.
          ctx.store.finish(inv.room, "redeem", inv.invitation);
          throw e;
        }
        if (isRefusal(out)) {
          ctx.store.finish(inv.room, "redeem", inv.invitation);
          return refused(ctx, out);
        }
        ctx.secrets.add(out.bearer);
        // One atomic write keeps the result and the token together, because the token can never be shown again.
        entry = { ...entry, redeemed: out };
        ctx.store.journal(entry);
        ctx.step("redeemed");
      }
      const { bearer, ...shown } = entry.redeemed!;
      ctx.secrets.add(bearer);
      // The bearer is saved to a file and the MCP URL printed in a shell command: both checked first (request 55be0661).
      checkRedeemed(shown.mcp, bearer);
      ctx.store.saveBearer(inv.room, bearer);
      ctx.step("bearer-saved");
      const name = await connect({ url: entry.url }, inv.room, { kind: "bearer", token: bearer }, clientOptions(ctx)).then(
        (a) => a.name,
        () => inv.room,
      );
      const path = ctx.store.bearerPath(inv.room);
      const config = ctx.store.read();
      config.rooms[inv.room] = { url: entry.url, name, member: shown.member, role: shown.role, custody: "room", key: shown.key, delegation: shown.delegation, mcp: shown.mcp, invitation: inv.invitation };
      config.current = inv.room;
      ctx.store.write(config);
      ctx.step("config-written");
      ctx.store.finish(inv.room, "redeem", inv.invitation);
      return print(ctx, { ...shown, bearerFile: path }, () => [
        `Redeemed an MCP invitation for ${shown.member} (${shown.role}), valid until ${shown.expiresAt}.`,
        `The bearer token is in ${path}, readable only by you. It is not shown anywhere else.`,
        `MCP URL: ${shown.mcp}`,
        `Next: give your agent that URL with the header "Authorization: Bearer <token from the file>", for example:`,
        `  claude mcp add --transport http artroom ${shown.mcp} --header "Authorization: Bearer $(cat ${path})"`,
      ]);
    },
  },

  claim: {
    options: { goal: { type: "string" }, plan: { type: "string" }, because: { type: "string", multiple: true }, expect: { type: "string" } },
    async run(ctx) {
      if (ctx.args.length === 0) throw new UsageError('Give the paths to claim, for example: artroom claim "src/api/**" --goal "Rate-limit login"');
      const because = list(ctx.values, "because").map(parseReason);
      const plan = str(ctx.values, "plan");
      const goal = str(ctx.values, "goal");
      const target = str(ctx.values, "lane") as LaneId | undefined;
      if (target === undefined && goal === undefined) throw new UsageError('Say what you will do: --goal "..."');
      const { out, extra } = await journaled<Claim>(ctx, {
        command: "claim",
        async start(api, room, opts) {
          if (target === undefined) return api.claim({ goal: goal!, scope: ctx.args, ...(plan ? { plan } : {}), ...(because.length ? { because } : {}) }, opts);
          const lane = await api.lane(target);
          const expectedGeneration = int(ctx.values, "expect") ?? lane?.generation ?? 0;
          const mine = lane?.state === "held" && lane.lease.holder === room.member;
          const body = { scope: ctx.args, expectedGeneration, ...(goal ? { goal } : {}), ...(plan ? { plan } : {}), ...(because.length ? { because } : {}) };
          return api.claim(mine ? { ...body, lane: lane as Held } : { ...body, lane: target }, opts);
        },
        intent: (room) => ({ kind: "select-lane", rev: room.laneRev ?? 0 }),
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [...claimText(out), ...extra]);
    },
  },

  workspace: {
    options: { timeout: { type: "string" } },
    async run(ctx) {
      // Everything about where this workspace goes is fixed, and the destination reserved, before the first await.
      const dir = gitDir(ctx.io.cwd);
      if (dir === undefined) throw new UsageError("Run artroom workspace inside your git repository, so it can set up the remote.");
      const { id, room } = roomOf(ctx);
      const lane = laneOf(ctx, room);
      const install = newIdempotencyKey();
      // A newer reservation replaces an older one; the installed credential's record is untouched.
      withDestination(dir, (o) => ({ ...o, rev: o.rev + 1, reservation: { install, room: id, lane } }));
      updateRoom(ctx, id, (r) => {
        if (!(r.destinations ?? []).includes(dir)) r.destinations = [...(r.destinations ?? []), dir];
      });
      ctx.step("workspace-reserved");

      const { api } = await open(ctx);
      const h = await held(api, lane, room.member);
      if (isRefusal(h)) return refused(ctx, h);
      const op = await api.workspace(h);
      if (isRefusal(op)) return refused(ctx, op);
      const ready = op.state === "pending" ? await api.wait(op, { until: ["ready", "failed"], timeoutMs: (int(ctx.values, "timeout") ?? 60) * 1000 }) : op;
      if (ready.state === "failed") {
        for (const l of errorText(ready.error)) ctx.io.err(l);
        return EXIT.failed;
      }
      const grant = await api.workspaceToken(h);
      if (isRefusal(grant)) return refused(ctx, grant);
      ctx.secrets.add(grant.token);
      // The room's remote and token are written into git config: refuse a malformed one before touching the destination.
      checkGrant(grant.remote, grant.token);
      checkMarker(lane, grant.leaseGeneration, install);

      // Install only if the reservation still owns this repository's destination, whichever Room or command
      // touched it since, and only for the lease it was made for. The remote, credential and mapping change together.
      const file = credentialFileIn(dir);
      let owned = false;
      withDestination(dir, (o, save) => {
        if (o.reservation?.install !== install || grant.leaseGeneration !== h.lease.generation) return undefined;
        owned = true;
        const me: Party = { install, room: id, lane, lease: grant.leaseGeneration };
        // Recorded before the file is replaced, so a crash in between leaves evidence of what may be in it.
        // Added to, never replacing, earlier unsettled installations: their credentials may still be in the file.
        save({ ...o, rev: o.rev + 1, pending: [...(o.pending ?? []), me] });
        ctx.step("workspace-installing");
        configureWorkspace(ctx.io.cwd, grant.remote, grant.token, lane, grant.leaseGeneration, install);
        updateRoom(ctx, id, (r) => {
          r.workspaces = { ...r.workspaces, [lane]: { file, lease: grant.leaseGeneration, install } };
        });
        ctx.step("workspace-mapped");
        // The file now holds this installation's credential: every earlier one, installed or pending, is provably replaced.
        const { pending: _settled, reservation: _used, ...rest } = o;
        return { ...rest, rev: o.rev + 2, installed: me };
      });
      if (!owned) {
        return print(ctx, { op: ready, installed: false, reason: "superseded" }, () => [
          `Did not install the workspace for lane ${lane}, lease ${h.lease.generation}: a newer workspace or release for this repository happened while it was being prepared.`,
          "Kept the newer git remote, credential, mapping and lane selection. Run artroom workspace again if you still want this one.",
        ], EXIT.failed);
      }
      return print(ctx, { op: ready, remote: grant.remote, remoteName: REMOTE, leaseGeneration: grant.leaseGeneration, expiresAt: grant.expiresAt, credentialFile: file }, () => [
        `Workspace ready for lane ${lane}, lease ${grant.leaseGeneration}.`,
        `Git remote "${REMOTE}": ${grant.remote}`,
        `Git can push there until ${grant.expiresAt}. The token is in ${file}, readable only by you, and is not shown.`,
        'Next: git push artroom HEAD, then artroom propose -m "<what changed and why>"',
      ]);
    },
  },

  propose: {
    options: { message: { type: "string", short: "m" }, head: { type: "string" }, expect: { type: "string" } },
    async run(ctx) {
      const summary = str(ctx.values, "message");
      if (summary === undefined) throw new UsageError('Say what changed and why: -m "..."');
      const { out } = await journaled<Proposal>(ctx, {
        command: "propose",
        async start(api, room, opts) {
          const sha = str(ctx.values, "head") ?? gitHead(ctx.io.cwd);
          if (sha === undefined || !/^[0-9a-f]{40}$/.test(sha)) throw new UsageError("Give the commit to propose with --head SHA, or run this inside the repository.");
          const h = await held(api, laneOf(ctx, room), room.member);
          if (isRefusal(h)) return h;
          return api.propose(h, { head: sha as Sha, expectedGeneration: int(ctx.values, "expect") ?? h.generation, summary }, opts);
        },
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => proposalText(out));
    },
  },

  land: {
    options: { wait: { type: "boolean" }, timeout: { type: "string" }, generation: { type: "string" } },
    async run(ctx) {
      const { out: landing, extra } = await journaled<Landing>(ctx, {
        command: "land",
        async start(api, room, opts) {
          const h = await held(api, laneOf(ctx, room), room.member);
          if (isRefusal(h)) return h;
          const generation = int(ctx.values, "generation") ?? h.generation;
          if (generation === 0) throw new UsageError("Nothing is proposed on this lane yet. Run artroom propose first.");
          const proposal = await api.proposal({ lane: h.lane, generation });
          if (proposal === null) throw new UsageError(`Lane ${h.lane} has no generation ${generation}.`);
          return api.land(h, proposal, opts);
        },
        // `artroom wait` follows this operation; it is saved before the journal forgets the landing.
        intent: (room) => ({ kind: "follow-landing", rev: room.landingRev ?? 0 }),
      });
      if (isRefusal(landing)) return refused(ctx, landing);
      if (ctx.values["wait"] !== true) {
        return print(ctx, landing, () => [`Landing ${landing.op.id} started for generation ${landing.generation} of lane ${landing.lane}.`, ...extra, extra.length ? `Next: artroom wait ${landing.op.id}` : "Next: artroom wait"]);
      }
      const { api, id } = await open(ctx);
      return waitLanding(ctx, api, id, landing.op.id, (int(ctx.values, "timeout") ?? 120) * 1000);
    },
  },

  wait: {
    options: { timeout: { type: "string" } },
    async run(ctx) {
      const { api, id, room } = await open(ctx);
      const op = (ctx.args[0] ?? room.landing?.op) as OpId | undefined;
      if (op === undefined) throw new UsageError("There is no landing to wait for. Start one with artroom land, or name the operation: artroom wait op_land_N");
      if (!/^op_[A-Za-z0-9_-]{1,64}$/.test(op)) throw new UsageError(`Not an operation ID: ${op}.`);
      return waitLanding(ctx, api, id, op, (int(ctx.values, "timeout") ?? 120) * 1000);
    },
  },

  renew: {
    options: {},
    async run(ctx) {
      const { out } = await journaled<Renewal>(ctx, {
        command: "renew",
        async start(api, room, opts) {
          const h = await held(api, laneOf(ctx, room), room.member);
          return isRefusal(h) ? h : api.renew(h, opts);
        },
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [`Renewed lane ${out.lane}: lease ${out.lease.generation} until ${out.lease.expiresAt}.`]);
    },
  },

  release: {
    options: { message: { type: "string", short: "m" } },
    async run(ctx) {
      const note = str(ctx.values, "message");
      const { out, extra } = await journaled<Release>(ctx, {
        command: "release",
        async start(api, room, opts) {
          const h = await held(api, laneOf(ctx, room), room.member);
          return isRefusal(h) ? h : api.release(h, note === undefined ? {} : { note }, opts);
        },
        // Recorded before the release is sent: every installation of this lane this Room knows of (its mapping,
        // and the owner records where it set up workspaces), the reservations to cancel, and where to look.
        // Not whatever is in the current directory.
        intent: (room, act, id) => {
          const lane = (act.target as { lane: LaneId }).lane;
          const lease = (act.body as { lease: number }).lease;
          const mapping = room.workspaces?.[lane];
          const mapped = mapping !== undefined && mapping.install !== "" ? mapping : undefined;
          const installs = new Set<string>(mapped ? [mapped.install] : []);
          const reservations = new Set<string>();
          const dirs = new Map<string, boolean>();
          if (mapped) dirs.set(dirname(dirname(mapped.file)), true);
          for (const dir of room.destinations ?? []) {
            const o = readOwner(dir);
            const mine = (p: Party | undefined) => p !== undefined && p.room === id && p.lane === lane;
            for (const p of [o.installed, ...(o.pending ?? [])]) if (mine(p)) installs.add(p!.install);
            if (mine(o.reservation)) reservations.add(o.reservation!.install);
            dirs.set(dir, (dirs.get(dir) ?? false) || mine(o.installed) || (o.pending ?? []).some(mine));
          }
          return {
            kind: "release-lane",
            lane,
            lease,
            installs: [...installs],
            reservations: [...reservations],
            dirs: [...dirs].map(([dir, held]) => ({ dir, held })),
            laneRev: room.laneRev ?? 0,
            landingRev: room.landingRev ?? 0,
          };
        },
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [`Released lane ${out.lane}${out.note === undefined ? "" : ", with a handover note"}.`, ...extra]);
    },
  },

  note: {
    options: { message: { type: "string", short: "m" }, "reply-to": { type: "string" } },
    async run(ctx) {
      const text = str(ctx.values, "message");
      if (text === undefined) throw new UsageError('Give the note: -m "..."');
      const target = ctx.args[0] ?? "";
      const m = /^(act_\d+_[0-9a-f]{8})#(\d+):(.+):(\d+)(?:-(\d+))?$/.exec(target);
      if (!/^act_\d+_[0-9a-f]{8}$/.test(target) && !m) throw new UsageError("Anchor the note on an act ID, or on LANE#GENERATION:PATH:LINE.");
      const replyTo = str(ctx.values, "reply-to") as ActId | undefined;
      const { out } = await journaled<Note>(ctx, {
        command: "note",
        async start(api, _room, opts) {
          let anchor: NoteAnchor;
          if (m === null) anchor = { act: target as ActId };
          else {
            const p = await api.proposal({ lane: m[1] as LaneId, generation: Number(m[2]) });
            if (p === null) throw new UsageError(`There is no proposal ${m[1]}#${m[2]}.`);
            anchor = { lane: p.lane, generation: p.generation, head: p.head, path: m[3]!, line: Number(m[4]), ...(m[5] ? { endLine: Number(m[5]) } : {}) };
          }
          return api.note(anchor, { text, ...(replyTo ? { replyTo } : {}) }, opts);
        },
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [`Noted ${out.id}.`]);
    },
  },

  review: {
    options: {
      approve: { type: "boolean" },
      object: { type: "boolean" },
      scope: { type: "string", multiple: true },
      "depends-on": { type: "string", multiple: true },
      message: { type: "string", short: "m" },
      head: { type: "string" },
    },
    async run(ctx) {
      const ref = parseProposalRef(ctx.args[0]);
      const approve = ctx.values["approve"] === true;
      if (approve === (ctx.values["object"] === true)) throw new UsageError("Choose one verdict: --approve or --object.");
      const scope = list(ctx.values, "scope");
      if (scope.length === 0) throw new UsageError('Say what you read: --scope "src/api/**" (repeat for more).');
      const text = str(ctx.values, "message");
      if (text === undefined) throw new UsageError('Give your reasons: -m "..."');
      const dependsOn = list(ctx.values, "depends-on");
      const { out } = await journaled<Review>(ctx, {
        command: "review",
        async start(api, _room, opts) {
          const p = await api.proposal(ref);
          if (p === null) throw new UsageError(`There is no proposal ${ref.lane}#${ref.generation}.`);
          const headSha = (str(ctx.values, "head") ?? p.head) as Sha;
          return api.review({ ...ref, head: headSha }, { verdict: approve ? "approve" : "object", scope, ...(dependsOn.length ? { dependsOn } : {}), text }, opts);
        },
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [
        `${out.verdict === "approve" ? "Approved" : "Objected to"} ${out.lane}#${out.generation} at ${short(out.head)}.`,
        ...out.fulfils.map((f) => `Met ${f.obligation}.`),
      ]);
    },
  },

  attention: {
    options: { cursor: { type: "string" }, limit: { type: "string" }, all: { type: "boolean" } },
    async run(ctx) {
      const { api } = await open(ctx);
      const cursor = str(ctx.values, "cursor");
      const limit = int(ctx.values, "limit");
      const page = await api.attention({ ...(cursor ? { cursor: cursor as never } : {}), ...(limit ? { limit } : {}) });
      return print(ctx, page, () => attentionText(page, ctx.values["all"] === true));
    },
  },

  explain: {
    options: {},
    async run(ctx) {
      const act = ctx.args[0];
      if (!act || !/^act_\d+_[0-9a-f]{8}$/.test(act)) throw new UsageError("Give the act ID to explain, for example act_9_abcdef01.");
      const { api } = await open(ctx);
      const x = await api.explain(act as ActId);
      if (x === null) {
        if (ctx.json) ctx.io.out("null");
        else ctx.io.err(`There is no act ${act} in this room.`);
        return EXIT.failed;
      }
      return print(ctx, x, () => explainText(x));
    },
  },

  log: {
    options: { after: { type: "string" }, limit: { type: "string" }, cursor: { type: "string" } },
    async run(ctx) {
      const { api } = await open(ctx);
      const after = int(ctx.values, "after");
      const limit = int(ctx.values, "limit");
      const cursor = str(ctx.values, "cursor");
      const page = await api.log({ ...(after !== undefined ? { after } : {}), ...(limit ? { limit } : {}), ...(cursor ? { cursor: cursor as never } : {}) });
      // Each act is shown with the label its kind had at its own seq (R-DECL-23): one read per policy version on the page.
      const meanings = new Map<number, RecordMeaning>();
      const versions: Catalogue[] = [];
      for (const e of page.acts) {
        if (e.entry.type === "system") continue;
        let c = versions.find((k) => governs(k, e.seq)); // G5:cli-log-version
        if (c === undefined) {
          const read = await api.actsAt({ seq: e.seq });
          if (read === null) continue;
          versions.push(read);
          c = read;
        }
        meanings.set(e.seq, meaningOf(c, envelopeOf(e)!.kind)); // G5:cli-log-meaning
      }
      return print(ctx, page, () => logText(page.acts, page.head, page.publishedThrough, page.more, page.cursor, meanings));
    },
  },

  acts: {
    options: { at: { type: "string" }, policy: { type: "string" } },
    async run(ctx) {
      const at = int(ctx.values, "at");
      const policy = str(ctx.values, "policy");
      if (at !== undefined && policy !== undefined) throw new UsageError("Give --at or --policy, not both."); // G5:cli-acts-one
      if (policy !== undefined && !isActId(policy)) throw new UsageError("A policy version looks like act_12_0a1b2c3d.");
      const kind = ctx.args[0];
      const { api } = await open(ctx);
      const c = at !== undefined ? await api.actsAt({ seq: at }) : policy !== undefined ? await api.actsAt({ policy: policy as ActId }) : await api.acts();
      if (c === null) {
        if (ctx.json) ctx.io.out("null");
        else ctx.io.err("The room retains no such policy version.");
        return EXIT.failed;
      }
      if (kind === undefined) return print(ctx, c, () => actsText(c));
      if (c.vocabulary !== "declared" || !Object.hasOwn(c.acts, kind)) {
        if (ctx.json) ctx.io.out("null");
        else {
          ctx.io.err(`${kind} is not declared in policy version ${c.policy}.`);
          for (const l of actsText(c)) ctx.io.err(l);
        }
        return EXIT.failed;
      }
      return print(ctx, { policy: c.policy, since: c.since, until: c.until, steps: c.steps, kind, ...c.acts[kind] }, () => actText(c, kind));
    },
  },

  act: {
    options: {
      binding: { type: "string" },
      target: { type: "string" },
      generation: { type: "string" },
      entry: { type: "string" },
      set: { type: "string", multiple: true },
      body: { type: "string" },
      because: { type: "string", multiple: true },
    },
    async run(ctx) {
      const kind = ctx.args[0];
      if (kind === undefined) throw new UsageError("Give the kind of act. To see what this room declares: artroom acts");
      const given = str(ctx.values, "binding");
      // The binding is never read for the user: it names the meaning they read, and only they know which that was (R-DECL-16).
      if (given === undefined) throw new UsageError(`Give the binding of the meaning you read: --binding sha256:… It is printed by: artroom acts ${kind}`); // G5:cli-binding-required
      if (!/^sha256:[0-9a-f]{64}$/.test(given)) throw new UsageError("--binding takes the whole binding, sha256: and 64 hex digits, as artroom acts prints it."); // G5:cli-binding-format
      let base: Record<string, Json> = {};
      const raw = str(ctx.values, "body");
      if (raw !== undefined) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
          base = parsed as Record<string, Json>;
        } catch {
          throw new UsageError("--body takes a JSON object.");
        }
      }
      const because = list(ctx.values, "because").map(parseReason);
      let reader: HttpRoomClient | undefined;
      const { out, prepared, kept } = await journaled<DeclaredRecord>(ctx, {
        command: "act",
        async start(api, room, opts) {
          reader = api;
          const c = await api.acts();
          if (c.vocabulary !== "declared") throw new UsageError("This room declares no acts of its own: it uses the legacy vocabulary. Use the named commands, such as artroom claim."); // G5:cli-legacy
          const a = Object.hasOwn(c.acts, kind) ? c.acts[kind] : undefined;
          if (a === undefined)
            return { refused: true, rule: "kind-undeclared", reason: `The kind ${kind} is not declared in the room's active policy, version ${c.policy}.`, fix: "See what the room declares: artroom acts" }; // G5:cli-undeclared
          // The meaning the user read is not the active one: nothing is signed. This is what the room would answer.
          if (a.binding !== given) // G5:cli-stale
            return {
              refused: true,
              rule: "binding-stale",
              reason: `The act was prepared for ${kind} as ${given}; the active declaration's binding is ${a.binding}, in policy version ${c.policy}.`,
              fix: "Read the active declaration. Do the act again under its binding only if that meaning is still what you intend.",
              current: { binding: a.binding, policy: c.policy },
            };
          const target = targetOf(ctx, room);
          const shape = shapeOf(target);
          const fields = shape === null ? null : fieldsOf(a.declaration, shape);
          if (shape === null || fields === null) throw new UsageError(`${kind} does not act on that target. It takes: ${targetsOf(a.declaration).join(", ")}. See: artroom acts ${kind}`); // G5:cli-target
          let body: Record<string, Json>;
          try {
            body = bodyOf(fields, base, list(ctx.values, "set"));
          } catch (e) {
            if (e instanceof FieldError) throw new UsageError(e.message);
            throw e;
          }
          if (because.length > 0) body["because"] = because as unknown as Json;
          // What the room already knows is read for the user, as the named commands do: the lease, the generation, the head.
          const lane = target !== null && "lane" in target ? target.lane : undefined;
          // Only a step's own field is read from the room. A field the declaration gives one of these names is the
          // application's, with a meaning of its own, and is left as the user gave it.
          const wants = (name: string) => fields.some((f) => f.name === name && f.from === "step") && body[name] === undefined; // G5:cli-step-field-only
          if (lane !== undefined && wants("lease") && fields.find((f) => f.name === "lease")!.required) {
            const h = await held(api, lane, room.member);
            if (isRefusal(h)) return h;
            body["lease"] = h.lease.generation; // G5:cli-lease
          }
          if (lane !== undefined && wants("expectedGeneration")) {
            const l = await api.lane(lane);
            if (l !== null) body["expectedGeneration"] = l.generation; // G5:cli-generation
          }
          if (lane !== undefined && shape === "version" && wants("head")) {
            const p = await api.proposal({ lane, generation: (target as { generation: number }).generation });
            if (p !== null) body["head"] = p.head; // G5:cli-head
          }
          const lacks = missing(fields, body);
          if (lacks.length > 0) throw new UsageError(`${kind} on target ${shape} also needs: ${lacks.map((n) => `--set ${n}=…`).join(" ")}. See: artroom acts ${kind}`); // G5:cli-missing
          return api.act(kind, target, body, { binding: given as Binding, ...opts }); // G5:cli-binding-given
        },
      });
      // A run that finishes an act from the journal finishes the act that was saved, whatever kind this command line
      // names: the saved bytes go back unchanged (R-IDEM-2). So the act is named from what was saved and recorded,
      // never from this run's arguments, and a run that named another kind is told which act it finished. It is told
      // what this run did: the saved act went to the room again, or its answer was already in the journal and nothing
      // was sent.
      const saved = prepared?.kind ?? kind; // G5:cli-saved-kind
      if (saved !== kind) {
        const did = kept === true ? `That act had already been answered, and this is its result. Nothing was sent, and no ${kind} act was made.` : `That act was sent again as it was saved; no ${kind} act was made.`; // G5:cli-saved-kind-state
        ctx.io.err(`This idempotency key belongs to a saved ${saved} act. ${did}`); // G5:cli-saved-kind-told
      }
      if (isRefusal(out)) {
        const code = refused(ctx, out);
        if (!ctx.json && out.rule === "binding-stale") for (const l of await staleText(ctx, reader, saved, prepared?.binding ?? given)) ctx.io.err(l);
        return code;
      }
      // The words are those of the act as recorded: its own kind (`DeclaredRecord.kind`), under the declarations of its
      // own seq. They are read after the answer, for a new act and for one finished from the journal alike, and only
      // when words are printed.
      const meaning = ctx.json ? undefined : await recordedMeaning(ctx, out.seq, out.kind); // G5:cli-recorded-json
      const lines = [`Done: ${meaning !== undefined ? `${meaning.label} (${out.kind})` : out.kind}, recorded as ${out.id}.`]; // G5:cli-label
      // An act that opened a thread: name the thread as every reader does, by its goal, or by this act's label and its
      // first text field by name, from the body that was sent. Without the declaration it is named by its ID.
      const opened = out as { lane?: unknown; goal?: unknown; effect?: { type?: unknown } };
      if (opened.effect?.type === "opened" && typeof opened.lane === "string") {
        const opening = meaning !== undefined ? { meaning, body: prepared?.body } : undefined; // G5:cli-thread
        const title = threadTitle({ lane: opened.lane, goal: typeof opened.goal === "string" ? opened.goal : "" }, opening);
        lines.push(`Thread: ${title} (lane ${opened.lane}).`);
      }
      return print(ctx, out, () => lines);
    },
  },

  "agents-md": {
    options: { mcp: { type: "boolean" } },
    async run(ctx) {
      const { room } = roomOf(ctx);
      const block = agentsMd({ room: room.name, ...(ctx.values["mcp"] === true && room.mcp ? { mcp: room.mcp } : {}) });
      return print(ctx, { block }, () => block.split("\n"));
    },
  },

  mcp: {
    options: { toolset: { type: "string" } },
    async run(ctx) {
      const { StdioServerTransport, callerFromRoster, serveArtroomStdio, toolsetOf } = await import("@generalbusiness/artroom-mcp/stdio");
      // `--toolset` is the stdio form of the MCP URL's `?toolset=`: builder, reviewer, observer or all. An unknown name
      // is bad-request, before anything is asked of the room.
      const toolset = toolsetOf(str(ctx.values, "toolset"));
      const { api, room } = await open(ctx);
      // The tool list follows this credential's authorization, read from the roster at each `tools/list` (R-API-14):
      // a key file is the member's own key; a bearer file acts under the session's delegation, the one its redemption
      // recorded. (A credential saved before that ID was kept names none: then it is the key's latest delegation.)
      const session = room.delegation !== undefined ? { key: room.key, session: true, delegation: room.delegation } : { key: room.key, session: true }; // GM:cli-delegation
      const who = room.custody === "room" ? session : { key: room.key }; // GM:cli-caller
      const caller = async () => callerFromRoster(await api.members(), who);
      const asked = toolset !== undefined ? { toolset } : {}; // GM:cli-toolset
      const streams = ctx.io.stdio;
      const handle = serveArtroomStdio(api, { caller, ...asked }, streams ? { transport: new StdioServerTransport(streams.stdin, streams.stdout) } : {});
      await new Promise<void>((resolve) => (streams?.stdin ?? process.stdin).once("end", resolve));
      await handle.close();
      return EXIT.ok;
    },
  },
};

export async function run(argv: readonly string[], rawIo: Io): Promise<number> {
  const secrets = new Set<string>();
  // Every line goes through the scrubber, whatever printed it.
  const io: Io = { ...rawIo, out: (l) => rawIo.out(scrub(secrets, l)), err: (l) => rawIo.err(scrub(secrets, l)) };
  const [name, ...rest] = argv;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") {
    io.out(USAGE);
    return name === undefined ? EXIT.usage : EXIT.ok;
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (command === undefined) {
    io.err(`artroom: there is no command "${name}". Run artroom help for the list.`);
    return EXIT.usage;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: [...rest], options: { ...COMMON, ...command.options }, allowPositionals: true, strict: true });
  } catch (e) {
    io.err(`artroom ${name}: ${(e as Error).message.replace(/\. To specify.*$/s, ".")}`);
    io.err("Run artroom help for the options.");
    return EXIT.usage;
  }
  const ctx: Ctx = {
    io,
    store: new Store(io.env),
    values: parsed.values as Values,
    args: parsed.positionals,
    json: parsed.values["json"] === true,
    secrets,
    step: (s) => rawIo.step?.(s),
  };
  if (parsed.values["help"] === true) {
    io.out(USAGE);
    return EXIT.ok;
  }
  try {
    return await command.run(ctx);
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`artroom ${name}: ${e.message}`);
      return EXIT.usage;
    }
    if (e instanceof SchemaError) {
      io.err(`artroom ${name}: ${e.message}`);
      return EXIT.failed;
    }
    // An act the journal holds can be finished: say exactly how.
    const pending = ctx.act !== undefined && ctx.store.entry(ctx.act.room, "act", ctx.act.key) !== undefined ? ctx.act.key : undefined;
    if (isArtroomError(e)) {
      if (ctx.json) io.out(JSON.stringify(pending ? { ...e, idempotencyKey: pending } : e, null, 2));
      else {
        io.err(errorText(e)[0]!);
        if (pending) io.err(`  To finish it, repeat the same command with --idempotency-key ${pending}. If the room recorded it, you get the original result.`);
        else for (const l of errorText(e).slice(1)) io.err(l);
      }
      return EXIT.failed;
    }
    io.err(`artroom ${name}: ${e instanceof Error ? e.message : String(e)}`);
    if (pending) io.err(`  To finish it, repeat the same command with --idempotency-key ${pending}.`);
    return EXIT.failed;
  }
}
