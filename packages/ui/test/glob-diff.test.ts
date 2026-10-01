import { describe, expect, test } from "vitest";
import { matches, overlap } from "../src/room/glob.ts";
import { DIFFS, parseDiff } from "../src/room/mock/diffs.ts";

describe("globs (R-PATH)", () => {
  test("** matches zero or more segments; * stays within one", () => {
    expect(matches("src/lib/authz/check.ts", "src/lib/authz/**")).toBe(true);
    expect(matches("src/lib/authz", "src/lib/authz/**")).toBe(true);
    expect(matches("src/lib/authz/a/b.ts", "src/lib/*/b.ts")).toBe(false);
    expect(matches("tsconfig.base.json", "tsconfig*.json")).toBe(true);
  });

  test("overlap is conservative and certain only with a literal path", () => {
    expect(overlap("src/lib/authz/check.ts", "src/lib/authz/**")).toEqual({ certain: true });
    expect(overlap("src/lib/**", "src/lib/authz/**")).toEqual({ certain: false });
    expect(overlap("src/lib/log/**", "src/api/middleware.ts")).toBeNull();
    expect(overlap("src/*.ts", "src/*.js")).toBeNull();
  });
});

describe("scenario diffs", () => {
  test("the note's anchor line is the rate-limit check", () => {
    const login = parseDiff(DIFFS["L1/1"]!).find((f) => f.path === "src/api/login.ts")!;
    const line = login.hunks.flatMap((h) => h.lines).find((l) => l.newLine === 15)!;
    expect(line.kind).toBe("add");
    expect(line.text).toContain("loginLimiter.take(rateKey(req))");
  });

  test("files and statuses parse", () => {
    const files = parseDiff(DIFFS["L1/2"]!);
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ["src/api/login.ts", "modified"],
      ["src/lib/ratelimit/bucket.ts", "added"],
      ["src/lib/ratelimit/bucket.test.ts", "added"],
      ["src/lib/authz/check.ts", "modified"],
    ]);
    for (const f of files) for (const h of f.hunks) expect(h.lines.at(-1)!.text).not.toBe("");
  });
});
