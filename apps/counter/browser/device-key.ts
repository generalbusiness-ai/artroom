/** Demo import and browser-held signing capability. Enrollment remains native. */
import { b64url, canonicalize, isKeyId, isMemberRef, isRecord, isScopeRef, keyIdOfSecret, unb64url, verify } from "@generalbusiness/artroom-bytes";
import type { Signer } from "@generalbusiness/artroom-client";
import { COUNTING_COMMITMENTS_DEFINITION } from "../commitments-pin.ts";
import type { ActorIdentity } from "./voice-controller.ts";

export interface SavedDevice { name: string; binding: ActorIdentity; key: CryptoKey }
const MAX_BUNDLE = 64 * 1024;
const names = ["Ada", "Beau", "Cleo"];
const closed = (value: unknown, keys: string[]): value is Record<string, unknown> => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function binding(value: unknown, origin: string, cohort = true, strict = true): ActorIdentity {
  const keys = ["origin", "deployment", "scope", "definition", "membership", "member", "publicKey", ...(cohort ? ["cohort"] : [])];
  if (!isRecord(value) || (strict && !closed(value, keys))) throw new Error("The public device binding is invalid.");
  const url = new URL(String(value["origin"]));
  if (url.origin !== origin || url.origin !== value["origin"] || url.pathname !== "/" || url.search || url.hash || url.username || url.password || !["https:", "http:"].includes(url.protocol)) throw new Error("The device binding must belong to this origin.");
  if (value["definition"] !== COUNTING_COMMITMENTS_DEFINITION || typeof value["deployment"] !== "string" || !value["deployment"] || value["deployment"].length > 128 || !isScopeRef(value["scope"]) || !isScopeRef(value["membership"]) || !isMemberRef(value["member"]) || !isKeyId(value["publicKey"]) || canonicalize(value["member"].membership) !== canonicalize(value["membership"])) throw new Error("The supported device binding is invalid.");
  if (cohort) {
    const c = value["cohort"];
    if (!isRecord(c) || (strict && !closed(c, ["directory", "membership", "rules", "destination"])) || c["directory"] !== "platform:directory@6" || c["membership"] !== "platform:membership@5" || c["rules"] !== "platform:rules@3" || c["destination"] !== "platform:destination@2") throw new Error("The counting cohort is unsupported.");
  }
  return { origin: url.origin, deployment: value["deployment"], scope: structuredClone(value["scope"]), definition: COUNTING_COMMITMENTS_DEFINITION, membership: structuredClone(value["membership"]), member: structuredClone(value["member"]), publicKey: value["publicKey"] };
}
async function imported(name: string, identity: ActorIdentity, seed: Uint8Array): Promise<SavedDevice> {
  // RFC8410 PrivateKeyInfo wraps the 32-byte seed in CurvePrivateKey.
  const prefix = Uint8Array.of(0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20);
  const pkcs8 = new Uint8Array(prefix.length + seed.length);
  try {
    if (seed.length !== 32 || keyIdOfSecret(seed) !== identity.publicKey) throw new Error("The enrolled key does not match its public binding.");
    pkcs8.set(prefix); pkcs8.set(seed, prefix.length);
    const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
    seed.fill(0); pkcs8.fill(0);
    const device = { name, binding: identity, key };
    await deviceSigner(device);
    return device;
  } finally { seed.fill(0); pkcs8.fill(0); }
}
export async function deviceSigner(device: SavedDevice): Promise<Signer> {
  if (!closed(device, ["name", "binding", "key"]) || typeof device.name !== "string" || !device.name || device.name.length > 64) throw new Error("The remembered device is invalid.");
  const identity = binding(device.binding, location.origin, false);
  const key = device.key;
  if (!(key instanceof CryptoKey) || key.type !== "private" || key.extractable || key.algorithm.name !== "Ed25519" || key.usages.length !== 1 || key.usages[0] !== "sign") throw new Error("A browser-held non-extractable signing key is required.");
  const signer: Signer = { key: identity.publicKey, sign: async bytes => b64url(new Uint8Array(await crypto.subtle.sign("Ed25519", key, Uint8Array.from(bytes)))) };
  const challenge = new Uint8Array(crypto.getRandomValues(new Uint8Array(32)));
  if (!verify(identity.publicKey, await signer.sign(challenge), challenge)) throw new Error("The remembered key does not match its public binding.");
  return signer;
}
export async function importDemoBundle(bytes: Uint8Array, origin: string): Promise<SavedDevice[]> {
  try {
    if (bytes.length > MAX_BUNDLE) throw new Error("The device bundle exceeds its bound.");
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!closed(data, ["v", "identities"]) || data["v"] !== 1 || !Array.isArray(data["identities"]) || data["identities"].length !== 3) throw new Error("A three-device demo bundle is required.");
    const devices: SavedDevice[] = [];
    for (const value of data["identities"]) {
      if (!closed(value, ["name", "binding", "seed"]) || typeof value["name"] !== "string" || !names.includes(value["name"]) || typeof value["seed"] !== "string") throw new Error("The demo bundle must name Ada, Beau and Cleo.");
      const identity = binding(value["binding"], origin);
      const seed = unb64url(value["seed"]);
      if (!seed || seed.length !== 32 || b64url(seed) !== value["seed"]) { seed?.fill(0); throw new Error("The demo key seed is invalid."); }
      // Drop the parsed private string; JavaScript strings cannot be wiped.
      value["seed"] = "";
      devices.push(await imported(value["name"], identity, seed));
    }
    if (new Set(devices.map(d => d.name)).size !== 3 || new Set(devices.map(d => d.binding.publicKey)).size !== 3) throw new Error("The demo devices must have distinct names and enrolled keys.");
    return names.map(name => devices.find(device => device.name === name)!);
  } finally { bytes.fill(0); }
}
export async function importLegacyDevice(bindingBytes: Uint8Array, seedBytes: Uint8Array, origin: string): Promise<SavedDevice> {
  let seed: Uint8Array | null = null;
  try {
    if (bindingBytes.length > 16 * 1024 || seedBytes.length > 256) throw new Error("The device files exceed their bounds.");
    const identity = binding(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bindingBytes)), origin, true, false);
    seed = seedBytes.length === 32 ? seedBytes : unb64url(new TextDecoder("utf-8", { fatal: true }).decode(seedBytes).trim());
    if (!seed || seed.length !== 32) throw new Error("The enrolled key file is invalid.");
    return await imported("This device", identity, seed);
  } finally { bindingBytes.fill(0); seedBytes.fill(0); seed?.fill(0); }
}
