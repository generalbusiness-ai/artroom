import { expect, test } from "vitest";
import { utf8 } from "@generalbusiness/artroom-bytes";
import { ArtifactsProvider } from "../src/artifacts-host.ts";
import { GitHubProvider, type DestinationRefDeletion } from "../src/github-host.ts";

// The real provider ports and smart-HTTP parser run over SCRIPTED binding,
// REST and Git replies. No live provider, scope, or durable custody runs.
const ref = "refs/artroom/reservations/r1";
const old = "1".repeat(40);
const other = "2".repeat(40);
const binding = { scope: { scope: "sc_scripted", inc: "in_scripted", kind: "destination" }, mint: "1:0", attempt: 1, write: "2:0", writeAttempt: 1, ref } as const;
const pkt = (text: string) => `${(utf8(text).length + 4).toString(16).padStart(4, "0")}${text}`;
const advertisement = (service: string, target: string | null) => new Response(
  `${pkt(`# service=${service}\n`)}0000${target === null
    ? pkt(`${"0".repeat(40)} capabilities^{}\0report-status delete-refs\n`)
    : pkt(`${target} ${ref}\0report-status delete-refs\n`)}0000`,
  { headers: { "content-type": `application/x-${service}-advertisement` } },
);

function fixture(host: "github" | "artifacts") {
  let head: string | null = old;
  const script = { report: "ok", apply: true, readFails: false, readIdentity: true };
  const posts: { body: string; authorization: string | null }[] = [];
  const calls: string[] = [];
  const repository = host === "github"
    ? { host: "github.com", namespace: "demo", name: "repo", id: "71" }
    : { host: "artifacts", namespace: "demo", name: "repo", id: "repo" };
  const fetch = async (request: Request): Promise<Response> => {
    calls.push(`${request.method} ${new URL(request.url).pathname}`);
    if (request.url.startsWith("https://api.github.com/repos/demo/repo")) return new Response(JSON.stringify({ id: script.readIdentity ? 71 : 72, name: "repo", private: false, full_name: "demo/repo", html_url: "https://github.com/demo/repo", clone_url: "https://github.com/demo/repo.git", owner: { login: "demo", id: 7, type: "Organization" } }), { headers: { "content-type": "application/json" } });
    if (request.url.endsWith("/info/refs?service=git-receive-pack")) return advertisement("git-receive-pack", head);
    if (request.url.endsWith("/info/refs?service=git-upload-pack")) {
      if (script.readFails) throw new Error("unavailable read");
      return advertisement("git-upload-pack", head);
    }
    if (request.url.endsWith("/git-receive-pack")) {
      posts.push({ body: new TextDecoder().decode(await request.arrayBuffer()), authorization: request.headers.get("authorization") });
      if (script.apply) head = null;
      if (script.report === "lost") throw new Error("lost own answer");
      const status = script.report === "refused" ? `ng ${ref} denied\n` : script.report === "partial" ? "" : `ok ${ref}\n`;
      return new Response(`${pkt("unpack ok\n")}${status === "" ? "" : pkt(status)}0000`, { headers: { "content-type": "application/x-git-receive-pack-result" } });
    }
    throw new Error("unscripted request");
  };
  const provider = host === "github"
    ? new GitHubProvider({ host: "github.com", namespace: "demo", maxBytes: 4096, app: { issuer: "fixture", installationId: 1, account: { login: "demo", id: 7, type: "Organization" }, privateKey: "-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----", fetch }, readCredential: async () => "read_token", credentialHandle: async () => { throw new Error("unexpected write mint"); } })
    : new ArtifactsProvider({ host: "artifacts", namespace: "demo", service: "service.invalid", maxBytes: 4096, fetch,
      credentialHandle: async () => { throw new Error("unexpected write mint"); }, binding: {
        get: async (name) => ({
          info: async () => ({ remote: `https://${script.readIdentity ? "service" : "other"}.invalid/git/demo/${name}.git` }),
          createToken: async (scope) => { calls.push(`token ${scope}`); if (scope !== "read") throw new Error("unexpected write mint"); return { plaintext: "read_token", scope, expiresAt: "2026-10-09T00:00:00Z" }; },
          revokeToken: async () => { calls.push("revoke read"); return true; },
        }), create: async () => { throw new Error("unexpected create"); }, delete: async () => { throw new Error("unexpected repository delete"); },
      } });
  const request = (given: Partial<DestinationRefDeletion> = {}): DestinationRefDeletion => ({ repository, ref, old, token: "write_token", binding, allowed: () => true, ...given });
  const remove = async (given: Partial<DestinationRefDeletion> = {}) => { try { return await provider.deleteRef(request(given)); } catch { return null; } };
  return { script, posts, calls, provider, repository, request, remove, head: () => head, reset: (target: string | null = old) => { head = target; } };
}

for (const host of ["github", "artifacts"] as const) {
  // Invariant: a deletion sends exactly old→zero with the held write token;
  // only its complete own answer and authoritative absence settle it.
  test(`${host} provider: deletion requires own whole answer and verified absence`, async () => {
    const f = fixture(host);
    expect(await f.remove()).toEqual({ send: "accepted" });
    expect(f.posts).toEqual([{ body: `${pkt(`${old} ${"0".repeat(40)} ${ref}\0report-status\n`)}0000`, authorization: host === "github" ? `Basic ${btoa("x-access-token:write_token")}` : "Bearer write_token" }]);
    expect(f.head()).toBeNull();

    f.reset(); f.script.apply = false;
    expect(await f.remove()).toBeNull(); // Own success without absent read-back is not success.
    f.script.apply = true; f.script.readFails = true;
    expect(await f.remove()).toBeNull(); // Unavailable is not absent.
    f.reset(); f.script.readFails = false; f.script.readIdentity = false;
    expect(await f.remove()).toBeNull(); // Wrong stable ID / binding remote cannot attest absence.
    f.reset(); f.script.readIdentity = true; f.script.report = "lost";
    const before = f.calls.length;
    expect(await f.remove()).toBeNull();
    expect(f.head()).toBeNull();
    expect(f.calls.slice(before).some((call) => call.includes("git-upload-pack") || call.startsWith("token"))).toBe(false);
    f.reset(); f.script.report = "partial";
    expect(await f.remove()).toBeNull();
    expect(f.posts).toHaveLength(6); // One POST per attempted deletion, no retry.
  });

  // Invariant: stale or denied pre-send operations do not POST; an already
  // marked attempt remains unknown, and a whole remote refusal is distinct.
  test(`${host} provider: deletion preserves CAS, authority denial and marked uncertainty`, async () => {
    const f = fixture(host);
    expect(await f.remove({ allowed: () => false })).toEqual({ send: "not-sent" });
    expect(await f.remove({ allowed: () => false, sentAt: "2026-10-08T23:00:00Z" })).toBeNull();
    f.reset(other);
    expect(await f.remove()).toEqual({ send: "not-sent" });
    expect(await f.remove({ sentAt: "2026-10-08T23:00:00Z" })).toBeNull();
    expect(f.head()).toBe(other);
    expect(f.posts).toHaveLength(0);
    f.reset(); f.script.apply = false; f.script.report = "refused";
    expect(await f.remove()).toEqual({ send: "refused" });
    expect(f.head()).toBe(old);
    expect(f.posts).toHaveLength(1);
    const calls = f.calls.length;
    expect(await f.remove({ repository: { ...f.repository, id: host === "artifacts" ? "foreign" : "invalid" } })).toBeNull();
    expect(await f.remove({ repository: { ...f.repository, namespace: "foreign" } })).toBeNull();
    expect(f.calls).toHaveLength(calls);
  });
}
