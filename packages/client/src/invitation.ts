/** Invitation hints, not admission or authority. These functions perform no I/O. */
import type { Digest, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, isDigest, isRecord, isScopeId, isScopeRef, parseStrictBytes, textDigest, unb64url, utf8, wellFormed } from "@generalbusiness/artroom-bytes";

export const INVITATION_ADDRESS_BYTES = 8 * 1024;
export const INVITATION_JSON_BYTES = 6 * 1024;
export const LEGACY_INVITATION_PREFIX = "artroom-invite:";
const FRAGMENT = "/join/#artroom-invite=";
const ENCODED_BYTES = Math.ceil(INVITATION_JSON_BYTES * 4 / 3);

export type MembershipInvitationDefinition = `platform:membership@${number}`;
type Ref<K extends ScopeRef["kind"]> = ScopeRef & { kind: K };

export interface InvitationV2 {
  v: 2;
  service: string;
  deployment: string;
  repository: {
    directory: Ref<"directory">;
    membership: Ref<"membership">;
    rules: Ref<"rules">;
    destination: Ref<"destination">;
  };
  definition: MembershipInvitationDefinition;
  invitation: number;
  secret: string;
  handle: string;
  application: { scope: Ref<"lane">; definition: Digest };
}

/** Actual v1 carries no deployment/app and only IDs for rules and destination. */
export interface LegacyInvitationV1 {
  [name: string]: unknown;
  v: 1;
  service: string;
  repository: {
    [name: string]: unknown;
    directory: Ref<"directory">;
    membership: Ref<"membership">;
    rules: ScopeId;
    destination: ScopeId;
  };
  definition?: MembershipInvitationDefinition;
  invitation: number;
  secret: string;
  handle: string;
}

/** Keep this private: address and value contain the one-time invitation secret. */
export type ParsedInvitation =
  | { version: 2; value: InvitationV2 }
  | { version: 1; value: LegacyInvitationV1; originalAddress: string; fingerprint: Digest; membershipDefinition: MembershipInvitationDefinition };

export type InvitationParseResult = { ok: true; invitation: ParsedInvitation } | { ok: false; reason: "invalid-invitation" | "too-large" };

/** Supplied by the trust/catalog owner, never derived from invitation fields. */
export interface InvitationTrust {
  origin: string;
  deployment: string;
  membershipDefinitions: readonly MembershipInvitationDefinition[];
  applicationDefinitions: readonly Digest[];
}

export type InvitationBindingResult =
  | { ok: true; invitation: InvitationV2 }
  | { ok: false; reason: "invalid-invitation" | "invalid-trust" | "origin-mismatch" | "deployment-mismatch" | "unsupported-membership" | "unsupported-application" }
  | { ok: false; reason: "legacy-binding-unavailable"; missing: readonly ["deployment", "application", "rules-incarnation", "destination-incarnation"] };

type Url = { origin: string; protocol: string; username: string; password: string };
/** Canonical HTTPS origin: no normalization, credentials, path, query or fragment. */
function origin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > INVITATION_ADDRESS_BYTES || !/^https:\/\//.test(value) || /[\x00-\x20\x7f-\x9f]/.test(value)) return false;
  const URL = (globalThis as { URL?: new (url: string) => Url }).URL;
  if (!URL) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.origin === value;
  } catch { return false; }
}

function fields(value: unknown, required: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && required.every(name => Object.hasOwn(value, name))
    && Object.keys(value).every(name => required.includes(name));
}
function text(value: unknown, min: number, max: number): value is string {
  if (typeof value !== "string" || value.length > max || !wellFormed(value)) return false;
  const size = utf8(value).length;
  return size >= min && size <= max;
}
function membershipDefinition(value: unknown): value is MembershipInvitationDefinition {
  if (typeof value !== "string" || value.length > 64) return false;
  const match = /^platform:membership@([1-9][0-9]*)$/.exec(value);
  return match !== null && Number.isSafeInteger(Number(match[1]));
}
function ref<K extends ScopeRef["kind"]>(value: unknown, kind: K): value is Ref<K> {
  return isScopeRef(value) && value.kind === kind;
}
function common(value: Record<string, unknown>, secretMinimum: number): boolean {
  return typeof value["invitation"] === "number" && Number.isSafeInteger(value["invitation"]) && value["invitation"] >= 1
    && text(value["secret"], secretMinimum, 256) && text(value["handle"], 2, 256)
    && /^@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value["handle"]);
}
function v2(value: unknown): value is InvitationV2 {
  if (!fields(value, ["v", "service", "deployment", "repository", "definition", "invitation", "secret", "handle", "application"]) || value["v"] !== 2) return false;
  const repository = value["repository"], application = value["application"];
  return origin(value["service"]) && text(value["deployment"], 1, 128) && common(value, 32) && membershipDefinition(value["definition"])
    && fields(repository, ["directory", "membership", "rules", "destination"])
    && ref(repository["directory"], "directory") && ref(repository["membership"], "membership")
    && ref(repository["rules"], "rules") && ref(repository["destination"], "destination")
    && fields(application, ["scope", "definition"]) && ref(application["scope"], "lane") && isDigest(application["definition"]);
}
function v1(value: unknown): value is LegacyInvitationV1 {
  if (!isRecord(value) || !["v", "service", "repository", "invitation", "secret", "handle"].every(name => Object.hasOwn(value, name)) || value["v"] !== 1) return false;
  const repository = value["repository"];
  // Preserve bounded original fields, including extensions in the old fingerprint.
  // No legacy extension becomes v2 trust or fills a missing native incarnation.
  return text(value["service"], 1, INVITATION_ADDRESS_BYTES) && common(value, 0)
    && (!Object.hasOwn(value, "definition") || membershipDefinition(value["definition"]))
    && isRecord(repository) && ["directory", "membership", "rules", "destination"].every(name => Object.hasOwn(repository, name))
    && ref(repository["directory"], "directory") && ref(repository["membership"], "membership")
    && isScopeId(repository["rules"]) && isScopeId(repository["destination"]);
}

