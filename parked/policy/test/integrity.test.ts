import { describe, expect, test } from "vitest";
import jsonataPackage from "jsonata/package.json" with { type: "json" };
import { ENGINE_FINGERPRINT, assertEngine, probeResults } from "../src/evaluator.ts";
import type { Sha } from "@generalbusiness/artroom-contract";
import { digestJson, sha256Hex, snapshotDigest, type SnapshotEntry } from "../src/integrity.ts";
import { JSONATA_VERSION, PROFILE, STAMP } from "../src/profile.ts";

describe("integrity with WebCrypto (R-EVAL-7)", () => {
  test("the run uses the runtime its config names", () => {
    const agent = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
    if (__ARTROOM_RUNTIME__ === "workerd") expect(agent).toBe("Cloudflare-Workers");
    else expect(agent).toMatch(/^Node\.js\//);
  });
  test("the installed jsonata is the pinned version", () => {
    expect(jsonataPackage.version).toBe(JSONATA_VERSION);
    expect(STAMP).toEqual({ profile: "artroom-jsonata-v1", jsonata: "2.2.2", accounting: "artroom-act-budget-v1" });
    expect(PROFILE.id).toBe("artroom-jsonata-v1");
  });
  test("the engine fingerprint matches the pinned one", async () => {
    const fingerprint = `sha256:${await sha256Hex(new TextEncoder().encode(await probeResults()))}`;
    expect(fingerprint).toBe(ENGINE_FINGERPRINT);
    await assertEngine();
  });
  test("SHA-256 known answer", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  test("digests use canonical JSON: key order does not matter", async () => {
    const a = await digestJson({ b: 1, a: [true, null, "x"] });
    const b = await digestJson({ a: [true, null, "x"], b: 1 });
    expect(a).toBe(b);
    expect(a).toBe(`sha256:${await sha256Hex(new TextEncoder().encode('{"a":[true,null,"x"],"b":1}'))}`);
  });
  test("snapshot digest sorts by UTF-8 bytes of the path (R-CARRY-9)", async () => {
    const blob = "0".repeat(40) as Sha;
    // UTF-16 order puts U+1F600 (D83D ...) before U+FF5E; UTF-8 order puts U+FF5E (EF BD 9E) first.
    const entries: [SnapshotEntry, SnapshotEntry, SnapshotEntry] = [
      ["src/\u{1F600}.ts", "100644", blob],
      ["src/\u{FF5E}.ts", "100644", blob],
      ["src/a.ts", "100644", blob],
    ];
    const expected = `sha256:${await sha256Hex(
      new TextEncoder().encode(JSON.stringify([entries[2], entries[1], entries[0]])),
    )}`;
    expect(await snapshotDigest(entries)).toBe(expected);
    expect(await snapshotDigest([entries[1], entries[0], entries[2]])).toBe(expected);
  });
});
