import { expect, test } from "vitest";
import { factRefOf, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { sourceName, publishingLaneOrigin } from "../src/publishing-provenance.ts";
import { scriptedOrigin } from "./support-origin.ts";

test("supported change and issue pins acquire native names only through their authenticated native factories", () => {
  for (const name of ["change", "issue"] as const) {
    const native = scriptedOrigin(name), app = scriptedOrigin(name, "establish-application"), fake = scriptedOrigin(name, undefined, "declared:platform:directory");
    expect(sourceName(native.definition, name, native.origin)).toBe(name);
    expect(sourceName(app.definition, name, app.origin)).toBe(`declared:${name}`);
    expect(sourceName(fake.definition, name, fake.origin)).toBe(`declared:${name}`);
    expect(sourceName(native.definition, name, [native.origin[0]!])).toBeNull();
    const first = native.genesis;
    if (first.input.type !== "genesis") throw new Error("scripted origin has genesis");
    const seed = { ...first.input.seed, creator: null };
    const top = { ...first, at: { ...first.at, scope: scopeIdOf(seed) }, input: { ...first.input, source: null, seed } };
    expect(sourceName(native.definition, name, [{ fact: factRefOf(top), entry: top, under: name }])).toBe(`declared:${name}`);
  }
});

test("native publishing origin binds full Directory and destination incarnations and refuses missing closure", () => {
  const native = scriptedOrigin();
  expect(publishingLaneOrigin(native.from, native.directory, native.destination, native.origin)).toBe(true);
  const otherInc = newIncarnation(new Uint8Array(16).fill(31));
  expect(publishingLaneOrigin(native.from, { ...native.directory, inc: otherInc }, native.destination, native.origin)).toBe(false);
  expect(publishingLaneOrigin(native.from, native.directory, { ...native.destination, inc: otherInc }, native.origin)).toBe(false);
  expect(publishingLaneOrigin({ ...native.from, at: { ...native.from.at, inc: otherInc } }, native.directory, native.destination, native.origin)).toBe(false);
  expect(publishingLaneOrigin(native.from, native.directory, native.destination, [native.origin[0]!])).toBe(false);
});
