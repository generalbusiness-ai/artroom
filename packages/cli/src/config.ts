/**
 * Where the CLI keeps what it knows: one config file, one key file per room
 * and, for MCP invitations, one bearer file per room. Every file is written
 * readable only by the user (0600), in a directory only the user can enter
 * (0700). Nothing secret is ever printed.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KeyId, LaneId, MemberId, OpId, Redeemed, RoomId, Role } from "@generalbusiness/artroom-contract";
import type { PreparedAct, PrivateJwk } from "@generalbusiness/artroom-client";

export interface RoomConfig {
  readonly url: `https://${string}`;
  readonly name: string;
  readonly member: MemberId;
  readonly role: Role;
  /** `client`: a key file here signs. `room`: a bearer file here reads, and the room signs. */
  readonly custody: "client" | "room";
  readonly key: KeyId;
  readonly mcp?: string;
  /** The lane the next command acts on, from the last `claim`. Change it only with `setLane` in main.ts. */
  lane?: LaneId;
  /** Bumped by every change of `lane`, even to an earlier value: a recovered act applies only if it is unchanged. */
  laneRev?: number;
  /** Who made the last change of `lane`: an act's idempotency key, or a command name. */
  laneBy?: string;
  /** The invitation this room was joined or redeemed with, so repeating that command reports it is done. */
  invitation?: string;
  /** The landing operation `artroom wait` follows, from the last `land`. Change it only with `setLanding`. */
  landing?: { readonly op: OpId; readonly lane: LaneId };
  landingRev?: number;
  landingBy?: string;
  /** The credential `artroom workspace` installed for each lane: where, for which lease, and its installation ID. */
  workspaces?: Record<LaneId, Installed>;
  /** The repositories (`.git` directories) this Room has set up workspaces in, whose owner records a release consults. */
  destinations?: string[];
}

/**
 * The version of the config and journal files this CLI writes. Version 1
 * (no `v` in the config) was written before revisions, installation IDs
 * and lease-bound intents. Version 2 kept workspace ownership in the
 * config; version 3 keeps it at the repository (git.ts `Owner`).
 * `decode` below reads both older versions conservatively.
 */
export const SCHEMA = 3;

/** A file written by a newer artroom: refused, never guessed at. */
export class SchemaError extends Error {}

export interface Config {
  v?: typeof SCHEMA;
  current?: RoomId;
  rooms: Record<RoomId, RoomConfig>;
}

export interface KeyFile {
  readonly v: 1;
  readonly room: RoomId;
  readonly member: MemberId;
  readonly key: KeyId;
  readonly jwk: PrivateJwk;
}

/** One installed workspace credential. Its file's first line names the same lane, lease and installation. */
export interface Installed {
  readonly file: string;
  readonly lease: number;
  readonly install: string;
}

/**
 * What an act changes locally once the room answers, and the local state it
 * expects to find then. Recorded with the act before it is sent, so a
 * recovery later changes only what this act owns (see `applyLocal` in main.ts).
 */
export type LocalIntent =
  | { readonly kind: "none" }
  /** `claim`: select the claimed lane, if no local action changed the selection since `rev`. */
  | { readonly kind: "select-lane"; readonly rev: number }
  /** `land`: follow the started landing, if no local action changed the followed landing since `rev`. */
  | { readonly kind: "follow-landing"; readonly rev: number }
  /**
   * An act journaled by version 1, whose local change cannot be proved safe
   * now. Nothing local is changed; `steps` say what the user may do by hand.
   */
  | { readonly kind: "manual"; readonly steps: readonly string[] }
  /**
   * `release`: of `lane` at `lease`. For each repository where this Room set
   * up a workspace for the lane, the owner revision seen before the release
   * was sent: the cleanup there is done only if it is still that revision.
   */
  | {
      readonly kind: "release-lane";
      readonly lane: LaneId;
      readonly lease: number;
      readonly destinations: readonly { readonly dir: string; readonly rev: number }[];
      readonly laneRev: number;
      readonly landingRev: number;
    };

