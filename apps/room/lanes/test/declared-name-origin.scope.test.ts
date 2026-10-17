import { env } from "cloudflare:workers";
import { isEntryOf } from "@generalbusiness/dap-derive";
import { namespace, type Sourced } from "@generalbusiness/artroom-scope";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition, type Intent, type ScopeRef, type Seed } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, digestBytes, intentDigest, isSeed, scopeIdOf, seedDigest, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { keys, type Actor } from "@generalbusiness/dap-derive/testing";
import { APPLICATION_COHORT, firstExtents, publishingLaneOrigin, repositoryName } from "@generalbusiness/dap-platform";
import { changeDemo } from "../src/index.ts";
import { room as nativeRoom, rita as nativeRita } from "./support/room.ts";
import { soon } from "../../../../packages/scope/test/net.ts";
import { outsideOf } from "../../../../packages/scope/test/outside.ts";
import { initialPublication } from "../../../../packages/scope/test/publication.ts";
import type { Platform } from "../../../../packages/scope/test/repository.ts";
import { reader } from "../../../../packages/scope/test/support.ts";
import { beginSessionFixture } from "../../../../packages/scope/test/session-settings.ts";
import { dispatchFixture, effectFixture, nativeFixtureLifetime } from "../../../../packages/scope/test/support/native-fixture-lifetime.ts";
import { declaredChangeAttack } from "../../../../packages/scope/test/support/declared-change-attack.ts";

