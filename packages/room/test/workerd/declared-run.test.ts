import { describe, expect, it } from "vitest";
import { applied, runDeclared } from "./vocabulary.ts";

runDeclared();

const WITNESSES: Record<string, () => Promise<unknown>> = {
  "lanes.test.ts": () => import("./lanes.test.ts"),
  "landing.test.ts": () => import("./landing.test.ts"),
  "obligations.test.ts": () => import("./obligations.test.ts"),
  "roster.test.ts": () => import("./roster.test.ts"),
  "log.test.ts": () => import("./log.test.ts"),
};

for (const [file, load] of Object.entries(WITNESSES)) describe(`under the code-review v2 declarations: ${file}`, async () => void (await load()));

describe("the declared run itself", () => {
  it("applied each conversion", () => {
    expect(applied).toEqual({});
  });
});
