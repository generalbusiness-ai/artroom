/**
 * The `artroom` command. `run()` takes the arguments and an `Io`, and
 * returns the exit code, so tests run it in process:
 *
 *   0  done
 *   1  failed: the room could not be reached, or another error
 *   2  usage: the command line is wrong
 *   3  refused: the room said no; the output gives the rule, reason and fix
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
  type ClientOptions,
} from "@generalbusiness/artroom-client";
import type {
  ActId,
  Claim,
  Held,
  HttpRoom,
  Lane,
  LaneId,
  NoteAnchor,
  Proposal,
  Reason,
  Refusal,
  RoomId,
  Sha,
} from "@generalbusiness/artroom-contract";
import { Store, type Config, type RoomConfig } from "./config.ts";
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
  artroom land [--wait] [--timeout S]   Land the latest proposal, and wait for the outcome.
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
retry an act safely; --verbose to show each request. Exit codes: 0 done, 1 failed, 2 usage, 3 refused.`;

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
}

// ------------------------------------------------------------------ output

function print(ctx: Ctx, json: unknown, lines: () => string[]): number {
  if (ctx.json) ctx.io.out(JSON.stringify(json, null, 2));
  else for (const l of lines()) ctx.io.out(l);
  return EXIT.ok;
}

function refused(ctx: Ctx, r: Refusal): number {
  if (ctx.json) ctx.io.out(JSON.stringify(r, null, 2));
  else for (const l of refusalText(r)) ctx.io.err(l);
  return EXIT.refused;
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

async function open(ctx: Ctx): Promise<{ api: HttpRoom; id: RoomId; room: RoomConfig; config: Config }> {
  const { config, id, room } = roomOf(ctx);
  const creds =
    room.custody === "room"
      ? { kind: "bearer" as const, token: ctx.store.loadBearer(id) }
      : { kind: "key" as const, signer: await signerFromJwk(ctx.store.loadKey(id).jwk) };
  const api = await connect({ url: room.url }, id, creds, clientOptions(ctx));
  return { api, id, room, config };
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

function actOpts(ctx: Ctx) {
  const key = str(ctx.values, "idempotency-key");
  return key === undefined ? undefined : { idempotencyKey: key };
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

// --------------------------------------------------------------- commands

type Command = { readonly options: ParseArgsConfig["options"]; run(ctx: Ctx): Promise<number> };

const COMMANDS: Record<string, Command> = {
  login: {
    options: {},
    async run(ctx) {
      const inv = parseInvitation(ctx.args[0] ?? "");
      if (typeof inv === "string") throw new UsageError(inv);
      // The key and the join's idempotency key are saved before redeeming. If the response is lost,
      // running the same command again repeats the same join, and the room returns its result (R-IDEM-2).
      let pending = ctx.store.loadPending(inv.room);
      if (pending?.invitation !== inv.invitation) {
        const made = await generateSigner({ extractable: true });
        pending = { v: 1, room: inv.room, invitation: inv.invitation, idempotencyKey: newIdempotencyKey(), key: made.signer.key, jwk: made.jwk! };
        ctx.store.savePending(pending);
      }
      const signer = await signerFromJwk(pending.jwk);
      let joined;
      try {
        joined = await join({ url: inv.url }, inv.room, { invitation: inv.invitation, secret: inv.secret, signer }, { ...clientOptions(ctx), idempotencyKey: pending.idempotencyKey });
      } catch (e) {
        if (isArtroomError(e) && e.retryable) {
          if (ctx.json) ctx.io.out(JSON.stringify(e, null, 2));
          else {
            ctx.io.err(`Error (${e.code}): the room did not answer the join.`);
            ctx.io.err("  Your new key is saved. Run the same artroom login command again: it repeats the same join, so it cannot join twice.");
          }
          return EXIT.failed;
        }
        throw e;
      }
      if (isRefusal(joined)) {
        ctx.store.removePending(inv.room);
        return refused(ctx, joined);
      }
      const path = ctx.store.saveKey({ v: 1, room: inv.room, member: joined.member, key: signer.key, jwk: pending.jwk });
      ctx.store.removePending(inv.room);
      const api = await connect({ url: inv.url }, inv.room, { kind: "key", signer }, clientOptions(ctx));
      const config = ctx.store.read();
      config.rooms[inv.room] = { url: inv.url, name: api.name, member: joined.member, role: joined.role, custody: "client", key: signer.key };
      config.current = inv.room;
      ctx.store.write(config);
      return print(ctx, { room: inv.room, name: api.name, member: joined.member, role: joined.role, key: joined.key, keyFile: path, record: joined.record.id }, () => [
        `Joined ${api.name} as ${joined.member} (${joined.role}).`,
        `Your key ${joined.key} is in ${path}, readable only by you.`,
        'Next: artroom claim <paths> --goal "<what you will do>"',
      ]);
    },
  },

  redeem: {
    options: {},
    async run(ctx) {
      const inv = parseInvitation(ctx.args[0] ?? "");
      if (typeof inv === "string") throw new UsageError(inv);
      let out;
      try {
        out = await redeem({ url: inv.url }, inv.room, { invitation: inv.invitation, secret: inv.secret }, clientOptions(ctx));
      } catch (e) {
        if (isArtroomError(e) && e.maybeRecorded) {
          if (ctx.json) ctx.io.out(JSON.stringify(e, null, 2));
          else ctx.io.err(`Error (${e.code}): ${LOST_REDEMPTION}`);
          return EXIT.failed;
        }
        throw e;
      }
      if (isRefusal(out)) return refused(ctx, out);
      const path = ctx.store.saveBearer(inv.room, out.bearer);
      const { bearer: _hidden, ...shown } = out;
      const named = await connect({ url: inv.url }, inv.room, { kind: "bearer", token: out.bearer }, clientOptions(ctx)).then((a) => a.name, () => inv.room);
      const config = ctx.store.read();
      config.rooms[inv.room] = { url: inv.url, name: named, member: out.member, role: out.role, custody: "room", key: out.key, mcp: out.mcp };
      config.current = inv.room;
      ctx.store.write(config);
      return print(ctx, { ...shown, bearerFile: path }, () => [
        `Redeemed an MCP invitation for ${out.member} (${out.role}), valid until ${out.expiresAt}.`,
        `The bearer token is in ${path}, readable only by you. It is not shown anywhere else.`,
        `MCP URL: ${out.mcp}`,
        `Next: give your agent that URL with the header "Authorization: Bearer <token from the file>", for example:`,
        `  claude mcp add --transport http artroom ${out.mcp} --header "Authorization: Bearer $(cat ${path})"`,
      ]);
    },
  },

  claim: {
    options: { goal: { type: "string" }, plan: { type: "string" }, because: { type: "string", multiple: true }, expect: { type: "string" } },
    async run(ctx) {
      if (ctx.args.length === 0) throw new UsageError('Give the paths to claim, for example: artroom claim "src/api/**" --goal "Rate-limit login"');
      const { api, id, room, config } = await open(ctx);
      const because = list(ctx.values, "because").map(parseReason);
      const plan = str(ctx.values, "plan");
      const goal = str(ctx.values, "goal");
      const target = str(ctx.values, "lane") as LaneId | undefined;
      let out;
      if (target === undefined) {
        if (goal === undefined) throw new UsageError('Say what you will do: --goal "..."');
        out = await api.claim({ goal, scope: ctx.args, ...(plan ? { plan } : {}), ...(because.length ? { because } : {}) }, actOpts(ctx));
      } else {
        const lane = await api.lane(target);
        const expectedGeneration = int(ctx.values, "expect") ?? lane?.generation ?? 0;
        const mine = lane?.state === "held" && lane.lease.holder === room.member;
        const body = { scope: ctx.args, expectedGeneration, ...(goal ? { goal } : {}), ...(plan ? { plan } : {}), ...(because.length ? { because } : {}) };
        out = await api.claim(mine ? { ...body, lane: lane as Held } : { ...body, lane: target }, actOpts(ctx));
      }
      if (isRefusal(out)) return refused(ctx, out);
      config.rooms[id]!.lane = out.lane;
      ctx.store.write(config);
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
      const file = configureWorkspace(ctx.io.cwd, grant.remote, grant.token);
      return print(ctx, { op: ready, remote: grant.remote, remoteName: REMOTE, leaseGeneration: grant.leaseGeneration, expiresAt: grant.expiresAt, credentialFile: file }, () => [
        `Workspace ready for lane ${h.lane}, lease ${grant.leaseGeneration}.`,
        `Git remote "${REMOTE}": ${grant.remote}`,
        `Git can push there until ${grant.expiresAt}. The token is in ${file}, readable only by you, and is not shown.`,
        "Next: git push artroom HEAD, then artroom propose -m \"<what changed and why>\"",
      ]);
    },
  },

  propose: {
    options: { message: { type: "string", short: "m" }, head: { type: "string" }, expect: { type: "string" } },
    async run(ctx) {
      const summary = str(ctx.values, "message");
      if (summary === undefined) throw new UsageError('Say what changed and why: -m "..."');
      const { api, room } = await open(ctx);
      const sha = str(ctx.values, "head") ?? gitHead(ctx.io.cwd);
      if (sha === undefined || !/^[0-9a-f]{40}$/.test(sha)) throw new UsageError("Give the commit to propose with --head SHA, or run this inside the repository.");
      const h = await held(api, laneOf(ctx, room), room.member);
      if (isRefusal(h)) return refused(ctx, h);
      const expectedGeneration = int(ctx.values, "expect") ?? h.generation;
      const out = await api.propose(h, { head: sha as Sha, expectedGeneration, summary }, actOpts(ctx));
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => proposalText(out));
    },
  },

  land: {
    options: { wait: { type: "boolean" }, timeout: { type: "string" }, generation: { type: "string" } },
    async run(ctx) {
      const { api, room } = await open(ctx);
      const h = await held(api, laneOf(ctx, room), room.member);
      if (isRefusal(h)) return refused(ctx, h);
      const generation = int(ctx.values, "generation") ?? h.generation;
      if (generation === 0) throw new UsageError("Nothing is proposed on this lane yet. Run artroom propose first.");
      const proposal = await api.proposal({ lane: h.lane, generation });
      if (proposal === null) throw new UsageError(`Lane ${h.lane} has no generation ${generation}.`);
      const landing = await api.land(h, proposal, actOpts(ctx));
      if (isRefusal(landing)) return refused(ctx, landing);
      if (ctx.values["wait"] !== true) {
        return print(ctx, landing, () => [`Landing ${landing.op.id} started for generation ${generation}: ${short(proposal.head)}.`, "Next: artroom land --wait, or artroom attention later."]);
      }
      const timeoutMs = (int(ctx.values, "timeout") ?? 120) * 1000;
      const op = await api.wait(landing.op, { until: ["landed", "aborted", "retryable", "failed", "unresolved"], timeoutMs });
      const code = op.state === "landed" ? EXIT.ok : EXIT.failed;
      print(ctx, { ...landing, op }, () => [`Landing ${op.id} for generation ${generation}: ${short(proposal.head)}.`, ...landText(op)]);
      return code;
    },
  },

  renew: {
    options: {},
    async run(ctx) {
      const { api, room } = await open(ctx);
      const h = await held(api, laneOf(ctx, room), room.member);
      if (isRefusal(h)) return refused(ctx, h);
      const out = await api.renew(h, actOpts(ctx));
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [`Renewed lane ${out.lane}: lease ${out.lease.generation} until ${out.lease.expiresAt}.`]);
    },
  },

  release: {
    options: { message: { type: "string", short: "m" } },
    async run(ctx) {
      const { api, id, room, config } = await open(ctx);
      const h = await held(api, laneOf(ctx, room), room.member);
      if (isRefusal(h)) return refused(ctx, h);
      const note = str(ctx.values, "message");
      const out = await api.release(h, note === undefined ? {} : { note }, actOpts(ctx));
      if (isRefusal(out)) return refused(ctx, out);
      const cleared = clearWorkspace(ctx.io.cwd);
      if (config.rooms[id]!.lane === out.lane) delete config.rooms[id]!.lane;
      ctx.store.write(config);
      return print(ctx, out, () => [
        `Released lane ${out.lane}${note === undefined ? "" : ", with a handover note"}.`,
        ...(cleared ? ["Removed the workspace credential from this repository."] : []),
      ]);
    },
  },

  note: {
    options: { message: { type: "string", short: "m" }, "reply-to": { type: "string" } },
    async run(ctx) {
      const text = str(ctx.values, "message");
      if (text === undefined) throw new UsageError('Give the note: -m "..."');
      const { api } = await open(ctx);
      const target = ctx.args[0] ?? "";
      let anchor: NoteAnchor;
      if (/^act_\d+_[0-9a-f]{8}$/.test(target)) anchor = { act: target as ActId };
      else {
        const m = /^(act_\d+_[0-9a-f]{8})#(\d+):(.+):(\d+)(?:-(\d+))?$/.exec(target);
        if (!m) throw new UsageError("Anchor the note on an act ID, or on LANE#GENERATION:PATH:LINE.");
        const p = await api.proposal({ lane: m[1] as LaneId, generation: Number(m[2]) });
        if (p === null) throw new UsageError(`There is no proposal ${m[1]}#${m[2]}.`);
        anchor = { lane: p.lane, generation: p.generation, head: p.head, path: m[3]!, line: Number(m[4]), ...(m[5] ? { endLine: Number(m[5]) } : {}) };
      }
      const replyTo = str(ctx.values, "reply-to") as ActId | undefined;
      const out = await api.note(anchor, { text, ...(replyTo ? { replyTo } : {}) }, actOpts(ctx));
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
      const { api } = await open(ctx);
      const p = await api.proposal(ref);
      if (p === null) throw new UsageError(`There is no proposal ${ref.lane}#${ref.generation}.`);
      const headSha = (str(ctx.values, "head") ?? p.head) as Sha;
      const dependsOn = list(ctx.values, "depends-on");
      const out = await api.review({ ...ref, head: headSha }, { verdict: approve ? "approve" : "object", scope, ...(dependsOn.length ? { dependsOn } : {}), text }, actOpts(ctx));
      if (isRefusal(out)) return refused(ctx, out);
      return print(ctx, out, () => [
        `${approve ? "Approved" : "Objected to"} ${ref.lane}#${ref.generation} at ${short(headSha)}.`,
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

export async function run(argv: readonly string[], io: Io): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") {
    io.out(USAGE);
    return name === undefined ? EXIT.usage : EXIT.ok;
  }
  const command = COMMANDS[name];
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
  const ctx: Ctx = { io, store: new Store(io.env), values: parsed.values as Values, args: parsed.positionals, json: parsed.values["json"] === true };
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
    if (isArtroomError(e)) {
      if (ctx.json) io.out(JSON.stringify(e, null, 2));
      else for (const l of errorText(e)) io.err(l);
      return EXIT.failed;
    }
    io.err(`artroom ${name}: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT.failed;
  }
}

export type { Proposal };
