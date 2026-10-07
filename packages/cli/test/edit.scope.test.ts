import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";
import type { Item, Read, ScopeId } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, scopeIdOf, timeMs, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { firstExtents, foundingObjects, platform } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { CAPABILITY_CODE } from "@generalbusiness/artroom-scope";
import { READ_BOUNDS, Reader, ZERO_ID, type GitSource } from "@generalbusiness/artroom-git";
import { buildPack } from "@generalbusiness/artroom-git/http";
import { decodePack, type DecodedObject } from "@generalbusiness/artroom-git/http-read";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import type { ArtifactsNamespace } from "../../scope/src/artifacts-host.ts";
import type { ArtifactsBindings } from "../../scope/src/artifacts-wiring.ts";
import type { GitHubBindings } from "../../scope/src/github-wiring.ts";
import type { Outside, OutsideGiven } from "../../scope/src/index.ts";
import { artifactsOutside } from "../../scope/src/artifacts-wiring.ts";
import { gitHubOutside } from "../../scope/src/github-wiring.ts";
import { site } from "../../scope/src/site/route.ts";
import type { SiteEnv } from "../../scope/src/site/host.ts";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { DEMO_DIGESTS, changeDemo } from "../../lanes/src/index.ts";
import { command, memoryStore, type Context, type Outcome } from "../src/index.ts";

const SERVICE = "https://scopes.test";
const NAMESPACE = "artroom-demo";
const HOST = "service.invalid";
const MAX_BYTES = 8 * 1024 * 1024;
/** The test's own reader, which the command never presents. */
const reader = "a test reader";

const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const pkt = (text: string): Uint8Array => { const bytes = utf8(text); return join(utf8((bytes.length + 4).toString(16).padStart(4, "0")), bytes); };

/**
 * STAND-IN for the hosting's own Git service: its binding, and smart HTTP over a map of refs and objects. A read serves every
 * object; a push applies its one compare-and-swap command and keeps the objects of its pack, decoded. It is no Git host: the git
 * package's own tests send the same pack bytes to real local Git.
 */
class OwnGit {
  name: string | null = null;
  readonly refs = new Map<string, string>();
  readonly objects = new Map<string, DecodedObject>();
  readonly tokens = new Map<string, "read" | "write">();
  readonly revoked = new Set<string>();
  readonly pushes: { ref: string; old: string; commit: string }[] = [];
  readonly remote = (name: string) => `https://${HOST}/git/${NAMESPACE}/${name}.git`;
  readonly ns: ArtifactsNamespace = {
    get: async (name) => ({
      createToken: async (scope, ttl) => {
        const plaintext = `${scope}-plaintext-${this.tokens.size + 1}`;
        this.tokens.set(plaintext, scope);
        return { id: `tok-${this.tokens.size}`, plaintext, scope, expiresAt: new Date(timeMs(net.clock.now)! + ttl * 1000).toISOString() };
      },
      revokeToken: async (token) => { this.revoked.add(token); return true; },
      info: async () => ({ name, remote: this.remote(name) }),
    }),
    create: async (name) => {
      expect(this.name).toBeNull();
      this.name = name;
      this.tokens.set("creation-plaintext", "write");
      return { name, remote: this.remote(name), token: "creation-plaintext" };
    },
    delete: async () => false,
  };

  #advertisement(service: string): Response {
    const capabilities = service === "git-receive-pack" ? "report-status delete-refs object-format=sha1" : "ofs-delta allow-reachable-sha1-in-want object-format=sha1";
    const refs = [...this.refs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const lines = refs.length === 0 ? [pkt(`${ZERO_ID} capabilities^{}\0${capabilities}\n`)] : refs.map(([ref, id], n) => pkt(`${id} ${ref}${n === 0 ? `\0${capabilities}` : ""}\n`));
    return new Response(join(pkt(`# service=${service}\n`), utf8("0000"), ...lines, utf8("0000")), { headers: { "content-type": `application/x-${service}-advertisement` } });
  }

