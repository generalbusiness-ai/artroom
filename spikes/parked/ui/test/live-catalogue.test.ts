/**
 * The page's catalogue of declarations never goes back behind an activation
 * the page has confirmed (docs/protocol.md R-DECL-23): not the snapshot's
 * catalogue, and not the catalogue under which later records are read.
 *
 * A load and an explicit read each ask the room for its active catalogue,
 * and the older question may be answered last, or lost. These are the cases
 * four reviews found in the live adapter, each with the control that shows a
 * late answer of the same age is still good:
 *
 * - fcd7391d: an answer from before a confirmed activation;
 * - 0fd98c41: what was confirmed outlasts a read that fails;
 * - 8df737b8: a failed read blanks the catalogue only if no other answer was
 *   taken meanwhile, counted and not told by comparing objects;
 * - fb27de86, finding 3: an explicit read is what `D(s)` is answered from.
 *
 * The room is the in-memory stand-in, with its change notices held back so
 * that each test decides the order of answers itself. Nothing here shows a
 * real Room's admission or replay. No test needs the page: this is the
 * adapter alone.
 */

import { afterEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, Catalogue, DeclaredRecord, HttpRoom } from "../src/room/contract.ts";
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

async function song(room: MemoryRoom, under: ActsCatalogue, name: string): Promise<DeclaredRecord> {
  const r = await room.act("start-song", null, { scope: [`songs/${name}/**`], title: name, key: "c", tempo: 120 }, { binding: under.acts["start-song"]!.binding });
  expect("refused" in r).toBe(false);
  return r as DeclaredRecord;
}

describe("an answer from before an activation the page has confirmed (review fcd7391d)", () => {
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

  /** Count the adapter's notices, to wait for a load to be published. */
  function notices(adapter: LiveRoom) {
    let n = 0;
    const off = adapter.subscribe(() => void (n += 1));
    return { count: () => n, off };
  }

  describe("an explicit read of the declarations that is answered late (R-DECL-23)", () => {
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

  });

  describe("a load of the room whose catalogue is answered late (R-DECL-23)", () => {
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
});

describe("what the page has confirmed outlasts a read that fails (review 0fd98c41)", () => {
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

  });
});

describe("a failed read, and whether another answer was taken meanwhile (review 8df737b8)", () => {
  /**
   * A room and its adapter, loaded once, with a later activation confirmed. With `sameObject`, the room's handle
   * gives the object it gave before whenever the active catalogue is unchanged: every answer is still read from the
   * room, and only its identity is reused.
   */
  async function confirmed(sameObject: boolean) {
    const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: SETLIST_ACTS });
    room.me = "@noor";
    const actual = room.acts.bind(room);
    let last: Catalogue | undefined;
    room.acts = async () => {
      const now = await actual();
      if (sameObject && last !== undefined && JSON.stringify(now) === JSON.stringify(last)) return last;
      last = now;
      return now;
    };
    const watch = room.watch.bind(room);
    room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
    const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
    adapters.push(adapter);
    await adapter.start();
    await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "A later meaning" } } });
    const held = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(held.acts["start-song"]!.declaration.label).toBe("A later meaning");
    return { room, adapter, held };
  }

  /** The next read of the active catalogue is asked at once, waits for `release`, and then fails; later reads answer. */
  function nextReadLost(room: MemoryRoom) {
    const read = room.acts.bind(room);
    const asked = gate();
    const release = gate();
    let n = 0;
    room.acts = async () => {
      if (++n === 1) {
        asked.open();
        await release.opened;
        throw new Error("the earlier answer was lost");
      }
      return read();
    };
    return { asked: asked.opened, release: release.open };
  }

  describe("a failed read and an answer taken while it was on its way (R-DECL-23)", () => {
    for (const sameObject of [true, false])
      test(`an explicit read that fails late does not blank the catalogue a later read gave, when the handle ${sameObject ? "gives the same object again" : "gives a new object"}`, async () => {
        const { room, adapter, held } = await confirmed(sameObject);
        const lost = nextReadLost(room);
        const earlier = adapter.readCatalogue();
        await lost.asked;
        const later = await adapter.readCatalogue();
        expect(later).toEqual(held);
        // The control differs from the case only in the identity of the answer.
        expect(later === held).toBe(sameObject);
        lost.release();
        // The late caller gets what the page holds, and the page still holds it.
        expect(await earlier).toEqual(held);
        expect(adapter.snapshot()!.catalogue).toEqual(held);
        expect(adapter.snapshot()!.policy.version).toBe(held.policy);
      });

    test("with no answer taken meanwhile, a failed read honestly leaves the page without a catalogue, also for a handle that reuses objects", async () => {
      const { room, adapter } = await confirmed(true);
      const lost = nextReadLost(room);
      const earlier = adapter.readCatalogue();
      await lost.asked;
      lost.release();
      expect(await earlier).toBeNull();
      expect(adapter.snapshot()!.catalogue).toBeNull();
      expect(adapter.snapshot()!.policy.version).toBeNull();
      // What was confirmed outlasts the failed read: the next answer of the same activation is taken.
      const again = (await adapter.readCatalogue()) as ActsCatalogue;
      expect(again.acts["start-song"]!.declaration.label).toBe("A later meaning");
      expect(adapter.snapshot()!.catalogue).toEqual(again);
    });
  });

  describe("a load whose read of the catalogue fails late (R-DECL-23)", () => {
    /** A load is started by an act; its read of the active catalogue is the one held, and then lost. */
    async function loadWithLostRead(sameObject: boolean) {
      const { room, adapter, held } = await confirmed(sameObject);
      const lost = nextReadLost(room);
      let seen = 0;
      const off = adapter.subscribe(() => void (seen += 1));
      await adapter.act("start-song", null, { scope: ["songs/one/**"], title: "One", key: "c", tempo: 120 }, held.acts["start-song"]!.binding);
      await lost.asked;
      const published = async () => {
        const before = seen;
        lost.release();
        await waitFor(() => expect(seen).toBeGreaterThan(before));
        off();
        return adapter.snapshot()!;
      };
      return { adapter, held, published };
    }

    for (const sameObject of [true, false])
      test(`it is published under the catalogue an explicit read gave meanwhile, when the handle ${sameObject ? "gives the same object again" : "gives a new object"}`, async () => {
        const { adapter, held, published } = await loadWithLostRead(sameObject);
        const later = await adapter.readCatalogue();
        expect(later).toEqual(held);
        expect(later === held).toBe(sameObject);
        const snap = await published();
        expect(snap.catalogue).toEqual(held);
        expect(snap.policy.version).toBe(held.policy);
      });

    test("with no answer taken meanwhile, the load is published with no catalogue", async () => {
      const { published } = await loadWithLostRead(true);
      const snap = await published();
      expect(snap.catalogue).toBeNull();
      expect(snap.policy.version).toBeNull();
    });
  });
});

