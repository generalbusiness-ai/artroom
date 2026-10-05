/**
 * A compile check, not a runtime test. It writes the four entries of the
 * scope contract's section 7.2 (a directory creates an issue lane) and the
 * views beside them. If a type drifts from the contract, this file stops
 * compiling. The digests and names are made up.
 */

import type { AdoptedReceiveType, Answer, DeclaredDefinition, DeliveryCause, Digest, DutyId, Entry, Envelope, FactRef, Grant, Intent, MemberRef, Read, Receipt, Report, ScopeRef, Seed } from "../src/index.ts";
import { DOMAINS, PROPOSED_BOUNDS, type Bounds, type DomainTag } from "../src/index.ts";

const d = (c: string): Digest => `sha256:${c.repeat(64)}`;
const time = "2026-10-04T12:00:00Z";

const membership: ScopeRef = { scope: "sc_membership", inc: "in_m", kind: "membership" };
const directory: ScopeRef = { scope: "sc_directory", inc: "in_d", kind: "directory" };
const opener: MemberRef = { membership, member: "@alice" };

const intent: Intent = {
  v: 1, to: directory, actor: "key_alice", kind: "open-issue", on: null, expected: {},
  fields: { title: "A flaky test" }, idempotencyKey: "k1", notAfter: "2026-10-04T12:15:00Z",
};
const grant: Grant = {
  issued: { at: membership, seq: 3, hash: d("3") }, subject: opener, key: "key_alice", principal: null,
  actions: ["open-issue"], within: directory, notAfter: null, fresh: null,
};

// Step 1. D.17, an act. It sends a creation, addressed by a seed.
const seed: Seed = { v: 1, kind: "lane", definition: d("e"), creator: directory, cause: d("a"), ordinal: 0 };
const d17: Entry = {
  v: 1, at: directory, seq: 17, prev: d("6"), time, clamped: false, epoch: 0,
  input: { type: "act", signed: { intent, sig: "c2ln" }, authority: [grant] },
  uses: [], prepared: [],
  effects: [{ effect: "open", item: 17, type: "issue", state: "allocated" }],
  sends: [{ n: 0, to: seed, message: { class: "request", type: "create", body: { opener, title: "A flaky test" } } }],
};
const d17Fact: FactRef = { at: directory, seq: 17, hash: d("7") };

// Step 2. I.0, the child's genesis. Provisional.
const lane: ScopeRef = { scope: "sc_issue", inc: "in_i", kind: "lane" };
const i0: Entry = {
  v: 1, at: lane, seq: 0, prev: null, time, clamped: false, epoch: 0,
  input: { type: "genesis", seed, inc: lane.inc, founding: null, source: d17Fact, n: 0,
           message: { class: "request", type: "create", body: { opener, title: "A flaky test" } }, decision: "applied" },
  uses: [], prepared: [],
  effects: [{ effect: "open", item: 0, type: "intent", state: "open" }, { effect: "party", item: 0, slot: "requester", member: opener }],
  sends: [{ n: 0, to: directory, message: { class: "result", of: { from: d17Fact, n: 0 }, outcome: "applied" } }],
};
const i0Fact: FactRef = { at: lane, seq: 0, hash: d("0") };

// Step 3. D.18, the delivery of the result. Its `applied` clause runs, and it sends the confirmation.
const d18: Entry = {
  v: 1, at: directory, seq: 18, prev: d17Fact.hash, time, clamped: false, epoch: 0,
  input: { type: "delivery", from: i0Fact, n: 0, message: { class: "result", of: { from: d17Fact, n: 0 }, outcome: "applied" }, clause: "applied" },
  uses: [], prepared: [],
  effects: [{ effect: "state", item: 17, state: "created" }, { effect: "ref", item: 17, slot: "lane", to: lane }],
  sends: [{ n: 0, to: lane, message: { class: "control", type: "confirm", genesis: i0Fact } }],
};
const d18Fact: FactRef = { at: directory, seq: 18, hash: d("8") };

// Step 4. I.1, the delivery of the confirmation. The scope becomes active.
const i1: Entry = {
  v: 1, at: lane, seq: 1, prev: i0Fact.hash, time, clamped: false, epoch: 0,
  input: { type: "delivery", from: d18Fact, n: 0, message: { class: "control", type: "confirm", genesis: i0Fact } },
  uses: [], prepared: [], effects: [{ effect: "activate" }], sends: [],
};

// The views, built after sealing.
const duty: DutyId = "17.0";
const envelope: Envelope = { to: "sc_issue", from: d17Fact, n: 0, message: d17.sends[0]!.message };
const receipt: Receipt = { fact: d17Fact, definition: "platform:directory@1", intent: d("a"), effects: d17.effects, sends: [duty], epoch: 0 };
const accepted: Answer = { answer: "accepted", receipt };
const refused: Answer = { answer: "refused", reason: "revision-moved", judgedAt: { seq: 18, hash: d18Fact.hash } };
const settled: Read<Receipt> = { ok: true, at: { seq: 18, hash: d18Fact.hash }, value: receipt, complete: true };

