import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { validateDefinition } from "@generalbusiness/artroom-derive";
import { change3, changeDemo3, MANIFEST_DIGESTS, change, changeDemo } from "../src/index.ts";

test("manifest-list successors validate whole and pin exact bytes; the legacy file input stays byte-identical and each successor has a distinct identity", () => {
  for (const [name, value, digest, prior] of [["change3", change3, MANIFEST_DIGESTS.change, change], ["change-demo3", changeDemo3, MANIFEST_DIGESTS.demo, changeDemo]] as const) {
    expect(validateDefinition(value, PROPOSED_BOUNDS).ok).toBe(true);
    expect(readFileSync(new URL(`../definitions/${name}.json`, import.meta.url), "utf8")).toBe(canonicalize(value));
    expect(definitionDigest(value)).toBe(digest);
    expect(digest).not.toBe(definitionDigest(prior));
    expect(value.acts["propose-file"]!.fields).toEqual(prior.acts["propose-file"]!.fields);
    expect(Object.keys(value.acts).filter((kind) => kind !== "check-error")).toEqual(Object.keys(prior.acts).filter((kind) => kind !== "check-error"));
  }
});
