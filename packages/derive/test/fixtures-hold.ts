/**
 * One fixture for the tests of the capability rules: a lane that stages,
 * reports and exports, and a scope in memory that asks for steps, records
 * outcomes and folds what the capability derives.
 *
 * `staging` is the fixture lane with the forms of `hold@1` as the two pinned
 * lane definitions write them, argument for argument: `staged` with a
 * commit and what it is under, `pin-hold` with a commit, and `pin-release`
 * with a slot's commit. `reads` is how this fixture's steps read a request
 * from a signed intent. The texts state no one reading (I3 deltas, entry
 * EF2), so it is the fixture's own.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Effect, Entry, Evidence, FieldValue, OperationId, ScopeRef } from "@generalbusiness/artroom-contract";
import { isScopeRef } from "@generalbusiness/artroom-bytes";
import { checkpointOf, clockOf, holdCapability, judgePreparation, owed, settleOutcome, workspaceEffects } from "../src/index.ts";
import type { CapabilityGiven, HoldReads, ValidDefinition } from "../src/index.ts";
import { Scope, grantOf, keys, lane, variant, type Actor } from "./fixtures.ts";

/** A commit ID: forty of one hex digit. */
export const C = (digit: string): string => digit.repeat(40);

export const reads: HoldReads = {
  staged: ({ fields }) => (typeof fields["commit"] === "string" && typeof fields["commitment"] === "number"
    ? { commit: fields["commit"], under: fields["commitment"], hold: typeof fields["hold"] === "number" ? fields["hold"] : null, instance: typeof fields["instance"] === "string" ? fields["instance"] : null } : null),
  instance: ({ fields }) => (typeof fields["hold"] === "number" && isScopeRef(fields["task"]) && typeof fields["instance"] === "string" ? { hold: fields["hold"], task: fields["task"], instance: fields["instance"] } : null),
  token: ({ fields }) => (typeof fields["hold"] === "number" && typeof fields["instance"] === "string" ? { hold: fields["hold"], instance: fields["instance"] } : null),
};

const commit = { type: "commit" } as const;
/* eslint-disable @typescript-eslint/no-explicit-any */
export const staging: ValidDefinition = variant(lane, (def: any) => {
  def.items.report.states = { reported: { final: false }, accepted: { final: true }, refused: { final: true } };
  def.items.report.values = { commit: { fixed: false, required: false, of: commit } };
  def.items.export = { many: true, max: 4, states: { authorized: { final: false }, done: { final: true } }, initial: "authorized", parties: {}, refs: { hold: { fixed: true, required: true, to: { type: "item", of: "hold" } } }, values: {} };
  const report = def.acts.report;
  report.fields = { ...report.fields, commit: { ...commit, required: true }, hold: { type: "item", of: "hold", required: false }, instance: { type: "text", max: 128, required: false } };
  report.guards.push({ capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "also.commitment" } } } });
  report.effects.push({ value: { slot: "commit", from: { field: "commit" } } }, { capability: { name: "hold", do: "pin-hold", with: { commit: { field: "commit" } } } });
  def.acts["refuse-report"] = {
    step: "transition", on: "report", grant: "review", also: {}, fields: {}, guards: [{ state: ["reported"] }], sends: [], attention: [],
    effects: [{ state: "refused" }, { capability: { name: "hold", do: "pin-release", with: { commit: { slot: "commit" } } } }],
  };
  def.acts.authorize = {
    step: "open", on: "export", grant: "export", also: { hold: { item: "hold", by: "hold" } }, fields: { hold: { type: "item", of: "hold", required: true } },
    guards: [{ of: "also.hold", state: ["ended"] }], effects: [{ ref: { slot: "hold", from: { field: "hold" } } }], sends: [], attention: [],
  };
});

/** The capability's code over the fixture lane, with at most two tokens of one hold at once. */
export const cap = holdCapability({ reads, tokensPerHold: 2 }, () => staging);

const said = (j: { result: string; reason?: string; name?: string; detail?: string }): string => [j.result, j.reason ?? "", j.name ?? ""].filter((part) => part !== "").join(" ");

/**
 * A staging lane in memory. Entries 0 and 1 are the fixture's. `rita` asks
 * and `una` performs: entry 2 is the commitment, entry 3 gives it to `una`,
 * and entry 4 is `una`'s hold under it, with what the capability derives
 * for it in entry 5.
 */
export class Staging extends Scope {
  readonly commitment = 2;
  readonly hold = 4;

