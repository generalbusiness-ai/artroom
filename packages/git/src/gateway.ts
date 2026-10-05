/**
 * The gateway (authority note, sections 5.3, 6.1 and 6.6, step 3): the one
 * place that holds a token's plaintext, and the one thing that sends a
 * request to the Git host for a holder. It is the reviewed successor of the
 * earlier publisher's ref fence (`notes/2026-10-05-i3-git-review.md`,
 * section 5).
 *
 * **One grant for an attempt** (section 6.1): this repository, this ref,
 * from this old value to this new one, with this token. The gateway
 *
 * 1. records the grant, durably, when it is opened;
 * 2. records "forwarding", durably, before it forwards the one update;
 * 3. forwards one update for a grant, and then closes it;
 * 4. forwards nothing for a closed grant, whatever process asks.
 *
 * So a closed grant whose record shows no forward is the evidence "not
 * sent" (section 6.6, step 4), and any other record leaves the send
 * `unknown` unless the host's whole answer refused it.
 *
 * **Custody of the plaintext** (sections 5.3 and 5.7):
 *
 * - it is given to the gateway only for a token that its sealed outcome
 *   entry made `live`. A grant for a token in any other state is refused
 *   and the plaintext is dropped;
 * - it is kept in memory only, in a private field, and in no record;
 * - it leaves the gateway only as the one header of a request that the
 *   gateway forwards to the granted repository. It is never in a URL, an
 *   argument or an environment;
 * - it is in no record, no log line, no thrown error and no response that
 *   the gateway makes. An upstream's error is not passed on: it may repeat
 *   a header;
 * - it is dropped when the grant closes, and when the caller says that the
 *   token's use has ended (`ended`), which the entry that makes the token
 *   `revoking` does.
 *
 * The pack that follows the commands is not read. What a push sends is
 * checked by the sender, before it sends (`gitops.ts`).
 */

import { GitRefusal, ZERO_ID, objectId, refName, remoteUrl, type ObjectId, type Transport } from "./names.ts";

export type GatewayReason =
  | "bad-grant" | "token-not-live" | "grant-open" | "attempt-used" | "record-failed"   // opening
  | "credential-in-url" | "no-grant" | "not-git" | "grant-used" | "reads-only" | "compressed" | "no-body" | "bad-commands" | "not-granted";   // forwarding

/** A refusal by the gateway. It holds a fixed reason and nothing of a request, a token or a host. */
export class GatewayRefusal extends Error {
  readonly reason: GatewayReason;
  constructor(reason: GatewayReason) {
    super(`refused by the gateway: ${reason}`);
    this.name = "GatewayRefusal";
    this.reason = reason;
  }
}

/** The one update that a grant allows. `old` null: the ref must not exist. `new` null: a delete. */
export interface GrantedUpdate { ref: string; old: ObjectId | null; new: ObjectId | null }

export interface GrantRequest {
  /** The attempt, as its ledger names it: the scope, the operation and the attempt number. Letters, digits and `.:#_-`. */
  attempt: string;
  /** The repository at the host, as a remote: a URL with no credential. */
  repository: string;
  /** The one update, or null for a grant that only reads. */
  update: GrantedUpdate | null;
  /** The token as the sealed outcome entry of its mint left it (section 5.7): its ID at the host, its state, and the plaintext from the mint's answer. */
  token: { id: string; state: string; plaintext: string };
}

/** What the gateway records of a grant. It never holds the plaintext. */
export interface GrantRecord {
  attempt: string;
  repository: string;
  update: GrantedUpdate | null;
  /** The token's ID at the host, which the ledger also holds. */
  token: string;
  state: "open" | "forwarding" | "closed";
  /** Updates forwarded: 0 or 1. It is set when "forwarding" is recorded, before the forward. */
  forwarded: 0 | 1;
  /** Requests forwarded that update nothing: discovery, a fetch, and Git's empty probe before a large push. */
  reads: number;
}

