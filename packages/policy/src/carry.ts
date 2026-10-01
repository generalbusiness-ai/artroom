/**
 * The platform's carry conditions (plan section 7, R-CARRY-1 to 12). This is
 * platform code in plain TypeScript: policy supplies only parameters
 * (`carry` settings, `retiredEvidence`) and `carry` rules, which run after
 * these conditions pass and can only narrow (R-CARRY-4, R-POL-10).
 */

import type {
  CarrySettings,
  CheckInput,
  Digest,
  Glob,
  NotCarried,
  PolicyDocument,
  RepoPath,
  RevocationReason,
  RuleInput,
  Sha,
} from "@generalbusiness/artroom-contract";
import { globsOverlap, matchesAny, matching } from "./glob.ts";

/** The platform's global inputs (R-CARRY-3). Policy can add to this list, never remove from it. */
export const PLATFORM_GLOBAL_INPUTS: readonly Glob[] = Object.freeze([
  ".artroom/**",
  "package.json",
  "**/package.json",
  "package-lock.json",
  "**/package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "bun.lockb",
  "tsconfig*.json",
  "**/tsconfig*.json",
  "wrangler.*",
  "**/wrangler.*",
  "vite.config.*",
  "vitest.config.*",
  "jest.config.*",
  "playwright.config.*",
  "Makefile",
  "Dockerfile",
  ".github/**",
  "scripts/**",
  ".npmrc",
  ".nvmrc",
]);

/**
 * Inputs every scoped checker sees in addition to its declared inputs: the
 * global inputs plus tests and test and build configuration (plan section 7,
 * "Carrying a check forward"; checker review 45431cd9 P2.1). The protocol at
 * 7771921f lists only the shared global inputs; see the README's contract gaps.
 */
export const PLATFORM_CHECK_INPUTS: readonly Glob[] = Object.freeze([
  ...PLATFORM_GLOBAL_INPUTS,
  "**/tests/**",
  "**/test/**",
  "**/__tests__/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/vite.config.*",
  "**/vitest.config.*",
  "**/vitest.workspace.*",
  "**/jest.config.*",
  "**/playwright.config.*",
  "**/Makefile",
  "**/Dockerfile",
]);

/** The platform's list followed by the policy's additions, without repeats (R-CARRY-3). */
export function globalInputs(settings: CarrySettings): Glob[] {
  return [...new Set([...PLATFORM_GLOBAL_INPUTS, ...settings.globalInputs])];
}

/**
 * The policy's default `dependsOn` for the areas of the reviewed scope
 * (R-CARRY-2): the values of every `carry.dependsOn` key that may overlap a
 * scope pattern (R-PATH-3).
 */
export function defaultDependsOn(settings: CarrySettings, scope: readonly Glob[]): Glob[] {
  const out: Glob[] = [];
  for (const [area, deps] of Object.entries(settings.dependsOn))
    if (scope.some((s) => globsOverlap(area, s))) out.push(...deps);
  return [...new Set(out)];
}

/**
 * What a scoped checker's runner sees: its declared inputs, the platform's
 * check inputs and the policy's global inputs. Null means the whole tree,
 * the default (R-CARRY-6, R-CARRY-8). Neither a proposal nor policy can
 * remove a platform entry.
 */
export function checkerInputs(declared: readonly Glob[] | undefined, settings: CarrySettings): Glob[] | null {
  if (declared === undefined) return null;
  return [...new Set([...declared, ...PLATFORM_CHECK_INPUTS, ...settings.globalInputs])];
}

/** The files a scoped runner receives: exactly those matching its inputs (R-CARRY-9). */
export function filterSnapshot<E extends readonly [RepoPath, ...unknown[]]>(entries: readonly E[], inputs: readonly Glob[]): E[] {
  return entries.filter((e) => matchesAny(e[0], inputs));
}

/** A platform invariant, as `Explanation.invariants` shows it. */
export interface Invariant {
  readonly rule: `R-${string}`;
  readonly held: boolean;
  readonly detail?: string;
}

/** What the platform knows about the evidence beyond the carry rule input. */
export interface CarryFacts {
  /** The current state of the evidence's signing key (R-REV-2, R-REV-3). */
  readonly revoked?: RevocationReason;
  /** For checks only: the earlier binding and the new integration (R-CARRY-6, R-CARRY-9). */
  readonly check?: CheckCarryFacts;
}

export interface CheckBinding {
  readonly integration: Sha;
  readonly input: CheckInput;
  readonly config: Digest;
  readonly runner: Digest;
}

export interface CheckCarryFacts {
  readonly before: CheckBinding;
  readonly now: {
    readonly integration: Sha;
    readonly tree: Sha;
    /** The filtered snapshot the room built for the new integration, for a scoped checker. */
    readonly snapshot: Digest | null;
    /** From the active checker configuration (R-CARRY-7). */
    readonly config: Digest;
    readonly runner: Digest;
  };
  /** From the active checker configuration (R-CARRY-10). */
  readonly volatile: boolean;
}

export type CarryInput = Extract<RuleInput, { readonly kind: "carry" }>;

