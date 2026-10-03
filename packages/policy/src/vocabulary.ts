/**
 * The one source of act kinds (docs/protocol.md R-DECL-1; note section 8.1).
 * What a room admits comes from its active policy document:
 *
 * - a `v1` document means the legacy vocabulary `artroom-legacy-v1`, read
 *   here from its frozen description (`ARTROOM_LEGACY_V1`), never from a
 *   list written out again;
 * - a `v2` document means its own declarations, with the platform kinds
 *   `renew`, `roster` and `recover` beside them.
 *
 * The room's schema, roster and authority and the policy validator read
 * their kinds from here. The log's decoder and roster replay keep their own
 * lists until declared acts stage 3 (request 1e8fee4b), which owns
 * packages/log and replaces them (planner's assert 869d9aad).
 * `codeReviewPolicy` gives the built-in default declarations, the
 * code-review application's (`CODE_REVIEW_ACTS`), as a `v2` document.
 */

import {
  ARTROOM_LEGACY_V1,
  type ActDeclaration,
  type AnyPolicyDocument,
  type DelegableKind,
  type DelegablePlatformKind,
  type EnvelopeKind,
  type PlatformKind,
  type PolicyDocument,
  type PolicyDocumentV2,
  type Role,
  type RosterOp,
  type Step,
  type StepList,
  type TargetShape,
} from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "./codereview.ts";

// ------------------------------------------------------------ the legacy vocabulary

/** The legacy vocabulary's envelope kinds: the seven acts, `renew` and `roster`. */
export const LEGACY_KINDS = ARTROOM_LEGACY_V1.envelope.kinds as readonly EnvelopeKind[];

/** The kinds each role may sign under the legacy vocabulary (R-GEN-5). */
export const LEGACY_ROLE_KINDS = ARTROOM_LEGACY_V1.roles as Readonly<Record<Role, readonly EnvelopeKind[]>>;

/** The kinds a legacy delegation may name (R-ADM-5): never `roster`. */
export const LEGACY_DELEGABLE = ARTROOM_LEGACY_V1.delegation.kinds as readonly DelegableKind[];

/** Roster ops by signer (R-GEN-3, R-GEN-4), the same in every room: `roster` is a platform kind. */
export const ROSTER_OPS = {
  admin: ARTROOM_LEGACY_V1.rosterOps.admin as readonly RosterOp["op"][],
  others: ARTROOM_LEGACY_V1.rosterOps.others as readonly RosterOp["op"][],
  recovery: ARTROOM_LEGACY_V1.rosterOps.recovery as readonly RosterOp["op"][],
} as const;

/**
 * The step each legacy kind runs on each target shape: the frozen path's
 * dispatch (R-DECL-1). `claim` opens on target `null` and takes on a lane;
 * every other act has one step. The legacy path is not re-expressed through
 * declarations: this only names which of the room's handlers runs.
 */
const LEGACY_STEPS: Readonly<Record<string, Partial<Record<TargetShape, Step>>>> = {
  claim: { none: "open", thread: "take" },
  propose: { thread: "version" },
  note: { entry: "comment", line: "comment" },
  review: { version: "review" },
  check: { version: "check" },
  land: { version: "land" },
  release: { thread: "release" },
};

// ------------------------------------------------------------ platform kinds

/** Kinds that platform code judges, whatever the declarations say (R-DECL-2). */
export const PLATFORM_KIND_LIST: readonly PlatformKind[] = ["renew", "roster", "recover"];

export const isPlatformKind = (kind: string): kind is PlatformKind => (PLATFORM_KIND_LIST as readonly string[]).includes(kind);

/** Platform kinds a grant names plainly (R-DECL-17). */
export const DELEGABLE_PLATFORM: readonly DelegablePlatformKind[] = ["renew"];

// ------------------------------------------------------------ documents

/** Is this a `v2` document, which declares its acts (R-DECL-1)? */
export function isDeclared(doc: AnyPolicyDocument): doc is PolicyDocumentV2 {
  return doc.format === "artroom-policy-v2";
}

