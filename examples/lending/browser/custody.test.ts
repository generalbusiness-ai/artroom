import { expect, test } from "vitest";
import type { Answer, Receipt } from "@generalbusiness/dap-contract";
import { signIntent } from "@generalbusiness/artroom-bytes";
import { keys, t } from "@generalbusiness/dap-derive/testing";
import { LENDING_DEFINITION } from "../pin.ts";
import { advance, lendingBinding, validKept, type Envelope, type Kept, type KeptStore, type LendingIdentity, type Ports } from "./custody.ts";

// The scope is a STAND-IN here: `post`, `settle` and `recorded` are scripted. The signature is real.
const scope = { scope: "sc_lending", inc: "in_one", kind: "lane" } as unknown as LendingIdentity["scope"];
const who: LendingIdentity = { origin: "https://scopes.test", deployment: "test", scope, definition: LENDING_DEFINITION,
  membership: keys.una.member.membership, member: keys.una.member, publicKey: keys.una.key };
const identity = lendingBinding(who);
const envelope = (name = "Sieve", who = keys.una): Envelope => ({ grants: [], beside: {},
  signed: signIntent({ v: 1, to: scope, actor: who.key, kind: "donate", on: null, expected: {}, fields: { name, description: "Fine mesh." }, idempotencyKey: `k-${name}`, notAfter: t(60) }, who.secret) });
const kept = (phase: Kept["phase"], e = envelope()): Kept => ({ v: 1, kind: "donate", envelope: e, phase, ...(phase === "refused" ? { refusal: "type-full" } : {}) });
const receipt = { intent: "sha256:x" } as unknown as Receipt;
function bench(first: Kept | null) {
  let slot: string | null = first === null ? null : JSON.stringify(first);
  const calls: string[] = [];
  const store: KeptStore = { load: async () => slot === null ? null : JSON.parse(slot) as unknown, save: async (value) => { calls.push(`save ${value.phase}`); slot = JSON.stringify(value); }, clear: async () => { slot = null; } };
  const script: { post: () => Promise<Answer>; settle: Receipt | null; sound: boolean } = { post: async () => ({ answer: "accepted", receipt } as Answer), settle: null, sound: true };
  const ports: Ports = { current: () => true, post: () => { calls.push("post"); return script.post(); }, settle: async () => { calls.push("settle"); return script.settle; }, recorded: async () => { calls.push("recorded"); return script.sound; } };
  return { store, ports, script, calls, phase: () => slot === null ? null : (JSON.parse(slot) as Kept).phase };
}

test("a prepared request is marked inflight before its one send, and each answer leaves the mark that is true", async () => {
  const e = envelope();
  const accepted = bench(kept("prepared", e));
  expect(await advance(accepted.store, identity, accepted.ports, e)).toEqual({ status: "recorded" });
  expect(accepted.calls).toEqual(["save inflight", "post", "recorded", "save recorded"]);

  const refused = bench(kept("prepared", e));
  refused.script.post = async () => ({ answer: "refused", reason: "type-full" } as Answer);
  expect(await advance(refused.store, identity, refused.ports, e)).toEqual({ status: "refused", reason: "type-full" });
  expect(refused.phase()).toBe("refused");

  // An acceptance that the scope's record does not bear out is not a known result.
  const unsound = bench(kept("prepared", e));
  unsound.script.sound = false;
  expect(await advance(unsound.store, identity, unsound.ports, e)).toEqual({ status: "unknown" });
  expect(unsound.phase()).toBe("inflight");

  for (const post of [async () => { throw new Error("the reply was lost"); }, async () => ({ answer: "unavailable" } as Answer)]) {
    const lost = bench(kept("prepared", e));
    lost.script.post = post;
    expect(await advance(lost.store, identity, lost.ports, e)).toEqual({ status: "unknown" });
    expect([lost.phase(), lost.calls.filter((call) => call === "post")]).toEqual(["unknown", ["post"]]);
  }
});

test("a request that may have been sent is never sent again: only a read settles it", async () => {
  const e = envelope();
  for (const phase of ["inflight", "unknown"] as const) {
    const none = bench(kept(phase, e));
    expect(await advance(none.store, identity, none.ports, e)).toEqual({ status: "unknown" });
    expect([none.calls, none.phase()]).toEqual([["settle"], phase]);
    const matched = bench(kept(phase, e));
    matched.script.settle = receipt;
    expect(await advance(matched.store, identity, matched.ports, e)).toEqual({ status: "recorded" });
    expect(matched.calls).toEqual(["settle", "recorded", "save recorded"]);
  }
  // Check reads and sends nothing, even for a request that was certainly never sent.
  const unsent = bench(kept("prepared", e));
  expect(await advance(unsent.store, identity, unsent.ports, e, true)).toEqual({ status: "unknown" });
  expect([unsent.calls, unsent.phase()]).toEqual([["settle"], "prepared"]);
  // A final mark is reported as it stands, with no read and no send.
  const done = bench(kept("refused", e));
  expect(await advance(done.store, identity, done.ports, e)).toEqual({ status: "refused", reason: "type-full" });
  expect(done.calls).toEqual([]);
});