/** Where the gateway's record is kept. A write resolves only when the record is durable. */
export interface GrantRecords { write(record: GrantRecord): Promise<void> }

export interface GatewayOptions {
  records: GrantRecords;
  /** The host. The gateway gives it the request with the credential added, and returns its response unread. */
  upstream: (request: Request) => Promise<Response>;
  /** How the host takes a token: the header's name and value. The scheme is the host's, so there is no default (plan question Q6). */
  credential: (plaintext: string) => readonly [name: string, value: string];
  /** Which repositories may be granted: `https` unless the caller says `local` (`remoteUrl`). */
  transport?: Transport;
  /** Told each refusal and each failed forward, by fixed words only. */
  log?: (event: { attempt: string | null; event: string }) => void;
}

/** The most bytes of the commands at the start of a push: the earlier fence's 64 KiB. */
export const MAX_COMMAND_BYTES = 64 * 1024;

interface Command { old: string; new: string; ref: string }

const ascii = (bytes: Uint8Array): string => {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};

/**
 * Read the ref-update commands at the start of a receive-pack request
 * (Git's pack protocol, "Reference Update Request"): pkt-lines, each a
 * length of four lower-case hex digits that counts itself, then data, ended
 * by a flush, `0000`. Returns the commands and a stream that replays the
 * whole body unchanged. Refuses, `bad-commands`: a length that is not four
 * lower-case hex digits; a length of 1 to 4; a body that ends inside the
 * commands; `shallow` and `push-cert` lines; capabilities on any line but
 * the first; a line that is not `<old> <new> <ref>` with two SHA-1 object
 * IDs and a ref name this package would name; more than 64 KiB of commands.
 */