describe("an explicit read of the declarations is what D(s) is answered from (review fb27de86, finding 3)", () => {
  /** An adapter that hears nothing from the room after it starts, and a count of its historical reads. */
  async function counting() {
    const room = await MemoryRoom.found("the-band/setlist", BAND, { acts: SETLIST_ACTS });
    room.me = "@noor";
    const watch = room.watch.bind(room);
    room.watch = (cursor, _onUpdate) => watch(cursor, () => {});
    const historical: unknown[] = [];
    const actsAt = room.actsAt.bind(room);
    room.actsAt = async (at) => (historical.push(at), actsAt(at));
    const adapter = new LiveRoom(room as unknown as HttpRoom, "@noor");
    adapters.push(adapter);
    await adapter.start();
    const old = (await room.acts()) as Catalogue;
    expect(await adapter.catalogueAt(old.since)).toEqual(old);
    historical.length = 0;
    return { room, adapter, old, historical };
  }

  test("baseline: with no activation, an explicit read keeps the catalogue, and D(s) is answered from it without asking the room", async () => {
    const { adapter, old, historical } = await counting();
    expect(await adapter.readCatalogue()).toEqual(old);
    expect(await adapter.catalogueAt(old.since)).toEqual(old);
    expect(historical).toEqual([]);
  });

  test("after an activation and an explicit read, an act accepted later is read under the new policy, and an earlier entry under the old one", async () => {
    const { room, adapter, old } = await counting();
    const next = await room.activate({ acts: { ...SETLIST_ACTS, "start-song": { ...SETLIST_ACTS["start-song"]!, label: "Begin a tune", help: "New help for this version." } } });
    const fresh = (await adapter.readCatalogue()) as ActsCatalogue;
    expect(fresh.policy).toBe(next);
    expect(fresh.policy).not.toBe(old.policy);
    expect(adapter.snapshot()!.catalogue!.policy).toBe(next);
    const entry = (await room.act("start-song", null, { scope: ["songs/after/**"], title: "After", key: "c", tempo: 120 }, { binding: fresh.acts["start-song"]!.binding })) as DeclaredRecord;
    expect(entry.seq).toBeGreaterThan(fresh.since);
    const at = (await adapter.catalogueAt(entry.seq)) as ActsCatalogue;
    expect(at.policy).toBe(next);
    expect(at.acts["start-song"]!.declaration.label).toBe("Begin a tune");
    // The entry from before the activation keeps the label of its own time, and its interval now has an end.
    const before = (await adapter.catalogueAt(old.since)) as ActsCatalogue;
    expect(before.policy).toBe(old.policy);
    expect(before.until).toBe(fresh.since);
    expect(before.acts["start-song"]!.declaration.label).toBe("Start a song");
  });

  test("after a kind is retired and an explicit read, the old catalogue is read with its end and the kind's retired mark", async () => {
    const { room, adapter, old } = await counting();
    const { cue: _retired, ...withoutCue } = SETLIST_ACTS;
    await room.activate({ acts: withoutCue });
    const fresh = (await adapter.readCatalogue())!;
    const expected = (await room.actsAt({ seq: old.since })) as ActsCatalogue;
    expect(expected.until).toBe(fresh.since);
    expect(expected.acts["cue"]!.retired).toBe(fresh.since);
    expect(await adapter.catalogueAt(old.since)).toEqual(expected);
  });
});
