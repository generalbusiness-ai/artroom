/** Local-only paired UI state probes at exact f606dd89. MemoryRoom is not authenticated integration. */
import { afterEach, describe, expect, test } from "vitest";
import { waitFor } from "@testing-library/preact";
import type { ActDeclaration, ActsCatalogue, Catalogue, DeclaredRecord, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";

const adapters: LiveRoom[] = [];
afterEach(() => { for (const a of adapters.splice(0)) a.stop(); });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
async function quiet() {
  const room = await MemoryRoom.found("checker/f606-state-races", BAND, { acts: SETLIST_ACTS });
  room.me = "@noor";
  const watch = room.watch.bind(room);
  room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
  adapters.push(adapter);
  await adapter.start();
  const old = (await room.acts()) as ActsCatalogue;
  return { room, adapter, old };
}
const nextActs: Readonly<Record<string, ActDeclaration>> = { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Begin a tune", help: "After confirmed activation." } };
function holdFirstCurrent(room: MemoryRoom) {
  const read = room.acts.bind(room);
  const captured = deferred<Catalogue>();
  const release = deferred<void>();
  let count = 0;
  room.acts = async () => {
    const value = await read();
    if (++count === 1) { captured.resolve(value); await release.promise; }
    return value;
  };
  return { captured, release };
}
async function accepted(room: MemoryRoom, fresh: ActsCatalogue, suffix: string) {
  const record = await room.act("start-song", null, { scope: [`songs/${suffix}/**`], title: suffix, key: "c", tempo: 120 }, { binding: fresh.acts["start-song"]!.binding });
  expect("refused" in record).toBe(false);
  return record as DeclaredRecord;
}

describe("checker f606 current catalogue completion order", () => {
  test("control: two delayed current reads without activation retain the same catalogue", async () => {
    const { room, adapter, old } = await quiet();
    const held = holdFirstCurrent(room);
    const first = adapter.readCatalogue();
    expect(await held.captured.promise).toEqual(old);
    expect(await adapter.readCatalogue()).toEqual(old);
    held.release.resolve();
    expect(await first).toEqual(old);
    expect(adapter.snapshot()!.catalogue).toEqual(old);
    expect(await adapter.catalogueAt(old.since)).toEqual(old);
  });
  test("regression: a delayed older current read cannot replace a newer activation already confirmed by the UI", async () => {
    const { room, adapter, old } = await quiet();
    const held = holdFirstCurrent(room);
    const first = adapter.readCatalogue();
    expect(await held.captured.promise).toEqual(old);
    const version = await room.activate({ acts: nextActs });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.policy).toBe(version);
    expect(adapter.snapshot()!.catalogue!.policy).toBe(version);
    const record = await accepted(room, fresh, "after-current");
    expect(record.seq).toBeGreaterThan(fresh.since);
    held.release.resolve();
    await first;
    expect.soft(adapter.snapshot()!.catalogue!.policy, "a confirmed activation must not regress when an older current response arrives").toBe(version);
    expect.soft((await adapter.catalogueAt(record.seq))!.policy, "a later accepted entry must use its actual governing policy").toBe(version);
  });
  test("control: a refresh whose delayed catalogue has no later activation finishes with its governing policy", async () => {
    const { room, adapter, old } = await quiet();
    const held = holdFirstCurrent(room);
    let notices = 0;
    const unsubscribe = adapter.subscribe(() => { notices += 1; });
    await adapter.act("start-song", null, { scope: ["songs/load-control/**"], title: "Control", key: "c", tempo: 120 }, old.acts["start-song"]!.binding);
    expect(await held.captured.promise).toEqual(old);
    held.release.resolve();
    await waitFor(() => expect(notices).toBeGreaterThan(0));
    unsubscribe();
    expect(adapter.snapshot()!.catalogue).toEqual(old);
    expect(adapter.snapshot()!.feed.filter((e) => e.type === "act")).toHaveLength(1);
  });
  test("regression: a refresh begun earlier cannot replace a newer activation confirmed by an explicit read", async () => {
    const { room, adapter, old } = await quiet();
    const held = holdFirstCurrent(room);
    let notices = 0;
    const unsubscribe = adapter.subscribe(() => { notices += 1; });
    await adapter.act("start-song", null, { scope: ["songs/load-race/**"], title: "Earlier", key: "c", tempo: 120 }, old.acts["start-song"]!.binding);
    expect(await held.captured.promise).toEqual(old);
    const version = await room.activate({ acts: nextActs });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.policy).toBe(version);
    expect(adapter.snapshot()!.catalogue!.policy).toBe(version);
    const before = notices;
    const later = await accepted(room, fresh, "after-load");
    held.release.resolve();
    await waitFor(() => expect(notices).toBeGreaterThan(before));
    unsubscribe();
    expect.soft(adapter.snapshot()!.catalogue!.policy, "load must not regress a newer confirmed catalogue").toBe(version);
    expect.soft((await adapter.catalogueAt(later.seq))!.policy, "load's active fast path must not apply the old policy to a later accepted record").toBe(version);
  });
});

describe("checker f606 delayed historical reads are not retained by UI", () => {
  test("control: a delayed ended-version response with no later activation remains valid", async () => {
    const { room, adapter, old } = await quiet();
    await room.activate({ acts: nextActs });
    const current = (await adapter.readCatalogue()) as ActsCatalogue;
    const read = room.actsAt.bind(room);
    const captured = deferred<Catalogue | null>();
    const release = deferred<void>();
    let count = 0;
    room.actsAt = async (at) => {
      const value = await read(at);
      if (++count === 1) { captured.resolve(value); await release.promise; }
      return value;
    };
    const pending = adapter.catalogueAt(old.since);
    const historical = await captured.promise;
    expect(historical!.until).toBe(current.since);
    release.resolve();
    expect(await pending).toEqual(historical);
    expect(await adapter.catalogueAt(old.since)).toEqual(historical);
    expect(count).toBe(2);
  });
  test("control: a historical response started before retirement does not poison subsequent current or historical reads", async () => {
    const { room, adapter, old } = await quiet();
    await room.activate({ acts: nextActs });
    await adapter.readCatalogue();
    const read = room.actsAt.bind(room);
    const captured = deferred<Catalogue | null>();
    const release = deferred<void>();
    let count = 0;
    room.actsAt = async (at) => {
      const value = await read(at);
      if (++count === 1) { captured.resolve(value); await release.promise; }
      return value;
    };
    const pending = adapter.catalogueAt(old.since);
    const historical = (await captured.promise) as ActsCatalogue;
    expect(historical.acts["cue"]!.retired).toBeUndefined();
    const { cue: _retired, ...withoutCue } = nextActs;
    await room.activate({ acts: withoutCue });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    const record = await accepted(room, fresh, "after-retirement");
    release.resolve();
    expect(await pending).toEqual(historical); // A snapshot started before retirement; UI does not retain it.
    expect((await adapter.catalogueAt(record.seq))!.policy).toBe(fresh.policy);
    const again = (await adapter.catalogueAt(old.since)) as ActsCatalogue;
    expect(again.acts["cue"]!.retired).toBe(fresh.since);
    expect(count).toBe(2);
  });
});
