/**
 * Declared acts stage 5, the UI (request a5d64b35): the checker's review of
 * f606dd89, act fcd7391d.
 *
 * A load and an explicit read each ask the room for its active catalogue,
 * and the older question may be answered last. An answer never takes the
 * page back from an activation it has already confirmed (R-DECL-23): not
 * the snapshot's catalogue, and not the catalogue under which later
 * records are read. The cases without a later activation, where the
 * delayed answer is still good, stand beside each regression.
 *
 * The room here is the in-memory stand-in, with its change notices held
 * back so that each test decides the order of answers itself.
 */

import { waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, Catalogue, DeclaredRecord, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";

const adapters: LiveRoom[] = [];
afterEach(() => {
  for (const a of adapters.splice(0)) a.stop();
});

type Acts = Readonly<Record<string, ActDeclaration>>;
/** The setlist's acts with another label on `start-song`: a new policy version with the same kinds. */
const relabelled = (label: string): Acts => ({ ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label } });

/** A catalogue's policy version; null for no catalogue, so that a missing one fails an expectation, not a property read. */
const policyOf = (c: Catalogue | null) => (c === null ? null : c.policy);

/** The label a catalogue gives `start-song`. */
const labelOf = (c: Catalogue | null) => (c !== null && c.vocabulary === "declared" ? c.acts["start-song"]!.declaration.label : null);

function gate<T = void>() {
  let open!: (v: T) => void;
  const opened = new Promise<T>((resolve) => (open = resolve));
  return { opened, open };
}

/** A room and its adapter, loaded once. The room's change notices do not reach the adapter. */
async function quiet() {
  const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: SETLIST_ACTS });
  room.me = "@noor";
  const watch = room.watch.bind(room);
  room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
  adapters.push(adapter);
  await adapter.start();
  const first = (await room.acts()) as ActsCatalogue;
  return { room, adapter, first };
}

/**
 * Hold the room's next answer to "which catalogue is active": it is read from the room at once, and handed over
 * only when `release` opens. `fail` makes that one answer an error instead, as a transport that lost it would.
 */
function holdNextCurrent(room: MemoryRoom, fail = false) {
  const read = room.acts.bind(room);
  const asked = gate<Catalogue>();
  const release = gate();
  let n = 0;
  room.acts = async () => {
    const value = await read();
    if (++n === 1) {
      asked.open(value);
      await release.opened;
      if (fail) throw new Error("the answer was lost");
    }
    return value;
  };
  return { asked: asked.opened, release: release.open };
}

/** Hold the room's next answer about an earlier version, the same way. */
function holdNextHistorical(room: MemoryRoom) {
  const read = room.actsAt.bind(room);
  const asked = gate<Catalogue | null>();
  const release = gate();
  let n = 0;
  room.actsAt = async (at) => {
    const value = await read(at);
    if (++n === 1) {
      asked.open(value);
      await release.opened;
    }
    return value;
  };
  return { asked: asked.opened, release: release.open, count: () => n };
}

async function song(room: MemoryRoom, under: ActsCatalogue, name: string): Promise<DeclaredRecord> {
  const r = await room.act("start-song", null, { scope: [`songs/${name}/**`], title: name, key: "c", tempo: 120 }, { binding: under.acts["start-song"]!.binding });
  expect("refused" in r).toBe(false);
  return r as DeclaredRecord;
}

/** Count the adapter's notices, to wait for a load to be published. */
function notices(adapter: LiveRoom) {
  let n = 0;
  const off = adapter.subscribe(() => void (n += 1));
  return { count: () => n, off };
}

