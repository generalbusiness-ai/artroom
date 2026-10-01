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
  /** The lane the next command acts on, from the last `claim`. */
  lane?: LaneId;
  /** The invitation this room was joined or redeemed with, so repeating that command reports it is done. */
  invitation?: string;
  /** The landing operation `artroom wait` follows, from the last `land`. */
  landing?: { readonly op: OpId; readonly lane: LaneId };
  /** Where `artroom workspace` wrote each lane's credential, so `release` removes that one file, wherever it runs. */
  workspaces?: Record<LaneId, string>;
}

/**
 * What an act changes locally once the room answers, and the local state it
 * expects to find then. Recorded with the act before it is sent, so a
 * recovery later changes only what this act owns (see `applyLocal` in main.ts).
 */
export type LocalIntent =
  | { readonly kind: "none" }
  /** `claim`: select the claimed lane, if the selection is still `expect`. */
  | { readonly kind: "select-lane"; readonly expect: LaneId | null }
  /** `land`: follow the started landing, if the followed landing is still `expect`. */
  | { readonly kind: "follow-landing"; readonly expect: OpId | null }
  /** `release`: forget this lane locally, and remove the credential written for it at `credential`, if it is still that lane's. */
  | { readonly kind: "release-lane"; readonly lane: LaneId; readonly credential: string | null };

export interface Config {
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

/**
 * The journal: one durable record per unfinished piece of work, written
 * before the first request and removed only when every local step is done.
 * Running the same command again reads it and finishes the work with the
 * same key, the same request and the same receipt, instead of starting over.
 *
 * - `act`: an act, prepared and signed, under its idempotency key (R-IDEM-2);
 *   then the room's answer, until the local steps after it are done.
 * - `login`: the new key and the join's idempotency key, then the join's result.
 * - `redeem`: that a one-time redemption was sent, then its result. The bearer
 *   token stays here (0600) only until it is in its own file and the config.
 */
export type JournalEntry =
  | {
      readonly v: 1;
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
      readonly v: 1;
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
      readonly v: 1;
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
    if (!existsSync(this.configPath)) return { rooms: {} };
    return JSON.parse(readFileSync(this.configPath, "utf8")) as Config;
  }

  write(config: Config): void {
    this.#ensure();
    writePrivate(this.configPath, `${JSON.stringify(config, null, 2)}\n`);
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
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Extract<JournalEntry, { type: T }>) : undefined;
  }

  /** Removes every unfinished act a bearer session prepared for this room, and says how many. */
  forgetBearerActs(room: RoomId): number {
    const dir = join(this.dir, "journal", room);
    if (!existsSync(dir)) return 0;
    let n = 0;
    for (const file of readdirSync(dir)) {
      if (!file.startsWith("act-")) continue;
      const entry = JSON.parse(readFileSync(join(dir, file), "utf8")) as JournalEntry;
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
