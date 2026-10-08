import { expect, test } from "vitest";
import { canonicalize, timeMs } from "@generalbusiness/artroom-bytes";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import type { ArtifactsNamespace } from "../src/artifacts-host.ts";
import type { Binding } from "../src/namespace.ts";
import { readerOf, type Room, type SiteEnv } from "../src/site/host.ts";

// These replies are SCRIPTED binding/REST doubles. No scope, repository,
// token or provider exists. The read boundary uses production host checks.
const register = `sc_${"a".repeat(52)}` as ScopeId;
const ownRoom: Room = { register, branch: "main", repository: { host: "artifacts", namespace: "artroom-demo", name: "repo", id: "repo" } };
const ownConfig = { registerScope: register, namespace: "artroom-demo", host: "service.invalid", maxBytes: 1024, credentialIdentity: "adapter-attempt" };

// Invariant: a request/configuration cannot select another namespace of the
// fixed binding, and a remote mismatch mints nothing.
test("site own-host reader refuses another namespace and another remote before minting (SCRIPTED binding)", async () => {
  const calls: string[] = [];
  let revoked = false;
  let remote = "https://elsewhere.invalid/repo.git";
  let now = timeMs("2026-10-04T12:00:00Z")!;
  const ns: ArtifactsNamespace = {
    get: async () => { calls.push("get"); return { info: async () => ({ remote }), createToken: async () => { calls.push("mint"); return { plaintext: "scripted-read", scope: "read", expiresAt: "2026-10-04T12:02:00Z" }; }, revokeToken: async () => { calls.push("revoke"); const answer = !revoked; revoked = true; return answer; } }; },
    create: async () => null, delete: async () => false,
  };
  const env: SiteEnv = { SCOPES: {} as Binding, ARTIFACTS: ns, ARTIFACTS_CONFIG: canonicalize(ownConfig) };
  const other = { ...ownRoom, repository: { ...ownRoom.repository, namespace: "other" } };
  expect(readerOf({ ...env, ARTIFACTS_CONFIG: canonicalize({ ...ownConfig, namespace: "other" }) }, other)).toBeNull();
  expect(calls).toEqual([]);
  await expect(readerOf(env, ownRoom)!()).rejects.toMatchObject({ step: "info" });
  expect(calls).toEqual(["get"]);
  remote = "https://service.invalid/git/artroom-demo/repo.git";
  const fetched: string[] = [];
  const opened = await readerOf(env, ownRoom, async (request) => { fetched.push(request.url); return new Response("unscripted"); }, () => now)!();
  now = timeMs("2026-10-04T12:02:00Z")!;
  expect(await opened.source.ref("refs/heads/main").then(() => "answered", () => "failed")).toBe("failed");
  expect(fetched).toEqual([]);
  expect(await opened.close()).toBe(true);
  expect(await opened.close()).toBe(true);
  expect(calls).toEqual(["get", "get", "mint", "revoke"]);
});

// Invariant: a GitHub name is read only after its lookup confirms the
// configured account and exact recorded stable ID, with no minted token.
test("site GitHub reader checks the account and stable ID before smart HTTP (SCRIPTED REST)", async () => {
  const account = { id: 2, login: "scripted", type: "Organization" };
  const room: Room = { register, branch: "main", repository: { host: "github.com", namespace: account.login, name: "repo", id: "71" } };
  const env: SiteEnv = {
    SCOPES: {} as Binding,
    GITHUB_APP_CONFIG: canonicalize({ issuer: "Iv1.scripted", installationId: 3, account, maxBytes: 1024, registerScope: register, publicReads: false, privateRepositories: true, credentialIdentity: "adapter-attempt" }),
    GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nYQ==\n-----END PRIVATE KEY-----\n", GITHUB_READ_TOKEN: "scripted-read",
  };
  const reply = { id: 71, name: "repo", owner: account, private: true, full_name: "scripted/repo", html_url: "https://github.com/scripted/repo", clone_url: "https://github.com/scripted/repo.git" };
  let answer: unknown = { ...reply, id: 72 };
  const calls: string[] = [];
  const send = async (request: Request) => {
    calls.push(request.url);
    expect(request.method).toBe("GET");
    return new Response(JSON.stringify(answer), { headers: { "content-type": "application/json" } });
  };
  const open = readerOf(env, room, send)!;
  await expect(open()).rejects.toMatchObject({ step: "info" });
  answer = { ...reply, owner: { ...account, id: 9 } };
  await expect(open()).rejects.toMatchObject({ step: "info" });
  answer = reply;
  const opened = await open();
  expect(await opened.close()).toBe(true);
  expect(calls).toEqual(Array(3).fill("https://api.github.com/repos/scripted/repo"));
  expect(readerOf(env, { ...room, repository: { ...room.repository, id: "071" } }, send)).toBeNull();
  expect(calls).toHaveLength(3);
});
