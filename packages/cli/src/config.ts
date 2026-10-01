/**
 * Where the CLI keeps what it knows: one config file, one key file per room
 * and, for MCP invitations, one bearer file per room. Every file is written
 * readable only by the user (0600), in a directory only the user can enter
 * (0700). Nothing secret is ever printed.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KeyId, LaneId, MemberId, RoomId, Role } from "@generalbusiness/artroom-contract";
import type { PrivateJwk } from "@generalbusiness/artroom-client";

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
}

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

/** A key made for a join that has not finished, with what is needed to repeat that join exactly. */
export interface PendingJoin {
  readonly v: 1;
  readonly room: RoomId;
  readonly invitation: string;
  readonly idempotencyKey: string;
  readonly key: KeyId;
  readonly jwk: PrivateJwk;
}

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

  pendingPath(room: RoomId): string {
    return join(this.dir, "keys", `${room}.pending.json`);
  }

  savePending(p: PendingJoin): string {
    this.#ensure("keys");
    writePrivate(this.pendingPath(p.room), `${JSON.stringify(p, null, 2)}\n`);
    return this.pendingPath(p.room);
  }

  loadPending(room: RoomId): PendingJoin | undefined {
    const path = this.pendingPath(room);
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as PendingJoin) : undefined;
  }

  removePending(room: RoomId): void {
    rmSync(this.pendingPath(room), { force: true });
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
