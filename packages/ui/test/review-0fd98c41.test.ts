/**
 * Declared acts stage 5, the UI (request a5d64b35): the planner's review of
 * the repair 4567a490, act 0fd98c41.
 *
 * What the page has confirmed outlasts a read that fails. After a failed
 * read the page honestly holds no catalogue; an older answer that arrives
 * later still cannot bring back a catalogue from before an activation the
 * page had confirmed, and a load that read such a catalogue is not
 * published with it (R-DECL-23). The controls stand beside each case: an
 * old answer of the same age is still good, and a newer answer restores
 * the catalogue.
 *
 * The room here is the in-memory stand-in, with its change notices held
 * back so that each test decides the order of answers itself. Nothing here
 * shows a real Room's admission or replay.
 */

import { afterEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, DeclaredRecord, HttpRoom } from "../src/room/contract.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { BAND } from "../src/room/mock/declared-room.ts";
import { MemoryRoom } from "../src/room/mock/memory-room.ts";
import { SETLIST_ACTS } from "../src/room/mock/setlist.ts";
import { waitFor } from "./helpers.tsx";

const adapters: LiveRoom[] = [];
afterEach(() => {
  for (const a of adapters.splice(0)) a.stop();
});

type Acts = Readonly<Record<string, ActDeclaration>>;
const relabelled = (label: string): Acts => ({ ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label } });

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
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
  return { room, adapter };
}

async function song(room: MemoryRoom, under: ActsCatalogue, name: string): Promise<DeclaredRecord> {
  const r = await room.act("start-song", null, { scope: [`songs/${name}/**`], title: name, key: "c", tempo: 120 }, { binding: under.acts["start-song"]!.binding });
  expect("refused" in r).toBe(false);
  return r as DeclaredRecord;
}

/**
 * The room's answers to "which catalogue is active", in the order asked: the first is read at once and handed over
 * only when `release` opens; the third fails, as a transport that lost it would; every other is given as it is.
 */
function firstHeldThirdLost(room: MemoryRoom) {
  const read = room.acts.bind(room);
  const asked = gate();
  const release = gate();
  let n = 0;
  room.acts = async () => {
    const i = ++n;
    if (i === 3) throw new Error("the later answer was lost");
    const value = await read();
    if (i === 1) {
      asked.open();
      await release.opened;
    }
    return value;
  };
  return { asked: asked.opened, release: release.open };
}

