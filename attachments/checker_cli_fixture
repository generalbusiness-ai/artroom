/** Actual CLI + local FakeRoom transport; does not prove production Room authority. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ActDeclaration } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { useHarness } from "./harness.ts";

const { h, cli, login } = useHarness();
const original: ActDeclaration = { label: "Open a score", targets: { none: ["open"] }, body: { key: { type: "enum", values: ["minor"] }, title: { type: "text", max: 80 } }, who: { roles: ["member"] }, hold: { scope: "body.scope" } };
const later: ActDeclaration = { ...original, label: "Begin a tune", help: "Updated words only." };
const acts = (d: ActDeclaration) => ({ ...CODE_REVIEW_ACTS, score: d });
function observation(name: string, value: unknown) {
  console.log("CHECKER_TITLE_OBSERVATION", JSON.stringify({ name, value }));
  const dir = process.env["ARTROOM_CHECKER_TITLE_EVIDENCE"];
  if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${name}.json`), JSON.stringify(value, null, 2) + "\n"); }
}
async function ready() {
  const alice = join(h.tmp, "alice");
  expect((await login(alice, "@alice")).code).toBe(0);
  await h.room.activate(acts(original));
  const binding = (await h.room.bindingOf("score"))!;
  return { alice, binding, argv: ["act", "score", "--binding", binding, "--set", "key=minor", "--set", "title=Nardis", "--set", "scope=scores/**"] };
}
async function recordMeaning() {
  const e = h.room.entries.findLast((x) => x.entry.type === "act" && (x.entry.act.envelope.kind as string) === "score")!;
  const c = await h.room.catalogue({ at: e.seq });
  expect(c?.vocabulary).toBe("declared");
  if (!c || c.vocabulary !== "declared") throw new Error("no historical declared catalogue");
  const id = `act_${e.seq}_${e.hash.slice(7, 15)}`;
  return { id, seq: e.seq, policy: c.policy, label: c.acts["score"]!.declaration.label, binding: c.acts["score"]!.binding };
}

describe("CLI title comes from the accepted opening record's D(s)", () => {
  test("control: label-only activation before the CLI read prints the new historical title", async () => {
    const { alice, binding, argv } = await ready();
    await h.room.activate(acts(later));
    expect(await h.room.bindingOf("score")).toBe(binding);
    const out = await cli(alice, argv);
    const m = await recordMeaning();
    observation("before-read-control", { out, historical: m, bindingUnchanged: m.binding === binding });
    expect(out.code).toBe(0);
    expect(m.label).toBe("Begin a tune");
    expect(out.out.split("\n")[1]).toBe(`Thread: Begin a tune: Nardis (lane ${m.id}).`);
  });

  test("label-only activation between preparation and admission must print the accepted record's new historical title", async () => {
    const { alice, binding, argv } = await ready();
    let changed = false;
    const out = await cli(alice, argv, h.tmp, {
      fetch: async (input, init) => {
        if (!changed && init?.method === "POST" && String(input).endsWith("/acts")) {
          changed = true;
          await h.room.activate(acts(later));
          expect(await h.room.bindingOf("score")).toBe(binding);
        }
        return fetch(input, init);
      },
    });
    const m = await recordMeaning();
    observation("before-admission-era", { out, changed, historical: m, bindingUnchanged: m.binding === binding });
    expect(changed).toBe(true);
    expect(out.code).toBe(0);
    expect(m.label).toBe("Begin a tune");
    expect(out.out.split("\n")[1]).toBe(`Thread: Begin a tune: Nardis (lane ${m.id}).`);
  });

  test("paired timing control: a label-only activation after admission must keep the record's old historical title", async () => {
    const { alice, binding, argv } = await ready();
    let changed = false;
    const out = await cli(alice, argv, h.tmp, {
      fetch: async (input, init) => {
        const answer = await fetch(input, init);
        if (!changed && init?.method === "POST" && String(input).endsWith("/acts")) {
          changed = true;
          await h.room.activate(acts(later));
          expect(await h.room.bindingOf("score")).toBe(binding);
        }
        return answer;
      },
    });
    const m = await recordMeaning();
    observation("after-admission-control", { out, changed, historical: m, bindingUnchanged: m.binding === binding });
    expect(changed).toBe(true);
    expect(out.code).toBe(0);
    expect(m.label).toBe("Open a score");
    expect(out.out.split("\n")[1]).toBe(`Thread: Open a score: Nardis (lane ${m.id}).`);
  });
});
