import { expect, test } from "vitest";
import { DOMAINS } from "@generalbusiness/dap-contract";
import { requiredDependency, observationDependency, textDependency, UnsupportedConsumer } from "../src/index.ts";
import type { DependencyOrigin } from "../src/index.ts";
import { d, directory } from "./fixtures.ts";

const variants = ["genesis", "act", "delivery", "timed", "diagnosis", "outcome", "preparation", "checkpoint"] as const;
const origin = (input: DependencyOrigin["input"]): DependencyOrigin => ({ at: { at: directory, seq: 0, hash: d("0") }, input });

test("all eight variants preserve local full fact provenance and the common consumers; unknown consumers/variants and mismatched keys refuse", () => {
  for (const input of variants) {
    const from = origin(input);
    for (const [consumer, kind] of [["declaration", "definition"], ["foreign-use", "entry"], ["rule-input", "rule"]] as const) {
      expect(requiredDependency(from, consumer, { kind, digest: d("a") })).toEqual({ mode: "required", origin: from, consumer, purpose: "replay-required", key: { kind, digest: d("a") } });
    }
    const child = requiredDependency(from, "definition-child", { kind: "definition", digest: d("b") });
    expect(child.purpose).toBe("archive-closure");
    expect(textDependency(from, d("c"))).toEqual({ mode: "text", origin: from, consumer: "detached-text", key: { kind: "text", digest: d("c") }, archive: "omit" });
    if (input !== "act") expect(() => requiredDependency(from, "act-value", { kind: "definition", digest: d("b") })).toThrow(UnsupportedConsumer);
    if (input !== "outcome") expect(() => requiredDependency(from, "outcome-snapshot", { kind: "snapshot", digest: d("b") })).toThrow(UnsupportedConsumer);
  }
  expect(() => requiredDependency(origin("act"), "new-consumer" as never, { kind: "definition", digest: d("a") })).toThrow(UnsupportedConsumer);
  expect(() => textDependency({ ...origin("act"), input: "new-input" as never }, d("a"))).toThrow(UnsupportedConsumer);
  expect(() => requiredDependency(origin("act"), "foreign-use", { kind: "snapshot", digest: d("a") })).toThrow(UnsupportedConsumer);
  expect(() => requiredDependency(origin("act"), "act-value", { kind: "value", domain: DOMAINS.definition, digest: d("a") })).toThrow(UnsupportedConsumer);
  expect(() => requiredDependency(origin("act"), "declaration", { kind: "definition", digest: d("a"), domain: DOMAINS.definition } as never)).toThrow(UnsupportedConsumer);
});

test("observation probes preserve native domain order and definition keys, while required values and text omission remain distinct", () => {
  const from = origin("delivery"), digest = d("a"), domains = ["first", DOMAINS.definition, "last"];
  const probe = observationDependency(from, digest, domains);
  expect(probe.choices).toEqual([
    { domain: "first", key: { kind: "value", domain: "first", digest } },
    { domain: DOMAINS.definition, key: { kind: "definition", digest } },
    { domain: "last", key: { kind: "value", domain: "last", digest } },
  ]);
  expect(probe.purpose).toBe("replay-required");
  expect(requiredDependency(origin("outcome"), "outcome-value", probe.choices[1]!.key).key).toEqual({ kind: "definition", digest });
  expect(textDependency(from, digest).archive).toBe("omit");
  expect(() => observationDependency(origin("checkpoint"), digest, domains)).toThrow(UnsupportedConsumer);
  expect(() => observationDependency(from, digest, [""])).toThrow(UnsupportedConsumer);
});
