/** Native retained SQL/size/key/cache boundaries. Certificate/privacy stage
 * is not exercised here; no exporter or foreign/text/custom body runs. */
import { expect, test } from "vitest";
import { DOMAINS, PROPOSED_BOUNDS, RETAINED_INPUT_BYTES } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { ArchiveBudget } from "../src/archive-budget.ts";
import { observationDependency } from "@generalbusiness/dap-derive";
import { ArchiveRetainedReader, readArchiveProbe } from "../src/archive-retained.ts";
import { definition, found } from "./support.ts";

const missing = "sha256:" + "d".repeat(64) as `sha256:${string}`;
test("native definition-key selection validates canonical bytes and charges cache hits without aliasing the value table", async () => {
  const lane = await found();
  const actual = await lane.inside(state => {
    const queries: string[] = [], budget = new ArchiveBudget(), reader = new ArchiveRetainedReader({ exec(query, ...args) { queries.push(query); return state.storage.sql.exec(query, ...args); } }, budget);
    state.storage.sql.exec("INSERT INTO retained_value (domain, digest, bytes) VALUES (?, ?, ?)", DOMAINS.definition, definition.digest, '"wrong alias"');
    const first = reader.read({ kind: "definition", digest: definition.digest }, RETAINED_INPUT_BYTES), before = budget.admitted();
    const second = reader.read({ kind: "definition", digest: definition.digest }, RETAINED_INPUT_BYTES), after = budget.admitted();
    expect(() => reader.read({ kind: "value", domain: DOMAINS.definition, digest: definition.digest }, RETAINED_INPUT_BYTES)).toThrow();
    return { first, second, before, after, queries };
  });
  expect(actual.first?.bytes).toBe(canonicalize(definition.declared));
  expect(actual.second).toEqual(actual.first);
  expect(actual.after.attempts).toBe(2); expect(actual.before.attempts).toBe(1);
  expect(actual.after.inputWork).toBeGreaterThan(actual.before.inputWork);
  expect(actual.after.calls).toBe(actual.before.calls);
  expect(actual.queries).toHaveLength(2);
  expect(actual.queries.every(query => query.includes("FROM retained_input"))).toBe(true);
});

test("native oversized and corrupt retained candidates fail before selection, and an invalid probe is never cached as a valid match", async () => {
  const lane = await found();
  const result = await lane.inside(state => {
    const queries: string[] = [], reader = new ArchiveRetainedReader({ exec(query, ...args) { queries.push(query); return state.storage.sql.exec(query, ...args); } }, new ArchiveBudget());
    state.storage.sql.exec("INSERT INTO retained_input (kind, digest, bytes) VALUES ('rule', ?, ?)", missing, '"' + "x".repeat(RETAINED_INPUT_BYTES) + '"');
    const oversized = reader.read({ kind: "rule", digest: missing }, RETAINED_INPUT_BYTES), before = queries.length;
    state.storage.sql.exec("UPDATE retained_input SET bytes = 'false' WHERE kind = 'rule' AND digest = ?", missing);
    const corrupt = reader.read({ kind: "rule", digest: missing }, RETAINED_INPUT_BYTES), afterInvalid = queries.length;
    const bytes = "null", digest = digestBytes(utf8(bytes));
    state.storage.sql.exec("INSERT INTO retained_input (kind, digest, bytes) VALUES ('rule', ?, ?)", digest, bytes);
    const valid = reader.read({ kind: "rule", digest }, RETAINED_INPUT_BYTES);
    const corruptAgain = reader.read({ kind: "rule", digest: missing }, RETAINED_INPUT_BYTES);
    return { oversized, before, corrupt, afterInvalid, valid, corruptAgain, queries };
  });
  expect(result.oversized).toBeNull(); expect(result.before).toBe(1);
  expect(result.queries[0]).toContain("octet_length(bytes)");
  expect(result.corrupt).toBeNull(); expect(result.corruptAgain).toBeNull();
  expect(result.valid).toEqual({ bytes: "null", value: null });
  expect(result.afterInvalid).toBe(3);
  expect(result.queries).toHaveLength(7);
});

