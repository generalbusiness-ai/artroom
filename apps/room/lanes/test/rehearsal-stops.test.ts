import { expect, test, vi } from "vitest";
import type { Entry, Read, ScopeRef, Seed, Sealed, Summary } from "@generalbusiness/dap-contract";
import { entryHash, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { memoryStore, type Context, type Outcome } from "@generalbusiness/dap-cli";
import { DEMO_DIGESTS, MANIFEST_DIGESTS } from "../src/index.ts";
import { prepareConcurrentAndMerge, staleReproposal, type Found } from "../../../../scripts/demo/rehearse.ts";

// Runner boundary STAND-IN: commands, read sessions, entries and summaries
// below are scripted. Production composite code still judges exact results,
// hashes and identities. No native admission, Git host or provider runs here.
const ports = vi.hoisted(() => ({ command: vi.fn(), session: vi.fn(), entry: vi.fn(), summary: vi.fn() }));
vi.mock("@generalbusiness/dap-cli", async importOriginal => ({ ...await importOriginal<typeof import("@generalbusiness/dap-cli")>(), command: ports.command }));
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
function ref(label: string, kind: ScopeRef["kind"], definition: Seed["definition"]): ScopeRef {
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
  for (const fault of ["none", "unknown-opening", "missing-opening", "wrong-opening-hash", "wrong-opening-type", "wrong-opening-kind", "wrong-send", "wrong-definition", "missing-proposal", "unknown-proposal-summary", "missing-rules", "unknown-rules-summary", "nonnumeric-rules", "wrong-ask-output", "wrong-ask-code", "unknown-proposal", "missing-manifest-source", "wrong-manifest-type", "wrong-manifest-kind", "wrong-manifest-output", "wrong-manifest-code", "wrong-winner-output", "wrong-winner-code"] as const) {
    ports.command.mockReset(); ports.entry.mockReset(); ports.summary.mockReset();
    const ctx = await context(), manifest = fault.includes("manifest");
    const entry = opening(manifest ? MANIFEST_DIGESTS.demo : DEMO_DIGESTS.change);
    if (fault === "wrong-send") entry.sends = [];
    if (fault === "wrong-opening-type") entry.input = { type: "checkpoint", through: 0, state: textDigest("scripted checkpoint") };
    if (fault === "wrong-opening-kind" && entry.input.type === "act") entry.input.signed = signIntent({ ...entry.input.signed.intent, kind: "another-valid-kind" }, secret);
    if (fault === "wrong-definition") entry.sends = [{ ...entry.sends[0]!, to: { ...opening(DEMO_DIGESTS.change).sends[0]!.to as Seed, definition: MANIFEST_DIGESTS.demo } }];
    const seed = opening(manifest ? MANIFEST_DIGESTS.demo : DEMO_DIGESTS.change).sends[0]!.to as Seed;
    const stale = { ...C, scope: scopeIdOf(seed) };
    const found: Found = { directory: D.scope, publishedCommit: OLD, controlled: C.scope };
    const calls: string[] = [];
    const took = (scope: string, seq: number) => `Took effect: entry ${scope}:${seq}, hash ${fault === "wrong-opening-hash" ? textDigest("different scripted opening") : entryHash(entry)}.`;
    const source = { ...opening(MANIFEST_DIGESTS.demo), at: stale, seq: 3, sends: [] };
    if (source.input.type === "act") source.input.signed = signIntent({ ...source.input.signed.intent, to: stale, kind: fault === "wrong-manifest-kind" ? "another-valid-kind" : "propose-file" }, secret);
    if (fault === "wrong-manifest-type") source.input = { type: "checkpoint", through: 0, state: textDigest("scripted source checkpoint") };
    ports.entry.mockImplementation(async (_scope: string, seq: number) => seq === 1 ? fault === "missing-opening" ? { ok: false, reason: "unavailable" } : entryRead(entry) : fault === "missing-manifest-source" ? { ok: false, reason: "unavailable" } : entryRead(source));
    ports.summary.mockImplementation(async () => {
      // Read phase follows actual commands, not a count that changes when a
      // guard is bypassed. A failed read must not advance the command ledger.
      const rules = calls.includes("ask-rules");
      if ((!rules && fault === "unknown-proposal-summary") || (rules && fault === "unknown-rules-summary")) return { ok: false, reason: "unavailable" };
      return rules ? summary(stale, fault === "missing-rules" ? "other" : "rules", { revision: fault === "nonnumeric-rules" ? "one" : 1 }) : summary(stale, fault === "missing-proposal" ? "other" : "proposal");
    });
    ports.command.mockImplementation(async (_ctx: Context, args: string[]): Promise<Outcome> => {
      const kind = args[0] === "act" ? args[1]! : args[0]!;
      calls.push(kind);
      if ((kind === "open-pr" && fault === "unknown-opening") || (kind === "propose-file" && fault === "unknown-proposal")) return { code: 1, lines: ["Outcome unknown. Do not retry."] };
      if (kind === "open-pr") return { code: 0, lines: [took(D.scope, 1)] };
      if (kind === "ask-rules") return { code: fault === "wrong-ask-code" ? 1 : 0, lines: [fault === "wrong-ask-output" ? "Unexpected rules answer." : took(stale.scope, 2)] };
      if (kind === "propose-file") return { code: 0, lines: [took(stale.scope, 3)] };
      if (kind === "propose-manifest") return { code: fault === "wrong-manifest-code" ? 1 : 0, lines: [fault === "wrong-manifest-output" ? "Unexpected manifest answer." : took(stale.scope, 4)] };
      return { code: fault === "wrong-winner-code" ? 1 : 0, lines: fault === "wrong-winner-output" ? ["Unexpected winner answer."] : [`Published: commit ${NEW}, by the merge ${C.scope}:5.`, ...(manifest ? [] : ["Page: scripted page"])] };
    });
    const lines = ["Proposal base: {publishedCommit}.", "$ dap act open-pr <...>", "Took effect: entry {directory}:<staleOpening>, hash <staleOpeningHash>.", "Exit 0.", "Opened change: <stale>.", "$ dap act ask-rules <...>", "Took effect: entry {stale}:<seq>, hash <hash>.", "Exit 0.", "$ dap act propose-file <...>", `Took effect: entry {stale}:<${manifest ? "staleSource" : "staleVersion"}>, hash <hash>.`, "Exit 0.", "$ dap merge {controlled}", "Published: commit <controlledCommit>, by the merge {controlled}:<seq>.", "Page: scripted page", "Exit 0."];
    if (manifest) {
      lines.splice(11, 0, "$ dap act propose-manifest <...>", "Took effect: entry {stale}:<staleVersion>, hash <hash>.", "Exit 0.");
      lines.splice(lines.length - 2, 1);
    }
    const result = await prepareConcurrentAndMerge(ctx, OLD, C.scope, { code: 0, lines }, found, manifest);
    if (fault === "none") {
      expect(result.code).toBe(0);
      expect(calls).toEqual(["open-pr", "ask-rules", "propose-file", "merge"]);
    } else {
      const afterOpening = ["unknown-opening", "missing-opening", "wrong-opening-hash", "wrong-opening-type", "wrong-opening-kind", "wrong-send", "wrong-definition", "missing-proposal", "unknown-proposal-summary"].includes(fault);
      const afterRules = ["missing-rules", "unknown-rules-summary", "nonnumeric-rules", "wrong-ask-output", "wrong-ask-code"].includes(fault);
      const expectedCalls = afterOpening ? ["open-pr"] : afterRules ? ["open-pr", "ask-rules"] : fault.startsWith("wrong-winner") ? ["open-pr", "ask-rules", "propose-file", "merge"] : fault === "wrong-manifest-output" || fault === "wrong-manifest-code" ? ["open-pr", "ask-rules", "propose-file", "propose-manifest"] : ["open-pr", "ask-rules", "propose-file"];
      expect(calls, `no next mutation after ${fault}`).toEqual(expectedCalls);
      expect(result.code, `composite must stop after ${fault}`).toBe(1);
    }
  }
  // Trusted test wiring: these preflight failures prove no CLI invocation,
  // not a returned remote-evidence decision or membership authority.
  for (const fault of ["invalid-base", "invalid-scope", "missing-room", "missing-key", "session-refused"] as const) {
    ports.command.mockReset();
    const ctx = await context();
    if (fault === "missing-room") await ctx.store.save({ v: 1, service: "https://scripted.test", key: "scripted" });
    if (fault === "missing-key") ctx.store = { ...ctx.store, secret: async () => null };
    if (fault === "session-refused") ports.session.mockResolvedValue({ ok: false, reason: "unauthorized" });
    const result = await prepareConcurrentAndMerge(ctx, fault === "invalid-base" ? "bad-base" : OLD, fault === "invalid-scope" ? "bad-scope" : C.scope, { code: 0, lines: [] }, {}, false);
    expect(ports.command, `trusted preflight ${fault} must call no CLI command`).not.toHaveBeenCalled();
    expect(result.code).toBe(1);
  }
});

