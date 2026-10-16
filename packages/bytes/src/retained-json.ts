/** Byte validation for named retained JSON; no consumer or privacy policy. */
import type { Digest, DomainTag } from "@generalbusiness/dap-contract";
import { canonicalize, parseStrict, utf8 } from "./canonical.ts";
import { domainBytes } from "./domains.ts";
import { digestBytes } from "./hash.ts";

/** Raw retained copies and rule inputs use the hash of their actual bytes.
 * Undefined means invalid; JSON null is a valid result. Callers still check
 * the consumer's semantic shape and charge all read/parse work. */
export function rawRetainedJSON(digest: Digest, bytes: string): unknown | undefined {
  try { return digestBytes(utf8(bytes)) === digest ? parseStrict(bytes) : undefined; }
  catch { return undefined; }
}

/** Native value domains hash the parsed canonical value. Ordinary replay
 * preserves its existing allowance for noncanonical retained spellings;
 * an archive or stricter consumer explicitly asks for canonical bytes. */
export function domainRetainedJSON(domain: string, digest: Digest, bytes: string, options: { canonical?: boolean; max?: number } = {}): unknown | undefined {
  try {
    if (options.max !== undefined && (!Number.isSafeInteger(options.max) || options.max < 0 || bytes.length > options.max || utf8(bytes).length > options.max)) return undefined;
    const value: unknown = parseStrict(bytes);
    if (options.canonical && canonicalize(value) !== bytes) return undefined;
    return digestBytes(domainBytes(domain as DomainTag, value)) === digest ? value : undefined;
  } catch { return undefined; }
}
