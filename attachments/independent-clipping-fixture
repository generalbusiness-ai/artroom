/** Independent prefix-preserving UTF-8 truncation controls. */
import { expect, it } from "vitest";
import type { Claim } from "@generalbusiness/artroom-contract";
import { clipBytes, fill, WORDING_FILLED_BYTES } from "../../src/declared.ts";
import { act, declaredRoom, ok, v2 } from "./declared-support.ts";
import { expectRefusal, pushChange } from "./support.ts";

const bytes = (s: string) => new TextEncoder().encode(s).length;
const long = `docs/${"d".repeat(200)}/${"e".repeat(200)}/${"f".repeat(200)}/${"g".repeat(200)}/x.md`;
it("clipping control: ASCII and multibyte prefixes are preserved without splitting a character", () => {
  expect(clipBytes("x".repeat(9), 8)).toBe("x".repeat(8));
  expect(clipBytes("é".repeat(5), 9)).toBe("é".repeat(4));
  expect(clipBytes("😀".repeat(3), 9)).toBe("😀".repeat(2));
});
it("clipping control: legal leading U+FEFF survives when the filled text fits exactly", () => {
  const template = "\ufeff" + "p".repeat(59) + "{path}".repeat(10);
  const exact = "\ufeff" + "p".repeat(59) + long.repeat(10);
  expect(bytes(exact)).toBe(WORDING_FILLED_BYTES);
  expect(bytes(template)).toBeLessThanOrEqual(512);
  expect(fill(template, { path: long })).toBe(exact);
});
it("R-DECL-13: cutting a longer recorded refusal preserves its legal leading U+FEFF", async () => {
  const template = "\ufeff" + "{path}".repeat(84);
  expect(bytes(template)).toBe(507);
  const r = await declaredRoom(v2((acts) => void (acts["propose"] = { ...acts["propose"]!, refusals: { "outside-claim": { reason: template, fix: "Correct the scope." } } })));
  const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "work", scope: ["src/**"] });
  const head = pushChange(r, c.lane, { [long]: "x" });
  const out = expectRefusal(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" }), "outside-claim");
  expect(out.act).toBeDefined();
  const expected = "\ufeff" + long.repeat(84).slice(0, WORDING_FILLED_BYTES - 3);
  const actual = out.reason;
  expect(actual.slice(0, 1), "truncation preserves the leading character rather than treating it as an encoding marker").toBe("\ufeff");
  expect(actual).toBe(expected);
  expect(bytes(actual)).toBe(WORDING_FILLED_BYTES);
});
