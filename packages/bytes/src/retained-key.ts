/** Storage key for a value whose domain and digest a native consumer names.
 * This chooses a key; callers still validate the named bytes and authority. */
import { DOMAINS } from "@generalbusiness/dap-contract";
import type { Digest } from "@generalbusiness/dap-contract";

export type RetainedValueKey = { kind: "definition"; digest: Digest } | { kind: "value"; domain: string; digest: Digest };

/** Definition-domain values share the declaration store. No transport alias. */
export function retainedValueKey(domain: string, digest: Digest): RetainedValueKey {
  return domain === DOMAINS.definition ? { kind: "definition", digest } : { kind: "value", domain, digest };
}
