/**
 * Declared acts in the CLI (request a5d64b35; docs/protocol.md section
 * 33.10): `artroom acts` and `artroom act`, the journal, and the label a
 * record's kind had at its own seq. The fake room runs in its declared mode;
 * the real Room's admission is tested in packages/room.
 */

import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ActDeclaration } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { explainText, refusalText } from "../src/format.ts";
import { FieldError, meaningChanges, missing, parseValue } from "../src/declared.ts";
import { invitationLink } from "../src/link.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login } = useHarness();

const ASK: ActDeclaration = {
  label: "Ask",
  targets: { entry: ["comment"] },
  body: { text: { type: "text", max: 200 }, urgency: { type: "enum", values: ["low", "high"], optional: true }, count: { type: "int", min: 1, max: 9, optional: true } },
  who: { roles: ["member", "agent"] },
  help: "Ask a question about an entry.",
};
const withAsk = (ask: ActDeclaration = ASK) => ({ ...CODE_REVIEW_ACTS, ask });
const posts = (route: string) => h.room.requests.filter((r) => r.method === "POST" && r.route === route).length;
const gets = (route: string) => h.room.requests.filter((r) => r.method === "GET" && r.route === route).length;

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

  test("an act that opens a thread names it as every reader does: its goal, or the act's label and first field", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const song: ActDeclaration = { label: "Start a song", targets: { none: ["open"] }, body: { title: { type: "text", max: 80 }, year: { type: "text", max: 4, optional: true } }, who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } };
    await h.room.activate({ ...CODE_REVIEW_ACTS, "start-song": song });
    const res = await cli(alice, ["act", "start-song", "--binding", (await h.room.bindingOf("start-song"))!, "--set", "year=1963", "--set", "title=Blue Bossa", "--set", "scope=songs/blue-bossa/**"]);
    expect(res.code).toBe(0);
    const id = /recorded as (act_\d+_[0-9a-f]{8})\.$/m.exec(res.out)![1]!;
    expect(res.out.split("\n")).toEqual([`Done: Start a song (start-song), recorded as ${id}.`, `Thread: Start a song: Blue Bossa (lane ${id}).`]);
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
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    const lost = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=once", "--idempotency-key", "ask-once"]);
    expect(lost.code).toBe(1);
    expect(lost.err).toContain("--idempotency-key ask-once");
    const recorded = h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask");
    expect(recorded).toHaveLength(1);
    // The meaning changes before the user finishes the command.
    await h.room.activate(withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    const reads = gets("/declarations");
    const again = await cli(alice, ["act", "ask", "--binding", binding, "--entry", claim.id, "--set", "text=once", "--idempotency-key", "ask-once"]);
    expect(again.code).toBe(0);
    expect(again.out).toContain(`recorded as act_${recorded[0]!.seq}_`);
    // The journaled act went back as it was: no catalogue read, no new signature, no second entry.
    expect(gets("/declarations")).toBe(reads);
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
