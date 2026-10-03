/**
 * Declared acts stage 5, the CLI (request a5d64b35): the checker's act
 * 0b9119de and the planner's acts b22d29ee, 23ae8924 and c6f6ad78.
 *
 * `artroom act` prints a recorded act in the words of the declarations in
 * force at the act's own seq, D(seq) (R-DECL-23). Those are not always the
 * words read while the act was prepared: a label can change before the act
 * is admitted and leave its binding as it was. They are not always the
 * latest words either. An act finished from the journal is printed the
 * same way, from the body the journal kept. The read is for display only:
 * when it fails, the receipt is still given, with the kind and the thread's
 * ID in place of the words.
 *
 * The room is the fake room over its local HTTPS routes. Nothing here shows
 * a real Room's admission.
 */

import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ActDeclaration } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { useHarness } from "./harness.ts";

const { h, cli, login } = useHarness();

const SONG: ActDeclaration = {
  label: "Start a song",
  targets: { none: ["open"] },
  body: { key: { type: "enum", values: ["c", "d"] }, title: { type: "text", max: 80 } },
  who: { roles: ["member"] },
  hold: { scope: "body.scope", workspace: true },
};
const acts = (label: string) => ({ ...CODE_REVIEW_ACTS, "start-song": { ...SONG, label } });
const songs = () => h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "start-song");
const THREAD = (words: string) => new RegExp(`^Thread: ${words} \\(lane act_\\d+_[0-9a-f]{8}\\)\\.$`);

type Fetch = typeof fetch;
const isSend = (input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]) => init?.method === "POST" && new URL(String(input)).pathname.endsWith("/acts");
const declarationsRead = (input: Parameters<Fetch>[0]) => {
  const url = new URL(String(input));
  return url.pathname.endsWith("/declarations") ? url.search : null;
};

/** A member logged in, a room that declares `start-song`, and the command that starts one. */
async function ready() {
  const home = join(h.tmp, "alice");
  await login(home, "@alice");
  await h.room.activate(acts("Start a song"));
  const binding = (await h.room.bindingOf("start-song"))!;
  const argv = (...more: string[]) => ["act", "start-song", "--binding", binding, "--set", "key=c", "--set", "title=Footprints", "--set", "scope=songs/footprints/**", ...more];
  return { home, binding, argv };
}

describe("artroom act prints the act as recorded, in the words of its own seq (R-DECL-23)", () => {
  test("with no activation in between, the words are those the user read", async () => {
    const { home, argv } = await ready();
    const out = await cli(home, argv());
    expect(out.code).toBe(0);
    const lines = out.out.split("\n");
    expect(lines[0]).toMatch(/^Done: Start a song \(start-song\), recorded as act_\d+_[0-9a-f]{8}\.$/);
    expect(lines[1]).toMatch(THREAD("Start a song: Footprints"));
    expect(lines).toHaveLength(2);
  });

  test("a label changed after the act was prepared and before it was admitted: the act is printed under the new label, which governs it", async () => {
    const { home, binding, argv } = await ready();
    let changed = false;
    const out = await cli(home, argv(), h.tmp, {
      fetch: async (input, init) => {
        if (!changed && isSend(input, init)) {
          changed = true;
          await h.room.activate(acts("Begin a tune"));
        }
        return fetch(input, init);
      },
    });
    expect(out.code).toBe(0);
    // The label is no part of the binding: the act the user prepared is admitted, once, under the later document.
    expect(await h.room.bindingOf("start-song")).toBe(binding);
    expect(songs()).toHaveLength(1);
    const governing = h.room.policies.filter((p) => p.since <= songs()[0]!.seq).at(-1)!;
    expect(governing.acts!["start-song"]!.label).toBe("Begin a tune");
    const lines = out.out.split("\n");
    expect(lines[0]).toMatch(/^Done: Begin a tune \(start-song\), recorded as act_\d+_[0-9a-f]{8}\.$/);
    expect(lines[1]).toMatch(THREAD("Begin a tune: Footprints"));
  });

  test("a label changed after the act was admitted: the act keeps the label it was admitted under, not the latest", async () => {
    const { home, argv } = await ready();
    let changed = false;
    const out = await cli(home, argv(), h.tmp, {
      fetch: async (input, init) => {
        const sending = isSend(input, init);
        const answer = await fetch(input, init);
        // The room has answered; the activation takes effect before the CLI reads anything more.
        if (!changed && sending) {
          changed = true;
          await h.room.activate(acts("Begin a tune"));
        }
        return answer;
      },
    });
    expect(out.code).toBe(0);
    expect(changed).toBe(true);
    expect(h.room.policies.at(-1)!.acts!["start-song"]!.label).toBe("Begin a tune");
    const lines = out.out.split("\n");
    expect(lines[0]).toMatch(/^Done: Start a song \(start-song\), recorded as act_\d+_[0-9a-f]{8}\.$/);
    expect(lines[1]).toMatch(THREAD("Start a song: Footprints"));
  });

  test("the words are read once, after the answer, at the record's seq; --json prints the record and reads no words", async () => {
    const { home, argv } = await ready();
    const reads: (string | null)[] = [];
    const watch = { fetch: ((input, init) => (reads.push(declarationsRead(input)), fetch(input, init))) as Fetch };
    const out = await cli(home, argv(), h.tmp, watch);
    expect(out.code).toBe(0);
    const seq = songs()[0]!.seq;
    // One read of the active declarations to prepare the act, then one of the declarations at its seq.
    expect(reads.filter((r) => r !== null)).toEqual(["", `?at=${seq}`]);
    reads.length = 0;
    const json = await cli(home, ["act", "start-song", "--binding", (await h.room.bindingOf("start-song"))!, "--set", "key=d", "--set", "title=So What", "--set", "scope=songs/so-what/**", "--json"], h.tmp, watch);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.out)).toMatchObject({ kind: "start-song", seq: songs()[1]!.seq });
    expect(reads.filter((r) => r !== null)).toEqual([""]);
  });
});