test("512 failed native probes spend 512 attempts; the next attempt and insufficient byte allowance stop before another body call", async () => {
  const lane = await found();
  const result = await lane.inside(state => {
    let calls = 0;
    const native = { exec(query: string, ...args: (string | number | null | ArrayBuffer)[]) { calls++; return state.storage.sql.exec(query, ...args); } };
    const budget = new ArchiveBudget(), reader = new ArchiveRetainedReader(native, budget);
    for (let n = 0; n < 512; n++) expect(reader.read({ kind: "rule", digest: missing }, RETAINED_INPUT_BYTES)).toBeNull();
    const before = calls;
    expect(() => reader.read({ kind: "rule", digest: missing }, RETAINED_INPUT_BYTES)).toThrow("archive-limit");
    const after = calls, tight = new ArchiveBudget({ inputWork: 512 }), small = new ArchiveRetainedReader(native, tight);
    expect(() => small.read({ kind: "definition", digest: definition.digest }, RETAINED_INPUT_BYTES)).toThrow("archive-limit");
    return { before, after, total: calls, cost: budget.admitted(), tight: tight.admitted() };
  });
  expect(result.before).toBe(512); expect(result.after).toBe(512); expect(result.total).toBe(513);
  expect(result.cost.attempts).toBe(512);
  expect(result.tight.calls).toBe(1); // scalar size only, body reservation refused
});

test("a native body call that returns after the original deadline cannot install a cache value or continue SQL", async () => {
  const lane = await found();
  const result = await lane.inside(state => {
    let time = 0, calls = 0;
    const budget = new ArchiveBudget({}, () => time, 10), reader = new ArchiveRetainedReader({ exec(query, ...args) {
      calls++; const rows = state.storage.sql.exec(query, ...args);
      if (query.startsWith("SELECT bytes")) time = 10;
      return rows;
    } }, budget);
    expect(() => reader.read({ kind: "definition", digest: definition.digest }, RETAINED_INPUT_BYTES)).toThrow("archive-timeout");
    const before = calls;
    expect(() => reader.read({ kind: "definition", digest: definition.digest }, RETAINED_INPUT_BYTES)).toThrow("archive-timeout");
    return { before, calls };
  });
  expect(result.before).toBe(2); expect(result.calls).toBe(2);
});

test("native ordered probes discard invalid-domain candidates, select the definition key and never fetch candidates after the valid match", async () => {
  const lane = await found();
  const result = await lane.inside(state => {
    const queries: { query: string; domain: unknown }[] = [], budget = new ArchiveBudget(), reader = new ArchiveRetainedReader({ exec(query, ...args) { queries.push({ query, domain: args[0] }); return state.storage.sql.exec(query, ...args); } }, budget);
    // Correct bytes in the wrong domain are not a valid first probe.
    state.storage.sql.exec("INSERT INTO retained_value (domain, digest, bytes) VALUES (?, ?, ?)", DOMAINS.entry, definition.digest, canonicalize(definition.declared));
    const probe = observationDependency({ at: lane.genesis.fact, input: "act" }, definition.digest, [DOMAINS.entry, DOMAINS.definition, DOMAINS.message]);
    const selected = readArchiveProbe(reader, probe, RETAINED_INPUT_BYTES, PROPOSED_BOUNDS.definitionBytes);
    return { key: selected?.key, bytes: selected?.value.bytes, queries, cost: budget.admitted() };
  });
  expect(result.key).toEqual({ kind: "definition", digest: definition.digest });
  expect(result.bytes).toBe(canonicalize(definition.declared));
  expect(result.cost.attempts).toBe(2);
  expect(result.queries.some(query => query.domain === DOMAINS.message)).toBe(false);
  expect(result.queries.filter(query => query.query.startsWith("SELECT bytes")).map(query => query.domain)).toEqual([DOMAINS.entry, "definition"]);
});
