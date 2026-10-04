/**
 * One fixture set for every test of derivation, and for the packages that
 * build on it: a key set, two small definitions, and a scope in memory that
 * judges, seals and folds the way a runtime's commit does.
 *
 * `lane` is an issue-like lane: an intent, commitments, holds that end by
 * time, reports that take a commitment's attribution, and links to other
 * lanes. `small` is one item type with an act for each refusal and each guard
 * family. The names are made up.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, Bounds, DeclaredDefinition, Digest, Entry, FieldValue, Grant, Guard, Intent, KeyId, MemberId, MemberRef, ScopeKind, ScopeRef, Seed, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import { entryHash, keyIdOfSecret, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { MemoryState, applyEntry, clockOf, entryOf, judgeAct, judgeTimed, nextDue, timeMs, timeOf, validateDefinition } from "../src/index.ts";
import type { ActJudgment, Draft, JudgeContext, Presented, TimedJudgment, ValidDefinition, Validation } from "../src/index.ts";

export const d = (c: string): Digest => `sha256:${c.repeat(64)}`;
export const T0 = "2026-10-04T12:00:00Z";
/** `seconds` after T0. */
export const t = (seconds: number): Timestamp => timeOf(timeMs(T0)! + seconds * 1000);

const ref = (kind: ScopeKind, n: number): ScopeRef => {
  const seed: Seed = { v: 1, kind, definition: d("e"), creator: null, cause: d("c"), ordinal: n };
  return { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(n)), kind };
};
export const membership = ref("membership", 1);
export const directory = ref("directory", 2);
export const otherLane = ref("lane", 3);

export const member = (name: string): MemberRef => ({ membership, member: `@${name}` as MemberId });

/** A key, the member it acts as, and the member it acts for. */
export interface Actor { secret: Uint8Array; key: KeyId; member: MemberRef; principal: MemberRef | null }
const actor = (n: number, name: string, principal: string | null = null): Actor => {
  const secret = new Uint8Array(32).fill(n);
  return { secret, key: keyIdOfSecret(secret), member: member(name), principal: principal === null ? null : member(principal) };
};
/** The requester; two agents, each acting for an owner; and a member with no part in anything. */
export const keys = { rita: actor(1, "rita"), una: actor(2, "una", "paul"), vic: actor(3, "vic", "quinn"), paul: actor(4, "paul"), sam: actor(5, "sam") };

// ---------------------------------------------------------------- the lane

const text = { type: "text", max: 200 } as const;
const slot = { fixed: false, required: false } as const;
const act = (a: Partial<ActType> & Pick<ActType, "step" | "on" | "grant">): ActType => ({ also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });
const commitment = { also: { commitment: { item: "commitment", by: "commitment" } }, fields: { commitment: { type: "item", of: "commitment", required: true } } } as const;