describe("the words cannot be read: the receipt is still given (R-DECL-23, R-IDEM-2)", () => {
  const refuse = (match: (search: string) => boolean): Fetch => async (input, init) => {
    const read = declarationsRead(input);
    if (read !== null && match(read)) return new Response(JSON.stringify({ name: "ArtroomError", code: "unauthenticated", message: "The session ended.", retryable: false }), { status: 401, headers: { "content-type": "application/json" } });
    return fetch(input, init);
  };

  test("a failed read after the answer leaves the act done: the kind and the thread's ID are printed, and nothing is sent again", async () => {
    const { home, argv } = await ready();
    const out = await cli(home, argv("--idempotency-key", "song-once"), h.tmp, { fetch: refuse((search) => search.startsWith("?at=")) });
    expect(out.code).toBe(0);
    expect(songs()).toHaveLength(1);
    const id = /recorded as (act_\d+_[0-9a-f]{8})\.$/m.exec(out.out)![1]!;
    expect(out.out.split("\n")).toEqual([`Done: start-song, recorded as ${id}.`, `Thread: ${id} (lane ${id}).`]);
    expect(out.err).toBe("");
    // The command is finished: the same command again is the same act to the room, and its original record.
    const again = await cli(home, argv("--idempotency-key", "song-once", "--json"));
    expect(JSON.parse(again.out)).toMatchObject({ id });
    expect(songs()).toHaveLength(1);
  });

  test("a room that has no declarations to give for that seq: the kind is printed, never the latest label", async () => {
    const { home, argv } = await ready();
    let changed = false;
    const out = await cli(home, argv(), h.tmp, {
      fetch: async (input, init) => {
        const read = declarationsRead(input);
        // The answer "there is none" for the record's seq, while the active label has become another.
        if (read !== null && read.startsWith("?at=")) return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
        const sending = isSend(input, init);
        const answer = await fetch(input, init);
        if (!changed && sending) {
          changed = true;
          await h.room.activate(acts("Begin a tune"));
        }
        return answer;
      },
    });
    expect(out.code).toBe(0);
    const id = /recorded as (act_\d+_[0-9a-f]{8})\.$/m.exec(out.out)![1]!;
    expect(out.out.split("\n")).toEqual([`Done: start-song, recorded as ${id}.`, `Thread: ${id} (lane ${id}).`]);
  });

  test("a thread that has a goal is named by it, with or without the words", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    await h.room.activate(acts("Start a song"));
    const out = await cli(home, ["act", "claim", "--binding", (await h.room.bindingOf("claim"))!, "--set", "goal=Rate-limit login", "--set", "scope=src/**"], h.tmp, { fetch: refuse((search) => search.startsWith("?at=")) });
    expect(out.code).toBe(0);
    expect(out.out.split("\n")[0]).toMatch(/^Done: claim, recorded as act_\d+_[0-9a-f]{8}\.$/);
    expect(out.out.split("\n")[1]).toMatch(THREAD("Rate-limit login"));
  });
});

