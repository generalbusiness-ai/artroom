import { expect, test } from "vitest";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { change3, changeDemo3, MANIFEST_DIGESTS } from "@generalbusiness/artroom-lanes";
import { knownLIST1 } from "../src/source-support.ts";

// Invariant: LIST1 eligibility requires both an adopted exact pin and those
// declaration bytes, never a name, similar fields or a custom digest. Pure Node
// boundary; native editor collection/freeze/unknown custody stays in its story.
test("LIST1 accepts exact supported declarations and rejects changed/custom or mismatched bytes", () => {
  expect(knownLIST1(change3, MANIFEST_DIGESTS.change)).toBe(true);
  expect(knownLIST1(changeDemo3, MANIFEST_DIGESTS.demo)).toBe(true);
  expect(knownLIST1(changeDemo3, MANIFEST_DIGESTS.change)).toBe(false);
  const custom = structuredClone(changeDemo3);
  custom.acts["propose-manifest"]!.guards = custom.acts["propose-manifest"]!.guards.slice(0, -1);
  expect(knownLIST1(custom, MANIFEST_DIGESTS.demo)).toBe(false);
  expect(knownLIST1(custom, definitionDigest(custom))).toBe(false);
});
