/**
 * One fixture set for every test of derivation, and for the packages that
 * build on it: a key set, four small definitions, and a scope in memory that
 * judges, seals and folds the way a runtime's commit does.
 *
 * `lane` is an issue-like lane: an intent, commitments, holds that end by
 * time, reports that take a commitment's attribution, and links to other
 * lanes. `small` is one item type with an act for each refusal and each guard
 * family. `desk` is a small directory that creates `ticket` lanes, by an act
 * and by a handler; a ticket links to another ticket, asks its desk for a
 * new one, and has one act under a rule. The names are made up.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, Bounds, DeclaredDefinition, Digest, Entry, FactRef, FieldValue, Grant, Guard, Input, Intent, KeyId, MemberId, MemberRef, ObservationUse, ScopeKind, ScopeRef, Seed, Send, SignedIntent, Timestamp } from "@generalbusiness/artroom-contract";
import { entryHash, factRefOf, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { MemoryState, applyEntry, clockOf, entryOf, judgeAct, judgeDelivery, judgeGenesis, judgeTimed, messageFacts, nextDue, timeMs, timeOf, validateDefinition } from "../src/index.ts";
import type { ActJudgment, Creation, Delivered, DeliveryContext, Draft, Fetched, JudgeContext, Judgment, Presented, Source, TimedJudgment, ValidDefinition, Validation } from "../src/index.ts";

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
  name: "lane",
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
      refs: { under: { fixed: true, required: true, to: { type: "item", of: "commitment" } } },
      values: { until: { fixed: false, required: true, of: { type: "time" } }, epoch: { fixed: false, required: true, of: { type: "int", min: 1, max: 1000000 } } },
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
      effects: [{ ref: { slot: "under", from: { field: "commitment" } } }, { value: { slot: "until", from: { time: { plusSeconds: 600 } } } }, { hold: { do: "open" } }],
    }),
    // By its holder, a renewal moves the end. By another member, it is a takeover, and the epoch rises.
    renew: act({
      step: "transition", on: "hold", grant: "hold", guards: [{ state: ["held"] }],
      effects: [{ value: { slot: "until", from: { time: { plusSeconds: 600 } } } }, { hold: { do: "renew" } }],
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
    "hold-end": { on: "hold", states: ["held"], deadline: "until", effects: [{ hold: { do: "end" } }], attention: [{ notify: { slot: "holder", of: "on", when: "after", reason: "hold ended" } }] },
  },
  rules: {},
};

// ---------------------------------------------------------------- the small definition

const noteRange = (states: string[]) => ({ type: "note", states, where: [{ equals: { a: { slot: "text" }, b: { field: "text" } } }] });
const probe = (guard: Guard) => act({ step: "transition", on: "note", grant: "probe", fields: { text: { ...text, required: true } }, guards: [guard] });

export const small: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "small",
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
      step: "transition", on: "note", grant: "edit", fields: { proof: { type: "fact", kind: ["assign"], under: "lane", required: true } },
      guards: [{ state: ["draft"] }, { fact: { field: "proof", where: [{ equals: { a: { field: "performer" }, b: { signer: true } } }] } }],
      effects: [{ party: { slot: "readers", from: { field: "proof", part: { field: "performer" } }, list: "add" } }],
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
  rules: {},
};

export function valid(v: Validation): ValidDefinition {
  if (!v.ok) throw new Error(`the fixture definition is refused: ${JSON.stringify(v.problems)}`);
  return v.definition;
}
/** A fixture definition with one change, validated. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function variant(base: DeclaredDefinition, change: (definition: any) => void): ValidDefinition {
  const definition = structuredClone(base);
  change(definition);
  return valid(validateDefinition(definition, PROPOSED_BOUNDS));
}
export const laneDefinition = valid(validateDefinition(lane, PROPOSED_BOUNDS));
export const smallDefinition = valid(validateDefinition(small, PROPOSED_BOUNDS));

const body = { type: "text", max: 40, detached: true } as const;
const noted = (a: Partial<ActType> & Pick<ActType, "step" | "grant">): ActType => act({ on: "note", ...a });
/** One note with a detached body, an act that writes it, one that redacts it, one that sends it to a lane, and one that is presented a `write` entry. */
export const notes: DeclaredDefinition = {
  format: "artroom-definition-1", name: "notes", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    note: {
      many: true, max: 8, states: { kept: { final: false }, struck: { final: true } }, initial: "kept", parties: {},
      refs: { peer: { fixed: false, required: false, to: { type: "scope", kind: "lane" } } },
      values: { body: { fixed: false, required: false, of: body }, title: { fixed: false, required: false, of: { type: "text", max: 40 } } },
    },
  },
  acts: {
    start: noted({ step: "open", grant: "start" }),
    write: noted({ step: "transition", grant: "write", fields: { body: { ...body, required: true }, title: { type: "text", max: 40, required: false } }, guards: [{ state: ["kept"] }], effects: [{ value: { slot: "body", from: { field: "body" } } }] }),
    strike: noted({ step: "transition", grant: "strike", guards: [{ state: ["kept"] }], effects: [{ state: "struck" }, { redact: { slot: "body" } }] }),
    tell: noted({ step: "transition", grant: "write", guards: [{ state: ["kept"] }], sends: [{ tell: { to: { slot: "peer" }, message: "noted", fields: { body: { slot: "body" } }, result: {} } }] }),
    vouch: noted({ step: "transition", grant: "write", presents: { proof: { kind: ["write"], under: "notes", required: true } }, guards: [{ state: ["kept"] }, { fact: { presented: "proof" } }] }),
  },
  receives: {}, timed: {}, rules: {},
};
export const notesDefinition = valid(validateDefinition(notes, PROPOSED_BOUNDS));

