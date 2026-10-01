/**
 * The restricted glob syntax of docs/protocol.md R-PATH-1..3, as the mock
 * room and the policy dry run need it. `**` matches zero or more whole
 * segments; `*` matches any run of characters other than `/`.
 */

function segmentRegex(segment: string): RegExp {
  const escaped = segment.split("*").map((part) => part.replace(/[.+^${}()|[\]\\?]/g, "\\$&"));
  return new RegExp(`^${escaped.join("[^/]*")}$`);
}

function matchSegments(path: readonly string[], pattern: readonly string[]): boolean {
  if (pattern.length === 0) return path.length === 0;
  const [head, ...rest] = pattern;
  if (head === "**") {
    for (let i = 0; i <= path.length; i++) if (matchSegments(path.slice(i), rest)) return true;
    return false;
  }
  if (path.length === 0 || head === undefined) return false;
  return segmentRegex(head).test(path[0]!) && matchSegments(path.slice(1), rest);
}

/** True when `path` matches `pattern` (R-PATH-2). */
export function matches(path: string, pattern: string): boolean {
  return matchSegments(path.split("/"), pattern.split("/"));
}

/** True when `path` matches any of `patterns`. */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matches(path, p));
}

const isLiteral = (pattern: string) => !pattern.includes("*");

function segmentsMayMeet(a: string, b: string): boolean {
  if (isLiteral(a)) return segmentRegex(b).test(a);
  if (isLiteral(b)) return segmentRegex(a).test(b);
  // Both have wildcards: they can meet unless their fixed prefixes or suffixes disagree.
  const [pa, sa] = [a.slice(0, a.indexOf("*")), a.slice(a.lastIndexOf("*") + 1)];
  const [pb, sb] = [b.slice(0, b.indexOf("*")), b.slice(b.lastIndexOf("*") + 1)];
  const prefixOk = pa.startsWith(pb) || pb.startsWith(pa);
  const suffixOk = sa.endsWith(sb) || sb.endsWith(sa);
  return prefixOk && suffixOk;
}

function mayMeet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a[0] === "**") return mayMeet(a.slice(1), b) || (b.length > 0 && mayMeet(a, b.slice(1)));
  if (b[0] === "**") return mayMeet(a, b.slice(1)) || (a.length > 0 && mayMeet(a.slice(1), b));
  if (a.length === 0 || b.length === 0) return false;
  return segmentsMayMeet(a[0]!, b[0]!) && mayMeet(a.slice(1), b.slice(1));
}

/**
 * Conservative overlap (R-PATH-3): `null` when no path can match both;
 * otherwise whether the overlap is certain (one pattern is a literal path
 * the other matches).
 */
export function overlap(a: string, b: string): { certain: boolean } | null {
  if (!mayMeet(a.split("/"), b.split("/"))) return null;
  const certain = (isLiteral(a) && matches(a, b)) || (isLiteral(b) && matches(b, a));
  return { certain };
}
