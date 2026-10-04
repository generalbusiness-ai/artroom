import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { prepareRules, validateDefinition } from "../src/index.ts";
import { ENGINE_FINGERPRINT, RULE_PROFILES, admit, evaluate, evaluateRules, probeResults, type RuleEvalError } from "../src/rule/index.ts";
import { Scope, d, keys, on, ticket, ticketDefinition, type Actor } from "./fixtures.ts";

const { rita, una, vic } = keys;

describe("a rule guard (sections 5.2 and 6.5)", () => {
  test("it passes and fails through prepared results, and a missing or mismatched result is unavailable", async () => {
    const s = new Scope(ticketDefinition);                       // intent 0, requested by rita
    const approve = (who: Actor) => s.intent(who, "approve", on(s, 0));
    const asked = (signed: SignedIntent) => prepareRules(s.state, ticketDefinition, { act: signed, context: s.context() });
    const [byUna, byRita] = [approve(una), approve(rita)];

    // Preparation builds exactly the input of section 6.5: the subjects' records, the kind and fields, the signer's member, the fetched facts.
    const forUna = asked(byUna);
    expect(forUna).toMatchObject([{ rule: "two-eyes", source: ticket.rules["two-eyes"], input: { kind: "approve", fields: {}, signer: una.member, subjects: { on: s.item(0) }, facts: [] } }]);
    expect(Object.keys(forUna[0]!.input as object).sort()).toEqual(["facts", "fields", "kind", "signer", "subjects"]);
    const passed = await evaluateRules(forUna);
    expect(passed).toEqual([{ rule: "two-eyes", input: forUna[0]!.digest, result: true }]);

    // No result, or a result prepared over another input, here another signer: the act is not judged.
    expect(s.judge(byUna)).toEqual({ result: "unavailable", reason: "unavailable" });
    expect(s.judge(approve(vic), { prepared: passed })).toEqual({ result: "unavailable", reason: "unavailable" });
    // The requester's own approval: the rule is false over its input, and the guard fails.
    const failed = await evaluateRules(asked(byRita));
    expect(failed).toMatchObject([{ result: false }]);
    expect(s.judge(byRita, { prepared: failed })).toMatchObject({ result: "refused", reason: "guard-failed", detail: "guards.1" });
    // The entry records the one result its guard read.
    expect(s.submit(byUna, { prepared: [...failed, ...passed] }).result).toBe("write");
    expect([s.last.prepared, s.item(0).state]).toEqual([passed, "closed"]);
  });
});

describe("the evaluator profile restricted@1", () => {
  const refusal = (source: string) => {
    try {
      admit(source);
      return null;
    } catch (error) {
      return (error as RuleEvalError).code;
    }
  };

  test("the engine behaves as the pinned one; an expression can read no clock and nothing outside its input", async () => {
    expect(digestBytes(utf8(await probeResults()))).toBe(ENGINE_FINGERPRINT);
    expect(Object.fromEntries(["$now()", "$millis()", "$random()", '$eval("1")', "$outside", "function($x){$x}(1)", "**.a", "a.%.b", "signer != subjects.on"].map((s) => [s, refusal(s)]))).toEqual({
      "$now()": "unsupported_function", "$millis()": "unsupported_function", "$random()": "unsupported_function", '$eval("1")': "unsupported_function",
      "$outside": "unsupported_variable", "function($x){$x}(1)": "unsupported_function", "**.a": "unsupported_expression", "a.%.b": "unsupported_expression",
      "signer != subjects.on": null,
    });
    // With the evaluator's table, the validator refuses a definition whose rule is outside the profile.
    expect(validateDefinition({ ...ticket, rules: { "two-eyes": "$now() != signer" } }, PROPOSED_BOUNDS, RULE_PROFILES)).toMatchObject({ ok: false, problems: [{ code: "rule", path: "rules.two-eyes" }] });
    expect(validateDefinition(ticket, PROPOSED_BOUNDS, RULE_PROFILES).ok).toBe(true);
  });

  test("work is bounded: an expression past the step budget ends the same way each time, and its rule is false", async () => {
    const source = "$count(a.($$.a.(1))) > 0";
    const input = { a: Array.from({ length: 400 }, (_, i) => i) };
    for (const _ of [1, 2]) await expect(evaluate(source, input)).rejects.toMatchObject({ code: "step_budget" });
    expect(await evaluateRules([{ rule: "r", source, input, digest: d("0") }])).toMatchObject([{ result: false }]);
    // The same expression within the budget is evaluated.
    expect((await evaluate(source, { a: [1, 2] })).value).toBe(true);
  });
});
