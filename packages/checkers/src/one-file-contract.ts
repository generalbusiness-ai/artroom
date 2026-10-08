/** Adopted 721/734 design records. Data shape is not job authority, ABI/image trust or activation. */
import type { Digest, FactRef } from "@generalbusiness/artroom-contract";
import type { ObjectId } from "@generalbusiness/artroom-git";
import type { Configuration, Variable } from "./configuration.ts";
import type { ErrorReason, StepReport } from "./outcome.ts";

export const CONFIGURATION2_DOMAIN = "artroom-check-configuration-2";
export type ConfigurationSelector =
  | { domain: "artroom-check-configuration-1"; digest: Digest }
  | { domain: "artroom-check-configuration-2"; digest: Digest };
export interface Configuration2 extends Configuration { checkout: { kind: "one-file"; abi: Digest } }
export type CheckTarget =
  | { kind: "integration"; manifest: FactRef; base: ObjectId; commit: ObjectId; tree: ObjectId }
  | { kind: "one-file"; manifest: FactRef; base: ObjectId; tree: ObjectId; path: string; digest: Digest; size: number; content: string };
export interface OneFileTargetIdentity {
  kind: "one-file"; manifest: FactRef; base: ObjectId; tree: ObjectId; path: string; digest: Digest; size: number;
}
export interface OneFileCheckABI {
  format: "artroom-one-file-check-abi-1";
  targetInput: Digest; jobInput: Digest; configurationInput: Digest;
  baseRead: Digest; candidateConstruction: Digest; checkoutVerification: Digest;
  report: Digest; details: Digest; budgets: Digest;
  images: { image: Digest; adapter: Digest; correspondence: Digest }[];
}
export const ONE_FILE_CHECKOUT_REASONS = [
  "bad-object-id", "unsupported-object-format", "bad-remote", "credential-in-url", "missing-object",
  "wrong-type", "wrong-size", "hash-mismatch", "malformed-commit", "repeated-header", "malformed-tree",
  "unknown-mode", "gitlink", "too-large", "unreadable", "tree-mismatch", "incomplete", "bad-path",
  "path-conflict", "bad-directory", "fetch-failed", "checkout-failed", "not-as-fetched",
] as const;
export type OneFileCheckoutReason = typeof ONE_FILE_CHECKOUT_REASONS[number];
export type OneFileCheckout =
  | { confirmed: false; reason: OneFileCheckoutReason }
  | { confirmed: true; head: ObjectId; indexTree: ObjectId; worktreeTree: ObjectId };
export interface OneFileRunReport {
  format: "artroom-one-file-check-run-1";
  job: FactRef; configuration: ConfigurationSelector; abi: Digest; target: OneFileTargetIdentity;
  started: boolean; image: Digest | null; environment: Variable[];
  checkout: OneFileCheckout; steps: StepReport[]; end: "complete" | "lost" | "limits";
}
export interface OneFileDetails {
  format: "artroom-one-file-check-details-1";
  provenance: {
    job: FactRef; configuration: ConfigurationSelector; abi: Digest; target: OneFileTargetIdentity;
    image: { declared: Digest; resolved: Digest | null }; environment: Digest;
    checkout: OneFileCheckout | null; steps: { name: string; status: number | null }[]; run: string;
  };
}
/** New reasons apply only to these successor records; shipped ERRORS remains unchanged. */
export type OneFileErrorReason = ErrorReason | "target-incompatible" | "abi-incompatible" | "target-mismatch" | "abi-mismatch";
