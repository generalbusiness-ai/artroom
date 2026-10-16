import { describe, expect, test } from "vitest";
import type { Answer, DeclaredDefinition, MismatchReason, ReadRefusal, RefusalReason, UnavailableReason } from "@generalbusiness/dap-contract";
import { REFUSAL_REASONS, READ_REFUSALS, b64url, utf8 } from "@generalbusiness/artroom-bytes";
import { secretSigner } from "@generalbusiness/artroom-client";
import { McpService, MISMATCH_NOTES, UNAVAILABLE_NOTES, answered, finding, guardSentences, memoryStore, type DefinitionLike, type Finding } from "../src/index.ts";
import { READ_CREDENTIAL, SERVICE, SESSION_TOKEN, StandIn } from "./support/standin.ts";

const head = { seq: 41, hash: `sha256:${"c".repeat(64)}` } as const;
const asked = { scope: "sc_the_scope", kind: "close-own", on: 3, action: "issue.close-own" };

describe("errors say who said what, from what the judge returned", () => {
  // Invariant: every refusal reason of the contract has a sentence that names the scope, the kind and the judged head, and a next step.
  test("every refusal, unavailable, mismatch and read reason has a sentence and a next step", () => {
    for (const reason of Object.keys(REFUSAL_REASONS) as RefusalReason[]) {
      const said = answered({ answer: "refused", reason, judgedAt: head }, asked, []);
      expect(said.sentence, reason).toMatch(/^sc_the_scope refused close-own, because .+, judged at head 41/);
      expect(said.next.length, reason).toBeGreaterThan(10);
    }
    for (const reason of Object.keys(UNAVAILABLE_NOTES) as UnavailableReason[]) {
      const said = answered({ answer: "unavailable", reason }, asked, []);
      expect(said.sentence).toBe(`sc_the_scope did not judge close-own (${reason}: ${UNAVAILABLE_NOTES[reason]}). Nothing is known to have been accepted; timed entries may have been written.`);
      expect(said.next).toMatch(/settle with the same idempotencyKey/);
    }
    for (const reason of Object.keys(MISMATCH_NOTES) as MismatchReason[]) expect(answered({ answer: "mismatch", reason }, asked, []).next).toMatch(/new idempotencyKey/);
    for (const reason of Object.keys(READ_REFUSALS) as ReadRefusal[]) expect(finding({ error: "read", scope: "sc_x", reason }).sentence).toMatch(new RegExp(`^sc_x did not answer the read: ${reason}`));
  });

  // Invariant: what the server found itself, before or beside the scope, is attributed to the server and says what was sent.
  test("the server's own findings are attributed to the server", () => {
    const findings: Finding[] = [
      { error: "shape", field: "fields.title", what: "is longer than 256 bytes", declared: "text" },
      { error: "stale-descriptor", scope: "sc_x", runs: "change sha256:1", tool: "change.propose-version@aa" },
      { error: "restart" }, { error: "transport", scope: "sc_x", submitted: true },
      { error: "custody", state: "full", key: "k", scope: "sc_x", keys: ["a", "b"] }, { error: "custody", state: "conflicting", key: "k", scope: "sc_x", recorded: "comment on sc_x" },
      { error: "custody", state: "locked", key: "k", scope: "sc_x" }, { error: "custody", state: "terminal", key: "k", scope: "sc_x" },
      { error: "credential", destination: "sc_g", why: "no outcome yet" }, { error: "target", what: "no lane 9" },
    ];
    for (const f of findings) {
      const said = finding(f);
      expect(said.sentence, f.error).toMatch(/server|Nothing was sent|nothing was sent|unknown|list again|nothing was returned/i);
      expect(said.next.length).toBeGreaterThan(5);
    }
    expect(finding(findings[4]!).sentence).toContain("The oldest unresolved keys: a, b.");
    expect(finding(findings[1]!).sentence).toContain("The tool for that target is change.propose-version@aa.");
    expect(finding({ error: "credential", destination: "sc_g", why: "x" }).next).toContain("repository.read-token");
  });

  // Invariant: a refusal with no guard name attributes no guard: with two unnamed guards, the sentence says the scope does not say
  // which, and lists both sentences without choosing.
  test("an unnamed guard refusal attributes neither of two unnamed guards", () => {
    const act = { step: "transition" as const, on: "task", grant: "g", also: {}, fields: {}, guards: [{ state: ["open"] }, { unset: "owner" }], effects: [] };
    const definition: DefinitionLike = { name: "two", genesis: "x", items: {}, acts: { close: act } };
    const guards = guardSentences(definition, act, { pinned: "sha256:x" });
    const said = answered({ answer: "refused", reason: "guard-failed", judgedAt: head }, { scope: "sc_t", kind: "close" }, guards);
    expect(said.sentence).toBe("sc_t refused close, because one of its guards does not hold, judged at head 41; the scope does not say which. The act's guards are: this task is open; this task's owner is not set.");
    const named = answered({ answer: "refused", reason: "guard-failed", name: "nobody", judgedAt: head }, { scope: "sc_t", kind: "close" }, guards);
    expect(named.sentence).toContain("the guard named nobody; the act's declaration names no such guard");
  });

  // Invariant: the sentence reports the head the scope judged at, never a state read afterwards; and no output of any tool carries
  // the session token, the signing key or an invitation secret, while the read credential is in credential's one structured field.
  test("the judged head is reported, and secrets appear nowhere but the credential's field (STAND-IN scope service)", async () => {
    const secret = new Uint8Array(32).fill(9);
    const signer = secretSigner(secret);
    const service = new StandIn(signer.key);
    const room = service.config();
    const mcp = new McpService({ service: SERVICE, fetch: service.fetch, signer, config: { read: async () => room, addRoot: async () => {} }, custody: memoryStore(), now: () => Date.parse("2099-01-01T00:00:00Z"), pause: async () => {} });
    const tools = await mcp.page();
    const outputs: string[] = [JSON.stringify(tools)];
    const byTool: [string, string][] = [];
    const call = async (name: string, args: Record<string, unknown>) => { const result = await mcp.call(name, args); outputs.push(JSON.stringify(result)); byTool.push([`${name} ${JSON.stringify(args)}`, JSON.stringify(result)]); return result; };

    // The scope judges set-role at head 1 and refuses it; then its state moves on. The sentence keeps the judged head.
    service.answers.set("set-role", () => ({ answer: "refused", reason: "guard-failed", name: "last-admin", judgedAt: { seq: 1, hash: `sha256:${"d".repeat(64)}` } }) as Answer);
    const refused = await call("member.role", { on: 1, fields: { role: "member" }, idempotencyKey: "role-1" });
    service.activate({ format: "artroom-definition-1", name: "later", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "g", items: {}, acts: {}, receives: {}, timed: {}, rules: {} } as unknown as DeclaredDefinition);
    expect(refused.structuredContent["sentence"]).toMatch(/refused set-role, because this does not hold: one of: .+ \(last-admin\), judged at head 1\.$/);

    // An invitation secret, given as a join act's field: the act's answer does not echo it.
    const invitationSecret = "INVITATION-SECRET-one-time";
    await call("room.join", { fields: { invitation: 5, secret: invitationSecret }, idempotencyKey: "join-1" });
    // A read token, and the credential, once.
    const token = await call("repository.read-token", { on: 0, fields: { hours: 1 }, idempotencyKey: "token-1" });
    const seq = (token.structuredContent["fact"] as { seq: number }).seq;
    const credential = await call("credential", { entry: seq });
    expect(credential.structuredContent["credential"]).toBe(READ_CREDENTIAL);
    for (const scope of ["directory", "membership", "rules", "destination"]) {
      await call("inspect", { scope }); await call("steps", { scope }); await call("record", { scope: scope === "destination" ? "rules" : scope }); await call("sends", { scope }); await call("actions", { scope });
      await call("items", { scope, type: "member" }); await call("wait", { scope, seconds: 1 });
    }
    await call("room", {}); await call("step", { scope: "destination", seq }); await call("settle", { target: "destination", idempotencyKey: "token-1" });
    await call("inspect", { scope: "membership", describe: "join" }); await call("text", { scope: "rules", kind: "text", digest: `sha256:${"0".repeat(64)}` });
    const everything = outputs.join("\n");
    expect(everything).not.toContain(SESSION_TOKEN);
    expect(everything).not.toContain(b64url(secret));
    // The credential appears once: in credential's structured field, and in no text, no other tool and no other field.
    expect(everything.split(READ_CREDENTIAL).length - 1).toBe(1);
    expect(credential.content[0]!.text).not.toContain(READ_CREDENTIAL);
    // The invitation secret is in no output but a read of the scope's own record of the join entry: membership keeps the signed
    // intent, secret and all, and record returns it as stored. No sentence, answer or other read carries it.
    expect(byTool.filter(([, out]) => out.includes(invitationSecret)).map(([asked]) => asked)).toEqual(['record {"scope":"membership"}']);
  });
});

