/**
 * Declared acts in the CLI (request a5d64b35; docs/protocol.md section
 * 33.10): `artroom acts` and `artroom act`, the journal, and the words a
 * recorded act is printed in.
 *
 * - `artroom act` signs under the binding the user gives, never one it read
 *   for them (R-DECL-16), and a changed meaning is shown, never adopted.
 * - A receipt is in the words of the declarations in force at the act's own
 *   seq, D(seq) (R-DECL-23): not those read while the act was prepared, and
 *   not the latest. The read is for display only: when it fails, the receipt
 *   is still given, with the kind and the thread's ID in place of the words
 *   (the checker's act 0b9119de and the planner's acts b22d29ee, 23ae8924
 *   and c6f6ad78).
 * - A run that finishes a saved act finishes that act, with the saved bytes,
 *   whatever kind its command line names (R-IDEM-2). The receipt names the
 *   saved act's own kind and label, and the run is told which act it
 *   finished (both reviewers reproduced the earlier behaviour at c74f3696).
 *
 * The room is the fake room over its local HTTPS routes, in its declared
 * mode. Nothing here shows a real Room's admission: that is tested in
 * packages/room.
 */

import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ActDeclaration } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { explainText, refusalText } from "../src/format.ts";
import { FieldError, meaningChanges, missing, parseValue } from "../src/declared.ts";
import { invitationLink } from "../src/link.ts";
import { crashAt, useHarness } from "./harness.ts";

const { h, cli, login, acts: recorded } = useHarness();

type Fetch = typeof fetch;
const isSend = (input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]) => init?.method === "POST" && new URL(String(input)).pathname.endsWith("/acts");
/** The query of a read of the declarations, or null for any other request. */
const declarationsRead = (input: Parameters<Fetch>[0]) => {
  const url = new URL(String(input));
  return url.pathname.endsWith("/declarations") ? url.search : null;
};
const THREAD = (words: string) => new RegExp(`^Thread: ${words} \\(lane act_\\d+_[0-9a-f]{8}\\)\\.$`);
/** The room answers that the session ended, and must not be asked again in this run. */
const SESSION_ENDED = () => new Response(JSON.stringify({ name: "ArtroomError", code: "unauthenticated", message: "The session ended.", retryable: false }), { status: 401, headers: { "content-type": "application/json" } });

const ASK: ActDeclaration = {
  label: "Ask",
  targets: { entry: ["comment"] },
  body: { text: { type: "text", max: 200 }, urgency: { type: "enum", values: ["low", "high"], optional: true }, count: { type: "int", min: 1, max: 9, optional: true } },
  who: { roles: ["member", "agent"] },
  help: "Ask a question about an entry.",
};
const withAsk = (ask: ActDeclaration = ASK) => ({ ...CODE_REVIEW_ACTS, ask });
const posts = (route: string) => h.room.requests.filter((r) => r.method === "POST" && r.route === route).length;

/** A member logged in, a v2 room that declares `ask`, an entry to ask about, and `ask`'s binding. */
async function ready(ask: ActDeclaration = ASK) {
  const alice = join(h.tmp, "alice");
  await login(alice, "@alice");
  await h.room.activate(withAsk(ask));
  const claim = JSON.parse((await cli(alice, ["claim", "src/**", "--goal", "g", "--json"])).out) as { id: string; lane: string };
  const binding = (await h.room.bindingOf("ask"))!;
  return { alice, claim, binding };
}

