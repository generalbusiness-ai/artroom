/**
 * Checker review 09c01bf9: the prospective reservation input and the
 * synchronous byte comparison (R-POL-6, R-LAND-4, R-LAND-7).
 */

import { describe, expect, test } from "vitest";
import { policy, rule } from "../src/helpers.ts";
import { evaluateLand, matchesRetainedLandInput, replay } from "../src/rules.ts";
import { digestJson } from "../src/integrity.ts";
import { act, active, actor, landInput } from "./support/fixtures.ts";

describe("prospective reservation input (R-POL-6, R-LAND-4, R-LAND-7)", () => {
  test("checker: stage is policy-visible; it changes the outcome and the bare digest; the reservation evaluation replays", async () => {
    const p = policy(rule({ id: "reservation-only", kind: "land", block: 'stage = "reservation"', reason: "reservation refused", fix: "x" }));
    const before = landInput(p, ["src/a.ts"]);
    const reservation = { ...before, stage: "reservation" as const };
    const a = await evaluateLand(active(p), before);
    const b = await evaluateLand(active(p), reservation);
    expect(a.refusal).toBeNull();
    expect(b.refusal?.rule).toBe("reservation-only");
    expect(await digestJson(before as never)).not.toBe(await digestJson(reservation as never));
    expect(await replay(active(p), JSON.parse(JSON.stringify(b.evaluations[0]!.context)))).toEqual(b);
  });

  test("a stage-specific rule cannot be bypassed: the land act passes, preparation fails, nothing is retained", async () => {
    const p = policy(rule({ id: "reservation-only", kind: "land", block: 'stage = "reservation"', reason: "reservation refused", fix: "x" }));
    const admitted = await evaluateLand(active(p), landInput(p, ["src/a.ts"]));
    expect(admitted.refusal).toBeNull();
    expect(admitted.retained).toBeNull();
    const prepared = await evaluateLand(active(p), { ...landInput(p, ["src/a.ts"]), stage: "reservation" });
    expect(prepared.refusal?.rule).toBe("reservation-only");
    expect(prepared.retained).toBeNull();
  });

  test("preparation retains canonical bytes and digest; unchanged state matches; changed state or stage land does not", async () => {
    const p = policy();
    const approve = { act: act(40), verdict: "approve" as const, by: actor("@bob"), basis: "here" as const };
    const prospective = { ...landInput(p, ["src/a.ts"], [approve]), stage: "reservation" as const };
    const prepared = await evaluateLand(active(p), prospective);
    expect(prepared.refusal).toBeNull();
    const retained = prepared.retained!;
    expect(retained.stage).toBe("reservation");
    expect(retained.digest).toBe(await digestJson(prospective as never));
    expect(retained.digest).not.toBe(prepared.evaluations[0]!.decision.input);
    // Reservation rebuilds from unchanged state: equal bytes, with no await.
    expect(matchesRetainedLandInput(retained, JSON.parse(JSON.stringify(prospective)))).toBe(true);
    // A new objection changes the state: the guard fails.
    const objection = { act: act(41), verdict: "object" as const, by: actor("@carol"), basis: "here" as const };
    expect(matchesRetainedLandInput(retained, { ...prospective, reviews: [approve, objection] })).toBe(false);
    // Substituting stage land never matches.
    expect(matchesRetainedLandInput(retained, { ...prospective, stage: "land" })).toBe(false);
  });
});