test("only this identity's whole lending request is taken from custody; anything else stays and nothing is sent", async () => {
  const e = envelope();
  expect(validKept(kept("prepared", e), identity)).toBe(true);
  const forged: Envelope = { ...e, signed: { ...e.signed, intent: { ...e.signed.intent, fields: { name: "Other", description: "Fine mesh." } } } };
  for (const bad of [
    null, { ...kept("prepared", e), v: 2 }, { ...kept("prepared", e), kind: "borrow" }, { ...kept("prepared", e), phase: "sent" },
    { ...kept("prepared", e), refusal: "x" }, { v: 1, kind: "donate", envelope: e, phase: "refused" }, { ...kept("prepared", e), extra: 1 },
    kept("prepared", forged), kept("prepared", envelope("Sieve", keys.vic)), kept("prepared", { ...e, beside: { texts: ["x"] } } as Envelope),
  ]) expect(validKept(bad, identity)).toBe(false);
  // The slot holds a different request than the one asked about.
  const other = bench(kept("prepared", envelope("Kettle")));
  expect(await advance(other.store, identity, other.ports, e)).toEqual({ status: "unknown" });
  expect([other.calls, other.phase()]).toEqual([[], "prepared"]);
  // The context ended: nothing is read, marked or sent.
  const ended = bench(kept("prepared", e));
  expect(await advance(ended.store, identity, { ...ended.ports, current: () => false }, e)).toEqual({ status: "unknown" });
  expect(ended.calls).toEqual([]);
});

// Explicit user authorization is separate from ordinary read-only recovery.
test("explicit Continue keeps the exact envelope after loss; storage or context failure stops its resend", async () => {
  const e = envelope();
  const lost = bench(kept("unknown", e));
  const sent: string[] = [];
  lost.ports.post = async request => { sent.push(JSON.stringify(request)); return { answer: "accepted", receipt } as Answer; };
  expect(await advance(lost.store, identity, lost.ports, e, false, true)).toEqual({ status: "recorded" });
  expect(sent).toEqual([JSON.stringify(e)]);
  expect(lost.calls).toEqual(["save inflight", "recorded", "save recorded"]);
  expect((await lost.store.load() as Kept).envelope).toEqual(e);
  // An explicit continuation cannot use a different signed request or a stale view.
  const other = bench(kept("unknown", e));
  expect(await advance(other.store, identity, other.ports, envelope("Kettle"), false, true)).toEqual({ status: "unknown" });
  expect(await advance(other.store, identity, { ...other.ports, current: () => false }, e, false, true)).toEqual({ status: "unknown" });
  expect(other.calls).toEqual([]);
  // A failed private mark means the original stays unknown and no send leaves the browser.
  const broken = bench(kept("unknown", e));
  broken.store.save = async () => { throw Error("private transaction did not commit"); };
  expect(await advance(broken.store, identity, broken.ports, e, false, true)).toEqual({ status: "unknown" });
  expect([broken.phase(), broken.calls]).toEqual(["unknown", []]);
});

// Path and text are already signed and kept. A lost reply and reload cannot regenerate either.
test("the exact signed page and a library publish survive a lost answer and read-only recovery", async () => {
 for (const kind of ["donate","publish"] as const) {
  const fields=kind === "donate" ? {name:"Sieve",description:"Fine mesh",page:"shelf/0102030405060708.md",content:"The exact signed text"} : {thing:7,content:"The exact repaired text"};
  const e:Envelope={grants:[],beside:{},signed:signIntent({v:1,to:scope,actor:keys.una.key,kind,on:kind === "publish" ? 0 : null,expected:kind === "publish" ? {on:1,thing:4} : {library:1},fields,idempotencyKey:`page-${kind}`,notAfter:t(60)},keys.una.secret)};
  const original:Kept={v:1,kind,envelope:e,phase:"prepared"}, b=bench(original), sent:string[]=[];
  b.ports.post=async exact=>{sent.push(JSON.stringify(exact));throw new Error("reply lost");};
  expect(validKept(original,identity)).toBe(true);
  expect(await advance(b.store,identity,b.ports,e)).toEqual({status:"unknown"});
  expect((await b.store.load() as Kept).envelope).toEqual(e);
  expect(await advance(b.store,identity,b.ports,e,true)).toEqual({status:"unknown"});
  expect(sent).toEqual([JSON.stringify(e)]);
  expect((await b.store.load() as Kept).envelope.signed.intent.fields).toEqual(fields);
 }
});
