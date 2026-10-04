/**
 * The restricted glob syntax, matching and conservative overlap
 * (R-PATH-1 to R-PATH-3). No regular expressions are built from patterns.
 */

import type { Glob, RepoPath } from "@generalbusiness/artroom-contract";

const FORBIDDEN = /[?[\]{}!\\]/;

/** Why a pattern is not valid under R-PATH-1, or null when it is. */
export function globProblem(pattern: string): string | null {
  if (typeof pattern !== "string" || pattern.length === 0) return "a pattern must be a non-empty string";
  if (pattern.length > 256) return "a pattern is longer than 256 characters";
  if (FORBIDDEN.test(pattern)) return "?, [, ], {, }, ! and \\ are not allowed";
  if (pattern.startsWith("/")) return "a pattern must not start with /";
  for (const seg of pattern.split("/")) {
    if (seg === "") return "a pattern must not have empty segments";
    if (seg === "." || seg === "..") return "a pattern must not have . or .. segments";
    if (seg.includes("**") && seg !== "**") return "** must be a whole segment";
  }
  return null;
}

/** Why a path is not a valid repository path, or null. */
export function pathProblem(path: string): string | null {
  if (typeof path !== "string" || path.length === 0) return "a path must be a non-empty string";
  if (path.startsWith("/")) return "a path must not start with /";
  for (const seg of path.split("/")) {
    if (seg === "" || seg === "." || seg === "..") return "a path must not have empty, . or .. segments";
  }
  return null;
}

/** Does one literal segment match a segment pattern in which `*` matches any run of non-`/` characters? */
function segmentMatches(seg: string, pat: string): boolean {
  if (!pat.includes("*")) return seg === pat;
  const parts = pat.split("*");
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  if (seg.length < first.length + last.length) return false;
  if (!seg.startsWith(first) || !seg.endsWith(last)) return false;
  let pos = first.length;
  const end = seg.length - last.length;
  for (let i = 1; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const at = seg.indexOf(p, pos);
    if (at < 0 || at + p.length > end) return false;
    pos = at + p.length;
  }
  return true;
}

/** Does `path` match `pattern` (R-PATH-2)? Case-sensitive, exact bytes, no normalization. */
export function matchGlob(path: RepoPath, pattern: Glob): boolean {
  const s = path.split("/");
  const p = pattern.split("/");
  // memo over (i, j): segment i of the path, segment j of the pattern
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    const key = i * (p.length + 1) + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let r: boolean;
    if (j === p.length) r = i === s.length;
    else if (p[j] === "**") r = go(i, j + 1) || (i < s.length && go(i + 1, j));
    else r = i < s.length && segmentMatches(s[i]!, p[j]!) && go(i + 1, j + 1);
    memo.set(key, r);
    return r;
  };
  return go(0, 0);
}

export function matchesAny(path: RepoPath, patterns: readonly Glob[]): boolean {
  return patterns.some((g) => matchGlob(path, g));
}

/** Could some single segment match both segment patterns? Exact for `*`-only segments. */
function segmentsOverlap(a: string, b: string): boolean {
  const as = a.includes("*");
  const bs = b.includes("*");
  if (!as && !bs) return a === b;
  if (!as) return segmentMatches(a, b);
  if (!bs) return segmentMatches(b, a);
  const ap = a.slice(0, a.indexOf("*"));
  const bp = b.slice(0, b.indexOf("*"));
  const asuf = a.slice(a.lastIndexOf("*") + 1);
  const bsuf = b.slice(b.lastIndexOf("*") + 1);
  const prefixes = ap.startsWith(bp) || bp.startsWith(ap);
  const suffixes = asuf.endsWith(bsuf) || bsuf.endsWith(asuf);
  return prefixes && suffixes;
}

/**
 * Could some path match both patterns (R-PATH-3)? Conservative: true unless
 * no path, existing or not, can match both.
 */
export function globsOverlap(a: Glob, b: Glob): boolean {
  const p = a.split("/");
  const q = b.split("/");
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    const key = i * (q.length + 1) + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let r = false;
    if (i === p.length && j === q.length) r = true;
    else if (i < p.length && p[i] === "**") r = go(i + 1, j) || (j < q.length && go(i, j + 1));
    else if (j < q.length && q[j] === "**") r = go(i, j + 1) || (i < p.length && go(i + 1, j));
    else if (i < p.length && j < q.length) r = segmentsOverlap(p[i]!, q[j]!) && go(i + 1, j + 1);
    memo.set(key, r);
    return r;
  };
  return go(0, 0);
}

function isLiteral(g: Glob): boolean {
  return !g.includes("*");
}

/** `certain` is true only when one pattern is a literal path that the other matches (R-PATH-3). */
export function overlapIsCertain(a: Glob, b: Glob): boolean {
  return (isLiteral(a) && matchGlob(a, b)) || (isLiteral(b) && matchGlob(b, a));
}