export type JournalEntry =
  | {
      readonly v: typeof SCHEMA;
      readonly type: "act";
      readonly id: string;
      readonly room: RoomId;
      readonly command: string;
      /** `prepared`: sent, or about to be, with no answer kept. `answered`: the room's answer is kept; local steps remain. */
      readonly state: "prepared" | "answered";
      readonly prepared: PreparedAct;
      /** The local change this act owns, fixed before it was sent. */
      readonly local: LocalIntent;
      readonly result?: unknown;
    }
  | {
      readonly v: typeof SCHEMA;
      readonly type: "login";
      readonly id: string;
      readonly room: RoomId;
      readonly url: `https://${string}`;
      readonly idempotencyKey: string;
      readonly key: KeyId;
      readonly jwk: PrivateJwk;
      readonly joined?: { readonly member: MemberId; readonly role: Role; readonly record: string };
    }
  | {
      readonly v: typeof SCHEMA;
      readonly type: "redeem";
      readonly id: string;
      readonly room: RoomId;
      readonly url: `https://${string}`;
      readonly redeemed?: Redeemed;
    };

/** `$ARTROOM_HOME`, else `$XDG_CONFIG_HOME/artroom`, else `~/.config/artroom`. */
export function configDir(env: Readonly<Record<string, string | undefined>>): string {
  if (env["ARTROOM_HOME"]) return env["ARTROOM_HOME"];
  return join(env["XDG_CONFIG_HOME"] || join(env["HOME"] || homedir(), ".config"), "artroom");
}