export const lane: DeclaredDefinition = {
  format: "artroom-definition-1",
  profile: { name: "restricted", version: 1 },
  capabilities: [{ name: "hold", version: 1 }],
  genesis: "file",
  items: {
    intent: {
      many: false, max: 1, states: { open: { final: false }, closed: { final: true } }, initial: "open",
      parties: { requester: { fixed: true, required: true, list: false, author: false } }, refs: {}, values: { title: { ...slot, of: text } },
    },
    commitment: {
      many: true, max: 4, states: { offered: { final: false }, accepted: { final: false }, done: { final: true } }, initial: "offered",
      parties: { requester: { fixed: true, required: true, list: false, author: false }, performer: { ...slot, list: false, author: true } },
      refs: { intent: { fixed: true, required: true, to: { type: "item", of: "intent" } } }, values: {},
    },
    hold: {
      many: true, max: 2, states: { held: { final: false }, ended: { final: true } }, initial: "held",
      parties: { holder: { fixed: false, required: true, list: false, author: false } },
      refs: { under: { fixed: true, required: true, to: { type: "item", of: "commitment" } } }, values: { until: { fixed: false, required: true, of: { type: "time" } } },
    },
    report: {
      many: true, max: 8, states: { reported: { final: false }, accepted: { final: true } }, initial: "reported",
      parties: { reporter: { fixed: true, required: true, list: false, author: false }, authors: { fixed: true, required: true, list: true, max: 8, author: false } },
      refs: { commitment: { fixed: true, required: true, to: { type: "item", of: "commitment" } } }, values: {},
    },
    link: {
      many: true, max: 3, states: { set: { final: false }, removed: { final: true } }, initial: "set",
      parties: {}, refs: { target: { fixed: true, required: true, to: { type: "scope", kind: "lane" } } }, values: {},
    },
  },
  acts: {
    file: act({
      step: "open", on: "intent", grant: "file", fields: { title: { ...text, required: true }, opener: { type: "member", required: true } },
      effects: [{ party: { slot: "requester", from: { field: "opener" } } }, { value: { slot: "title", from: { field: "title" } } }],
    }),
    offer: act({
      step: "open", on: "commitment", grant: "offer", also: { intent: { item: "intent", by: "intent" } }, fields: { intent: { type: "item", of: "intent", required: true } },
      guards: [{ of: "also.intent", state: ["open"] }, { of: "also.intent", signer: ["requester"] }],
      effects: [{ party: { slot: "requester", from: { signer: true } } }, { ref: { slot: "intent", from: { field: "intent" } } }],
    }),
    // A handover: the one who leaves the slot is told, and so is the one who takes it.
    assign: act({
      step: "transition", on: "commitment", grant: "assign", fields: { performer: { type: "member", required: true } },
      guards: [{ state: ["offered", "accepted"] }, { signer: ["requester"] }],
      effects: [{ party: { slot: "performer", from: { field: "performer" } } }, { state: "accepted" }],
      attention: [{ notify: { slot: "performer", of: "on", when: "before", reason: "replaced" } }, { notify: { slot: "performer", of: "on", when: "after", reason: "assigned" } }],
    }),
    "take-hold": act({
      step: "open", on: "hold", grant: "hold", ...commitment,
      guards: [
        { of: "also.commitment", state: ["accepted"] }, { of: "also.commitment", signer: ["performer"] },
        { none: { type: "hold", states: ["held"], where: [{ equals: { a: { slot: "under" }, b: { field: "commitment" } } }] } },
      ],
      effects: [{ party: { slot: "holder", from: { signer: true } } }, { ref: { slot: "under", from: { field: "commitment" } } }, { value: { slot: "until", from: { time: { plusSeconds: 600 } } } }, { hold: { do: "open" } }],
    }),
    // By its holder, a renewal moves the end. By another member, it is a takeover, and the epoch rises.
    renew: act({
      step: "transition", on: "hold", grant: "hold", guards: [{ state: ["held"] }],
      effects: [{ party: { slot: "holder", from: { signer: true } } }, { value: { slot: "until", from: { time: { plusSeconds: 600 } } } }, { hold: { do: "renew" } }],
    }),
    report: act({
      step: "open", on: "report", grant: "report", ...commitment,
      guards: [{ of: "also.commitment", state: ["accepted"] }, { of: "also.commitment", signer: ["performer"] }],
      effects: [{ party: { slot: "reporter", from: { signer: true } } }, { ref: { slot: "commitment", from: { field: "commitment" } } }, { attribute: { slot: "authors", of: "also.commitment" } }],
    }),
    "accept-report": act({ step: "transition", on: "report", grant: "review", guards: [{ state: ["reported"] }, { notIn: ["authors"] }], effects: [{ state: "accepted" }] }),
    close: act({
      step: "transition", on: "intent", grant: "close",
      guards: [{ state: ["open"] }, { signer: ["requester"] }, { none: { type: "commitment", states: ["offered", "accepted"] } }],
      effects: [{ state: "closed" }], sends: [{ index: { fields: { title: { slot: "title" }, intent: "self" } } }],
    }),
    link: act({
      step: "open", on: "link", grant: "link", fields: { target: { type: "scope", kind: "lane", required: true }, about: { type: "item", of: "intent", required: true } },
      effects: [{ ref: { slot: "target", from: { field: "target" } } }],
      sends: [
        { relate: { to: { field: "target" }, name: "closes", item: "self", state: "set", detail: { about: { field: "about" } }, result: { refused: [{ state: "removed" }] } } },
        { create: { kind: "lane", definition: d("e"), fields: { parent: "self", by: { signer: true } }, result: {} } },
      ],
    }),
    remark: act({ step: "comment", on: "intent", grant: "remark", fields: { text: { ...text, required: true } } }),
  },
  receives: {},
  timed: {
    "hold-end": { on: "hold", states: ["held"], deadline: "until", effects: [{ state: "ended" }, { hold: { do: "end" } }], attention: [{ notify: { slot: "holder", of: "on", when: "after", reason: "hold ended" } }] },
  },
};

