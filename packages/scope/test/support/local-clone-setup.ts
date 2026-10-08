/** Local authenticated HTTP host STAND-IN, backed by real git http-backend.
 * A fixed Node child runs production nodeGit. No arbitrary command/URL route.
 * Ambient Git config/proxies/traces are excluded from this controlled run;
 * the one ephemeral URL rewrite is trusted fixture configuration, not TLS or
 * redirect safety evidence. Tokens exist only in memory/requests/process env. */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import { Host } from "../../../git/test/support/host.ts";
import { bare, cleanup, git, scratch } from "../../../git/test/support/repo.ts";
import type { LocalCloneAddress } from "./local-clone.ts";

const MAX = 1024 * 1024; // fixture-only buffer bound, not a product quota
const controlled = { PATH: process.env["PATH"] ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX) throw new Error("fixture body bound"); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

export default async function setup(project: TestProject) {
  // Unrelated scope files need no Git process or temporary repository.
  // Only the nonce-protected fixed configure request allocates these paths.
  let repo: string | null = null;
  let directory: string | null = null;
  const nonce = randomBytes(32).toString("hex");
  const tokens = new Map<string, { id: string; scope: "read" | "write"; seconds: number; live: boolean }>();
  let name: string | null = null; let remote = ""; let readRequests = 0; let tokenInOutput = false;
  let url = "";
  const requests: { path: string; method: string; bytes: number; status: number }[] = [];
  let failure: string | null = null;
  const run = async (args: string[], env: Record<string, string>) => {
    if (directory === null) return { code: 1, outputClean: true };
    const targetDirectory = directory;
    const version = same(args, ["--version"]) && same(env, {});
    const token = env["GIT_CONFIG_VALUE_0"]?.replace(/^Authorization: Bearer /, "");
    const held = token ? tokens.get(token) : undefined;
    const clone = same(args, ["clone", "--", remote, targetDirectory]) && Object.keys(env).sort().join() === "GIT_CONFIG_COUNT,GIT_CONFIG_KEY_0,GIT_CONFIG_VALUE_0"
      && env["GIT_CONFIG_COUNT"] === "1" && env["GIT_CONFIG_KEY_0"] === "http.extraHeader"
      && env["GIT_CONFIG_VALUE_0"] === `Authorization: Bearer ${token}` && held?.scope === "read" && held.seconds === 3600 && held.live;
    if (!version && !clone) return { code: 1, outputClean: true };
    // The clone still records the clean HTTPS argv remote in origin. Only
    // this trusted process environment maps its transport to the local host.
    const added = clone ? { ...env, GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_1: `url.${url}/repo.git.insteadOf`, GIT_CONFIG_VALUE_1: remote } : env;
    return new Promise<{ code: number | null; outputClean: boolean }>((resolve) => {
      const child = spawn(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), fileURLToPath(new URL("./local-clone-child.ts", import.meta.url))], { cwd: dirname(targetDirectory), env: controlled, stdio: ["pipe", "pipe", "pipe", "ipc"] });
      const chunks: Buffer[] = []; let bytes = 0; let code: number | null = 1;
      const capture = (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX) child.kill(); else chunks.push(Buffer.from(chunk)); };
      child.stdout!.on("data", capture); child.stderr!.on("data", capture);
      child.on("message", (message) => { const value = message as { code?: unknown }; if (value.code === null || Number.isInteger(value.code)) code = value.code as number | null; });
      const timer = setTimeout(() => child.kill(), 30_000);
      child.on("error", () => resolve({ code: 1, outputClean: true }));
      child.on("close", (exit) => {
        clearTimeout(timer);
        const output = Buffer.concat(chunks).toString("utf8");
        const clean = ![...tokens.keys()].some((secret) => output.includes(secret));
        tokenInOutput ||= !clean;
        resolve({ code: exit === 0 && bytes <= MAX ? code : 1, outputClean: clean });
      });
      child.stdin!.end(JSON.stringify({ args, env: added }));
    });
  };
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? "/", url).pathname;
      const raw = await body(request);
      response.on("finish", () => { requests.push({ path, method: request.method ?? "GET", bytes: raw.length, status: response.statusCode }); });
      const send = (value: unknown) => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
      if (path === "/backend" || path.startsWith("/repo.git/")) {
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) if (typeof value === "string") headers.set(key, value);
        if (path === "/backend" && headers.get("x-clone-fixture") !== nonce) { response.writeHead(403); response.end(); return; }
        const target = path === "/backend" ? headers.get("x-clone-remote") ?? "" : `${remote}${(request.url ?? "").slice("/repo.git".length)}`;
        if (!name || repo === null || !target.startsWith(`${remote}/`)) { response.writeHead(404); response.end(); return; }
        const tail = target.slice(remote.length);
        const upload = tail === "/info/refs?service=git-upload-pack" || tail === "/git-upload-pack";
        const receive = tail === "/info/refs?service=git-receive-pack" || tail === "/git-receive-pack";
        const plaintext = headers.get("authorization")?.replace(/^Bearer /, "");
        const token = plaintext ? tokens.get(plaintext) : undefined;
        if (!token?.live || (!upload && !receive) || (receive && token.scope !== "write")) { response.writeHead(401); response.end(); return; }
        if (upload && token.scope === "read" && token.seconds === 3600) readRequests++;
        const result = await new Host(repo, plaintext!).upstream(new Request(`http://127.0.0.1/repo.git${tail}`, { method: request.method ?? "GET", headers, ...(request.method === "POST" ? { body: new Uint8Array(raw) } : {}) }));
        const output = new Uint8Array(await result.arrayBuffer());
        if (output.length > MAX) throw new Error("fixture reply bound");
        response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(output); return;
      }
      if (request.headers["x-clone-fixture"] !== nonce) { response.writeHead(403); response.end(); return; }
      const value = raw.length ? JSON.parse(raw.toString("utf8")) as Record<string, unknown> : {};
      if (path === "/configure" && request.method === "POST" && typeof value["name"] === "string" && /^[A-Za-z0-9_.-]+$/.test(value["name"]) && (name === null || name === value["name"])) {
        if (name === null) {
          repo = bare();
          git(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]);
          directory = join(scratch(), "clone");
        }
        name = value["name"]; remote = `https://service.invalid/git/artroom-demo/${name}.git`; send({ remote, directory });
      } else if (path === "/mint" && request.method === "POST" && name !== null && value["name"] === name && (value["scope"] === "read" || value["scope"] === "write") && typeof value["seconds"] === "number" && Number.isSafeInteger(value["seconds"]) && value["seconds"] > 0) {
        const plaintext = `local-test-${randomBytes(24).toString("hex")}`;
        const token = { id: `local-test-${tokens.size + 1}`, scope: value["scope"] as "read" | "write", seconds: value["seconds"], live: true };
        tokens.set(plaintext, token); send({ id: token.id, scope: token.scope, plaintext });
      } else if (path === "/revoke" && request.method === "POST" && value["name"] === name && typeof value["plaintext"] === "string") {
        const token = tokens.get(value["plaintext"]); if (token) token.live = false; send(!!token);
      } else if (path === "/run" && request.method === "POST" && Array.isArray(value["args"]) && value["env"] && typeof value["env"] === "object") {
        send(await run(value["args"] as string[], value["env"] as Record<string, string>));
      } else if (path === "/status" && request.method === "GET") {
        send({ requests, failure });
      } else if (path === "/inspect" && request.method === "GET" && directory !== null && existsSync(join(directory, ".git"))) {
        const config = readFileSync(join(directory, ".git", "config"), "utf8");
        const readme = readFileSync(join(directory, "README.md"));
        // Independent Node hashes of the literal README bytes and standard
        // one-file 100644 Git tree; no production formatter builds expectation.
        const object = (kind: string, bytes: Buffer) => createHash("sha1").update(Buffer.concat([Buffer.from(`${kind} ${bytes.length}\0`), bytes])).digest();
        const expectedTree = object("tree", Buffer.concat([Buffer.from("100644 README.md\0"), object("blob", readme)])).toString("hex");
        send({ head: git(directory, ["rev-parse", "HEAD"]), tree: git(directory, ["rev-parse", "HEAD^{tree}"]), expectedTree, paths: git(directory, ["ls-tree", "-r", "--name-only", "HEAD"]), readme: readme.toString("utf8"), origin: git(directory, ["config", "--get", "remote.origin.url"]), tokenInConfig: [...tokens.keys()].some((secret) => config.includes(secret)), tokenInOutput, readRequests });
      } else { response.writeHead(400); response.end(); }
    })().catch((error) => { failure = error instanceof TypeError ? "type" : "fixture"; response.writeHead(500); response.end("local fixture failure"); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  project.provide("localClone", { url, nonce } satisfies LocalCloneAddress);
  return async () => { await new Promise<void>((resolve) => server.close(() => resolve())); cleanup(); };
}
