import { answerText, nonacceptedAnswerText } from "../src/view.ts";
import { expect, test } from "vitest";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, intentDigest, keyIdOfSecret, newIncarnation, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { joinRoom, placeOf, type Session } from "../src/index.ts";

// One client boundary, with a SCRIPTED service acknowledgment. No scope,
// membership judgment, provider or durable enrollment/recovery runs.
// Invalid invitation encodings must stop before signing/submission; explicit
// supported native/@2 encodings submit to the configured service only.
test("page join refuses mismatched encoding before submission and accepts scripted native/@2 replies on the configured service", async () => {
  const repository = {
    directory: { scope: `sc_${"a".repeat(52)}` as const, inc: newIncarnation(new Uint8Array(16).fill(1)), kind: "directory" as const },
    membership: { scope: `sc_${"b".repeat(51)}a` as const, inc: newIncarnation(new Uint8Array(16).fill(2)), kind: "membership" as const },
    rules: `sc_${"c".repeat(51)}a` as const,
    destination: `sc_${"d".repeat(51)}a` as const,
  };
  const original = { v: 1, service: "https://page.test/", repository, invitation: 3, secret: "scripted-invitation", handle: "@scripted", definition: "platform:membership@2" };
  const encode = (value: unknown) => `artroom-invite:${b64url(utf8(JSON.stringify(value)))}`;
  const submissions: SignedIntent[] = [];
  let replyDefinition = original.definition;
  const fetch: Fetch = async (url, init) => {
    expect([url, init?.method]).toEqual([`https://page.test/v1/scopes/${repository.membership.scope}/acts`, "POST"]);
    const { signed } = JSON.parse(init!.body!) as { signed: SignedIntent };
    submissions.push(signed);
    expect(verifySignedIntent(signed)).toBe(true);
    expect([signed.intent.to, signed.intent.kind, signed.intent.expected, signed.intent.fields]).toEqual([
      repository.membership, "join", {}, { invitation: 3, secret: original.secret },
    ]);
    return new Response(JSON.stringify({ answer: "accepted", receipt: {
      fact: { at: repository.membership, seq: 4, hash: textDigest("scripted join acknowledgment") },
      definition: replyDefinition, intent: intentDigest(signed.intent), effects: [], sends: [], epoch: 0,
    } }));
  };
  const session: Session = { service: "https://page.test", secret: new Uint8Array(32).fill(7), fetch, now: () => Date.parse("2026-10-08T12:00:00Z") };
  const malformed = { ...original, repository: { ...repository, membership: { ...repository.membership, inc: "malformed" } } };
  expect([placeOf(encode(malformed)), placeOf(JSON.stringify({ repository: malformed.repository })), placeOf(encode({ ...original, repository: undefined }))]).toEqual([null, null, null]);
  expect(placeOf(JSON.stringify({ repository }))).toEqual({ directory: repository.directory.scope, membership: repository.membership });
  for (const changed of [
    { ...original, service: "https://another.test" },
    { ...original, definition: undefined },
    { ...original, definition: "platform:membership@99" },
    { ...original, definition: "platform:directory@2" },
    malformed,
  ]) {
    await expect(joinRoom(session, encode(changed))).rejects.toThrow("The invitation does not match this configured service");
  }
  expect(submissions).toEqual([]);
  for (const definition of ["platform:membership@1", "platform:membership@2"]) {
    replyDefinition = definition;
    const joined = await joinRoom(session, encode({ ...original, definition }));
    expect([joined.answer.answer, joined.place]).toEqual(["accepted", { directory: repository.directory.scope, membership: repository.membership }]);
  }
  expect(submissions).toHaveLength(2);
  for (const answer of [{ answer: "unavailable", reason: "busy" }, { answer: "mismatch", reason: "idempotency-mismatch" }, { answer: "refused", reason: "unauthorized", judgedAt: { seq: 0, hash: textDigest("scripted refused head") } }] as const) {
    expect(nonacceptedAnswerText(answer)).toMatch(new RegExp(`^${answer.answer === "unavailable" ? "Unavailable" : answer.answer === "mismatch" ? "Mismatch" : "Refused"}:`));
    expect(nonacceptedAnswerText(answer)).not.toContain("Nothing was written");
    const result = answerText({ service: session.service, directory: repository.directory.scope, membership: repository.membership, key: keyIdOfSecret(session.secret), answer, scope: repository.membership.scope, kind: "join", on: null, before: { seq: 0, hash: textDigest("scripted before head") }, after: null, observation: null });
    if (answer.answer !== "refused") {
      expect(result.join(" ")).toContain("before another act");
      expect(result.join(" ")).toContain("same signed envelope; this page does not retain it");
    }
  }

});

