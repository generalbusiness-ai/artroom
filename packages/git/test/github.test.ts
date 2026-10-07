import { generateKeyPairSync, verify } from "node:crypto";
import { expect, test, vi } from "vitest";
import { GitHubApp, GitHubFailure, type GitHubAppOptions, type GitHubInstallationToken, type GitHubTokenScope } from "../src/github.ts";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const NOW = Date.parse("2026-10-06T12:00:00Z");
const TOKEN = "ghs_scripted-secret";
const ACCOUNT = { id: 17, login: "demo-owner", type: "Organization" } as const;
const SCOPE = { repositoryIds: [71], permissions: { contents: "write" } } as const;
const repo = (id = 71, name = "demo") => ({ id, name, owner: ACCOUNT, private: true, full_name: `${ACCOUNT.login}/${name}`, html_url: `https://github.com/${ACCOUNT.login}/${name}`, clone_url: `https://github.com/${ACCOUNT.login}/${name}.git` });
const minted = () => ({ token: TOKEN, expires_at: "2026-10-06T13:00:00Z", repository_selection: "selected", permissions: { contents: "write", metadata: "read" }, repositories: [repo()] });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const app = (fetch: NonNullable<GitHubAppOptions["fetch"]>, extra: Partial<GitHubAppOptions> = {}) => new GitHubApp({ issuer: "Iv1.demo", privateKey: PRIVATE, installationId: 99, account: ACCOUNT, now: () => NOW, fetch, ...extra });
// Scripted custody wrapper: no real host minted its stated restriction.
const cleanupToken = (): GitHubInstallationToken => ({ plaintext: TOKEN, expiresAt: "2026-10-06T13:00:00Z", repositoryIds: [71], permissions: { administration: "write", metadata: "read" } });

// Invariant: the App signs a genuine RS256 JWT and a scripted HTTP mint is
// restricted to the caller's exact IDs/permissions; revocation authenticates
// with that exact plaintext. Scripts prove no live provider or durable custody.
test("real RSA JWT and scripted GitHub HTTP expose one restricted mint and exact-token revoke", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    if (request.url.endsWith("/access_tokens")) return json(minted(), 201);
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    return json({ id: 99, account: ACCOUNT, suspended_at: null });
  });
  const jwt = await client.jwt();
  const parts = jwt.split(".");
  expect(JSON.parse(Buffer.from(parts[0]!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
  expect(JSON.parse(Buffer.from(parts[1]!, "base64url").toString())).toEqual({ iat: NOW / 1000 - 60, exp: NOW / 1000 + 540, iss: "Iv1.demo" });
  expect(verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), pair.publicKey, Buffer.from(parts[2]!, "base64url"))).toBe(true);
  await client.validateInstallation();
  const scope: GitHubTokenScope = { repositoryIds: [71], permissions: { contents: "write" } };
  const pending = client.mintInstallationToken(scope);
  // Changes to caller-owned inputs cannot widen an in-flight mint.
  (scope.repositoryIds as number[]).push(72);
  (scope.permissions as Record<string, string>)["administration"] = "write";
  const token = await pending;
  expect(token).toEqual({ plaintext: TOKEN, expiresAt: "2026-10-06T13:00:00Z", repositoryIds: [71], permissions: { contents: "write" } });
  await client.revokeToken(token.plaintext);
  expect(requests.map((r) => [r.method, r.url])).toEqual([
    ["GET", "https://api.github.com/app/installations/99"],
    ["POST", "https://api.github.com/app/installations/99/access_tokens"],
    ["DELETE", "https://api.github.com/installation/token"],
  ]);
  expect(await requests[1]!.json()).toEqual({ repository_ids: [71], permissions: { contents: "write" } });
  expect(requests[2]!.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  expect(requests.every((request) => request.redirect === "manual" && request.credentials === "omit" && request.signal instanceof AbortSignal && new URL(request.url).origin === "https://api.github.com" && !request.url.includes(TOKEN) && !new URL(request.url).search)).toBe(true);
  expect(JSON.stringify(client)).toBe("{}");
});

// Invariant: a provider reply cannot substitute a repository/account, widen a
// permission, omit repository scope or introduce a credential-bearing URL.
test("scripted GitHub mint refuses widened or substituted scope and installation account", async () => {
  const attempts: unknown[] = [
    { ...minted(), repositories: [repo(72)] },
    { ...minted(), repositories: [repo(), repo()] },
    { ...minted(), repositories: undefined },
    { ...minted(), repository_selection: "all" },
    { ...minted(), permissions: { contents: "write", administration: "write" } },
    { ...minted(), repositories: [{ ...repo(), owner: { ...ACCOUNT, id: 18 } }] },
    { ...minted(), repositories: [{ ...repo(), clone_url: `https://${TOKEN}@github.com/demo-owner/demo.git` }] },
    { ...minted(), expires_at: "2026-10-06T11:00:00Z" },
  ];
  for (const answer of attempts) {
    const client = app(async () => json(answer, 201));
    const result = await client.mintInstallationToken(SCOPE).then(() => "accepted", (error: unknown) => error instanceof GitHubFailure ? error.reason : "unexpected-error");
    expect(result).toBe("response");
  }
  await expect(app(async () => json({ id: 99, account: { ...ACCOUNT, login: "elsewhere" }, suspended_at: null })).validateInstallation()).rejects.toMatchObject({ reason: "response" });
  let calls = 0;
  const client = app(async () => { calls++; return json(minted(), 201); });
  await expect(client.mintInstallationToken({ repositoryIds: [], permissions: SCOPE.permissions })).rejects.toMatchObject({ reason: "input" });
  expect(calls).toBe(0);
});

