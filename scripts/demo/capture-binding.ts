/** Capture identity checks over trusted home references and native returned facts. */
import type { KeyId, ScopeId, ScopeRef, Sealed } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, entryHash, isEntry, isKeyId, isScopeId, isScopeRef, scopeIdOf, textDigest, timeOf } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, httpTransport, requestSession, secretSigner, sessionRequest, signedReads } from "@generalbusiness/artroom-client";
import type { Config } from "../../packages/cli/src/store.ts";
import type { Context } from "../../packages/cli/src/commands.ts";
import type { Room } from "./rehearse.ts";

export const CAPTURE_SCOPES = ["register", "directory", "membership", "rules", "destination", "issue", "published", "controlled", "refused"] as const;
type Name = typeof CAPTURE_SCOPES[number];
interface Birth { self: Sealed; creator: Sealed | null }
export interface CaptureObservations {
  v: 1; source: string; service: string; config: string; actor: KeyId;
  births: Record<Name, Birth>;
}
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const stop = (): never => { throw new Error("Capture binding is missing, unsupported or inconsistent."); };

function address(value: unknown): string {
  if (typeof value !== "string") return stop();
  let url: URL;
  try { url = new URL(value); } catch { return stop(); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.origin === "null") return stop();
  return url.href.replace(/\/+$/, "");
}

function home(config: Config): NonNullable<Config["repository"]> {
  if (!config || typeof config !== "object") return stop();
  const r = config.repository;
  if (config.v !== 1 || typeof config.key !== "string" || !r || !isScopeRef(r.directory) || r.directory.kind !== "directory"
    || !isScopeRef(r.membership) || r.membership.kind !== "membership" || !isScopeId(r.rules) || !isScopeId(r.destination)
    || (config.register !== undefined && (!isScopeRef(config.register) || config.register.kind !== "register"))) return stop();
  address(config.service);
  return r;
}

function anchors(config: Config, room: Room): void {
  const r = home(config);
  if (address(room.service) !== address(config.service) || CAPTURE_SCOPES.some((name) => !isScopeId(room[name]))
    || room.directory !== r.directory.scope || room.membership !== r.membership.scope || room.rules !== r.rules || room.destination !== r.destination
    || (config.register !== undefined && room.register !== config.register.scope)) return stop();
}

function sealed(copy: Sealed): boolean { return !!copy && isEntry(copy.entry) && entryHash(copy.entry) === copy.hash; }

/** This input comes only from the producer's owner-home file. Recomputed
 * hashes/seeds in caller room.json are never a trusted observation source. */
export function captureBinding(config: Config, observed: CaptureObservations, service: string, hints: Room, source: string): { service: string; place: { directory: ScopeId; membership: ScopeRef }; room: Room; actor: KeyId } {
  const r = home(config);
  anchors(config, hints);
  if (!observed || observed.v !== 1 || !isKeyId(observed.actor) || observed.source !== source || observed.config !== textDigest(canonicalize(config))
    || address(service) !== address(config.service) || address(observed.service) !== address(config.service) || address(hints.service) !== address(config.service)) return stop();
  const refs = {} as Record<Name, ScopeRef>;
  for (const name of CAPTURE_SCOPES) {
    const birth = observed.births?.[name];
    if (!birth || !sealed(birth.self)) return stop();
    const e = birth.self.entry;
    const input = e.input;
    const kind = ["issue", "published", "controlled", "refused"].includes(name) ? "lane" : name;
    if (e.seq !== 0 || e.prev !== null || e.at.kind !== kind || input.type !== "genesis" || input.decision !== "applied" || input.inc !== e.at.inc || input.seed.kind !== e.at.kind
      || scopeIdOf(input.seed) !== e.at.scope || !isScopeId(hints[name]) || hints[name] !== e.at.scope) return stop();
    refs[name] = e.at;
  }
  if (!same(refs.directory, r.directory) || !same(refs.membership, r.membership) || refs.rules.scope !== r.rules || refs.destination.scope !== r.destination
    || (config.register !== undefined && !same(refs.register, config.register))) return stop();
  for (const name of CAPTURE_SCOPES.filter((n) => n !== "register")) {
    const { self, creator } = observed.births[name];
    const input = self.entry.input;
    const parent = name === "directory" ? refs.register : r.directory;
    if (input.type !== "genesis" || !same(input.seed.creator, parent) || !input.source || !creator || !sealed(creator)
      || ("decision" in creator.entry.input && creator.entry.input.decision !== "applied") || !same(input.source.at, parent) || !same(creator.entry.at, parent) || input.source.seq !== creator.entry.seq || input.source.hash !== creator.hash) return stop();
    const send = creator.entry.sends.find((s) => s.n === input.n);
    if (!send || !same(send.to, input.seed) || !same(send.message, input.message)) return stop();
    if (["issue", "published", "controlled", "refused"].includes(name)
      && (creator.entry.input.type !== "act" || creator.entry.input.signed.intent.kind !== (name === "issue" ? "open-issue" : "open-pr"))) return stop();
  }
  const room: Room = { service: address(config.service) };
  for (const name of CAPTURE_SCOPES) room[name] = refs[name].scope;
  return { service: room.service, place: { directory: r.directory.scope, membership: r.membership }, room, actor: observed.actor };
}

/** Native returned genesis and actual creator send facts, read through the
 * configured service/session by the already-authorized rehearsal producer. */
export async function observeCaptures(ctx: Context, room: Room): Promise<Record<Name, Birth>> {
  const config = await ctx.store.config();
  if (!config) return stop();
  const r = home(config);
  anchors(config, room);
  const secret = await ctx.store.secret(config.key);
  if (!secret) return stop();
  const now = ctx.now?.() ?? Date.now();
  const asked = sessionRequest(r.membership, secret, timeOf(now + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16))));
  const session = await requestSession(config.service, r.membership.scope, asked, ctx.fetch ? { fetch: ctx.fetch } : {});
  if (!session.ok) return stop();
  const transport = signedReads(httpTransport(config.service, ctx.fetch ? { fetch: ctx.fetch } : {}), secretSigner(secret), ctx.now ? { now: ctx.now } : {});
  const read = async (scope: string, seq: number): Promise<Sealed> => {
    const result = await new ScopeHandle(transport, scope as ScopeId, session.session.reader()).entry(seq);
    if (!result.ok || !sealed(result.value)) return stop();
    return result.value;
  };
  const births = {} as Record<Name, Birth>;
  for (const name of CAPTURE_SCOPES) {
    const self = await read(room[name]!, 0);
    if (self.entry.input.type !== "genesis") return stop();
    const from = self.entry.input.source;
    births[name] = { self, creator: from ? await read(from.at.scope, from.seq) : null };
  }
  return births;
}

/** Serialized by Playwright: keep this self-contained. It runs for every
 * document, including redirected pages/frames; only the configured page's
 * top-level document receives the key. Public site pages need no key. */
export function initializeCapture(kept: { service: string; place: { directory: string; membership: unknown }; secret: string }): void {
  const allowed = new URL(`${kept.service}/page/`);
  const document = globalThis as unknown as { window: { top: unknown }; location: { origin: string; pathname: string }; localStorage: { setItem(key: string, value: string): void } };
  if (document.window.top !== document.window || document.location.origin !== allowed.origin || document.location.pathname !== allowed.pathname) return;
  document.localStorage.setItem("artroom-page", JSON.stringify({ service: kept.service, place: kept.place, secret: kept.secret }));
}