export async function readCommands(body: ReadableStream<Uint8Array>): Promise<{ commands: Command[]; replay: ReadableStream<Uint8Array> }> {
  const bad = () => new GatewayRefusal("bad-commands");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let buf = new Uint8Array(0);
  let pos = 0;
  const need = async (n: number): Promise<void> => {
    while (buf.length - pos < n) {
      const r = await reader.read();
      if (r.done) throw bad();
      chunks.push(r.value);
      const next = new Uint8Array(buf.length + r.value.length);
      next.set(buf);
      next.set(r.value, buf.length);
      buf = next;
    }
  };
  const commands: Command[] = [];
  try {
    for (;;) {
      await need(4);
      const digits = ascii(buf.subarray(pos, pos + 4));
      if (!/^[0-9a-f]{4}$/.test(digits)) throw bad();
      const len = parseInt(digits, 16);
      if (len === 0) break;
      if (len <= 4 || pos + len > MAX_COMMAND_BYTES) throw bad();
      await need(len);
      let line = ascii(buf.subarray(pos + 4, pos + len));
      pos += len;
      const nul = line.indexOf("\0");
      if (nul >= 0 && commands.length > 0) throw bad();
      if (nul >= 0) line = line.slice(0, nul);
      if (line.endsWith("\n")) line = line.slice(0, -1);
      const m = /^([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^ ]+)$/.exec(line);
      if (m === null) throw bad();
      try {
        refName(m[3], "ref");
      } catch {
        throw bad();
      }
      commands.push({ old: m[1]!, new: m[2]!, ref: m[3]! });
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  }
  const replay = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
    },
    async pull(controller) {
      const r = await reader.read();
      if (r.done) controller.close();
      else controller.enqueue(r.value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { commands, replay };
}

/** The headers that the gateway never passes on: a caller's own credential, and what belongs to one connection. */
const DROPPED = ["authorization", "proxy-authorization", "cookie", "host", "connection", "content-length", "transfer-encoding"];

const refusal = (reason: GatewayReason) => new Response(`Refused by the gateway: ${reason}\n`, { status: 403, headers: { "content-type": "text/plain" } });

export class Gateway {
  readonly #options: GatewayOptions;
  /** The open grants, by repository. One grant is open for a repository at a time: a request names a repository and no attempt. */
  readonly #open = new Map<string, GrantRecord>();
  /** The plaintext of each open grant's token, by attempt. In memory only. */
  readonly #plaintext = new Map<string, string>();
  /** The last record of every attempt this gateway was given, so that an attempt has one grant in the gateway's life. */
  readonly #records = new Map<string, GrantRecord>();

  constructor(options: GatewayOptions) {
    this.#options = options;
  }

  #log(attempt: string | null, event: string): void {
    this.#options.log?.({ attempt, event });
  }

  /**
   * Open the one grant of an attempt. Refused, with nothing kept: a grant
   * that is not well formed; a token that is not `live`; a repository that
   * already has an open grant; an attempt that had a grant before; a record
   * that could not be written.
   */
  async open(request: GrantRequest): Promise<GrantRecord> {
    const refuse = (reason: GatewayReason) => {
      this.#log(typeof request.attempt === "string" && /^[A-Za-z0-9.:#_-]{1,200}$/.test(request.attempt) ? request.attempt : null, reason);
      return new GatewayRefusal(reason);
    };
    let record: GrantRecord;
    try {
      if (typeof request.attempt !== "string" || !/^[A-Za-z0-9.:#_-]{1,200}$/.test(request.attempt)) throw new GitRefusal("bad-remote", "attempt");
      const repository = remoteUrl(request.repository, this.#options.transport ?? "https", "repository").replace(/\/$/, "");
      const u = request.update;
      const update = u === null ? null : { ref: refName(u.ref, "ref"), old: u.old === null ? null : objectId(u.old, "old"), new: u.new === null ? null : objectId(u.new, "new") };
      if (update !== null && update.old === update.new) throw new GitRefusal("same-commit", "new");
      if (typeof request.token.id !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(request.token.id) || typeof request.token.plaintext !== "string" || request.token.plaintext === "") throw new GitRefusal("bad-remote", "token");
      record = { attempt: request.attempt, repository, update, token: request.token.id, state: "open", forwarded: 0, reads: 0 };
    } catch (e) {
      if (e instanceof GitRefusal) throw refuse(e.reason === "credential-in-url" ? "credential-in-url" : "bad-grant");
      throw refuse("bad-grant");
    }
    // Section 5.7: the plaintext goes to a gateway only when the sealed outcome entry made the token `live`.
    if (request.token.state !== "live") throw refuse("token-not-live");
    if (this.#records.has(record.attempt)) throw refuse("attempt-used");
    if (this.#open.has(record.repository)) throw refuse("grant-open");
    this.#open.set(record.repository, record);
    this.#records.set(record.attempt, record);
    try {
      await this.#options.records.write({ ...record });
    } catch {
      this.#open.delete(record.repository);
      this.#records.set(record.attempt, { ...record, state: "closed" });
      throw refuse("record-failed");
    }
    this.#plaintext.set(record.attempt, request.token.plaintext);
    return { ...record };
  }

  /** Close a grant: drop the plaintext first, then record. A failed write of the closing record leaves the durable record at its last state, which never says less was forwarded than was. */
  async #close(record: GrantRecord): Promise<GrantRecord> {
    this.#plaintext.delete(record.attempt);
    if (this.#open.get(record.repository) === record) this.#open.delete(record.repository);
    if (record.state !== "closed") {
      record.state = "closed";
      await this.#options.records.write({ ...record }).catch(() => this.#log(record.attempt, "record-failed"));
    }
    return { ...record };
  }

  /**
   * Close an attempt's grant and return its record: the evidence of what
   * was forwarded (section 6.6, step 4). Closing a closed grant returns the
   * same record. An attempt that never had a grant has no record: null.
   */
  async close(attempt: string): Promise<GrantRecord | null> {
    const record = this.#records.get(attempt);
    return record === undefined ? null : this.#close(record);
  }

  /**
   * The token's use has ended: the entry that makes it `revoking` is sealed,
   * or the hold ended (sections 5.3 and 5.7). Every grant with that token is
   * closed and its plaintext dropped. The revocation at the host is the
   * ledger's operation, by the token's ID, and is not sent from here.
   */
  async ended(token: string): Promise<GrantRecord[]> {
    const out: GrantRecord[] = [];
    for (const record of [...this.#open.values()]) if (record.token === token) out.push(await this.#close(record));
    return out;
  }

  /**
   * One request of the Git client behind the gateway. Only the three paths
   * of Git's smart HTTP protocol pass, for a repository with an open grant:
   * `GET <repository>/info/refs?service=...`, `POST
   * <repository>/git-upload-pack` and `POST <repository>/git-receive-pack`.
   * The credential is added here. A refusal is answered here, with 403, and
   * nothing reaches the host.
   */
  async forward(request: Request): Promise<Response> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return refusal("not-git");
    }
    if (url.username !== "" || url.password !== "") return refusal("credential-in-url");
    const at = `${url.origin}${url.pathname}`;
    const record = [...this.#open.values()].find((r) => at.startsWith(`${r.repository}/`));
    if (record === undefined) {
      this.#log(null, "no-grant");
      return refusal("no-grant");
    }
    const refuse = (reason: GatewayReason) => {
      this.#log(record.attempt, reason);
      return refusal(reason);
    };
    const path = at.slice(record.repository.length);
    const service = url.searchParams.get("service");
    const discovery = path === "/info/refs" && request.method === "GET" && (url.search === "?service=git-upload-pack" || url.search === "?service=git-receive-pack");
    const fetching = path === "/git-upload-pack" && request.method === "POST" && url.search === "";
    const pushing = path === "/git-receive-pack" && request.method === "POST" && url.search === "";
    if (!discovery && !fetching && !pushing) return refuse("not-git");
    if (record.state !== "open") return refuse("grant-used");
    if (record.update === null && (pushing || service === "git-receive-pack")) return refuse("reads-only");

    let body: ReadableStream<Uint8Array> | null = request.body;
    let update = false;
    if (pushing) {
      if (request.headers.has("content-encoding")) return refuse("compressed");
      if (body === null) return refuse("no-body");
      let read: Awaited<ReturnType<typeof readCommands>>;
      try {
        read = await readCommands(body);
      } catch (e) {
        if (e instanceof GatewayRefusal) return refuse(e.reason);
        return refuse("bad-commands");
      }
      body = read.replay;
      // No command: Git's probe before a large push. It updates nothing, and is forwarded as a read.
      if (read.commands.length > 0) {
        const granted = record.update!;
        const [c] = read.commands;
        if (read.commands.length !== 1 || c!.ref !== granted.ref || c!.old !== (granted.old ?? ZERO_ID) || c!.new !== (granted.new ?? ZERO_ID)) return refuse("not-granted");
        update = true;
      }
    }

    const plaintext = this.#plaintext.get(record.attempt);
    if (plaintext === undefined) return refuse("grant-used");
    const headers = new Headers(request.headers);
    for (const name of DROPPED) headers.delete(name);
    const [name, value] = this.#options.credential(plaintext);
    headers.set(name, value);

    if (update) {
      // "Forwarding" is recorded, durably, before the one update is forwarded. From here the grant forwards nothing more.
      record.state = "forwarding";
      record.forwarded = 1;
      try {
        await this.#options.records.write({ ...record });
      } catch {
        record.forwarded = 0;   // nothing was forwarded, and nothing will be
        await this.#close(record);
        return refuse("record-failed");
      }
    } else record.reads += 1;

    try {
      return await this.#options.upstream(new Request(url, { method: request.method, headers, ...(body === null ? {} : { body, duplex: "half" as const }) }));
    } catch {
      // Not the error's text: it may repeat the request, with its header.
      this.#log(record.attempt, "upstream-failed");
      return new Response("The gateway had no answer from the host\n", { status: 502, headers: { "content-type": "text/plain" } });
    } finally {
      if (update) await this.#close(record);
    }
  }
}
