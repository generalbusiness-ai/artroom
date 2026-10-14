#!/usr/bin/env node
// The spike checker service's key (request 9f81f372), from
// ARTROOM_CHECKER_SEED (an Ed25519 seed, base64url) in the spike env file,
// ~/.config/generalbusiness/artroom-spike.env or $ARTROOM_SPIKE_ENV.
//
//   spike-checker-key.mjs id     the key ID (public), as a room's roster names it
//   spike-checker-key.mjs jwk    the private JWK for `wrangler secret put CHECKER_KEY`, to a pipe only
//
// The seed and the JWK are never printed to a terminal: `jwk` refuses when
// stdout is a TTY. The seed is made once, with hugh's approval, by
// `spike-checker-key.mjs create`, which appends it to the env file (mode
// 600) only if it is absent, and prints only the key ID.

import { appendFileSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { b64url, keyPairFromSeed, randomBytes, unb64url } from "../src/crypto.ts";

export const SEED_VAR = "ARTROOM_CHECKER_SEED";

/** One variable's value from an env file's text, or null. Quotes around the value are dropped. */
export function envValue(text, name) {
  return new RegExp(`^${name}=["']?([^"'\\n]*)["']?$`, "m").exec(text)?.[1] || null;
}

/** The key pair of a base64url seed, or null if it is not 32 bytes. */
export function seedKeyPair(seed) {
  const raw = typeof seed === "string" ? unb64url(seed) : null;
  return raw && raw.length === 32 ? keyPairFromSeed(raw) : null;
}

/** The Ed25519 private JWK lane G's `importSigner` reads (`d` is the seed, `x` the public key); its key ID is `key_${x}`. */
export function checkerJwk(seed) {
  const kp = seedKeyPair(seed);
  if (!kp) throw new Error(`${SEED_VAR} is not a 32-byte base64url seed`);
  return { kty: "OKP", crv: "Ed25519", x: kp.key.slice("key_".length), d: seed };
}

function envFile() {
  return process.env.ARTROOM_SPIKE_ENV ?? join(homedir(), ".config/generalbusiness/artroom-spike.env");
}

const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = envFile();
  const mode = statSync(file).mode & 0o777;
  if (mode !== 0o600) {
    console.error(`spike-checker-key: ${file} must be mode 600`);
    process.exit(2);
  }
  const text = readFileSync(file, "utf8");
  const cmd = process.argv[2];
  if (cmd === "create") {
    if (envValue(text, SEED_VAR)) {
      console.error(`spike-checker-key: ${SEED_VAR} is already set; nothing changed`);
      process.exit(2);
    }
    const seed = b64url(randomBytes(32));
    appendFileSync(file, `${text.endsWith("\n") || text === "" ? "" : "\n"}${SEED_VAR}=${seed}\n`);
    console.log(seedKeyPair(seed).key);
  } else if (cmd === "id" || cmd === "jwk") {
    const seed = envValue(text, SEED_VAR);
    if (!seedKeyPair(seed)) {
      console.error(`spike-checker-key: ${SEED_VAR} is missing or malformed in ${file}`);
      process.exit(2);
    }
    if (cmd === "id") console.log(seedKeyPair(seed).key);
    else if (process.stdout.isTTY) {
      console.error("spike-checker-key: jwk writes a secret; pipe it to `wrangler secret put CHECKER_KEY`");
      process.exit(2);
    } else process.stdout.write(JSON.stringify(checkerJwk(seed)));
  } else {
    console.error("usage: spike-checker-key.mjs id | jwk | create");
    process.exit(2);
  }
}
