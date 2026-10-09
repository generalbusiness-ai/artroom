import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Entry, Intent, Seed, ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, scopeIdOf, seedDigest, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { keys } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, REGISTER, foundingOf, repositoryName } from "@generalbusiness/artroom-platform";
import { buildPack, type RawGitObject } from "@generalbusiness/artroom-git/http";
import { SqliteStore } from "../src/index.ts";
import { site } from "../src/site/route.ts";
import type { SiteEnv } from "../src/site/host.ts";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { outsideOf, wired } from "./outside.ts";
import { foundingPublication } from "./publication.ts";
import { Platform, rita, sam, settle } from "./repository.ts";

// Actual platform rules, real Durable Objects and SQLite. Only the Git host,
// register creation answer, clock and inspector readers are labelled stand-ins.
// Provider advertising is deliberately wider and newer than room publication.
const ACCOUNT = { id: 17, login: "site-owner", type: "Organization" } as const;
const TOKEN = "scripted-private-read";
const { paul } = keys;
const pkt = (s: string) => `${(utf8(s).length + 4).toString(16).padStart(4, "0")}${s}`;
const concat = (...xs: Uint8Array[]) => { const b = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let at = 0; for (const x of xs) { b.set(x, at); at += x.length; } return b; };
let D: Platform, G: Platform, R: Platform, siteEnv: SiteEnv;
let published: string, objects: RawGitObject[], repository: { name: string; id: string };
let providerId = 71;
const calls: string[] = [];
const roots: string[] = [];
const fetchHost = async (request: Request) => {
  calls.push(request.url);
  const url = new URL(request.url);
  if (url.origin === "https://api.github.com") {
    expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    return new Response(JSON.stringify({ id: providerId, name: repository.name, owner: ACCOUNT, private: true, full_name: `${ACCOUNT.login}/${repository.name}`, html_url: `https://github.com/${ACCOUNT.login}/${repository.name}`, clone_url: `https://github.com/${ACCOUNT.login}/${repository.name}.git` }), { headers: { "content-type": "application/json" } });
  }
  expect(request.headers.get("authorization")).toBe(`Basic ${btoa(`x-access-token:${TOKEN}`)}`);
  if (url.pathname.endsWith("/info/refs")) return new Response(`${pkt("# service=git-upload-pack\n")}0000${pkt(`${"f".repeat(40)} refs/heads/main\0object-format=sha1 allow-reachable-sha1-in-want\n`)}${pkt(`${"e".repeat(40)} refs/heads/private-draft\n`)}0000`, { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });
  expect(new TextDecoder().decode(await request.arrayBuffer())).toContain(`want ${published}`);
  return new Response(concat(utf8(pkt("NAK\n")), await buildPack(objects, { maxBytes: 8 * 1024 * 1024 })), { headers: { "content-type": "application/x-git-upload-pack-result" } });
};
async function founding(publish: boolean) {
  const install: Intent = { v: 1, to: null, actor: paul.key, kind: "install", on: null, expected: {}, fields: { host: "github.com", namespace: ACCOUNT.login, policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const r = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
  roots.push(r.name);
  const host = outsideOf(r.name);
  wired.set(r.name, () => ({ outside: host }));
  expect(await r.stub.found(signIntent(install, paul.secret), REGISTER)).toMatchObject({ answer: "accepted" });
  const found = await r.intent(rita, "found", { expected: await r.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } });
  const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: await r.at(), cause: intentDigest(found.intent), ordinal: 0 };
  const d = new Platform(scopeIdOf(seed));
  const repo = { name: repositoryName(seedDigest(seed), 1), id: "71" };
  host.answer("1:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: repo } });
  expect(await r.stub.submit(found, [])).toMatchObject({ answer: "accepted" });
  await (r.stub as unknown as { effect(): Promise<number> }).effect();
  await settle(r, d);
  const peers = (await d.entries())[0]!.sends.filter(s => (s.to as Seed).kind === "membership" || (s.to as Seed).kind === "rules" || (s.to as Seed).kind === "destination").map(s => new Platform(scopeIdOf(s.to as Seed)));
  await settle(r, d, ...peers);
  const destination = new Platform(((await d.item(0)).refs["destination"] as { scope: ScopeId }).scope);
  if (publish) await foundingPublication(destination);
  return { r, d, g: destination, repo };
}
beforeAll(async () => {
  net.hold = net.deaf = null;
  const f = await founding(true); R = f.r; D = f.d; G = f.g; repository = f.repo;
  const commit = await runInDurableObject(G.object, (_instance, state) => {
    const store = new SqliteStore({ exec: (q, ...b) => state.storage.sql.exec(q, ...b), transaction: (f) => state.storage.transactionSync(f) });
    return foundingOf(store, seq => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; }, "sha1");
  });
  published = commit.commit; objects = commit.objects.map(o => ({ id: o.id, type: o.kind, data: o.body }));
  siteEnv = { SCOPES: env.PLATFORM, GITHUB_READ_TOKEN: TOKEN, GITHUB_APP_CONFIG: canonicalize({ registerScope: R.name, account: ACCOUNT, maxBytes: 8 * 1024 * 1024, publicReads: false }) };
});
afterAll(() => { for (const r of roots) wired.delete(r); });
const get = (ref: string, init?: RequestInit) => site(new Request(`https://scopes.test/site/${D.name}/${ref}/README.md`, init), siteEnv, fetchHost);