// ---------------------------------------------------------------- a parent and its child

/**
 * A ticket: the lane a desk creates. Its genesis refuses the title "refuse",
 * and sends its creator an index row.
 * `link` and `unlink` send the two updates of one relationship key; the
 * handler for the relationship `closes` writes the update's state on the
 * lane's one intent, and keeps a copy for two keys. A link may name the
 * entry that filed a ticket as its cause, which the receiver fetches. `ask`
 * tells the desk to make another ticket, and `split` creates one itself,
 * under its own definition. `approve` is under a rule: its signer is not the
 * requester.
 */
const filed = { type: "fact", kind: ["file"], under: "ticket" } as const;
export const ticket: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "ticket",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "file",
  items: {
    intent: {
      many: false, max: 1, states: { open: { final: false }, closed: { final: true } }, initial: "open",
      parties: { requester: { fixed: true, required: true, list: false, author: false } }, refs: {}, values: { title: { ...slot, of: text }, linked: { ...slot, of: text } },
    },
    link: {
      many: true, max: 3, states: { set: { final: false }, removed: { final: true } }, initial: "set", parties: {},
      refs: { target: { fixed: true, required: true, to: { type: "scope", kind: "lane" } }, me: { fixed: true, required: true, to: { type: "item", of: "link" } } }, values: {},
    },
    request: {
      many: true, max: 4, states: { asked: { final: false }, answered: { final: true }, failed: { final: true } }, initial: "asked", parties: {},
      refs: { desk: { fixed: true, required: true, to: { type: "scope", kind: "directory" } } }, values: {},
    },
    part: { many: true, max: 4, states: { asked: { final: false }, created: { final: true }, refused: { final: true } }, initial: "asked", parties: {}, refs: {}, values: {} },
  },
  acts: {
    file: act({
      step: "open", on: "intent", grant: "file", fields: { title: { ...text, required: true }, opener: { type: "member", required: true } },
      guards: [{ differs: { a: { field: "title" }, b: { const: "refuse" } } }],
      effects: [{ party: { slot: "requester", from: { field: "opener" } } }, { value: { slot: "title", from: { field: "title" } } }],
      sends: [{ index: { fields: { title: { field: "title" } } } }],
    }),
    link: act({
      step: "open", on: "link", grant: "link", fields: { target: { type: "scope", kind: "lane", required: true }, about: { type: "int", min: 0, max: 1000, required: true }, because: { ...filed, required: false } },
      effects: [{ ref: { slot: "target", from: { field: "target" } } }, { ref: { slot: "me", from: "self" } }],
      sends: [{ relate: { to: { field: "target" }, name: "closes", item: "self", state: "set", detail: { about: { field: "about" }, because: { field: "because" } }, result: {} } }],
    }),
    unlink: act({
      step: "transition", on: "link", grant: "link", guards: [{ state: ["set"] }], effects: [{ state: "removed" }],
      sends: [{ relate: { to: { slot: "target" }, name: "closes", item: { slot: "me" }, state: "removed", detail: { about: { const: 0 } }, result: {} } }],
    }),
    ask: act({
      step: "open", on: "request", grant: "ask", fields: { desk: { type: "scope", kind: "directory", required: true } },
      effects: [{ ref: { slot: "desk", from: { field: "desk" } } }],
      sends: [{ tell: { to: { slot: "desk" }, message: "spawn", fields: { opener: { signer: true }, title: { const: "same" } }, result: { applied: [{ state: "answered" }], undelivered: [{ state: "failed" }] } } }],
    }),
    approve: act({ step: "transition", on: "intent", grant: "approve", guards: [{ state: ["open"] }, { rule: "two-eyes" }], effects: [{ state: "closed" }] }),
    // A part of this ticket is a ticket of its own, created under this scope's own definition.
    split: act({
      step: "open", on: "part", grant: "split", fields: { title: { ...text, required: true } },
      sends: [{ create: { kind: "lane", definition: "self", fields: { opener: { signer: true }, title: { field: "title" } }, result: { applied: [{ state: "created" }], refused: [{ state: "refused" }] } } }],
    }),
  },
  receives: {
    closes: {
      message: "closes", class: "relate", from: { kind: "lane" }, copies: 2, opens: null,
      fields: { about: { type: "int", min: 0, max: 1000, required: true }, because: { ...filed, required: false } },
      also: { intent: { item: "intent", one: true } }, guards: [],
      effects: [{ of: "also.intent", value: { slot: "linked", from: { update: "state" } } }], sends: [], attention: [],
    },
  },
  timed: {},
  rules: { "two-eyes": "signer.member != subjects.on.parties.requester.member" },
};
export const ticketDefinition = valid(validateDefinition(ticket, PROPOSED_BOUNDS));