  readonly fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    expect(url.origin + url.pathname.replace(/\/(info\/refs|git-upload-pack|git-receive-pack)$/, "")).toBe(this.remote(this.name!));
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const scope = this.tokens.get(token);
    if (scope === undefined || this.revoked.has(token)) return new Response("no", { status: 401 });
    const service = url.searchParams.get("service");
    if (request.method === "GET" && (service === "git-upload-pack" || service === "git-receive-pack")) return this.#advertisement(service);
    if (request.method === "POST" && url.pathname.endsWith("/git-upload-pack")) {
      const pack = await buildPack([...this.objects.values()].map((o) => ({ id: o.id, type: o.type as "blob" | "tree" | "commit", data: o.data })), { maxBytes: MAX_BYTES });
      return new Response(join(pkt("NAK\n"), pack), { headers: { "content-type": "application/x-git-upload-pack-result" } });
    }
    if (request.method === "POST" && url.pathname.endsWith("/git-receive-pack")) {
      expect(scope).toBe("write");
      return receive(this, await request.arrayBuffer());
    }
    return new Response("unscripted", { status: 404 });
  };
}

const ACCOUNT = { id: 285042784, login: "generalbusiness-ai", type: "Organization" } as const;
const CREATION = "operator_creation_fixture_secret";
const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/**
 * STAND-IN for GitHub's REST API and its smart HTTP, as `github-founding.test.ts` scripts them, with reads of every object added:
 * a public repository, read with no credential, written with an installation token. Refs and objects are maps. It is no oracle of
 * GitHub's behaviour.
 */