// Invariant: serve exactly the destination's recorded head, even when its provider branch has moved.
test("published head served from the real destination record, with conditional/path checks before 304 (STAND-IN provider)", async () => {
  const response = await get("HEAD");
  expect(response.status).toBe(200);
  expect(await response.text()).toContain(`Rendered from commit <code>${published}</code>`);
  expect((await get("main", { headers: { "if-none-match": "*" } })).status).toBe(304);
  expect((await site(new Request(`https://scopes.test/site/${D.name}/HEAD/missing.md`, { headers: { "if-none-match": "*" } }), siteEnv, fetchHost)).status).toBe(404);
  const versions = await site(new Request(`https://scopes.test/site/${D.name}/versions/`), siteEnv, fetchHost);
  const body = await versions.text();
  expect(body).toContain(published); expect(body).not.toContain("private-draft"); expect(body).not.toContain("f".repeat(40));
});
// Invariant: same-repository unpublished names and raw commit IDs cannot acquire provider access.
test("unpublished branch, tag and commit names refused before provider access (real scopes)", async () => {
  const before = calls.length;
  for (const ref of ["private-draft", "v1", published, "e".repeat(40)]) {
    const response = await get(ref, { headers: { "if-none-match": "*" } });
    expect([response.status, response.headers.get("cache-control"), await response.text()]).toEqual([404, "no-store", "not-published: the room has not published that ref\n"]);
  }
  expect(calls.length).toBe(before);
});
// Invariant: selected publication never bypasses the provider's stable repository ID check.
test("foreign repository ID refused before Git objects despite a recorded publication (real scopes, STAND-IN provider)", async () => {
  const before = calls.length; providerId = 72;
  try { const response = await get("HEAD", { headers: { "if-none-match": "*" } }); expect([response.status, response.headers.get("x-site-step")]).toEqual([502, "info"]); }
  finally { providerId = 71; }
  expect(calls.slice(before)).toEqual([`https://api.github.com/repos/${ACCOUNT.login}/${repository.name}`]);
});
// Invariant: refusal is a read only, even on restart with an uncompleted first-head operation.
test("not-published refusal writes no entries, operation bookkeeping, custody or other SQLite rows and sends nothing (real scopes)", async () => {
  const f = await founding(false);
  const snapshot = (node: Platform) => runInDurableObject(node.object, (_instance, state) => {
    const tables = state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").toArray();
    return tables.map(({ name }) => [name, state.storage.sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray()]);
  });
  const before = await Promise.all([f.d, f.g].map(snapshot));
  let sent = 0;
  wired.set(f.g.name, () => ({ outside: { accepts: () => true, send: async () => { sent++; return null; } } }));
  await f.g.restart();
  const response = await site(new Request(`https://scopes.test/site/${f.d.name}/HEAD/README.md`), { ...siteEnv, GITHUB_APP_CONFIG: canonicalize({ registerScope: f.r.name, account: ACCOUNT, maxBytes: 8 * 1024 * 1024, publicReads: false }) }, async () => { sent++; return new Response(null, { status: 500 }); });
  expect([response.status, await response.text()]).toEqual([404, "not-published: the room has not published that ref\n"]);
  expect(await Promise.all([f.d, f.g].map(snapshot))).toEqual(before);
  expect(sent).toBe(0);
  wired.delete(f.g.name);
});
