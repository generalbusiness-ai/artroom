import { expect } from "vitest";
import { canonicalJson } from "../../src/values.ts";

/** Expect `run` to throw an error whose `code` is `code` (or any error when `code` is absent). */
export async function rejects(run: () => unknown, code?: string): Promise<void> {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  if (thrown === undefined) throw new Error(`Expected rejection${code ? ` with ${code}` : ""}`);
  if (code) expect((thrown as { code?: unknown }).code, String(thrown)).toBe(code);
}

/** Canonical equality, as atseq's corpus compares values. */
export function same(actual: unknown, expected: unknown): void {
  expect(canonicalJson(actual, 2 ** 24)).toBe(canonicalJson(expected, 2 ** 24));
}