describe("artroom acts: what the room declares", () => {
  test("a v1 room says it declares none, and names the commands to use", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const res = await cli(alice, ["acts"]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/is the legacy vocabulary: this room declares no acts of its own\./);
    expect(res.out).toContain("claim, propose, note, review, land, release, renew");
    expect(JSON.parse((await cli(alice, ["acts", "--json"])).out)).toMatchObject({ vocabulary: "artroom-legacy-v1", since: 0, until: null });
  });

  test("a v2 room lists each kind with its label and steps; acts KIND prints its fields, who may sign it, its binding and the command", async () => {
    const { alice, binding } = await ready();
    const all = await cli(alice, ["acts"]);
    expect(all.code).toBe(0);
    expect(all.out).toMatch(/, active, declares 8 acts:/);
    expect(all.out).toMatch(/^ {2}ask {5,}Ask {2}\[entry: comment\]$/m);
    expect(all.out).toMatch(/^ {2}claim +Claim {2}\[none: open; thread: take\]$/m);
    const one = await cli(alice, ["acts", "ask"]);
    expect(one.code).toBe(0);
    expect(one.out.split("\n")).toEqual([
      "ask: Ask",
      "  Ask a question about an entry.",
      "  Who may sign it: admin, member, agent.",
      "  On target entry (--entry ACT): comment",
      "    replyTo: an entry ID, optional (the comment step's)",
      "    text: text, up to 200 bytes",
      "    urgency: one of low, high, optional",
      "    count: whole number, 1 to 9, optional",
      `  Binding: ${binding}`,
      expect.stringMatching(/^ {2}Policy version: act_\d+_[0-9a-f]{8}$/),
      `To do it: artroom act ask --binding ${binding} [target] --set FIELD=VALUE …`,
    ]);
    const claim = await cli(alice, ["acts", "claim"]);
    expect(claim.out).toContain("  Opens a thread: scope from --set scope=…; lease the room's lease.");
    expect(claim.out).toContain("  On target none (no target): open");
    expect(claim.out).toContain("    goal: text, up to 1024 bytes");
    expect(claim.out).toContain("  On target thread (--lane LANE): take");
    // JSON is the declaration and binding themselves.
    expect(JSON.parse((await cli(alice, ["acts", "ask", "--json"])).out)).toMatchObject({ kind: "ask", binding, declaration: { label: "Ask" }, until: null });
    const none = await cli(alice, ["acts", "shout"]);
    expect(none.code).toBe(1);
    expect(none.err).toContain("shout is not declared in policy version");
  });

  test("--at and --policy read an earlier version; an unknown one fails; both together are a usage error", async () => {
    const { alice } = await ready();
    const first = h.room.policies[1]!;
    await h.room.activate({ ...CODE_REVIEW_ACTS });
    const then = await cli(alice, ["acts", "--at", String(first.since)]);
    expect(then.out).toMatch(new RegExp(`in force for seq ${first.since} to \\d+, declares 8 acts:`));
    expect(then.out).toMatch(/ask +Ask \(retired at seq \d+\)/);
    expect((await cli(alice, ["acts", "--policy", first.policy])).out).toBe(then.out);
    expect((await cli(alice, ["acts"])).out).not.toContain("ask");
    expect((await cli(alice, ["acts", "--policy", "act_999_00000000"])).code).toBe(1);
    expect((await cli(alice, ["acts", "--at", "1", "--policy", first.policy])).code).toBe(2);
  });
});

