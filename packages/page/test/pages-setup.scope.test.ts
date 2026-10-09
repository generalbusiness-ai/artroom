import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, keyIdOfSecret, timeMs } from "@generalbusiness/artroom-bytes";
import { found, httpTransport, secretSigner, signedIntent, type Fetch } from "@generalbusiness/artroom-client";
import { claim, command, memoryStore, type Context } from "@generalbusiness/artroom-cli";
import { ownHost } from "../../scope/test/hosts.ts";
import { Platform, routed } from "../../scope/test/repository.ts";
import { net } from "../../scope/src/testing.ts";
import { platformNet, platformOutside } from "../../scope/test/worker.ts";
import { openRoom, placeOf } from "../src/data.ts";
import { pagesReadiness, setupPages } from "../src/pages-setup.ts";
import { PAGES_PRESET, PAGES_PRESET_DIGEST, PAGES_RULES } from "../src/pages-preset.ts";

// Actual @2 register/claim/enrollment/rules admission and authenticated reads.
// Host/scheduler/clock/local stores are labelled STAND-INs; no provider or browser.
// Native policy checks eligible members/actions, not whether an actor is human.
test("native Pages @2 setup restores each lost accepted stage without duplicate activation or publish and denies a member before mutation", async () => {
  net.hold = net.deaf = null;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true; platformNet.inspector = "a test reader";
  const at = ownHost(); const wired = new Set<ScopeId>(); const nodes: Platform[] = [];
  let register: Platform | undefined;
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => at.outside(given, sql, at.bindings(register!.name))); };
  const pause = async (waiting: readonly string[] = []) => {
    const known = [...nodes, ...waiting.filter(name => !nodes.some(n => n.name === name)).map(name => new Platform(name as ScopeId))];
    for (let pass = 0; pass < 64; pass++) {
      let made = 0;
      for (const node of known) { while ((await (node.stub as unknown as { effect(): Promise<number> }).effect()) > 0) made++; made += await node.stub.dispatch(); }
      if (!made) return;
    }
    throw new Error("Finite Pages fixture scheduler exceeded its passes");
  };
  const now = () => timeMs(net.clock.now)!;
  const secret = crypto.getRandomValues(new Uint8Array(32)); const signer = secretSigner(secret);
  const store = memoryStore(); await store.keep("founder", secret);
  const ctx: Context = { store, fetch: routed as never, now, pause };
  try {
    // Explicit pin: the current CLI default is not used for install.
    const install = await signedIntent(signer, { to: null, kind: "install", fields: { host: at.host, namespace: at.namespace, policy: "keys", founders: [signer.key] }, expected: {} }, { now: now() });
    const founded = await found(httpTransport("https://scopes.test", { fetch: routed as never }), install, "platform:register@2");
    if (founded.answer.answer !== "accepted") throw new Error("Explicit native @2 register was not accepted");
    register = new Platform(founded.answer.receipt.fact.at.scope); wire(register.name); await register.restart(); nodes.push(register);
    await store.save({ v: 1, service: "https://scopes.test", key: "founder", register: founded.answer.receipt.fact.at });
    const { scopeIdOf } = await import("@generalbusiness/artroom-bytes");
    net.hold = envelope => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
    const created = await claim(ctx, "Pages setup witness", { handle: "@founder" }); expect(created.code, created.lines.join("\n")).toBe(0);
    const config = (await store.config())!; const G = new Platform(config.repository!.destination); nodes.push(G); await pause();
    const place = placeOf(JSON.stringify(config))!;
    let lose = true; const submitted: string[] = []; const originalRequests: string[] = []; const settledRequests: string[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      const isAct = init?.method === "POST" && new URL(url).pathname.endsWith("/acts");
      let kind = "";
      if (isAct) { kind = (JSON.parse(String(init?.body)) as { signed: { intent: { kind: string } } }).signed.intent.kind; if (["activate", "publish"].includes(kind)) { submitted.push(kind); originalRequests.push(canonicalize((JSON.parse(String(init?.body)) as { signed: unknown }).signed)); } }
      if (new URL(url).pathname.endsWith("/settle")) settledRequests.push(canonicalize((JSON.parse(String(init?.body)) as { signed: unknown }).signed));
      const answer = await routed(url, init);
      if (isAct && ["activate", "publish"].includes(kind) && lose) { lose = false; throw new Error("scripted accepted reply loss"); }
      return answer;
    }) as unknown as Fetch;
    const session = { service: "https://scopes.test", secret, fetch, now };
    let room = await openRoom(session, place);
    expect((await pagesReadiness(room)).ready).toBe(false);
    const journal = new Map<string, string>(); let writes = 0;
    const storage = { getItem: (key: string) => journal.get(key) ?? null, setItem: (key: string, value: string) => { writes++; journal.set(key, value); } };
    const options = { approvedDescriptor: PAGES_PRESET_DIGEST, current: () => true, locks: { request: async <T>(_name: string, work: () => Promise<T>) => work() } };
    for (let stage = 0; stage < 3; stage++) {
      lose = true;
      const stopped = await setupPages(room, storage, options);
      expect(stopped).toMatchObject({ state: "unknown", steps: stage + 1 });
      expect(submitted).toHaveLength(stage + 1);
      const raw = [...journal.values()][0]!; const saved = JSON.parse(raw);
      expect(saved.steps).toHaveLength(stage + 1);
      expect(saved.steps[stage].attempted).toBe(true); expect(saved.steps[stage].answer).toBeUndefined();
      expect(canonicalize(saved.steps[stage].signed)).toBe(originalRequests[stage]);
      // New Room/adapter models a reload; private journal bytes stay original.
      room = await openRoom(session, place);
      if (stage < 2) continue; // Next invocation first settles the earlier stage.
    }
    lose = false;
    expect(await setupPages(await openRoom(session, place), storage, options)).toMatchObject({ state: "ready", steps: 3 });
    expect(submitted).toEqual(["activate", "activate", "publish"]); expect(settledRequests).toEqual(originalRequests);
    expect((await pagesReadiness(room)).ready).toBe(true);
    const R = new Platform(config.repository!.rules);
    const held = await R.summary();
    expect(held.value.definition).toBe("platform:rules@2");
    expect(held.value.items.find(i => i.type === "rules")?.values).toMatchObject(PAGES_RULES);
    for (const definition of PAGES_PRESET.definitions) {
      const answer = await R.stub.retained("a test reader", "definition", definition.digest);
      expect(answer.ok && answer.value.bytes).toBe(definition.bytes);
    }
    const history = await R.entries();
    expect(history.filter(e => e.input.type === "act").map(e => e.input.type === "act" ? e.input.signed.intent.kind : "")).toEqual(["activate", "activate", "publish"]);
    // Active ordinary member must not activate, save a stage or publish.
    const invited = await command(ctx, ["invite", "@member", "--role", "member"]); expect(invited.code).toBe(0);
    const member: Context = { store: memoryStore(), fetch: routed as never, now, pause };
    expect((await command(member, ["join", invited.lines[1]!.split(": ")[1]!])).code).toBe(0);
    const memberConfig = (await member.store.config())!; const memberSecret = (await member.store.secret(memberConfig.key))!;
    let memberPosts = 0;
    const memberRoom = await openRoom({ service: "https://scopes.test", secret: memberSecret, now, fetch: (async (url: string, init?: RequestInit) => { if (init?.method === "POST" && new URL(url).pathname.endsWith("/acts")) memberPosts++; return routed(url, init); }) as unknown as Fetch }, place);
    const priorWrites = writes;
    await expect(setupPages(memberRoom, storage, options)).rejects.toThrow("authorized room admin");
    expect(memberPosts).toBe(0); expect(writes).toBe(priorWrites);
    expect(keyIdOfSecret(memberSecret)).not.toBe(signer.key);
    expect(canonicalize(held.value.scope)).toBe(canonicalize((await R.summary()).value.scope));
    expect(await runInDurableObject(G.object, (_instance, state) => JSON.parse(state.storage.sql.exec<{ record: string }>("SELECT record FROM item WHERE type='branch'").one().record).values.head)).toBeTruthy();
  } finally {
    platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = net.deaf = null;
    for (const name of wired) platformOutside.delete(name);
  }
});
