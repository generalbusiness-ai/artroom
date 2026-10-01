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

import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  agentsMd,
  connect,
  generateSigner,
  isArtroomError,
  isRefusal,
  join,
  LOST_REDEMPTION,
  newIdempotencyKey,
  redeem,
  signerFromJwk,
  type ClientActOptions,
  type ClientOptions,
  type HttpRoomClient,
} from "@generalbusiness/artroom-client";
import type {
  ActId,
  Claim,
  Held,
  HttpRoom,
  LandOp,
  Lane,
  LaneId,
  NoteAnchor,
  OpId,
  Reason,
  Refusal,
  Result,
  RoomId,
  Sha,
} from "@generalbusiness/artroom-contract";
import { Store, type Config, type JournalEntry, type RoomConfig } from "./config.ts";
import { attentionText, claimText, errorText, explainText, landText, logText, proposalText, refusalText, short } from "./format.ts";
import { clearWorkspace, configureWorkspace, gitDir, head as gitHead, REMOTE } from "./git.ts";
import { parseInvitation } from "./link.ts";

export interface Io {
  out(line: string): void;
  err(line: string): void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  /** For tests: the fetch the client uses. */
  readonly fetch?: typeof fetch;
  /** For tests: called after each durable local step, by name. Throwing here simulates an interruption. */
  readonly step?: (name: string) => void;
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

Agents
  artroom agents-md [--mcp]             Print the block that teaches an agent the loop, for AGENTS.md.
  artroom mcp                           Run the MCP tools over stdio, signing with your key.

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
    ...(ctx.values["verbose"] === true ? { log: (l: string) => ctx.io.err(`  ${l}`) } : {}),
  };
}