describe("artroom act: any declared act, under the binding the user read", () => {
  test("it sends the kind, target, typed fields and binding as given, and prints the label", async () => {
    const { alice, claim, binding } = await ready();
    const res = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=Why this scope?", "--set", "urgency=high", "--set", "count=3"]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^Done: Ask \(ask\), recorded as act_\d+_[0-9a-f]{8}\.$/);
    const last = h.room.entries.at(-1)!;
    expect(last.entry.type === "act" && last.entry.act.envelope).toMatchObject({ v: 2, kind: "ask", binding, target: { act: claim.id }, body: { text: "Why this scope?", urgency: "high", count: 3 } });
    // JSON output is the record.
    const json = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=again", "--json"]);
    expect(JSON.parse(json.out)).toMatchObject({ kind: "ask", text: "again" });
  });

  test("an act that opens a thread names it as every reader does: its goal, or the act's label and first text field by name", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const song: ActDeclaration = { label: "Start a song", targets: { none: ["open"] }, body: { key: { type: "enum", values: ["c", "d"], optional: true }, title: { type: "text", max: 80 }, year: { type: "text", max: 4, optional: true } }, who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } };
    await h.room.activate({ ...CODE_REVIEW_ACTS, "start-song": song });
    const res = await cli(alice, ["act", "start-song", "--binding", (await h.room.bindingOf("start-song"))!, "--set", "year=1963", "--set", "title=Blue Bossa", "--set", "scope=songs/blue-bossa/**"]);
    expect(res.code).toBe(0);
    const id = /recorded as (act_\d+_[0-9a-f]{8})\.$/m.exec(res.out)![1]!;
    expect(res.out.split("\n")).toEqual([`Done: Start a song (start-song), recorded as ${id}.`, `Thread: Start a song: Blue Bossa (lane ${id}).`]);
    // `key` comes first by name, but it is an enum: the thread is named by its first text field, the title.
    const keyed = await cli(alice, ["act", "start-song", "--binding", (await h.room.bindingOf("start-song"))!, "--set", "key=d", "--set", "title=So What", "--set", "scope=songs/so-what/**"]);
    expect(keyed.out.split("\n")[1]).toMatch(/^Thread: Start a song: So What \(lane act_\d+_[0-9a-f]{8}\)\.$/);
    // A thread that has a goal is named by it.
    const claim = await cli(alice, ["act", "claim", "--binding", (await h.room.bindingOf("claim"))!, "--set", "goal=Rate-limit login", "--set", "scope=src/**"]);
    expect(claim.out.split("\n")[1]).toMatch(/^Thread: Rate-limit login \(lane act_\d+_[0-9a-f]{8}\)\.$/);
    // An act that opens nothing prints no thread line.
    const ask = await cli(alice, ["act", "note", "--binding", (await h.room.bindingOf("note"))!, "--entry", id, "--set", "text=Nice"]);
    expect(ask.out).toMatch(/^Done: Note \(note\), recorded as act_\d+_[0-9a-f]{8}\.$/);
  });

  test("without --binding, or with a malformed one, nothing is read or sent: the CLI never chooses the meaning", async () => {
    const { alice, claim } = await ready();
    const before = h.room.requests.length;
    const none = await cli(alice, ["act", "ask", "--entry", claim.id, "--set", "text=x"]);
    expect(none.code).toBe(2);
    expect(none.err).toContain("Give the binding of the meaning you read");
    expect(none.err).toContain("artroom acts ask");
    const short = await cli(alice, ["act", "ask", "--binding", "sha256:abc", "--entry", claim.id, "--set", "text=x"]);
    expect(short.code).toBe(2);
    expect((await cli(alice, ["act"])).code).toBe(2);
    expect(h.room.requests.length).toBe(before);
  });

  test("fields are read by their declared types; an unknown field, a bad value, a missing field or a wrong target is a usage error and nothing is sent", async () => {
    const { alice, claim, binding } = await ready();
    const sent = posts("/acts");
    const base = ["act", "ask", "--binding", binding, "--entry", claim.id];
    const bad = async (...more: string[]) => {
      const res = await cli(alice, [...base, ...more]);
      expect(res.code, more.join(" ")).toBe(2);
      return res.err;
    };
    expect(await bad("--set", "text=x", "--set", "urgency=urgent")).toContain("urgency takes one of low, high");
    expect(await bad("--set", "text=x", "--set", "count=ten")).toContain("count takes whole number, 1 to 9");
    expect(await bad("--set", "text=x", "--set", "count=12")).toContain("count takes whole number, 1 to 9");
    expect(await bad("--set", "text=x", "--set", "colour=red")).toContain("colour is not a field of this act on this target. Its fields are: replyTo, text, urgency, count.");
    expect(await bad("--set", "urgency=low")).toContain("ask on target entry also needs: --set text=…");
    expect(await bad("--set", "text")).toContain("--set takes NAME=VALUE");
    expect(await bad("--body", "[1]")).toContain("--body takes a JSON object");
    expect(await bad("--body", '{"colour":"red","text":"x"}')).toContain("colour is not a field");
    const wrong = await cli(alice, ["act", "ask", "--binding", binding, "--lane", claim.lane, "--set", "text=x"]);
    expect(wrong.code).toBe(2);
    expect(wrong.err).toContain("ask does not act on that target. It takes: entry.");
    expect(posts("/acts")).toBe(sent);
    // --body gives fields as JSON; --set adds to it.
    const ok = await cli(alice, [...base, "--body", '{"text":"from json"}', "--set", "urgency=low"]);
    expect(ok.code).toBe(0);
    const last = h.room.entries.at(-1)!;
    expect(last.entry.type === "act" && last.entry.act.envelope.body).toEqual({ text: "from json", urgency: "low" });
  });

  test("a yes-or-no field takes true or false and nothing else", () => {
    const flag = { name: "swing", from: "declaration", required: false, field: { type: "bool" } } as const;
    expect(parseValue(flag, "true")).toBe(true);
    expect(parseValue(flag, "false")).toBe(false);
    for (const bad of ["yes", "1", "", "TRUE"]) expect(() => parseValue(flag, bad), bad).toThrow(FieldError);
  });

  test("a field named like an inherited property is the body's own or it is missing; a change of such a field is listed as one", () => {
    const named = (name: string) => ({ name, from: "declaration" as const, required: true, field: { type: "text" as const, max: 5 } });
    expect(missing([named("constructor"), named("toString"), named("text")], { text: "x" })).toEqual(["constructor", "toString"]);
    expect(missing([named("constructor"), named("toString")], { constructor: "a", toString: "b" } as never)).toEqual([]);
    const plain: ActDeclaration = { ...ASK, body: { text: { type: "text", max: 200 } } };
    const odd: ActDeclaration = { ...ASK, body: { text: { type: "text", max: 200 }, toString: { type: "text" as const, max: 5 }, constructor: { type: "text" as const, max: 5 } } };
    expect(meaningChanges(plain, odd)).toEqual(["Field toString: new.", "Field constructor: new."]);
    expect(meaningChanges(odd, plain)).toEqual(["Field toString: removed.", "Field constructor: removed."]);
  });

  test("only a step's own field is read from the room: a field the declaration names expectedGeneration is the application's and is left alone", async () => {
    const { alice, claim } = await ready();
    const wrap: ActDeclaration = { label: "Wrap", targets: { thread: ["release"] }, threads: ["claim"], body: { expectedGeneration: { type: "int", min: 0, max: 99, optional: true } }, who: { roles: ["member"] } };
    await h.room.activate({ ...withAsk(), wrap });
    const res = await cli(alice, ["act", "wrap", "--binding", (await h.room.bindingOf("wrap"))!, "--lane", claim.lane]);
    expect(res.code).toBe(0);
    const last = h.room.entries.at(-1)!;
    // The lease is the release step's field and is read for the user. The declared field was not given, so it is absent.
    expect(last.entry.type === "act" && last.entry.act.envelope.body).toEqual({ lease: 1 });
  });

  test("a kind the room does not declare is refused, and a v1 room has no generic act", async () => {
    const { alice, claim, binding } = await ready();
    const sent = posts("/acts");
    const res = await cli(alice, ["act", "shout", "--binding", binding, "--entry", claim.id, "--set", "text=x"]);
    expect(res.code).toBe(3);
    expect(res.err).toContain("Refused: kind-undeclared");
    expect(res.err).toContain("artroom acts");
    await h.room.activate(null);
    const legacy = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=x"]);
    expect(legacy.code).toBe(2);
    expect(legacy.err).toContain("This room declares no acts of its own");
    expect(posts("/acts")).toBe(sent);
  });

  test("the lease, the generation and a version's head are read from the room when left out, as the named commands read them", async () => {
    const { alice, claim } = await ready();
    const release = (await h.room.bindingOf("release"))!;
    const res = await cli(alice, ["act", "release", "--binding", release, "--lane", claim.lane, "--set", "note=done"]);
    expect(res.code).toBe(0);
    // One line: a release names a lane in its record, and it opened no thread.
    expect(res.out).toMatch(/^Done: Release \(release\), recorded as act_\d+_[0-9a-f]{8}\.$/);
    const last = h.room.entries.at(-1)!;
    expect(last.entry.type === "act" && last.entry.act.envelope).toMatchObject({ v: 2, kind: "release", binding: release, target: { lane: claim.lane }, body: { lease: 1, note: "done" } });
    // A version step: the lease and the lane's generation are read; the user gives the head and the summary.
    const second = JSON.parse((await cli(alice, ["claim", "docs/**", "--goal", "g2", "--json"])).out) as { lane: string };
    const propose = (await h.room.bindingOf("propose"))!;
    const head = "c".repeat(40);
    expect((await cli(alice, ["act", "propose", "--binding", propose, "--lane", second.lane, "--set", `head=${head}`, "--set", "summary=s"])).code).toBe(0);
    const proposed = h.room.entries.at(-1)!;
    expect(proposed.entry.type === "act" && proposed.entry.act.envelope).toMatchObject({ kind: "propose", target: { lane: second.lane }, body: { lease: 1, expectedGeneration: 0, head, summary: "s" } });
    // A review of that version: its head is read from the proposal.
    const review = (await h.room.bindingOf("review"))!;
    const bob = join(h.tmp, "bob");
    await login(bob, "@bob");
    const reviewed = await cli(bob, ["act", "review", "--binding", review, "--lane", second.lane, "--generation", "1", "--set", "verdict=approve", "--set", "scope=docs/**,src/**", "--set", "text=ok"]);
    expect(reviewed.code).toBe(0);
    const sealed = h.room.entries.at(-1)!;
    expect(sealed.entry.type === "act" && sealed.entry.act.envelope).toMatchObject({ kind: "review", target: { lane: second.lane, generation: 1 }, body: { head, verdict: "approve", scope: ["docs/**", "src/**"], text: "ok" } });
    // Someone who does not hold the lane is told so, and nothing is sent.
    const sent = posts("/acts");
    const not = await cli(bob, ["act", "release", "--binding", release, "--lane", claim.lane]);
    expect(not.code).toBe(3);
    expect(not.err).toContain("Refused: not-holder");
    expect(posts("/acts")).toBe(sent);
  });
});