// A delivery whose handler creates a scope names its cause by the source fact, not the message alone.
const cause: DeliveryCause = { v: 1, from: d17Fact, n: 0, message: d("b") };

const report: Report = {
  mode: "replay", target: d18Fact, coverage: [{ scope: directory, from: 0, through: 18 }, { scope: lane, from: 0, through: 1 }],
  anchors: [], dependencies: { verified: 2, anchored: 0, missing: [] }, trusts: ["service clock"], result: "consistent",
};

// A small lane definition using a guard, an effect, a send and an attention form of each kind of shape.
const definition: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "issue",
  profile: { name: "restricted", version: 1 },
  capabilities: [{ name: "hold", version: 1 }],
  genesis: "file",
  items: {
    intent: {
      many: false, max: 1, states: { open: { final: false }, closed: { final: true } }, initial: "open",
      parties: { requester: { fixed: true, required: true, list: false, author: true } },
      refs: { titledAt: { fixed: false, required: true, to: { type: "fact", kind: ["file", "retitle"], under: "issue" } } },
      values: { title: { fixed: false, required: true, of: { type: "text", max: 200 } } },
    },
    link: { many: true, max: 32, states: { set: { final: false }, removed: { final: true } }, initial: "set", parties: {}, refs: { target: { fixed: true, required: true, to: { type: "scope", kind: "lane" } } }, values: {} },
  },
  acts: {
    file: {
      step: "open", on: "intent", also: {}, grant: "file",
      fields: { title: { type: "text", max: 200, required: true }, opener: { type: "member", required: true } },
      guards: [],
      effects: [{ party: { slot: "requester", from: { field: "opener" } } }, { value: { slot: "title", from: { field: "title" } } }, { ref: { slot: "titledAt", from: "self" } }],
      sends: [{ index: { fields: { title: { field: "title" } } } }],
      attention: [],
    },
    // The forms of revision 8: a local fact compared with a slot that was set from `self`, a part of a fetched entry, and a named refusal.
    close: {
      step: "transition", on: "intent", also: { last: { item: "link", one: true } }, grant: "close",
      fields: { titled: { type: "fact", kind: ["file", "retitle"], under: "issue", required: true }, answer: { type: "fact", kind: ["answer"], under: "issue", required: false } },
      guards: [
        { state: ["open"] }, { signer: ["requester"] }, { none: { type: "link", states: ["set"], except: ["also.last"] } },
        { equals: { a: { field: "titled" }, b: { slot: "titledAt" } }, reason: "title-moved" },
        { equals: { a: { field: "answer", part: "on" }, b: { slot: "titledAt", part: "seq" } }, ifPresent: true, reason: "not-this-ask" },
        { anyOf: [[{ unset: "titledAt" }], [{ each: { list: { field: "titled", part: { opened: "watchers" } }, as: "w", guards: [{ differs: { a: { element: "w" }, b: { signer: true } } }] } }]] },
      ],
      effects: [{ state: "closed" }],
      sends: [],
      attention: [{ notify: { slot: "requester", of: "on", when: "after", reason: "closed" } }],
    },
    link: {
      step: "open", on: "link", also: {}, grant: "link",
      fields: { target: { type: "scope", kind: "lane", required: true } },
      guards: [{ of: "scope", count: { type: "link", states: ["set"], max: 31 } }],
      effects: [{ ref: { slot: "target", from: { field: "target" } } }],
      sends: [{ relate: { to: { field: "target" }, name: "closes", item: "self", state: "set", detail: {}, result: { refused: [{ state: "removed" }] } } }],
      attention: [],
    },
  },
  receives: {
    closes: {
      message: "closes", class: "relate", from: { kind: "lane", under: "change" }, fields: { about: { type: "int", min: 0, max: 1000, required: true } }, opens: null, copies: 32,
      also: { intent: { item: "intent", one: true } },
      guards: [{ equals: { a: { update: "state" }, b: { const: "merged" } } }],
      effects: [{ of: "also.intent", state: "closed", if: [{ of: "also.intent", state: ["open"] }] }, { of: "also.intent", ref: { slot: "titledAt", from: null }, unless: [{ of: "also.intent", state: ["open"] }] }],
      sends: [], attention: [],
    } satisfies AdoptedReceiveType,
  },
  timed: {},
  rules: {},
};

const tag: DomainTag = DOMAINS.entry;
const bounds: Bounds = PROPOSED_BOUNDS;

export const witnesses = { d17, i0, d18, i1, envelope, accepted, refused, settled, cause, report, definition, tag, bounds };
