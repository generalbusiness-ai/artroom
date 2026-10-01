/**
 * Founding a room (R-GEN-10 to R-GEN-13). `draft` validates the request,
 * checks an import's grant and makes the room key; it creates, reads and
 * binds nothing. `found` takes R-GEN-10's steps in order:
 *
 * 1. validate every genesis field, as `draft` does;
 * 2. check the genesis names the room key the draft value recovers;
 * 3. verify the first admin's signature;
 * 4. authorize the repository (R-GEN-12);
 * 5. bind repository, room ID and name in the registry (R-GEN-13);
 * 6. only then create or read the repository and seal entries 0 and 1.
 *
 * Steps 1 to 5 fail with `bad-request`, `unauthenticated` or `forbidden`
 * and read, mint, seal and bind nothing. A failure at step 6 is
 * `unavailable`; the binding stays, and the same `found` again completes it.
 */

import type { Genesis, OnboardingGrant, RoomId, SignedOnboardingGrant } from "@generalbusiness/artroom-contract";
import { STAMP } from "@generalbusiness/artroom-policy";
import { utf8 } from "./canonical.ts";
import type { RoomEnv } from "./config.ts";
import { b64url, hex, hmacSha256, keyPairFromSeed, randomToken, verify } from "./crypto.ts";
import { artroomError, unwire, type Wire } from "./errors.ts";
import { iso, parseTime, RE, roomIdOf } from "./ids.ts";
import { registry } from "./registry.ts";
import type { Room } from "./room.ts";
import { isPlainObject } from "./schema.ts";

const ROOM_KEY_DOMAIN = "artroom-room-key-v1\n";
const REPO_DOMAIN = "artroom-repo-v1\n";

/**
 * A repository identity in the form this deployment accepts: a namespace and
 * a 32-hex-character repository ID. A name, alias or URL never has this
 * form (R-GEN-12). The Artifacts adapter (phase 2b) maps it to the storage
 * system's own identifier.
 */
export const REPO_IDENTITY = /^[a-z0-9][a-z0-9-]{0,62}\/[0-9a-f]{32}$/;

export function isRepoIdentity(v: unknown): v is string {
  return typeof v === "string" && REPO_IDENTITY.test(v);
}

/** R-GEN-11: 1 to 128 characters, never in the form of a room ID. */
export function nameProblem(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 1 || v.length > 128) return "A room name is 1 to 128 characters.";
  if (RE.roomId.test(v)) return "A room name may not have the form of a room ID.";
  return null;
}

function publicNamespace(env: RoomEnv): string {
  return env.PUBLIC_NAMESPACE ?? "artroom-public";
}

function secret(env: RoomEnv): Uint8Array {
  if (!env.ROOM_KEY_SECRET) throw artroomError("unavailable", "This deployment has no ROOM_KEY_SECRET, so it cannot found rooms.");
  return utf8(env.ROOM_KEY_SECRET);
}

function checkDraftValue(draft: unknown): string {
  if (typeof draft !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(draft)) throw artroomError("bad-request", "The draft value is not valid.");
  return draft;
}

/** The room key's seed, recovered from the draft value. */
export function roomSeed(env: RoomEnv, draft: string): Uint8Array {
  return hmacSha256(secret(env), utf8(ROOM_KEY_DOMAIN + checkDraftValue(draft)));
}

/** A fresh repository identity for a public founding, in the reserved namespace (R-GEN-12). */
export function publicRepo(env: RoomEnv, draft: string): string {
  return `${publicNamespace(env)}/${hex(hmacSha256(secret(env), utf8(REPO_DOMAIN + checkDraftValue(draft)))).slice(0, 32)}`;
}

