// The gateway's ref fence: it reads receive-pack commands and refuses any
// update the operation did not allow, replaying allowed bodies unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUpdates, readCommands, FenceError, ZERO } from "../src/publisher/ref-fence.ts";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
const enc = new TextEncoder();
const pkt = (s: string) => (s.length + 4).toString(16).padStart(4, "0") + s;

function body(lines: string[], pack = "PACK\0\0\0\x02rest-of-pack"): Uint8Array {
  const text = lines.map(pkt).join("") + "0000";
  return new Uint8Array([...enc.encode(text), ...enc.encode(pack)]);
}

/** A stream that delivers `bytes` in chunks of `size`. */
function stream(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + size));
      i += size;
    },
  });
}

async function all(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const p of s as unknown as AsyncIterable<Uint8Array>) parts.push(p);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
}

const mainUpdate = `${A} ${B} refs/heads/main\0 report-status side-band-64k quiet object-format=sha1 agent=git/2.54.0`;

test("reads the commands at any chunking and replays the body byte for byte", async () => {
  const b = body([mainUpdate]);
  for (const size of [1, 2, 3, 7, 64, 100000]) {
    const { commands, replay } = await readCommands(stream(b, size));
    assert.deepEqual(commands, [{ old: A, new: B, ref: "refs/heads/main" }]);
    assert.deepEqual(await all(replay), b);
  }
});

test("a publication token may move main from expectedMain to the integration, and nothing else", () => {
  const allowed = { "refs/heads/main": { old: A, new: B } };
  checkUpdates([{ old: A, new: B, ref: "refs/heads/main" }], allowed);
  const refuse = (c: { old: string; new: string; ref: string }[]) => assert.throws(() => checkUpdates(c, allowed), FenceError);
  refuse([{ old: C, new: B, ref: "refs/heads/main" }]); //            another expected main (a force push)
  refuse([{ old: A, new: C, ref: "refs/heads/main" }]); //            another commit
  refuse([{ old: A, new: ZERO, ref: "refs/heads/main" }]); //         deleting main
  refuse([{ old: ZERO, new: B, ref: "refs/heads/other" }]); //        another ref
  refuse([{ old: A, new: B, ref: "refs/heads/main" }, { old: ZERO, new: B, ref: "refs/tags/x" }]);
});

test("a pinning token may only create its refs; the auth probe (no commands) passes", async () => {
  const pin = `refs/artroom/heads/act_1_abcdef01/1`;
  checkUpdates([{ old: ZERO, new: B, ref: pin }], { [pin]: { old: ZERO, new: B } });
  assert.throws(() => checkUpdates([{ old: A, new: B, ref: pin }], { [pin]: { old: ZERO, new: B } }), FenceError);
  const probe = await readCommands(stream(enc.encode("0000"), 4));
  assert.deepEqual(probe.commands, []);
  checkUpdates(probe.commands, {});
});

test("anything the fence cannot read is refused", async () => {
  const bad = [
    enc.encode("zzzz"),
    enc.encode(pkt(`${A} ${B} refs/heads/main`)), // no flush: ends inside the commands
    body([`shallow ${A}`]),
    body([`${A} ${B} main`]), //                  not a full ref name
    enc.encode("0003"),
  ];
  for (const b of bad) await assert.rejects(readCommands(stream(b, 5)), FenceError);
  const huge = body(Array.from({ length: 1000 }, (_, i) => `${A} ${B} refs/heads/${"x".repeat(60)}${i}`));
  await assert.rejects(readCommands(stream(huge, 4096)), FenceError);
});
