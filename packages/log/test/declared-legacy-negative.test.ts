/**
 * The legacy recovery replay, its negative half (docs/protocol.md section
 * 33.5; request 1e8fee4b, review 6263fdec): "a verifier mutated to judge
 * the `v1`-era entries under the `v2` declarations fails".
 *
 * This file is that verifier. It replaces one thing in the verifier's own
 * module graph: the vocabulary a `v1` document means. Everything else is
 * the shipped code, run over the whole published log. The honest half, the
 * same log under the shipped verifier, is in declared-stage3.test.ts
 * ("condition 3: the legacy recovery sequence"). The replacement is for the
 * whole file, so the file holds this one case.
 */
import { expect, test, vi } from "vitest";
import type { Envelope } from "@generalbusiness/artroom-contract";
import { parseStrict } from "../src/canonical.ts";
import recoveryJson from "./fixtures/declared-legacy-recovery.json";
import type { Fixture } from "./support/declared-room.ts";

vi.mock("../src/declared.ts", async (original) => {
  const real = await original<typeof import("../src/declared.ts")>();
  // The fixture's own v2 document: the one its landing activates at entry 10.
  const fixture = (await import("./fixtures/declared-legacy-recovery.json")).default as unknown as Fixture;
  const doc = fixture.retained.map((r) => (r.kind === "policy" ? (parseStrict(r.body) as { format?: string }) : null)).find((d) => d?.format === "artroom-policy-v2")!;
  const declared = await real.vocabularyOf(doc as never, real.STEPS_V1);
  // The fault: every document, and a room with no document yet, means the v2 declarations.
  return { ...real, LEGACY: declared, vocabularyOf: async () => declared };
});

test("the legacy recovery log under a verifier that judges its v1-era entries by the v2 declarations: verification fails at the first of them, a v: 1 claim, and goes no further", async () => {
  const { open, verify } = await import("./support/fixtures.ts");
  const log = open(recoveryJson as unknown as Fixture);
  // The v1 era: every entry before the v2 document is activated at entry 10. Its first signed envelope is entry 2,
  // a refused claim; the recovery claim with its purpose is entry 3.
  const first = (log.entries[2]!.entry as unknown as { act: { envelope: Envelope } }).act.envelope;
  const recovery = (log.entries[3]!.entry as unknown as { act: { envelope: Envelope } }).act.envelope;
  expect([first.v, first.kind, recovery.v, recovery.kind, (recovery.body as { purpose?: string }).purpose]).toEqual([1, "claim", 1, "claim", "config-recovery"]);
  const r = await verify(log);
  expect(r.ok).toBe(false);
  // A v: 1 envelope of a kind the v2 declarations declare has no binding: the declared rule calls it stale.
  expect(r.failures[0]).toMatchObject({ seq: 2, reason: "binding-stale" });
  expect(r.verifiedThrough).toBe(1);
});
