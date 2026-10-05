import { describe, expect, test } from "vitest";
import type { Entry, FactRef, ScopeRef } from "@generalbusiness/artroom-contract";
import { factRefOf, intentDigest } from "@generalbusiness/artroom-bytes";
import { boundLicense, hasWorkspace, judgeDelivery, preparationStatus, recordEffects } from "../src/index.ts";
import type { Fetched } from "../src/index.ts";
import { arriving, d, decided, forged, keys, laneDefinition, otherLane, t, variant, lane } from "./fixtures.ts";
import { C, Staging, cap, clean, staging } from "./fixtures-hold.ts";

const { rita, una, vic } = keys;
const X = C("a");
/** A task scope's reference: made up. No task scope exists here. */
const task: ScopeRef = { ...otherLane, kind: "task" };
const shape = (entry: Entry | string) => (typeof entry === "string" ? entry : entry.effects.map((e) => (e.effect === "record" ? `${e.kind} ${e.state}` : e.effect === "operation" ? `opens ${e.kind} x${e.attempts}` : e.effect === "attempt" ? (e.result === "opened" ? `attempt ${e.attempt} opened` : e.result) : e.effect)));

describe("the records of `hold@1` (scope contract, section 6.11; authority note, sections 5.7 and 6.2)", () => {
  test("a staging is sealed before any outside write: `stage` makes a root `creating`, its confirmed read makes it `live` with a provisional pin, `check` writes the check record, the act consumes the pin once, and a refusal writes nothing (T21)", () => {
    const s = new Staging();
    // The hold's opening derived its fork, with a seed from the destination's head: the commitment has no admitted act yet.
    expect([s.record("fork", s.hold), s.state.operation("5:0")?.kind]).toEqual([{ state: "creating", seed: { commit: null, from: "destination-head", fact: null, under: 2 }, operation: "5:0", id: null, name: null }, "head"]);
    const source = { commitment: s.commitment, commit: X, hold: s.hold, instance: "i1" };
    const report = s.intent(una, "report", { expected: { commitment: s.item(s.commitment).revision }, fields: source });
    // A new staging needs the hold's current instance, and the signer's own held hold: a refusal is an answer and no entry.
    const head = s.head;
    expect([s.asked(report, "stage"), s.head]).toEqual(["refused capability-refused not-staged", head]);
    s.prepare(una, "instance", { hold: s.hold, task, instance: "i1" });
    expect([s.prepare(vic, "stage", source, { kind: "report" }), s.head.seq]).toEqual(["refused capability-refused not-staged", 6]);

    // Section 5.5: the preparation entry is the record, and it comes first. It holds the root, the operation and attempt 1, not sent yet.
    expect((s.asked(report, "stage") as Entry).effects).toEqual([
      { effect: "record", capability: "hold@1", kind: "root", key: [1], state: "creating", values: { commit: X, hold: s.hold, instance: "i1", under: 2, intent: intentDigest(report.intent), consumer: s.at, operation: "7:0" } },
      { effect: "operation", k: 0, owner: "hold@1", kind: "stage", attempts: 3 },
      { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
    ]);
    const judged = () => { const j = s.judge(report, { capabilities: cap }); return [j.result, "name" in j ? j.name : ""].join(" ").trim(); };
    // A refused attempt leaves the root `creating`. The read that shows the ref makes it `live`, records the pin and opens the check.
    expect([judged(), shape(s.outcome("7:0", "refused")), s.record("root", 1)?.state, shape(s.outcome("7:0", "confirmed", {}, "read", 2)), judged()]).toEqual([
      "refused not-staged", ["refused", "attempt 2 opened"], "creating", ["confirmed", "root live", "pin provisional", "opens check x1", "attempt 1 opened"], "refused not-staged",
    ]);
    // The check entry: the outcome of the one read, by that read's own answer, whose evidence is the ancestry record. Its record is what a presented pin carries.
    expect([shape(s.outcome("9:0", "confirmed", { record: clean(s.at, X, 1) })), s.record("check", intentDigest(report.intent), 1)]).toEqual([["confirmed", "check recorded"], {
      state: "recorded", intent: intentDigest(report.intent), commit: X, consumer: s.at, lane: s.at, hold: s.hold, instance: "i1", root: 1, attribution: [una.member, keys.paul.member], record: clean(s.at, X, 1),
    }]);
    expect(preparationStatus(s.state, s.own, intentDigest(report.intent))).toEqual([{ entry: s.fact(7), capability: "hold@1", step: "stage", operations: [{ operation: "7:0", kind: "stage", state: "settled" }], records: [{ kind: "root", key: [1], state: "live" }] }]);

    // The act finds its preparation by its own intent's digest, and its entry consumes it: the pin is `held`, with the admitting entry.
    expect(s.submit(report, { capabilities: cap }).result).toBe("write");
    expect([s.last.effects.at(-1), s.record("pin", s.at, intentDigest(report.intent))?.state]).toEqual([
      { effect: "record", capability: "hold@1", kind: "pin", key: [s.at, intentDigest(report.intent)], state: "held", values: { root: 1, commit: X, admitted: 11, released: null, by: null, check: "9:0" } }, "held",
    ]);
    // A consumed preparation is not consumed twice: the same intent finds no provisional pin, and another intent has none of its own.
    const given = s.given({ intent: intentDigest(report.intent) });
    const other = s.intent(una, "report", { expected: { commitment: s.item(s.commitment).revision }, fields: source });
    expect([cap.guard("hold@1", "staged", { commit: X, under: 2 }, given), cap.effect("hold@1", "pin-hold", { commit: X }, given), s.judge(other, { capabilities: cap }).result]).toEqual(["not-staged", [], "refused"]);
    // The reuse of the live root is the step `check`, for the other intent: its own pin and its own check, and no new root.
    expect([shape(s.asked(other, "check")), s.asked(other, "check"), s.asked(other, "stage"), s.state.recordCount("hold@1", "root")]).toEqual([["pin provisional", "opens check x1", "attempt 1 opened"], "repeat 12", "refused guard-failed", 1]);

    // The entry that refuses the report releases its pin, by the commit that the report's slot holds.
    expect(s.act(rita, "refuse-report", { on: 11, expected: { on: 1 } }, { capabilities: cap }).result).toBe("write");
    expect([s.record("pin", s.at, intentDigest(report.intent)), s.replay().snapshot() === s.state.snapshot()]).toEqual([{ state: "released", root: 1, commit: X, admitted: 11, released: "unpinned", by: 13, check: "9:0" }, true]);

    // The other intent's check gets no answer: `unknown`, and its one attempt opens no other. Another read in its place settles
    // nothing. The read's own answer, when it arrives late, is recorded, and writes the check record (section 5.7, the evidence
    // table; section 5.4, rule 2).
    const found = { record: clean(s.at, X, 1) };
    expect([shape(s.outcome("12:0", "unknown")), s.outcome("12:0", "confirmed", found, "read"), shape(s.outcome("12:0", "confirmed", found)), s.record("check", intentDigest(other.intent), 1)?.state]).toEqual([
      ["unknown"], "refused bad-input", ["confirmed", "check recorded"], "recorded",
    ]);
  });

  test("a pin in another lane ends in one state in both orders of `pin-confirm` and `unpin`, and a late confirmation restores nothing (T22)", () => {
    const s = new Staging();
    const [M, E]: FactRef[] = [{ at: otherLane, seq: 7, hash: d("7") }, { at: otherLane, seq: 9, hash: d("9") }];
    const apply = (effect: string, args: Record<string, unknown>) => s.hand(recordEffects("hold@1", cap.effect("hold@1", effect, args, s.given())));
    // Two pins that the lane holds for the other lane, each prepared for one intent: made by hand, as the step `stage` leaves them.
    const pins = [d("1"), d("2")].map((intent) => ({ consumer: otherLane, intent }));
    s.hand(recordEffects("hold@1", [...pins.map(({ consumer, intent }) => ({ kind: "pin", key: [consumer, intent], state: "provisional", values: { root: 1, commit: X, admitted: null, released: null, by: null, check: null } })),
      { kind: "pin", key: [otherLane, d("3")], state: "released", values: { root: 1, commit: X, admitted: null, released: "never-admitted", by: null, check: null } }]));
    const confirm = (pin: object) => apply("pin-hold", { ...pin, manifest: M });
    const unpin = (pin: object) => apply("pin-release", { ...pin, manifest: M, by: E });
    confirm(pins[0]!); unpin(pins[0]!);
    unpin(pins[1]!); confirm(pins[1]!); confirm(pins[1]!);
    const [first, second] = pins.map(({ consumer, intent }) => s.record("pin", consumer, intent));
    expect([first, second]).toEqual([{ state: "released", root: 1, commit: X, admitted: M, released: "unpinned", by: E, check: null }, first]);
    // The guard `pin`, for both handlers: the key, the commit, and a pin that settlement released as never admitted.
    const asks = (intent: string, commit = X) => cap.guard("hold@1", "pin", { consumer: otherLane, intent, commit }, s.given());
    expect([asks(d("1")), asks(d("8")), asks(d("1"), C("b")), asks(d("3"))]).toEqual([true, "no-pin", "pin-mismatch", "never-admitted"]);
  });

  test("the holds of a definition have a workspace exactly when it uses a guard or an effect of `hold@1`; an end revokes each live token, and a mint that is answered after its use ended is revoked in its own entry and is never live", () => {
    const reads = variant(lane, (def) => { def.capabilities.push({ name: "git-read", version: 1 }); def.acts.report.guards.push({ capability: { name: "git-read", guard: "ancestry", with: { row: { const: "report" } } } }); });
    expect([hasWorkspace(staging), hasWorkspace(laneDefinition), hasWorkspace(reads)]).toEqual([true, false, false]);
    // Without a workspace the item form is all there is: no fork, and the steps of a workspace are refused by name.
    const plain = new Staging(laneDefinition);
    expect([plain.head.seq, plain.state.recordCount("hold@1", "fork"), plain.prepare(una, "instance", { hold: plain.hold, task, instance: "i1" })]).toEqual([4, 0, "refused capability-refused no-workspace"]);

    const s = new Staging();
    s.prepare(una, "instance", { hold: s.hold, task, instance: "i1" });                 // entry 6
    const token = () => s.prepare(una, "token", { hold: s.hold, instance: "i1" });
    expect(token()).toBe("refused guard-failed");                                       // the fork is not selected yet
    // Made by hand: the fork's selection is the outcome of its creation, whose rules are not built here (plan step 18).
    s.hand(recordEffects("hold@1", [{ kind: "fork", key: [s.hold], state: "selected", values: { seed: null, operation: "5:0", id: "f1", name: "fork-1" } }]));
    expect(shape(token())).toEqual(["token minting", "opens mint x1", "attempt 1 opened"]);   // entry 8
    s.outcome("8:0", "unknown");                                                        // entry 9: the mint's reply is lost
    token();                                                                            // entry 10
    // A mint that is answered while its use has not ended makes the token `live`. A hold has at most the stated number at once.
    expect([shape(s.outcome("10:0", "confirmed", { token: "tok-2", ends: t(300) })), s.record("token", 2)?.state, token()]).toEqual([["confirmed", "token live"], "live", "refused guard-failed"]);
    // A renewal by the holder moves no record.
    s.did(una, "renew", { on: s.hold, expected: { on: s.item(s.hold).revision } });
    expect(s.derived()).toBeNull();

    // The hold ends by its timed rule. The instance is `past`, the live token is `revoking` with its revocation, and the token
    // that is `minting` is not touched: its mint is not settled, not sent again and not given to anyone.
    s.now = t(1300);
    s.drain();
    expect([shape(s.derived()!), s.record("instance", s.hold, "i1")?.state, s.record("token", 2), s.record("token", 1)?.state, s.state.operation("8:0")?.attempts.length]).toEqual([
      ["instance past", "token revoking", "opens revoke x3", "attempt 1 opened"], "past", { state: "revoking", purpose: "workspace", hold: s.hold, instance: "i1", mint: "10:0", id: "tok-2", ends: t(300), revocation: "14:0" }, "minting", 1,
    ]);
    // The mint's own answer arrives late. That entry holds the host's ID and end time, the state `revoking` straight from `minting`,
    // and the revocation with attempt 1. It was reserved when the mint was opened: what is used and reserved does not rise.
    const before = s.head.seq + s.reserved();
    const late = s.outcome("8:0", "confirmed", { token: "tok-1", ends: t(900) }) as Entry;
    expect([shape(late), s.record("token", 1), s.head.seq + s.reserved() <= before]).toEqual([
      ["confirmed", "token revoking", "opens revoke x3", "attempt 1 opened"], { state: "revoking", purpose: "workspace", hold: s.hold, instance: "i1", mint: "8:0", id: "tok-1", ends: t(900), revocation: `${late.seq}:0` }, true,
    ]);
    expect([shape(s.outcome(`${late.seq}:0`, "confirmed")), s.record("token", 1)?.state, s.replay().snapshot() === s.state.snapshot()]).toEqual([["confirmed", "token ended"], "ended", true]);

    // A renewal that changes the holder closes the workspace for good: the instance is `past`, and no step is admitted for the hold.
    const taken = new Staging();
    taken.prepare(una, "instance", { hold: taken.hold, task, instance: "i1" });
    taken.did(vic, "renew", { on: taken.hold, expected: { on: taken.item(taken.hold).revision } });
    expect([shape(taken.derived()!), taken.record("instance", taken.hold, "i1")?.state, taken.prepare(vic, "instance", { hold: taken.hold, task, instance: "i2" })]).toEqual([["instance past"], "past", "refused capability-refused holder-changed"]);

    // The judges derive the same effects in the entry itself when they are given the capability's code: after the entry's own
    // effects, at the opening and at the timed end. The entry's other effects are what they are with no code, and the derived ones
    // are those that the fixture folds by hand, with the operation named by the entry itself.
    const w = new Staging(staging, true);
    const [opening, itemForm, byHand] = [w.entries[w.hold]!.entry.effects, taken.entries[taken.hold]!.entry.effects, taken.entries[taken.hold + 1]!.entry.effects];
    expect([shape(w.entries[w.hold]!.entry).slice(-4), opening.slice(0, -3), w.record("fork", w.hold), byHand.slice(1)]).toEqual([
      ["hold", "fork creating", "opens head x1", "attempt 1 opened"], itemForm, { ...taken.record("fork", taken.hold), operation: "4:0" }, opening.slice(-2),
    ]);
    w.prepare(una, "instance", { hold: w.hold, task, instance: "i1" });                 // entry 5
    w.now = t(700);
    w.drain();
    expect([w.last.input.type, shape(w.last).slice(-3), w.record("instance", w.hold, "i1")?.state, w.replay().snapshot() === w.state.snapshot()]).toEqual(["timed", ["hold", "instance past", "attention"], "past", true]);
  });

  test("a license names one export, one hold and one instance; a bound request is decided once from the entry that the pin reserved, and a pin decides at most its highest number (T28)", () => {
    const s = new Staging();
    s.prepare(una, "instance", { hold: s.hold, task, instance: "i1" });
    s.now = t(700);
    s.drain();                                                                          // the first hold ends, and it records the task scope
    s.derived();
    const exported = s.did(rita, "authorize", { expected: { hold: s.item(s.hold).revision }, fields: { hold: s.hold } }).seq;
    const target = s.take(una);
    s.prepare(una, "instance", { hold: target, task, instance: "i2" });
    const args = { export: exported, from: task, checkpoint: d("9"), hold: target, instance: "i2" };
    const license = (over: object = {}) => cap.guard("hold@1", "license", { ...args, ...over }, s.given());
    expect([license(), license({ from: otherLane }), license({ instance: "i9" }), license({ hold: s.hold })]).toEqual([true, "export-not-authorized", "target-not-held", "target-not-held"]);
    // The license entry: the pin stands, with the target that the first request fixed.
    s.hand(recordEffects("hold@1", cap.effect("hold@1", "license", { ...args, k: 1 }, s.given())));
    expect(s.record("receiver-pin", exported)).toEqual({ state: "standing", checkpoint: d("9"), hold: target, instance: "i2", holder: una.member, task, k: 1, decided: 1, by: null });
    s.prepare(una, "instance", { hold: target, task, instance: "i3" });
    expect([license(), license({ instance: "i3" })]).toEqual(["target-not-held", "target-fixed"]);

    // Section 4.2, "A reserved license decision". The binding is by source, export and number alone: another field may be ill-typed.
    const bound = (fields: object, from: unknown = task) => { const b = boundLicense(s.state, s.at, from, fields); return b && b.k; };
    const whole = { export: s.fact(exported), k: 2, instance: 7 };
    expect([bound(whole), bound(whole, otherLane), bound({ ...whole, k: 1 }), bound({ ...whole, k: 4 }), bound({ ...whole, k: "2" }), bound({ k: 2 })]).toEqual([2, null, null, null, null, null]);
    // The judge of a delivery decides a license request of the task scope, with the capability's code. Request 2 is bound, and it is
    // ill-typed in another field. Its refusal is a settling entry with one effect, the record whose `decided` is 2: the pin's
    // state, target and `k` do not change. It uses the entry that the pin reserved for number 2, so what is used and reserved is the
    // same after it. The number is then decided: the same number again is not bound. Its refusal is new work, with no effect.
    const asks = (fields: object) => {
      const send = { n: 0, to: s.at, message: { class: "request", type: "tell", body: { message: "export-license", fields } } } as const;
      const source = { ...forged(task, 20 + s.head.seq, { type: "checkpoint", through: 0, state: d("0") }, [send]), under: "platform:task" };
      const arrival = { ...send, from: factRefOf(source.entry) };
      const judged = judgeDelivery(s.state, s.definition, arrival, { ...arriving(s, arrival, source), capabilities: cap });
      if (judged.result !== "write") throw new Error(`not decided: ${JSON.stringify(judged)}`);
      s.seal(judged.draft);
      return [...decided(s), judged.draft.settles, shape(s.last)];
    };
    const before = [s.head.seq + s.reserved(), s.reserved()];
    expect([asks(whole), s.record("receiver-pin", exported), s.head.seq + s.reserved(), s.reserved(), bound(whole), bound({ ...whole, k: 3 }), asks(whole)]).toEqual([
      ["refused", "bad-field", true, ["receiver-pin standing"]],
      { state: "standing", checkpoint: d("9"), hold: target, instance: "i2", holder: una.member, task, k: 1, decided: 2, by: null }, before[0], before[1]! - 1, null, 3,
      ["refused", "bad-field", false, []],
    ]);

    // `export-settled`: the final entry of the task scope, made by hand, whose own effects set the release to its final state.
    const F: Fetched = { fact: { at: task, seq: 5, hash: d("f") }, under: "platform:task", entry: { v: 1, at: task, seq: 5, prev: d("e"), time: t(0), clamped: false, epoch: 0, input: { type: "checkpoint", through: 4, state: d("0") }, uses: [], prepared: [], effects: [{ effect: "state", item: 3, state: "withheld" }], sends: [] } };
    const settled = (over: object = {}) => cap.guard("hold@1", "settled", { export: exported, from: task, final: "withheld", by: F.fact, ...over }, s.given({ source: F }));
    expect([settled(), settled({ final: "confirmed" }), settled({ from: otherLane })]).toEqual([true, "not-final", "export-not-authorized"]);
    const reserved = s.reserved();
    s.hand(recordEffects("hold@1", cap.effect("hold@1", "settle", { export: exported, by: F.fact }, s.given({ source: F }))));
    // The pin is released, and the entry that it still reserved, for license 3, is released with it.
    expect([s.record("receiver-pin", exported)?.state, s.reserved(), license()]).toEqual(["released", reserved - 1, "export-not-authorized"]);
  });
});
