/**
 * MCP toolsets (R-API-14): which tools `tools/list` shows one caller.
 *
 * A toolset is a presentation, never permission. A tool that is not listed
 * can still be called, and the room judges that call like any other. So
 * nothing here is consulted by `tools/call`.
 *
 * The list depends only on the caller's authorization, read now: the
 * current roster role, the delegation the caller acts under (if any) with
 * its signed grant unchanged, and the active policy version's declarations.
 * The same inputs give the same list, over HTTPS and over stdio.
 */

import { ARTROOM_LEGACY_V1, type ArtroomError, type Catalogue, type DelegationId, type GrantMap, type KeyId, type McpToolDescriptor, type McpToolset, type Role, type Roster } from "@generalbusiness/artroom-contract";
import { builtForBinding } from "@generalbusiness/artroom-client";
import { ACT_TOOLS, TOOL_LIST } from "./tools.ts";

/**
 * What the eligibility predicate needs to know about a caller. The host
 * that authenticated the request supplies it: the room's Worker for a
 * bearer token, the command line for a key file.
 */
export interface McpCaller {
  /** The current roster role of the member behind the credential: for a delegation, the grantor's member. */
  readonly role: Role;
  /**
   * The delegation the caller acts under, with `kinds` and the signed
   * kind-to-binding map `acts` exactly as the room recorded them. Absent
   * for a member's own key, which needs no grant map.
   */
  readonly delegation?: { readonly kinds: readonly string[] | "*"; readonly acts?: GrantMap };
}

export const TOOLSETS = ["builder", "reviewer", "observer", "all"] as const satisfies readonly McpToolset[];

function badRequest(message: string): ArtroomError {
  return { name: "ArtroomError", code: "bad-request", message, retryable: false };
}

/**
 * The toolset a caller asked for by name: the `toolset` query parameter of
 * the MCP URL, or `--toolset` on the command line. Undefined when none was
 * asked for. An unknown name throws `bad-request` (R-API-14).
 */
export function toolsetOf(name: string | null | undefined): McpToolset | undefined {
  if (name === null || name === undefined) return undefined;
  if (!(TOOLSETS as readonly string[]).includes(name)) throw badRequest(`There is no toolset named ${JSON.stringify(name).slice(0, 80)}. The toolsets are ${TOOLSETS.join(", ")}.`); // GM:toolset-unknown
  return name as McpToolset;
}

/** The named tools that record an act of the kind with the same name. `act` is the generic one. */
const NAMED_ACT_KINDS: readonly string[] = ACT_TOOLS.filter((t) => t !== "act");

const legacyRoleMaySign = (role: Role, kind: string) => (ARTROOM_LEGACY_V1.roles[role] as readonly string[]).includes(kind);
const grantNames = (kinds: readonly string[] | "*", kind: string) => kinds === "*" || kinds.includes(kind);

/** The act kinds a caller could make a new call of, as far as discovery asks (R-API-14). */
export interface Eligible {
  /** Named act tools whose kind the caller may sign, with the tool's built-in binding still the active one. */
  readonly named: readonly string[];
  /** Declared kinds the caller may sign through the generic `act`. Empty under a `v1` document. */
  readonly generic: readonly string[];
}

/**
 * The one eligibility predicate (R-API-14). It asks only about role,
 * declaration, grant and binding. It does not look at a target, a held
 * thread, a policy rule, the proposer or holder exclusions or a check job:
 * those stay questions for admission.
 *
 * It never changes a grant: a stale signed binding is not replaced by the
 * active one, and a kind the signed map does not name is not added.
 */
export async function eligible(caller: McpCaller, catalogue: Catalogue): Promise<Eligible> {
  const d = caller.delegation;
  // `renew` is a platform kind in every room: the legacy role table, and a plain grant.
  const renew = legacyRoleMaySign(caller.role, "renew") && (d === undefined || grantNames(d.kinds, "renew")); // GM:platform-grant
  if (catalogue.vocabulary !== "declared") {
    // A `v1` document: the frozen legacy role and delegation rules. The generic act is not listed there,
    // because the room refuses a `v: 2` envelope under a `v1` document (R-DECL-16).
    const named = NAMED_ACT_KINDS.filter((k) => k !== "renew" && legacyRoleMaySign(caller.role, k) && (d === undefined || grantNames(d.kinds, k))); // GM:legacy-rules
    return { named: renew ? [...named, "renew"] : named, generic: [] }; // GM:generic-v1
  }
  const generic = Object.keys(catalogue.acts).filter((kind) => {
    const a = catalogue.acts[kind]!;
    // R-DECL-11: `who.roles`, with admin implicit. A checker is admitted only where the declaration lists it.
    if (!(caller.role === "admin" || (a.declaration.who.roles as readonly string[]).includes(caller.role))) return false; // GM:who
    if (d === undefined) return true; // A member's own key needs no grant map.
    if (a.declaration.who.delegable === false) return false; // GM:delegable
    // The signed map must name the kind, and for the binding that is active now. The map is only read.
    return d.acts !== undefined && Object.hasOwn(d.acts, kind) && d.acts[kind] === a.binding; // GM:map-binding
  });
  const named: string[] = [];
  for (const kind of NAMED_ACT_KINDS) {
    if (kind === "renew") continue;
    // A named tool carries the binding of the code-review declaration it was built for. Where the room's own
    // declaration of that kind differs, a new call would be `binding-stale`, so the tool is not shown.
    if (generic.includes(kind) && (await builtForBinding(catalogue, kind)) === catalogue.acts[kind]!.binding) named.push(kind); // GM:built-for
  }
  if (renew) named.push("renew");
  return { named, generic };
}

