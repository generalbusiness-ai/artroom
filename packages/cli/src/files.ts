/**
 * The store on disk, under Node. The directory is `$ARTROOM_HOME`, or
 * `artroom` under `$XDG_CONFIG_HOME`, or `~/.config/artroom`. It is made
 * with mode 0700, and every file in it is written with mode 0600 and then
 * set to 0600, so a key file is readable only by its owner whatever the
 * umask. A key file holds the 32-byte secret as unpadded base64url, and
 * nothing else.
 */

import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { b64url, unb64url } from "@generalbusiness/artroom-bytes";
import type { Config, Store } from "./store.ts";

/** Where the command keeps its config and keys. */
export function configDir(env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env["ARTROOM_HOME"]) return env["ARTROOM_HOME"];
  return join(env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "artroom");
}

const NAME = /^[a-z][a-z0-9-]{0,31}$/;

export function fileStore(dir: string): Store {
  const ensure = () => {
    mkdirSync(join(dir, "keys"), { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    chmodSync(join(dir, "keys"), 0o700);
  };
  /** Write a whole file owner-only, through a temporary name, so a reader never sees half of it. */
  const write = (path: string, text: string, exclusive: boolean) => {
    ensure();
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    let created = false;
    try {
      writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
      created = true;
      chmodSync(temporary, 0o600);
      // A hard link publishes complete owner-only bytes atomically and refuses
      // an existing name. A check before rename cannot enforce exclusivity.
      if (exclusive) linkSync(temporary, path);
      else renameSync(temporary, path);
    } catch (failure) {
      if (exclusive && (failure as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`${path} exists already; it is not replaced`);
      throw failure;
    } finally {
      if (created && existsSync(temporary)) unlinkSync(temporary);
    }
  };
  const keyPath = (name: string) => {
    if (!NAME.test(name)) throw new Error(`${JSON.stringify(name)} is not a key name`);
    return join(dir, "keys", `${name}.key`);
  };
  return {
    config: async () => {
      const path = join(dir, "config.json");
      if (!existsSync(path)) return null;
      const config = JSON.parse(readFileSync(path, "utf8")) as Config;
      if (config.v !== 1) throw new Error(`${path} was written by another version of this command; it is not read`);
      return config;
    },
    save: async (config) => write(join(dir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, false),
    secret: async (name) => {
      const path = keyPath(name);
      if (!existsSync(path)) return null;
      const secret = unb64url(readFileSync(path, "utf8").trim());
      if (secret === null || secret.length !== 32) throw new Error(`${path} holds no 32-byte key`);
      return secret;
    },
    keep: async (name, secret) => write(keyPath(name), `${b64url(secret)}\n`, true),
  };
}
