/**
 * The legacy vocabulary `artroom-legacy-v1` (docs/protocol.md R-DECL-1):
 * what a room admits while its active policy document is `v1`, and how
 * `artroom verify` judges every entry admitted under one.
 *
 * Its meaning is the admission code it describes (main b44601dd:
 * `room/schema.ts`, `room/roster.ts`, `room/admission.ts` and
 * `room/authority.ts`), kept as one frozen path in the room and in verify.
 * This is that code's canonical description, so that the vocabulary has one
 * identity: the SHA-256 of its RFC 8785 canonical JSON. It is never edited.
 * A test in the policy package recomputes the digest.
 */

type Frozen<T> = T extends readonly (infer U)[] ? readonly Frozen<U>[] : T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;

function deepFreeze<T>(value: T): Frozen<T> {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}

const LEASE = { type: "int", min: 1, required: true } as const;
const GENERATION = { type: "int", min: 0, required: true } as const;
const SHA = { type: "sha", required: true } as const;
const BECAUSE = { type: "reasons", max: 64, required: false } as const;

export const ARTROOM_LEGACY_V1 = deepFreeze({
  name: "artroom-legacy-v1",
  source: "main b44601dd",
  envelope: { v: 1, closed: true, kinds: ["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"] },
  targets: {
    null: null,
    lane: { lane: "lane ID" },
    proposal: { lane: "lane ID", generation: "integer from 1" },
    entry: { act: "entry ID" },
    line: { lane: "lane ID", generation: "integer from 1", head: "sha", path: "repository path", line: "integer from 1", endLine: "optional integer from line" },
  },
  limits: { envelope: 65536, goal: 1024, long: 16384, medium: 8192, patterns: 64, patternChars: 256, reasons: 64 },
  acts: {
    claim: [
      {
        target: "null",
        body: {
          goal: { type: "text", max: 1024, required: true },
          scope: { type: "globs", min: 1, max: 64, required: true },
          purpose: { type: "enum", values: ["config-recovery"], required: false },
          plan: { type: "text", max: 16384, required: false },
          because: BECAUSE,
        },
        effect: "opened",
      },
      {
        target: "lane",
        body: {
          scope: { type: "globs", min: 1, max: 64, required: true },
          goal: { type: "text", max: 1024, required: false },
          plan: { type: "text", max: 16384, required: false },
          because: BECAUSE,
          expectedGeneration: GENERATION,
          lease: { type: "int", min: 1, required: false },
        },
        effect: "rescoped with lease, taken-over without; obligationsRecomputed false",
      },
    ],
    propose: [
      {
        target: "lane",
        body: { lease: LEASE, expectedGeneration: GENERATION, head: SHA, summary: { type: "text", max: 8192, required: true }, because: BECAUSE },
        effect: "proposed",
      },
    ],
    note: [
      {
        target: "entry",
        body: { text: { type: "text", max: 16384, required: true }, replyTo: { type: "act", required: false } },
        effect: "none",
      },
      {
        target: "line",
        body: { text: { type: "text", max: 16384, required: true }, replyTo: { type: "act", required: false } },
        effect: "none",
      },
    ],
    review: [
      {
        target: "proposal",
        body: {
          head: SHA,
          verdict: { type: "enum", values: ["approve", "object"], required: true },
          scope: { type: "globs", min: 1, max: 64, required: true },
          dependsOn: { type: "globs", min: 0, max: 64, required: false },
          text: { type: "text", max: 16384, required: true },
        },
        effect: "obligations",
      },
    ],
    check: [
      {
        target: "proposal",
        body: {
          obligation: { type: "obligation", required: true },
          check: { type: "checker", required: true },
          integration: SHA,
          input: { type: "check-input", forms: ["tree", "filtered"], required: true },
          config: { type: "digest", required: true },
          runner: { type: "digest", required: true },
          volatile: { type: "bool", required: true },
          ok: { type: "bool", required: true },
          detail: { type: "text", max: 16384, required: true },
          landOp: { type: "op", required: false },
        },
        effect: "obligations",
      },
    ],
    land: [{ target: "proposal", body: { lease: LEASE, head: SHA }, effect: "land-op" }],
    release: [{ target: "lane", body: { lease: LEASE, note: { type: "text", max: 8192, required: false } }, effect: "released" }],
    renew: [{ target: "lane", body: { lease: LEASE }, effect: "renewed" }],
    roster: [
      {
        target: "null",
        ops: {
          invite: ["member", "role?", "custody", "expiresAt", "secretHash", "session?"],
          join: ["invitation", "secret"],
          "set-role": ["member", "role"],
          remove: ["member"],
          "revoke-key": ["key", "reason"],
          team: ["team", "members"],
          delegate: ["to", "kinds", "lanes", "expiresAt"],
          undelegate: ["delegation"],
          "rotate-recovery": ["key"],
        },
      },
    ],
  },
  roles: {
    admin: ["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"],
    maintainer: ["claim", "propose", "note", "review", "land", "release", "renew", "roster"],
    member: ["claim", "propose", "note", "review", "land", "release", "renew", "roster"],
    agent: ["claim", "propose", "note", "review", "land", "release", "renew", "roster"],
    checker: ["check", "note", "roster"],
  },
  rosterOps: {
    admin: ["invite", "set-role", "remove", "revoke-key", "team", "delegate", "undelegate"],
    others: ["delegate", "undelegate"],
    join: "the invited key, once",
    recovery: ["invite", "set-role", "remove", "revoke-key", "team", "rotate-recovery"],
  },
  delegation: {
    kinds: ["claim", "propose", "note", "review", "check", "land", "release", "renew"],
    wildcard: "* expands, at the grant's admission, to the grantor role's kinds other than roster",
    session: { lanes: "*", ttlSeconds: { min: 60, max: 2592000 } },
  },
  recovery: {
    kind: "claim",
    purpose: "config-recovery",
    rules: ["R-ADMIN-5", "R-ADMIN-6", "R-ADMIN-7", "R-ADMIN-8"],
    signer: "an active admin's own key",
    scope: ".artroom/**",
    skips: ["refuse", "require", "carry", "land", "lanes"],
    flag: "config-recovery",
  },
  refusals: [
    "invalid-body",
    "body-too-large",
    "not-member",
    "key-revoked",
    "delegation-invalid",
    "role-forbids",
    "idempotency-mismatch",
    "secret-detected",
    "invitation-invalid",
    "key-in-use",
    "custody-mismatch",
    "lane-unknown",
    "lane-held",
    "not-holder",
    "lease-fenced",
    "generation-moved",
    "scope-overlap",
    "glob-invalid",
    "head-unknown",
    "head-mismatch",
    "outside-claim",
    "diff-too-large",
    "policy-invalid",
    "land-in-progress",
    "recovery-scope",
    "workspace-not-ready",
    "not-authorized-reviewer",
    "self-review",
    "not-authorized-checker",
    "check-binding",
    "obligation-unknown",
    "obligation-open",
    "objection-open",
    "admin-required",
    "last-admin",
    "recovery-only",
    "policy-budget-exceeded",
    "policy-type-error",
  ],
});

/** The legacy vocabulary's description. */
export type LegacyVocabulary = typeof ARTROOM_LEGACY_V1;

/** `sha256:` and the hex SHA-256 of `ARTROOM_LEGACY_V1`'s canonical JSON. Asserted by a test. */
export const ARTROOM_LEGACY_V1_DIGEST = "sha256:ea4361a697d1c7e1bf7ecdfe6576b81ecbad48aee78b857e0a7958dfa14b3937" as const;
