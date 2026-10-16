/** Private v1 export admission. The A1 inventory/writer must call this before
 * selecting archive bodies. This module neither inventories nor exports. */
import { INVITATION_KEY_MEMBERSHIP } from "@generalbusiness/dap-contract";
import type { Digest } from "@generalbusiness/dap-contract";
import { isDigest } from "@generalbusiness/artroom-bytes";

export type ArchiveExportRefusal = "unsupported-credential-cohort" | "unsupported-archive-cohort" | "unsupported-custom-domain" | "unsupported-foreign-copy";
export type ArchiveExportAdmission = { ok: true } | { ok: false; reason: ArchiveExportRefusal };
export interface ArchivePrivacyInventory { readonly customDomains: boolean; readonly foreignCopies: boolean }

/** Certified digests are trusted reviewer configuration, never request input.
 * The future inventory must inspect the whole cohort; it cannot omit entries.
 * Passing this policy establishes no history integrity or replay completeness. */
export function admitArchiveExport(definition: string, certified: ReadonlySet<Digest>, inventory: () => ArchivePrivacyInventory): ArchiveExportAdmission {
  if (definition !== INVITATION_KEY_MEMBERSHIP) {
    if (definition.startsWith("platform:membership@")) return { ok: false, reason: "unsupported-credential-cohort" };
    if (!isDigest(definition) || !certified.has(definition)) return { ok: false, reason: "unsupported-archive-cohort" };
  }
  const privacy = inventory();
  if (privacy.customDomains !== false) return { ok: false, reason: "unsupported-custom-domain" };
  if (privacy.foreignCopies !== false) return { ok: false, reason: "unsupported-foreign-copy" };
  return { ok: true };
}
