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

describe("planner CLI thread title under the policy of its actual admission", () => {
  for (const activateDuringSend of [false, true]) {
    test(`a label-only activation after preparation uses the admitted record's words, activateDuringSend=${activateDuringSend}`, async () => {
      const home = join(h.tmp, "alice");
      await login(home, "@alice");
      await h.room.activate({ ...CODE_REVIEW_ACTS, "start-song": SONG });
      const binding = (await h.room.bindingOf("start-song"))!;
      const before = h.room.policies.at(-1)!;
      let changed = false;
      const out = await cli(home, ["act", "start-song", "--binding", binding, "--set", "key=c", "--set", "title=Footprints", "--set", "scope=songs/footprints/**"], h.tmp, {
        fetch: async (input, init) => {
          if (activateDuringSend && !changed && init?.method === "POST" && String(input).endsWith("/acts")) {
            changed = true;
            await h.room.activate({ ...CODE_REVIEW_ACTS, "start-song": { ...SONG, label: "Begin a tune" } });
          }
          return fetch(input, init);
        },
      });
      expect(out.code).toBe(0);
      expect(changed).toBe(activateDuringSend);
      expect(await h.room.bindingOf("start-song")).toBe(binding);
      const recorded = h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "start-song");
      expect(recorded).toHaveLength(1);
      const entry = recorded[0]!;
      const governing = h.room.policies.filter((p) => p.since <= entry.seq).at(-1)!;
      expect(governing.policy === before.policy).toBe(!activateDuringSend);
      const label = governing.acts!["start-song"]!.label;
      console.log(JSON.stringify({ activateDuringSend, prepared: before.policy, governing: governing.policy, seq: entry.seq, expectedLabel: label, actualOutput: out.out }));
      expect.soft(out.out.split("\n")[0]).toContain(`Done: ${label} (start-song), recorded as `);
      expect.soft(out.out.split("\n")[1]).toMatch(new RegExp(`^Thread: ${label}: Footprints \\(lane act_\\d+_[0-9a-f]{8}\\)\\.$`));
    });
  }
});
