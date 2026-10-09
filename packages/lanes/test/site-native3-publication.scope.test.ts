import { env } from "cloudflare:workers";
import { runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Entry, ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, scopeIdOf, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { command, memoryStore, type Context, type Outcome } from "../../cli/src/index.ts";
import { changeDemo3 } from "../src/index.ts";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { net } from "../../scope/src/testing.ts";
import { siteFixtureLifetime } from "../../scope/test/support/site-fixture-lifetime.ts";
import { driveFixture } from "../../scope/test/support/native-fixture-lifetime.ts";
import { ownHost } from "../../scope/test/hosts.ts";
import { Platform, routed } from "../../scope/test/repository.ts";
import { site } from "../../scope/src/site/route.ts";

// Real @3 CLI/register/directory/lane/rules/destination admission and cleanup.
// Only the Git provider, scheduler, clock and local key store are STAND-INs.
// No SQL state is fabricated, no host/deployment/browser executes.
test("native @3 cleaned publication retains immutable Site eligibility while timed reserved expiry never grants it", async () => {
  const lifetime = siteFixtureLifetime();
  const at = ownHost();
  let register: Platform | undefined;
  let destination: Platform | undefined;
  const nodes: Platform[] = [];
  const wire = (name: ScopeId) => { lifetime.active(); lifetime.wire(name, (given, sql) => at.outside(given, sql, at.bindings(register!.name))); };
  const pause = async (waiting: readonly string[]) => {
    const known = [...nodes, ...waiting.filter(name => !nodes.some(n => n.name === name)).map(name => new Platform(name as ScopeId))];
    await driveFixture(known, lifetime.wait);
  };
  const files = { "change3.json": utf8(canonicalize(changeDemo3)), "one.md": utf8("# First published\n\n[Self](README.md)\n"), "two.md": utf8("# Second published\n"), "check.json": utf8(canonicalize({ image: `sha256:${"7".repeat(64)}`, steps: [["fixture-check"]] })) };
  const ctx: Context = { store: memoryStore(), fetch: ((url: string, init?: RequestInit) => lifetime.wait(() => routed(url, init))) as never, now: () => timeMs(net.clock.now)!, pause, read: async name => files[name as keyof typeof files] ?? null };
  const run = (...argv: string[]) => command(ctx, argv);
  const ok = (answer: Outcome) => { expect(answer.code, answer.lines.join("\n")).toBe(0); return answer; };
  try {
    ok(await lifetime.wait(() => run("install", "https://scopes.test", "--host", at.host, "--namespace", at.namespace)));
    const R = register = new Platform((await lifetime.wait(() => ctx.store.config()))!.register!.scope); wire(R.name); await lifetime.wait(() => R.restart()); nodes.push(R);
    lifetime.setHold(envelope => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; });
    ok(await lifetime.wait(() => run("claim", "Native Site", "--handle", "@rita")));
    const config = (await lifetime.wait(() => ctx.store.config()))!;
    const G = destination = new Platform(config.repository!.destination); nodes.push(G); await lifetime.wait(() => pause([]));
    expect((await lifetime.wait(() => G.summary())).value.definition).toBe("platform:destination@3");
    ok(await lifetime.wait(() => run("act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`)));
    ok(await lifetime.wait(() => run("act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "change3.json")));
    ok(await lifetime.wait(() => run("edit", "README.md", "--file", "one.md"))); await lifetime.wait(() => pause([]));
    const first = at.stand.refs.get("refs/heads/main")!;
    ok(await lifetime.wait(() => run("edit", "README.md", "--file", "two.md"))); await lifetime.wait(() => pause([]));
    const second = at.stand.refs.get("refs/heads/main")!; expect(second).not.toBe(first);
    const retained = () => runInDurableObject(destination!.object, (_instance, state) => state.storage.sql.exec<{ record: string }>("SELECT record FROM item WHERE type IN ('publication','receipt') ORDER BY id").toArray().map(r => JSON.parse(r.record)));
    const records = await lifetime.wait(() => retained());
    expect(records.filter(r => r.type === "publication" && r.values.integration === first)).toMatchObject([{ state: "cleaned" }]);
    expect(records.filter(r => r.type === "receipt" && r.values.commit === first)).toMatchObject([{ state: "written" }]);
    const entries = await lifetime.wait(() => G.entries());
    expect(entries.some(e => e.input.type === "outcome" && e.input.kind === "reservation-delete" && e.effects.some(f => f.effect === "state" && ["cleanup-deleted", "cleaned"].includes(f.state)))).toBe(true);
    const snapshot = () => runInDurableObject(destination!.object, (_instance, state) => {
      const tables = state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").toArray();
      return tables.map(({ name }) => [name, state.storage.sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray()]);
    });
    const get = (commit: string, conditional = true) => site(new Request(`https://scopes.test/site/${config.repository!.directory.scope}/${commit}/README.md`, { ...(conditional ? { headers: { "if-none-match": "*" } } : {}) }), { SCOPES: env.PLATFORM, ...at.bindings(register!.name) }, at.stand.fetch);
    const before = await lifetime.wait(() => snapshot());
    const old = await lifetime.wait(() => get(first, false)); expect(old.status).toBe(200);
    const body = await lifetime.wait(() => old.text()); expect(body).toContain("First published");
    expect(body).toContain(`/site/${config.repository!.directory.scope}/${first}/README.md`);
    expect(body).toContain(`Rendered from commit <code>${first}</code>`);
    expect((await lifetime.wait(() => get(first))).status).toBe(304); expect(await lifetime.wait(() => snapshot())).toEqual(before);
    // Add a real checker role/configuration but never submit its required check.
    const checker = ok(await lifetime.wait(() => run("act", "add-member", "--on", "membership", "--set", "handle=@check", "--set", "kind=checker")));
    expect(checker.code).toBe(0);
    const configText = new TextDecoder().decode(files["check.json"]);
    const { valueDigest } = await lifetime.wait(() => import("@generalbusiness/artroom-derive"));
    const digest = valueDigest("artroom-check-configuration-1", JSON.parse(configText));
    ok(await lifetime.wait(() => run("act", "keep-configuration", "--on", "rules", "--set", `digest=${digest}`, "--set", "name=unit", "--value", "check.json")));
    const checks = [{ name: "unit", configuration: digest, required: true, checker: { membership: config.repository!.membership, member: "@check" } }];
    ok(await lifetime.wait(() => run("act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", `checks=${JSON.stringify(checks)}`, "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks }))}`)));
    ok(await lifetime.wait(() => run("edit", "README.md", "--file", "one.md")));
    await lifetime.wait(() => pause([]));
    const reserved = (await lifetime.wait(() => G.summary())).value.items.find(i => i.type === "publication" && i.state === "reserved")!;
    expect(reserved).toBeDefined();
    const unapproved = reserved.values["integration"] as string;
    expect((await lifetime.wait(() => get(unapproved))).status).toBe(404);
    lifetime.advance(1800);
    await lifetime.wait(() => runDurableObjectAlarm(G.object)); await lifetime.wait(() => pause([]));
    const timed = await lifetime.wait(() => G.entries());
    expect(timed.some((e: Entry) => e.input.type === "timed" && e.input.item === reserved.id && e.effects.some(f => f.effect === "state" && f.state === "cleanup-aborted"))).toBe(true);
    expect((await lifetime.wait(() => retained())).find(r => r.type === "publication" && r.id === reserved.id)?.state).toBe("cleaned");
    expect((await lifetime.wait(() => get(unapproved))).status).toBe(404);
    expect((await lifetime.wait(() => get(first))).status).toBe(304);
  } finally {
    lifetime.release();
  }
});
