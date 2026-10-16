import { expect } from "vitest";
import type { Entry, Evidence, FieldValue, OperationId, RulesContent, PlatformData, PlatformDefinition, Request, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, factRefOf, intentDigest, isFactRef, newIncarnation, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import { clockOf, contentStates, judgeDelivery, judgeGenesis, PROFILES, settleOutcome, validateDefinition, valueDigest, type Judgment, type PlatformRules, type Rules } from "@generalbusiness/dap-derive";
import { d, grantOf, keys, Ledger, T0, type Actor } from "@generalbusiness/dap-derive/testing";
import { destination4, destinationRules4 } from "../src/destination.ts";
import { firstExtents } from "../src/extents.ts";
import { rulesScope } from "../src/rules-scope.ts";
import { fetched, handMade, HEAD, keyObserved, MEMBERSHIP, retained, rulesObserved, RULES } from "./support-destination.ts";

// Real versioned validator, judges, seal and fold in memory. Creator,
// source histories, membership/rules observations and host replies are
// explicitly SCRIPTED. No Native birth/driver/provider/publication is claimed.
export function publicationJourney(data: PlatformData = destination4, named: PlatformDefinition = "platform:destination@4", rules: Rules = destinationRules4) {
  const checked = validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true });
  if (!checked.ok) throw Error(JSON.stringify(checked.problems));
  const definition = checked.definition, platform: PlatformRules = { named, rules };
  const ref = (kind: ScopeRef["kind"], mark: string): ScopeRef => ({ kind, scope: scopeIdOf({ v: 1, kind, definition: d("e"), creator: null, cause: d(mark), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(8)) });
  const directory = ref("directory", "d"), app = ref("lane", "a"), change = ref("lane", "b"), register = ref("register", "c");
  const claim = handMade(register, "found");
  const write = (ledger: Ledger, judgment: Judgment) => { expect(judgment.result, JSON.stringify(judgment)).toBe("write"); if (judgment.result !== "write") throw Error("Not written"); ledger.seal(judgment.draft); };
  class BoundsBranch extends Ledger { override get foldOptions() { return { ...super.foldOptions, platform }; } }
  function birth(importing = true, membership = MEMBERSHIP, creator = directory) {
    const source = handMade(creator, "create-destination");
    if (source.input.type !== "act") throw Error("Scripted source is an act");
    const seed: Seed = { v: 1, kind: "destination", definition: named, creator, cause: intentDigest(source.input.signed.intent), ordinal: 0 };
    const message: Request = { class: "request", type: "create", body: { kind: "establish", fields: { repository: { host: "git.example", namespace: "public-test", name: "bounds", id: "1" }, branch: "main", import: importing,
      claim: factRefOf(claim) as unknown as FieldValue, directory: creator as ScopeRef & FieldValue, membership: membership.scope, rules: RULES.scope, founderHandle: "@rita" } } };
    const original = { ...source, sends: [{ n: 0, to: seed, message }] };
    const asked = { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(21)), to: seed, from: factRefOf(original), n: 0, message };
    return { source: original, asked, claim, directory: creator };
  }
  function make(importing = true, ready = true) {
    const ledger = new BoundsBranch(definition, "platform:destination"), { source: original, asked } = birth(importing);
    write(ledger, judgeGenesis(ledger.state, definition, asked, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [fetched(claim, "platform:register")], prepared: [], source: { entry: original, under: "platform:directory" }, platform }));
    const control: Request | { class: "control"; type: "confirm"; genesis: ReturnType<typeof factRefOf> } = { class: "control", type: "confirm", genesis: ledger.fact(0) };
    const returned = ledger.last.sends.find(send => send.message.class === "result");
    if (!returned || returned.message.class !== "result") throw Error("The judged genesis returned its original result");
    const confirmation = { ...handMade(directory, "confirm-destination", [{ n: 0, to: ledger.at, message: control }]),
      input: { type: "delivery", from: ledger.fact(0), n: returned.n, message: returned.message, clause: "applied" } as const };
    write(ledger, judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(confirmation), n: 0, message: control }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: { entry: confirmation, under: "platform:directory" }, own: ledger.own, platform }));
    if (!ready) return ledger;
    const adopt = ledger.act(keys.rita, "adopt-head", { on: 0, expected: { on: ledger.item(0).revision }, fields: { commit: HEAD, why: "SCRIPTED host base for bounds" } }, { platform });
    expect(adopt.result).toBe("write");
    answer(ledger, `${ledger.head.seq}:0`, { seen: HEAD });
    return ledger;
  }
  function offer(ledger: Ledger, operation: OperationId, body: Evidence["body"], hand: Partial<Parameters<typeof settleOutcome>[3]> = {}) {
    const judgment = settleOutcome(ledger.state, definition, { type: "outcome", operation, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body } }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, own: ledger.own, facts: ledger.foldOptions.facts, platform, ...hand });
    if (judgment.result === "write") ledger.seal(judgment.draft);
    return judgment;
  }
  function answer(...args: Parameters<typeof offer>) {
    const judgment = offer(...args);
    expect(judgment.result, JSON.stringify(judgment)).toBe("write");
    return judgment;
  }
  function file(ledger: Ledger, content = "# Pot\n") {
    const message: Request = { class: "request", type: "tell", body: { message: "publish-file", fields: { path: "shelf/pot.md", content } } };
    const source = handMade(app, "donate", [{ n: 0, to: ledger.at, message }]);
    ledger.remember([fetched(source, "lending")]);
    const judgment = judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(source), n: 0, message }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], own: ledger.own, source: { entry: source, under: "lending" }, platform });
    if (judgment.result === "write") ledger.seal(judgment.draft);
    return judgment;
  }
  function changeReceipt(ledger: Ledger, options: { list?: true; checks?: Extract<RulesContent, { asked: "rules" }>["checks"]; approver?: Actor } = {}) {
    const content = "# Change\n", source = handMade(change, "propose-file", [], keys.rita, { path: "change.md", content, size: utf8(content).length, digest: digestBytes(utf8(content)), base: HEAD });
    const manifest = options.list ? handMade(change, "propose-manifest", [], keys.rita, { base: HEAD, files: [{ path: "change.md", digest: digestBytes(utf8(content)), entry: factRefOf(source) as unknown as FieldValue }], selected: [] }) : source;
    const review = options.approver ? handMade(change, "review-verdict", [], options.approver, { manifest: manifest.seq, verdict: "approve", extent: "source" }) : null;
    const reviewer = options.approver ? { membership: MEMBERSHIP, member: options.approver.member.member } : null;
    if (review?.input.type === "act" && options.approver && reviewer) review.input.authority = [{ ...grantOf(options.approver, change, ["change.review"]), subject: reviewer }];
    const message: Request = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest) as unknown as FieldValue,
      verdicts: review && reviewer ? [{ review: factRefOf(review) as unknown as FieldValue, reviewer, verdict: "approve", extent: "source" }] : [], jobs: [], links: [], reports: [],
      ...(options.list ? { sources: [{ path: "change.md", digest: digestBytes(utf8(content)), entry: factRefOf(source) as unknown as FieldValue }] } : {}),
    } } };
    const merge = handMade(change, "merge", [{ n: 0, to: ledger.at, message }], keys.rita, { manifest: manifest.seq });
    const facts = [...new Set([source, manifest, merge, ...(review ? [review] : [])])].map(entry => fetched(entry, "change")); ledger.remember(facts);
    write(ledger, judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(merge), n: 0, message }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts, prepared: [], own: ledger.own, source: { entry: merge, under: "change" }, platform }));
    const judge = `${ledger.head.seq}:0` as OperationId;
    const rules = rulesObserved(T0, { approvals: review ? 1 : 0, checks: options.checks ?? [] });
    if (rules.content.asked !== "rules") throw Error("Scripted rules observation");
    const extents = firstExtents(rules.content);
    const observed = [retained({ ...rules, content: { ...rules.content, extents: valueDigest("artroom-rules-extents-1", extents), singleControllerException: false } }, 1), retained(keyObserved(keys.rita, T0), 2),
      retained({ subject: "holders", of: MEMBERSHIP, head: { seq: 412, hash: d("4") }, action: "rules.publish", count: 2, holders: [keys.rita.member.member], definition: "platform:membership@1", at: T0 }, 3)];
    if (options.approver) observed.push(retained(keyObserved(options.approver, T0), 4));
    const changes = { paths: ["change.md"], links: [], unreadable: 0 };
    answer(ledger, judge, { head: HEAD, present: true, tree: "d".repeat(40), firstParent: HEAD, ancestors: [], changes: valueDigest("artroom-changed-set-1", changes) }, { facts, observed, values: [canonicalize(extents), canonicalize(changes)], observing: { membership: { ...MEMBERSHIP, inc: null }, rules: { ...RULES, inc: null }, content: () => contentStates(rulesScope) } });
    const publication = ledger.state.page("publication", ["reserved"], null, 1).items[0]!;
    expect(publication, JSON.stringify(ledger.last)).toBeDefined();
    return { publication, merge, manifest, facts, push: `${ledger.head.seq}:0` as OperationId, mint: `${ledger.head.seq}:1` as OperationId };
  }

  function tell(ledger: Ledger, message: string, fields: Record<string, FieldValue>, facts: readonly Entry[] = []) {
    const request: Request = { class: "request", type: "tell", body: { message, fields } };
    const source = handMade(change, "progress", [{ n: 0, to: ledger.at, message: request }]);
    const fetchedFacts = facts.map(entry => fetched(entry, "change"));
    ledger.remember([...fetchedFacts, fetched(source, "change")]);
    const earlier = fields["earlier"], prior = isFactRef(earlier) ? (ledger.foldOptions.facts ?? []).filter(fact => canonicalize(fact.fact) === canonicalize(earlier)) : [];
    const judgment = judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(source), n: 0, message: request }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [...fetchedFacts, ...prior], prepared: [], own: ledger.own, source: { entry: source, under: "change" }, platform });
    write(ledger, judgment);
    expect(ledger.last.input, JSON.stringify(ledger.last.input)).toMatchObject({ type: "delivery", decision: "applied" });
    return ledger.last;
  }
  function compromised(ledger: Ledger) {
    const revoked = handMade(MEMBERSHIP, "revoke-key");
    const request: Request = { class: "request", type: "tell", body: { message: "compromised", fields: { key: keys.rita.key, member: { membership: MEMBERSHIP, member: keys.rita.member.member }, entry: factRefOf(revoked) as unknown as FieldValue } } };
    const source = handMade(directory, "compromised", [{ n: 0, to: ledger.at, message: request }]);
    const facts = [fetched(revoked, "platform:membership")]; ledger.remember([...facts, fetched(source, "platform:directory")]);
    write(ledger, judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(source), n: 0, message: request }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts, prepared: [], own: ledger.own, source: { entry: source, under: "platform:directory" }, platform }));
    expect(ledger.last.input).toMatchObject({ type: "delivery", decision: "applied" });
  }
  return { birth, make, answer, offer, file, tell, compromised, reserve: changeReceipt, definition, platform };
}
