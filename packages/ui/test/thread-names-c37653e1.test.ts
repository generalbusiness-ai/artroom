/**
 * Declared acts stage 5, the UI (request a5d64b35): thread names under the
 * planner's decision c37653e1 (docs/protocol.md section 33.10).
 *
 * A thread with no goal is named by its opening act's label and its first
 * text field by name, read with the declaration in force when the thread
 * opened. The page gets that declaration with each feed entry's meaning and
 * gives it to the helper every reader shares.
 */

import { waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, DeclaredRecord, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
import { laneGoal } from "../src/ui/format.ts";

const adapters: LiveRoom[] = [];
afterEach(() => {
  for (const a of adapters.splice(0)) a.stop();
});

const SONG = SETLIST_ACTS["start-song"]!;

async function open(acts: Readonly<Record<string, ActDeclaration>> = SETLIST_ACTS) {
  const room = await MemoryRoom.found("the-band/setlist", BAND, { acts });
  room.me = "@noor";
  const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
  adapters.push(adapter);
  await adapter.start();
  return { room, adapter };
}

async function start(room: MemoryRoom, body: Parameters<MemoryRoom["act"]>[2]): Promise<DeclaredRecord> {
  const binding = ((await room.acts()) as ActsCatalogue).acts["start-song"]!.binding;
  const r = await room.act("start-song", null, body, { binding });
  expect("refused" in r).toBe(false);
  return r as DeclaredRecord;
}

describe("the page names a thread by its opening act's first text field (section 33.10)", () => {
  test("the title names the song, though the enum field key comes first by name", async () => {
    const { room, adapter } = await open();
    const song = await start(room, { title: "Footprints", key: "c", tempo: 96, scope: ["songs/footprints/**"] });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(1));
    const snap = adapter.snapshot()!;
    expect(laneGoal(snap, song.id)).toBe("Start a song: Footprints");
    // The entry's meaning carries the declaration of its own seq, which is where the field types come from.
    expect(snap.feed.find((f) => f.id === song.id)!.meaning!.declaration).toEqual(SONG);
  });

  test("a thread keeps the name its own declaration gave it after a later document relabels the act and makes another field the text one", async () => {
    const { room, adapter } = await open();
    const first = await start(room, { title: "Footprints", key: "c", tempo: 96, scope: ["songs/footprints/**"] });
    // The later document: `key` is now text, and `title` is one of a fixed list.
    const later: ActDeclaration = { ...SONG, label: "Begin a tune", body: { ...SONG.body, key: { type: "text", max: 8 }, title: { type: "enum", values: ["so-what", "nardis"] } } };
    await room.activate({ acts: { ...SETLIST_ACTS, "start-song": later } });
    const second = await start(room, { title: "so-what", key: "d", tempo: 136, scope: ["songs/so-what/**"] });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(2));
    const snap = adapter.snapshot()!;
    expect(laneGoal(snap, first.id)).toBe("Start a song: Footprints");
    expect(laneGoal(snap, second.id)).toBe("Begin a tune: d");
  });

  test("an act with no text field is still named by its first field by name, and a thread with a goal by its goal", async () => {
    const plain: ActDeclaration = { ...SONG, body: { key: SONG.body!["key"]!, tempo: SONG.body!["tempo"]! } };
    const { room, adapter } = await open({ ...SETLIST_ACTS, "start-song": plain });
    const song = await start(room, { key: "c", tempo: 96, scope: ["songs/untitled/**"] });
    await waitFor(() => expect(adapter.snapshot()!.lanes).toHaveLength(1));
    expect(laneGoal(adapter.snapshot()!, song.id)).toBe("Start a song: c");
    expect(laneGoal(adapter.snapshot()!, "act_999_00000000" as never)).toBe("an unknown lane");
  });
});