// ---------------------------------------------------------------- the small definition

const noteRange = (states: string[]) => ({ type: "note", states, where: [{ equals: { a: { slot: "text" }, b: { field: "text" } } }] });
const probe = (guard: Guard) => act({ step: "transition", on: "note", grant: "probe", fields: { text: { ...text, required: true } }, guards: [guard] });

export const small: DeclaredDefinition = {
  format: "artroom-definition-1",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "start",
  items: {
    note: {
      many: true, max: 2, states: { draft: { final: false }, kept: { final: true } }, initial: "draft",
      parties: { owner: { fixed: true, required: true, list: false, author: true }, readers: { ...slot, list: true, max: 2, author: false } },
      refs: { peer: { ...slot, to: { type: "scope", kind: "lane" } }, me: { ...slot, to: { type: "item", of: "note" } } },
      values: { text: { ...slot, of: text }, due: { ...slot, of: { type: "time" } } },
    },
  },
  acts: {
    start: act({ step: "open", on: "note", grant: "start", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "owner", from: { field: "opener" } } }] }),
    // `owner` is optional, so an opening can leave the required slot unset: refused when judged, not by the validator.
    write: act({
      step: "open", on: "note", grant: "write", fields: { owner: { type: "member", required: false }, text: { ...text, required: false }, due: { type: "time", required: false } },
      effects: [{ party: { slot: "owner", from: { field: "owner" } } }, { value: { slot: "text", from: { field: "text" } } }, { value: { slot: "due", from: { field: "due" } } }],
    }),
    edit: act({
      step: "transition", on: "note", grant: "edit", also: { other: { item: "note", by: "other" } },
      fields: { text: { ...text, required: true }, other: { type: "item", of: "note", required: true }, notes: { type: "list", of: { type: "item", of: "note" }, max: 4, required: false } },
      guards: [{ state: ["draft"] }, { equals: { a: { slot: "owner" }, b: { signer: true } } }, { before: { slot: "due" } }, { every: { list: "notes", states: ["kept"] }, ifPresent: true }],
      effects: [{ value: { slot: "text", from: { field: "text" } } }],
    }),
    late: act({ step: "transition", on: "note", grant: "edit", guards: [{ state: ["draft"] }, { after: { slot: "due" } }], effects: [{ value: { slot: "text", from: { const: "late" } } }] }),
    keep: act({ step: "transition", on: "note", grant: "keep", guards: [{ state: ["draft"] }], effects: [{ state: "kept" }] }),
    share: act({ step: "transition", on: "note", grant: "share", fields: { reader: { type: "member", required: true } }, guards: [{ state: ["draft"] }], effects: [{ party: { slot: "readers", from: { field: "reader" }, list: "add" } }] }),
    // Names a foreign fact: an `assign` entry of a lane, whose performer must be the signer.
    cite: act({
      step: "transition", on: "note", grant: "edit", fields: { proof: { type: "fact", kind: "assign", under: "lane", required: true } },
      guards: [{ state: ["draft"] }, { fact: { field: "proof", where: [{ equals: { a: { field: "performer" }, b: { signer: true } } }] } }],
      effects: [{ party: { slot: "readers", from: { fact: "proof", field: "performer" }, list: "add" } }],
    }),
    // Two relate sends that are written differently and resolve to one key: `self`, and a slot that holds the opened item.
    echo: act({
      step: "open", on: "note", grant: "write", fields: { peer: { type: "scope", kind: "lane", required: true } },
      effects: [{ party: { slot: "owner", from: { signer: true } } }, { ref: { slot: "me", from: "self" } }, { ref: { slot: "peer", from: { field: "peer" } } }],
      sends: [
        { relate: { to: { field: "peer" }, name: "mirrors", item: "self", state: "set", detail: {}, result: {} } },
        { relate: { to: { slot: "peer" }, name: "mirrors", item: { slot: "me" }, state: "removed", detail: {}, result: {} } },
      ],
    }),
    // One act for each range guard, over kept notes, which are retained final items that `max` does not bound.
    has: probe({ some: noteRange(["kept"]) }),
    lacks: probe({ none: noteRange(["kept"]) }),
    few: probe({ count: { ...noteRange(["kept"]), max: 1 } }),
    enough: probe({ count: { ...noteRange(["kept"]), min: 2 } }),
  },
  receives: {},
  timed: {},
};