const makeTicket = { kind: "lane", definition: ticketDefinition.digest } as const;

/**
 * A desk: a directory. `open-issue` creates a ticket, and each clause of the
 * creation moves the issue. The handler for `spawn` creates a ticket for a
 * lane that asks. The handler for `echo` sends two updates that resolve to
 * one relationship key when its two fields name one item.
 */
export const desk: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "desk",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "found",
  items: {
    repo: { many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: {}, refs: {}, values: { source: { fixed: true, required: true, of: text } } },
    issue: {
      many: true, max: 8, states: { asked: { final: false }, created: { final: false }, refused: { final: true }, conflicted: { final: true } }, initial: "asked",
      parties: {}, refs: {}, values: { title: { ...slot, of: text } },
    },
  },
  acts: {
    found: act({ step: "open", on: "repo", grant: "found", fields: { source: { ...text, required: true } }, effects: [{ value: { slot: "source", from: { field: "source" } } }] }),
    "open-issue": act({
      step: "open", on: "issue", grant: "open-issue", fields: { title: { ...text, required: true } }, effects: [{ value: { slot: "title", from: { field: "title" } } }],
      sends: [{ create: { ...makeTicket, fields: { opener: { signer: true }, title: { field: "title" } }, result: { applied: [{ state: "created" }], refused: [{ state: "refused" }], conflict: [{ state: "conflicted" }] } } }],
    }),
  },
  receives: {
    spawn: {
      message: "spawn", class: "tell", from: { kind: "lane" }, opens: null, also: {}, guards: [], effects: [], attention: [],
      fields: { opener: { type: "member", required: true }, title: { ...text, required: true } },
      sends: [{ create: { ...makeTicket, fields: { opener: { field: "opener" }, title: { field: "title" } }, result: {} } }],
    },
    echo: {
      message: "echo", class: "tell", from: { kind: "lane" }, opens: null, also: {}, guards: [], effects: [], attention: [],
      fields: { peer: { type: "scope", kind: "lane", required: true }, a: { type: "item", of: "repo", required: true }, b: { type: "item", of: "repo", required: true } },
      sends: (["a", "b"] as const).map((item) => ({ relate: { to: { field: "peer" }, name: "mirrors", item: { field: item }, state: "set", detail: {}, result: {} } })),
    },
  },
  timed: {},
  rules: {},
};
export const deskDefinition = valid(validateDefinition(desk, PROPOSED_BOUNDS));