/** Writes a file readable only by the user, atomically. */
export function writePrivate(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export class Store {
  readonly dir: string;

  constructor(env: Readonly<Record<string, string | undefined>>) {
    this.dir = configDir(env);
  }

  #ensure(sub?: string): string {
    const d = sub ? join(this.dir, sub) : this.dir;
    mkdirSync(d, { recursive: true, mode: 0o700 });
    chmodSync(d, 0o700);
    return d;
  }

  get configPath(): string {
    return join(this.dir, "config.json");
  }

  keyPath(room: RoomId): string {
    return join(this.dir, "keys", `${room}.json`);
  }

  bearerPath(room: RoomId): string {
    return join(this.dir, "bearers", room);
  }

  read(): Config {
    if (!existsSync(this.configPath)) return { v: SCHEMA, rooms: {} };
    return decodeConfig(JSON.parse(readFileSync(this.configPath, "utf8")), this.configPath);
  }

  /** Always writes the current schema. A version 1 file becomes version 2 at its first write, atomically. */
  write(config: Config): void {
    this.#ensure();
    writePrivate(this.configPath, `${JSON.stringify({ ...config, v: SCHEMA }, null, 2)}\n`);
  }

  saveKey(file: KeyFile): string {
    this.#ensure("keys");
    const path = this.keyPath(file.room);
    writePrivate(path, `${JSON.stringify(file, null, 2)}\n`);
    return path;
  }

  loadKey(room: RoomId): KeyFile {
    return JSON.parse(readFileSync(this.keyPath(room), "utf8")) as KeyFile;
  }

  #entryPath(room: RoomId, type: JournalEntry["type"], id: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`not a journal ID: ${id}`);
    return join(this.dir, "journal", room, `${type}-${id}.json`);
  }

  /** Writes the entry before the work it records goes out. */
  journal(entry: JournalEntry): void {
    this.#ensure(join("journal", entry.room));
    writePrivate(this.#entryPath(entry.room, entry.type, entry.id), `${JSON.stringify(entry, null, 2)}\n`);
  }

  entry<T extends JournalEntry["type"]>(room: RoomId, type: T, id: string): Extract<JournalEntry, { type: T }> | undefined {
    const path = this.#entryPath(room, type, id);
    return existsSync(path) ? (decodeEntry(JSON.parse(readFileSync(path, "utf8")), path) as Extract<JournalEntry, { type: T }>) : undefined;
  }

  /** Removes every unfinished act a bearer session prepared for this room, and says how many. */
  forgetBearerActs(room: RoomId): number {
    const dir = join(this.dir, "journal", room);
    if (!existsSync(dir)) return 0;
    let n = 0;
    for (const file of readdirSync(dir)) {
      if (!file.startsWith("act-")) continue;
      const entry = decodeEntry(JSON.parse(readFileSync(join(dir, file), "utf8")), join(dir, file));
      if (entry.type === "act" && entry.state === "prepared" && entry.prepared.signed === undefined) {
        rmSync(join(dir, file), { force: true });
        n++;
      }
    }
    return n;
  }

  /** Removes the entry once its work is finished, locally as well as in the room. */
  finish(room: RoomId, type: JournalEntry["type"], id: string): void {
    rmSync(this.#entryPath(room, type, id), { force: true });
  }

  saveBearer(room: RoomId, token: string): string {
    this.#ensure("bearers");
    const path = this.bearerPath(room);
    writePrivate(path, `${token}\n`);
    return path;
  }

  loadBearer(room: RoomId): string {
    return readFileSync(this.bearerPath(room), "utf8").trim();
  }
}

// ------------------------------------------------------------------ schema

type Raw = Record<string, unknown>;

function newer(v: unknown, path: string): never {
  throw new SchemaError(`${path} was written by a newer artroom (schema ${String(v)}; this one reads 1 to ${SCHEMA}). Update artroom, then run the command again.`);
}

/**
 * Reads a config file. Version 1 had no revisions and mapped each lane to
 * a credential path. Its mappings become installations with no lease or
 * installation ID, which match no release, so nothing is removed on their
 * evidence alone.
 */
export function decodeConfig(raw: Raw, path: string): Config {
  const v = raw["v"] ?? 1;
  if (v === SCHEMA) return raw as unknown as Config;
  // Version 2 differs only in its room-level workspace revision, which version 3 no longer reads.
  if (v === 2) return { ...(raw as unknown as Config), v: SCHEMA };
  if (v !== 1) newer(v, path);
  const rooms: Record<string, RoomConfig> = {};
  for (const [id, r] of Object.entries((raw["rooms"] ?? {}) as Record<string, Raw>)) {
    const workspaces: Record<string, Installed> = {};
    for (const [lane, w] of Object.entries((r["workspaces"] ?? {}) as Record<string, unknown>)) {
      workspaces[lane] = typeof w === "string" ? { file: w, lease: 0, install: "" } : (w as Installed);
    }
    const { destinations: _none, ...rest } = r as unknown as RoomConfig;
    rooms[id] = { ...rest, workspaces };
  }
  return { ...(raw as unknown as Config), v: SCHEMA, rooms };
}

/**
 * Reads a journal entry. A version 1 act's local intent recorded values,
 * not revisions or installations, so it cannot prove that a local change
 * would touch only what the act owns. It becomes a `manual` intent: the
 * kept receipt is still returned or recovered, nothing local is changed,
 * and the user is told what they may do by hand. Login and redemption
 * entries did not change.
 */
export function decodeEntry(raw: Raw, path: string): JournalEntry {
  const v = raw["v"];
  if (v === SCHEMA) return raw as unknown as JournalEntry;
  if (v === 2) {
    // Version 2 intents are version 3's, except a release, whose ownership evidence was a config mapping.
    const local = raw["local"] as Raw | undefined;
    if (raw["type"] !== "act" || local?.["kind"] !== "release-lane") return { ...(raw as unknown as JournalEntry), v: SCHEMA } as JournalEntry;
    const installed = local["installed"] as { file?: string } | null | undefined;
    const steps = [`This release was recorded by an older artroom, so its local cleanup was not done. If lane ${String(local["lane"])} is still selected, claim or choose another lane.`];
    if (installed?.file) steps.push(`If ${installed.file} still holds lane ${String(local["lane"])}'s credential, remove it by hand.`);
    return { ...(raw as unknown as JournalEntry & { type: "act" }), v: SCHEMA, local: { kind: "manual", steps } };
  }
  if (v !== 1) newer(v, path);
  if (raw["type"] !== "act") return { ...(raw as unknown as JournalEntry), v: SCHEMA } as JournalEntry;
  const old = (raw["local"] ?? {}) as Raw;
  const steps: string[] = [];
  switch (old["kind"]) {
    case "select-lane":
      steps.push("This claim was recorded by an older artroom, so its lane was not selected. To work on it, pass --lane with the lane above.");
      break;
    case "follow-landing":
      steps.push("This landing was recorded by an older artroom, so it is not followed. To follow it: artroom wait with the operation above.");
      break;
    case "release-lane":
      steps.push(`This release was recorded by an older artroom, so its local cleanup was not done. If lane ${String(old["lane"])} is still selected, claim or choose another lane.`);
      if (typeof old["credential"] === "string") steps.push(`If ${old["credential"]} still holds lane ${String(old["lane"])}'s credential, remove it by hand.`);
      break;
    case "none":
      break;
    default:
      // Revision 2 journals had no local intent: a claim or land then changed the config.
      if (raw["command"] === "claim" || raw["command"] === "land" || raw["command"] === "release") {
        steps.push(`This ${String(raw["command"])} was recorded by an older artroom, so its local step was not done. Choose the lane to work on with --lane if needed.`);
      }
  }
  return {
    ...(raw as unknown as JournalEntry & { type: "act" }),
    v: SCHEMA,
    state: raw["state"] === "answered" ? "answered" : "prepared",
    local: steps.length === 0 ? { kind: "none" } : { kind: "manual", steps },
  };
}
