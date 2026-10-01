/**
 * Path patterns (docs/protocol.md R-PATH-1..3). The UI uses the policy
 * runtime's own matcher and overlap test, so what the UI shows and what the
 * room decides cannot drift apart.
 */

import { globProblem, globsOverlap, matchGlob } from "@generalbusiness/artroom-policy";

export { globProblem };

/** True when `path` matches `pattern` (R-PATH-2). */
export const matches = (path: string, pattern: string): boolean => matchGlob(path, pattern);

/** True when `path` matches any of `patterns`. */
export const matchesAny = (path: string, patterns: readonly string[]): boolean => patterns.some((p) => matchGlob(path, p));

/**
 * Conservative overlap (R-PATH-3): `null` when no path can match both;
 * otherwise whether the overlap is certain (one pattern is a literal path
 * the other matches).
 */
export function overlap(a: string, b: string): { certain: boolean } | null {
  if (!globsOverlap(a, b)) return null;
  const literal = (g: string) => !g.includes("*");
  return { certain: (literal(a) && matchGlob(a, b)) || (literal(b) && matchGlob(b, a)) };
}