// ---------------------------------------------------------------- a scope in memory

/** A stand-in: these grants carry no freshness proof, as the first delivery's judges take every recorded grant as current. Its bytes are `null`, so no digest here moves. */
const NO_PROOF = null as unknown as ObservationUse;

/** A grant of every action of the definition to that actor's key, in that scope. A test authority, and named as one. */
export function grantOf(who: Actor, within: ScopeRef, actions: readonly string[], notAfter: Timestamp | null = null): Grant {
  return { issued: { at: membership, seq: 3, hash: d("3") }, subject: who.member, key: who.key, principal: who.principal, actions, within, notAfter, fresh: NO_PROOF };
}

export type Over = Partial<Pick<Intent, "on" | "expected" | "fields" | "idempotencyKey" | "notAfter" | "to" | "kind">>;
export type Context = Partial<Omit<JudgeContext, "clock">> & { reading?: Timestamp };

/**
 * One scope's history and state in memory. It does what a commit does: judge
 * at one reading, seal, hash, fold. `under` is the name a reader of this
 * scope gives its definition: the name the definition states.
 */
export class Ledger {
  readonly state = new MemoryState();
  readonly entries: { entry: Entry; hash: Digest }[] = [];
  /** The reading of the next commit. */
  now: Timestamp = T0;
  bounds: Bounds = PROPOSED_BOUNDS;
  #keys = 0;

  constructor(readonly definition: ValidDefinition, readonly under = definition.declared.name) {}

  get at() { return this.state.scope()!.at; }
  get head() { return this.state.scope()!.head; }
  get last() { return this.entries.at(-1)!.entry; }
  item(id: number) { return this.state.item(id)!; }
  /** This scope's own entry at a position, as a commit reads it from its history. */
  readonly own = (seq: number) => this.entries[seq] ?? null;
  /** The fact of a sealed entry: a view beside it. */
  fact(seq: number): FactRef { return { at: this.at, seq, hash: this.entries[seq]!.hash }; }
  fold(entry: Entry): Entry {
    const hash = entryHash(entry);
    applyEntry(this.state, this.definition, entry, hash);
    this.entries.push({ entry, hash });
    return entry;
  }
  seal(draft: Draft, reading: Timestamp = this.now): Entry {
    return this.fold(entryOf(this.state, draft, clockOf(this.state, reading)));
  }