export function valid(v: Validation): ValidDefinition {
  if (!v.ok) throw new Error(`the fixture definition is refused: ${JSON.stringify(v.problems)}`);
  return v.definition;
}
export const laneDefinition = valid(validateDefinition(lane, PROPOSED_BOUNDS));
export const smallDefinition = valid(validateDefinition(small, PROPOSED_BOUNDS));

// ---------------------------------------------------------------- a scope in memory

/** A grant of every action of the definition to that actor's key, in that scope. A test authority, and named as one. */
export function grantOf(who: Actor, within: ScopeRef, actions: readonly string[], notAfter: Timestamp | null = null): Grant {
  return { issued: { at: membership, seq: 3, hash: d("3") }, subject: who.member, key: who.key, principal: who.principal, actions, within, notAfter, fresh: null };
}

export type Over = Partial<Pick<Intent, "on" | "expected" | "fields" | "idempotencyKey" | "notAfter" | "to" | "kind">>;
export type Context = Partial<Omit<JudgeContext, "clock">> & { reading?: Timestamp };

/**
 * A lane created by a directory and confirmed: its genesis opened item 0 for
 * `opener` (entry 0) and its creator's confirmation made it active (entry 1),
 * both at T0. It then does what a commit does: judge at one reading, seal,
 * hash, fold.
 */
export class Scope {
  readonly state = new MemoryState();
  readonly entries: { entry: Entry; hash: Digest }[] = [];
  readonly at: ScopeRef;
  /** The reading of the next commit. */
  now: Timestamp = T0;
  bounds: Bounds = PROPOSED_BOUNDS;
  #keys = 0;

