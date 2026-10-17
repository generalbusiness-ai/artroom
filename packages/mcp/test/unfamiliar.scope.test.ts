import { expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, textDigest } from "@generalbusiness/artroom-bytes";
import { firstExtents } from "@generalbusiness/dap-platform";
import { garden } from "./support/garden.ts";
import { mcpRoom } from "./support/room.ts";
import { exercises, created as createRoom } from "./support/story.ts";

// Invariant: an application the server has never seen, written in this test, gets its tools the moment the room holds it, with
// no change to the server: they are listed with derived text, signed with a detached text and a presented fact, refused by the
// guard's own name with its sentence, and read back.
test("an unfamiliar application, created by the room and driven through the same server", async () => {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita");
    await createRoom(room, rita);
    await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" });
    expect((await rita.ok("rules.activate", { fields: { digest: definitionDigest(garden), name: "garden" }, values: [canonicalize(garden)], idempotencyKey: "activate" }))["answer"]).toBe("accepted");
    expect((await rita.names()).some((n) => n.startsWith("garden."))).toBe(false);
    // The room's directory creates the garden as a lane, under the room's membership.
    const opened = await rita.ok("issue.create", { fields: { definition: definitionDigest(garden), title: "The garden", body: "Beds by the wall.", conditions: ["it grows"] }, idempotencyKey: "garden" });
    const created = await rita.ok("wait", { scope: "directory", entry: (opened["fact"] as FactRef).seq });
    expect(created["timedOut"]).toBe(false);
    const tools = (await rita.service.page()).tools;
    const plant = tools.find((t) => t.name === "garden.plant")!;
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["garden.plant", "garden.tend", "garden.harvest"]));
    expect(plant.description).toBe("plant: opens a bed; needs issue.comment, which your role (admin) holds. Fields: crop (required): text up to 64 bytes. note: text up to 4096 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. rows (required): a list of up to 8, each text up to 32 bytes. Guards: no two elements of the act's rows are the same (rows-repeat).");
    expect(Object.keys((plant.inputSchema["properties"] as Record<string, unknown>))).toEqual(["target", "idempotencyKey", "resubmit", "fields", "texts"]);
    const harvest = tools.find((t) => t.name === "garden.harvest")!;
    expect(Object.keys((harvest.inputSchema["properties"] as Record<string, unknown>))).toContain("presented");

    // Signed: a bed with a detached note; a bed refused by its distinct guard, by name, with the sentence.
    const note = "Water at dawn.";
    const bed = await rita.ok("garden.plant", { target: 1, fields: { crop: "beans", rows: ["north", "south"], note }, idempotencyKey: "plant-1" });
    expect(bed["answer"], JSON.stringify(bed)).toBe("accepted");
    const twice = await rita.ok("garden.plant", { target: 1, fields: { crop: "peas", rows: ["east", "east"] }, idempotencyKey: "plant-2" });
    expect([twice["answer"], twice["reason"], twice["name"]]).toEqual(["refused", "guard-failed", "rows-repeat"]);
    expect(twice["sentence"]).toMatch(/refused plant, because this does not hold: no two elements of the act's rows are the same \(rows-repeat\), judged at head \d+\.$/);
    const bedId = (bed["fact"] as FactRef).seq;
    const tended = await rita.ok("garden.tend", { target: 1, on: bedId, fields: { note: "Mulched." }, idempotencyKey: "tend-1" });
    expect(tended["answer"]).toBe("accepted");

    // A presented fact: the harvest presents the bed's planting entry; another bed's planting is refused by name.
    exercises("garden", "harvest", "presented");
    const other = await rita.ok("garden.plant", { target: 1, fields: { crop: "kale", rows: ["west"] }, idempotencyKey: "plant-3" });
    const wrong = await rita.ok("garden.harvest", { target: 1, on: bedId, presented: { planting: other["fact"] }, idempotencyKey: "harvest-wrong" });
    expect([wrong["answer"], wrong["name"]]).toEqual(["refused", "another-bed"]);
    const harvested = await rita.ok("garden.harvest", { target: 1, on: bedId, presented: { planting: bed["fact"] }, idempotencyKey: "harvest-1" });
    expect(harvested["answer"], JSON.stringify(harvested)).toBe("accepted");

    // Read back: the bed is final now, among the retained items; its note is a detached text, read by its digest.
    const final = await rita.ok("items", { scope: 1, type: "bed", final: true });
    const kept = (final["items"] as { id: number; state: string; values: { note: string; crop: string } }[]).find((i) => i.id === bedId)!;
    expect([kept.state, kept.values.crop, kept.values.note]).toEqual(["harvested", "beans", textDigest("Mulched.")]);
    expect((await rita.ok("text", { scope: 1, kind: "text", digest: textDigest("Mulched.") }))["text"]).toBe("Mulched.");
    expect(((await rita.ok("steps", { scope: 1 }))["steps"] as { kind: string }[]).map((s) => s.kind)).toEqual(["start", "delivery", "plant", "tend", "plant", "harvest"]);
    expect(note).toBeDefined();
  } finally { room.done(); }
}, 600_000);