  /** An intent to this scope, with a new idempotency key, admissible for a minute from `now`. */
  intent(who: Actor, kind: string, over: Over = {}): SignedIntent {
    const intent: Intent = { v: 1, to: this.at, actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `k${this.#keys++}`, notAfter: timeOf(timeMs(this.now)! + 60_000), ...over };
    return signIntent(intent, who.secret);
  }
  /** Every actor of the key set holds every action here, unless the test presents other grants. */
  grants(): Presented[] {
    // In platform data the `grant` of an act may be a mark, which names no action.
    const actions = Object.values(this.definition.declared.acts).map((a) => a.grant).filter((action) => typeof action === "string");
    return Object.values(keys).map((who) => ({ grant: grantOf(who, this.at, actions), current: true }));
  }
  context(over: Context = {}): JudgeContext {
    const { reading, ...rest } = over;
    return { clock: clockOf(this.state, reading ?? this.now), grants: this.grants(), facts: [], prepared: [], bounds: this.bounds, own: this.own, ...rest };
  }
  /** Judge only: nothing is written. */
  judge(signed: SignedIntent, over: Context = {}): ActJudgment {
    return judgeAct(this.state, this.definition, signed, this.context(over));
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
    return this.last;
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
  /** The first `count` entries, or all, folded again into a new state, as a verifier does. */
  replay(count = this.entries.length): MemoryState {
    const fresh = new MemoryState();
    for (const { entry, hash } of this.entries.slice(0, count)) applyEntry(fresh, this.definition, entry, hash);
    return fresh;
  }
}

/**
 * A lane created by a directory and confirmed, with both entries made by
 * hand: its genesis opened item 0 for `opener` (entry 0) and its creator's
 * confirmation made it active (entry 1), both at T0. `ordinal` tells two
 * such lanes apart.
 */
export class Scope extends Ledger {
  constructor(definition: ValidDefinition, opener: MemberRef = keys.rita.member, confirmed = true, ordinal = 0) {
    super(definition);
    const declared = definition.declared;
    const type = declared.acts[declared.genesis]!.on!;
    const seed: Seed = { v: 1, kind: "lane", definition: definition.digest, creator: directory, cause: d("c"), ordinal };
    const at: ScopeRef = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(9 + ordinal)), kind: "lane" };
    const source = { at: directory, seq: 17, hash: d("7") };
    const message = { class: "request", type: "create", body: { fields: { opener } } } as const;
    const slot = Object.keys(declared.items[type]!.parties)[0]!;
    this.fold({
      v: 1, at, seq: 0, prev: null, time: T0, clamped: false, epoch: 0,
      input: { type: "genesis", seed, inc: at.inc, kind: declared.genesis, founding: null, source, n: 0, message, decision: "applied" }, uses: [], prepared: [],
      effects: [{ effect: "open", item: 0, type, state: declared.items[type]!.initial }, { effect: "party", item: 0, slot, member: opener }],
      sends: [{ n: 0, to: directory, message: { class: "result", of: { from: source, n: 0 }, outcome: "applied" } }],
    });
    if (confirmed) {
      this.fold({
        v: 1, at, seq: 1, prev: this.head.hash, time: T0, clamped: false, epoch: 0,
        input: { type: "delivery", from: { at: directory, seq: 18, hash: d("8") }, n: 0, message: { class: "control", type: "confirm", genesis: this.fact(0) } },
        uses: [], prepared: [], effects: [{ effect: "activate" }], sends: [],
      });
    }
  }
}

// ---------------------------------------------------------------- entries passed between scopes

/**
 * A directory founded by rita's signed intent (section 7.1): its genesis is judged, sealed and folded. `definition`: the desk, or
 * a desk with a change, or with `given` another definition and the fields of its genesis act. `key` tells two foundings apart.
 */
export function founded(definition: ValidDefinition = deskDefinition, given: Intent["fields"] = { source: "a repository" }, key = "found"): Ledger {
  const ledger = new Ledger(definition);
  const founding = signIntent({ v: 1, to: null, actor: keys.rita.key, kind: "found", on: null, expected: {}, fields: given, idempotencyKey: key, notAfter: t(60) }, keys.rita.secret);
  const seed: Seed = { v: 1, kind: "directory", definition: definition.digest, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
  const context = { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null };
  const judgment = judgeGenesis(ledger.state, definition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(1)), seed, founding }, context);
  if (judgment.result !== "write") throw new Error(`the directory was not founded: ${JSON.stringify(judgment)}`);
  ledger.seal(judgment.draft);
  return ledger;
}

/** Send `n` of entry `seq` of `from`, as it arrives, and the source entry as the receiver reads it. */
export function sent(from: Ledger, seq: number, n = 0): { delivered: Delivered; source: Source } {
  const { entry } = from.entries[seq]!;
  const send = entry.sends.find((s) => s.n === n)!;
  return { delivered: { to: send.to, from: from.fact(seq), n, message: send.message }, source: { entry, under: from.under } };
}

/** What a test changes in a delivery: the envelope, or the source entry that is read. */
export type Arrival = Partial<Delivered> & { source?: Source | null };

/** The context of a delivery to `to`: the source entry, the foreign entries that were fetched, and for a result this scope's own entry that sent the request. */
export function arriving(to: Ledger, delivered: Delivered, source: Source | null, facts: readonly Fetched[] = []): DeliveryContext {
  const of = delivered.message.class === "result" ? delivered.message.of : null;
  return { clock: clockOf(to.state, to.now), bounds: to.bounds, facts, prepared: [], own: to.own, source, origin: of ? (to.entries[of.from.seq]?.entry ?? null) : null };
}