function operatorKeys(env: RoomEnv): string[] {
  return (env.OPERATOR_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function bad(message: string): never {
  throw artroomError("bad-request", message);
}

function closed(v: unknown, path: string, fields: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isPlainObject(v)) bad(`${path} must be an object.`);
  for (const k of Object.keys(v)) if (!fields.includes(k) && !optional.includes(k)) bad(`${path}.${k} is not a field.`);
  for (const k of fields) if (!(k in v)) bad(`${path}.${k} is required.`);
  return v;
}

function keyField(v: unknown, path: string): void {
  if (typeof v !== "string" || !RE.keyId.test(v)) bad(`${path} must be a key ID.`);
}

/** The shape of a signed onboarding grant. A repository that is not an identity is `bad-request` (R-GEN-12). */
function grantShape(v: unknown): SignedOnboardingGrant {
  const s = closed(v, "onboarding", ["grant", "sig"]);
  if (typeof s["sig"] !== "string" || !RE.sig.test(s["sig"])) bad("onboarding.sig must be a signature.");
  const g = closed(s["grant"], "onboarding.grant", ["v", "repo", "admin", "operator", "notAfter"]);
  if (g["v"] !== 1) bad("onboarding.grant.v must be 1.");
  if (!isRepoIdentity(g["repo"])) bad("onboarding.grant.repo must be a repository identity, not a name or URL.");
  keyField(g["admin"], "onboarding.grant.admin");
  keyField(g["operator"], "onboarding.grant.operator");
  if (typeof g["notAfter"] !== "string" || parseTime(g["notAfter"]) === null) bad("onboarding.grant.notAfter must be an RFC 3339 UTC time.");
  return v as SignedOnboardingGrant;
}

/**
 * An import's grant (R-GEN-12): signed by an operator key in this
 * deployment's configuration, for this repository and this admin key.
 * Its deadline is judged by the caller with the clock read after every
 * await, and again by the registry at the first binding (review 1249097f).
 */
async function checkGrant(env: RoomEnv, signed: SignedOnboardingGrant, admin: string): Promise<OnboardingGrant> {
  const g = signed.grant;
  if (!operatorKeys(env).includes(g.operator)) throw artroomError("forbidden", "The grant is not signed by an operator of this deployment.");
  if (!(await verify(g.operator, "artroom-onboarding-v1", g, signed.sig))) throw artroomError("forbidden", "The grant's signature does not verify.");
  if (g.repo.startsWith(`${publicNamespace(env)}/`)) throw artroomError("forbidden", "A grant cannot name a repository in the public founding namespace.");
  if (g.admin !== admin) throw artroomError("forbidden", "The grant is for another admin key.");
  return g;
}

/** The grant's deadline: expired at `notAfter` itself. */
function grantExpired(g: OnboardingGrant, now: number): boolean {
  return parseTime(g.notAfter)! <= now;
}

/** Step 1 of `found`, and `draft`'s checks: every genesis field (R-GEN-10). */
export function checkGenesis(v: unknown): Genesis {
  const g = closed(v, "genesis", ["format", "name", "repo", "admin", "recovery", "roomKey", "profile", "createdAt"], ["onboarding"]);
  if (g["format"] !== "artroom-log-v1") bad("genesis.format must be artroom-log-v1.");
  const name = nameProblem(g["name"]);
  if (name) bad(name);
  if (!isRepoIdentity(g["repo"])) bad("genesis.repo must be a repository identity.");
  const admin = closed(g["admin"], "genesis.admin", ["handle", "key"]);
  if (typeof admin["handle"] !== "string" || !RE.handle.test(admin["handle"])) bad("genesis.admin.handle must be a member handle.");
  keyField(admin["key"], "genesis.admin.key");
  keyField(g["recovery"], "genesis.recovery");
  keyField(g["roomKey"], "genesis.roomKey");
  const profile = closed(g["profile"], "genesis.profile", ["policy", "jsonata"]);
  // R-EVAL-4: the profile and the jsonata version this deployment runs.
  if (profile["policy"] !== STAMP.profile || profile["jsonata"] !== STAMP.jsonata) bad(`genesis.profile must be ${STAMP.profile} with jsonata ${STAMP.jsonata}.`);
  if (typeof g["createdAt"] !== "string" || parseTime(g["createdAt"]) === null) bad("genesis.createdAt must be an RFC 3339 UTC time.");
  if (g["onboarding"] !== undefined) grantShape(g["onboarding"]);
  if (g["recovery"] === admin["key"] || g["roomKey"] === admin["key"] || g["roomKey"] === g["recovery"]) bad("The admin, recovery and room keys must differ.");
  return v as Genesis;
}

/** Founding, step 1 (R-GEN-10). Creates, reads and binds nothing. */
export async function draftRoom(env: RoomEnv, input: unknown, now: number): Promise<{ readonly genesis: Genesis; readonly draft: string }> {
  const d = closed(input, "draft", ["name", "repo", "admin", "recovery"]);
  const name = nameProblem(d["name"]);
  if (name) bad(name);
  const admin = closed(d["admin"], "draft.admin", ["handle", "key"]);
  if (typeof admin["handle"] !== "string" || !RE.handle.test(admin["handle"])) bad("draft.admin.handle must be a member handle.");
  keyField(admin["key"], "draft.admin.key");
  keyField(d["recovery"], "draft.recovery");
  const source = isPlainObject(d["repo"]) ? d["repo"] : bad("draft.repo must be a repository source: { kind: new } or { kind: import, grant }.");
  const draft = randomToken();
  let repo: string;
  let onboarding: SignedOnboardingGrant | undefined;
  if (source["kind"] === "new") {
    closed(source, "draft.repo", ["kind"]);
    repo = publicRepo(env, draft);
  } else if (source["kind"] === "import") {
    closed(source, "draft.repo", ["kind", "grant"]);
    onboarding = grantShape(source["grant"]);
    const g = await checkGrant(env, onboarding, admin["key"] as string);
    if (grantExpired(g, now)) throw artroomError("forbidden", "The grant has expired.");
    repo = g.repo;
  } else bad("draft.repo.kind must be new or import.");
  const genesis: Genesis = {
    format: "artroom-log-v1",
    name: d["name"] as string,
    repo,
    ...(onboarding ? { onboarding } : {}),
    admin: { handle: admin["handle"] as `@${string}`, key: admin["key"] as `key_${string}` },
    recovery: d["recovery"] as `key_${string}`,
    roomKey: keyPairFromSeed(roomSeed(env, draft)).key,
    profile: { policy: STAMP.profile, jsonata: STAMP.jsonata },
    createdAt: iso(now),
  };
  return { genesis, draft };
}

/** Founding, step 2 (R-GEN-10), in order. */
export async function foundRoom(env: RoomEnv, genesisInput: unknown, sig: unknown, draft: unknown, clock: () => number): Promise<RoomId> {
  // 1. Every genesis field.
  const genesis = checkGenesis(genesisInput);
  // 2. The room key the draft value recovers.
  const seed = roomSeed(env, checkDraftValue(draft));
  if (keyPairFromSeed(seed).key !== genesis.roomKey) bad("The genesis does not name the room key of this draft.");
  // 3. The first admin's signature.
  if (typeof sig !== "string" || !(await verify(genesis.admin.key, "artroom-genesis-v1", genesis, sig)))
    throw artroomError("unauthenticated", "The genesis is not signed by the first admin's key.");
  const id = roomIdOf(genesis);
  const reg = registry(env);
  // 4. Authorize the repository (R-GEN-12).
  let deadline: number | undefined;
  if (genesis.onboarding) {
    const g = await checkGrant(env, genesis.onboarding, genesis.admin.key);
    if (g.repo !== genesis.repo) throw artroomError("forbidden", "The grant is for another repository.");
    const bound = await reg.byRepo(genesis.repo);
    const retry = bound !== null && bound.room === id && bound.name === genesis.name;
    // The clock is read after the awaits above, so a grant that ran out during them does not
    // authorize a first binding. Completing an identical binding forward needs no live grant.
    if (!retry && grantExpired(g, clock())) throw artroomError("forbidden", "The grant has expired.");
    deadline = parseTime(g.notAfter)!;
  } else if (genesis.repo !== publicRepo(env, draft as string)) {
    throw artroomError("forbidden", "A public founding uses the fresh repository its draft names.");
  }
  // 5. Bind repository, room ID and name (R-GEN-13). The registry judges an import's deadline
  // again, with its own clock, at the first binding itself.
  unwire((await reg.bind(genesis.repo, id, genesis.name, deadline)) as Wire<string>);
  // 6. Create or read the repository, then seal entries 0 and 1.
  const stub = env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as DurableObjectStub<Room>;
  return unwire((await stub.found(genesis, sig, b64url(seed))) as Wire<RoomId>);
}
