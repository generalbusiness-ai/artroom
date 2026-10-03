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
describe("planner CLI historical presentation of a journaled receipt", () => {
  for (const retry of [false, true]) for (const activateAfterRecord of [false, true]) {
    test(`a known original receipt keeps its label and thread name, retry=${retry}, activateAfterRecord=${activateAfterRecord}`, async () => {
      const home = join(h.tmp, "alice"); await login(home, "@alice");
      await h.room.activate({ ...CODE_REVIEW_ACTS, "start-song": SONG });
      const binding = (await h.room.bindingOf("start-song"))!;
      const before = h.room.policies.at(-1)!;
      const argv = ["act", "start-song", "--binding", binding, "--set", "key=c", "--set", "title=Footprints", "--set", "scope=songs/footprints/**", "--idempotency-key", "song-once"];
      const sent: string[] = [];
      const extra = { fetch: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (init?.method === "POST" && String(input).endsWith("/acts")) {
          expect(typeof init.body).toBe("string"); sent.push(init.body as string);
        }
        return fetch(input, init);
      } };
      if (retry) h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
      const first = await cli(home, argv, h.tmp, extra);
      expect(first.code).toBe(retry ? 1 : 0);
      if (retry) expect(first.err).toContain("--idempotency-key song-once");
      const recorded = h.room.entries.filter(e => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "start-song");
      expect(recorded).toHaveLength(1); expect(h.room.lanes.size).toBe(1);
      const entry = recorded[0]!;
      const governing = h.room.policies.filter(p => p.since <= entry.seq).at(-1)!;
      expect(governing.policy).toBe(before.policy);
      if (activateAfterRecord) await h.room.activate({ ...CODE_REVIEW_ACTS, "start-song": { ...SONG, label: "Begin a tune" } });
      expect(await h.room.bindingOf("start-song")).toBe(binding);
      const out = retry ? await cli(home, argv, h.tmp, extra) : first;
      expect(out.code).toBe(0);
      expect(h.room.entries.filter(e => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "start-song")).toHaveLength(1);
      expect(h.room.lanes.size).toBe(1);
      expect(new Set(sent).size).toBe(1); expect(sent.length).toBe(retry ? 5 : 1);
      const signed = JSON.parse(sent[0]!);
      expect(signed.envelope).toMatchObject({ kind: "start-song", binding, body: { key: "c", title: "Footprints" }, idempotencyKey: "song-once" });
      console.info(JSON.stringify({ retry, activateAfterRecord, governing: governing.policy, current: h.room.policies.at(-1)!.policy, seq: entry.seq, posts: sent.length, uniqueSignedBodies: new Set(sent).size, signedBodySHA256: createHash("sha256").update(sent[0]!).digest("hex"), actualOutput: out.out }));
      expect.soft(out.out.split("\n")[0]).toContain("Done: Start a song (start-song), recorded as ");
      expect.soft(out.out.split("\n")[1] ?? "", "the original opening record keeps its thread title when a saved receipt is finished").toMatch(/^Thread: Start a song: Footprints \(lane act_\d+_[0-9a-f]{8}\)\.$/);
    });
  }
});