describe("an older answer that arrives after a newer read failed (R-DECL-23)", () => {
  test("with a later activation confirmed in between, it does not bring the earlier catalogue back, and a record accepted since is still read under its own policy", async () => {
    const { room, adapter } = await quiet();
    const answers = firstHeldThirdLost(room);
    const old = adapter.readCatalogue();
    await answers.asked;
    await room.activate({ acts: relabelled("A later meaning") });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.acts["start-song"]!.declaration.label).toBe("A later meaning");
    const accepted = await song(room, fresh, "after");
    // The newest read fails: the page holds no catalogue, and says so.
    expect(await adapter.readCatalogue()).toBeNull();
    expect(adapter.snapshot()!.catalogue).toBeNull();
    answers.release();
    // The late caller gets what the page holds, and the page does not go back to the catalogue from before the activation.
    expect(await old).toBeNull();
    expect(adapter.snapshot()!.catalogue).toBeNull();
    expect(adapter.snapshot()!.policy.version).toBeNull();
    const governing = await adapter.catalogueAt(accepted.seq);
    expect(governing?.policy).toBe(fresh.policy);
    expect(governing?.since).toBe(fresh.since);
  });

  test("with no activation in between, the older answer is as new as anything confirmed, and gives the catalogue back", async () => {
    const { room, adapter } = await quiet();
    const answers = firstHeldThirdLost(room);
    const old = adapter.readCatalogue();
    await answers.asked;
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(await adapter.readCatalogue()).toBeNull();
    expect(adapter.snapshot()!.catalogue).toBeNull();
    answers.release();
    expect(((await old) as ActsCatalogue).policy).toBe(fresh.policy);
    expect(adapter.snapshot()!.catalogue?.since).toBe(fresh.since);
    expect(adapter.snapshot()!.policy.version).toBe(fresh.policy);
  });

  test("a failed read does not blank a catalogue that another read of the same version gave while it was on its way", async () => {
    const { room, adapter } = await quiet();
    const read = room.acts.bind(room);
    const asked = gate();
    const release = gate();
    let n = 0;
    room.acts = async () => {
      if (++n === 1) {
        asked.open();
        await release.opened;
        throw new Error("the first answer was lost");
      }
      return read();
    };
    const lost = adapter.readCatalogue();
    await asked.opened;
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    release.open();
    // No activation happened, so nothing newer was confirmed; but another answer was taken, and the lost one is older.
    expect(((await lost) as ActsCatalogue).policy).toBe(fresh.policy);
    expect(adapter.snapshot()!.catalogue?.policy).toBe(fresh.policy);
  });

  test("a newer answer restores the catalogue after a failed read", async () => {
    const { room, adapter } = await quiet();
    const read = room.acts.bind(room);
    let n = 0;
    room.acts = async () => {
      if (++n === 1) throw new Error("the answer was lost");
      return read();
    };
    expect(await adapter.readCatalogue()).toBeNull();
    expect(adapter.snapshot()!.catalogue).toBeNull();
    await room.activate({ acts: relabelled("Available again") });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.acts["start-song"]!.declaration.label).toBe("Available again");
    expect(adapter.snapshot()!.catalogue?.policy).toBe(fresh.policy);
  });
});

describe("a load that finishes after the newest read failed (R-DECL-23)", () => {
  /** A load that has read the second catalogue and waits on an earlier version's declarations; the third is then confirmed. */
  async function loadHeldAcrossActivation() {
    const { room, adapter } = await quiet();
    const first = (await room.acts()) as ActsCatalogue;
    await song(room, first, "one");
    await room.activate({ acts: relabelled("Second catalogue") });
    const second = (await adapter.readCatalogue()) as ActsCatalogue;
    const history = room.actsAt.bind(room);
    const asked = gate();
    const release = gate();
    let n = 0;
    room.actsAt = async (at) => {
      const answer = await history(at);
      if (++n === 1) {
        asked.open();
        await release.opened;
      }
      return answer;
    };
    let seen = 0;
    const off = adapter.subscribe(() => void (seen += 1));
    await adapter.act("start-song", null, { scope: ["songs/two/**"], title: "Two", key: "c", tempo: 120 }, second.acts["start-song"]!.binding);
    await asked.opened;
    await room.activate({ acts: relabelled("Third catalogue") });
    const third = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(third.since).toBeGreaterThan(second.since);
    const published = async () => {
      const before = seen;
      release.open();
      await waitFor(() => expect(seen).toBeGreaterThan(before));
      off();
      return adapter.snapshot()!;
    };
    return { room, adapter, second, third, published };
  }

  test("it is not published with the earlier catalogue it read: the page still holds none", async () => {
    const { room, adapter, published } = await loadHeldAcrossActivation();
    room.acts = async () => {
      throw new Error("the newest answer was lost");
    };
    expect(await adapter.readCatalogue()).toBeNull();
    const snap = await published();
    expect(snap.catalogue).toBeNull();
    expect(snap.policy.version).toBeNull();
    expect(snap.policy.activatedAt).toBeNull();
  });

  test("with no failed read, the same load is published under the later catalogue that was confirmed", async () => {
    const { third, published } = await loadHeldAcrossActivation();
    const snap = await published();
    expect(snap.catalogue?.policy).toBe(third.policy);
    expect(snap.policy.version).toBe(third.policy);
  });
});
