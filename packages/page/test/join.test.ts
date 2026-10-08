import { expect, test } from "vitest";
import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, intentDigest, newIncarnation, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
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
});