describe("an act finished from the journal is printed as a new one is (R-IDEM-2, R-DECL-23)", () => {
  /** The answer to the act is lost four times, so the first command fails with the act recorded; the second finishes it. */
  async function lostThenFinished(between: () => Promise<void>, extra: (sent: string[], reads: string[]) => Fetch) {
    const { home, binding, argv } = await ready();
    const sent: string[] = [];
    const reads: string[] = [];
    const watch: Fetch = (input, init) => {
      if (isSend(input, init)) sent.push(String(init!.body));
      return fetch(input, init);
    };
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    const first = await cli(home, argv("--idempotency-key", "song-once"), h.tmp, { fetch: watch });
    expect(first.code).toBe(1);
    expect(first.err).toContain("--idempotency-key song-once");
    expect(songs()).toHaveLength(1);
    await between();
    const finished = await cli(home, argv("--idempotency-key", "song-once"), h.tmp, { fetch: extra(sent, reads) });
    return { finished, sent, reads, binding, seq: songs()[0]!.seq };
  }
  const counting = (sent: string[], reads: string[]): Fetch => (input, init) => {
    if (isSend(input, init)) sent.push(String(init!.body));
    const read = declarationsRead(input);
    if (read !== null) reads.push(read);
    return fetch(input, init);
  };

  test("the saved act goes back unchanged, and the receipt has the label and the thread's name from the body the journal kept", async () => {
    const { finished, sent, reads, binding, seq } = await lostThenFinished(async () => {}, counting);
    expect(finished.code).toBe(0);
    const lines = finished.out.split("\n");
    expect(lines[0]).toMatch(new RegExp(`^Done: Start a song \\(start-song\\), recorded as act_${seq}_[0-9a-f]{8}\\.$`));
    expect(lines[1]).toMatch(THREAD("Start a song: Footprints"));
    // Five sends of the same bytes, one act, one thread.
    expect(sent).toHaveLength(5);
    expect(new Set(sent).size).toBe(1);
    expect(JSON.parse(sent[0]!).envelope).toMatchObject({ kind: "start-song", binding, body: { key: "c", title: "Footprints" }, idempotencyKey: "song-once" });
    expect(songs()).toHaveLength(1);
    expect(h.room.lanes.size).toBe(1);
    // Finishing read nothing to prepare the act again: no active declarations. Its one read is of the record's seq.
    expect(reads).toEqual([`?at=${seq}`]);
  });

  test("after a later label-only activation the finished act still has the label it was admitted under", async () => {
    const { finished, sent, reads, seq } = await lostThenFinished(async () => void (await h.room.activate(acts("Begin a tune"))), counting);
    expect(finished.code).toBe(0);
    expect(h.room.policies.at(-1)!.acts!["start-song"]!.label).toBe("Begin a tune");
    const lines = finished.out.split("\n");
    expect(lines[0]).toMatch(/^Done: Start a song \(start-song\), recorded as /);
    expect(lines[1]).toMatch(THREAD("Start a song: Footprints"));
    expect(new Set(sent).size).toBe(1);
    expect(songs()).toHaveLength(1);
    expect(reads).toEqual([`?at=${seq}`]);
  });

  test("when no session can be opened to read the words, the saved act is still finished and its receipt given", async () => {
    // Every read session is refused on the finishing run: the signed act needs none (R-IDEM-2); the words do.
    const noSession = (sent: string[], reads: string[]): Fetch => (input, init) => {
      const url = new URL(String(input));
      if (isSend(input, init)) sent.push(String(init!.body));
      if (init?.method === "POST" && url.pathname.endsWith("/requests"))
        return Promise.resolve(new Response(JSON.stringify({ name: "ArtroomError", code: "unauthenticated", message: "The key is no longer a member's.", retryable: false }), { status: 401, headers: { "content-type": "application/json" } }));
      const read = declarationsRead(input);
      if (read !== null) reads.push(read);
      return fetch(input, init);
    };
    const { finished, sent, reads, seq } = await lostThenFinished(async () => {}, noSession);
    expect(finished.code).toBe(0);
    const id = new RegExp(`recorded as (act_${seq}_[0-9a-f]{8})\\.$`, "m").exec(finished.out)![1]!;
    expect(finished.out.split("\n")).toEqual([`Done: start-song, recorded as ${id}.`, `Thread: ${id} (lane ${id}).`]);
    expect(new Set(sent).size).toBe(1);
    expect(songs()).toHaveLength(1);
    expect(reads).toEqual([]);
    // The journal holds nothing more for that key.
    const again = await cli(join(h.tmp, "alice"), ["act", "start-song", "--binding", (await h.room.bindingOf("start-song"))!, "--set", "key=c", "--set", "title=Footprints", "--set", "scope=songs/footprints/**", "--idempotency-key", "song-once", "--json"]);
    expect(JSON.parse(again.out)).toMatchObject({ id });
    expect(songs()).toHaveLength(1);
  });
});