// Invariant: an arbitrary application cannot acquire a native change lane's
// destination publication privilege by declaring the same name.
// Real PlatformScope, SQLite, factory, membership authority, rules and source
// resolution. Git creation and creation writes use existing OutsideDouble;
// no provider, production Git repository, or network is mutated. Scripted
// clock and inspector reads are labelled stand-ins; grants are native.
// This successor checks only reserve admission, not an outside judge or push.
// The original c8 witness failed on A-to-B and never reached B-to-B. It is
// retained as historical evidence. Canonical F1 creation is separately refused
// by the existing capability restriction, before any reserve can be sent.
test("native reserve refuses declared-name applications across rooms and inside the destination room, while F1 refuses capability-bearing canonical lanes; Git host is a STAND-IN", async ({ task }) => {
  const owner = beginSessionFixture({ secret: null, sessions: false, inspector: reader });
  const lifetime = nativeFixtureLifetime(owner, { required: false });
  const settle = (...nodes: Platform[]) => dispatchFixture(nodes, lifetime.wait);
  type Room = { R: Platform; D: Platform; M: Platform; Q: Platform; G: Platform; who: Actor };
  const room = async (label: string, who: Actor, recovery: Actor): Promise<Room> => {
    const install: Intent = { v: 1, to: null, actor: keys.paul.key, kind: "install", on: null,
      expected: {}, fields: { host: "git.example", namespace: `security-${label}`,
        policy: "keys", "founders": [who.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = lifetime.platform(scopeIdOf({ v: 1, kind: "register", definition: APPLICATION_COHORT.register,
      creator: null, cause: intentDigest(install), ordinal: 0 }));
    const host = outsideOf(R.name);
    lifetime.wire(R.name, () => ({ outside: {
      accepts: () => { lifetime.active(); return host.accepts(); },
      send: request => lifetime.wait(() => host.send(request)),
      late: deliver => { lifetime.active(); host.late(deliver); },
    } }));
    expect(await R.stub.create(signIntent(install, keys.paul.secret), APPLICATION_COHORT.register)).toMatchObject({ answer: "accepted" });
    const matched = await R.intent(who, "found", { expected: await R.expected({ register: 0 }),
      fields: { branch: "main", "founderHandle": label === "A" ? "@rita" : "@sam", recoveryKey: recovery.key } });
    const seed: Seed = { v: 1, kind: "directory", definition: APPLICATION_COHORT.directory,
      creator: await R.at(), cause: intentDigest(matched.intent), ordinal: 0 };
    const D = lifetime.platform(scopeIdOf(seed));
    host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer",
      body: { name: repositoryName(seedDigest(seed), 1), id: `security-${label}` } } });
    expect(await R.stub.submit(matched, [])).toMatchObject({ answer: "accepted" });
    await effectFixture([R], lifetime.wait); await settle(R, D);
    const sends = (await D.entries())[0]!.sends;
    const child = (kind: Seed["kind"]) => {
      const send = sends.find(s => isSeed(s.to) && s.to.kind === kind);
      if (!send || !isSeed(send.to)) throw new Error(`Actual ${label} ${kind} creation is missing.`);
      return lifetime.platform(scopeIdOf(send.to));
    };
    const M = child("membership"), Q = child("rules"), G = child("destination");
    await settle(R, D, M, Q, G);
    expect([(await D.summary()).value.definition, (await M.summary()).value.definition,
      (await Q.summary()).value.definition, (await G.summary()).value.definition]).toEqual([
      APPLICATION_COHORT.directory, APPLICATION_COHORT.membership, APPLICATION_COHORT.rules, APPLICATION_COHORT.destination]);
    const seat = await M.did(who, "seat", { expected: await M.expected({ roster: 0 }) });
    await M.did(who, "first-key", { fields: { member: seat }, expected: await M.expected({ roster: 0, member: seat }) });
    await initialPublication(G, lifetime);
    expect(await G.item(0)).toMatchObject({ state: "ready" });
    return { R, D, M, Q, G, who };
  };
  try {
    const A = await room("A", keys.rita, keys.una), B = await room("B", keys.sam, keys.vic);
    const destination = await B.G.at();
    const checkpoints: unknown[] = [];
    const creationRefusals: unknown[] = [];
    Object.assign(task.meta, { nativeReserveCheckpoints: checkpoints, canonicalCreationRefusals: creationRefusals, attackJudgeOrPushDriven: false });
    // An arbitrary application may choose the native genesis word too.
    // This keeps the same-room name-only control from being masked by the
    // separate birth-kind affiliation check. Its actual factory route is
    // still establish-application, never Native open-pr.
    const { establish, ...applicationActs } = declaredChangeAttack.acts;
    const namedApplication = { ...declaredChangeAttack, genesis: "open", acts: { ...applicationActs, open: establish } } satisfies DeclaredDefinition;
    for (const [label, source, canonical] of [["A-to-B declared", A, false], ["B-to-B declared", B, false],
      ["A-to-B canonical F1", A, true], ["B-to-B canonical F1", B, true]] as const) {
      // This canonical pin carries hold/git-read capabilities. F1's existing
      // application guard rejects it; do not weaken that guard for a control.
      const declaration = canonical ? changeDemo : namedApplication;
      const bytes = canonicalize(declaration), digest = definitionDigest(declaration);
      if (canonical) {
        await source.Q.did(source.who, "publish", { on: 0, expected: await source.Q.expected({ on: 0 }),
          fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }).map(extent => ({ ...extent })) } });
      }
      // The named app is activated and created by actual native signed acts.
      const activation = await source.Q.stub.submit(await source.Q.intent(source.who, "activate",
        { fields: { digest, name: "change" } }), [], { values: [bytes] });
      if (activation.answer !== "accepted") {
        Object.assign(task.meta, { failedActivation: { label, answer: activation } });
        throw new Error(`Actual ${label} activation: ${canonicalize(activation)}`);
      }
      const signed = await source.D.intent(source.who, "establish-application", {
        expected: await source.D.expected({ repository: 0 }),
        fields: { definition: digest, values: canonicalize(canonical
          ? { title: label, draft: false, destination, rules: await source.Q.at() } : { destination }), execution: "recorded-do" } });
      const established = await source.D.stub.submit(signed, [], { values: [bytes] });
      if (canonical) {
        creationRefusals.push({ label, definition: digest, directory: await source.D.at(), answer: established });
        expect(established, "Canonical capabilities must retain their existing F1 refusal.").toMatchObject({ answer: "refused", reason: "unsupported-definition", name: "unsupported-application" });
        continue;
      }
      expect(established).toMatchObject({ answer: "accepted" });
      if (established.answer !== "accepted") throw new Error("Native application creation did not run.");
      const app = await source.D.created(established.receipt.fact.seq);
      await settle(source.D, app);
      expect((await app.summary()).value.definition).toBe(digest);
      const appGenesis = (await app.entries())[0]!;
      const expectedMembership = await source.M.at();
      expect(appGenesis.input).toMatchObject({ type: "genesis", message: { body: { membership: expectedMembership } } });
      const before = await B.G.summary();
      const base = (await B.G.item(0)).values["head"];
      if (typeof base !== "string") throw new Error("B's actual first head is missing.");
      const content = `security witness ${label}\n`, raw = utf8(content);
      const file = await app.did(source.who, "propose-file", { fields: {
        base, path: "security-witness.txt", content, digest: digestBytes(raw), size: raw.length } });
      const manifest = file;
      const merge = await app.did(source.who, "merge", { fields: { manifest },
        expected: await app.expected({ manifest, configuration: 0 }) });
      const merger = (await app.entries())[merge]!;
      expect(merger.input).toMatchObject({ type: "act", authority: [{ fresh: { observation: {
        of: expectedMembership, actions: expect.arrayContaining(["change.merge"]) } } }] });
      await settle(app, B.G);
      const after = await B.G.summary();
      const admissions = (await B.G.entries()).filter(e => e.seq > before.at.seq);
      const publications = after.value.items.filter(i => i.type === "publication" && i.id > before.at.seq);
      const from = await app.at();
      const sourced = await lifetime.wait(() => (app.object as unknown as { source(seq: number): Promise<{ under: string; at: ScopeRef }> }).source(merge));
      const reserveAdmissions = admissions.filter(e => e.input.type === "delivery"
        && e.input.from.at.scope === app.name && e.input.from.seq === merge);
      const checkpoint = { label, definition: digest, genesisKind: appGenesis.input.type === "genesis" ? appGenesis.input.kind : null, creationRoute: "establish-application", under: sourced.under, app: from, creator: await source.D.at(), membership: expectedMembership,
        destination, manifest, merge, before: before.at, after: after.at,
        admissions: reserveAdmissions.map(e => ({ seq: e.seq, input: e.input.type === "delivery" && "decision" in e.input
          ? { decision: e.input.decision, reason: e.input.reason } : { type: e.input.type }, uses: e.uses.length, effects: e.effects.length })),
        publicationIds: publications.map(i => i.id), attackJudgeOrPushDriven: false };
      checkpoints.push(checkpoint);
      // The JSON reporter retains this bounded public checkpoint even if the
      // next assertion fails. The disabled-name-qualification control must fail here by
      // assertion, before any further scenario or outside operation is driven.
      expect(publications, `${label} opened a native publication; remaining scenarios are UNRUN.`).toHaveLength(0);
      expect([sourced.under, sourced.at]).toEqual(["declared:change", from]);
      expect(reserveAdmissions, "An empty publication list alone is not an admission refusal.").toHaveLength(1);
      const admission = reserveAdmissions[0]!.input;
      if (admission.type !== "delivery" || !("decision" in admission)) throw new Error("Reserve produced no native admission decision.");
      expect(admission.decision).toBe("refused");
      expect(admission.reason?.code, "Retain an explicit native refusal code.").toBeTypeOf("string");
      expect(admission.reason).toMatchObject({ code: "unknown-message" });
    }
  } finally { lifetime.release(); }
});

