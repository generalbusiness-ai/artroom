import { runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { inject, expect, test } from "vitest";
import type { FactRef, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, timeOf, unb64url, definitionDigest, sign, keyIdOfSecret, digestBytes, factRefOf, scopeIdOf, timeMs, utf8, textDigest } from "@generalbusiness/artroom-bytes";
import { requestSession, sessionRequest, signedReader, type Fetch } from "@generalbusiness/artroom-client";
import { firstExtents, CONFIGURATION_DOMAIN, platform, revokedToken, destinationWrite } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { valueDigest } from "@generalbusiness/artroom-derive";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { artifactsOutside } from "../../scope/src/artifacts-wiring.ts";
import { snapshotReaderOf } from "../../scope/src/worker.ts";
import { env } from "cloudflare:workers";
import { ownHost, readerOf, type Stand } from "../../scope/test/hosts.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { command, memoryStore, expectedOf, type ActShape, type Context, type Outcome } from "../../cli/src/index.ts";
import { change3, changeDemo3, issueDemo } from "../src/index.ts";


// The actual CheckerService reads its signed job-bound reservation snapshot
// and submits its result to the real lane. Its storage and runner are labelled
// stand-ins; actual private Git checkout is a separate runner boundary witness.
import { signJobRead } from "../../checkers/src/signing.ts";
import { verifyReservationObjects } from "../../checkers/src/reservation-snapshot.ts";
import { originOf } from "../../checkers/src/job.ts";
import { CheckerService } from "../../checkers/src/service.ts";
import { Outcomes } from "../../checkers/src/store.ts";
import { MemoryDurable } from "../../checkers/test/support.ts";

import { room as legacyRoom, rita as legacyFounder } from "./support/room.ts";

const SERVICE = "https://scopes.test";
const reader = "a test reader";
test("a manifest-list reservation records both files before the configured checker passes; no branch push occurs before that pass (real scopes, STAND-IN Git host and scheduler)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("a retry fence after publication starts is refused without superseding the live job or forgetting the unknown send (real scopes; host and scheduler STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, true); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("a lost staging answer keeps its recorded reservation and starts no check or publication (real scopes; host and scheduler STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, true); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("an unknown reservation deletion retains the live publication cleanup duty and cannot be resent from ref absence alone (real scopes; host and scheduler STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, true); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("artroom edit uses a one-element reservation tree as the real checker service origin and stages it before the configured check (real scopes; host and runner STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, false, true); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test.each(["summary", "request", "reply", "unavailable", "accepted"] as const)("manifest edit --closes retains its recorded proposal when linking is %s (real scopes; transport fault, host and scheduler STAND-INs)", async (linkFault) => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, false, false, false, linkFault); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("a refused publication push retains and settles its staged-ref cleanup instead of finalizing an orphan (real scopes; host refusal and scheduler STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, false, false, true); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
// Expiry records the bounded cleanup in the real timed turn; a host refusal
// leaves a named live obligation after precisely three attempts, without resend.
test.each(["ref", "token", "token-unknown"] as const)("expired reservations retain named owed %s cleanup after three refusals (real scopes; host and scheduler STAND-INs)", async (resource) => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, false, false, false, undefined, resource); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("unknown staging and exhausted token cleanup retain independent duties across late original and earlier deletion answers (real scopes; host and scheduler STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, true, false, false, false, undefined, "token"); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("an unknown cleanup mint remains named after confirmed ref deletion until its exact late mint and revoke settle (real scopes; host and scheduler STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, false, false, false, undefined, false, true); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test("confirmed ref removal survives an older refused deletion while token custody remains owed (real scopes; host and scheduler STAND-INs)", async () => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, true, false, false, undefined, "token-unknown"); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
// Native admission refuses an empty list without closing collection, and
// the same lane can still collect a source and accept a nonempty manifest.
test.each(["production", "demo"] as const)("%s manifest admission rejects zero sources before freezing and accepts a nonempty counterpart (real scopes; host and scheduler STAND-INs)", async (profile) => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, false, false, false, undefined, false, false, profile); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
test.each(["source-reply", "source-unavailable", "source-refused", "source-mismatch", "manifest-reply", "rules-read"] as const)("interrupted manifest proposal retains known partial work after %s (real scopes; transport fault, host and scheduler STAND-INs)", async (fault) => {
  net.hold = net.deaf = null; platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true; platformNet.inspector = reader;
  const wired = new Set<ScopeId>();
  try { await story(ownHost(), wired, false, false, false, false, false, undefined, false, false, undefined, fault); }
  finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; for (const name of wired) platformOutside.delete(name); }
}, 120_000);
async function story(at: Stand, wired: Set<ScopeId>, startedOnly = false, unknownStageOnly = false, unknownDeleteOnly = false, oneFileOnly = false, refusePushOnly = false, linkFault?: "summary" | "request" | "reply" | "unavailable" | "accepted", exhaustCleanup: false | "ref" | "token" | "token-unknown" = false, unknownMintOnly = false, nonemptyProfile?: "production" | "demo", proposalFault?: "source-reply" | "source-unavailable" | "source-refused" | "source-mismatch" | "manifest-reply" | "rules-read"): Promise<void> {
  const activeChange = nonemptyProfile === "production" ? change3 : changeDemo3;
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const now = () => timeMs(net.clock.now)!;
  const host = at.stand;
  let R: Platform | null = null;
  const bindings = () => at.bindings(R!.name);
  let holdCheckAnswer = false, holdPush = false, slowFinalKey = false;
  let outsideSends = 0;
  let rollbackSnapshotAt: number | null = null;
  let pendingCheck: { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers | null } | null = null;
  let pendingStage: { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers | null } | null = null;
  let confirmedDelete: { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers | null } | null = null;
  let lastDelete: { request: import("../../scope/src/operations.ts").EffectRequest; late: import("../../scope/src/operations.ts").LateAnswers | null } | null = null;
  let releaseMint = false;
  let pendingMint: { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers | null } | null = null;
  let earlierDelete: { request: import("../../scope/src/operations.ts").EffectRequest; late: import("../../scope/src/operations.ts").LateAnswers | null } | null = null;
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => {
    const nativeReader = snapshotReaderOf(env.PLATFORM);
    let keyReads = 0, jobReads = 0;
    const outside = artifactsOutside(given, sql, bindings(), at.stand.fetch, { ...nativeReader, job: async (fact) => {
      const answer = await nativeReader.job(fact);
      if (++jobReads % 2 === 0 && rollbackSnapshotAt !== null) { net.clock.now = timeOf(rollbackSnapshotAt); rollbackSnapshotAt = null; }
      return answer;
    }, key: async (membership, key) => {
      const answer = await nativeReader.key(membership, key);
      if (slowFinalKey && ++keyReads % 2 === 0) net.clock.now = timeOf(timeMs(net.clock.now)! + 11_000);
      return answer;
    } });
    let late: import("../../scope/src/operations.ts").LateAnswers | null = null;
    return { ...outside, replies: (limit) => { const replies = outside.replies?.(limit) ?? { answers: [], more: false }; return { ...replies, answers: replies.answers.filter((row) => releaseMint || row.operation !== pendingMint?.request.operation) }; }, late: (callback) => { outside.late?.(callback); late = callback; }, recovery: { accepts: (owner, kind) => outside.recovery?.accepts(owner, kind) ?? false, read: async (request) => { if (holdCheckAnswer && request.kind === "check-judge") return null; return outside.recovery?.read(request) ?? null; } }, send: async (request) => {
      outsideSends++;
      if (holdCheckAnswer && request.kind === "check-judge") { const answer = await outside.send(request); if (answer) pendingCheck = { request, answer, late }; return null; }
      if (exhaustCleanup === "ref" && request.kind === "reservation-delete") return { result: "refused", evidence: { basis: "own-answer", body: { send: "refused", seen: [...host.refs].find(([ref]) => ref.startsWith("refs/artroom/reservations/"))?.[1] ?? "failed" } } };
      if ((exhaustCleanup === "token" || exhaustCleanup === "token-unknown") && request.kind === "revoke") {
        const operation = given.state.operation(request.operation)!;
        if (given.state.item(operation.for as number)?.type === "publication" && exhaustCleanup === "token-unknown") return null;
        if (given.state.item(operation.for as number)?.type === "publication") return { result: "refused", evidence: { basis: "own-answer", body: { token: revokedToken(given.state, given.own, operation)! } } };
      }
      if (refusePushOnly && request.kind === "push") return { result: "refused", evidence: { basis: "own-answer", body: { send: "refused", seen: host.refs.get("refs/heads/main")! } } };
      const answer = await outside.send(request);
      if (unknownDeleteOnly && request.kind === "reservation-delete") { lastDelete = { request, late }; if (answer?.result === "confirmed") confirmedDelete = { request, answer, late }; }
      if (unknownMintOnly && request.kind === "mint" && answer && !pendingMint && destinationWrite(given.state, given.own, given.state.operation(request.operation)!)?.write.kind === "reservation-delete") { pendingMint = { request, answer, late }; return null; }
      if (unknownStageOnly && request.kind === "reservation-delete" && request.attempt === 1) earlierDelete = { request, late };
      if (unknownStageOnly && request.kind === "reservation-stage" && answer) pendingStage = { request, answer, late };
      return (holdPush && ["push", "read"].includes(request.kind)) || (unknownStageOnly && request.kind === "reservation-stage") || (unknownDeleteOnly && request.kind === "reservation-delete") ? null : answer;
    } };
  }); };
  // STAND-IN for the scheduler: each pass drives the operations of every scope the command waits on, and of the register and the
  // destination, then their dispatchers, until nothing is due.
  const known: Platform[] = [];
  const pause = async (waiting: readonly string[]) => {
    const nodes = [...known, ...waiting.filter((scope) => !known.some((node) => node.name === scope)).map((scope) => new Platform(scope as never))];
    for (let pass = 0; pass < 64; pass++) {
      let made = 0;
      for (const node of nodes) {
        while ((await (node.stub as unknown as { effect(): Promise<number> }).effect()) > 0) made++;
        made += await node.stub.dispatch();
      }
      if (made === 0) return;
    }
    await settle(...nodes);
  };

  const files: Record<string, Uint8Array> = { "change3.json": utf8(canonicalize(activeChange)), "one.md": utf8("# One\n"), "two.md": utf8("# Two\n") };
  const person = (): Context => ({ store: memoryStore(), fetch, now, pause, read: async (path) => files[path] ?? null });
  const founder = person(), checker = person();
  const run = (who: Context, ...argv: string[]) => command(who, argv);
  const ok = (outcome: Outcome) => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };
  ok(await run(founder, "install", SERVICE, "--host", at.host, "--namespace", at.namespace));
  R = new Platform((await founder.store.config())!.register!.scope); wire(R.name); await R.restart(); known.push(R);
  net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
  ok(await run(founder, "claim", "tree", "--handle", "@rita"));
  const repository = (await founder.store.config())!.repository!;
  const G = new Platform(repository.destination); known.push(G); await pause([]);
  expect((await G.summary()).value.definition).toBe("platform:destination@3");
  const first = host.refs.get("refs/heads/main")!;
  if (proposalFault) {
    files["docs/two.md"] = utf8("# Second source\n");
    ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
    ok(await run(founder, "act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "change3.json"));
    const accepted: { kind: string; path?: string; fact: FactRef }[] = [];
    let sourceRequests = 0;
    const faultFetch = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const intent = init?.method === "POST" && path.endsWith("/acts") ? (JSON.parse(String(init.body)) as { signed?: { intent?: { kind?: string; fields?: { path?: string } } } }).signed?.intent : undefined;
      if (proposalFault === "rules-read" && accepted.some((entry) => entry.kind === "ask-rules") && path === `/v1/scopes/${accepted.find((entry) => entry.kind === "ask-rules")!.fact.at.scope}`) throw new Error("TEST private partial-proposal transport detail");
      if (intent?.kind === "propose-file") {
        sourceRequests++;
        if (sourceRequests === 2 && proposalFault === "source-unavailable") return Response.json({ answer: "unavailable", reason: "busy" });
        if (sourceRequests === 2 && proposalFault === "source-mismatch") return Response.json({ answer: "mismatch", reason: "idempotency-mismatch" });
        if (sourceRequests === 2 && proposalFault === "source-refused") return Response.json({ answer: "refused", reason: "bad-field", name: "test-refusal", judgedAt: { seq: 99, hash: textDigest("fixture refusal") } });
      }
      const response = await routed(url, init);
      if (intent?.kind) {
        const answer = await response.clone().json() as { answer: string; receipt?: { fact: FactRef } };
        if (answer.answer === "accepted") accepted.push({ kind: intent.kind, ...(intent.fields?.path ? { path: intent.fields.path } : {}), fact: answer.receipt!.fact });
      }
      if (sourceRequests === 2 && intent?.kind === "propose-file" && proposalFault === "source-reply" || intent?.kind === "propose-manifest" && proposalFault === "manifest-reply") throw new Error("TEST private partial-proposal transport detail");
      return response;
    }) as unknown as Fetch;
    founder.git = { run: async () => 0, files: async () => ({ ok: true, tip: first, files: [{ path: "one.md", bytes: files["one.md"]! }, { path: "docs/two.md", bytes: files["docs/two.md"]! }] }) };
    const result = await command({ ...founder, fetch: faultFetch }, ["propose", "partial"]);
    expect(result.code, result.lines.join("\n")).toBe(1);
    expect(accepted.some((entry) => entry.kind === "open-pr"), result.lines.join("\n")).toBe(true);
    const opening = accepted.find((entry) => entry.kind === "open-pr")!.fact;
    const rules = accepted.find((entry) => entry.kind === "ask-rules")!.fact;
    expect(result.lines).toContain(`Recorded opening: ${opening.at.scope}:${opening.seq}, hash ${opening.hash}.`);
    expect(result.lines).toContain(`Recorded rules request: ${rules.at.scope}:${rules.seq}, hash ${rules.hash}.`);
    if (proposalFault !== "rules-read") {
      const source = accepted.find((entry) => entry.kind === "propose-file")!;
      expect(result.lines).toContain(`Recorded source ${source.path}: ${source.fact.at.scope}:${source.fact.seq}, hash ${source.fact.hash}.`);
    }
    expect(result.lines).toContain(`Known change lane: ${rules.at.scope}.`);
    expect(result.lines.at(-1)).toContain("A fresh propose or edit opens another change lane and signs new requests");
    expect(result.lines.join("\n")).toContain(proposalFault === "source-refused" ? ": refused." : proposalFault === "source-mismatch" ? ": mismatch." : proposalFault === "rules-read" ? "No current mutation request was submitted in this phase." : ": outcome unknown.");
    expect(result.lines.join("\n")).not.toContain("TEST private");
    if (proposalFault === "source-refused") expect(result.lines[0]).toContain("test-refusal");
    expect(host.refs.get("refs/heads/main")).toBe(first);
    return;
  }
  if (linkFault) {
    files["issue-demo.json"] = utf8(canonicalize(issueDemo));
    ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
    for (const [name, definition, file] of [["issue", issueDemo, "issue-demo.json"], ["change", changeDemo3, "change3.json"]] as const) ok(await run(founder, "act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(definition)}`, "--set", `name=${name}`, "--value", file));
    ok(await run(founder, "issue", "open", "--title", "A page is missing"));
    let manifest: FactRef | null = null;
    let sources = 0, links = 0, merges = 0;
    const faultFetch = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (manifest && linkFault === "summary" && path === `/v1/scopes/${manifest.at.scope}`) throw new Error("TEST private linking transport detail");
      const kind = init?.method === "POST" && path.endsWith("/acts") ? (JSON.parse(String(init.body)) as { signed?: { intent?: { kind?: string } } }).signed?.intent?.kind : undefined;
      if (kind === "propose-file") sources++;
      if (kind === "merge") merges++;
      if (kind === "link-own") {
        links++;
        if (linkFault === "request") throw new Error("TEST private linking transport detail");
        if (linkFault === "unavailable") return Response.json({ answer: "unavailable", reason: "busy" });
      }
      const response = await routed(url, init);
      if (kind === "propose-manifest") {
        const answer = await response.clone().json() as { answer: string; receipt?: { fact: FactRef } };
        if (answer.answer === "accepted") manifest = answer.receipt!.fact;
      }
      if (kind === "link-own" && linkFault === "reply") throw new Error("TEST private linking transport detail");
      return response;
    }) as unknown as Fetch;
    const result = await command({ ...founder, fetch: faultFetch }, ["edit", "one.md", "--file", "one.md", "--closes", "1"]);
    expect(manifest).not.toBeNull();
    const recorded = manifest as unknown as FactRef;
    expect(result.lines[0]).toBe(`Proposed one.md (${files["one.md"]!.length} bytes) as change ${recorded.at.scope}, version ${recorded.seq}.`);
    const entries = await new Platform(recorded.at.scope).entries();
    const acts = entries.filter((entry) => entry.input.type === "act").map((entry) => entry.input.type === "act" ? entry.input.signed.intent.kind : "");
    expect([sources, acts.filter((kind) => kind === "propose-file").length, acts.filter((kind) => kind === "propose-manifest").length]).toEqual([1, 1, 1]);
    if (linkFault === "accepted") {
      expect([result.code, links, merges]).toEqual([0, 1, 1]);
      expect(result.lines[1]).toMatch(/^Linked: when it is published,/);
      expect(result.lines[2]).toMatch(/^Published: commit/);
    } else {
      expect([result.code, links, merges, acts.filter((kind) => kind === "link-own").length, host.refs.get("refs/heads/main")]).toEqual([1, linkFault === "summary" ? 0 : 1, 0, linkFault === "reply" ? 1 : 0, first]);
      expect(result.lines[1]).toMatch(linkFault === "unavailable" ? /^Unavailable: busy\./ : /^Linking could not be confirmed: a required request or reply was unavailable\.$/);
      expect(result.lines.at(-1)).toBe(`Inspect artroom show ${recorded.at.scope}:${recorded.seq} and artroom log ${recorded.at.scope} before another edit, link or merge. The proposal is recorded; linking was not confirmed and no mutation was retried.`);
      expect(acts).not.toContain("merge");
    }
    expect(result.lines.join("\n")).not.toContain("TEST private linking transport detail");
    return;
  }
  if (unknownDeleteOnly) {
    ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
    ok(await run(founder, "act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "change3.json"));
    founder.git = { run: async () => 0, files: async () => ({ ok: true, tip: first, files: [{ path: "one.md", bytes: files["one.md"]! }, { path: "docs/two.md", bytes: files["two.md"]! }] }) };
    const proposed = ok(await run(founder, "propose", "delete-unknown"));
    await pause([repository.destination]);
    expect(proposed.lines[1]).toMatch(/^Published:/);
    const publication = (await G.summary()).value.items.find((item) => item.type === "publication")!;
    expect(publication.state).toBe("published");
    expect((await G.entries()).some((entry) => entry.input.type === "outcome" && entry.input.kind === "reservation-delete" && entry.input.result === "unknown")).toBe(true);
    if (exhaustCleanup) {
      for (let attempt = 0; attempt < 4; attempt++) { net.clock.now = timeOf(timeMs(net.clock.now)! + 2000); await pause([repository.destination]); }
      expect((await G.item(publication.id)).values["cleanupAttempts"]).toBe(3);
      const held = confirmedDelete as unknown as { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers };
      expect(held.request.attempt).toBe(1);
      expect(await runInDurableObject(G.object, () => held.late(held.request.operation, held.request.attempt, held.answer))).toMatchObject({ recorded: "written" });
      expect((await G.item(publication.id)).values["cleanupReason"]).toEqual({ tokenReason: "reservation-token-unknown", tokenAttempts: 3, refRemoved: true });
      const later = lastDelete as unknown as { request: import("../../scope/src/operations.ts").EffectRequest; late: import("../../scope/src/operations.ts").LateAnswers };
      expect(later.request.attempt).toBe(3);
      expect(await runInDurableObject(G.object, () => later.late(later.request.operation, later.request.attempt, { result: "refused", evidence: { basis: "own-answer", body: { send: "refused", seen: "failed" } } }))).toMatchObject({ recorded: "written" });
      expect((await G.item(publication.id)).values["cleanupReason"]).toEqual({ tokenReason: "reservation-token-unknown", tokenAttempts: 3, refRemoved: true });
      expect((await G.item(publication.id)).values["cleanupAttempts"]).toBe(3);
      const verified = await run(founder, "verify", "--all");
      expect(verified.lines.join("\n")).toContain("reservation-token-unknown; attempts 3");
      expect(verified.lines.join("\n")).not.toContain("reservation-ref-unknown;");
    }
    const retry = await run(founder, "act", "resend", "--on", "destination", "--target", String(publication.id));
    expect([retry.code, retry.lines[0]]).toEqual([1, expect.stringContaining("resend-not-due")]);
    return;
  }
  const invitation = ok(await run(founder, "invite", "@check", "--role", "checker")).lines[1]!.split(": ")[1]!;
  ok(await run(checker, "join", invitation));
  const checkMember = { membership: repository.membership, member: "@check" };
  const checkConfig = { name: "text", image: `sha256:${"7".repeat(64)}`, environment: [], steps: [["check", "text"]], judged: { passed: { status: 0, line: "ok" }, failed: { status: 1, line: "bad" } }, limits: { seconds: 60, outputBytes: 65536 } };
  files["config.json"] = utf8(canonicalize(checkConfig));
  const configuration = valueDigest(CONFIGURATION_DOMAIN, checkConfig);
  ok(await run(founder, "act", "keep-configuration", "--on", "rules", "--set", `digest=${configuration}`, "--set", "name=text", "--value", "config.json"));
  ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", `checks=${JSON.stringify([{ name: "text", configuration, required: true, checker: checkMember }])}`, "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [{ name: "text", required: true }] }))}`));
  ok(await run(founder, "act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(activeChange)}`, "--set", "name=change", "--value", "change3.json"));
  founder.git = { run: async () => 0, files: async () => ({ ok: true, tip: first, files: [{ path: "one.md", bytes: files["one.md"]! }, { path: "docs/two.md", bytes: files["two.md"]! }] }) };
  if (nonemptyProfile) {
    const opened = ok(await run(founder, "act", "open-pr", "--on", "directory", "--set", `definition=${definitionDigest(activeChange)}`, "--set", "title=nonempty admission", "--set", "draft=false", "--value", "change3.json"));
    const openSeq = Number(/entry \S+:(\d+),/.exec(opened.lines[0]!)![1]);
    const D = new Platform(repository.directory.scope); await pause([D.name]);
    const lane = await D.created(openSeq); await pause([lane.name]);
    const empty = await run(founder, "act", "propose-manifest", "--on", lane.name, "--set", `base=${first}`, "--set", "files=[]");
    expect([empty.code, empty.lines[0]]).toEqual([1, expect.stringContaining("empty-manifest")]);
    expect((await lane.summary()).value.items.some((item) => item.type === "manifest")).toBe(false);
    const source = ok(await run(founder, "act", "propose-file", "--on", lane.name, "--set", `base=${first}`, "--set", "path=one.md", "--set", `digest=${digestBytes(files["one.md"]!)}`, "--set", `size=${files["one.md"]!.length}`, "--set", "content=# One\n"));
    const sourceSeq = Number(/entry \S+:(\d+),/.exec(source.lines[0]!)![1]);
    const row = { path: "one.md", entry: factRefOf((await lane.entries())[sourceSeq]!), digest: digestBytes(files["one.md"]!) };
    ok(await run(founder, "act", "propose-manifest", "--on", lane.name, "--set", `base=${first}`, "--set", `files=${JSON.stringify([row])}`));
    const manifest = (await lane.summary()).value.items.find((item) => item.type === "manifest")!;
    expect([manifest.state, manifest.values["complete"], manifest.values["files"]]).toEqual(["current", true, [{ ...row, entry: sourceSeq }]]);
    const closed = await run(founder, "act", "propose-file", "--on", lane.name, "--set", `base=${first}`, "--set", "path=two.md", "--set", `digest=${digestBytes(files["two.md"]!)}`, "--set", `size=${files["two.md"]!.length}`, "--set", "content=# Two\n");
    expect([closed.code, closed.lines[0]]).toEqual([1, expect.stringContaining("collection-closed")]);
    return;
  }
  if ((exhaustCleanup && !unknownStageOnly) || unknownMintOnly) {
    const proposed = ok(await run(founder, "propose", "cleanup-exhausted"));
    const matched = /as change (sc_\S+), version (\d+)\./.exec(proposed.lines[0]!)!;
    const lane = new Platform(matched[1] as ScopeId), version = Number(matched[2]);
    const manifest = await lane.item(version), ref = manifest.values["reservationRef"] as string;
    const expiring = (await G.summary()).value.items.find((item) => item.type === "publication" && item.state === "reserved")!;
    if (exhaustCleanup === "ref") {
      // One real read-boundary witness; the other cleanup variants retain
      // their own native expiry/outcomes below, without repeating this proof.
      const beforeRead = await G.summary();
      const databaseDigest = () => runInDurableObject(G.object, async (_instance, state) => {
        const tables = state.storage.sql.exec("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").toArray();
        const rows = tables.map((table) => { const name = table["name"] as string; return [name, state.storage.sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray()]; });
        return digestBytes(utf8(canonicalize(rows)));
      });
      const beforeDatabase = await databaseDigest(), sendsBeforeRead = outsideSends;
      expect(beforeRead.value.reservationExpiry).toEqual({ clock: "available", time: net.clock.now, expired: [] });
      net.clock.now = timeOf(timeMs(net.clock.now)! + 1800_000);
      const expiredClock = net.clock.now;
      const founderConfig = (await founder.store.config())!;
      const founderSecret = (await founder.store.secret(founderConfig.key))!;
      const session = await requestSession(SERVICE, repository.membership.scope, sessionRequest(repository.membership, founderSecret, timeOf(timeMs(expiredClock)! + 60_000), "expiry-read-session"), { fetch });
      expect(session.ok).toBe(true);
      if (!session.ok) throw new Error("native session unavailable");
      const sessionRead = await G.stub.summary(session.session.reader());
      expect(sessionRead.ok && sessionRead.value.reservationExpiry).toEqual({ clock: "available", time: expiredClock, expired: [expiring.id] });
      // Script the final projection reading after authentic Session authorization.
      // Count the real warm path, without bypassing or changing that authorization.
      const readClock = net.clock.read;
      let sessionClockReads = 0;
      net.clock.read = () => { sessionClockReads++; return expiredClock; };
      try { expect((await G.stub.summary(session.session.reader())).ok).toBe(true); }
      finally { net.clock.read = readClock; }
      expect(sessionClockReads).toBeGreaterThan(1);
      let fallibleReads = 0;
      net.clock.read = () => { if (++fallibleReads === sessionClockReads) throw new Error("scripted final projection clock unavailable"); return expiredClock; };
      try {
        const fallible = await G.stub.summary(session.session.reader());
        expect(fallible.ok && fallible.value.reservationExpiry).toEqual({ clock: "unavailable" });
      } finally { net.clock.read = readClock; }
      const signed = await signedReader({ key: keyIdOfSecret(founderSecret), sign: (bytes) => sign(founderSecret, bytes) }, G.name, "summary", "summary", { now: () => timeMs(expiredClock)! });
      const expiredRead = await G.summary();
      expect([expiredRead.at, expiredRead.value.items.find((item) => item.id === expiring.id)?.state, expiredRead.value.reservationExpiry]).toEqual([beforeRead.at, "reserved", { clock: "available", time: expiredClock, expired: [expiring.id] }]);
      net.clock.now = timeOf(timeMs(beforeRead.value.time)! - 1);
      const behindRead = await G.summary();
      expect(await G.stub.summary(session.session.reader())).toEqual({ ok: false, reason: "clock-behind" });
      expect(await G.stub.summary(signed)).toEqual({ ok: false, reason: "clock-behind" });
      expect([behindRead.at, behindRead.value.reservationExpiry]).toEqual([beforeRead.at, { clock: "unavailable" }]);
      net.clock.now = "unavailable-test-clock" as typeof net.clock.now;
      const unavailableRead = await G.summary();
      expect([unavailableRead.at, unavailableRead.value.reservationExpiry]).toEqual([beforeRead.at, { clock: "unavailable" }]);
      const clockRead = net.clock.read;
      net.clock.read = () => { throw new Error("scripted unavailable clock"); };
      try { expect((await G.summary()).value.reservationExpiry).toEqual({ clock: "unavailable" }); }
      finally { net.clock.read = clockRead; }
      net.clock.now = expiredClock;
      const pendingCleanup = await run(founder, "verify", "--all");
      expect(pendingCleanup.code, pendingCleanup.lines.join("\n")).toBe(1);
      expect(pendingCleanup.lines.join("\n")).toContain(`reservation ${expiring.id}`);
      expect(pendingCleanup.lines.join("\n")).toContain("waits for the next act or alarm");
      expect(pendingCleanup.lines.join("\n")).not.toContain("Owed cleanup:");
      expect([await databaseDigest(), outsideSends]).toEqual([beforeDatabase, sendsBeforeRead]);
    } else {
      net.clock.now = timeOf(timeMs(net.clock.now)! + 1800_000);
    }
    await run(founder, "act", "add-room", "--on", "destination", "--target", String(expiring.id));
    expect((await G.entries()).filter((entry) => entry.input.type === "timed" && entry.input.item === expiring.id && entry.effects.some((effect) => effect.effect === "operation" && effect.kind === "reservation-delete" && effect.attempts === 3))).toHaveLength(1);
    for (let attempt = 0; attempt < 4; attempt++) { await pause([repository.destination]); net.clock.now = timeOf(timeMs(net.clock.now)! + 2000); }
    const owed = (await G.summary()).value.items.find((item) => item.type === "publication" && item.state === "cleanup-owed")!;
    if (unknownMintOnly) {
      expect([owed.values["cleanupAttempts"], owed.values["cleanupReason"], host.refs.has(ref)]).toEqual([2, { tokenReason: "reservation-token-unknown", tokenAttempts: 1, refRemoved: true }, false]);
      const verified = await run(founder, "verify", "--all");
      expect(verified.lines.join("\n")).toContain("reservation-token-unknown; attempts 1");
      const held = pendingMint as unknown as { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers };
      releaseMint = true;
      expect(await runInDurableObject(G.object, () => held.late(held.request.operation, held.request.attempt, held.answer))).toMatchObject({ recorded: "written" });
      await pause([repository.destination]);
      expect((await G.entries()).some((entry) => entry.effects.some((effect) => effect.effect === "state" && effect.item === expiring.id && effect.state === "cleaned"))).toBe(true);
      expect((await G.summary()).value.items.some((item) => item.id === expiring.id)).toBe(false);
      expect((await G.entries()).flatMap((entry) => entry.effects).filter((effect) => effect.effect === "value" && effect.item === expiring.id && effect.slot === "cleanupAttempts").at(-1)).toMatchObject({ value: 2 });
      return;
    }
    expect([owed.values["cleanupAttempts"], owed.values["cleanupReason"], host.refs.has(ref), host.refs.get("refs/heads/main")]).toEqual([exhaustCleanup === "ref" ? 3 : 1, exhaustCleanup === "ref" ? { refReason: "reservation-ref", tokenAttempts: 0, refRemoved: false } : { tokenReason: exhaustCleanup === "token-unknown" ? "reservation-token-unknown" : "reservation-token", tokenAttempts: 3, refRemoved: true }, exhaustCleanup === "ref", first]);
    const deletions = (await G.entries()).filter((entry) => entry.input.type === "outcome" && entry.input.kind === "reservation-delete");
    expect(deletions.map((entry) => entry.input.type === "outcome" ? entry.input.attempt : null)).toEqual(exhaustCleanup === "ref" ? [1, 2, 3] : [1]);
    await pause([repository.destination]);
    expect((await G.entries()).filter((entry) => entry.input.type === "outcome" && entry.input.kind === "reservation-delete")).toHaveLength(exhaustCleanup === "ref" ? 3 : 1);
    const replayed = await verify(httpSource(SERVICE, { fetch: routed, reader }), { mode: "replay", scope: G.name, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE, head: (await G.summary()).at });
    expect([replayed.report.result, replayed.why ?? null]).toEqual(["consistent", null]);
    const verified = await run(founder, "verify", "--all");
    expect(verified.code, verified.lines.join("\n")).toBe(1);
    expect(verified.lines.join("\n")).toContain(`reservation ${owed.id}, entry`);
    expect(verified.lines.join("\n")).toContain(`${exhaustCleanup === "ref" ? "reservation-ref" : exhaustCleanup === "token-unknown" ? "reservation-token-unknown" : "reservation-token"}; attempts 3`);
    return;
  }
  if (refusePushOnly) {
    const proposed = ok(await run(founder, "propose", "refused-push"));
    const matched = /as change (sc_\S+), version (\d+)\./.exec(proposed.lines[0]!)!;
    const lane = new Platform(matched[1] as ScopeId), version = Number(matched[2]);
    const manifest = await lane.item(version), ref = manifest.values["reservationRef"] as string;
    const requested = ok(await run(founder, "act", "request-check", "--on", lane.name, "--set", `manifest=${version}`, "--set", "name=text", "--set", `configuration=${configuration}`));
    await pause([lane.name, repository.destination]);
    const job = Number(/entry \S+:(\d+),/.exec(requested.lines[0]!)![1]);
    ok(await run(checker, "act", "check", "--on", lane.name, "--set", `job=${job}`, "--set", `tree=${manifest.values["tree"]}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed"));
    for (let attempt = 0; attempt < 3; attempt++) { await pause([lane.name, repository.destination]); net.clock.now = timeOf(timeMs(net.clock.now)! + 2000); }
    await pause([lane.name, repository.destination]);
    expect([host.refs.get("refs/heads/main"), host.refs.has(ref)]).toEqual([first, false]);
    expect((await G.entries()).some((entry) => entry.effects.some((effect) => effect.effect === "state" && effect.state === "cleanup-aborted"))).toBe(true);
    expect((await G.entries()).some((entry) => entry.effects.some((effect) => effect.effect === "state" && effect.state === "cleaned"))).toBe(true);
    return;
  }
  if (unknownStageOnly) {
    const unknown = await run(founder, "propose", "stage-unknown");
    expect(unknown.code).toBe(1);
    expect(unknown.lines.some((line) => line.includes("Observation unknown"))).toBe(true);
    const publication = (await G.summary()).value.items.find((item) => item.type === "publication")!;
    expect([publication.state, publication.values["reason"], host.refs.get("refs/heads/main")]).toEqual(["reserved", "reservation-stage-unknown", first]);
    const events = await G.entries();
    expect(events.some((entry) => entry.input.type === "outcome" && entry.input.kind === "reservation-stage" && entry.input.result === "unknown")).toBe(true);
    expect(events.some((entry) => entry.effects.some((effect) => effect.effect === "operation" && effect.kind === "push"))).toBe(false);
    const matched = /as change (sc_\S+), version (\d+)\./.exec(unknown.lines[0]!)!;
    const lane = new Platform(matched[1] as ScopeId);
    const merge = (await lane.summary()).value.items.find((item) => item.type === "merge")!;
    const reservation = events[publication.values["reservedAt"] as number]!;
    const ref = `refs/artroom/reservations/${factRefOf(reservation).hash.slice(7)}`;
    expect(host.refs.has(ref)).toBe(true);
    ok(await run(founder, "act", "cancel-merge", "--on", lane.name, "--target", String(merge.id)));
    await pause([lane.name, repository.destination]);
    for (let attempt = 0; attempt < 4; attempt++) { await pause([repository.destination]); net.clock.now = timeOf(timeMs(net.clock.now)! + 2000); }
    expect([(await G.item(publication.id)).state, (await G.item(publication.id)).values["cleanupReason"], host.refs.has(ref), (await G.item(0)).refs["slot"] ?? null]).toEqual(["cleanup-owed", { refReason: "reservation-stage-unknown", ...(exhaustCleanup ? { tokenReason: "reservation-token" } : {}), tokenAttempts: exhaustCleanup ? 3 : 0, refRemoved: false }, false, null]);
    expect((await G.entries()).filter((entry) => entry.input.type === "outcome" && entry.input.kind === "reservation-delete")).toHaveLength(1);
    expect((await G.item(publication.id)).values["cleanupAttempts"]).toBe(1);
    if (exhaustCleanup) {
      const verified = await run(founder, "verify", "--all");
      expect(verified.lines.join("\n")).toContain("reservation-stage-unknown; attempts 1");
      expect(verified.lines.join("\n")).toContain("reservation-token; attempts 3");
    }
    const retry = await run(founder, "act", "resend", "--on", "destination", "--target", String(publication.id));
    expect([retry.code, retry.lines[0]]).toEqual([1, expect.stringContaining("resend-not-due")]);
    // Settle that exact original stage answer; a remaining cleanup operation
    // is recorded with only the unused portion of the three-attempt ceiling.
    const heldStage = pendingStage as unknown as { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers };
    expect(await runInDurableObject(G.object, () => heldStage.late(heldStage.request.operation, heldStage.request.attempt, heldStage.answer))).toMatchObject({ recorded: "written" });
    await pause([repository.destination]);
    for (let attempt = 0; attempt < 3; attempt++) { net.clock.now = timeOf(timeMs(net.clock.now)! + 2000); await pause([repository.destination]); }
    const cleanupEntries = (await G.entries()).filter((entry) => entry.input.type === "outcome" && entry.input.kind === "reservation-delete");
    expect(cleanupEntries).toHaveLength(3);
    // The new marked deletion sees absence, but receives no decisive own
    // mutation answer. The original stage is now known; ref custody stays unknown.
    expect([(await G.item(publication.id)).state, (await G.item(publication.id)).values["cleanupReason"], (await G.item(publication.id)).values["cleanupAttempts"], host.refs.has(ref)]).toEqual(["cleanup-owed", { refReason: "reservation-ref-unknown", ...(exhaustCleanup ? { tokenReason: "reservation-token" } : {}), tokenAttempts: exhaustCleanup ? 3 : 0, refRemoved: false }, 3, false]);
    if (exhaustCleanup) {
      const held = earlierDelete as unknown as { request: import("../../scope/src/operations.ts").EffectRequest; late: import("../../scope/src/operations.ts").LateAnswers };
      expect(held.request.attempt).toBe(1);
      expect(await runInDurableObject(G.object, () => held.late(held.request.operation, held.request.attempt, { result: "refused", evidence: { basis: "own-answer", body: { send: "refused", seen: "failed" } } }))).toMatchObject({ recorded: "written" });
      expect((await G.item(publication.id)).values["cleanupAttempts"]).toBe(3);
      expect((await G.item(publication.id)).values["cleanupReason"]).toEqual({ refReason: "reservation-ref-unknown", tokenReason: "reservation-token", tokenAttempts: 3, refRemoved: false });
    }
    return;
  }
  if (startedOnly) {
    const proposed = ok(await run(founder, "propose", "started"));
    const matched = /as change (sc_\S+), version (\d+)\./.exec(proposed.lines[0]!)!;
    const lane = new Platform(matched[1] as ScopeId), version = Number(matched[2]);
    const manifest = await lane.item(version);
    const requested = ok(await run(founder, "act", "request-check", "--on", lane.name, "--set", `manifest=${version}`, "--set", "name=text", "--set", `configuration=${configuration}`));
    await pause([lane.name, repository.destination]);
    const job = Number(/entry \S+:(\d+),/.exec(requested.lines[0]!)![1]);
    holdPush = true;
    ok(await run(checker, "act", "check", "--on", lane.name, "--set", `job=${job}`, "--set", `tree=${manifest.values["tree"]}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed"));
    await pause([lane.name, repository.destination]);
    const beforeRetry = host.refs.get("refs/heads/main");
    const retry = ok(await run(founder, "act", "request-check", "--on", lane.name, "--set", `manifest=${version}`, "--set", `earlier=${job}`, "--set", "name=text", "--set", `configuration=${configuration}`));
    await pause([lane.name, repository.destination]);
    const refusal = (await lane.entries()).find((entry) => entry.input.type === "delivery" && entry.input.message.class === "result" && entry.input.message.reason?.name === "publication-started");
    expect(refusal).toBeDefined();
    expect([(await lane.item(job)).state, host.refs.get("refs/heads/main"), retry.code]).toEqual(["passed", beforeRetry, 0]);
    const publications = (await G.summary()).value.items.filter((item) => item.type === "publication");
    expect(publications.some((item) => ["publishing", "unresolved"].includes(item.state))).toBe(true);
    return;
  }
  if (!oneFileOnly) {
    // Freeze the wrong-source controls on a separately opened collection.
    const opened = ok(await run(founder, "act", "open-pr", "--on", "directory", "--set", `definition=${definitionDigest(changeDemo3)}`, "--set", "title=source controls", "--set", "draft=false", "--value", "change3.json"));
    const openSeq = Number(/entry \S+:(\d+),/.exec(opened.lines[0]!)![1]);
    const D = new Platform(repository.directory.scope); await pause([D.name]);
    const controlLane = await D.created(openSeq); await pause([controlLane.name]);
    const source = ok(await run(founder, "act", "propose-file", "--on", controlLane.name, "--set", `base=${first}`, "--set", "path=one.md", "--set", `digest=${digestBytes(files["one.md"]!)}`, "--set", `size=${files["one.md"]!.length}`, "--set", "content=# One\n"));
    const sourceSeq = Number(/entry \S+:(\d+),/.exec(source.lines[0]!)![1]);
    const sourceEntry = (await controlLane.entries())[sourceSeq]!;
    const row = { path: "one.md", entry: factRefOf(sourceEntry), digest: digestBytes(files["one.md"]!) };
    const mismatch = await run(founder, "act", "propose-manifest", "--on", controlLane.name, "--set", `base=${first}`, "--set", `files=${JSON.stringify([{ ...row, digest: `sha256:${"e".repeat(64)}` }])}`);
    expect([mismatch.code, mismatch.lines[0]]).toEqual([1, expect.stringContaining("source-mismatch")]);
  }
  const proposed = oneFileOnly ? await run(founder, "edit", "one.md", "--file", "one.md") : await run(founder, "propose", "topic");
  ok(proposed);
  const matched = /as change (sc_\S+), version (\d+)\./.exec(proposed.lines[0]!)!;
  const [lane, version] = [matched[1]!, Number(matched[2])];
  const L = new Platform(lane as ScopeId);
  const manifest = await L.item(version);
  expect([manifest.values["tree"], manifest.values["integration"], host.refs.get("refs/heads/main")]).toEqual([expect.stringMatching(/^[0-9a-f]{40}$/), expect.stringMatching(/^[0-9a-f]{40}$/), first]);
  expect(proposed.lines[1]).toMatch(/^Reserved: merge/);
  const reservationRef = manifest.values["reservationRef"] as string;
  expect([reservationRef, host.refs.get(reservationRef)]).toEqual([expect.stringMatching(/^refs\/artroom\/reservations\/[0-9a-f]{64}$/), manifest.values["integration"]]);
  const requested = ok(await run(founder, "act", "request-check", "--on", lane, "--set", `manifest=${version}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  const job = Number(/entry \S+:(\d+),/.exec(requested.lines[0]!)![1]);
  await pause([lane, repository.destination]);
  expect((await L.item(job)).values["tree"]).toBe(manifest.values["tree"]);
  if (!oneFileOnly) {
    const badTree = await run(checker, "act", "check", "--on", lane, "--set", `job=${job}`, "--set", `tree=${"e".repeat(40)}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed");
    expect([badTree.code, badTree.lines[0], host.refs.get("refs/heads/main")]).toEqual([1, expect.stringContaining("not-this-job"), first]);
  }
  const checkerSecret = (await checker.store.secret((await checker.store.config())!.key))!;
  const checkerKey = keyIdOfSecret(checkerSecret);
  const Gsnapshot = { reservationSnapshot: async (asked: import("@generalbusiness/artroom-contract").SignedIntent): Promise<import("@generalbusiness/artroom-contract").ReservationSnapshot | { refused: "reservation-stage-missing" | "reservation-stage-mismatch" } | null> => {
    const response = await routed(`${SERVICE}/v1/scopes/${G.name}/reservation-snapshot`, { method: "POST", headers: { "content-type": "application/json" }, body: canonicalize({ signed: asked }) });
    if (response.status === 409) return await response.json() as { refused: "reservation-stage-missing" | "reservation-stage-mismatch" };
    if (response.status !== 200) return null;
    const value = await response.json() as Omit<import("@generalbusiness/artroom-contract").ReservationSnapshot, "objects"> & { objects: { id: string; type: "blob" | "tree" | "commit"; data: string }[] };
    return { ...value, objects: value.objects.map((object) => ({ ...object, data: unb64url(object.data)! })) };
  } };
  let runs = 0, prepares = 0, snapshots = 0;
  let loseSubmit = true, refuseSnapshot = false;
  const serviceOptions: ConstructorParameters<typeof CheckerService>[0] = {
    signer: { key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, outcomes: new Outcomes(new MemoryDurable()), clock: now, random: (length) => crypto.getRandomValues(new Uint8Array(length)),
    scopes: {
      entry: async (_scope, seq) => (await L.sealed())[seq] ?? null,
      pinned: async () => definitionDigest(changeDemo3), activated: async () => ({ name: "change", state: "active" }),
      configuration: async () => canonicalize(checkConfig),
      reservationSnapshot: async (_scope, asked) => { snapshots++; return refuseSnapshot ? null : Gsnapshot.reservationSnapshot(asked); },
      prepare: async () => { prepares++; throw new Error("reservation snapshot must mint nothing"); },
      standing: async (_scope, id, kind) => { const items = (await L.summary()).value.items; const item = items.find((item) => item.id === id); return item ? { state: item.state, expected: expectedOf(changeDemo3.acts[kind] as unknown as ActShape, items, null, { job: id }) } : null; },
      submit: async (_scope, signed) => { if (loseSubmit) { loseSubmit = false; throw new Error("reply unavailable"); } return L.stub.submit(signed, []); },
    },
    // Runner boundary STAND-IN here; actual object checkout is tested in checkers/runner.test.ts.
    runner: { find: async () => null, run: async (ask) => { runs++; expect(ask.job.snapshot?.tree).toBe(manifest.values["tree"]); expect(ask.job.snapshot?.sources).toHaveLength(oneFileOnly ? 1 : 2); return { started: true, image: checkConfig.image, environment: [], checkout: true, steps: [{ status: 0, line: "ok" }], end: "complete" }; } },
  };
  const service = new CheckerService(serviceOptions);
  const jobEntry = (await L.sealed())[job]!;
  const jobFact = factRefOf(jobEntry.entry);
  const readAsk = await signJobRead({ key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, { lane: await L.at(), fact: jobFact }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  const snapshot = await Gsnapshot.reservationSnapshot(readAsk);
  expect(snapshot).not.toBeNull();
  if (oneFileOnly) {
    if (!snapshot || "refused" in snapshot) expect.fail("The one-file checker origin must read its actual reservation");
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]!.entry.input).toMatchObject({ type: "act", signed: { intent: { kind: "propose-file", fields: { path: "one.md", digest: digestBytes(files["one.md"]!) } } } });
    expect(await verifyReservationObjects(snapshot)).toBe(true);
    expect(originOf({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string }, { entry: jobEntry, pinned: definitionDigest(changeDemo3), activated: { name: "change", state: "active" }, manifest: (await L.sealed())[version]!, reservation: snapshot })).toMatchObject({ job: { tree: manifest.values["tree"], commit: manifest.values["integration"] } });
    loseSubmit = false;
    expect(await service.deliver({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string })).toEqual({ did: "submitted", outcome: { act: "check", outcome: "passed" }, ran: true, lane: "admitted" });
    expect([runs, prepares, snapshots]).toEqual([1, 0, 1]);
    await pause([lane, repository.destination]);
    const published = host.refs.get("refs/heads/main")!;
    expect(published).not.toBe(first);
    expect(host.refs.has(reservationRef)).toBe(false);
    const git = readerOf(host); const commit = await git.commit(published);
    expect(commit.tree).toBe(manifest.values["tree"]);
    expect((await git.tree(commit.tree)).map((row) => new TextDecoder().decode(row.name))).toEqual(["README.md", "one.md"]);
    return;
  }
  // The signed job-read route obeys the destination's retained history floor,
  // including a rollback between the two existing key-observation pairs.
  const snapshotClock = net.clock.now, snapshotHead = await G.summary();
  const belowHistory = timeMs(snapshotHead.value.time)! - 1;
  net.clock.now = timeOf(belowHistory);
  expect((await Gsnapshot.reservationSnapshot(readAsk)) === null).toBe(true);
  net.clock.now = snapshotClock;
  rollbackSnapshotAt = belowHistory;
  expect((await Gsnapshot.reservationSnapshot(readAsk)) === null).toBe(true);
  expect(rollbackSnapshotAt).toBeNull();
  net.clock.now = snapshotClock;
  expect((await G.summary()).at).toEqual(snapshotHead.at);
  expect(await Gsnapshot.reservationSnapshot(readAsk)).not.toBeNull();
  if (snapshot && !("refused" in snapshot) && inject("demoRecord")) console.log("RESERVATION_RECORD", canonicalize({ snapshot: { ...snapshot, objects: snapshot.objects.map((object) => ({ ...object, data: b64url(object.data) })) }, configuration: checkConfig, configurationDigest: configuration, readAsk, destinationHead: (await G.summary()).at, laneHead: (await L.summary()).at }));
  const beforeSlow = net.clock.now;
  slowFinalKey = true;
  expect(await Gsnapshot.reservationSnapshot(readAsk)).toBeNull();
  slowFinalKey = false;
  net.clock.now = beforeSlow;
  if (snapshot && !("refused" in snapshot)) expect(originOf({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string }, { entry: jobEntry, pinned: definitionDigest(changeDemo3), activated: { name: "change", state: "active" }, manifest: (await L.sealed())[version]!, reservation: snapshot })).toMatchObject({ job: { tree: manifest.values["tree"], commit: manifest.values["integration"] } });
  if (snapshot && !("refused" in snapshot)) {
    expect(await verifyReservationObjects(snapshot)).toBe(true);
    const corrupt = { ...snapshot, objects: snapshot.objects.map((object, n) => n === 0 ? { ...object, data: Uint8Array.from([...object.data, 0]) } : object) };
    expect(await verifyReservationObjects(corrupt)).toBe(false);
    expect(originOf({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string }, { entry: jobEntry, pinned: definitionDigest(changeDemo3), activated: { name: "change", state: "active" }, manifest: (await L.sealed())[version]!, reservation: corrupt })).toEqual({ not: "no-manifest" });
  }
  const otherChecker = person();
  const otherInvitation = ok(await run(founder, "invite", "@other-checker", "--role", "checker")).lines[1]!.split(": ")[1]!;
  ok(await run(otherChecker, "join", otherInvitation));
  const savedStage = host.refs.get(reservationRef)!;
  host.refs.delete(reservationRef);
  expect(await service.deliver({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string })).toEqual({ did: "nothing", why: "reservation-stage-missing" });
  expect(runs).toBe(0);
  host.refs.set(reservationRef, first);
  expect(await service.deliver({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string })).toEqual({ did: "nothing", why: "reservation-stage-mismatch" });
  expect(runs).toBe(0);
  host.refs.set(reservationRef, savedStage);
  const wrongKey = (await otherChecker.store.secret((await otherChecker.store.config())!.key))!;
  const wrongAsk = await signJobRead({ key: keyIdOfSecret(wrongKey), sign: (bytes) => sign(wrongKey, bytes) }, { lane: await L.at(), fact: jobFact }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  expect(await Gsnapshot.reservationSnapshot(wrongAsk)).toBeNull();
  const delivered = await service.deliver({ lane: await L.at(), job: factRefOf(jobEntry.entry), name: "text", tree: manifest.values["tree"] as string });
  expect([delivered, runs, prepares]).toEqual([{ did: "submitted", outcome: { act: "check", outcome: "passed" }, ran: true, lane: "kept" }, 1, 0]);
  refuseSnapshot = true;
  const resumed = await new CheckerService(serviceOptions).deliver({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string });
  expect([resumed, runs, snapshots]).toEqual([{ did: "submitted", outcome: { act: "check", outcome: "passed" }, ran: false, lane: "admitted" }, 1, 3]);
  expect(await service.deliver({ lane: await L.at(), job: jobFact, name: "text", tree: manifest.values["tree"] as string })).toEqual({ did: "nothing", why: "closed" });
  expect(runs).toBe(1);
  await pause([lane, repository.destination]);
  const published = host.refs.get("refs/heads/main")!;
  expect(published).not.toBe(first);
  expect(host.refs.has(reservationRef)).toBe(false);
  const git = readerOf(host); const commit = await git.commit(published);
  expect(commit.tree).toBe(manifest.values["tree"]);
  expect((await git.tree(commit.tree)).map((row) => new TextDecoder().decode(row.name))).toEqual(oneFileOnly ? ["README.md", "one.md"] : ["README.md", "docs", "one.md"]);
  // The same command also waits for a publication when no check is owed.
  ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
  founder.git = { run: async () => 0, files: async () => ({ ok: true, tip: published, files: [{ path: "three.md", bytes: utf8("# Three\n") }, { path: "four.md", bytes: utf8("# Four\n") }] }) };
  const direct = ok(await run(founder, "propose", "next"));
  expect(direct.lines[1]).toMatch(/^Published: commit/);
  const lastPublished = host.refs.get("refs/heads/main")!;
  const blocked = person();
  const blockedInvite = ok(await run(founder, "invite", "@blocked", "--role", "maintainer")).lines[1]!.split(": ")[1]!;
  ok(await run(blocked, "join", blockedInvite));
  blocked.git = { run: async () => 0, files: async () => ({ ok: true, tip: lastPublished, files: [{ path: "AGENTS.md", bytes: utf8("# Authority\n") }, { path: "five.md", bytes: utf8("# Five\n") }] }) };
  const refused = await run(blocked, "propose", "policy");
  expect([refused.code, refused.lines[1], host.refs.get("refs/heads/main")]).toEqual([1, expect.stringContaining("rules-not-met:rules"), lastPublished]);
  // A authentic failed check ends its reservation and leaves the branch unchanged.
  ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", `checks=${JSON.stringify([{ name: "text", configuration, required: true, checker: checkMember }])}`, "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [{ name: "text", required: true }] }))}`));
  const failing = ok(await run(founder, "propose", "failed"));
  const failMatch = /as change (sc_\S+), version (\d+)\./.exec(failing.lines[0]!)!;
  const failLane = new Platform(failMatch[1] as ScopeId), failVersion = Number(failMatch[2]);
  const failManifest = await failLane.item(failVersion);
  const failRef = failManifest.values["reservationRef"] as string;
  const failRequested = ok(await run(founder, "act", "request-check", "--on", failLane.name, "--set", `manifest=${failVersion}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  await pause([failLane.name, repository.destination]);
  const failJob = Number(/entry \S+:(\d+),/.exec(failRequested.lines[0]!)![1]);
  ok(await run(checker, "act", "check", "--on", failLane.name, "--set", `job=${failJob}`, "--set", `tree=${failManifest.values["tree"]}`, "--set", `configuration=${configuration}`, "--set", "outcome=failed"));
  await pause([failLane.name, repository.destination]);
  expect([(await G.item(0)).refs["slot"] ?? null, host.refs.get("refs/heads/main")]).toEqual([null, lastPublished]);
  const failMerge = (await failLane.summary()).value.items.find((item) => item.type === "merge");
  expect(failMerge).toBeUndefined();
  expect(host.refs.has(failRef)).toBe(false);
  expect((await failLane.entries()).some((entry) => entry.effects.some((effect) => effect.effect === "value" && effect.slot === "reason" && effect.value === "required-check-failed"))).toBe(true);
  // A pass whose delivery waits while its job is superseded counts for none.
  const replacing = ok(await run(founder, "propose", "replacement"));
  const replacementMatch = /as change (sc_\S+), version (\d+)\./.exec(replacing.lines[0]!)!;
  const replacementLane = new Platform(replacementMatch[1] as ScopeId), replacementVersion = Number(replacementMatch[2]);
  const replacementManifest = await replacementLane.item(replacementVersion);
  const j1out = ok(await run(founder, "act", "request-check", "--on", replacementLane.name, "--set", `manifest=${replacementVersion}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  await pause([replacementLane.name, repository.destination]);
  const j1 = Number(/entry \S+:(\d+),/.exec(j1out.lines[0]!)![1]);
  const wireOnly = net.hold;
  net.hold = (envelope) => { if (wireOnly?.(envelope)) return true; return envelope.from.at.scope === replacementLane.name && envelope.message.class === "request" && envelope.message.type === "tell" && (envelope.message.body as { message?: string }).message === "checked"; };
  ok(await run(checker, "act", "check", "--on", replacementLane.name, "--set", `job=${j1}`, "--set", `tree=${replacementManifest.values["tree"]}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed"));
  await pause([replacementLane.name]);
  ok(await run(founder, "act", "request-check", "--on", replacementLane.name, "--set", `manifest=${replacementVersion}`, "--set", `earlier=${j1}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  net.hold = wireOnly;
  await pause([replacementLane.name, repository.destination]);
  expect(host.refs.get("refs/heads/main")).toBe(lastPublished);
  const replacementMerge = (await replacementLane.summary()).value.items.find((item) => item.type === "merge")!;
  ok(await run(founder, "act", "cancel-merge", "--on", replacementLane.name, "--target", String(replacementMerge.id)));
  await pause([replacementLane.name, repository.destination]);
  // J2's fence is local before its ACK makes it active in the lane.
  // During that interval J1 is still requested there but cannot read objects.
  const snapshotRace = ok(await run(founder, "propose", "snapshot-generation"));
  const snapshotMatch = /as change (sc_\S+), version (\d+)\./.exec(snapshotRace.lines[0]!)!;
  const snapshotLane = new Platform(snapshotMatch[1] as ScopeId), snapshotVersion = Number(snapshotMatch[2]);
  const snapshotJ1out = ok(await run(founder, "act", "request-check", "--on", snapshotLane.name, "--set", `manifest=${snapshotVersion}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  await pause([snapshotLane.name, repository.destination]);
  const snapshotJ1 = Number(/entry \S+:(\d+),/.exec(snapshotJ1out.lines[0]!)![1]);
  const snapshotJ1Fact = factRefOf((await snapshotLane.entries())[snapshotJ1]!);
  const snapshotJ1Ask = await signJobRead({ key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, { lane: await snapshotLane.at(), fact: snapshotJ1Fact }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  expect(await Gsnapshot.reservationSnapshot(snapshotJ1Ask)).not.toBeNull();
  const originalHold = net.hold;
  net.hold = (envelope) => originalHold?.(envelope) === true || (envelope.from.at.scope === G.name && envelope.message.class === "result" && envelope.message.of.from.at.scope === snapshotLane.name);
  const snapshotJ2out = ok(await run(founder, "act", "request-check", "--on", snapshotLane.name, "--set", `manifest=${snapshotVersion}`, "--set", `earlier=${snapshotJ1}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  await pause([snapshotLane.name, repository.destination]);
  expect((await snapshotLane.item(snapshotJ1)).state).toBe("requested");
  expect(await Gsnapshot.reservationSnapshot(snapshotJ1Ask)).toBeNull();
  net.hold = originalHold;
  net.clock.now = timeOf(timeMs(net.clock.now)! + 2000);
  await pause([snapshotLane.name, repository.destination]);
  const snapshotJ2 = Number(/entry \S+:(\d+),/.exec(snapshotJ2out.lines[0]!)![1]);
  const snapshotJ2Ask = await signJobRead({ key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, { lane: await snapshotLane.at(), fact: factRefOf((await snapshotLane.entries())[snapshotJ2]!) }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  expect(await Gsnapshot.reservationSnapshot(snapshotJ2Ask)).not.toBeNull();
  const snapshotMerge = (await snapshotLane.summary()).value.items.find((item) => item.type === "merge")!;
  ok(await run(founder, "act", "cancel-merge", "--on", snapshotLane.name, "--target", String(snapshotMerge.id)));
  await pause([snapshotLane.name, repository.destination]);
  // Read J1 as current, then fence J2 before offering that same old answer.
  const racing = ok(await run(founder, "propose", "read-before-fence"));
  const raceMatch = /as change (sc_\S+), version (\d+)\./.exec(racing.lines[0]!)!;
  const raceLane = new Platform(raceMatch[1] as ScopeId), raceVersion = Number(raceMatch[2]);
  const raceManifest = await raceLane.item(raceVersion);
  const raceRequest = ok(await run(founder, "act", "request-check", "--on", raceLane.name, "--set", `manifest=${raceVersion}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  await pause([raceLane.name, repository.destination]);
  const raceJ1 = Number(/entry \S+:(\d+),/.exec(raceRequest.lines[0]!)![1]);
  holdCheckAnswer = true;
  ok(await run(checker, "act", "check", "--on", raceLane.name, "--set", `job=${raceJ1}`, "--set", `tree=${raceManifest.values["tree"]}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed"));
  await pause([raceLane.name, repository.destination]);
  const heldAnswer = pendingCheck as unknown as { request: import("../../scope/src/operations.ts").EffectRequest; answer: import("../../scope/src/operations.ts").EffectAnswer; late: import("../../scope/src/operations.ts").LateAnswers };
  expect((heldAnswer.answer.evidence.body as { current: boolean }).current).toBe(true);
  const beforeFenceHold = net.hold;
  net.hold = (envelope) => beforeFenceHold?.(envelope) === true || (envelope.from.at.scope === raceLane.name && envelope.message.class === "request" && envelope.message.type === "tell" && (envelope.message.body as { message?: string }).message === "check-fence");
  const raceJ2out = ok(await run(founder, "act", "request-check", "--on", raceLane.name, "--set", `manifest=${raceVersion}`, "--set", `earlier=${raceJ1}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  const raceJ2 = Number(/entry \S+:(\d+),/.exec(raceJ2out.lines[0]!)![1]);
  expect((await raceLane.item(raceJ2)).state).toBe("queued");
  const premature = await run(checker, "act", "check", "--on", raceLane.name, "--set", `job=${raceJ2}`, "--set", `tree=${raceManifest.values["tree"]}`, "--set", `configuration=${configuration}`, "--set", "outcome=passed");
  expect([premature.code, premature.lines[0]]).toEqual([1, expect.stringContaining("job-not-active")]);
  net.hold = beforeFenceHold;
  net.clock.now = timeOf(timeMs(net.clock.now)! + 2000);
  await pause([raceLane.name, repository.destination]);
  expect((await raceLane.item(raceJ2)).state).toBe("requested");
  const offered = await runInDurableObject(G.object, () => heldAnswer.late(heldAnswer.request.operation, heldAnswer.request.attempt, heldAnswer.answer));
  expect(offered).toMatchObject({ recorded: "written" });
  holdCheckAnswer = false;
  await pause([raceLane.name, repository.destination]);
  expect(host.refs.get("refs/heads/main")).toBe(lastPublished);
  const raceMerge = (await raceLane.summary()).value.items.find((item) => item.type === "merge")!;
  ok(await run(founder, "act", "cancel-merge", "--on", raceLane.name, "--target", String(raceMerge.id)));
  await pause([raceLane.name, repository.destination]);
  // Cancelling a reserved change with no push releases the publication slot.
  const cancelled = ok(await run(founder, "propose", "cancel"));
  const cancelMatch = /as change (sc_\S+), version (\d+)\./.exec(cancelled.lines[0]!)!;
  const cancelLane = new Platform(cancelMatch[1] as ScopeId);
  const cancelRef = (await cancelLane.summary()).value.items.find((item) => item.type === "manifest")!.values["reservationRef"] as string;
  const cancelMerge = (await cancelLane.summary()).value.items.find((item) => item.type === "merge")!;
  ok(await run(founder, "act", "cancel-merge", "--on", cancelLane.name, "--target", String(cancelMerge.id)));
  await pause([cancelLane.name, repository.destination]);
  expect([(await G.item(0)).refs["slot"] ?? null, host.refs.get("refs/heads/main")]).toEqual([null, lastPublished]);
  expect(host.refs.has(cancelRef)).toBe(false);
  // No response at the recorded deadline ends both sides. The next reserve
  // reclaims the final slot before it opens another judge; no push was sent.
  const expired = ok(await run(founder, "propose", "expired"));
  const expireMatch = /as change (sc_\S+), version (\d+)\./.exec(expired.lines[0]!)!;
  const expireLane = new Platform(expireMatch[1] as ScopeId);
  const expireMerge = (await expireLane.summary()).value.items.find((item) => item.type === "merge")!;
  const expiringPublication = (await G.summary()).value.items.find((item) => item.type === "publication" && item.state === "reserved")!;
  net.clock.now = timeOf(timeMs(net.clock.now)! + 1800_000);
  await run(founder, "act", "add-room", "--on", "destination", "--target", String(expiringPublication.id)); // The ordinary act drains the expired reservation before judging the act.
  await runDurableObjectAlarm(expireLane.object);
  expect((await expireLane.summary()).value.items.some((item) => item.type === "merge")).toBe(false);
  expect((await expireLane.entries()).some((entry) => entry.effects.some((effect) => effect.effect === "value" && effect.slot === "reason" && effect.value === "required-check-timeout"))).toBe(true);
  expect(expireMerge.values["checkDeadline"]).toBe(net.clock.now);

  const expiredRef = (await expireLane.summary()).value.items.find((item) => item.type === "manifest")!.values["reservationRef"] as string;
  // The existing timed turn records its own cleanup operation; no resend act is required.
  await pause([repository.destination]);
  expect((await G.entries()).some((entry) => entry.input.type === "timed" && entry.input.item === expiringPublication.id && entry.effects.some((effect) => effect.effect === "operation" && effect.kind === "reservation-delete" && effect.attempts === 3))).toBe(true);
  expect(host.refs.has(expiredRef)).toBe(false);
  expect(host.refs.get("refs/heads/main")).toBe(lastPublished);
  // A second reservation cannot be disclosed to a compromised checker key.
  ok(await run(founder, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", `checks=${JSON.stringify([{ name: "text", configuration, required: true, checker: checkMember }])}`, "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [{ name: "text", required: true }] }))}`));
  const held = ok(await run(founder, "propose", "held"));
  const heldMatch = /as change (sc_\S+), version (\d+)\./.exec(held.lines[0]!)!;
  const heldLane = new Platform(heldMatch[1] as ScopeId), heldVersion = Number(heldMatch[2]);
  const heldRequest = ok(await run(founder, "act", "request-check", "--on", heldLane.name, "--set", `manifest=${heldVersion}`, "--set", "name=text", "--set", `configuration=${configuration}`));
  await pause([heldLane.name, repository.destination]);
  const heldJob = Number(/entry \S+:(\d+),/.exec(heldRequest.lines[0]!)![1]);
  const heldFact = factRefOf((await heldLane.entries())[heldJob]!);
  const heldAsk = await signJobRead({ key: checkerKey, sign: (bytes) => sign(checkerSecret, bytes) }, { lane: await heldLane.at(), fact: heldFact }, { now: now(), nonce: crypto.getRandomValues(new Uint8Array(16)) });
  expect(await Gsnapshot.reservationSnapshot(heldAsk)).not.toBeNull();
  const M = new Platform(repository.membership.scope);
  const keyItem = (await M.summary()).value.items.find((item) => item.type === "key" && item.values["id"] === checkerKey)!;
  ok(await run(founder, "act", "revoke-key", "--on", "membership", "--target", String(keyItem.id), "--set", "as=compromised"));
  expect(await Gsnapshot.reservationSnapshot(heldAsk)).toBeNull();
  expect(host.refs.get("refs/heads/main")).toBe(lastPublished);
  const replayed = await verify(httpSource(SERVICE, { fetch: routed, reader }), { mode: "replay", scope: G.name, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE, head: (await G.summary()).at });
  expect([replayed.report.result, replayed.why ?? null]).toEqual(["consistent", null]);
}

test("a native version-2 room refuses branch list proposals before local Git capture", async () => {
  const old = await legacyRoom();
  expect((await old.G.summary()).value.reservationExpiry).toBeUndefined();
  const directory = await old.D.at(), membership = await old.M.at();
  platformNet.inspector = reader;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32))); platformNet.sessions = true;
  try {
    const store = memoryStore(); await store.keep("founder", legacyFounder.secret);
    await store.save({ v: 1, service: SERVICE, key: "founder", repository: { directory, membership, rules: old.rules.name, destination: old.G.name } });
    let reads = 0;
    const outcome = await command({ store, fetch: ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch, now: () => timeMs(net.clock.now)!, git: { run: async () => 0, files: async () => { reads++; return { ok: false, reason: "should-not-read" }; } } }, ["propose", "topic"]);
    expect([outcome.code, outcome.lines[0], reads, (await old.G.summary()).value.definition]).toEqual([1, "Cannot propose: version-mismatch. This room has no manifest-list destination.", 0, "platform:destination@2"]);
  } finally { platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; }
});