// Invariant: invitation URL refusals happen before signing, transport, config or custody writes.
test("join validates its service before signing or changing an empty configuration (STAND-IN transport)", async () => {
  const real = secretSigner(new Uint8Array(32).fill(19));
  const standIn = new StandIn(real.key);
  const repository = standIn.config().repository!;
  const { inbox: _inbox, ...shared } = repository;
  const link = (service: string) => "artroom-invite:" + b64url(utf8(JSON.stringify({ v: 1, service, repository: shared, invitation: 5, secret: "SCRIPTED invitation secret for URL boundary", handle: "@helper", definition: "platform:membership@2" })));
  const invalid = ["not a URL", "http://scopes.test", "http://localhost:7781", "http://127.example.test", "https://user:pass@scopes.test", "https://scopes.test?x=1", "https://scopes.test#x", "https://scopes.test?", "https://scopes.test#"];
  let signed = 0, fetched = 0, configReads = 0, configWrites = 0, custodyWrites = 0;
  const custody = memoryStore();
  const write = custody.write.bind(custody);
  custody.write = async (id, record) => { custodyWrites++; await write(id, record); };
  const empty = { service: "", roots: [] };
  const mcp = new McpService({ service: "", signer: { key: real.key, sign: bytes => { signed++; return real.sign(bytes); } }, fetch: (url, init) => { fetched++; return standIn.fetch(url, init); }, config: { read: async () => { configReads++; return empty; }, addRoot: async () => { configWrites++; throw Error("Unexpected root write"); }, joined: async () => { configWrites++; } }, custody, now: () => Date.parse("2099-01-01T00:00:00Z") });
  for (const service of invalid) {
    const answer = await mcp.call("join", { link: link(service), idempotencyKey: "invalid-join" });
    expect(answer.isError, service).toBe(true);
    expect(answer.structuredContent, service).toMatchObject({ error: "shape", message: expect.stringContaining("link"), next: expect.any(String) });
  }
  // Direct McpService.call also returns a shape finding for unusable private proof input; it must never throw or touch custody.
  const seed = b64url(new Uint8Array(32));
  for (const secret of ["not-a-seed", b64url(new Uint8Array(31)), seed.slice(0, -1) + "B", seed + "="]) {
    const malformed = "artroom-invite:" + b64url(utf8(JSON.stringify({ v: 1, service: SERVICE, repository: shared, invitation: 5, secret, handle: "@helper", definition: "platform:membership@6" })));
    expect(await mcp.call("join", { link: malformed, idempotencyKey: "invalid-seed" })).toMatchObject({ isError: true, structuredContent: { error: "shape" } });
  }
  expect([signed, fetched, configReads, configWrites, custodyWrites]).toEqual([0, 0, 0, 0, 0]);
  expect(empty).toEqual({ service: "", roots: [] });
  // Each accepted form passes the real signing boundary once. A scripted native refusal stops before enrollment reads.
  standIn.answers.set("join", () => ({ answer: "refused", reason: "guard-failed", judgedAt: { seq: 0, hash: `sha256:${"c".repeat(64)}` } }));
  for (const [i, service] of ["https://scopes.test", "https://scopes.test/base/", "https://scopes.test:8443", "http://127.0.0.1:7781", "http://127.2.3.4", "http://[::1]:7781"].entries()) {
    const client = new McpService({ service: "", signer: { key: real.key, sign: bytes => { signed++; return real.sign(bytes); } }, fetch: (url, init) => { fetched++; return standIn.fetch(url.replace("/base/v1/", "/v1/"), init); }, config: { read: async () => empty, addRoot: async () => { configWrites++; throw Error("Unexpected root write"); }, joined: async () => { configWrites++; } }, custody: memoryStore(), now: () => Date.parse("2099-01-01T00:00:00Z") });
    const answer = await client.call("join", { link: link(service), idempotencyKey: `permitted-${i}` });
    expect(answer.isError, service).toBe(false);
    expect(answer.structuredContent, service).toMatchObject({ answer: "refused", reason: "guard-failed" });
  }
  expect([signed, fetched, configWrites]).toEqual([6, 6, 0]);
});