// A genuine Native role is necessary but does not authorize a foreign room.
// This separate case preserves the original combined declared/F1 scenarios.
test("a genuine Native change extension cannot reserve another room's destination; Git hosts and scheduler are STAND-INs", async ({ task }) => {
  const rita = nativeRita;
  const A = await nativeRoom({ roster: [] }), B = await nativeRoom({ roster: [] });
  const definition = {
    ...changeDemo,
    items: { ...changeDemo.items, merge: {
      ...changeDemo.items.merge,
      refs: { ...changeDemo.items.merge.refs, foreign: { fixed: true, required: true, to: { type: "scope", kind: "destination" } } },
    } },
    acts: { ...changeDemo.acts, merge: {
      ...changeDemo.acts.merge,
      fields: { ...changeDemo.acts.merge.fields, foreign: { type: "scope", kind: "destination", required: true } },
      effects: [...changeDemo.acts.merge.effects, { ref: { slot: "foreign", from: { field: "foreign" } } }],
      sends: changeDemo.acts.merge.sends.map(form => ({ tell: { ...form.tell, to: { slot: "foreign" } } })),
    } },
  } as const satisfies DeclaredDefinition;
  const digest = definitionDigest(definition);
  await A.activate(definition, digest);
  expect(await A.publishRules({ approvals: 0, checks: [], ownerMayReview: false, labels: [], extents: firstExtents({ approvals: 0, checks: [] }) })).toMatchObject({ answer: "accepted" });
  const lane = await A.lane(rita, "open-pr", definition, digest, { title: "Native foreign target", draft: false });
  await lane.did(rita, "ask-rules", { on: 0 });
  await A.settle();
  const offer = (await lane.did(rita, "offer", { fields: { offeree: await A.member("@rita"), terms: "Test native affiliation" } })).fact;
  await lane.did(rita, "accept", { on: offer.seq, fields: { terms: offer } });
  const hold = (await lane.did(rita, "take-hold", { fields: { commitment: offer.seq } })).fact.seq;
  await lane.instance(rita, hold, "foreign-1");
  const version = (await lane.stagedDid(rita, "propose-manifest", { fields: { hold, instance: "foreign-1", base: A.firstHead, integration: "c".repeat(40), tree: "3".repeat(40), complete: true, selected: [], decisions: [] } })).fact.seq;
  const foreign = await B.G.at();
  const before = await B.G.summary();
  const beforePublications = before.value.items.filter(item => item.type === "publication").map(item => ({ id: item.id, state: item.state }));
  const merged = (await lane.did(rita, "merge", { fields: { manifest: version, reports: [], foreign } })).fact;
  const sourced = await (lane.object as unknown as { source(seq: number, origin: boolean): Promise<Sourced | null> }).source(merged.seq, true);
  Object.assign(task.meta, { normalRawScopeOrigin: sourced ? { at: sourced.at, under: sourced.under, originFacts: sourced.origin?.map(copy => copy.fact) ?? [] } : null });
  expect(sourced, "Current source must retain its authentic Native closure").not.toBeNull();
  if (!sourced) throw new Error("Native source closure unavailable");
  expect([sourced.at, sourced.under]).toEqual([lane.at, "change"]);
  const decoded = await namespace(env.PLATFORM).resolver.read(merged, PROPOSED_BOUNDS.fetchSeconds, true);
  expect(decoded && "entry" in decoded, "Production resolver must decode the Native origin facts").toBe(true);
  if (!decoded || !("entry" in decoded)) throw new Error("Decoded Native source closure unavailable");
  expect(isEntryOf(decoded.entry, merged)).toBe(true);
  expect(decoded.under).toBe("change");
  expect(publishingLaneOrigin(merged, await A.D.at(), await A.G.at(), decoded.origin ?? [])).toBe(true);
  const envelope = await lane.envelope(merged.seq);
  expect(envelope.to).toEqual(foreign);
  const answer = await B.G.stub.deliver(envelope);
  const after = await B.G.summary();
  const afterPublications = after.value.items.filter(item => item.type === "publication").map(item => ({ id: item.id, state: item.state }));
  Object.assign(task.meta, { nativeForeignReserve: { definition: digest, source: lane.at, under: sourced.under, from: merged,
    directory: await A.D.at(), ownDestination: await A.G.at(), foreignDestination: foreign,
    originFacts: sourced.origin?.map(copy => copy.fact) ?? [], before: before.at, after: after.at, answer,
    beforePublications, afterPublications, outsideJudgeOrPushDriven: false } });
  // The forward-affiliation-only control must fail by assertion here, after
  // retaining the actual B publication opening, before any outside pump.
  expect(answer).toEqual({ answer: "source-unverified" });
  expect(after.at).toEqual(before.at);
  expect(afterPublications).toEqual(beforePublications);
});
