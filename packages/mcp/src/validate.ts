/**
 * Checks a value against the contract's JSON Schema subset (`JsonSchema`).
 * Small and without code generation, so it runs in Workers, where `eval`
 * and `new Function` are not allowed.
 */

import type { JsonSchema } from "@generalbusiness/artroom-contract";

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/** Every way `value` breaks `schema`, as `path: problem` lines. Empty when it fits. */
export function validate(schema: JsonSchema, value: unknown, path = "input"): string[] {
  const errors: string[] = [];
  if (schema.oneOf !== undefined) {
    const fits = schema.oneOf.map((s) => validate(s, value, path));
    const matched = fits.filter((e) => e.length === 0).length;
    if (matched !== 1) {
      if (matched === 0) {
        const best = fits.reduce((a, b) => (b.length < a.length ? b : a));
        errors.push(...best);
      } else errors.push(`${path}: matches more than one allowed form`);
    }
  }
  if (schema.type !== undefined) {
    const actual = typeOf(value);
    if (actual !== schema.type) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
      return errors;
    }
  }
  if (schema.enum !== undefined && !schema.enum.includes(value as string | number)) {
    errors.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  }
  if (typeof value === "string" && schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => errors.push(...validate(schema.items!, item, `${path}[${i}]`)));
  }
  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    // Own properties only, on both sides: an input key like `toString` or `__proto__` must not
    // find a schema through the prototype chain, and an inherited value never satisfies `required`.
    for (const key of schema.required ?? []) if (!Object.hasOwn(obj, key) || obj[key] === undefined) errors.push(`${path}.${key}: is required`);
    for (const [key, v] of Object.entries(obj)) {
      const sub = schema.properties !== undefined && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
      if (sub !== undefined) {
        if (v !== undefined) errors.push(...validate(sub, v, `${path}.${key}`));
      } else if (schema.additionalProperties === false) errors.push(`${path}.${key}: is not allowed`);
    }
  }
  return errors;
}