// Invariant: create, lookup and delete stay in the configured account namespace
// and creation requests an empty repository; deletion requires exact-ID scoped
// authority. A 404 is only an unexposed lookup, never an absence proof.
test("scripted GitHub repository operations bind namespace, empty creation and fixed clean URLs", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    if (request.method === "POST") return json(repo(), 201);
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    return request.url.endsWith("/missing") ? new Response(null, { status: 404 }) : json(repo());
  });
  expect(await client.createRepository("demo", { private: true }, TOKEN)).toEqual({ id: 71, owner: ACCOUNT.login, name: "demo", private: true, htmlUrl: "https://github.com/demo-owner/demo", gitUrl: "https://github.com/demo-owner/demo.git" });
  expect(await requests[0]!.json()).toEqual({ name: "demo", private: true, auto_init: false });
  expect((await client.repository("demo", TOKEN))?.id).toBe(71);
  expect(await client.repository("missing", TOKEN)).toBeNull();
  await client.deleteRepository("demo", 71, cleanupToken());
  expect(requests.map((r) => [r.method, r.url])).toEqual([
    ["POST", "https://api.github.com/orgs/demo-owner/repos"],
    ["GET", "https://api.github.com/repos/demo-owner/demo"],
    ["GET", "https://api.github.com/repos/demo-owner/missing"],
    ["DELETE", "https://api.github.com/repos/demo-owner/demo"],
  ]);
  await expect(client.deleteRepository(`demo?token=${TOKEN}`, 71, cleanupToken())).rejects.toMatchObject({ reason: "input" });
  for (const token of [
    { ...cleanupToken(), repositoryIds: [72] },
    { ...cleanupToken(), repositoryIds: [71, 72] },
    { ...cleanupToken(), permissions: { administration: "write", contents: "write" } } as GitHubInstallationToken,
  ]) {
    const result = await client.deleteRepository("demo", 71, token).then(() => "accepted", (error: unknown) => error instanceof GitHubFailure ? error.reason : "unexpected-error");
    expect(result).toBe("input");
  }
  expect(requests.length).toBe(4);
  await expect(app(async () => json({ ...repo(), name: "substituted" })).repository("demo", TOKEN)).rejects.toMatchObject({ reason: "response" });
  await expect(app(async () => json({ ...repo(), private: false }, 201)).createRepository("demo", { private: true }, TOKEN)).rejects.toMatchObject({ reason: "response" });
  let userPath = "";
  const userAccount = { ...ACCOUNT, type: "User" } as const;
  const user = app(async (request) => { userPath = request.url; return json({ ...repo(), owner: userAccount }, 201); }, { account: userAccount });
  await user.createRepository("demo", { private: true }, TOKEN);
  expect(userPath).toBe("https://api.github.com/user/repos");
});

// Invariant: streamed bytes and waits are bounded, redirect/error text is never
// adopted, and a lost POST reply cannot cause another mutation request.
test("scripted GitHub HTTP bounds response and deadline and redacts lost mutation errors without retry", async () => {
  let cancelled = false;
  const oversized = app(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(65)); },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } }), { maxResponseBytes: 64 });
  await expect(oversized.repository("demo", TOKEN)).rejects.toMatchObject({ reason: "too-large" });
  expect(cancelled).toBe(true);
  await expect(app(async () => Response.redirect(`https://other.invalid/?token=${TOKEN}`, 302)).repository("demo", TOKEN)).rejects.toMatchObject({ reason: "response", status: 302 });
  let posts = 0;
  const lost = app(async () => { posts++; throw new Error(`provider ${TOKEN} ${PRIVATE}`); });
  const caught = await lost.createRepository("demo", { private: true }, TOKEN).catch((error: unknown) => error);
  expect(caught).toBeInstanceOf(GitHubFailure);
  expect(String(caught)).toBe("GitHubFailure: GitHub request");
  expect(JSON.stringify(caught)).not.toContain(TOKEN);
  expect(posts).toBe(1);

  vi.useFakeTimers();
  try {
    let signal: AbortSignal | undefined;
    const hung = app(async (request) => { signal = request.signal; return new Promise<Response>(() => undefined); }, { timeoutMs: 5 });
    const pending = hung.repository("demo", TOKEN);
    const refusal = expect(pending).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(5);
    await refusal;
    expect(signal?.aborted).toBe(true);
    const stream = app(async () => new Response(new ReadableStream<Uint8Array>(), { headers: { "content-type": "application/json" } }), { timeoutMs: 5 });
    const stalled = expect(stream.repository("demo", TOKEN)).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(5);
    await stalled;
  } finally { vi.useRealTimers(); }
});