/**
 * Judge the delivery of that send to `to`. Nothing is written. As a receiver
 * does before its turn, this fetches the foreign entries that the message's
 * declared fields name. It can read only the sender's history.
 */
export function judged(to: Ledger, from: Ledger, seq: number, n = 0, over: Arrival = {}): Judgment {
  const { delivered, source } = sent(from, seq, n);
  const { source: read = source, ...envelope } = over;
  const arrival = { ...delivered, ...envelope };
  const message = arrival.message;
  const named = message.class === "request" || message.class === "advisory" ? messageFacts(to.state, to.definition, message, arrival.from, to.bounds, read?.under ?? from.under) : [];
  const facts = named.flatMap((fact): Fetched[] => (fact.at.scope === from.at.scope && from.entries[fact.seq] ? [{ fact, entry: from.entries[fact.seq]!.entry, under: from.under }] : []));
  return judgeDelivery(to.state, to.definition, arrival, arriving(to, arrival, read, facts));
}

/** Judge it, and write the entry if the judgment is to write. */
export function deliver(to: Ledger, from: Ledger, seq: number, n = 0): Judgment {
  const judgment = judged(to, from, seq, n);
  if (judgment.result === "write") to.seal(judgment.draft);
  return judgment;
}

/** The creation that send `n` of entry `seq` of `from` asks for, as it reaches the object its seed names. `mint` makes the incarnation. */
export function creation(from: Ledger, seq: number, n = 0, mint = 20): { asked: Creation; source: Source } {
  const { delivered, source } = sent(from, seq, n);
  const seed = delivered.to as Seed;
  return { asked: { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(mint)), to: seed, from: delivered.from, n, message: delivered.message as Creation["message"] }, source };
}

/** A new store that receives that creation: the child's genesis is judged and, if it is to be written, sealed. */
export function born(from: Ledger, seq: number, n = 0, mint = 20): { child: Ledger; judgment: Judgment } {
  const child = new Ledger(ticketDefinition);
  const { asked, source } = creation(from, seq, n, mint);
  const judgment = judgeGenesis(child.state, ticketDefinition, asked, { clock: clockOf(child.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source });
  if (judgment.result === "write") child.seal(judgment.draft);
  return { child, judgment };
}

/** An entry made by hand, as a source that some scope might return: it has a hash, and nothing judged it. */
export function forged(at: ScopeRef, seq: number, input: Input, sends: readonly Send[]): Source {
  return { entry: { v: 1, at, seq, prev: d("0"), time: T0, clamped: false, epoch: 0, input, uses: [], prepared: [], effects: [], sends }, under: "ticket" };
}

let made = 100;
/**
 * A message from an entry of `from` that is made by hand, delivered to `to`.
 * The entry holds that one send, and nothing judged it. `input`: what the
 * entry says it recorded. `facts`: the foreign entries that were fetched for
 * the delivery. The receiver's entry is written if the judgment is to write.
 */
export function arrive(to: Ledger, from: Ledger, message: Send["message"], input: Input = from.entries[1]!.entry.input, facts: readonly Fetched[] = []): Judgment {
  const send: Send = { n: 0, to: to.at, message };
  const source = forged(from.at, ++made, input, [send]);
  const arrival = { ...send, from: factRefOf(source.entry) };
  const judgment = judgeDelivery(to.state, to.definition, arrival, arriving(to, arrival, source, facts));
  if (judgment.result === "write") to.seal(judgment.draft);
  return judgment;
}

/** The decision of the request that the last entry of `s` decided, and the code of the reason on its result. */
export function decided(s: Ledger): string[] {
  const result = s.last.sends.at(-1)!.message;
  if (result.class !== "result") throw new Error("the last entry decided no request");
  return result.reason ? [result.outcome, result.reason.code] : [result.outcome];
}

/** Short forms for a transition's `on` with its expected revision, and for fields. */
export const on = (scope: Ledger, id: number, also: Record<string, number> = {}): Over => ({
  on: id, expected: { on: scope.item(id).revision, ...Object.fromEntries(Object.entries(also).map(([name, other]) => [name, scope.item(other).revision])) },
});
export const fields = (f: Record<string, FieldValue>): Over => ({ fields: f });
