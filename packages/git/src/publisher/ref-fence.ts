/**
 * The ref fence: the gateway reads the ref-update commands at the start of a
 * `git-receive-pack` request and lets the push through only if every command
 * is one this operation allows, with the exact old and new values.
 *
 * Artifacts lets any write token update any ref, and force-push (plan
 * section 2). The fence narrows each token to its purpose:
 * - a publication token may move `refs/heads/main` from `expectedMain` to
 *   `integration`, and nothing else;
 * - a pinning or staging token may create its named refs, and nothing else.
 *
 * The token itself stays in the gateway; the container never sees it. A
 * request the fence cannot read (compressed, malformed, or with commands
 * longer than 64 KiB) is refused before anything reaches Artifacts.
 *
 * Wire format (git's pack protocol, "Reference Update Request"): pkt-lines,
 * each a 4-digit hex length (including the 4 digits) then data, ending with
 * a flush `0000`. Each command is `<old-sha> <new-sha> <refname>`; the first
 * carries capabilities after a NUL. The packfile follows the flush.
 */

export const ZERO = "0000000000000000000000000000000000000000";
const MAX_HEADER = 64 * 1024;

export interface RefUpdate {
  readonly old: string;
  readonly new: string;
  readonly ref: string;
}

/** Allowed updates by ref. `new: null` allows only a deletion, which we never grant. */
export type AllowedUpdates = Readonly<Record<string, { readonly old: string; readonly new: string }>>;

export class FenceError extends Error {}

/**
 * Read the commands from the start of a receive-pack body. Returns them with
 * a stream that replays the whole body unchanged.
 */
export async function readCommands(
  body: ReadableStream<Uint8Array>,
): Promise<{ readonly commands: readonly RefUpdate[]; readonly replay: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let buf = new Uint8Array(0);
  let pos = 0;
  const commands: RefUpdate[] = [];
  const dec = new TextDecoder();
  const need = async (n: number): Promise<void> => {
    while (buf.length - pos < n) {
      const r = await reader.read();
      if (r.done) throw new FenceError("the request ended inside the commands");
      chunks.push(r.value);
      const next = new Uint8Array(buf.length + r.value.length);
      next.set(buf);
      next.set(r.value, buf.length);
      buf = next;
      if (buf.length > MAX_HEADER + 65536) throw new FenceError("the commands are too long");
    }
  };
  for (;;) {
    await need(4);
    const len = parseInt(dec.decode(buf.subarray(pos, pos + 4)), 16);
    if (!Number.isInteger(len) || (len !== 0 && len < 4)) throw new FenceError("not a pkt-line");
    if (len === 0) {
      pos += 4;
      break;
    }
    await need(len);
    let line = dec.decode(buf.subarray(pos + 4, pos + len));
    pos += len;
    if (pos > MAX_HEADER) throw new FenceError("the commands are too long");
    const nul = line.indexOf("\0");
    if (nul >= 0) line = line.slice(0, nul);
    line = line.replace(/\n$/, "");
    if (line.startsWith("shallow ") || line.startsWith("push-cert")) throw new FenceError(`unsupported: ${line.split(" ")[0]}`);
    const m = /^([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\s]+)$/.exec(line);
    if (!m) throw new FenceError("not a ref-update command");
    commands.push({ old: m[1]!, new: m[2]!, ref: m[3]! });
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
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { commands, replay };
}

/**
 * Throws unless every command is allowed exactly. No commands is allowed: git
 * sends a body of just a flush to probe authentication before a large push,
 * and a request without commands updates nothing.
 */
export function checkUpdates(commands: readonly RefUpdate[], allowed: AllowedUpdates): void {
  for (const c of commands) {
    const a = Object.hasOwn(allowed, c.ref) ? allowed[c.ref] : undefined;
    if (!a) throw new FenceError(`update of ${c.ref} is not allowed`);
    if (c.new === ZERO) throw new FenceError(`deleting ${c.ref} is not allowed`);
    if (c.old !== a.old || c.new !== a.new) throw new FenceError(`update of ${c.ref} does not match the operation`);
  }
}

/** Is this request a push (receive-pack), as opposed to a fetch? */
export function isReceivePack(url: URL): boolean {
  return url.pathname.endsWith("/git-receive-pack") || url.searchParams.get("service") === "git-receive-pack";
}