async function open(ctx: Ctx): Promise<{ api: HttpRoomClient; id: RoomId; room: RoomConfig }> {
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
 * Runs one act through the journal. With an `--idempotency-key` the journal
 * holds, it sends that prepared act again, unchanged and without any
 * preflight reads, so the room returns the original result (R-IDEM-2).
 * Otherwise `start` resolves the act from current state, and the client
 * hands back the prepared act, which is journaled before it is first sent.
 */
async function journaled<T>(ctx: Ctx, api: HttpRoomClient, room: RoomId, command: string, start: (opts: ClientActOptions) => Promise<Result<T>>): Promise<Result<T>> {
  const key = str(ctx.values, "idempotency-key") ?? newIdempotencyKey();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) throw new UsageError("An idempotency key is 1 to 64 characters from A-Z, a-z, 0-9, '_' and '-'.");
  ctx.act = { room, key };
  const saved = ctx.store.entry(room, "act", key);
  let out: Result<T>;
  if (saved !== undefined) {
    if (saved.command !== command) throw new UsageError(`The idempotency key ${key} belongs to an unfinished artroom ${saved.command}. Repeat that command with it.`);
    try {
      out = (await api.replay(saved.prepared)) as Result<T>;
    } catch (e) {
      // A bearer act has no signed envelope to keep: once the token is refused, there is nothing to resend (R-CRED-10).
      if (isArtroomError(e) && e.code === "unauthenticated" && saved.prepared.signed === undefined) {
        ctx.store.finish(room, "act", key);
        ctx.act = undefined;
        throw {
          ...e,
          message: "The bearer token is no longer valid, so this act cannot be sent again. If the room recorded it, a member with a read session can find it with artroom log.",
        };
      }
      throw e;
    }
  } else {
    out = await start({
      idempotencyKey: key,
      onPrepared: (prepared) => {
        const entry: JournalEntry = { v: 1, type: "act", id: key, room, command, prepared };
        ctx.store.journal(entry);
        ctx.step("act-journaled");
      },
    });
  }
  ctx.store.finish(room, "act", key);
  ctx.act = undefined;
  return out;
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
      if (r.landing?.op === op) delete r.landing;
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
        entry = { v: 1, type: "login", id: inv.invitation, room: inv.room, url: inv.url, idempotencyKey: newIdempotencyKey(), key: made.signer.key, jwk: made.jwk! };
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
        entry = { v: 1, type: "redeem", id: inv.invitation, room: inv.room, url: inv.url };
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
      ctx.store.saveBearer(inv.room, bearer);
      ctx.step("bearer-saved");
      const name = await connect({ url: entry.url }, inv.room, { kind: "bearer", token: bearer }, clientOptions(ctx)).then(
        (a) => a.name,
        () => inv.room,
      );
      const path = ctx.store.bearerPath(inv.room);
      const config = ctx.store.read();
      config.rooms[inv.room] = { url: entry.url, name, member: shown.member, role: shown.role, custody: "room", key: shown.key, mcp: shown.mcp, invitation: inv.invitation };
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
      const { api, id, room } = await open(ctx);
      const because = list(ctx.values, "because").map(parseReason);
      const plan = str(ctx.values, "plan");
      const goal = str(ctx.values, "goal");
      const target = str(ctx.values, "lane") as LaneId | undefined;
      if (target === undefined && goal === undefined) throw new UsageError('Say what you will do: --goal "..."');
      const out = await journaled(ctx, api, id, "claim", async (opts) => {
        if (target === undefined) return api.claim({ goal: goal!, scope: ctx.args, ...(plan ? { plan } : {}), ...(because.length ? { because } : {}) }, opts);
        const lane = await api.lane(target);
        const expectedGeneration = int(ctx.values, "expect") ?? lane?.generation ?? 0;
        const mine = lane?.state === "held" && lane.lease.holder === room.member;
        const body = { scope: ctx.args, expectedGeneration, ...(goal ? { goal } : {}), ...(plan ? { plan } : {}), ...(because.length ? { because } : {}) };
        return api.claim(mine ? { ...body, lane: lane as Held } : { ...body, lane: target }, opts);
      });
      if (isRefusal(out)) return refused(ctx, out);
      updateRoom(ctx, id, (r) => {
        r.lane = out.lane;
      });
      return print(ctx, out, () => claimText(out as Claim));
    },
  },

  workspace: {
    options: { timeout: { type: "string" } },
    async run(ctx) {
      const { api, room } = await open(ctx);
      if (gitDir(ctx.io.cwd) === undefined) throw new UsageError("Run artroom workspace inside your git repository, so it can set up the remote.");
      const h = await held(api, laneOf(ctx, room), room.member);
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
      const file = configureWorkspace(ctx.io.cwd, grant.remote, grant.token);
      return print(ctx, { op: ready, remote: grant.remote, remoteName: REMOTE, leaseGeneration: grant.leaseGeneration, expiresAt: grant.expiresAt, credentialFile: file }, () => [
        `Workspace ready for lane ${h.lane}, lease ${grant.leaseGeneration}.`,
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
      const { api, id, room } = await open(ctx);
      const out = await journaled(ctx, api, id, "propose", async (opts) => {
        const sha = str(ctx.values, "head") ?? gitHead(ctx.io.cwd);
        if (sha === undefined || !/^[0-9a-f]{40}$/.test(sha)) throw new UsageError("Give the commit to propose with --head SHA, or run this inside the repository.");
        const h = await held(api, laneOf(ctx, room), room.member);
        if (isRefusal(h)) return h;
        return api.propose(h, { head: sha as Sha, expectedGeneration: int(ctx.values, "expect") ?? h.generation, summary }, opts);
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => proposalText(out));
    },
  },

  land: {
    options: { wait: { type: "boolean" }, timeout: { type: "string" }, generation: { type: "string" } },
    async run(ctx) {
      const { api, id, room } = await open(ctx);
      const landing = await journaled(ctx, api, id, "land", async (opts) => {
        const h = await held(api, laneOf(ctx, room), room.member);
        if (isRefusal(h)) return h;
        const generation = int(ctx.values, "generation") ?? h.generation;
        if (generation === 0) throw new UsageError("Nothing is proposed on this lane yet. Run artroom propose first.");
        const proposal = await api.proposal({ lane: h.lane, generation });
        if (proposal === null) throw new UsageError(`Lane ${h.lane} has no generation ${generation}.`);
        return api.land(h, proposal, opts);
      });
      if (isRefusal(landing)) return refused(ctx, landing);
      updateRoom(ctx, id, (r) => {
        r.landing = { op: landing.op.id, lane: landing.lane };
      });
      ctx.step("landing-saved");
      if (ctx.values["wait"] !== true) {
        return print(ctx, landing, () => [`Landing ${landing.op.id} started for generation ${landing.generation} of lane ${landing.lane}.`, "Next: artroom wait"]);
      }
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
      const { api, id, room } = await open(ctx);
      const out = await journaled(ctx, api, id, "renew", async (opts) => {
        const h = await held(api, laneOf(ctx, room), room.member);
        return isRefusal(h) ? h : api.renew(h, opts);
      });
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [`Renewed lane ${out.lane}: lease ${out.lease.generation} until ${out.lease.expiresAt}.`]);
    },
  },

  release: {
    options: { message: { type: "string", short: "m" } },
    async run(ctx) {
      const { api, id, room } = await open(ctx);
      const note = str(ctx.values, "message");
      const out = await journaled(ctx, api, id, "release", async (opts) => {
        const h = await held(api, laneOf(ctx, room), room.member);
        return isRefusal(h) ? h : api.release(h, note === undefined ? {} : { note }, opts);
      });
      if (isRefusal(out)) return refused(ctx, out);
      const cleared = clearWorkspace(ctx.io.cwd);
      updateRoom(ctx, id, (r) => {
        if (r.lane === out.lane) delete r.lane;
      });
      return print(ctx, out, () => [
        `Released lane ${out.lane}${out.note === undefined ? "" : ", with a handover note"}.`,
        ...(cleared ? ["Removed the workspace credential from this repository."] : []),
      ]);
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
      const { api, id } = await open(ctx);
      const replyTo = str(ctx.values, "reply-to") as ActId | undefined;
      const out = await journaled(ctx, api, id, "note", async (opts) => {
        let anchor: NoteAnchor;
        if (m === null) anchor = { act: target as ActId };
        else {
          const p = await api.proposal({ lane: m[1] as LaneId, generation: Number(m[2]) });
          if (p === null) throw new UsageError(`There is no proposal ${m[1]}#${m[2]}.`);
          anchor = { lane: p.lane, generation: p.generation, head: p.head, path: m[3]!, line: Number(m[4]), ...(m[5] ? { endLine: Number(m[5]) } : {}) };
        }
        return api.note(anchor, { text, ...(replyTo ? { replyTo } : {}) }, opts);
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
      const { api, id } = await open(ctx);
      const dependsOn = list(ctx.values, "depends-on");
      const out = await journaled(ctx, api, id, "review", async (opts) => {
        const p = await api.proposal(ref);
        if (p === null) throw new UsageError(`There is no proposal ${ref.lane}#${ref.generation}.`);
        const headSha = (str(ctx.values, "head") ?? p.head) as Sha;
        return api.review({ ...ref, head: headSha }, { verdict: approve ? "approve" : "object", scope, ...(dependsOn.length ? { dependsOn } : {}), text }, opts);
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
      return print(ctx, page, () => logText(page.acts, page.head, page.publishedThrough, page.more, page.cursor));
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
    options: {},
    async run(ctx) {
      const { api } = await open(ctx);
      const { serveArtroomStdio } = await import("@generalbusiness/artroom-mcp/stdio");
      const handle = serveArtroomStdio(api);
      await new Promise<void>((resolve) => process.stdin.once("end", resolve));
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