describe("a changed meaning is shown, never adopted for the user", () => {
  const NARROW: ActDeclaration = { ...ASK, body: { text: { type: "text", max: 50 }, topic: { type: "segment" } } };

  test("the binding the user read is no longer active: nothing is signed; the CLI prints the active meaning, what changed, and the command to act under it", async () => {
    const { alice, claim, binding } = await ready();
    await h.room.activate(withAsk(NARROW));
    const now = (await h.room.bindingOf("ask"))!;
    const sent = posts("/acts");
    const entries = h.room.entries.length;
    const res = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=still?"]);
    expect(res.code).toBe(3);
    const err = res.err.split("\n");
    expect(err[0]).toBe("Refused: binding-stale");
    expect(res.err).toContain(`  Active binding: ${now}, in policy version `);
    expect(res.err).toContain("  Nothing was done. In policy version ");
    expect(res.err).toContain("      topic: one path segment");
    expect(res.err).toContain("  What changed since the meaning you read:");
    expect(res.err).toContain('    Field text: was {"type":"text","max":200}, now {"type":"text","max":50}.');
    expect(res.err).toContain("    Field urgency: removed.");
    expect(res.err).toContain("    Field topic: new.");
    expect(res.err).toContain(`  If this is still what you intend, act under it: artroom act ask --binding ${now} …`);
    expect(posts("/acts")).toBe(sent);
    expect(h.room.entries.length).toBe(entries);
    // JSON output is the refusal, with the active binding and policy version.
    const json = JSON.parse((await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=still?", "--json"])).out);
    expect(json).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: now } });
    // The user reads it and acts again, deliberately, with the new binding and the field it now needs.
    const again = await cli(alice, ["act", "ask", "--binding", now, "--entry", claim.id, "--set", "text=still?", "--set", "topic=scope"]);
    expect(again.code).toBe(0);
  });

  test("what changed is listed against the version that held the binding the user gave, not merely the one before; with none, the CLI says it cannot list it", async () => {
    const { alice, claim, binding } = await ready();
    // Two changes of meaning since the user read it.
    await h.room.activate(withAsk({ ...ASK, body: { ...ASK.body, text: { type: "text", max: 100 } } }));
    await h.room.activate(withAsk(NARROW));
    const res = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=still?"]);
    expect(res.code).toBe(3);
    expect(res.err).toContain('    Field text: was {"type":"text","max":200}, now {"type":"text","max":50}.');
    expect(res.err).not.toContain('"max":100');
    // A binding that no recent version gave for this kind.
    const never = await cli(alice, ["act", "ask", "--binding", `sha256:${"0".repeat(64)}`, "--entry", claim.id, "--set", "text=still?"]);
    expect(never.code).toBe(3);
    expect(never.err).toContain("  The meaning you read is not in the room's recent policy versions, so the change cannot be listed.");
    expect(never.err).not.toContain("What changed since the meaning you read");
  });

  test("the meaning changes between the read and the send: the room refuses, the act is not sent again, and the same help is printed", async () => {
    const { alice, claim, binding } = await ready();
    let changed = false;
    const res = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=x"], h.tmp, {
      fetch: async (input, init) => {
        if (!changed && init?.method === "POST" && String(input).endsWith("/acts")) {
          changed = true;
          await h.room.activate(withAsk(NARROW));
        }
        return fetch(input, init);
      },
    });
    expect(res.code).toBe(3);
    expect(res.err).toContain("Refused: binding-stale");
    expect(res.err).toContain("  What changed since the meaning you read:");
    expect(h.room.requests.filter((r) => r.method === "POST" && r.route === "/acts")).toHaveLength(2); // the claim, and this act once
    expect(h.room.entries.filter((e) => e.entry.type !== "system" && (e.entry.act.envelope.kind as string) === "ask")).toHaveLength(0);
  });

  test("a label-only edit is not a change of meaning: the act prepared before it is done, and nothing is listed as changed", async () => {
    const { alice, claim, binding } = await ready();
    await h.room.activate(withAsk({ ...ASK, label: "Question", help: "Ask anything." }));
    expect(await h.room.bindingOf("ask")).toBe(binding);
    const res = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=same"]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^Done: Question \(ask\)/);
    expect(meaningChanges(ASK, { ...ASK, label: "Question", help: "Ask anything.", who: { roles: ["agent"] } })).toEqual([]);
    expect(meaningChanges(ASK, { ...ASK, targets: { entry: ["comment"], line: ["comment"] }, threads: ["claim"] })).toEqual([
      "Targets and steps: was [entry: comment], now [entry: comment; line: comment].",
      "Threads it acts on: was none, now claim.",
    ]);
    expect(meaningChanges(CODE_REVIEW_ACTS["claim"]!, { ...CODE_REVIEW_ACTS["claim"]!, hold: { scope: "body.scope", workspace: true, leaseSeconds: 600 } })).toEqual([
      'Hold: was {"scope":"body.scope","workspace":true}, now {"scope":"body.scope","workspace":true,"leaseSeconds":600}.',
    ]);
  });
});

