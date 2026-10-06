/**
 * Test support: a local HTTP endpoint that stands for a Git host. It is a
 * stand-in, and every test that uses it says so. Behind it is the real
 * `git http-backend` program over a real bare repository, so what it shows
 * of a compare-and-set is Git's own server code. It shows nothing about a
 * host's service: its reads after a write, how late a sent update can
 * apply, or its tokens.
 *
 * Git's client talks to `Bridge`, a local listener that hands each request
 * to the package's real `Gateway`. The gateway's `upstream` is `Host`. So
 * the client holds no token, as in the publisher's container.
 *
 * A fault is set for the next push that reaches the host:
 * - `moved`: another writer moves the ref after the client read it and
 *   before the update arrives, so the host's own compare-and-set decides.
 *
 * A lost request or a lost reply is not made here: what a send is judged
 * to be when its reply is lost needs no server, and `push.test.ts` shows it
 * from Git's recorded report.
 */

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";
import type { Gateway } from "../../src/gateway.ts";
import { setRef } from "./repo.ts";

export type Fault = { kind: "moved"; ref: string; to: string };

export class Host {
  /** The pushes that reached the host: receive-pack requests that carry an update. */
  updates = 0;
  /** The value of the credential header of every request that reached the host. */
  readonly credentials: (string | null)[] = [];
  fault: Fault | null = null;
  readonly #repo: string;
  readonly #token: string;

  /** `repo`: a bare repository. `token`: the one credential the host accepts, as a `Bearer` value. */
  constructor(repo: string, token: string) {
    this.#repo = repo;
    this.#token = token;
  }

  readonly upstream = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const body = new Uint8Array(await request.arrayBuffer());
    this.credentials.push(request.headers.get("authorization"));
    if (request.headers.get("authorization") !== `Bearer ${this.#token}`) return new Response("no\n", { status: 401 });
    // A push with an update: after the flush-only probe, the body begins with a command line.
    const update = url.pathname.endsWith("/git-receive-pack") && body.length > 4 && new TextDecoder().decode(body.subarray(0, 4)) !== "0000";
    const fault = update ? this.fault : null;
    if (update) {
      this.updates += 1;
      this.fault = null;
    }
    if (fault !== null) setRef(this.#repo, fault.ref, fault.to);
    const out = await new Promise<Buffer>((resolve, reject) => {
      const child = execFile("git", ["http-backend"], {
        encoding: "buffer",
        maxBuffer: 1 << 28,
        env: {
          PATH: process.env["PATH"] ?? "/usr/bin:/bin",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_PROJECT_ROOT: dirname(this.#repo),
          GIT_HTTP_EXPORT_ALL: "1",
          REMOTE_USER: "gateway",
          REMOTE_ADDR: "127.0.0.1",
          REQUEST_METHOD: request.method,
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          CONTENT_TYPE: request.headers.get("content-type") ?? "",
          CONTENT_LENGTH: String(body.length),
          ...(request.headers.has("git-protocol") ? { GIT_PROTOCOL: request.headers.get("git-protocol")! } : {}),
          ...(request.headers.has("content-encoding") ? { HTTP_CONTENT_ENCODING: request.headers.get("content-encoding")! } : {}),
        },
      }, (error, stdout) => (error === null ? resolve(stdout) : reject(error)));
      child.stdin?.end(Buffer.from(body));
    });
    const split = out.indexOf("\r\n\r\n");
    const headers = new Headers();
    let status = 200;
    for (const line of out.subarray(0, split).toString("latin1").split("\r\n")) {
      const [name, value] = [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()];
      if (name.toLowerCase() === "status") status = Number(value.slice(0, 3));
      else headers.set(name, value);
    }
    return new Response(new Uint8Array(out.subarray(split + 4)), { status, headers });
  };
}

/** A listener on the loopback address that gives every request to the gateway, as the container's route does. */
export class Bridge {
  readonly #server: Server;
  private constructor(server: Server) {
    this.#server = server;
  }

  static async open(gateway: () => Gateway): Promise<Bridge> {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        void (async () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
          const body = Buffer.concat(chunks);
          const request = new Request(`http://127.0.0.1:${(server.address() as AddressInfo).port}${req.url ?? "/"}`, { method: req.method ?? "GET", headers, ...(req.method === "POST" ? { body: new Uint8Array(body) } : {}) });
          const response = await gateway().forward(request);
          const out = Buffer.from(await response.arrayBuffer());
          res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "text/plain", "content-length": String(out.length) });
          res.end(out);
        })();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return new Bridge(server);
  }

  /** The address that the Git client uses for a repository directory name, such as `repo.git`. */
  url(name: string): string {
    return `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}/${name}`;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.#server.close(() => resolve()));
  }
}

/** The gateway's records, kept in memory: a stand-in for a durable store. It keeps every write, in order, as JSON text. */
export class MemoryRecords {
  readonly written: string[] = [];
  write(record: unknown): Promise<void> {
    this.written.push(JSON.stringify(record));
    return Promise.resolve();
  }
}
