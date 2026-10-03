/** Planner additional unavailable-read race controls; MemoryRoom only. */
import { afterEach, describe, expect, test } from "vitest";
import { waitFor } from "@testing-library/preact";
import type { ActsCatalogue, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
const adapters: LiveRoom[] = [];
afterEach(() => { for (const a of adapters.splice(0)) a.stop(); });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function quiet() {
 const room = await MemoryRoom.found("planner/4567-unavailable", BAND, { acts: SETLIST_ACTS }); room.me = "@noor";
 const watch = room.watch.bind(room); room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
 const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor"); adapters.push(adapter); await adapter.start();
 return { room, adapter };
}
describe("planner confirmed activation through an unavailable read", () => {
 test.each([false, true])("an older held answer stays behind a confirmed activation after a newer read fails, laterActivation=%s", async laterActivation => {
  const { room, adapter } = await quiet(); const read = room.acts.bind(room); const arrived = gate(); const held = gate(); let n = 0;
  room.acts = async () => { const i = ++n; if (i === 3) throw new Error("later answer unavailable"); const result = await read(); if (i === 1) { arrived.release(); await held.promise; } return result; };
  const old = adapter.readCatalogue(); await arrived.promise;
  if (laterActivation) await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "New confirmed meaning" } } });
  const fresh = await adapter.readCatalogue() as ActsCatalogue; expect(fresh).not.toBeNull();
  let laterSeq: number | undefined;
  if (laterActivation) {
   const accepted = await room.act("start-song", null, { scope: ["songs/after/**"], title: "After", key: "c", tempo: 120 }, { binding: fresh.acts["start-song"]!.binding });
   expect("refused" in accepted).toBe(false); if ("seq" in accepted) laterSeq = accepted.seq;
  }
  expect(await adapter.readCatalogue()).toBeNull();
  held.release(); await old;
  const after = adapter.snapshot()!.catalogue;
  if (laterActivation) {
   const governing = await adapter.catalogueAt(laterSeq!);
   console.info(JSON.stringify({ probe: "explicit after unavailable", confirmed: fresh.since, restored: after?.since ?? null, expectedPolicy: fresh.policy, governingPolicy: governing?.policy ?? null }));
   expect.soft(after?.since ?? Number.POSITIVE_INFINITY, "unavailability must not erase the later activation already confirmed here").toBeGreaterThanOrEqual(fresh.since);
   expect.soft(governing?.policy, "the accepted later record stays under its own confirmed policy").toBe(fresh.policy);
  }
  else expect(after?.since).toBe(fresh.since);
 });
 test("an older completed load cannot be published after the newest confirmed catalogue becomes unavailable", async () => {
  const { room, adapter } = await quiet(); const first = await room.acts() as ActsCatalogue;
  await room.act("start-song", null, { scope: ["songs/one/**"], title: "One", key: "c", tempo: 120 }, { binding: first.acts["start-song"]!.binding });
  await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Second catalogue" } } });
  const second = await adapter.readCatalogue() as ActsCatalogue;
  const history = room.actsAt.bind(room); const arrived = gate(); const held = gate(); let n = 0;
  room.actsAt = async at => { const answer = await history(at); if (++n === 1) { arrived.release(); await held.promise; } return answer; };
  let notices = 0; const off = adapter.subscribe(() => { notices += 1; });
  await adapter.act("start-song", null, { scope: ["songs/two/**"], title: "Two", key: "c", tempo: 120 }, second.acts["start-song"]!.binding);
  await arrived.promise;
  await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Third confirmed catalogue" } } });
  const third = await adapter.readCatalogue() as ActsCatalogue;
  room.acts = async () => { throw new Error("newest answer unavailable"); };
  expect(await adapter.readCatalogue()).toBeNull();
  const before = notices; held.release(); await waitFor(() => expect(notices).toBeGreaterThan(before)); off();
  const after = adapter.snapshot()!.catalogue;
  console.info(JSON.stringify({ probe: "load after unavailable", loaded: second.since, confirmed: third.since, published: after?.since ?? null }));
  expect(after?.since ?? Number.POSITIVE_INFINITY, "a missing catalogue must not allow the loaded older catalogue to roll back a confirmed activation").toBeGreaterThanOrEqual(third.since);
 });
 test("a successful newer answer can restore a catalogue after unavailability", async () => {
  const { room, adapter } = await quiet(); const read = room.acts.bind(room); let n = 0;
  room.acts = async () => { if (++n === 1) throw new Error("answer unavailable"); return read(); };
  expect(await adapter.readCatalogue()).toBeNull();
  await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Later available" } } });
  const fresh = await adapter.readCatalogue() as ActsCatalogue;
  expect(fresh).not.toBeNull(); expect(adapter.snapshot()!.catalogue?.policy).toBe(fresh.policy);
 });
});
