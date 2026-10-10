import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition, type ScopeKind } from "@generalbusiness/artroom-contract";
import { canonicalize, isSeed } from "@generalbusiness/artroom-bytes";
import { clockOf, judgeGenesis, validateDefinition, type ValidDefinition } from "../src/index.ts";
import { Ledger, T0, creation, deliver, founded, keys, valid } from "./fixtures.ts";

// Pure judge/send boundary. Parent metadata and authority are SCRIPTED in a
// draft before it seals; no native emitter/membership/session proof is claimed.
const create = { create: { kind: "lane" as const, definition: "self" as const, fields: { creationContext: { const: { v: 99 } } }, result: {} } };
const row = { step: "open" as const, on: "root", grant: "open", also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [] };
const declared: DeclaredDefinition = {
  format: "artroom-definition-1", name: "context-child", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "open",
  items: { root: { many: false, max: 1, initial: "ready", states: { ready: { final: false } }, parties: {}, refs: {}, values: {} } },
  acts: {
    open: { ...row, fields: { creationContext: { type: "record", of: { v: { type: "int", min: 1, max: 99, required: true } }, required: false } }, sends: [create] },
    spawn: { ...row, step: "transition", sends: [create] },
  }, receives: {}, timed: {}, rules: {},
};
const definition = valid(validateDefinition(declared, PROPOSED_BOUNDS));
const membership = keys.rita.member.membership;

function receive(from: Ledger, seq: number, n: number, under = definition) {
  const { asked, source } = creation(from, seq, n);
  const child = new Ledger(under);
  const judgment = judgeGenesis(child.state, under, asked, { clock: clockOf(child.state, T0), bounds: child.bounds, facts: [], prepared: [], source });
  if (judgment.result === "write") child.seal(judgment.draft);
  return { child, judgment, asked, source };
}
function incoming(metadata: Record<string, unknown>, under = definition, kind: ScopeKind = "lane") {
  const parentDefinition = valid(validateDefinition({ ...declared, name: "context-parent", acts: {
    open: row, spawn: { ...row, step: "transition", sends: [{ create: { ...create.create, kind, definition: under.digest } }] },
  } }, PROPOSED_BOUNDS));
  const parent = founded(parentDefinition, {});
  const result = parent.judge(parent.intent(keys.rita, "spawn", { on: 0, expected: { on: parent.item(0).revision } }));
  if (result.result !== "write") throw new Error(`scripted parent create was ${result.result}${"reason" in result ? `: ${result.reason}` : ""}`);
  const send = result.draft.sends[0];
  if (!send || !isSeed(send.to) || send.message.class !== "request" || send.message.type !== "create") throw new Error("the actual drafted send is a creation");
  const body = send.message.body as Record<string, unknown>;
  parent.seal({ ...result.draft, sends: [{ ...send, message: { ...send.message, body: { ...body, ...metadata } } }] });
  return { parent, ...receive(parent, 1, 0, under) };
}
function bodyOf(child: Ledger, seq = 0, n = 1) {
  const message = child.entries[seq]!.entry.sends.find((send) => send.n === n)!.message;
  if (message.class !== "request" || message.type !== "create") throw new Error("the selected native form is a creation");
  return message.body;
}
function confirm(parent: Ledger, child: Ledger) {
  expect(deliver(parent, child, 0, 0).result).toBe("write");
  expect(deliver(child, parent, parent.last.seq, 0).result).toBe("write");
}

test("unmarked genesis create bytes stay legacy even with incoming membership or a domain creationContext; later creates keep their old retained-genesis membership", () => {
  const { parent, child, judgment } = incoming({ membership });
  expect(judgment.result).toBe("write");
  const legacy = { fields: { creationContext: { v: 99 } }, directory: parent.at };
  expect(canonicalize(bodyOf(child))).toBe(canonicalize(legacy));
  confirm(parent, child);
  child.did(keys.rita, "spawn", { on: 0, expected: { on: child.item(0).revision } });
  expect(canonicalize(bodyOf(child, child.last.seq, 0))).toBe(canonicalize({ ...legacy, membership }));
});

test("recognized verified-context metadata and the same full membership flow through two genesis edges and a later actual retained-genesis create", () => {
  const { parent, child, judgment } = incoming({ creationContext: { v: 1 }, membership });
  expect(judgment.result).toBe("write");
  const marked = { fields: { creationContext: { v: 99 } }, directory: parent.at, membership, creationContext: { v: 1 } };
  expect(bodyOf(child)).toEqual(marked);
  const nested = receive(child, 0, 1).child;
  expect(bodyOf(nested)).toEqual(marked);
  confirm(parent, child);
  child.did(keys.rita, "spawn", { on: 0, expected: { on: child.item(0).revision } });
  expect(bodyOf(child, child.last.seq, 0)).toEqual(marked);
  expect(child.act(keys.rita, "spawn", { on: 0, expected: { on: child.item(0).revision } }, { own: () => null })).toMatchObject({ result: "unavailable" });
});

test("unknown or malformed opt-in and marked missing/invalid full membership record bad-field refusal with only the native result; source-message proof and typed lower bounds still hold", () => {
  for (const metadata of [{ creationContext: { v: 2 }, membership }, { creationContext: { v: 1, other: true }, membership }, { creationContext: { v: 1 } }, { creationContext: { v: 1 }, membership: { ...membership, kind: "lane" } }, { creationContext: { v: 1 }, membership, fields: { creationContext: { v: 0 } } }]) {
    const { child, judgment, asked, source } = incoming(metadata);
    expect(judgment).toMatchObject({ result: "write", draft: { input: { decision: "refused" }, sends: [{ n: 0, message: { class: "result", outcome: "refused", reason: { code: "bad-field" } } }] } });
    expect(child.last.sends).toHaveLength(1);
    const empty = new Ledger(definition);
    expect(judgeGenesis(empty.state, definition, { ...asked, message: { ...asked.message, body: {} } }, { clock: clockOf(empty.state, T0), bounds: empty.bounds, facts: [], prepared: [], source })).toMatchObject({ result: "source-unverified" });
  }
});

test("marked declared genesis does not stamp a platform creation, and membership-self retains its own full reference without a stamp", () => {
  const platform: ValidDefinition = valid(validateDefinition({ ...declared, acts: { ...declared.acts, open: { ...declared.acts["open"]!, sends: [{ create: { kind: "rules", definition: "platform:rules@2", fields: {}, result: {} } }] } } }, PROPOSED_BOUNDS));
  const received = incoming({ creationContext: { v: 1 }, membership }, platform);
  expect(received.judgment.result).toBe("write");
  expect(bodyOf(received.child)).toEqual({ fields: {} });
  const self = incoming({ creationContext: { v: 1 }, membership }, definition, "membership");
  expect(bodyOf(self.child)).toEqual({ fields: { creationContext: { v: 99 } }, directory: self.parent.at, membership: self.child.at });
});
