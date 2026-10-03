/** Independent saved-intent presentation probe; actual CLI over local FakeRoom routes. */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ActDeclaration } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { useHarness } from "./harness.ts";

const { h, cli, login } = useHarness();
const SONG: ActDeclaration = {
  label: "Start a song", targets: { none: ["open"] },
  body: { key: { type: "enum", values: ["c", "d"] }, title: { type: "text", max: 80 } },
  who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true },
};
const POSTER: ActDeclaration = { ...SONG, label: "Draft a poster" };

describe("a saved receipt is shown as its saved kind, regardless of newer command arguments", () => {
  for (const changedKind of [false, true]) for (const metadataUnavailable of [false, true]) {
    test(`original receipt identity, changedKind=${changedKind}, metadataUnavailable=${metadataUnavailable}`, async () => {
      const home = join(h.tmp, "alice"); await login(home, "@alice");
      await h.room.activate({ ...CODE_REVIEW_ACTS, "start-song": SONG, "draft-poster": POSTER });
      const songBinding = (await h.room.bindingOf("start-song"))!;
      const posterBinding = (await h.room.bindingOf("draft-poster"))!;
      expect(posterBinding).not.toBe(songBinding);
      const args = (kind: string, binding: string, title: string) => ["act", kind, "--binding", binding, "--set", "key=c", "--set", `title=${title}`, "--set", "scope=songs/footprints/**", "--idempotency-key", "saved-song"];
      const sent: string[] = [];
      const send = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (init?.method === "POST" && new URL(String(input)).pathname.endsWith("/acts")) sent.push(String(init.body));
      };
      h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
      const first = await cli(home, args("start-song", songBinding, "Footprints"), h.tmp, {
        fetch: (input, init) => { send(input, init); return fetch(input, init); },
      });
      expect(first.code).toBe(1);
      expect(first.err).toContain("--idempotency-key saved-song");
      const reads: string[] = [];
      const again = await cli(home, args(changedKind ? "draft-poster" : "start-song", changedKind ? posterBinding : songBinding, "Changed argument"), h.tmp, {
        fetch: (input, init) => {
          send(input, init); const url = new URL(String(input));
          if (url.pathname.endsWith("/declarations")) {
            reads.push(url.search);
            if (metadataUnavailable && url.search.startsWith("?at=")) return Promise.resolve(new Response(JSON.stringify({ name: "ArtroomError", code: "unauthenticated", message: "The display read is unavailable.", retryable: false }), { status: 401, headers: { "content-type": "application/json" } }));
          }
          return fetch(input, init);
        },
      });
      expect(again.code).toBe(0); expect(again.err).toBe("");
      expect(sent).toHaveLength(5); expect(new Set(sent).size).toBe(1);
      const signed = JSON.parse(sent[0]!);
      expect(signed.envelope).toMatchObject({ kind: "start-song", binding: songBinding, body: { key: "c", title: "Footprints" }, idempotencyKey: "saved-song" });
      const recorded = h.room.entries.filter(e => e.entry.type === "act" && ["start-song", "draft-poster"].includes(e.entry.act.envelope.kind as string));
      expect(recorded).toHaveLength(1); expect(h.room.lanes.size).toBe(1);
      const entry = recorded[0]!; const id = `act_${entry.seq}_${entry.hash.slice(7, 15)}`;
      expect(reads).toEqual([`?at=${entry.seq}`]);
      const expectedDone = metadataUnavailable ? `Done: start-song, recorded as ${id}.` : `Done: Start a song (start-song), recorded as ${id}.`;
      const expectedThread = metadataUnavailable ? `Thread: ${id} (lane ${id}).` : `Thread: Start a song: Footprints (lane ${id}).`;
      console.info(JSON.stringify({ changedKind, metadataUnavailable, acceptedKind: signed.envelope.kind, binding: signed.envelope.binding, seq: entry.seq, posts: sent.length, uniqueSignedBodies: new Set(sent).size, signedBodySHA256: createHash("sha256").update(sent[0]!).digest("hex"), actual: again.out, expectedDone, expectedThread }));
      expect.soft(again.out.split("\n")[0], "receipt must identify the kind actually accepted, rather than a newer argument").toBe(expectedDone);
      expect.soft(again.out.split("\n")[1], "thread title must use the saved kind's historical meaning and saved body").toBe(expectedThread);
    });
  }
});
