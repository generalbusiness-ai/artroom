/**
 * The restricted glob syntax (R-PATH-1), matching (R-PATH-2) and
 * conservative overlap (R-PATH-3). Platform code: policy cannot change it.
 */

import type { Glob, RepoPath } from "@generalbusiness/artroom-contract";

const BAD_CHARS = /[?[\]{}!\\]/;

/** Why `pattern` is not a valid glob, or null when it is valid. */
export function globProblem(pattern: unknown): string | null {
  if (typeof pattern !== "string" || pattern === "") return "a glob must be a non-empty string";
  if (pattern.startsWith("/")) return `${pattern}: a glob must not start with /`;
  if (BAD_CHARS.test(pattern)) return `${pattern}: ? [ ] { } ! and \\ are not allowed`;
  for (const segment of pattern.split("/")) {
    if (segment === "") return `${pattern}: empty segments are not allowed`;
    if (segment === "." || segment === "..") return `${pattern}: . and .. segments are not allowed`;
  }
  return null;
}

export function isGlob(pattern: unknown): pattern is Glob {
  return globProblem(pattern) === null;
}

/** Literal text in which `*` matches any run of characters, possibly empty. */
function segmentMatches(text: string, segment: string): boolean {
  if (segment === "**") return true;
  const parts = segment.split("*");
  if (parts.length === 1) return text === segment;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  if (text.length < first.length + last.length) return false;
  if (!text.startsWith(first) || !text.endsWith(last)) return false;
  let at = first.length;
  const end = text.length - last.length;
  for (let i = 1; i < parts.length - 1; i++) {
    const found = text.indexOf(parts[i]!, at);
    if (found < 0 || found + parts[i]!.length > end) return false;
    at = found + parts[i]!.length;
  }
  return true;
}

/** True when `path` matches `pattern`: segments in order, `**` for zero or more whole segments. */
export function matchGlob(path: RepoPath, pattern: Glob): boolean {
  const p = path.split("/");
  const g = pattern.split("/");
  const memo = new Map<number, boolean>();
  function at(i: number, j: number): boolean {
    const key = i * (g.length + 1) + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    if (j === g.length) result = i === p.length;
    else if (g[j] === "**") result = at(i, j + 1) || (i < p.length && at(i + 1, j));
    else result = i < p.length && segmentMatches(p[i]!, g[j]!) && at(i + 1, j + 1);
    memo.set(key, result);
    return result;
  }
  return at(0, 0);
}

export function matchesAny(path: RepoPath, patterns: readonly Glob[]): boolean {
  return patterns.some((pattern) => matchGlob(path, pattern));
}

/** The paths that match any of `patterns`, in their original order. */
export function matching(paths: readonly RepoPath[], patterns: readonly Glob[]): RepoPath[] {
  return paths.filter((path) => matchesAny(path, patterns));
}

/** Whether two single segments could match a common segment. May say yes wrongly; never no wrongly. */
function segmentsMayOverlap(a: string, b: string): boolean {
  const aStar = a.includes("*");
  const bStar = b.includes("*");
  if (!aStar && !bStar) return a === b;
  if (!aStar) return segmentMatches(a, b);
  if (!bStar) return segmentMatches(b, a);
  const aParts = a.split("*");
  const bParts = b.split("*");
  const aPre = aParts[0]!;
  const bPre = bParts[0]!;
  const aSuf = aParts[aParts.length - 1]!;
  const bSuf = bParts[bParts.length - 1]!;
  const prefixes = aPre.startsWith(bPre) || bPre.startsWith(aPre);
  const suffixes = aSuf.endsWith(bSuf) || bSuf.endsWith(aSuf);
  return prefixes && suffixes;
}

/**
 * Conservative overlap (R-PATH-3): false only when no path, existing or not,
 * can match both patterns.
 */
export function globsOverlap(a: Glob, b: Glob): boolean {
  const x = a.split("/");
  const y = b.split("/");
  const memo = new Map<number, boolean>();
  function at(i: number, j: number): boolean {
    const key = i * (y.length + 1) + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    if (i === x.length && j === y.length) result = true;
    else if (i < x.length && x[i] === "**") result = at(i + 1, j) || (j < y.length && at(i, j + 1));
    else if (j < y.length && y[j] === "**") result = at(i, j + 1) || (i < x.length && at(i + 1, j));
    else if (i === x.length || j === y.length) result = false;
    else result = segmentsMayOverlap(x[i]!, y[j]!) && at(i + 1, j + 1);
    memo.set(key, result);
    return result;
  }
  return at(0, 0);
}

/**
 * Conservative containment: true only when every path that matches `inner`
 * also matches `outer`. It may say no wrongly; it never says yes wrongly.
 * An inner `**` is covered only by an outer `**`. Other inner segments are
 * read as literal text, so an outer `*` absorbs an inner `*`.
 */
export function globCovers(outer: Glob, inner: Glob): boolean {
  const o = outer.split("/");
  const n = inner.split("/");
  const memo = new Map<number, boolean>();
  function at(i: number, j: number): boolean {
    const key = i * (n.length + 1) + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    if (j === n.length) result = o.slice(i).every((s) => s === "**");
    else if (i === o.length) result = false;
    else if (o[i] === "**") result = at(i + 1, j) || at(i, j + 1);
    else if (n[j] === "**") result = false;
    else result = segmentMatches(n[j]!, o[i]!) && at(i + 1, j + 1);
    memo.set(key, result);
    return result;
  }
  return at(0, 0);
}
