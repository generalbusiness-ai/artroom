/**
 * Declared acts stage 5, the CLI (request a5d64b35): a saved act finished
 * by a command line that names another kind.
 *
 * A journal entry of `artroom act` is found by its idempotency key and the
 * command `act`, not by the kind. A run that names the key again finishes
 * the saved act, with the saved bytes, whatever kind it names (R-IDEM-2).
 * So the receipt is in the words of the act as recorded, its own kind under
 * the declarations of its own seq (R-DECL-23), and the run is told which act
 * it finished. Both reviewers reproduced the earlier behaviour at c74f3696:
 * the receipt named the kind typed on the finishing run.
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

const OPENING = (label: string, max = 80): ActDeclaration => ({
  label,
  targets: { none: ["open"] },
  body: { key: { type: "enum", values: ["c", "d"] }, title: { type: "text", max } },
  who: { roles: ["member"] },
  hold: { scope: "body.scope", workspace: true },
});
const acts = (songMax = 80) => ({ ...CODE_REVIEW_ACTS, "start-song": OPENING("Start a song", songMax), "start-tune": OPENING("Begin a different tune") });
const ofKind = (kind: string) => h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === kind);
const THREAD = (words: string) => new RegExp(`^Thread: ${words} \\(lane act_\\d+_[0-9a-f]{8}\\)\\.$`);
const TOLD = "This idempotency key belongs to a saved start-song act. That act was sent again as it was saved; no start-tune act was made.";

type Fetch = typeof fetch;
const isSend = (input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]) => init?.method === "POST" && new URL(String(input)).pathname.endsWith("/acts");

/** A member logged in, a room that declares both kinds, and a command line for each. */
async function ready() {
  const home = join(h.tmp, "alice");
  await login(home, "@alice");
  await h.room.activate(acts());
  const song = (await h.room.bindingOf("start-song"))!;
  const tune = (await h.room.bindingOf("start-tune"))!;
  const args = (kind: string, binding: string, title: string, ...more: string[]) => ["act", kind, "--binding", binding, "--set", "key=c", "--set", `title=${title}`, "--set", "scope=songs/footprints/**", "--idempotency-key", "song-once", ...more];
  return { home, song, tune, args };
}

const counting = (sent: string[]): Fetch => (input, init) => {
  if (isSend(input, init)) sent.push(String(init!.body));
  return fetch(input, init);
};

/** `start-song` is recorded but its answer is lost four times; then `finish` runs with the same key, through `wrap`. */
async function lostThenFinished(finish: (r: Awaited<ReturnType<typeof ready>>) => string[], wrap: (sent: string[]) => Fetch = counting) {
  const r = await ready();
  const sent: string[] = [];
  h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
  const first = await cli(r.home, r.args("start-song", r.song, "Footprints"), h.tmp, { fetch: counting(sent) });
  expect(first.code).toBe(1);
  expect(ofKind("start-song")).toHaveLength(1);
  const finished = await cli(r.home, finish(r), h.tmp, { fetch: wrap(sent) });
  return { ...r, finished, sent, seq: ofKind("start-song")[0]!.seq };
}

