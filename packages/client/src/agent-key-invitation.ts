/** Explicit private agent-key handoff. Encoding is not native authority. */
import { invitationServiceUrl } from "./invitation-service.ts";
import type { FactRef, MemberRef, ScopeRef, ScopeId } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, isFactRef, isMemberRef, isRecord, isScopeId, isScopeRef, parseStrict, unb64url, utf8 } from "@generalbusiness/artroom-bytes";
export const AGENT_KEY_LINK = "artroom-agent-key:";
/** The membership definitions an agent-key invitation may name: each is the exact pin of the membership scope it was issued at. */
export const AGENT_KEY_MEMBERSHIPS = ["platform:membership@2", "platform:membership@4", "platform:membership@5", "platform:membership@6"] as const;
export type AgentKeyMembership = (typeof AGENT_KEY_MEMBERSHIPS)[number];
export const isAgentKeyMembership = (value: unknown): value is AgentKeyMembership => typeof value === "string" && (AGENT_KEY_MEMBERSHIPS as readonly string[]).includes(value);
export interface AgentKeyInvitation {
  v: 1; kind: "agent-key"; service: string;
  repository: { directory: ScopeRef; membership: ScopeRef; rules: ScopeId; destination: ScopeId };
  /** The membership's pinned definition at issuance; the enrolment is verified against the receipt's definition, never a name. */
  definition: AgentKeyMembership; handle: string; controller: MemberRef;
  member: FactRef; invitation: FactRef; secret: string;
  expected: { on: number; member: number };
}
const closed = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => isRecord(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
const revision = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 1;
export function isAgentKeyInvitation(value: unknown): value is AgentKeyInvitation {
  try {
    if (!closed(value, ["v", "kind", "service", "repository", "definition", "handle", "controller", "member", "invitation", "secret", "expected"]) || value["v"] !== 1 || value["kind"] !== "agent-key" || !isAgentKeyMembership(value["definition"]) || typeof value["service"] !== "string" || typeof value["handle"] !== "string" || utf8(value["handle"]).length > 256 || !/^@[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value["handle"])) return false;
    const origin = invitationServiceUrl(value["service"]);
    if (!origin || origin.origin !== value["service"] || origin.pathname !== "/") return false;
    const r = value["repository"];
    if (!closed(r, ["directory", "membership", "rules", "destination"]) || !closed(r["directory"], ["scope", "inc", "kind"]) || !isScopeRef(r["directory"]) || r["directory"].kind !== "directory" || !closed(r["membership"], ["scope", "inc", "kind"]) || !isScopeRef(r["membership"]) || r["membership"].kind !== "membership" || !isScopeId(r["rules"]) || !isScopeId(r["destination"]) || !closed(value["controller"], ["membership", "member"]) || !isMemberRef(value["controller"]) || !same(value["controller"]["membership"], r["membership"])) return false;
    if (!closed(value["member"], ["at", "seq", "hash"]) || !isFactRef(value["member"]) || !same(value["member"]["at"], r["membership"]) || value["member"]["seq"] < 1 || !closed(value["invitation"], ["at", "seq", "hash"]) || !isFactRef(value["invitation"]) || !same(value["invitation"]["at"], r["membership"]) || value["invitation"]["seq"] <= value["member"]["seq"] || !closed(value["expected"], ["on", "member"]) || !revision(value["expected"]["on"]) || !revision(value["expected"]["member"])) return false;
    if (typeof value["secret"] !== "string" || value["secret"].length > 256) return false;
    const secret = unb64url(value["secret"]);
    return secret !== null && secret.length === 32 && b64url(secret) === value["secret"];
  } catch { return false; }
}
export function agentKeyInvitationOf(text: string): AgentKeyInvitation | null {
  try {
    if (!text.startsWith(AGENT_KEY_LINK) || text.length > 16 * 1024) return null;
    const bytes = unb64url(text.slice(AGENT_KEY_LINK.length));
    if (!bytes || bytes.length > 12 * 1024) return null;
    const value = parseStrict(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    return isAgentKeyInvitation(value) ? value : null;
  } catch { return null; }
}
export function encodeAgentKeyInvitation(value: AgentKeyInvitation): string {
  if (!isAgentKeyInvitation(value)) throw new Error("The agent invitation is not valid.");
  const encoded = AGENT_KEY_LINK + b64url(utf8(canonicalize(value)));
  if (encoded.length > 16 * 1024) throw new Error("The agent invitation exceeds its bound.");
  return encoded;
}
