import { env } from "cloudflare:workers";
import { SELF, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { intentDigest, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { health, HealthProbe } from "../src/health.ts";
import { LATE } from "../src/turn.ts";
import { controls } from "../src/testing.ts";
import { at, create, rita, type Remote } from "./support.ts";

const version = "01234567-89ab-cdef-0123-456789abcdef";
const settings = { SESSION_SECRET: "an ephemeral test secret longer than 32 bytes", DEPLOYMENT: "health-test", VERSION_METADATA: { id: version } };
function github(registerScope: string) {
  return JSON.stringify({ issuer: "fixture", installationId: 1, account: { id: 1, login: "fixture", type: "Organization" }, maxBytes: 1024, registerScope, privateRepositories: true, publicReads: false, credentialIdentity: "adapter-attempt" });
}
function artifacts(registerScope: string) { return JSON.stringify({ registerScope, namespace: "artroom-demo", host: "service.invalid", maxBytes: 1024, credentialIdentity: "adapter-attempt" }); }
const request = (suffix = "", method = "GET") => new Request(`https://scope.test/health${suffix}`, { method });

// Invariant: health reveals only validated public deployment metadata and
// closed operational words, and invalid admission causes no namespace lookup.
test("health configuration, selector and request admission have closed answers without secrets or scope data", async () => {
  const name = scopeIdOf({ v: 1, kind: "register", definition: "platform:register@3", creator: null, cause: `sha256:${"0".repeat(64)}`, ordinal: 0 });
  const other = scopeIdOf({ v: 1, kind: "register", definition: "platform:register@3", creator: null, cause: `sha256:${"1".repeat(64)}`, ordinal: 0 });
  let calls = 0;
  const binding = { idFromName: () => name, get: () => { calls++; return { readiness: async () => "ready" }; } };
  const base = { ...settings, SCOPES: binding as never, GITHUB_APP_CONFIG: github(name) };
  for (const changed of [{ SESSION_SECRET: undefined }, { SESSION_SECRET: "short" }, { DEPLOYMENT: undefined }, { DEPLOYMENT: "" }, { DEPLOYMENT: "界".repeat(43) }]) {
    const response = await health(request(), { ...base, ...changed }, new HealthProbe());
    expect(response?.status).toBe(503);
    const body = await response!.json<Record<string, unknown>>();
    expect(body["sessions"]).toBe("unavailable");
    expect(Object.keys(body).sort()).toEqual(["deployment", "register", "sessions", "version"]);
    expect(JSON.stringify(body)).not.toContain(settings.SESSION_SECRET);
    expect(JSON.stringify(body)).not.toContain(name);
  }
  calls = 0;
  for (const GITHUB_APP_CONFIG of [undefined, "{", github("invalid")]) {
    const response = await health(request(), { ...base, GITHUB_APP_CONFIG });
    expect([response?.status, (await response!.json<{ register: string }>()).register]).toEqual([503, "unconfigured"]);
  }
  const ambiguous = await health(request(), { ...base, ARTIFACTS_CONFIG: artifacts(other) });
  expect([ambiguous?.status, (await ambiguous!.json<{ register: string }>()).register]).toEqual([503, "ambiguous"]);
  expect(calls).toBe(0);
  for (const [suffix, method, status] of [["?x=1", "GET", 400], ["", "POST", 405], ["", "PUT", 405]] as const) expect((await health(request(suffix, method), base))?.status).toBe(status);
  expect(calls).toBe(0);
  const good = await health(request(), { ...base, ARTIFACTS_CONFIG: artifacts(name) }, new HealthProbe());
  expect([good?.status, await good!.json()]).toEqual([200, { deployment: settings.DEPLOYMENT, version, sessions: "ok", register: "ready" }]);
  const head = await health(request("", "HEAD"), base, new HealthProbe());
  expect([head?.status, await head!.text()]).toEqual([200, ""]);
  expect((await SELF.fetch("https://scope.test/health")).status).toBe(503);
});

// Invariant: caller timeout does not release the physical single-flight lease.
// The RPC and deadline port are labelled stand-ins; no clock sleep is used.
test("concurrent health calls share one physical probe, keep it after timeout and cache completion for five seconds", async () => {
  let now = 0, calls = 0, timeout = false;
  let release!: (value: string) => void;
  let completed!: Promise<"ready" | "absent" | "not-ready" | "unavailable">;
  const held = new Promise<string>(resolve => { release = resolve; });
  const name = `sc_${"a".repeat(52)}` as const;
  const binding = { idFromName: () => name, get: () => { calls++; return { readiness: () => held }; } };
  const probe = new HealthProbe(() => now, promise => { completed = promise; return timeout ? Promise.resolve(LATE) : promise; });
  const base = { ...settings, SCOPES: binding as never, GITHUB_APP_CONFIG: github(name) };
  const replies = Array.from({ length: 50 }, () => health(request(), base, probe));
  await Promise.resolve(); await Promise.resolve();
  expect(calls).toBe(1);
  timeout = true;
  for (let i = 0; i < 10; i++) expect((await health(request(), base, probe))?.status).toBe(503);
  expect(calls).toBe(1);
  release("ready"); await completed;
  expect((await Promise.all(replies)).every(response => response?.status === 200)).toBe(true);
  now = 4999;
  expect((await health(request(), base, probe))?.status).toBe(200); expect(calls).toBe(1);
  now = 5000; timeout = false;
  expect((await health(request(), base, probe))?.status).toBe(200); expect(calls).toBe(2);
});

// Invariant: the actual Durable Object probe reads only metadata and returns
// no head, data or credential. Provisional/refused metadata mutations below
// are explicit state fixtures, not proof of those native transitions.
test("native readiness reports absent, active register, non-register, provisional, refused and malformed metadata without writing history", async () => {
  const intent = { v: 1, to: null, actor: rita.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "fixture", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) } as const;
  const name = scopeIdOf({ v: 1, kind: "register", definition: "platform:register@3", creator: null, cause: intentDigest(intent), ordinal: 0 });
  controls(name);
  const object = env.SCOPES.get(env.SCOPES.idFromName(name));
  const peer = object as unknown as Remote & { readiness(): Promise<string> };
  expect(await peer.readiness()).toBe("absent");
  expect((await peer.create(signIntent(intent, rita.secret), "platform:register@3")).answer).toBe("accepted");
  expect(await peer.readiness()).toBe("ready");
  const native = await runInDurableObject(object, (_instance, state) => ({ rows: state.storage.sql.exec("SELECT * FROM entry ORDER BY seq").toArray(), meta: state.storage.sql.exec("SELECT v FROM meta WHERE k='scope'").toArray()[0]!["v"] }));
  const envReady = { ...settings, SCOPES: env.SCOPES, ARTIFACTS_CONFIG: artifacts(name) };
  expect((await health(request(), envReady, new HealthProbe()))?.status).toBe(200);
  for (const status of ["provisional", "refused"]) {
    await runInDurableObject(object, (_instance, state) => { state.storage.sql.exec("UPDATE meta SET v=json_set(v,'$.status',?) WHERE k='scope'", status).toArray(); });
    expect(await peer.readiness()).toBe("not-ready");
  }
  await runInDurableObject(object, (_instance, state) => { state.storage.sql.exec("UPDATE meta SET v='{}' WHERE k='scope'").toArray(); });
  expect(await peer.readiness()).toBe("unavailable");
  await runInDurableObject(object, (_instance, state) => { state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", native.meta).toArray(); });
  expect(await peer.readiness()).toBe("ready");
  expect(await runInDurableObject(object, (_instance, state) => state.storage.sql.exec("SELECT * FROM entry ORDER BY seq").toArray())).toEqual(native.rows);
  const lane = await create();
  expect(await (lane.object as unknown as { readiness(): Promise<string> }).readiness()).toBe("not-ready");
});