// SCRIPTED read/submit replies and a minimal DOM stand-in at the actual failure
// renderer. No browser, scope judgment, permission, publication or recovery proof.
test("incomplete projections stay unreadable and a real returned submit answer survives refresh and view failure with one submission", async () => {
  const { act, actAssociation, loadRules, loadChange, Unreadable } = await import("../src/data.ts");
  const { failureScreen } = await import("../src/view.ts");
  type Acted = import("../src/data.ts").Acted;
  type Room = import("../src/data.ts").Room;
  const ref = (letter: string, kind: string) => ({ scope: `sc_${letter.repeat(51)}a` as const, inc: newIncarnation(new Uint8Array(16).fill(3)), kind });
  const M = ref("b", "membership"), R = ref("c", "rules"), G = ref("d", "destination"), C = ref("e", "lane");
  const head = { seq: 0, hash: textDigest("scripted head") };
  const item = (type: string, id = 0, refs = {}) => ({ id, type, state: "open", revision: 1, opened: null, attributed: [], parties: {}, values: {}, refs });
  let mode: "complete" | "item-refused" | "item-budget" | "destination-incomplete" | "history-incomplete" | "act-refresh" = "complete";
  let itemReads = 0, submits = 0;
  let receipt: unknown;
  const kept = new Map<string, Acted>();
  let room: Room;
  const read = (value: unknown, complete = true, next?: string) => new Response(JSON.stringify({ ok: true, at: head, value, complete, ...(next === undefined ? {} : { next }) }));
  const fetch: Fetch = async (address, init) => {
    const url = new URL(address), path = url.pathname;
    if (path.endsWith("/acts")) {
      submits++;
      const { signed } = JSON.parse(init!.body!) as { signed: SignedIntent };
      receipt = { fact: { at: M, seq: 4, hash: textDigest("scripted admitted fact") }, definition: "platform:membership@1", intent: intentDigest(signed.intent), effects: [], sends: [], epoch: 0 };
      return new Response(JSON.stringify({ answer: "accepted", receipt }));
    }
    if (path.includes("/items/")) {
      if (path.includes(`${R.scope}/`)) {
        itemReads++;
        if (mode === "item-refused") return new Response(JSON.stringify({ ok: false, reason: "forbidden" }));
        if (mode === "item-budget") return read([], false, "more");
      }
      return read([]);
    }
    if (path.endsWith("/history")) return read([], mode !== "history-incomplete");
    if (mode === "act-refresh" && submits > 0 && path.endsWith(M.scope)) {
      expect(kept.get(actAssociation(room, M.scope))?.answer.answer).toBe("accepted");
      return new Response(JSON.stringify({ ok: false, reason: "forbidden" }));
    }
    const scope = path.endsWith(M.scope) ? M : path.endsWith(R.scope) ? R : path.endsWith(G.scope) ? G : C;
    const definition = scope === C ? textDigest("scripted change") : `platform:${scope.kind}@1`;
    const items = scope === M ? [item("roster")] : scope === R ? [item("rules")] : scope === C ? [item("proposal")] : [item("publication", 3, { operation: { at: C, seq: 5, hash: textDigest("scripted merge") } })];
    return read({ scope, status: "active", definition, time: "2026-10-08T12:00:00Z", counts: [], items }, !(scope === G && mode === "destination-incomplete"));
  };
  room = { session: { service: "https://page.test", secret: new Uint8Array(32).fill(7), fetch, now: () => Date.parse("2026-10-08T12:00:00Z") }, directory: ref("a", "directory").scope, membership: M as Room["membership"], rules: R.scope, destination: G.scope, key: "" as Room["key"], me: null, reader: null, unsessioned: "scripted", definitions: new Map([[textDigest("scripted change"), { name: "change" } as Room["definitions"] extends Map<string, infer T> ? T : never]]) };
  expect((await loadRules(room)).definitions).toEqual([]); // Distinguishing complete empty enumeration.
  mode = "item-refused";
  await expect(loadRules(room)).rejects.toThrow("forbidden");
  mode = "item-budget"; itemReads = 0;
  await expect(loadRules(room)).rejects.toThrow("page budget exhausted");
  expect(itemReads).toBe(100); // Existing bound, no new quota.
  mode = "destination-incomplete";
  await expect(loadChange(room, C.scope)).rejects.toThrow("incomplete summary");
  mode = "history-incomplete";
  await expect(loadChange(room, C.scope)).rejects.toThrow("incomplete enumeration");
  mode = "act-refresh";
  const result = await act(room, M.scope, "seat", {}, (known) => kept.set(actAssociation(room, M.scope), known));
  expect([submits, result.answer, result.after, result.observation]).toEqual([1, { answer: "accepted", receipt }, null, expect.stringContaining("forbidden")]);
  expect(kept.get(actAssociation(room, M.scope))).toBe(result);
  expect(actAssociation({ ...room, session: { ...room.session, service: "https://another.test" } }, M.scope)).not.toBe(actAssociation(room, M.scope));
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  class Element {
    children: (Element | string)[] = [];
    setAttribute() {}
    append(...children: (Element | string)[]) { this.children.push(...children); }
    get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => new Element() } });
  try {
    const shown = failureScreen(new Unreadable("view read forbidden"), [...kept.values()]).textContent!;
    expect(shown).toContain(`Accepted seat: ${M.scope}:4`);
    expect(shown).toContain("Observation unknown");
    expect(shown).toContain("before submitting another act");
    expect(shown).not.toMatch(/Nothing was written|The destination has recorded no publication/);
    expect(submits).toBe(1);
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
