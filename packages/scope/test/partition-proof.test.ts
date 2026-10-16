import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type FactRef } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, isPlatformDefinition, utf8 } from "@generalbusiness/artroom-bytes";
import { scriptedPartitionOrigin } from "../../platform/test/support-partition-origin.ts";
import { partitionProof, PartitionProofOperation, PARTITION_PROOF_BOUNDS as B, type PartitionProofPorts } from "../src/partition-proof.ts";
import { used, retainedFacts } from "../src/core.ts";
import { fetchFacts } from "../src/turn.ts";
import { ReceiverReads } from "../src/receiver-reads.ts";
import type { NativeBirth } from "../src/native-birth.ts";

/** Coherent SCRIPTED frames and native RPC stand-ins. No native execution,
 * receiver eligibility, identity policy or authority is proved here. */
function protocol(concerns = 0) {
  const fixture = scriptedPartitionOrigin(concerns ? "issue" : "change", concerns);
  const frames = new Map(fixture.frames.map(f => [canonicalize(f.fact), { fact: f.fact, bytes: canonicalize(f.entry) }]));
  const births = new Map<string, NativeBirth>();
  for (const frame of fixture.frames) if (frame.entry.input.type === "genesis") {
    const named = frame.entry.input.seed.definition;
    births.set(canonicalize(frame.fact.at), { v: 1, proof: frames.get(canonicalize(frame.fact))!, named, declarationName: frame.under, native: isPlatformDefinition(named) });
  }
  const calls: { method: string; milliseconds: number; max?: number }[] = []; let now = 0;
  const ports: PartitionProofPorts = { now: () => now,
    births: { async read(at, milliseconds) { calls.push({ method: "birth", milliseconds }); return births.get(canonicalize(at)) ?? null; } },
    proofs: { async read(fact, max, milliseconds) { calls.push({ method: "exact", max, milliseconds: milliseconds! }); return frames.get(canonicalize(fact)) ?? null; } },
  };
  return { fixture, frames, births, calls, ports, advance: (ms: number) => { now += ms; } };
}

test("raw partition collection deduplicates direct births and bounds all concern ancestry together without deriving identities", async () => {
  const direct = protocol(), got = await partitionProof(direct.ports, direct.fixture.from);
  expect(got).toMatchObject({ calls: 8, reservedBytes: 8 * 1024 * 1024 });
  expect(got?.frames).toHaveLength(8); expect(direct.calls).toHaveLength(8);
  expect(got?.frames.every(frame => !("under" in frame))).toBe(true);
  expect(got?.frames.map(frame => canonicalize(frame.fact)).sort()).toEqual([...direct.frames.keys()].sort());
  const nested = protocol(3), child = await partitionProof(nested.ports, nested.fixture.from);
  expect(child?.frames).toHaveLength(14); expect(child?.calls).toBe(14);
  expect(nested.calls.every(call => call.milliseconds === B.milliseconds && (call.max === undefined || call.max === 1024 * 1024))).toBe(true);
  const tooDeep = protocol(4);
  expect(await partitionProof(tooDeep.ports, tooDeep.fixture.from)).toBeNull();
  expect(tooDeep.calls.length).toBeLessThanOrEqual(B.calls);
});

test("raw partition collection stops on total deadline, missing proof or oversized wire bytes with no truncated result", async () => {
  const expired = protocol(), read = expired.ports.proofs.read;
  expired.ports.proofs.read = async (...args) => { const got = await read(...args); expired.advance(10001); return got; };
  expect(await partitionProof(expired.ports, expired.fixture.from)).toBeNull();
  expect(expired.calls).toHaveLength(3);
  const missing = protocol(); missing.births.delete(canonicalize(missing.fixture.rules));
  expect(await partitionProof(missing.ports, missing.fixture.from)).toBeNull();
  expect(missing.calls.length).toBeLessThanOrEqual(8);
  const oversized = protocol(), first = oversized.births.get(canonicalize(oversized.fixture.from.at))!;
  oversized.births.set(canonicalize(oversized.fixture.from.at), { ...first, proof: { ...first.proof, bytes: " ".repeat(1024 * 1024 + 1) } });
  expect(await partitionProof(oversized.ports, oversized.fixture.from)).toBeNull(); expect(oversized.calls).toHaveLength(1);
  const invalid = protocol(); expect(await partitionProof(invalid.ports, {} as FactRef)).toBeNull(); expect(invalid.calls).toHaveLength(0);
});


test("one operation shares concurrent receiver and source evidence without multiplying its total allowance", async () => {
  const sample = protocol(), operation = new PartitionProofOperation(sample.ports);
  const [receiver, source, repeated] = await Promise.all([
    operation.receiver(sample.fixture.partition), operation.lane(sample.fixture.from), operation.lane(sample.fixture.from),
  ]);
  expect(receiver?.policy.mode).toBe("partition-v1");
  expect(source?.frames).toHaveLength(8); expect(repeated?.frames).toHaveLength(8);
  expect(source?.calls).toBe(8); expect(repeated?.calls).toBe(8);
  expect(sample.calls).toHaveLength(8);
  sample.advance(B.milliseconds + 1);
  expect(await operation.lane(sample.fixture.from)).toBeNull();
  expect(sample.calls).toHaveLength(8);
});


test("receiver interpretation promotes a proved lane while retention and a later producer read keep its original alias", async () => {
  // RPC and storage maps are stand-ins. This protects the interpretation /
  // retention boundary, not native execution or handler authorization.
  const sample = protocol(); let producerCalls = 0;
  const resolver = { read: async () => { producerCalls++; return { entry: sample.fixture.genesis, under: "declared:change" }; } };
  const reader = await ReceiverReads.open({ ...sample.ports, resolver }, sample.fixture.partition);
  expect(reader).not.toBeNull();
  const fetched = await fetchFacts(reader!, PROPOSED_BOUNDS, [sample.fixture.from]);
  expect(fetched?.[0]?.under).toBe("change");
  expect(producerCalls).toBe(0);
  expect(sample.calls).toHaveLength(8);
  const uses = [{ fact: sample.fixture.from, content: digestBytes(utf8(canonicalize(sample.fixture.genesis))) }];
  const saved = used({ uses }, fetched!);
  expect(saved).toEqual([{ kind: "entry", digest: uses[0]!.content, bytes: canonicalize(sample.fixture.genesis), under: "declared:change" }]);
  const retained = retainedFacts({ retained: () => saved[0] ?? null }, { uses });
  expect(retained[0]?.under).toBe("declared:change");
  expect((await reader!.retained(retained))?.[0]?.under).toBe("change");
  expect(retained[0]?.under).toBe("declared:change");
  expect(producerCalls).toBe(0);
  expect((await fetchFacts(resolver, PROPOSED_BOUNDS, [sample.fixture.from]))?.[0]?.under).toBe("declared:change");
  expect(producerCalls).toBe(1);
  sample.advance(B.milliseconds + 1);
  expect(await reader!.retained(retained)).toBeNull();
  expect(sample.calls).toHaveLength(8);
});