describe("an explicit read of the declarations that is answered late (R-DECL-23)", () => {
  test("with no activation in between, two reads answered out of order leave the same catalogue", async () => {
    const { room, adapter, first } = await quiet();
    const held = holdNextCurrent(room);
    const early = adapter.readCatalogue();
    expect(await held.asked).toEqual(first);
    expect(await adapter.readCatalogue()).toEqual(first);
    held.release();
    expect(await early).toEqual(first);
    expect(adapter.snapshot()!.catalogue).toEqual(first);
    expect(await adapter.catalogueAt(first.since)).toEqual(first);
  });

  test("an answer from before an activation the page has confirmed does not bring the earlier catalogue back", async () => {
    const { room, adapter, first } = await quiet();
    const held = holdNextCurrent(room);
    const early = adapter.readCatalogue();
    expect((await held.asked).policy).toBe(first.policy);
    const version = await room.activate({ acts: relabelled("Begin a tune") });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.policy).toBe(version);
    const later = await song(room, fresh, "after");
    expect(later.seq).toBeGreaterThan(fresh.since);
    held.release();
    // The late caller is given the catalogue the page holds, not the one its own question read.
    expect(policyOf(await early)).toBe(version);
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(version);
    expect(adapter.snapshot()!.policy).toMatchObject({ version, activatedAt: fresh.since });
    // A record accepted after the activation is read under the policy that governs it.
    expect(policyOf(await adapter.catalogueAt(later.seq))).toBe(version);
    expect(labelOf(await adapter.catalogueAt(later.seq))).toBe("Begin a tune");
  });

  test("an answer that names a later activation than the one held is taken, in whatever order it was asked", async () => {
    const { room, adapter, first } = await quiet();
    // The earlier question is answered by the room only after the activation: its answer is the newer one.
    const read = room.acts.bind(room);
    const wait = gate();
    let n = 0;
    room.acts = async () => {
      if (++n === 1) await wait.opened;
      return read();
    };
    const early = adapter.readCatalogue();
    expect(policyOf(await adapter.readCatalogue())).toBe(first.policy);
    const version = await room.activate({ acts: relabelled("Begin a tune") });
    wait.open();
    expect(policyOf(await early)).toBe(version);
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(version);
  });

  test("a lost answer that arrives after a later activation was confirmed does not blank the catalogue", async () => {
    const { room, adapter } = await quiet();
    const held = holdNextCurrent(room, true);
    const early = adapter.readCatalogue();
    await held.asked;
    const version = await room.activate({ acts: relabelled("Begin a tune") });
    expect(policyOf(await adapter.readCatalogue())).toBe(version);
    held.release();
    expect(policyOf(await early)).toBe(version);
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(version);
  });

  test("a lost answer with nothing confirmed in between still means the declarations are not available", async () => {
    const { room, adapter, first } = await quiet();
    expect(adapter.snapshot()!.catalogue).toEqual(first);
    const held = holdNextCurrent(room, true);
    const early = adapter.readCatalogue();
    await held.asked;
    held.release();
    expect(await early).toBeNull();
    expect(adapter.snapshot()!.catalogue).toBeNull();
    expect(adapter.snapshot()!.policy).toMatchObject({ version: null, activatedAt: null });
  });
});