/**
 * The toolset a caller gets when it asks for none (R-API-14). A delegated
 * caller with no eligible act kind gets `observer`. Otherwise the roster
 * role chooses. `reviewer` for a checker is a presentation: it grants no
 * review or claim authority, and only eligible act tools are listed.
 */
export function defaultToolset(caller: McpCaller, e: Eligible): McpToolset {
  if (caller.delegation !== undefined && e.named.length === 0 && e.generic.length === 0) return "observer"; // GM:readonly-override
  switch (caller.role) {
    case "admin":
    case "maintainer":
      return "all"; // GM:default-all
    case "checker":
      return "reviewer"; // GM:checker-default
    default:
      return "builder";
  }
}

/**
 * The descriptors `tools/list` shows this caller, in the fixed order of
 * `TOOL_LIST`: the tools of the chosen toolset, without the act tools the
 * caller could not make a new call of. Reads, `workspace` and `operation`
 * are never filtered: the room's own permission checks judge them.
 */
export async function toolsFor(caller: McpCaller, catalogue: Catalogue, asked?: McpToolset): Promise<readonly McpToolDescriptor[]> {
  const e = await eligible(caller, catalogue);
  const set = asked ?? defaultToolset(caller, e);
  return TOOL_LIST.filter((t) => {
    if (!(t.toolsets as readonly McpToolset[]).includes(set)) return false; // GM:set-member
    if (!(ACT_TOOLS as readonly string[]).includes(t.name)) return true;
    // The generic act by existence: at least one declared kind is eligible. Never by a grant named `act`.
    return t.name === "act" ? e.generic.length > 0 : e.named.includes(t.name); // GM:act-filter
  });
}

/**
 * A caller's authorization, from the roster (R-API-14), for a host that
 * knows the caller's key: the command line. Three forms:
 * - `{ key }`: a member's own key. No grant map is needed.
 * - `{ key, delegation }`: that key acts under the named delegation, which
 *   must have been granted to it.
 * - `{ key, session: true }`: `key` is a member key the room holds for a
 *   bearer session, and the caller acts under the delegation that key
 *   granted to the session. With `delegation` too, it is exactly that
 *   delegation, as the redemption recorded it, and `key` must be its
 *   grantor. With none (a credential saved before the command line kept the
 *   ID), it is the latest unrevoked delegation the key granted.
 * Under a delegation the role is the grantor's member's, as at admission.
 * A key or delegation the roster does not hold as current throws
 * `unauthenticated`.
 */
export function callerFromRoster(roster: Roster, who: { readonly key: KeyId; readonly delegation?: DelegationId; readonly session?: boolean }): McpCaller {
  const fail = (): ArtroomError => ({ name: "ArtroomError", code: "unauthenticated", message: "The credential belongs to no active member of this room.", retryable: false });
  const memberOf = (key: KeyId) => roster.members.find((m) => m.state === "active" && m.keys.some((k) => k.id === key && k.state === "active"));
  if (who.delegation === undefined && who.session !== true) {
    const member = memberOf(who.key);
    if (member === undefined) throw fail();
    return { role: member.role };
  }
  const d =
    who.delegation !== undefined
      ? roster.delegations.find((x) => x.id === who.delegation)
      : roster.delegations.filter((x) => x.grantor === who.key && x.revoked === undefined).at(-1);
  if (d === undefined || d.revoked !== undefined) throw fail(); // GM:roster-revoked
  // A session's delegation is one its own room-held key granted: another key's delegation is not this credential's.
  if (who.session === true && d.grantor !== who.key) throw fail(); // GM:roster-session-grantor
  // A key that names a delegation must be the key it was granted to.
  if (who.session !== true && d.grantee !== who.key) throw fail(); // GM:roster-grantee
  const member = memberOf(d.grantor);
  if (member === undefined) throw fail();
  return { role: member.role, delegation: { kinds: d.kinds, ...(d.acts !== undefined ? { acts: d.acts } : {}) } };
}
