/**
 * STAND-INs for the two Git hosts, for a story that runs the production wiring of each host's ports over them: `OwnGit` for the
 * hosting's own Git service, its binding and its smart HTTP; `Hub` for GitHub's REST API and its smart HTTP. Refs and objects are
 * maps; a read serves every object, and a push applies its one compare-and-swap command and keeps the objects of its pack, decoded
 * by the git package. Neither is a Git host: the git package's own tests send the same pack bytes to real local Git. A `Stand` is
 * one host as a test wires it: the install's host and namespace, the bindings of a deployment's setting, and the production wiring.
 * It lives here, in the scope package, which may name the git package; a lane scenario reaches it by path.
 */
import { expect } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, timeMs, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { READ_BOUNDS, Reader, ZERO_ID, type GitSource } from "@generalbusiness/artroom-git";
import { buildPack } from "@generalbusiness/artroom-git/http";
import { decodePack, type DecodedObject } from "@generalbusiness/artroom-git/http-read";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import { artifactsOutside, type ArtifactsBindings } from "../src/artifacts-wiring.ts";
import { gitHubOutside, type GitHubBindings } from "../src/github-wiring.ts";
import type { Outside, OutsideGiven } from "../src/index.ts";
import { net } from "../src/testing.ts";

export const NAMESPACE = "artroom-demo";
export const HOST = "service.invalid";
export const MAX_BYTES = 8 * 1024 * 1024;

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
export class OwnGit {
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
export class Hub {
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
export async function receive(host: { refs: Map<string, string>; objects: Map<string, DecodedObject>; pushes: { ref: string; old: string; commit: string }[] }, buffer: ArrayBuffer): Promise<Response> {
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
export function readerOf(host: { refs: Map<string, string>; objects: Map<string, DecodedObject> }): Reader {
  const source: GitSource = {
    object: async (id) => { const o = host.objects.get(id); return o ? { type: o.type, size: o.data.length, data: o.data } : null; },
    ref: async (ref) => host.refs.get(ref) ?? null, refs: async () => [],
  };
  return new Reader(source, READ_BOUNDS);
}

/** A Git host for one room, as the test wires it: the install's host, the production wiring of its ports, and its stand-in. */
export interface Stand {
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

export function ownHost(): Stand {
  const stand = new OwnGit();
  return {
    host: "artifacts", namespace: NAMESPACE, stand,
    bindings: (registerScope) => ({ ARTIFACTS_CONFIG: canonicalize({ registerScope, namespace: NAMESPACE, host: HOST, maxBytes: MAX_BYTES, credentialIdentity: "adapter-attempt" }), ARTIFACTS: stand.ns }),
    outside: (given, sql, bindings) => artifactsOutside(given, sql, bindings, stand.fetch),
    secrets: () => [...stand.tokens.keys()],
  };
}

export async function gitHub(): Promise<Stand> {
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
