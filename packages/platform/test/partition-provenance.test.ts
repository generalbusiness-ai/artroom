import { expect, test } from "vitest";
import { isPlatformDefinition, newIncarnation } from "@generalbusiness/artroom-bytes";
import { sourceName } from "../src/publishing-provenance.ts";
import { partitionApplicationPublicationOrigin, partitionPublishingLaneOrigin, partitionSourceName, type PartitionNativeFrame } from "../src/partition-provenance.ts";
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