  constructor(readonly definition: ValidDefinition, opener: MemberRef = keys.rita.member, confirmed = true) {
    const declared = definition.declared;
    const type = declared.acts[declared.genesis]!.on!;
    const seed: Seed = { v: 1, kind: "lane", definition: definition.digest, creator: directory, cause: d("c"), ordinal: 0 };
    this.at = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(9)), kind: "lane" };
    const source = { at: directory, seq: 17, hash: d("7") };
    const message = { class: "request", type: "create", body: { fields: { opener } } } as const;
    const slot = Object.keys(declared.items[type]!.parties)[0]!;
    this.#fold({
      v: 1, at: this.at, seq: 0, prev: null, time: T0, clamped: false, epoch: 0,
      input: { type: "genesis", seed, inc: this.at.inc, founding: null, source, n: 0, message, decision: "applied" }, uses: [], prepared: [],
      effects: [{ effect: "open", item: 0, type, state: declared.items[type]!.initial }, { effect: "party", item: 0, slot, member: opener }],
      sends: [{ n: 0, to: directory, message: { class: "result", of: { from: source, n: 0 }, outcome: "applied" } }],
    });
    if (confirmed) {
      const genesis = { at: this.at, seq: 0, hash: this.head.hash };
      this.#fold({
        v: 1, at: this.at, seq: 1, prev: this.head.hash, time: T0, clamped: false, epoch: 0,
        input: { type: "delivery", from: { at: directory, seq: 18, hash: d("8") }, n: 0, message: { class: "control", type: "confirm", genesis } },
        uses: [], prepared: [], effects: [{ effect: "activate" }], sends: [],
      });
    }
  }

  get head() { return this.state.scope()!.head; }
  item(id: number) { return this.state.item(id)!; }
  #fold(entry: Entry): Entry {
    const hash = entryHash(entry);
    applyEntry(this.state, this.definition, entry, hash);
    this.entries.push({ entry, hash });
    return entry;
  }

  /** An intent to this scope, with a new idempotency key, admissible for a minute from `now`. */
  intent(who: Actor, kind: string, over: Over = {}): SignedIntent {
    const intent: Intent = { v: 1, to: this.at, actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `k${this.#keys++}`, notAfter: timeOf(timeMs(this.now)! + 60_000), ...over };
    return signIntent(intent, who.secret);
  }
  /** Every actor of the key set holds every action here, unless the test presents other grants. */
  grants(): Presented[] {
    const actions = Object.values(this.definition.declared.acts).map((a) => a.grant);
    return Object.values(keys).map((who) => ({ grant: grantOf(who, this.at, actions), current: true }));
  }
  context(over: Context = {}): JudgeContext {
    const { reading, ...rest } = over;
    return { clock: clockOf(this.state, reading ?? this.now), grants: this.grants(), facts: [], prepared: [], bounds: this.bounds, ...rest };
  }
  /** Judge only: nothing is written. */
  judge(signed: SignedIntent, over: Context = {}): ActJudgment {
    return judgeAct(this.state, this.definition, signed, this.context(over));
  }
  seal(draft: Draft, reading: Timestamp = this.now): Entry {
    return this.#fold(entryOf(this.state, draft, clockOf(this.state, reading)));
  }
  /** Judge, and write the entry if the judgment is to write. */
  submit(signed: SignedIntent, over: Context = {}): ActJudgment {
    const judgment = this.judge(signed, over);
    if (judgment.result === "write") this.seal(judgment.draft, over.reading);
    return judgment;
  }
  act(who: Actor, kind: string, over: Over = {}, context: Context = {}): ActJudgment {
    return this.submit(this.intent(who, kind, over), context);
  }
  /** An act that must be written. Returns its entry. */
  did(who: Actor, kind: string, over: Over = {}): Entry {
    const judgment = this.act(who, kind, over);
    if (judgment.result !== "write") throw new Error(`${kind} was not written: ${JSON.stringify(judgment)}`);
    return this.entries.at(-1)!.entry;
  }
  /** The drain of section 5.2, step 3, at `now`: each due transition as its own entry. */
  drain(): TimedJudgment[] {
    const done: TimedJudgment[] = [];
    for (let due = nextDue(this.state, this.definition, this.now); due; due = nextDue(this.state, this.definition, this.now)) {
      const judgment = judgeTimed(this.state, this.definition, due, this.context());
      done.push(judgment);
      if (judgment.result !== "write") break;
      this.seal(judgment.draft);
    }
    return done;
  }
  /** Every entry folded again into a new state, as a verifier does. */
  replay(): MemoryState {
    const fresh = new MemoryState();
    for (const { entry, hash } of this.entries) applyEntry(fresh, this.definition, entry, hash);
    return fresh;
  }
}

/** Short forms for a transition's `on` with its expected revision, and for fields. */
export const on = (scope: Scope, id: number, also: Record<string, number> = {}): Over => ({
  on: id, expected: { on: scope.item(id).revision, ...Object.fromEntries(Object.entries(also).map(([name, other]) => [name, scope.item(other).revision])) },
});
export const fields = (f: Record<string, FieldValue>): Over => ({ fields: f });