test("scripted refusal and replacement answers stop before further work, and the timer excludes fresh edit work", async () => {
  const stale = ref("scripted stale", "lane", DEMO_DIGESTS.change), fresh = ref("scripted fresh", "lane", DEMO_DIGESTS.change);
  for (const fault of ["none", "wrong-reason", "wrong-code", "wrong-version", "unknown-refusal", "same-replacement", "invalid-replacement", "wrong-edit-output", "wrong-edit-code"] as const) {
    ports.command.mockReset();
    const ctx = await context(), calls: string[] = [], events: string[] = [];
    let clock = 100, measured: number | undefined;
    const found: Found = { stale: stale.scope, staleVersion: "3" };
    const refusal = `Not published: the merge ${stale.scope}:4 is refused, out-of-date. The change ${stale.scope} stays open at version 3. When it may be merged, run: dap merge ${stale.scope}`;
    ports.command.mockImplementation(async (_ctx: Context, args: string[]): Promise<Outcome> => {
      calls.push(args[0]!); events.push(args[0]!);
      if (args[0] === "merge") {
        clock += 250;
        return { code: fault === "wrong-code" ? 0 : 1, lines: [fault === "wrong-reason" ? refusal.replace("out-of-date", "rules-not-met") : fault === "wrong-version" ? refusal.replace("version 3", "version 9") : fault === "unknown-refusal" ? "Outcome unknown. Do not retry." : refusal] };
      }
      clock += 1_000;
      const identity = fault === "same-replacement" ? stale.scope : fault === "invalid-replacement" ? "not-a-scope" : fresh.scope;
      return { code: fault === "wrong-edit-code" ? 1 : 0, lines: fault === "wrong-edit-output" ? ["Unexpected fresh edit answer."] : [`Proposed guide/concurrent.md (1 bytes) as change ${identity}, version 5.`, `Published: commit ${NEW}, by the merge ${identity}:6.`, "Page: scripted page"] };
    });
    const expected = { code: 0, lines: ["Old base: <...>.", "$ dap merge {stale}", "Not published: the merge {stale}:<seq> is refused, out-of-date. The change {stale} stays open at version {staleVersion}. When it may be merged, run: dap merge {stale}", "Exit 1.", "$ dap edit <...>", "Proposed guide/concurrent.md (1 bytes) as change <reproposed>, version <reproposedVersion>.", "Published: commit <reproposedCommit>, by the merge {reproposed}:<seq>.", "Page: scripted page", "Exit 0."] };
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
  for (const fault of ["invalid-old-base", "invalid-new-base", "same-base", "invalid-stale-scope"] as const) {
    ports.command.mockReset();
    const ctx = await context();
    let measured = false;
    const result = await staleReproposal(ctx, fault === "invalid-old-base" ? "bad-base" : OLD, fault === "invalid-new-base" ? "bad-base" : fault === "same-base" ? OLD : NEW, { code: 0, lines: [] }, { stale: fault === "invalid-stale-scope" ? "bad-scope" : stale.scope }, () => 100, () => Date.parse(TIME), () => { measured = true; });
    expect(ports.command, `trusted preflight ${fault} must call no CLI command`).not.toHaveBeenCalled();
    expect([result.code, measured]).toEqual([1, false]);
  }
});