describe("a load of the room whose catalogue is answered late (R-DECL-23)", () => {
  test("with no activation in between, the load finishes under the catalogue it read", async () => {
    const { room, adapter, first } = await quiet();
    const held = holdNextCurrent(room);
    const seen = notices(adapter);
    // An act through the adapter starts a load, whose catalogue read is the one held.
    await adapter.act("start-song", null, { scope: ["songs/one/**"], title: "One", key: "c", tempo: 120 }, first.acts["start-song"]!.binding);
    expect(await held.asked).toEqual(first);
    held.release();
    await waitFor(() => expect(seen.count()).toBeGreaterThan(0));
    seen.off();
    expect(adapter.snapshot()!.catalogue).toEqual(first);
    expect(adapter.snapshot()!.feed.filter((e) => e.type === "act")).toHaveLength(1);
  });

  test("a load begun before an activation does not replace the later catalogue an explicit read confirmed", async () => {
    const { room, adapter, first } = await quiet();
    const held = holdNextCurrent(room);
    const seen = notices(adapter);
    await adapter.act("start-song", null, { scope: ["songs/one/**"], title: "One", key: "c", tempo: 120 }, first.acts["start-song"]!.binding);
    expect((await held.asked).policy).toBe(first.policy);
    const version = await room.activate({ acts: relabelled("Begin a tune") });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(version);
    const later = await song(room, fresh, "two");
    const before = seen.count();
    held.release();
    await waitFor(() => expect(seen.count()).toBeGreaterThan(before));
    seen.off();
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(version);
    expect(adapter.snapshot()!.policy).toMatchObject({ version, activatedAt: fresh.since });
    expect(policyOf(await adapter.catalogueAt(later.seq))).toBe(version);
    // The record from before the activation is still read under its own version.
    const one = adapter.snapshot()!.feed.find((e) => e.type === "act")!;
    expect(one.meaning!.label).toBe("Start a song");
  });

  test("a load whose catalogue answer is lost after a later activation was confirmed keeps that catalogue", async () => {
    const { room, adapter, first } = await quiet();
    const held = holdNextCurrent(room, true);
    const seen = notices(adapter);
    await adapter.act("start-song", null, { scope: ["songs/one/**"], title: "One", key: "c", tempo: 120 }, first.acts["start-song"]!.binding);
    await held.asked;
    const version = await room.activate({ acts: relabelled("Begin a tune") });
    await adapter.readCatalogue();
    const before = seen.count();
    held.release();
    await waitFor(() => expect(seen.count()).toBeGreaterThan(before));
    seen.off();
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(version);
    expect(adapter.snapshot()!.source.status).toBe("live");
  });

  test("a load that has read its catalogue, and is still reading when a later activation is confirmed, is published under the later one", async () => {
    const { room, adapter, first } = await quiet();
    // A record under the first version, then a second version: reading that record needs a question about the first.
    await song(room, first, "one");
    const second = await room.activate({ acts: relabelled("Begin a tune") });
    await adapter.readCatalogue();
    const tail = holdNextHistorical(room);
    const seen = notices(adapter);
    const mid = (await room.acts()) as ActsCatalogue;
    // This act starts a load. It reads the second version as active, then waits on the held question.
    await adapter.act("start-song", null, { scope: ["songs/two/**"], title: "Two", key: "c", tempo: 120 }, mid.acts["start-song"]!.binding);
    await tail.asked;
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(second);
    const third = await room.activate({ acts: relabelled("Call a tune") });
    expect(policyOf(await adapter.readCatalogue())).toBe(third);
    const before = seen.count();
    tail.release();
    await waitFor(() => expect(seen.count()).toBeGreaterThan(before));
    await waitFor(() => expect(adapter.snapshot()!.feed.filter((e) => e.type === "act")).toHaveLength(2));
    seen.off();
    expect(policyOf(adapter.snapshot()!.catalogue)).toBe(third);
    expect(adapter.snapshot()!.policy.version).toBe(third);
    expect(labelOf(adapter.snapshot()!.catalogue)).toBe("Call a tune");
  });

  test("a load that could not read the catalogue is published with the one an explicit read confirmed while it ran", async () => {
    const { room, adapter, first } = await quiet();
    await song(room, first, "one");
    // The load's own question fails at once, so it holds no catalogue and asks about each record's version.
    const read = room.acts.bind(room);
    let n = 0;
    room.acts = async () => {
      if (++n === 1) throw new Error("the answer was lost");
      return read();
    };
    const tail = holdNextHistorical(room);
    const seen = notices(adapter);
    await adapter.act("start-song", null, { scope: ["songs/two/**"], title: "Two", key: "c", tempo: 120 }, first.acts["start-song"]!.binding);
    await tail.asked;
    expect(policyOf(await adapter.readCatalogue())).toBe(first.policy);
    const before = seen.count();
    tail.release();
    await waitFor(() => expect(seen.count()).toBeGreaterThan(before));
    await waitFor(() => expect(adapter.snapshot()!.feed.filter((e) => e.type === "act")).toHaveLength(2));
    seen.off();
    expect(adapter.snapshot()!.catalogue).toEqual(first);
    expect(adapter.snapshot()!.policy).toMatchObject({ version: first.policy, activatedAt: first.since });
  });
});

describe("an earlier version's declarations answered late: the page keeps none of its own (R-DECL-23)", () => {
  test("with no later activation, a delayed answer about an ended version is good, and is asked for again", async () => {
    const { room, adapter, first } = await quiet();
    await room.activate({ acts: relabelled("Begin a tune") });
    const current = (await adapter.readCatalogue()) as ActsCatalogue;
    const held = holdNextHistorical(room);
    const pending = adapter.catalogueAt(first.since);
    const ended = await held.asked;
    expect(ended!.until).toBe(current.since);
    held.release();
    expect(await pending).toEqual(ended);
    expect(await adapter.catalogueAt(first.since)).toEqual(ended);
    expect(held.count()).toBe(2);
  });

  test("an answer read before a kind was retired goes to its caller only: the next reads show the retirement and the current policy", async () => {
    const { room, adapter, first } = await quiet();
    await room.activate({ acts: relabelled("Begin a tune") });
    await adapter.readCatalogue();
    const held = holdNextHistorical(room);
    const pending = adapter.catalogueAt(first.since);
    const ended = (await held.asked) as ActsCatalogue;
    expect(ended.acts["cue"]!.retired).toBeUndefined();
    const { cue: _retired, ...withoutCue } = relabelled("Begin a tune");
    await room.activate({ acts: withoutCue });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    const later = await song(room, fresh, "after");
    held.release();
    expect(await pending).toEqual(ended);
    expect(policyOf(await adapter.catalogueAt(later.seq))).toBe(fresh.policy);
    const again = (await adapter.catalogueAt(first.since)) as ActsCatalogue;
    expect(again.acts["cue"]!.retired).toBe(fresh.since);
    expect(held.count()).toBe(2);
  });
});
