import { expect, test, vi } from "vitest";
import type { Entry, Read, ScopeRef, Seed, Sealed, Summary } from "@generalbusiness/artroom-contract";
import { entryHash, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { memoryStore, type Context, type Outcome } from "@generalbusiness/artroom-cli";
import { DEMO_DIGESTS, MANIFEST_DIGESTS } from "../src/index.ts";
import { prepareConcurrentAndMerge, staleReproposal, type Found } from "../../../scripts/demo/rehearse.ts";

// Runner boundary STAND-IN: commands, read sessions, entries and summaries
// below are scripted. Production composite code still judges exact results,
// hashes and identities. No native admission, Git host or provider runs here.
const ports = vi.hoisted(() => ({ command: vi.fn(), session: vi.fn(), entry: vi.fn(), summary: vi.fn() }));
vi.mock("@generalbusiness/artroom-cli", async importOriginal => ({ ...await importOriginal<typeof import("@generalbusiness/artroom-cli")>(), command: ports.command }));
vi.mock("@generalbusiness/artroom-client", async importOriginal => ({
  ...await importOriginal<typeof import("@generalbusiness/artroom-client")>(), requestSession: ports.session,
  ScopeHandle: class {
    constructor(_transport: unknown, readonly scope: string) {}
    entry(seq: number) { return ports.entry(this.scope, seq); }
    summary() { return ports.summary(this.scope); }
  },
}));

const OLD = "a".repeat(40), NEW = "b".repeat(40), TIME = "2026-10-11T20:00:00Z";
const secret = new Uint8Array(32).fill(7);
function ref(label: string, kind: string, definition: Seed["definition"]): ScopeRef {
  return { scope: scopeIdOf({ v: 1, kind, definition, creator: null, cause: textDigest(label), ordinal: 0 }), kind, inc: newIncarnation(new Uint8Array(16).fill(5)) };
}
const D = ref("scripted directory", "directory", "platform:directory@3");
const M = ref("scripted membership", "membership", "platform:membership@2");
const R = ref("scripted rules", "rules", "platform:rules@2");
const G = ref("scripted destination", "destination", "platform:destination@3");
const C = ref("scripted winner", "lane", DEMO_DIGESTS.change);
async function context(): Promise<Context> {
  const store = memoryStore();
  await store.keep("scripted", secret);
  await store.save({ v: 1, service: "https://scripted.test", key: "scripted", repository: { directory: D, membership: M, rules: R.scope, destination: G.scope } });
  ports.session.mockResolvedValue({ ok: true, session: { reader: () => "SCRIPTED reader" } });
  return { store, tries: 1, now: () => Date.parse(TIME), pause: async () => {} };
}
function opening(definition: Seed["definition"]): Entry {
  const signed = signIntent({ v: 1, to: D, actor: keyIdOfSecret(secret), kind: "open-pr", on: null, expected: {}, fields: {}, idempotencyKey: "scripted opening", notAfter: TIME }, secret);
  const seed: Seed = { v: 1, kind: "lane", definition, creator: D, cause: intentDigest(signed.intent), ordinal: 0 };
  return { v: 1, at: D, seq: 1, prev: null, time: TIME, clamped: false, epoch: 0, input: { type: "act", signed, authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [{ n: 0, to: seed, message: { class: "request", type: "create", body: { fields: {} } } }] };
}
function entryRead(entry: Entry): Read<Sealed> {
  const hash = entryHash(entry);
  return { ok: true, at: { seq: entry.seq, hash }, value: { entry, hash }, complete: true };
}
function summary(scope: ScopeRef, type: string, values: Summary["items"][number]["values"] = {}): Read<Summary> {
  return { ok: true, at: { seq: 1, hash: textDigest("scripted summary") }, complete: true, value: { scope, definition: DEMO_DIGESTS.change, status: "active", time: TIME, counts: [], items: [{ id: 0, type, state: "open", revision: 1, opened: null, values, refs: {}, parties: {}, attributed: [] }] } };
}

test("scripted preparation answers stop the composite before the next mutation, while the valid journey admits the loser before the winner", async () => {
  // A small journey ledger covers unknown command, malformed provenance and
  // unavailable readiness/source reads. These are not native guard proofs.
  for (const fault of ["none", "unknown-opening", "missing-opening", "wrong-send", "missing-proposal", "missing-rules", "unknown-proposal", "missing-manifest-source"] as const) {
    ports.command.mockReset(); ports.entry.mockReset(); ports.summary.mockReset();
    const ctx = await context(), manifest = fault === "missing-manifest-source";
    const entry = opening(manifest ? MANIFEST_DIGESTS.demo : DEMO_DIGESTS.change);
    if (fault === "wrong-send") entry.sends = [];
    const seed = opening(manifest ? MANIFEST_DIGESTS.demo : DEMO_DIGESTS.change).sends[0]!.to as Seed;
    const stale = { ...C, scope: scopeIdOf(seed) };
    const found: Found = { directory: D.scope, publishedCommit: OLD, controlled: C.scope };
    const calls: string[] = [];
    const took = (scope: string, seq: number) => `Took effect: entry ${scope}:${seq}, hash ${entryHash(entry)}.`;
    ports.entry.mockImplementation(async (_scope: string, seq: number) => fault === "missing-opening" || seq !== 1 ? { ok: false, reason: "unavailable" } : entryRead(entry));
    let reads = 0;
    ports.summary.mockImplementation(async () => ++reads === 1 ? summary(stale, fault === "missing-proposal" ? "other" : "proposal") : summary(stale, fault === "missing-rules" ? "other" : "rules", { revision: 1 }));
    ports.command.mockImplementation(async (_ctx: Context, args: string[]): Promise<Outcome> => {
      const kind = args[0] === "act" ? args[1]! : args[0]!;
      calls.push(kind);
      if ((kind === "open-pr" && fault === "unknown-opening") || (kind === "propose-file" && fault === "unknown-proposal")) return { code: 1, lines: ["Outcome unknown. Do not retry."] };
      if (kind === "open-pr") return { code: 0, lines: [took(D.scope, 1)] };
      if (kind === "ask-rules") return { code: 0, lines: [took(stale.scope, 2)] };
      if (kind === "propose-file") return { code: 0, lines: [took(stale.scope, 3)] };
      return { code: 0, lines: [`Published: commit ${NEW}, by the merge ${C.scope}:4.`, "Page: scripted page"] };
    });
    const lines = ["Proposal base: {publishedCommit}.", "$ artroom act open-pr <...>", "Took effect: entry {directory}:<staleOpening>, hash <staleOpeningHash>.", "Exit 0.", "Opened change: <stale>.", "$ artroom act ask-rules <...>", "Took effect: entry {stale}:<seq>, hash <hash>.", "Exit 0.", "$ artroom act propose-file <...>", `Took effect: entry {stale}:<${manifest ? "staleSource" : "staleVersion"}>, hash <hash>.`, "Exit 0.", "$ artroom merge {controlled}", "Published: commit <controlledCommit>, by the merge {controlled}:<seq>.", "Page: scripted page", "Exit 0."];
    if (manifest) lines.splice(11, 0, "$ artroom act propose-manifest <...>", "Took effect: entry {stale}:<staleVersion>, hash <hash>.", "Exit 0.");
    const result = await prepareConcurrentAndMerge(ctx, OLD, C.scope, { code: 0, lines }, found, manifest);
    if (fault === "none") {
      expect(result.code).toBe(0);
      expect(calls).toEqual(["open-pr", "ask-rules", "propose-file", "merge"]);
    } else {
      expect(calls, `no winner merge after ${fault}`).not.toContain("merge");
      expect(result.code, fault).toBe(1);
      expect(calls, `no manifest mutation after ${fault}`).not.toContain("propose-manifest");
      const expectedCalls = fault === "unknown-opening" || fault === "missing-opening" || fault === "wrong-send" || fault === "missing-proposal" ? ["open-pr"] : fault === "missing-rules" ? ["open-pr", "ask-rules"] : ["open-pr", "ask-rules", "propose-file"];
      expect(calls, `no next mutation after ${fault}`).toEqual(expectedCalls);
    }
  }
});

test("scripted refusal and replacement answers stop before further work, and the timer excludes fresh edit work", async () => {
  const stale = ref("scripted stale", "lane", DEMO_DIGESTS.change), fresh = ref("scripted fresh", "lane", DEMO_DIGESTS.change);
  for (const fault of ["none", "wrong-reason", "wrong-code", "wrong-version", "unknown-refusal", "same-replacement", "invalid-replacement"] as const) {
    ports.command.mockReset();
    const ctx = await context(), calls: string[] = [], events: string[] = [];
    let clock = 100, measured: number | undefined;
    const found: Found = { stale: stale.scope, staleVersion: "3" };
    const refusal = `Not published: the merge ${stale.scope}:4 is refused, out-of-date. The change ${stale.scope} stays open at version 3. When it may be merged, run: artroom merge ${stale.scope}`;
    ports.command.mockImplementation(async (_ctx: Context, args: string[]): Promise<Outcome> => {
      calls.push(args[0]!); events.push(args[0]!);
      if (args[0] === "merge") {
        clock += 250;
        return { code: fault === "wrong-code" ? 0 : 1, lines: [fault === "wrong-reason" ? refusal.replace("out-of-date", "rules-not-met") : fault === "wrong-version" ? refusal.replace("version 3", "version 9") : fault === "unknown-refusal" ? "Outcome unknown. Do not retry." : refusal] };
      }
      clock += 1_000;
      const identity = fault === "same-replacement" ? stale.scope : fault === "invalid-replacement" ? "not-a-scope" : fresh.scope;
      return { code: 0, lines: [`Proposed guide/concurrent.md (1 bytes) as change ${identity}, version 5.`, `Published: commit ${NEW}, by the merge ${identity}:6.`, "Page: scripted page"] };
    });
    const expected = { code: 0, lines: ["Old base: <...>.", "$ artroom merge {stale}", "Not published: the merge {stale}:<seq> is refused, out-of-date. The change {stale} stays open at version {staleVersion}. When it may be merged, run: artroom merge {stale}", "Exit 1.", "$ artroom edit <...>", "Proposed guide/concurrent.md (1 bytes) as change <reproposed>, version <reproposedVersion>.", "Published: commit <reproposedCommit>, by the merge {reproposed}:<seq>.", "Page: scripted page", "Exit 0."] };
    const result = await staleReproposal(ctx, OLD, NEW, expected, found, () => clock, () => Date.parse(TIME), ms => { measured = ms; events.push("measured"); });
    if (["wrong-reason", "wrong-code", "wrong-version", "unknown-refusal"].includes(fault)) {
      expect(calls, `no fresh edit after ${fault}`).toEqual(["merge"]);
      expect(result.code, fault).toBe(1);
      expect(measured, `no accepted timing after ${fault}`).toBeUndefined();
    } else {
      expect(calls).toEqual(["merge", "edit"]);
      expect(measured, "fresh edit adds 1000ms and must stay outside the refusal timer").toBe(250);
      expect(events).toEqual(["merge", "measured", "edit"]);
      expect(result.code).toBe(fault === "none" ? 0 : 1);
    }
  }
});
