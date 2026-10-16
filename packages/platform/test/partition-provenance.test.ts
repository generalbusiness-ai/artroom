import { expect, test } from "vitest";
import { definitionDigest, isPlatformDefinition, newIncarnation } from "@generalbusiness/artroom-bytes";
import { sourceName } from "../src/publishing-provenance.ts";
import { partitionApplicationPublicationOrigin, partitionPublishingLaneOrigin, partitionSourceName, partitionCreationPolicy, partitionDeclaredCreationPolicy, type PartitionNativeFrame } from "../src/partition-provenance.ts";
import { small } from "@generalbusiness/dap-derive/testing";
import { scriptedPartitionOrigin } from "./support-partition-origin.ts";

const raw = (sample: ReturnType<typeof scriptedPartitionOrigin>): PartitionNativeFrame[] => sample.frames.map(copy => {
  const born = sample.frames.find(row => row.fact.seq === 0 && row.fact.at.scope === copy.fact.at.scope)!.entry.input;
  if (born.type !== "genesis") throw new Error("scripted fixture has no genesis");
  return { fact: copy.fact, entry: copy.entry, named: born.seed.definition, native: isPlatformDefinition(born.seed.definition), declarationName: copy.under };
});

// Pure SCRIPTED immutable proof shape. The receiver must separately prove
// eligibility, and actual native execution/Authority remains a Scope witness.
test("new direct factory proof binds all eight births while the legacy producer policy keeps partition lanes declared", () => {
  const change = scriptedPartitionOrigin(), application = scriptedPartitionOrigin("application");
  expect(partitionPublishingLaneOrigin(change.from, change.root, change.destination, change.frames)).toBe(true);
  expect(partitionApplicationPublicationOrigin(application.from, application.root, application.destination, application.frames)).toBe(true);
  expect(partitionSourceName(change.definition, "change", change.from.at, raw(change))).toBe("change");
  expect(sourceName(change.definition, "change", change.frames)).toBe("declared:change");
  const wrong = newIncarnation(new Uint8Array(16).fill(31));
  expect(partitionPublishingLaneOrigin(change.from, { ...change.root, inc: wrong }, change.destination, change.frames)).toBeNull();
  expect(partitionPublishingLaneOrigin(change.from, change.root, { ...change.destination, inc: wrong }, change.frames)).toBe(false);
  expect(partitionPublishingLaneOrigin(change.from, change.root, change.destination, change.frames.slice(0, -1))).toBeNull();
  expect(partitionSourceName(change.definition, "change", change.from.at, raw(change).map(row => row.fact.at.scope === change.partition.scope ? { ...row, native: false } : row))).toBeNull();
  expect(partitionSourceName(change.definition, "change", change.from.at, [raw(change)[0]!, ...raw(change)])).toBeNull();
});

test("concern identity proves each exact parent's pin and inherited room under one total depth budget", () => {
  const nested = scriptedPartitionOrigin("issue", 3), frames = raw(nested);
  expect(partitionSourceName(nested.definition, "issue", nested.from.at, frames)).toBe("issue");
  // Removing a parent's exact birth cannot be replaced by the parent's raw
  // declared name. No current producer or global identity is upgraded.
  expect(partitionSourceName(nested.definition, "issue", nested.from.at, frames.filter((_, n) => n !== 2))).toBeNull();
  const tooDeep = scriptedPartitionOrigin("issue", 4);
  expect(partitionSourceName(tooDeep.definition, "issue", tooDeep.from.at, raw(tooDeep))).toBeNull();
  const foreign = scriptedPartitionOrigin("issue", 3, true);
  expect(partitionSourceName(foreign.definition, "issue", foreign.from.at, raw(foreign))).toBe("declared:issue");
  expect(partitionSourceName(nested.definition, "change", nested.from.at, frames)).toBe("declared:change");
});


test("empty partition bootstrap binds the actual native parent send without inventing an accepted child", () => {
  const sample = scriptedPartitionOrigin(), frames = raw(sample).filter(row => row.fact.at.scope !== sample.from.at.scope && row.fact.at.scope !== sample.partition.scope);
  // Keep Root opening + Root genesis + M/R/D births only (five frames).
  const part = sample.frames.find(row => row.fact.seq === 0 && row.fact.at.scope === sample.partition.scope)!.entry.input;
  if (part.type !== "genesis" || !part.source || part.n === null || !part.message) return expect.fail("scripted partition has no create");
  const creation = { seed: part.seed, source: part.source, n: part.n, message: part.message };
  expect(frames).toHaveLength(5);
  expect(partitionCreationPolicy(creation, frames)).toEqual({ mode: "partition-v1", root: sample.root, creation });
  expect(partitionCreationPolicy({ ...creation, n: creation.n + 1 }, frames)).toBeNull();
  expect(partitionCreationPolicy(creation, frames.slice(0, -1))).toBeNull();
});


test("declared bootstrap proves the exact factory or all concern parents with the unborn child counted in the depth limit", () => {
  // SCRIPTED immutable proof shape; normal declaration validation and native
  // genesis judgment remain separate obligations. No lane code runs here.
  const definition = { ...small, name: "issue", genesis: "file" };
  const sample = scriptedPartitionOrigin("issue", 3, false, definitionDigest(definition));
  const born = sample.genesis.input;
  if (born.type !== "genesis" || !born.source || born.n === null || !born.message) return expect.fail("scripted lane has no create");
  const creation = { seed: born.seed, source: born.source, n: born.n, message: born.message };
  const frames = raw(sample).filter(row => row.fact.at.scope !== sample.from.at.scope);
  expect(frames).toHaveLength(13);
  expect(partitionDeclaredCreationPolicy(creation, definition, frames)).toEqual({ mode: "partition-v1", root: sample.root, creation });
  expect(partitionDeclaredCreationPolicy(creation, { ...definition, name: "change" }, frames)).toBeNull();
  expect(partitionDeclaredCreationPolicy(creation, { ...definition, profile: { ...definition.profile, version: 99 } }, frames)).toBeNull();
  expect(partitionDeclaredCreationPolicy({ ...creation, n: 1 }, definition, frames)).toBeNull();
  const tooDeep = scriptedPartitionOrigin("issue", 4, false, definitionDigest(definition)), birth = tooDeep.genesis.input;
  if (birth.type !== "genesis" || !birth.source || birth.n === null || !birth.message) return expect.fail("scripted concern has no create");
  expect(partitionDeclaredCreationPolicy({ seed: birth.seed, source: birth.source, n: birth.n, message: birth.message }, definition, raw(tooDeep).filter(row => row.fact.at.scope !== tooDeep.from.at.scope))).toBeNull();
});
