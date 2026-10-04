/** The restricted glob syntax (R-PATH-1), matching (R-PATH-2) and conservative overlap (R-PATH-3). */
import { describe, expect, it } from "vitest";
import { globProblem, globsOverlap, matchGlob, overlapIsCertain, pathProblem } from "../../src/glob.ts";

describe("R-PATH-1 syntax", () => {
  it("accepts segments, * and **", () => {
    for (const ok of ["src/**", "**/*.md", "a/b.ts", "*", "**", "src/*/x-*.test.ts"]) expect(globProblem(ok)).toBeNull();
  });
  it("refuses ?, brackets, braces, !, backslash, leading /, empty, . and .. segments, and partial **", () => {
    for (const bad of ["a?", "[ab]", "{a,b}", "!a", "a\\b", "/a", "a//b", "./a", "a/../b", "a**", "**b/c", ""]) expect(globProblem(bad)).not.toBeNull();
  });
  it("paths have no empty, . or .. segments", () => {
    expect(pathProblem("a/b")).toBeNull();
    for (const bad of ["/a", "a//b", "a/./b", "a/.."]) expect(pathProblem(bad)).not.toBeNull();
  });
});

describe("R-PATH-2 matching", () => {
  const cases: [string, string, boolean][] = [
    ["src/a.ts", "src/**", true],
    ["src", "src/**", true],
    ["src/x/y/z.ts", "src/**/z.ts", true],
    ["src/z.ts", "src/**/z.ts", true],
    ["docs/a.md", "**/*.md", true],
    ["a.md", "**/*.md", true],
    ["src/a.ts", "src/*.ts", true],
    ["src/x/a.ts", "src/*.ts", false],
    ["Src/a.ts", "src/**", false],
    ["src/a.test.ts", "**/*.test.*", true],
    ["package.json", "**/package.json", true],
    ["abcabc", "a*c*c", true],
    ["abc", "a*c*c", false],
  ];
  it("matches by segment, with * inside one segment and ** across any number", () => {
    for (const [path, pattern, want] of cases) expect(matchGlob(path, pattern), `${path} against ${pattern}`).toBe(want);
  });
});

describe("R-PATH-3 overlap", () => {
  it("reports real overlaps and rejects provably disjoint pairs", () => {
    expect(globsOverlap("src/**", "src/a.ts")).toBe(true);
    expect(globsOverlap("a/*", "*/b")).toBe(true);
    expect(globsOverlap("**/*.md", "docs/**")).toBe(true);
    expect(globsOverlap("src/*.ts", "src/*.js")).toBe(false);
    expect(globsOverlap("docs/**", "src/**")).toBe(false);
  });

  it("certain only when one side is a literal path the other matches", () => {
    expect(overlapIsCertain("src/app.ts", "src/**")).toBe(true);
    expect(overlapIsCertain("src/**", "src/a/**")).toBe(false);
  });

  it("never misses an overlap: every path matching both patterns is caught (exhaustive over a small universe)", () => {
    const segs = ["a", "b", "ab", "x.ts", "a.ts"];
    const paths: string[] = [];
    const build = (prefix: string[], depth: number) => {
      if (prefix.length) paths.push(prefix.join("/"));
      if (depth === 0) return;
      for (const s of segs) build([...prefix, s], depth - 1);
    };
    build([], 3);
    const pieces = ["a", "*", "**", "a*", "*.ts", "*b", "x.ts"];
    const patterns: string[] = [];
    for (const p of pieces) {
      patterns.push(p);
      for (const q of pieces) patterns.push(`${p}/${q}`);
    }
    const valid = patterns.filter((p) => globProblem(p) === null);
    let checked = 0;
    for (const p of valid)
      for (const q of valid) {
        const witness = paths.some((path) => matchGlob(path, p) && matchGlob(path, q));
        if (witness) {
          expect(globsOverlap(p, q), `${p} vs ${q}`).toBe(true);
          checked++;
        }
      }
    expect(checked).toBeGreaterThan(100);
  });
});