describe("the journal keeps the binding: a lost answer is finished with the same bytes", () => {
  test("an act whose answer was lost is resent unchanged with its key, also after the meaning changed, and returns the original record", async () => {
    const { alice, claim, binding } = await ready();
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
    const lost = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=once", "--idempotency-key", "ask-once"]);
    expect(lost.code).toBe(1);
    expect(lost.err).toContain("--idempotency-key ask-once");
    const recorded = h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask");
    expect(recorded).toHaveLength(1);
    // The meaning changes before the user finishes the command.
    await h.room.activate(withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    const reads: string[] = [];
    const again = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=once", "--idempotency-key", "ask-once"], h.tmp, {
      fetch: (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/declarations")) reads.push(url.search);
        return fetch(input, init);
      },
    });
    expect(again.code).toBe(0);
    expect(again.out).toContain(`recorded as act_${recorded[0]!.seq}_`);
    // The journaled act went back as it was: no read of the active declarations, no new signature, no second entry.
    // The one read is made after the answer, of the declarations at the record's own seq, for the words printed.
    expect(reads).toEqual([`?at=${recorded[0]!.seq}`]);
    expect(h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask")).toHaveLength(1);
    // A new act under that binding is stale now.
    expect((await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=twice"])).code).toBe(3);
  });
});

describe("a bearer session: the generic act goes to the MCP endpoint", () => {
  test("artroom act under a room-custody token calls the act tool with the binding given; the room signs under the session's grant", async () => {
    await h.room.activate(withAsk());
    const binding = (await h.room.bindingOf("ask"))!;
    const agent = join(h.tmp, "agent");
    const { invitation, secret } = await h.room.invite("@agent", { role: "agent", custody: "room", kinds: [], acts: { ask: binding, claim: (await h.room.bindingOf("claim"))! } });
    expect((await cli(agent, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)])).code).toBe(0);
    const claim = JSON.parse((await cli(agent, ["claim", "src/**", "--goal", "g", "--json"])).out) as { id: string };
    const sent = posts("/acts");
    const res = await cli(agent, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=from an agent"]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^Done: Ask \(ask\)/);
    expect(posts("/acts")).toBe(sent);
    const last = h.room.entries.at(-1)!;
    expect(last.entry.type === "act" && last.entry.act.envelope).toMatchObject({ v: 2, kind: "ask", binding });
    expect(last.entry.type === "act" && last.entry.receipt.authority).toMatchObject({ via: "delegation", member: "@agent" });
    // A kind the session's grant does not name is refused by the room.
    const note = (await h.room.bindingOf("note"))!;
    const out = await cli(agent, ["act", "note", "--binding", note, "--entry", claim.id, "--set", "text=x"]);
    expect(out.code).toBe(3);
    expect(out.err).toContain("Refused: delegation-invalid");
  });
});

describe("the log and explain show the label a kind had at the record's own seq", () => {
  test("legacy records print as before; a declared record prints its label; a retired kind says where; a reused name keeps the old label on old records", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const legacy = JSON.parse((await cli(alice, ["claim", "docs/**", "--goal", "g", "--json"])).out) as { id: string; seq: number };
    await h.room.activate(withAsk());
    const b1 = (await h.room.bindingOf("ask"))!;
    expect((await cli(alice, ["act", "ask", "--binding", b1, "--entry", legacy.id, "--set", "text=one"])).code).toBe(0);
    const retiredAt = h.room.entries.length;
    await h.room.activate({ ...CODE_REVIEW_ACTS });
    await h.room.activate(withAsk({ ...ASK, label: "Ask again", body: { text: { type: "text", max: 50 } } }));
    const b2 = (await h.room.bindingOf("ask"))!;
    expect((await cli(alice, ["act", "ask", "--binding", b2, "--entry", legacy.id, "--set", "text=two"])).code).toBe(0);
    const log = (await cli(alice, ["log"])).out.split("\n");
    expect(log.find((l) => l.includes(`act_${legacy.seq}_`))).toMatch(/ {2}claim by @alice$/);
    const asks = log.filter((l) => / ask \(/.test(l));
    expect(asks).toHaveLength(2);
    expect(asks[0]).toMatch(new RegExp(` {2}ask \\(Ask, retired at seq ${retiredAt}\\) by @alice$`));
    expect(asks[1]).toMatch(/ {2}ask \(Ask again\) by @alice$/);
  });

  test("explain prints the meaning the room gives for the record's seq; a refusal of a stale binding names the active one", () => {
    const entry = { seq: 7, entry: { type: "act", receipt: { authority: { via: "member", member: "@alice", role: "member" } } } } as never;
    const base = { act: "act_7_0a1b2c3d", kind: "ask", outcome: "accepted", entry, decisions: [], invariants: [], published: true } as const;
    const declared = { vocabulary: "declared", policy: "act_3_aaaaaaaa", kind: "ask", label: "Ask", declaration: ASK, binding: `sha256:${"b".repeat(64)}`, retired: 9 } as const;
    expect(explainText({ ...base, meaning: declared } as never).slice(0, 2)).toEqual([
      "act_7_0a1b2c3d: ask (Ask, retired at seq 9), accepted, published.",
      `Meaning: ask as declared in policy version act_3_aaaaaaaa, binding sha256:${"b".repeat(64)}.`,
    ]);
    // A legacy record, and a record with no meaning, print exactly as before.
    expect(explainText({ ...base, kind: "claim", meaning: { vocabulary: "artroom-legacy-v1", policy: "act_1_aaaaaaaa", kind: "claim", label: "Claim" } } as never)[0]).toBe("act_7_0a1b2c3d: claim, accepted, published.");
    expect(explainText({ ...base, kind: "claim" } as never)[0]).toBe("act_7_0a1b2c3d: claim, accepted, published.");
    expect(refusalText({ refused: true, rule: "binding-stale", reason: "r", fix: "f", current: { binding: `sha256:${"c".repeat(64)}`, policy: "act_5_bbbbbbbb" } })).toEqual([
      "Refused: binding-stale",
      "  Reason: r",
      "  Fix: f",
      `  Active binding: sha256:${"c".repeat(64)}, in policy version act_5_bbbbbbbb.`,
    ]);
  });
});

describe("the receipt of artroom act (the checker's act 0b9119de)", () => {
  const SONG: ActDeclaration = {
    label: "Start a song",
    targets: { none: ["open"] },
    body: { key: { type: "enum", values: ["c", "d"] }, title: { type: "text", max: 80 } },
    who: { roles: ["member"] },
    hold: { scope: "body.scope", workspace: true },
  };
  const acts = (label: string) => ({ ...CODE_REVIEW_ACTS, "start-song": { ...SONG, label } });
  const songs = () => recorded("start-song");


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
      if (read !== null && match(read)) return SESSION_ENDED();
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
    /** The answer to the act is lost, so the first command fails with the act recorded; the second finishes it. */
    async function lostThenFinished(between: () => Promise<void>, extra: (sent: string[], reads: string[]) => Fetch) {
      const { home, binding, argv } = await ready();
      const sent: string[] = [];
      const reads: string[] = [];
      const watch: Fetch = (input, init) => {
        if (isSend(input, init)) sent.push(String(init!.body));
        return fetch(input, init);
      };
      h.room.faults.push({ route: "POST /acts", kind: "drop" });
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
          return Promise.resolve(SESSION_ENDED());
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
});

describe("a saved act finished under another kind's name (reproduced at c74f3696)", () => {
  const OPENING = (label: string, max = 80): ActDeclaration => ({
    label,
    targets: { none: ["open"] },
    body: { key: { type: "enum", values: ["c", "d"] }, title: { type: "text", max } },
    who: { roles: ["member"] },
    hold: { scope: "body.scope", workspace: true },
  });
  const acts = (songMax = 80) => ({ ...CODE_REVIEW_ACTS, "start-song": OPENING("Start a song", songMax), "start-tune": OPENING("Begin a different tune") });
  const ofKind = recorded;
  const TOLD = "This idempotency key belongs to a saved start-song act. That act was sent again as it was saved; no start-tune act was made.";
  const TOLD_ANSWERED = "This idempotency key belongs to a saved start-song act. That act had already been answered, and this is its result. Nothing was sent, and no start-tune act was made.";

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

  /** `start-song` is recorded but its answer is lost; then `finish` runs with the same key, through `wrap`. */
  async function lostThenFinished(finish: (r: Awaited<ReturnType<typeof ready>>) => string[], wrap: (sent: string[]) => Fetch = counting) {
    const r = await ready();
    const sent: string[] = [];
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
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
      expect(finished.err.split("\n").filter((l) => l.includes("saved start-song act"))).toEqual([TOLD]);
      // The saved bytes went back unchanged: two sends, one act, one thread, and no act of the kind typed.
      expect(sent).toHaveLength(2);
      expect(new Set(sent).size).toBe(1);
      expect(JSON.parse(sent[0]!).envelope).toMatchObject({ kind: "start-song", binding: song, body: { key: "c", title: "Footprints" }, idempotencyKey: "song-once" });
      expect(ofKind("start-song")).toHaveLength(1);
      expect(ofKind("start-tune")).toHaveLength(0);
      expect(h.room.lanes.size).toBe(1);
    });

    test("a saved act whose answer the journal already holds is finished without a send, and the run is told that nothing was sent", async () => {
      const r = await ready();
      const sent: string[] = [];
      // The first run stops after it saved the room's answer, before its local steps.
      const first = await cli(r.home, r.args("start-song", r.song, "Footprints"), h.tmp, { ...crashAt("act-answered"), fetch: counting(sent) });
      expect(first.code).not.toBe(0);
      expect(sent).toHaveLength(1);
      const finished = await cli(r.home, r.args("start-tune", r.tune, "So What"), h.tmp, { fetch: counting(sent) });
      expect(finished.code).toBe(0);
      expect(finished.out.split("\n")[0]).toMatch(/^Done: Start a song \(start-song\), recorded as act_\d+_[0-9a-f]{8}\.$/);
      const told = finished.err.split("\n").filter((l) => l.includes("saved start-song act"));
      expect(told).toEqual([TOLD_ANSWERED]);
      expect(finished.err).not.toContain("sent again");
      // No POST to /acts by the finishing run.
      expect(sent).toHaveLength(1);
      expect(ofKind("start-song")).toHaveLength(1);
      expect(ofKind("start-tune")).toHaveLength(0);
    });

    test("when the words cannot be read, the receipt names the saved act's kind, not the kind typed, and the run is still told", async () => {
      // Every read session is refused on the finishing run: the signed act needs none (R-IDEM-2); the words do.
      const noSession = (sent: string[]): Fetch => (input, init) => {
        if (isSend(input, init)) sent.push(String(init!.body));
        if (init?.method === "POST" && new URL(String(input)).pathname.endsWith("/requests"))
          return Promise.resolve(SESSION_ENDED());
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
});
