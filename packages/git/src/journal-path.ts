/** Internal journal archive names (durability design 15.4). No bytes are read or exported here. */
import type { Digest, ScopeId } from "@generalbusiness/dap-contract";
import { base32, isDigest, isScopeId, unbase32, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { GitRefusal } from "./names.ts";

const ROOT = "journal/v1/";
const REF = "refs/artroom/journal/";
const DOMAIN_BYTES = 158; // d_ plus ceil(8n/5) base32 characters fits one 255-byte segment.
const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const plainKinds = ["definition", "entry", "rule", "snapshot"] as const;
type PlainKind = (typeof plainKinds)[number];
export type ArchiveRetainedName = { kind: PlainKind; digest: Digest } | { kind: "value"; domain: string; digest: Digest };

/** Native scope spelling, including canonical base32 padding bits; no ID conversion. */
export function journalRef(scope: unknown): string {
  if (!isScopeId(scope)) throw new GitRefusal("bad-ref-name", "journal scope");
  return REF + scope;
}

export function scopeOfJournalRef(ref: unknown): ScopeId | null {
  if (typeof ref !== "string" || ref.length !== REF.length + 55 || !ref.startsWith(REF)) return null;
  const scope = ref.slice(REF.length);
  return isScopeId(scope) ? scope : null;
}

/** A domain is encoded as data, never interpreted as a path or shortened to a hash. */
export function archiveDomain(domain: string): string {
  if (typeof domain !== "string") throw new GitRefusal("bad-path", "journal domain");
  if (domain.length > DOMAIN_BYTES) throw new GitRefusal("too-large", "journal domain");
  if (!wellFormed(domain)) throw new GitRefusal("bad-path", "journal domain");
  const bytes = utf8(domain);
  if (bytes.length > DOMAIN_BYTES) throw new GitRefusal("too-large", "journal domain");
  return "d_" + base32(bytes);
}

/** Null for a noncanonical spelling, invalid UTF-8 or an oversized segment. A leading BOM is data. */
export function domainOfArchiveSegment(segment: unknown): string | null {
  if (typeof segment !== "string" || segment.length > 255 || !segment.startsWith("d_")) return null;
  const bytes = unbase32(segment.slice(2));
  if (bytes === null || bytes.length > DOMAIN_BYTES) return null;
  try { return strict.decode(bytes); } catch { return null; }
}

/** Logical retained path before the layout's directory fan-out. Texts and unknown kinds are never accepted. */
export function archiveRetainedPath(input: ArchiveRetainedName): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new GitRefusal("bad-path", "journal retained input");
  const fields = input.kind === "value" ? ["kind", "domain", "digest"] : ["kind", "digest"];
  if (Object.keys(input).length !== fields.length || fields.some(field => !Object.hasOwn(input, field))) throw new GitRefusal("bad-path", "journal retained input");
  if (!isDigest(input.digest)) throw new GitRefusal("bad-path", "journal retained digest");
  const suffix = input.digest.slice("sha256:".length);
  if (input.kind === "value") return `${ROOT}retained/value/${archiveDomain(input.domain)}/${suffix}`;
  if (!(plainKinds as readonly string[]).includes(input.kind)) throw new GitRefusal("bad-path", "journal retained kind");
  return `${ROOT}retained/${input.kind}/${suffix}`;
}

/** Parses only the logical path grammar. Filesystem modes and fan-out are the later layout reader's responsibility. */
export function retainedOfArchivePath(path: unknown): ArchiveRetainedName | null {
  if (typeof path !== "string" || path.length > ROOT.length + "retained/value/".length + 255 + 1 + 64) return null;
  const match = /^journal\/v1\/retained\/(definition|entry|rule|snapshot|value)\/(?:([^/]+)\/)?([0-9a-f]{64})$/.exec(path);
  if (!match) return null;
  const [, kind, segment, hex] = match;
  const digest = `sha256:${hex}`;
  if (!isDigest(digest)) return null;
  if (kind === "value") {
    const domain = domainOfArchiveSegment(segment);
    return domain === null ? null : { kind, domain, digest };
  }
  return segment === undefined ? { kind: kind as PlainKind, digest } : null;
}

export function archiveSegmentPath(first: number): string {
  if (!Number.isSafeInteger(first) || first < 0 || first > 999_999_999_999) throw new GitRefusal("bad-path", "journal segment");
  return `${ROOT}segments/${String(first).padStart(12, "0")}.jsonl`;
}

export function firstOfArchiveSegment(path: unknown): number | null {
  if (typeof path !== "string") return null;
  const match = /^journal\/v1\/segments\/([0-9]{12})\.jsonl$/.exec(path);
  return match ? Number(match[1]) : null;
}
