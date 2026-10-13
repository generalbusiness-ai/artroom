import { expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { pantry } from "./support/pantry.ts";
import { mcpRoom, type Agent, type Room } from "./support/room.ts";
import { founded } from "./support/story.ts";

/** Whether `name` is an own property of `v`, with that value: not lost to the prototype setter, and not the prototype. */
const own = (v: unknown, name: string): unknown => (v !== null && typeof v === "object" && Object.hasOwn(v, name) ? Object.getOwnPropertyDescriptor(v, name)!.value : "(not own)");

/** One act, accepted: called again with the same key while the scope has not yet observed the caller's authority. */
async function accepted(room: Room, agent: Agent, tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  for (let i = 0; ; i++) {
    const done = await agent.ok(tool, args);
    if (done["answer"] !== "unavailable" || i === 5) { expect(done["answer"], `${tool}: ${JSON.stringify(done)}`).toBe("accepted"); return done; }
    await room.pause();
  }
}

// Invariant: a name a definition lawfully chose is kept as an own property wherever the server holds it, even `__proto__`: a
// required text field, a member of a record field, a presented fact and a bound `also` alias each reach the scope's entry, and
// the native runtime accepts the act. A plain assignment would have dropped each one, and the scope would have refused.
test("__proto__ as a field, a record member, a presented fact and an also alias, accepted natively", async () => {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita");
    await founded(room, rita);
    await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" });
    expect((await rita.ok("rules.activate", { fields: { digest: definitionDigest(pantry), name: "pantry" }, values: [canonicalize(pantry)], idempotencyKey: "activate" }))["answer"]).toBe("accepted");
    // The room's directory creates the pantry as lane 1, under the room's membership.
    const opened = await rita.ok("issue.create", { fields: { definition: definitionDigest(pantry), title: "The pantry", conditions: ["it keeps"] }, idempotencyKey: "pantry" });
    expect((await rita.ok("wait", { scope: "directory", entry: (opened["fact"] as FactRef).seq }))["timedOut"]).toBe(false);
    const root = 1;

    // A required text field and a record member, both named __proto__, as JSON brings them.
    const filled = await accepted(room, rita, "pantry.fill", { target: root, fields: JSON.parse('{ "__proto__": "jam", "label": { "__proto__": "red" } }'), idempotencyKey: "fill" });
    const fill = filled["fact"] as FactRef;
    const fillEntry = (await rita.ok("step", { scope: root, seq: fill.seq }))["entry"] as { input: { signed: { intent: { fields: Record<string, unknown> } } } };
    const fields = fillEntry.input.signed.intent.fields;
    expect([own(fields, "__proto__"), own(own(fields, "label"), "__proto__")]).toEqual(["jam", "red"]);
    const jar = (await rita.ok("inspect", { scope: root }))["items"] as { id: number; type: string; values: Record<string, unknown> }[];
    const filledJar = jar.find((i) => i.type === "jar")!;
    expect([own(filledJar.values, "__proto__"), own(own(filledJar.values, "label"), "__proto__")]).toEqual(["jam", "red"]);
    const shelf = jar.find((i) => i.type === "shelf")!;

    // An also alias named __proto__, bound by the jar field: its expected revision travels under that name.
    const checked = await accepted(room, rita, "pantry.check", { target: root, on: shelf.id, fields: { jar: filledJar.id, title: "Checked" }, idempotencyKey: "check" });
    const checkEntry = (await rita.ok("step", { scope: root, seq: (checked["fact"] as FactRef).seq }))["entry"] as { input: { signed: { intent: { expected: Record<string, unknown> } } } };
    expect(own(checkEntry.input.signed.intent.expected, "__proto__")).toEqual(expect.any(Number));

    // A presented fact named __proto__.
    const sealed = await accepted(room, rita, "pantry.seal", { target: root, on: filledJar.id, presented: JSON.parse(`{ "__proto__": ${JSON.stringify(fill)} }`), idempotencyKey: "seal" });
    const sealEntry = (await rita.ok("step", { scope: root, seq: (sealed["fact"] as FactRef).seq }))["entry"] as { input: Record<string, unknown> };
    expect(own(sealEntry.input["presented"], "__proto__")).toEqual(fill);
  } finally { room.done(); }
}, 120_000);