/** The declaration of a kind in a `v2` document, or null. Own properties only. */
export function declarationOf(doc: AnyPolicyDocument, kind: string): ActDeclaration | null {
  if (!isDeclared(doc) || !Object.hasOwn(doc.acts, kind)) return null;
  return doc.acts[kind] ?? null;
}

/** The kinds a room with this document admits: legacy, or declared plus platform (R-DECL-1, R-DECL-21). */
export function kindsOf(doc: AnyPolicyDocument): readonly string[] {
  return isDeclared(doc) ? [...Object.keys(doc.acts), ...PLATFORM_KIND_LIST] : LEGACY_KINDS; // G2:kinds-of
}

/** The shape of a target value (R-DECL-4), or null when it fits none. */
export function shapeOf(target: unknown): TargetShape | null {
  if (target === null) return "none";
  if (typeof target !== "object" || Array.isArray(target)) return null;
  const t = target as Record<string, unknown>;
  if ("act" in t) return "entry";
  if ("path" in t || "line" in t || "head" in t) return "line";
  if ("generation" in t) return "version";
  if ("lane" in t) return "thread";
  return null;
}

/**
 * The steps an act of `kind` runs on `target` under this document, or null
 * when the document does not let it act there: the declaration's step list
 * in a `v2` room, the legacy dispatch in a `v1` room. Platform kinds have no
 * steps; platform code judges them.
 */
export function stepsOf(doc: AnyPolicyDocument, kind: string, target: unknown): StepList | null {
  const shape = shapeOf(target);
  if (!shape) return null;
  if (isDeclared(doc)) return declarationOf(doc, kind)?.targets[shape] ?? null; // G2:declared-steps
  const step = Object.hasOwn(LEGACY_STEPS, kind) ? LEGACY_STEPS[kind]![shape] : undefined;
  return step ? [step] : null;
}

/**
 * May a member with this role sign this kind (R-GEN-5 as amended)? Under a
 * `v1` document, and for `renew` and `roster` in every room, the legacy
 * table. For a declared kind, `who.roles`, with `admin` implicit (R-DECL-11).
 * `recover` and kinds the document does not declare are not decided here:
 * the room judges `recover` by R-DECL-21, and refuses an undeclared kind at
 * step 4a.
 */
export function roleMaySign(doc: AnyPolicyDocument, role: Role, kind: string): boolean {
  if (!isDeclared(doc) || kind === "renew" || kind === "roster") return (LEGACY_ROLE_KINDS[role] as readonly string[]).includes(kind);
  const d = declarationOf(doc, kind);
  if (!d) return false;
  return role === "admin" || (d.who.roles as readonly string[]).includes(role); // G2:admin-implicit
}

/**
 * What a grant from this role may name (R-ADM-5 as amended): in a `v1`
 * room the legacy delegable kinds the role may sign; in a `v2` room `renew`
 * if the role may sign it, and every declared kind the role may sign whose
 * `who.delegable` is not false. The grantor's client expands `*` to this.
 */
export function delegableBy(doc: AnyPolicyDocument, role: Role): { readonly platform: readonly string[]; readonly declared: readonly string[] } {
  if (!isDeclared(doc)) return { platform: LEGACY_DELEGABLE.filter((k) => roleMaySign(doc, role, k)), declared: [] };
  return {
    platform: DELEGABLE_PLATFORM.filter((k) => roleMaySign(doc, role, k)),
    declared: Object.keys(doc.acts).filter((k) => doc.acts[k]!.who.delegable !== false && roleMaySign(doc, role, k)), // G2:delegable
  };
}

/**
 * The built-in default declarations (note section 6): a `v2` document with
 * the fields of `base` and the code-review application's seven acts. A room
 * adopts them only by activating such a document (R-DECL-1).
 */
export function codeReviewPolicy(base: PolicyDocument): PolicyDocumentV2 {
  return {
    format: "artroom-policy-v2",
    profile: base.profile,
    steps: "artroom-steps-v1",
    owners: base.owners,
    carry: base.carry,
    lanes: base.lanes,
    retiredEvidence: base.retiredEvidence,
    rules: base.rules,
    acts: CODE_REVIEW_ACTS,
  };
}
