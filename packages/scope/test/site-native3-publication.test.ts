import { env } from "cloudflare:workers";
import { runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Entry, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, definitionDigest, scopeIdOf, timeMs, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { command, memoryStore, type Context, type Outcome } from "@generalbusiness/artroom-cli";
import { changeDemo3 } from "@generalbusiness/artroom-lanes";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { net } from "../src/testing.ts";
import { platformNet, platformOutside } from "./worker.ts";
import { ownHost } from "./hosts.ts";
import { Platform, routed } from "./repository.ts";
import { site } from "../src/site/route.ts";

// Real @3 CLI/register/directory/lane/rules/destination admission and cleanup.
// Only the Git provider, scheduler, clock and local key store are STAND-INs.
// No SQL state is fabricated, no host/deployment/browser executes.
test("native @3 cleaned publication retains immutable Site eligibility while timed reserved expiry never grants it", async () => {
  const oldClock = net.clock.now;
  net.hold = net.deaf = null;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true; platformNet.inspector = "a test reader";
  const at = ownHost();
  const wired = new Set<ScopeId>();
  let register: Platform | undefined;
  let destination: Platform | undefined;
  const nodes: Platform[] = [];
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => at.outside(given, sql, at.bindings(register!.name))); };
  const pause = async (waiting: readonly string[]) => {
    const known = [...nodes, ...waiting.filter(name => !nodes.some(n => n.name === name)).map(name => new Platform(name as ScopeId))];
    for (let pass = 0; pass < 64; pass++) {
      let made = 0;
      for (const node of known) {
        while ((await (node.stub as unknown as { effect(): Promise<number> }).effect()) > 0) made++;
        made += await node.stub.dispatch();
      }
      if (!made) return;
    }
    throw new Error("Native fixture scheduler exceeded its finite passes");
  };
  const files = { "change3.json": utf8(canonicalize(changeDemo3)), "one.md": utf8("# First published\n\n[Self](README.md)\n"), "two.md": utf8("# Second published\n"), "check.json": utf8(canonicalize({ image: `sha256:${"7".repeat(64)}`, steps: [["fixture-check"]] })) };
  const ctx: Context = { store: memoryStore(), fetch: routed as never, now: () => timeMs(net.clock.now)!, pause, read: async name => files[name as keyof typeof files] ?? null };
  const run = (...argv: string[]) => command(ctx, argv);
  const ok = (answer: Outcome) => { expect(answer.code, answer.lines.join("\n")).toBe(0); return answer; };
  try {
    ok(await run("install", "https://scopes.test", "--host", at.host, "--namespace", at.namespace));
    register = new Platform((await ctx.store.config())!.register!.scope); wire(register.name); await register.restart(); nodes.push(register);
    net.hold = envelope => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
    ok(await run("claim", "Native Site", "--handle", "@rita"));
    const config = (await ctx.store.config())!;
    destination = new Platform(config.repository!.destination); nodes.push(destination); await pause([]);
    expect((await destination.summary()).value.definition).toBe("platform:destination@3");
    ok(await run("act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
    ok(await run("act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "change3.json"));
    ok(await run("edit", "README.md", "--file", "one.md")); await pause([]);
    const first = at.stand.refs.get("refs/heads/main")!;
    ok(await run("edit", "README.md", "--file", "two.md")); await pause([]);
    const second = at.stand.refs.get("refs/heads/main")!; expect(second).not.toBe(first);
    const retained = () => runInDurableObject(destination!.object, (_instance, state) => state.storage.sql.exec<{ record: string }>("SELECT record FROM item WHERE type IN ('publication','receipt') ORDER BY id").toArray().map(r => JSON.parse(r.record)));
    const records = await retained();
    expect(records.filter(r => r.type === "publication" && r.values.integration === first)).toMatchObject([{ state: "cleaned" }]);
    expect(records.filter(r => r.type === "receipt" && r.values.commit === first)).toMatchObject([{ state: "written" }]);
    const entries = await destination.entries();
    expect(entries.some(e => e.input.type === "outcome" && e.input.kind === "reservation-delete" && e.effects.some(f => f.effect === "state" && ["cleanup-deleted", "cleaned"].includes(f.state)))).toBe(true);
    const snapshot = () => runInDurableObject(destination!.object, (_instance, state) => {
      const tables = state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").toArray();
      return tables.map(({ name }) => [name, state.storage.sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray()]);
    });
    const get = (commit: string) => site(new Request(`https://scopes.test/site/${config.repository!.directory.scope}/${commit}/README.md`, { headers: { "if-none-match": "*" } }), { SCOPES: env.PLATFORM, ...at.bindings(register!.name) }, at.stand.fetch);
    const before = await snapshot(); expect((await get(first)).status).toBe(304); expect(await snapshot()).toEqual(before);
    // Add a real checker role/configuration but never submit its required check.
    const checker = ok(await run("act", "add-member", "--on", "membership", "--set", "handle=@check", "--set", "kind=checker"));
    expect(checker.code).toBe(0);
    const configText = new TextDecoder().decode(files["check.json"]);
    const { valueDigest } = await import("@generalbusiness/artroom-derive");
    const digest = valueDigest("artroom-check-configuration-1", JSON.parse(configText));
    ok(await run("act", "keep-configuration", "--on", "rules", "--set", `digest=${digest}`, "--set", "name=unit", "--value", "check.json"));
    const checks = [{ name: "unit", configuration: digest, required: true, checker: { membership: config.repository!.membership, member: "@check" } }];
    ok(await run("act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", `checks=${JSON.stringify(checks)}`, "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks }))}`));
    ok(await run("edit", "README.md", "--file", "one.md"));
    await pause([]);
    const reserved = (await destination.summary()).value.items.find(i => i.type === "publication" && i.state === "reserved")!;
    expect(reserved).toBeDefined();
    const unapproved = reserved.values["integration"] as string;
    expect((await get(unapproved)).status).toBe(404);
    net.clock.now = timeOf(timeMs(net.clock.now)! + 1800_000);
    await runDurableObjectAlarm(destination.object); await pause([]);
    const timed = await destination.entries();
    expect(timed.some((e: Entry) => e.input.type === "timed" && e.input.item === reserved.id && e.effects.some(f => f.effect === "state" && f.state === "cleanup-aborted"))).toBe(true);
    expect((await retained()).find(r => r.type === "publication" && r.id === reserved.id)?.state).toBe("cleaned");
    expect((await get(unapproved)).status).toBe(404);
    expect((await get(first)).status).toBe(304);
  } finally {
    net.clock.now = oldClock; net.hold = net.deaf = null;
    platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null;
    for (const name of wired) platformOutside.delete(name);
  }
});