class Hub {
  name: string | null = null;
  readonly refs = new Map<string, string>();
  readonly objects = new Map<string, DecodedObject>();
  readonly minted: string[] = [];
  readonly revoked = new Set<string>();
  readonly pushes: { ref: string; old: string; commit: string }[] = [];
  #repository() {
    return { id: 71, name: this.name, owner: ACCOUNT, private: false, full_name: `${ACCOUNT.login}/${this.name}`, html_url: `https://github.com/${ACCOUNT.login}/${this.name}`, clone_url: `https://github.com/${ACCOUNT.login}/${this.name}.git` };
  }
  #advertisement(service: string): Response {
    const capabilities = service === "git-receive-pack" ? "report-status delete-refs object-format=sha1" : "ofs-delta allow-reachable-sha1-in-want object-format=sha1";
    const refs = [...this.refs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const lines = refs.length === 0 ? [pkt(`${ZERO_ID} capabilities^{}\0${capabilities}\n`)] : refs.map(([ref, id], n) => pkt(`${id} ${ref}${n === 0 ? `\0${capabilities}` : ""}\n`));
    return new Response(join(pkt(`# service=${service}\n`), utf8("0000"), ...lines, utf8("0000")), { headers: { "content-type": `application/x-${service}-advertisement` } });
  }
  readonly fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.hostname === "api.github.com") {
      if (request.method === "POST" && url.pathname === `/orgs/${ACCOUNT.login}/repos`) {
        expect(request.headers.get("authorization")).toBe(`Bearer ${CREATION}`);
        const body = await request.json() as { name: string };
        expect(this.name).toBeNull();
        this.name = body.name;
        return json(this.#repository(), 201);
      }
      if (request.method === "POST" && url.pathname === "/app/installations/99/access_tokens") {
        expect(await request.json()).toEqual({ repository_ids: [71], permissions: { contents: "write" } });
        const token = `ghs_edit_fixture_${this.minted.length + 1}`;
        this.minted.push(token);
        return json({ token, expires_at: timeOf(timeMs(net.clock.now)! + 3600_000), repository_selection: "selected", permissions: { contents: "write", metadata: "read" }, repositories: [this.#repository()] }, 201);
      }
      if (request.method === "DELETE" && url.pathname === "/installation/token") {
        this.revoked.add(request.headers.get("authorization")!.slice("Bearer ".length));
        return new Response(null, { status: 204 });
      }
      if (request.method === "GET" && url.pathname === `/repos/${ACCOUNT.login}/${this.name}`) return json(this.#repository());
      throw new Error(`unscripted REST request ${request.method} ${url.pathname}`);
    }
    expect(url.origin + url.pathname.replace(/\/(info\/refs|git-upload-pack|git-receive-pack)$/, "")).toBe(`https://github.com/${ACCOUNT.login}/${this.name}.git`);
    const service = url.searchParams.get("service");
    // Reads are public: no credential is sent. A write carries an installation token that is minted and not revoked.
    if (request.method === "GET" && service === "git-upload-pack") return this.#advertisement(service);
    if (request.method === "POST" && url.pathname.endsWith("/git-upload-pack")) {
      const pack = await buildPack([...this.objects.values()].map((o) => ({ id: o.id, type: o.type as "blob" | "tree" | "commit", data: o.data })), { maxBytes: MAX_BYTES });
      return new Response(join(pkt("NAK\n"), pack), { headers: { "content-type": "application/x-git-upload-pack-result" } });
    }
    const token = atob(request.headers.get("authorization")?.slice("Basic ".length) ?? "").slice("x-access-token:".length);
    if (!this.minted.includes(token) || this.revoked.has(token)) return new Response("no", { status: 401 });
    if (request.method === "GET" && service === "git-receive-pack") return this.#advertisement(service);
    if (request.method === "POST" && url.pathname.endsWith("/git-receive-pack")) return receive(this, await request.arrayBuffer());
    throw new Error("unscripted Git request");
  };
}

/** One receive-pack request to a stand-in: its one compare-and-swap command, applied, and the objects of its pack, kept. */
async function receive(host: { refs: Map<string, string>; objects: Map<string, DecodedObject>; pushes: { ref: string; old: string; commit: string }[] }, buffer: ArrayBuffer): Promise<Response> {
  const body = new Uint8Array(buffer);
  const size = parseInt(new TextDecoder().decode(body.subarray(0, 4)), 16);
  const match = /^([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Za-z0-9._/-]+)\0report-status\n$/.exec(new TextDecoder().decode(body.subarray(4, size)));
  expect(match).not.toBeNull();
  const [old, commit, ref] = [match![1]!, match![2]!, match![3]!];
  const result = (line: string) => new Response(join(pkt("unpack ok\n"), pkt(line), utf8("0000")), { headers: { "content-type": "application/x-git-receive-pack-result" } });
  if ((host.refs.get(ref) ?? ZERO_ID) !== old) return result(`ng ${ref} stale\n`);
  for (const object of await decodePack(body.subarray(size + 4), { maxBytes: MAX_BYTES })) host.objects.set(object.id, object);
  host.pushes.push({ ref, old, commit });
  host.refs.set(ref, commit);
  return result(`ok ${ref}\n`);
}

/** A reader of what a stand-in host holds, for the test's own checks. */
function readerOf(host: { refs: Map<string, string>; objects: Map<string, DecodedObject> }): Reader {
  const source: GitSource = {
    object: async (id) => { const o = host.objects.get(id); return o ? { type: o.type, size: o.data.length, data: o.data } : null; },
    ref: async (ref) => host.refs.get(ref) ?? null, refs: async () => [],
  };
  return new Reader(source, READ_BOUNDS);
}

/** A Git host for one room, as the test wires it: the install's host, the production wiring of its ports, and its stand-in. */
interface Stand {
  host: string;
  namespace: string;
  /** The host's bindings for the register that the install made: what a deployment's setting holds. */
  bindings(registerScope: ScopeId): ArtifactsBindings & GitHubBindings;
  /** The production wiring of the host's ports, over the stand-in. */
  outside(given: OutsideGiven, sql: Pick<SqlStorage, "exec">, bindings: ArtifactsBindings & GitHubBindings): Outside;
  stand: { fetch(request: Request): Promise<Response>; refs: Map<string, string>; objects: Map<string, DecodedObject>; pushes: { ref: string; old: string; commit: string }[] };
  /** Every credential the stand-in gave out, which no history may hold. */
  secrets(): string[];
}

function ownHost(): Stand {
  const stand = new OwnGit();
  return {
    host: "artifacts", namespace: NAMESPACE, stand,
    bindings: (registerScope) => ({ ARTIFACTS_CONFIG: canonicalize({ registerScope, namespace: NAMESPACE, host: HOST, maxBytes: MAX_BYTES, credentialIdentity: "adapter-attempt" }), ARTIFACTS: stand.ns }),
    outside: (given, sql, bindings) => artifactsOutside(given, sql, bindings, stand.fetch),
    secrets: () => [...stand.tokens.keys()],
  };
}

async function gitHub(): Promise<Stand> {
  const stand = new Hub();
  const keypair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keypair.privateKey) as ArrayBuffer);
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(Array.from(privateBytes, (byte) => String.fromCharCode(byte)).join(""))}\n-----END PRIVATE KEY-----\n`;
  return {
    host: "github.com", namespace: ACCOUNT.login, stand,
    bindings: (registerScope) => ({
      GITHUB_APP_CONFIG: canonicalize({ issuer: "Iv1.scripted-edit", installationId: 99, account: ACCOUNT, maxBytes: MAX_BYTES, registerScope, privateRepositories: false, publicReads: true, credentialIdentity: "adapter-attempt" }),
      GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_CREATION_TOKEN: CREATION,
    }),
    outside: (given, sql, bindings) => gitHubOutside(given, sql, bindings, stand.fetch),
    secrets: () => [CREATION, privateKey, ...stand.minted],
  };
}

// Invariant: `artroom edit` proposes one file as a change of the room's lane, the room judges it by its rules, and the destination
// writes the published tree with that file and pushes the commit; the site route then serves the file. A change in the rules extent
// waits for the rules scope's controller; a path no tree may hold is refused by name, and nothing is pushed. Both hosts' providers
// push the commit the same way.
//
// | Part | Is |
// |---|---|
// | The commands, their keys and their intents | Real: `command` of `src/line.ts`, with a store in memory for each person. |
// | The scopes, the routes and the readers | Real, as in `story.scope.test.ts`: the namespace `PLATFORM`, the Worker's HTTP routes, and the real read sessions under a TEST SECRET. The change lane is created by the real directory under the demo profile's digest, which the real rules scope activated. |
// | The Git host | The production wiring of each host's ports, `artifacts-wiring.ts` and `github-wiring.ts`, for the register and the destination, over a STAND-IN: `OwnGit` for the hosting's own Git service, its binding and its smart HTTP; `Hub` for GitHub's REST API and smart HTTP. Refs and objects are maps. Every write is a real push of a pack that the stand-in decodes. |
// | The site route | Real: `site` of the scope package, called as the Worker calls it, over the same stand-in. Its answer is read as text; no page is rendered in a browser. |
// | The scheduler | A STAND-IN: while a command waits, its `pause` runs the operations drivers and the dispatchers of the scopes it waits on, as a deployment's alarms would. |
// | The clock | The scripted clock of the namespaces. |
describe("artroom edit on real scopes, through the production wiring of each Git host's ports. The Git hosts and the scheduler are STAND-INs", () => {
  for (const [label, made] of [["the hosting's own Git service", async () => ownHost()], ["GitHub", gitHub]] as const) {
    test(`on ${label}: found a room; edit README.md: the change is judged, the destination pushes the published tree with that file and the site route serves it; a second edit replaces it; an edit of AGENTS.md by a maintainer waits until the rules scope's controller approves, then publishes; a path no tree may hold is refused path-invalid with nothing pushed; and the destination replays consistent`, async () => {
      net.hold = net.deaf = null;
      platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
      platformNet.sessions = true;
      platformNet.inspector = reader;
      const wired = new Set<ScopeId>();
      try {
        await story(await made(), wired);
      } finally {
        platformNet.secret = null;
        platformNet.sessions = false;
        platformNet.inspector = null;
        net.hold = null;
        for (const name of wired) platformOutside.delete(name);
      }
    }, 120_000);
  }
});

