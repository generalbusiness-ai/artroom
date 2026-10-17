import { expect, test } from "vitest";
import { mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { join as pathJoin } from "node:path";
import { tmpdir } from "node:os";
import { fileStore } from "../src/files.ts";
import type { Receipt, SignedIntent, Summary, Entry, OutboxId, Item } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, entryHash, intentDigest, newIncarnation, scopeIdOf, textDigest, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { agentKeyInvitationOf, encodeAgentKeyInvitation, type Fetch } from "@generalbusiness/artroom-client";
import { MEMBERSHIP } from "@generalbusiness/dap-platform";
import { Roster, rita } from "../../../packages/platform/test/support.ts";
import { command, enrolAgentKey, issueInvitation, linkOf, memoryStore, type Context, type Config, type Store } from "../src/index.ts";

// Real SDK/envelopes/followReceipt/CLI Store and pinned membership rules in memory.
// Scripted HTTP/session authority/read pages/inbox confirmation; no native session,
// Durable Object, browser, host, provider or full parent acceptance is proved.
test.each([MEMBERSHIP, "platform:membership@4", "platform:membership@5", "platform:membership@6"] as const)("retained native agent opening and key invitation survive loss; independent enrollment Checks without replacement, follows exact native facts and preserves legacy person custody (HTTP and inbox STAND-INs, %s)", async named => {
  const home = await mkdtemp(pathJoin(tmpdir(), "artroom-agent-custody-"));
  try {
  const m = new Roster(named).seated(), service = "https://agents.test";
  const directory = { scope: m.office.at.scope, inc: m.office.at.inc, kind: "directory" as const };
  const repository = { directory, membership: m.at, rules: directory.scope, destination: directory.scope };
  const receipts = new Map<string, Receipt>(), sent: SignedIntent[] = [];
  let wrongDirectory = false, sessionRequests = 0, crossReads = 0;
  let lose: "add-member" | "enrol" | null = "add-member", loseSettle = false;
  const liveItems = (): Item[] => Object.entries(m.definition.declared.items).flatMap(([type, item]) => m.state.page(type, Object.keys(item.states).filter(s => !item.states[s]!.final), null, 100).items).map((item): Item => {
    if (item.type === "roster") return { ...item, refs: { ...item.refs, directory } }; // SCRIPTED directory creator projection.
    return item; // M2 never writes member.refs.inbox (EM9).
  });
  const reply = (value: unknown) => Response.json(value);
  const fetch: Fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/sessions")) {
      const asked = JSON.parse(init!.body!).request;
      const activeKey = liveItems().find(item => item.type === "key" && item.state === "active" && item.values["id"] === asked.actor);
      const member = activeKey && liveItems().find(item => item.type === "member" && item.id === activeKey.refs["member"]);
      if (!member) return reply({ ok: false, reason: "unauthorized" });
      sessionRequests++;
      return reply({ ok: true, token: b64url(new Uint8Array(32).fill(29)), session: { v: 1, deployment: "SCRIPTED session", membership: m.at, member: member.values["handle"], key: asked.actor, reads: ["summary", "entry"], ends: asked.notAfter } });
    }
    if (path.endsWith("/acts")) {
      const signed = (JSON.parse(init!.body!) as { signed: SignedIntent }).signed;
      sent.push(structuredClone(signed));
      const digest = intentDigest(signed.intent);
      let receipt = receipts.get(digest);
      if (!receipt) {
        const judged = m.submit(signed, { platform: m.platformRules, membership: m.at, grants: m.held(signed.intent.actor) });
        expect(judged.result, "the package's actual membership rules admit the scripted native input").toBe("write");
        if (judged.result !== "write") throw Error("Model admission refused");
        const entry = m.entries.at(-1)!.entry, fact = m.fact(entry.seq);
        const accepted: Receipt = { intent: digest, fact, definition: named, effects: entry.effects, sends: entry.sends.map((send): OutboxId => `${entry.seq}.${send.n}`), epoch: entry.epoch };
        receipts.set(digest, accepted); receipt = accepted;
      }
      if (signed.intent.kind === lose) { lose = null; throw Error("SCRIPTED lost accepted reply"); }
      return reply({ answer: "accepted", receipt });
    }
    if (path.endsWith("/settle")) {
      if (loseSettle) throw Error("SCRIPTED unavailable settlement reply");
      const signed = (JSON.parse(init!.body!) as { signed: SignedIntent }).signed, receipt = receipts.get(intentDigest(signed.intent));
      return reply(receipt ? { ok: true, at: m.head, value: receipt, complete: true } : { ok: false, reason: "not-found" });
    }
    const agent = liveItems().find(item => item.type === "member" && item.values["kind"] === "agent");
    const source = agent && m.entries[agent.id]!.entry, birth = source?.sends.find(send => "creator" in send.to && send.to.kind === "inbox");
    if (birth && "creator" in birth.to && url.includes(scopeIdOf(birth.to))) {
      expect(init?.headers?.["authorization"]?.startsWith("Session ")).toBe(true); crossReads++;
      const at = { scope: scopeIdOf(birth.to), inc: newIncarnation(new Uint8Array(16).fill(33)), kind: "inbox" as const };
      if (path.endsWith("/entries/0")) {
        const entry: Entry = { v: 1, at, seq: 0, prev: null, time: m.now, clamped: false, epoch: 0, input: { type: "genesis", seed: birth.to, inc: at.inc, kind: "establish", "founding": null, source: m.fact(agent!.id), n: birth.n, message: birth.message.class === "request" ? birth.message : null, decision: "applied" }, uses: [], prepared: [], effects: [], sends: [] };
        return reply({ ok: true, at: { seq: 0, hash: entryHash(entry) }, value: { entry, hash: entryHash(entry) }, complete: true });
      }
      return reply({ ok: true, at: { seq: 0, hash: textDigest("SCRIPTED inbox head") }, value: { scope: at, status: "active", definition: "platform:inbox@1", time: m.now, items: [{ id: 0, type: "inbox", state: "open", revision: 1, opened: textDigest("SCRIPTED inbox opening"), attributed: [], values: {}, parties: { owner: agent!.parties["member"] }, refs: { membership: m.at } }], counts: [["inbox", "open", 1]] }, complete: true });
    }
    if (url.includes(directory.scope)) {
      expect(init?.headers?.["authorization"]?.startsWith("Session ")).toBe(true); crossReads++;
      const definition = { "platform:membership@2": "platform:directory@3", "platform:membership@4": "platform:directory@5", "platform:membership@5": "platform:directory@6", "platform:membership@6": "platform:directory@9" }[named];
      return reply({ ok: true, at: { seq: 0, hash: textDigest("SCRIPTED directory head") }, complete: true, value: { scope: directory, status: "active", definition, time: m.now, counts: [["repository", "ready", 1]], items: [{ id: 0, type: "repository", state: "ready", revision: 1, opened: textDigest("SCRIPTED repository"), attributed: [], parties: {}, values: {}, refs: { membership: m.at, rules: { ...directory, kind: "rules" }, destination: { ...directory, scope: wrongDirectory ? m.at.scope : directory.scope, kind: "destination" } } }] } });
    }
    if (path.includes("/entries/")) {
      const seq = Number(path.split("/").at(-1)), sealed = m.entries[seq];
      return reply(sealed ? { ok: true, at: m.head, value: sealed, complete: true } : { ok: false, reason: "not-found" });
    }
    const value: Summary = { scope: m.at, status: "active", definition: named, time: m.now, items: liveItems(), counts: Object.entries(m.definition.declared.items).flatMap(([type, item]) => Object.keys(item.states).map(state => [type, state, m.state.count(type, state)] as const)) };
    return reply({ ok: true, at: m.head, value, complete: true });
  };
  const issuer = fileStore(pathJoin(home, "issuer")), requests: string[] = [];
  const originalKeep = issuer.keepPrivate; issuer.keepPrivate = async (name, bytes) => { await originalKeep(name, bytes); requests.push(name); };
  await issuer.keep("founder", rita.secret); await issuer.save({ v: 1, service, key: "founder", repository, handle: "@rita" });
  const ctx: Context = { store: issuer, fetch, now: () => timeMs(m.now)! };
  const input = { kind: "agent-key" as const, handle: "@helper", controller: { membership: m.at, member: "@rita" as const }, hours: 24 }, operation = "20000000-0000-4000-8000-000000000007";
  const savedConfig = issuer.save;
  let failPointer: "initial" | "member" | "invitation" | null = "initial";
  let orphanRequest: string | undefined;
  issuer.save = async config => {
    const pointer = config.invitationIssue;
    if (pointer) {
      const bytes = (await issuer.private(pointer.request))!, row = JSON.parse(new TextDecoder().decode(bytes));
      const phase = !row.member ? "initial" : !row.member.attempted && !row.invitation ? "member" : row.invitation && !row.invitation.attempted ? "invitation" : null;
      if (failPointer !== null && phase === failPointer) { failPointer = null; orphanRequest = pointer.request; throw Error("SCRIPTED lost public pointer save"); }
    }
    await savedConfig(config);
  };
  await expect(issueInvitation(ctx, input, { mode: "new", operation, privateRequests: [...requests] })).rejects.toThrow("public pointer");
  expect([sent.length, (await issuer.config())!.invitationIssue === undefined]).toEqual([0, true]);
  const initial = orphanRequest!;
  failPointer = "member";
  await expect(issueInvitation(ctx, input, { mode: "continue", operation, privateRequests: [...requests], reservedRequest: initial })).rejects.toThrow("public pointer");
  const preparedMember = JSON.parse(new TextDecoder().decode((await issuer.private(orphanRequest!))!)).member.signed;
  const pointerBefore = canonicalize((await issuer.config())!.invitationIssue);
  expect((await issueInvitation(ctx, input, { mode: "check", operation, privateRequests: [...requests] })).state).toBe("unknown");
  expect([sent.length, canonicalize((await issuer.config())!.invitationIssue) === pointerBefore]).toEqual([0, true]);
  const original = await issueInvitation(ctx, input, { mode: "continue", operation, privateRequests: [...requests] });
  expect(canonicalize(sent[0]) === canonicalize(preparedMember)).toBe(true);
  expect([original.state, sent.map(s => s.intent.kind)]).toEqual(["unknown", ["add-member"]]);
  const first = sent[0]!, pointer = (await issuer.config())!.invitationIssue!;
  expect(pointer.operation === operation && !!await issuer.private(pointer.request)).toBe(true);
  loseSettle = true;
  expect((await issueInvitation(ctx, input, { mode: "check", operation, privateRequests: [...requests] })).state).toBe("unknown");
  expect(sent.length).toBe(1); loseSettle = false;
  failPointer = "invitation";
  await expect(issueInvitation(ctx, input, { mode: "continue", operation, privateRequests: [...requests] })).rejects.toThrow("public pointer");
  const preparedInvitation = JSON.parse(new TextDecoder().decode((await issuer.private(orphanRequest!))!)).invitation.signed;
  const mutationsBeforeOrphanCheck = sent.length;
  expect((await issueInvitation(ctx, input, { mode: "check", operation, privateRequests: [...requests] })).state).toBe("unknown");
  expect(sent.length).toBe(mutationsBeforeOrphanCheck);
  const invitation = await issueInvitation(ctx, input, { mode: "continue", operation, privateRequests: [...requests] });
  expect(canonicalize(sent.at(-1)) === canonicalize(preparedInvitation)).toBe(true);
  expect(invitation.state).toBe("verified");
  expect(sent.map(s => s.intent.kind)).toEqual(["add-member", "add-member", "invite-key"]);
  expect(canonicalize(sent[1]) === canonicalize(first)).toBe(true);
  const link = invitation.link!, decoded = agentKeyInvitationOf(link)!;
  expect([decoded.kind, decoded.controller.member, linkOf(link)]).toEqual(["agent-key", "@rita", null]);
  // A retained leaf can be corrupt independently of its signed native facts.
  // Observe the actual submit boundary, not just an unchanged model head.
  const completedConfig = (await issuer.config())!, completedPointer = completedConfig.invitationIssue!;
  const completedBytes = (await issuer.private(completedPointer.request))!;
  const guardedCheck = async (raw: string) => {
    let submits = 0;
    const altered: Store = { ...issuer,
      config: async () => ({ ...completedConfig, invitationIssue: { ...completedPointer, digest: textDigest(raw) } }),
      private: async request => request === completedPointer.request ? utf8(raw) : issuer.private(request),
    };
    const observed = await issueInvitation({ ...ctx, store: altered, fetch: async (url, init) => {
      if (new URL(url).pathname.endsWith("/acts")) { submits++; throw Error("SUBMIT TRIPWIRE: retained Check must not submit an act"); }
      return fetch(url, init);
    } }, input, { mode: "check", operation, privateRequests: [...requests] }).then(value => value.state, error => error instanceof Error && error.message.includes("original invitation custody") ? "blocked" : "unexpected-error");
    expect(submits).toBe(0);
    return observed;
  };
  if (named === MEMBERSHIP) {
    const legacy = JSON.parse(new TextDecoder().decode(completedBytes)); delete legacy.definition;
    expect(await guardedCheck(canonicalize(legacy))).toBe("verified");
  }
  const inconsistent = JSON.parse(new TextDecoder().decode(completedBytes));
  inconsistent.link = encodeAgentKeyInvitation({ ...decoded, definition: named === MEMBERSHIP ? "platform:membership@4" : MEMBERSHIP });
  expect(await guardedCheck(canonicalize(inconsistent))).toBe("blocked");
  const receiver = fileStore(pathJoin(home, "agent")); let submittedWithCustody = false;
  const receiving: Context = { store: receiver, now: ctx.now!, fetch: async (url, init) => {
    if (new URL(url).pathname.endsWith("/acts")) {
      const cfg = (await receiver.config())!, originalBytes = await receiver.private(cfg.join!.request);
      expect(!!originalBytes && cfg.join!.kind === "enrol").toBe(true);
      expect(canonicalize(JSON.parse(new TextDecoder().decode(originalBytes!)).signed) === canonicalize(JSON.parse(init!.body!).signed)).toBe(true);
      submittedWithCustody = true;
    }
    return fetch(url, init);
  } };
  const receiverSave = receiver.save;
  let dropReceiverPointer = true;
  receiver.save = async config => { if (dropReceiverPointer && config.join) { dropReceiverPointer = false; return; } await receiverSave(config); };
  const beforeReceiver = sent.length;
  expect((await command(receiving, ["join", link])).code).toBe(1);
  expect([sent.length, await receiver.config()]).toEqual([beforeReceiver, null]);
  const originalNames = await readdir(pathJoin(home, "agent", "private"));
  expect([originalNames.length, (await readdir(pathJoin(home, "agent", "keys"))).length]).toEqual([1, 1]);
  const initialEnvelope = JSON.parse(new TextDecoder().decode((await receiver.private(originalNames[0]!.replace(/\.data$/, "")))!));
  expect((await command(receiving, ["join", link, "--check"])).code).toBe(1);
  expect([sent.length, await receiver.config()]).toEqual([beforeReceiver, null]);
  lose = "enrol";
  expect((await command(receiving, ["join", link])).code).toBe(1);
  expect(canonicalize(sent.at(-1)) === canonicalize(initialEnvelope.signed)).toBe(true);
  const kept = (await receiver.config())!, raw = await receiver.private(kept.join!.request);
  expect([submittedWithCustody, kept.join!.kind, sent.at(-1)!.intent.actor === rita.key]).toEqual([true, "enrol", false]);
  const before = sent.length; loseSettle = true;
  expect((await enrolAgentKey(receiving, link, { mode: "check" })).code).toBe(1);
  expect(sent.length).toBe(before); loseSettle = false;
  wrongDirectory = true;
  expect((await enrolAgentKey(receiving, link)).code).toBe(1);
  expect((await receiver.config())!.repository).toBeUndefined();
  wrongDirectory = false;
  const mutationsBeforeCheck = sent.length;
  expect((await enrolAgentKey(receiving, link, { mode: "check" })).code).toBe(0);
  expect(sent.length).toBe(mutationsBeforeCheck);
  expect(canonicalize(sent.at(-1)) === canonicalize(sent.at(-2))).toBe(true);
  expect(canonicalize([...(await receiver.private(kept.join!.request))!]) === canonicalize([...raw!])).toBe(true);
  const connected = (await receiver.config())!;
  expect([connected.handle, !!connected.repository?.inbox, connected.join!.accepted?.at.kind]).toEqual(["@helper", true, "membership"]);
  const untouched = memoryStore(); const legacy: Config = { v: 1, service, key: "legacy", join: { request: "retained-person", intent: textDigest("person intent"), link: textDigest("person link"), repository, handle: "@visitor" } }; await untouched.save(legacy);
  expect((await enrolAgentKey({ store: untouched, fetch }, link)).code).toBe(1);
  expect(canonicalize(await untouched.config()) === canonicalize(legacy)).toBe(true);
  expect(await untouched.secret("agent")).toBeNull();
  // Person invitation production keeps the old Link parser/native join shape.
  const personStore: Store = memoryStore(), personRequests: string[] = [];
  const personKeep = personStore.keepPrivate; personStore.keepPrivate = async (name, bytes) => { await personKeep(name, bytes); personRequests.push(name); };
  await personStore.keep("founder", rita.secret); await personStore.save({ v: 1, service, key: "founder", repository, handle: "@rita" });
  const person = await issueInvitation({ ...ctx, store: personStore }, { kind: "person", handle: "@visitor", role: "member", hours: 24 }, { mode: "new", operation: "20000000-0000-4000-8000-000000000008", privateRequests: [...personRequests] });
  expect([person.state, linkOf(person.link!)?.definition, agentKeyInvitationOf(person.link!)]).toEqual(["verified", named, null]);
  expect((await command(receiving, ["join", person.link!])).code).toBe(1);
  expect((await receiver.config())!.join!.kind).toBe("enrol");
  expect(sessionRequests > 0 && crossReads > 0).toBe(true);
  if (named === "platform:membership@6") {
    expect(JSON.stringify(m.entries)).not.toContain('"secret"');
    expect(JSON.stringify(m.entries)).not.toContain(agentKeyInvitationOf(link)!.secret);
    expect(JSON.stringify(m.entries)).not.toContain(linkOf(person.link!)!.secret);
  }
  for (const folder of ["issuer", "agent"]) {
    for (const part of ["keys", "private"]) for (const filename of await readdir(pathJoin(home, folder, part))) {
      expect(/^[a-z][a-z0-9-]{0,31}\.(key|data)$/.test(filename)).toBe(true);
      expect((await stat(pathJoin(home, folder, part, filename))).mode & 0o777).toBe(0o600);
    }
  }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("a retained successor preserves the effective membership declaration, including the implicit legacy M2 default, before any request", async () => {
  const m = new Roster().seated(), service = "https://retained.test";
  const directory = { ...m.office.at, kind: "directory" as const };
  const repository = { directory, membership: m.at, rules: directory.scope, destination: directory.scope };
  const input = { kind: "agent-key" as const, handle: "@helper", hours: 24, controller: { membership: m.at, member: "@rita" as const } };
  const operation = "30000000-0000-4000-8000-000000000001", names = ["i-" + "1".repeat(30), "i-" + "2".repeat(30)] as const;
  const root = { v: 1, operation, input, service, repository, actor: rita.key, secret: b64url(new Uint8Array(32).fill(17)), ends: "2030-01-01T00:00:00Z" };
  async function attempt(definition: "platform:membership@2" | "platform:membership@4") {
    const store = memoryStore(), raw = canonicalize(root);
    await store.keep("issuer", rita.secret);
    await store.keepPrivate(names[0], utf8(raw));
    await store.keepPrivate(names[1], utf8(canonicalize({ ...root, definition, previous: { request: names[0], digest: textDigest(raw) } })));
    await store.save({ v: 1, service, key: "issuer", repository, invitationIssue: { operation, request: names[0], digest: textDigest(raw), membership: m.at, actor: rita.key } });
    let calls = 0, submits = 0;
    const observed = await issueInvitation({ store, fetch: async (url) => { calls++; if (new URL(url).pathname.endsWith("/acts")) submits++; throw Error("REQUEST TRIPWIRE: declaration validation precedes I/O"); } }, input, { mode: "check", operation, privateRequests: [...names] })
      .then(value => value.state, error => error instanceof Error && error.message.includes("original invitation custody") ? "blocked" : "unexpected-error");
    expect([calls, submits]).toEqual([0, 0]);
    return observed;
  }
  expect(await attempt(MEMBERSHIP)).toBe("unknown"); // legal private successor, no automatic pointer restoration.
  expect(await attempt("platform:membership@4")).toBe("blocked");
});