/** Strict bounded bytes; v2 additionally has exactly one canonical address/JSON form. */
export function parseInvitation(address: string): InvitationParseResult {
  const invalid = (): InvitationParseResult => ({ ok: false, reason: "invalid-invitation" });
  if (typeof address !== "string") return invalid();
  // The code-unit check prevents an unbounded UTF-8 allocation on hostile input.
  if (address.length > INVITATION_ADDRESS_BYTES || utf8(address).length > INVITATION_ADDRESS_BYTES) return { ok: false, reason: "too-large" };
  if (!wellFormed(address)) return invalid();
  const legacy = address.startsWith(LEGACY_INVITATION_PREFIX);
  const marker = legacy ? LEGACY_INVITATION_PREFIX.length : address.indexOf(FRAGMENT);
  if (marker < 0) return invalid();
  const encoded = address.slice(legacy ? marker : marker + FRAGMENT.length);
  if (encoded.length > ENCODED_BYTES) return { ok: false, reason: "too-large" };
  const bytes = unb64url(encoded);
  if (!bytes) return invalid();
  if (bytes.length > INVITATION_JSON_BYTES) return { ok: false, reason: "too-large" };
  try {
    const value = parseStrictBytes(bytes);
    if (legacy) {
      if (!v1(value)) return invalid();
      // This is the existing pending Join identity, computed before any defaults.
      return { ok: true, invitation: { version: 1, value, originalAddress: address, fingerprint: textDigest(canonicalize(value)), membershipDefinition: value.definition ?? "platform:membership@1" } };
    }
    if (!v2(value) || address !== `${value.service}${FRAGMENT}${b64url(utf8(canonicalize(value)))}`) return invalid();
    return { ok: true, invitation: { version: 2, value } };
  } catch { return invalid(); }
}

/** Format only new v2 links. Legacy retries retain their original address/envelope. */
export function formatInvitation(invitation: InvitationV2): string | null {
  try {
    if (!v2(invitation)) return null;
    const bytes = utf8(canonicalize(invitation));
    if (bytes.length > INVITATION_JSON_BYTES) return null;
    const address = `${invitation.service}${FRAGMENT}${b64url(bytes)}`;
    return address.length <= INVITATION_ADDRESS_BYTES ? address : null;
  } catch { return null; }
}

/** Configuration match only. Native admission, birth, grants and app provenance remain unverified. */
export function validateInvitationBinding(invitation: ParsedInvitation, trust: InvitationTrust): InvitationBindingResult {
  if (!origin(trust.origin) || !text(trust.deployment, 1, 128)
    || !Array.isArray(trust.membershipDefinitions) || trust.membershipDefinitions.length > 32 || !trust.membershipDefinitions.every(membershipDefinition)
    || !Array.isArray(trust.applicationDefinitions) || trust.applicationDefinitions.length > 32 || !trust.applicationDefinitions.every(isDigest)) return { ok: false, reason: "invalid-trust" };
  if (invitation.version === 1) {
    if (!v1(invitation.value)) return { ok: false, reason: "invalid-invitation" };
    return { ok: false, reason: "legacy-binding-unavailable", missing: ["deployment", "application", "rules-incarnation", "destination-incarnation"] };
  }
  if (invitation.version !== 2 || !v2(invitation.value)) return { ok: false, reason: "invalid-invitation" };
  const value = invitation.value;
  if (value.service !== trust.origin) return { ok: false, reason: "origin-mismatch" };
  if (value.deployment !== trust.deployment) return { ok: false, reason: "deployment-mismatch" };
  if (!trust.membershipDefinitions.includes(value.definition)) return { ok: false, reason: "unsupported-membership" };
  if (!trust.applicationDefinitions.includes(value.application.definition)) return { ok: false, reason: "unsupported-application" };
  return { ok: true, invitation: value };
}