async function story(at: Stand, wired: Set<ScopeId>): Promise<void> {
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const now = () => timeMs(net.clock.now)!;
  const host = at.stand;
  let R: Platform | null = null;
  const bindings = () => at.bindings(R!.name);
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => at.outside(given, sql, bindings())); };
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
  const files: Record<string, Uint8Array> = {
    "change-demo.json": utf8(canonicalize(changeDemo)),
    "readme.md": utf8("# The handbook\n\nWritten by the room.\n"),
    "readme-2.md": utf8("# The handbook, again\n"),
    "agents.md": utf8("# Agents\n\nAsk before you push.\n"),
    "binary.bin": Uint8Array.from([0xff, 0xfe, 0x00]),
  };
  const person = (): Context => ({ store: memoryStore(), fetch, now, pause, read: async (path) => files[path] ?? null });
  const rita = person();
  const paul = person();
  const run = (who: Context, ...argv: string[]): Promise<Outcome> => command(who, argv);
  const ok = (outcome: Outcome) => { expect(outcome.code, outcome.lines.join("\n")).toBe(0); return outcome; };

  // A room on the host: the register creates the repository through the real port, and every scope that a creation makes is
  // wired to the same port before it first runs. Only the register and the destination take its effects.
  ok(await run(rita, "install", SERVICE, "--host", at.host, "--namespace", at.namespace));
  R = new Platform((await rita.store.config())!.register!.scope);
  wire(R.name);
  await R.restart();
  known.push(R);
  net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
  ok(await run(rita, "claim", "demo", "--handle", "@rita"));
  const repository = (await rita.store.config())!.repository!;
  const [D, G] = [new Platform(repository.directory.scope), new Platform(repository.destination)];
  known.push(G);
  await pause([]);
  // The founding head, pushed by the destination through the port: an empty tree. The site has no README yet.
  const first = foundingObjects("sha1", G.name, (await G.entries())[0]!.time, (await G.item(0)).refs["claim"] as never).commit;
  expect([(await G.item(0)).values["head"], host.refs.get("refs/heads/main")]).toEqual([first, first]);
  const siteEnv: SiteEnv = { SCOPES: env.PLATFORM, ...bindings() };
  const page = async (path: string) => { const response = await site(new Request(`${SERVICE}/site/${D.name}/HEAD/${path}`), siteEnv, host.fetch); return { status: response.status, body: await response.text() }; };
  expect(await page("README.md")).toEqual({ status: 404, body: "not-found: no file is at that path\n" });

  // paul, a maintainer: he holds change.merge and not rules.publish.
  const link = ok(await run(rita, "invite", "@paul", "--role", "maintainer")).lines[1]!.split(": ")[1]!;
  ok(await run(paul, "join", link));

  // The rules: the first extents, with no approval for the source extent; the rules extent asks one from the controller. The
  // change definition of the demo profile, activated with its bytes beside the act.
  ok(await run(rita, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`));
  // Before the activation there is no change to open: nothing is signed.
  const none = await run(rita, "edit", "README.md", "--file", "readme.md");
  expect([none.code, none.lines[0]]).toEqual([1, expect.stringMatching(/^The rules scope sc_\S+ holds no change definition active\. An admin activates one: artroom act activate/)]);
  ok(await run(rita, "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.change}`, "--set", "name=change", "--value", "change-demo.json"));

  // A file that is no UTF-8 text is not carried: nothing is signed.
  const before = (await D.summary()).at;
  expect((await run(rita, "edit", "logo.png", "--file", "binary.bin")).code).toBe(2);
  expect((await D.summary()).at).toEqual(before);

  // edit README.md: in the source extent, which asks no approval, rita's own merge publishes it.
  const edited = ok(await run(rita, "edit", "README.md", "--file", "readme.md"));
  const head1 = host.refs.get("refs/heads/main")!;
  expect(edited.lines).toEqual([
    expect.stringMatching(/^Proposed README\.md \(\d+ bytes\) as change sc_\S+, version \d+\.$/),
    expect.stringMatching(new RegExp(`^Published: commit ${head1}, by the merge sc_\\S+:\\d+\\.$`)),
    `Page: ${SERVICE}/site/${D.name}/HEAD/README.md`,
  ]);
  // The destination recorded the commit the host holds: one parent, the founding head; its tree holds README.md and nothing else.
  const git = readerOf(host);
  const commit1 = await git.commit(head1);
  expect([(await G.item(0)).values["head"], commit1.parents, (await git.tree(commit1.tree)).map((e) => new TextDecoder().decode(e.name))]).toEqual([head1, [first], ["README.md"]]);
  const shown = await page("README.md");
  expect([shown.status, shown.body]).toEqual([200, expect.stringContaining('<h1 id="the-handbook">The handbook</h1>\n<p>Written by the room.</p>')]);

  // A second edit of the same path replaces the file.
  ok(await run(rita, "edit", "README.md", "--file", "readme-2.md", "--title", "Retitle the handbook"));
  const head2 = host.refs.get("refs/heads/main")!;
  expect((await git.commit(head2)).parents).toEqual([head1]);
  const replaced = await page("README.md");
  expect([replaced.body.includes('<h1 id="the-handbook-again">The handbook, again</h1>'), replaced.body.includes("Written by the room.")]).toEqual([true, false]);

  // AGENTS.md is in the rules extent. paul's merge is refused by the destination, named; nothing is pushed.
  const waiting = await run(paul, "edit", "AGENTS.md", "--file", "agents.md");
  const lane = /as change (sc_\S+), version (\d+)\./.exec(waiting.lines[0]!)!;
  expect(waiting).toEqual({ code: 1, lines: [waiting.lines[0], expect.stringMatching(new RegExp(`^Not published: the merge ${lane[1]}:\\d+ is refused, rules-not-met:rules\\. The change ${lane[1]} stays open at version ${lane[2]}\\. When it may be merged, run: artroom merge ${lane[1]}$`))] });
  expect([host.refs.get("refs/heads/main"), (await page("AGENTS.md")).status]).toEqual([head2, 404]);
  // The rules scope's controller approves it for the rules extent; then paul's merge publishes it.
  ok(await run(rita, "act", "review-verdict", "--on", lane[1]!, "--set", `manifest=${lane[2]}`, "--set", "verdict=approve", "--set", "extent=rules"));
  const merged = ok(await run(paul, "merge", lane[1]!));
  const head3 = host.refs.get("refs/heads/main")!;
  expect(merged.lines).toEqual([expect.stringMatching(new RegExp(`^Published: commit ${head3}, by the merge ${lane[1]}:\\d+\\.$`)), `Page: ${SERVICE}/site/${D.name}/HEAD/AGENTS.md`]);
  expect([(await git.commit(head3)).parents, (await page("AGENTS.md")).body.includes("Ask before you push.")]).toEqual([[head2], true]);

  // A path that no tree may hold is refused by the destination, by name, and nothing is pushed.
  const pushes = host.pushes.length;
  const outside = await run(rita, "edit", "../outside.md", "--file", "readme.md");
  expect([outside.code, outside.lines[1]]).toEqual([1, expect.stringMatching(/^Not published: the merge sc_\S+:\d+ is refused, path-invalid\. /)]);
  expect([host.refs.get("refs/heads/main"), host.pushes.length]).toEqual([head3, pushes]);

  // The destination's history, with its three publications of a one-file manifest and two refusals, replays consistent, with the
  // histories whose entries it names: a verifier reads each over HTTP and derives every entry again, with the platform package's
  // rules and the capability code that the production ports hold, as `wiring.scope.test.ts` does. `artroom verify` carries no
  // capability code, and answers that it cannot derive a lane (the delivery note's section 5).
  const replayed = await verify(httpSource(SERVICE, { fetch: routed, reader }), { mode: "replay", scope: G.name, platform, grants: "proven", anchors: [], capabilities: CAPABILITY_CODE, owners: CAPABILITY_CODE, head: (await G.summary()).at });
  expect([replayed.report.result, replayed.why ?? null]).toEqual(["consistent", null]);
  // No token of the host is in any history: every scope's entries, read past the sessions.
  const histories = canonicalize(await Promise.all([R, D, G].map((node) => node.entries())));
  for (const secret of at.secrets()) expect(histories).not.toContain(secret);
  // The publications are the room's: every push to the branch is the destination's, after the founding one.
  expect(host.pushes.filter((p) => p.ref === "refs/heads/main").map((p) => p.commit)).toEqual([first, head1, head2, head3]);
  const items = await (G.stub as unknown as { items(reader: unknown, type: string): Promise<Read<readonly Item[]>> }).items(reader, "publication");
  expect(items.ok && items.value.map((item) => [item.state, item.values["reason"] ?? null])).toEqual([["published", null], ["published", null], ["not-reserved", "rules-not-met:rules"], ["published", null], ["not-reserved", "path-invalid"]]);
}
