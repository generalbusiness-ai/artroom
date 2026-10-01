/**
 * Three failure classes (R-EVAL-5, R-ADM-9; atseq docs/runtime-profile.md):
 * deterministic refusals are recorded outcomes; engine faults and host limits
 * are runtime failures that record nothing. The engine is wrapped so that a
 * program containing the text "__fault__" throws an unexpected TypeError,
 * as a real engine fault would.
 */

import { describe, expect, test, vi } from "vitest";
import { policy, rule } from "../src/helpers.ts";
import { evaluateCarry, evaluateLand, evaluateNotify, evaluateRefuse } from "../src/rules.ts";
import { carry } from "../src/helpers.ts";
import { PolicyRuntimeFailure } from "../src/errors.ts";
import { active, carryInput, landInput, notifyInput, refuseInput, requireInput } from "./support/fixtures.ts";

vi.mock("jsonata", async (importOriginal) => {
  const real = ((await importOriginal()) as { default: (s: string, o?: object) => { evaluate: (...a: unknown[]) => Promise<unknown> } }).default;
  const wrapped = (source: string, options?: object) => {
    const expression = real(source, options);
    if (source.includes("__fault__"))
      expression.evaluate = async () => {
        throw new TypeError("Cannot create property 'position' on string 'RangeError'");
      };
    return expression;
  };
  return { default: wrapped };
});

const faulty = '"__fault__" = "x"';

describe("runtime failures record nothing", () => {
  test("refuse: an engine fault throws a retryable policy-runtime error, never a recorded refusal", async () => {
    const p = policy(rule({ id: "faulty", on: "claim", refuse: faulty, fix: "x" }));
    const error = await evaluateRefuse(active(p), refuseInput(p, "claim")).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PolicyRuntimeFailure);
    expect(error).toMatchObject({ name: "ArtroomError", code: "policy-runtime", retryable: true, maybeRecorded: false, fault: "engine_error" });
  });

  test("land and carry: an engine fault is not converted into a block or a not-carried outcome", async () => {
    const p = policy(
      rule({ id: "faulty-land", kind: "land", block: faulty, reason: "x", fix: "y" }),
      carry({ allow: [{ id: "faulty-carry", evidence: "any", allow: faulty }] }),
    );
    await expect(evaluateLand(active(p), landInput(p, ["src/a.ts"]))).rejects.toBeInstanceOf(PolicyRuntimeFailure);
    await expect(evaluateCarry(active(p), carryInput(p, { scope: ["docs/**"], changedSince: ["src/a.ts"] }))).rejects.toBeInstanceOf(PolicyRuntimeFailure);
  });

  test("notify: an engine fault throws, so the room keeps the act and retries before sealing `notified` (R-LOG-13)", async () => {
    const p = policy(rule({ id: "faulty-notify", kind: "notify", on: ["claim"], when: faulty, to: ["@ops"], why: "x" }));
    await expect(evaluateNotify(active(p), notifyInput(p, "claim", null), { roles: {}, reviewers: [] })).rejects.toMatchObject({ code: "policy-runtime", maybeRecorded: false });
  });

  test("a genuine budget refusal is a recorded outcome and replays identically", async () => {
    const cubic = "$count(proposal.paths[$count($$.proposal.paths[$count($$.proposal.paths[$ = $$.proposal.paths[0]]) > 0]) > 0]) > 0";
    const p = policy(rule({ id: "cubic", on: "propose", refuse: cubic, fix: "x" }));
    const big = refuseInput(p, "propose", { proposal: requireInput(p, Array.from({ length: 150 }, (_, i) => `f${i}`)).proposal });
    const first = await evaluateRefuse(active(p), big);
    const again = await evaluateRefuse(active(p), JSON.parse(JSON.stringify(first.evaluations[0]!.input)));
    expect(first.refusal?.rule).toBe("policy-budget-exceeded");
    expect(again.evaluations.map((e) => e.decision)).toEqual(first.evaluations.map((e) => e.decision));
  });
});