  constructor(definition: ValidDefinition = staging) {
    super(definition);
    this.did(keys.rita, "offer", { expected: { intent: 1 }, fields: { intent: 0 } });
    this.did(keys.rita, "assign", { on: this.commitment, expected: { on: 1 }, fields: { performer: keys.una.member } });
    this.take(keys.una);
  }

  /** `who` takes a hold under the commitment, and the capability's own effects for that entry are folded. Returns the hold's ID. */
  take(who: Actor): number {
    const hold = this.did(who, "take-hold", { expected: { commitment: this.item(this.commitment).revision }, fields: { commitment: this.commitment } }).seq;
    this.derived();
    return hold;
  }

  /** An entry made by hand, with those effects: a stand-in for an entry that a later step makes the judges write. */
  hand(effects: readonly Effect[]): Entry {
    return this.fold({ v: 1, at: this.at, seq: this.head.seq + 1, prev: this.head.hash, time: this.now, clamped: false, epoch: 0, input: { type: "checkpoint", ...checkpointOf(this.state) }, uses: [], prepared: [], effects, sends: [] });
  }

  /**
   * What the capability derives for the `hold` effects of the last entry,
   * folded as an entry made by hand. Step 16 makes the judges write these
   * effects in the entry itself. They are derived over the state before that
   * entry, as the judges would derive them. Null: nothing is derived.
   */
  derived(): Entry | null {
    const holds = this.last.effects.filter((e): e is Extract<Effect, { effect: "hold" }> => e.effect === "hold");
    const effects = workspaceEffects(this.replay(this.entries.length - 1), this.definition, this.head.seq + 1, 0, holds, (id) => this.state.item(id));
    return effects.length > 0 ? this.hand(effects) : null;
  }

  /** Ask for one step with a new intent of that kind and those fields. The entry when it is written, or the answer in short. */
  prepare(who: Actor, step: string, fields: Record<string, FieldValue>, over: { kind?: string; to?: ScopeRef } = {}): Entry | string {
    const signed = this.intent(who, over.kind ?? step, { fields, ...(over.to ? { to: over.to } : {}) });
    return this.asked(signed, step);
  }
  asked(signed: ReturnType<Scope["intent"]>, step: string): Entry | string {
    const actions = Object.values(this.definition.declared.acts).map((a) => a.grant);
    const j = judgePreparation(this.state, this.definition, { signed, capability: "hold@1", step }, {
      clock: clockOf(this.state, this.now), bounds: PROPOSED_BOUNDS, steps: cap,
      granted: ({ key }) => { const who = Object.values(keys).find((k) => k.key === key); return who ? { result: "granted", grant: grantOf(who, this.at, actions) } : { result: "refused" }; },
    });
    return j.result === "write" ? this.seal(j.draft) : j.result === "repeat" ? `repeat ${j.seq}` : said(j);
  }

  /** Offer one outcome of an attempt, and seal it when it writes. */
  outcome(operation: OperationId, result: "confirmed" | "refused" | "unknown", body: unknown = {}, basis: Evidence["basis"] = result === "unknown" ? "none" : "own-answer", attempt = 1): Entry | string {
    const j = settleOutcome(this.state, this.definition, { type: "outcome", operation, attempt, result, evidence: { basis, body } }, { clock: clockOf(this.state, this.now), bounds: PROPOSED_BOUNDS, owners: cap });
    return j.result === "write" ? this.seal(j.draft) : j.result === "repeat" || j.result === "conflict" ? `${j.result} ${j.seq}` : said(j);
  }

  /** One record of `hold@1`, in short: its state and its values. */
  record(kind: string, ...key: FieldValue[]) {
    const found = this.state.record("hold@1", kind, key);
    return found && { state: found.state, ...found.values };
  }
  /** What a capability rule is given for an input of this scope, with that intent digest. */
  given(over: Partial<CapabilityGiven> = {}): CapabilityGiven {
    return { view: this.state, definition: this.definition, scope: { at: this.at, creator: null }, self: this.head.seq + 1, kind: "", fields: {}, signer: null, facts: new Map(), own: this.own, clock: clockOf(this.state, this.now), ...over };
  }
  /** The entries that the pending duties reserve, with what the capability declares. */
  reserved(): number { return owed(this.state, this.definition, this.last.input, cap); }
}

/** An ancestry record that judges nothing foreign: the evidence of a check that found the commit clean. */
export const clean = (commitId: string, root: number) => ({ commit: commitId, root: { number: root, state: "live" }, head: C("d"), snapshot: { digest: `sha256:${"5".repeat(64)}`, count: 1 }, start: { foreign: null }, stops: [], F: [], visited: 1 });