describe("a saved act finished by a run that names another kind is printed as the saved act (R-IDEM-2, R-DECL-23)", () => {
  test("the receipt has the saved act's label, kind and thread name, and the run is told which act it finished", async () => {
    const { finished, sent, song, seq } = await lostThenFinished((r) => r.args("start-tune", r.tune, "So What"));
    expect(finished.code).toBe(0);
    const lines = finished.out.split("\n");
    expect(lines[0]).toMatch(new RegExp(`^Done: Start a song \\(start-song\\), recorded as act_${seq}_[0-9a-f]{8}\\.$`));
    expect(lines[1]).toMatch(THREAD("Start a song: Footprints"));
    expect(finished.out).not.toContain("tune");
    expect(finished.err.split("\n")).toContain(TOLD);
    // The saved bytes went back unchanged: five sends, one act, one thread, and no act of the kind typed.
    expect(sent).toHaveLength(5);
    expect(new Set(sent).size).toBe(1);
    expect(JSON.parse(sent[0]!).envelope).toMatchObject({ kind: "start-song", binding: song, body: { key: "c", title: "Footprints" }, idempotencyKey: "song-once" });
    expect(ofKind("start-song")).toHaveLength(1);
    expect(ofKind("start-tune")).toHaveLength(0);
    expect(h.room.lanes.size).toBe(1);
  });

  test("when the words cannot be read, the receipt names the saved act's kind, not the kind typed, and the run is still told", async () => {
    // Every read session is refused on the finishing run: the signed act needs none (R-IDEM-2); the words do.
    const noSession = (sent: string[]): Fetch => (input, init) => {
      if (isSend(input, init)) sent.push(String(init!.body));
      if (init?.method === "POST" && new URL(String(input)).pathname.endsWith("/requests"))
        return Promise.resolve(new Response(JSON.stringify({ name: "ArtroomError", code: "unauthenticated", message: "The key is no longer a member's.", retryable: false }), { status: 401, headers: { "content-type": "application/json" } }));
      return fetch(input, init);
    };
    const { finished, sent, seq } = await lostThenFinished((r) => r.args("start-tune", r.tune, "So What"), noSession);
    expect(finished.code).toBe(0);
    const id = new RegExp(`recorded as (act_${seq}_[0-9a-f]{8})\\.$`, "m").exec(finished.out)![1]!;
    expect(finished.out.split("\n")).toEqual([`Done: start-song, recorded as ${id}.`, `Thread: ${id} (lane ${id}).`]);
    expect(finished.err.split("\n")).toContain(TOLD);
    expect(new Set(sent).size).toBe(1);
    expect(ofKind("start-tune")).toHaveLength(0);
  });

  test("with --json the record is the saved act's, and the run is told on the error stream", async () => {
    const { finished, seq } = await lostThenFinished((r) => r.args("start-tune", r.tune, "So What", "--json"));
    expect(finished.code).toBe(0);
    expect(JSON.parse(finished.out)).toMatchObject({ kind: "start-song", seq });
    expect(finished.err.split("\n")).toContain(TOLD);
  });

  test("control: the same kind with another body finishes the saved act with the saved body, and nothing more is said", async () => {
    const { finished, sent, seq } = await lostThenFinished((r) => r.args("start-song", r.song, "So What"));
    expect(finished.code).toBe(0);
    const lines = finished.out.split("\n");
    expect(lines[0]).toMatch(new RegExp(`^Done: Start a song \\(start-song\\), recorded as act_${seq}_[0-9a-f]{8}\\.$`));
    expect(lines[1]).toMatch(THREAD("Start a song: Footprints"));
    expect(finished.err).not.toContain("saved");
    expect(new Set(sent).size).toBe(1);
    expect(ofKind("start-song")).toHaveLength(1);
  });

  test("control: a new act of the other kind, under its own key, is that kind's, and nothing more is said", async () => {
    const r = await ready();
    const out = await cli(r.home, [...r.args("start-tune", r.tune, "So What").slice(0, -2), "--idempotency-key", "tune-once"]);
    expect(out.code).toBe(0);
    expect(out.out.split("\n")[0]).toMatch(/^Done: Begin a different tune \(start-tune\), recorded as /);
    expect(out.out.split("\n")[1]).toMatch(THREAD("Begin a different tune: So What"));
    expect(out.err).not.toContain("saved");
  });
});

describe("a saved act that the room refuses when it is sent again is explained as the saved act (R-DECL-16)", () => {
  test("the saved act's meaning changed before it reached the room: the refusal's explanation is of the saved kind and the binding it was prepared under", async () => {
    const r = await ready();
    // The room is not reached at all: the act is saved, and not recorded.
    h.room.faults.push({ route: "POST /acts", kind: "status", status: 503, body: { name: "ArtroomError", code: "unavailable", message: "no", retryable: false }, times: 5 });
    const first = await cli(r.home, r.args("start-song", r.song, "Footprints"));
    expect(first.code).not.toBe(0);
    expect(ofKind("start-song")).toHaveLength(0);
    h.room.faults.length = 0;
    // The meaning of start-song changes; start-tune's does not.
    await h.room.activate(acts(40));
    const now = (await h.room.bindingOf("start-song"))!;
    expect(now).not.toBe(r.song);
    expect(await h.room.bindingOf("start-tune")).toBe(r.tune);
    const finished = await cli(r.home, r.args("start-tune", r.tune, "So What"));
    expect(finished.code).toBe(3);
    const err = finished.err.split("\n");
    expect(err).toContain(TOLD);
    expect(err).toContain("Refused: binding-stale");
    expect(finished.err).toContain(`  Active binding: ${now}, in policy version `);
    expect(finished.err).toMatch(/ {2}Nothing was done\. In policy version act_\d+_[0-9a-f]{8}, start-song now means:/);
    expect(finished.err).not.toContain("start-tune now means");
    // The change is listed from the meaning the saved act was prepared under, found by the saved binding.
    expect(finished.err).toContain("  What changed since the meaning you read:");
    expect(finished.err).toContain(`  If this is still what you intend, act under it: artroom act start-song --binding ${now} …`);
    expect(ofKind("start-song")).toHaveLength(0);
    expect(ofKind("start-tune")).toHaveLength(0);
  });
});
