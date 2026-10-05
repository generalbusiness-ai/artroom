/**
 * The mock room's declared mode: a room whose policy declares its own acts,
 * and they are not the code-review seven. It is the live adapter over an
 * in-memory room (memory-room.ts), so the demo and its tests run the same
 * reading, rendering and submitting code a real room would.
 *
 * The story: a band keeps a setlist (setlist.ts). Three people play a few
 * acts under the first policy version. A second version then renames one
 * act (the label only, so its binding is unchanged), changes what another
 * takes (a new binding under the same name), and drops a third. The records
 * made before it keep the meaning they had.
 */

import type { ActDeclaration, ActId, DeclaredRecord, KindName, MemberId, Result, Sha } from "../contract.ts";
import { isRefusal } from "../contract.ts";
import { LiveRoom } from "../live/live-room.ts";
import { MemoryRoom, type MemoryMember } from "./memory-room.ts";
import { SETLIST_ACTS } from "./setlist.ts";

export const BAND: readonly MemoryMember[] = [
  { handle: "@noor", role: "member" },
  { handle: "@ivo", role: "member" },
  { handle: "@keys-bot", role: "agent" },
  { handle: "@sam", role: "admin" },
];

/** The second policy version: `cue` relabelled, `add-part` reshaped, `wrap-up` dropped. */
export const SETLIST_ACTS_2: Readonly<Record<KindName, ActDeclaration>> = (() => {
  const { "wrap-up": _dropped, ...kept } = SETLIST_ACTS;
  void _dropped;
  return {
    ...kept,
    cue: { ...SETLIST_ACTS["cue"]!, label: "Signal the band" },
    "add-part": {
      ...SETLIST_ACTS["add-part"]!,
      body: { ...SETLIST_ACTS["add-part"]!.body, feel: { type: "enum", values: ["straight", "swung", "latin"] } },
    },
  };
})();

const head = (c: string) => c.repeat(40) as Sha;

const ok = (r: Result<DeclaredRecord>): DeclaredRecord => {
  if (isRefusal(r)) throw new Error(`the demo's own act was refused: ${r.rule}`);
  return r;
};

/** Play the demo's acts into a new in-memory room. */
export async function setlistRoom(): Promise<MemoryRoom> {
  const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: SETLIST_ACTS });
  const binding = async (kind: string) => {
    const c = await room.acts();
    if (c.vocabulary !== "declared") throw new Error("the demo room has no declarations");
    return c.acts[kind]!.binding;
  };
  room.me = "@noor";
  const song = ok(await room.act("start-song", null, { title: "Blue Bossa", key: "c", tempo: 132, scope: ["songs/blue-bossa/**"] }, { binding: await binding("start-song") }));
  const lane = song.id as ActId;
  const part = ok(
    await room.act("add-part", { lane }, { lease: 1, expectedGeneration: 0, head: head("a"), instrument: "bass", section: "head", bars: 16, summary: "Walking line for the head." }, { binding: await binding("add-part") }),
  );
  room.me = "@keys-bot";
  ok(await room.act("cue", { act: part.id }, { signal: "one-more", to: "@noor" }, { binding: await binding("cue") }));
  room.me = "@ivo";
  ok(await room.act("sign-off", { lane, generation: 1 }, { head: head("a"), verdict: "approve", scope: ["songs/blue-bossa/**"], text: "The bass line sits well." }, { binding: await binding("sign-off") }));
  room.me = "@noor";
  ok(await room.act("wrap-up", { lane }, { lease: 1 }, { binding: await binding("wrap-up") }));
  room.publish();
  await room.activate({ acts: SETLIST_ACTS_2 });
  room.me = "@ivo";
  ok(await room.act("start-song", null, { title: "Footprints", key: "c", tempo: 96, swing: true, scope: ["songs/footprints/**"] }, { binding: await binding("start-song") }));
  room.me = "@noor";
  return room;
}

/** The demo adapter: the live adapter over the in-memory room, presented as a mock. */
export async function declaredDemo(viewer: MemberId = "@noor"): Promise<{ adapter: LiveRoom; room: MemoryRoom }> {
  const room = await setlistRoom();
  const people = room.people.map((p) => p.handle);
  room.me = people.includes(viewer) ? viewer : "@noor";
  const adapter = new LiveRoom(room as never, room.me, () => new Date(Date.UTC(2026, 9, 3, 10, 0, 0)), {
    source: "mock",
    viewers: people,
    onViewer: (m) => {
      room.me = m;
    },
  });
  await adapter.start();
  return { adapter, room };
}