/** The outcome of the platform conditions alone. */
export type PlatformCarry =
  | {
      readonly carries: true;
      readonly basis:
        | {
            readonly code: "paths-unchanged";
            readonly tested: { readonly scope: readonly Glob[]; readonly dependsOn: readonly Glob[]; readonly globalInputs: readonly Glob[] };
            /** True when nothing declared or defaulted a dependency: the dry run highlights it (plan section 7). */
            readonly undeclared: boolean;
          }
        | { readonly code: "tree-identical"; readonly tree: Sha; readonly config: Digest; readonly runner: Digest }
        | { readonly code: "snapshot-identical"; readonly snapshot: Digest; readonly config: Digest; readonly runner: Digest };
      readonly invariants: readonly Invariant[];
    }
  | { readonly carries: false; readonly notCarried: NotCarried; readonly invariants: readonly Invariant[] };

function refuse(
  input: CarryInput,
  code: NotCarried["code"],
  text: string,
  invariants: Invariant[],
  rule: `R-${string}`,
  paths?: readonly RepoPath[],
): PlatformCarry {
  invariants.push({ rule, held: false, detail: text });
  const notCarried: NotCarried = paths ? { act: input.evidence.act, code, paths, text } : { act: input.evidence.act, code, text };
  return { carries: false, notCarried, invariants };
}

function revocation(input: CarryInput, doc: PolicyDocument, facts: CarryFacts, inv: Invariant[]): PlatformCarry | null {
  if (facts.revoked === "compromised")
    return refuse(input, "key-compromised", "not carried: the key that signed it was revoked as compromised", inv, "R-REV-3");
  if (facts.revoked === "retired" && doc.retiredEvidence === "reopens")
    return refuse(
      input,
      "policy-rejected",
      "not carried: the key that signed it was retired, and this policy reopens evidence from retired keys",
      inv,
      "R-REV-2",
    );
  inv.push({ rule: "R-CARRY-12", held: true });
  return null;
}

/** R-CARRY-1 to 3, and R-CARRY-12, for a review verdict. */
export function reviewConditions(input: CarryInput, doc: PolicyDocument, facts: CarryFacts = {}): PlatformCarry {
  const inv: Invariant[] = [];
  if (!doc.carry.verdicts)
    return refuse(input, "carry-disabled", "not carried: this policy turns verdict carrying off", inv, "R-CARRY-4");
  const revoked = revocation(input, doc, facts, inv);
  if (revoked) return revoked;
  const changed = input.changedSince;
  const scope = input.evidence.scope;
  const inScope = matching(changed, scope);
  if (inScope.length)
    return refuse(input, "scope-changed", `not carried: ${inScope.join(", ")} changed inside the reviewed scope`, inv, "R-CARRY-1", inScope);
  inv.push({ rule: "R-CARRY-1", held: true });
  const dependsOn = [...new Set([...input.evidence.dependsOn, ...defaultDependsOn(doc.carry, scope)])];
  const inDeps = matching(changed, dependsOn);
  if (inDeps.length)
    return refuse(input, "dependency-changed", `not carried: ${inDeps.join(", ")} changed inside a declared dependency`, inv, "R-CARRY-2", inDeps);
  inv.push({ rule: "R-CARRY-2", held: true });
  const globals = globalInputs(doc.carry);
  const inGlobals = matching(changed, globals);
  if (inGlobals.length)
    return refuse(input, "global-input-changed", `not carried: ${inGlobals.join(", ")} is a global input`, inv, "R-CARRY-3", inGlobals);
  inv.push({ rule: "R-CARRY-3", held: true });
  return {
    carries: true,
    basis: { code: "paths-unchanged", tested: { scope, dependsOn, globalInputs: globals }, undeclared: dependsOn.length === 0 && changed.length > 0 },
    invariants: inv,
  };
}

/** R-CARRY-6, 9, 10 and 12, for a check. The default input is the whole tree. */
export function checkConditions(input: CarryInput, doc: PolicyDocument, facts: CarryFacts): PlatformCarry {
  const inv: Invariant[] = [];
  const check = facts.check;
  if (!check) throw new TypeError("checkConditions needs the check's binding facts");
  if (!doc.carry.checks)
    return refuse(input, "carry-disabled", "not carried: this policy turns check carrying off", inv, "R-CARRY-4");
  const revoked = revocation(input, doc, facts, inv);
  if (revoked) return revoked;
  if (check.volatile)
    return refuse(input, "volatile-inputs", "not carried: the checker uses volatile inputs, so it reruns", inv, "R-CARRY-10");
  inv.push({ rule: "R-CARRY-10", held: true });
  if (check.before.config !== check.now.config)
    return refuse(input, "config-changed", "not carried: the checker configuration changed, so it reruns", inv, "R-CARRY-6");
  if (check.before.runner !== check.now.runner)
    return refuse(input, "runner-changed", "not carried: the runner environment changed, so it reruns", inv, "R-CARRY-6");
  const binding = check.before.input;
  if (binding.kind === "tree") {
    if (binding.tree !== check.now.tree)
      return refuse(input, "integration-changed", "not carried: the integration tree changed, so the check reruns", inv, "R-CARRY-6");
    inv.push({ rule: "R-CARRY-6", held: true, detail: "whole tree identical" });
    return {
      carries: true,
      basis: { code: "tree-identical", tree: binding.tree, config: check.now.config, runner: check.now.runner },
      invariants: inv,
    };
  }
  if (check.now.snapshot === null || binding.snapshot !== check.now.snapshot)
    return refuse(input, "integration-changed", "not carried: the filtered snapshot changed, so the check reruns", inv, "R-CARRY-9");
  inv.push({ rule: "R-CARRY-9", held: true, detail: "filtered snapshot identical" });
  return {
    carries: true,
    basis: { code: "snapshot-identical", snapshot: binding.snapshot, config: check.now.config, runner: check.now.runner },
    invariants: inv,
  };
}
