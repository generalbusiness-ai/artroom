import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { b64url, keyIdOfSecret, signInvitationProof } from "@generalbusiness/artroom-bytes";
import { PROFILES, runnable, validateDefinition } from "@generalbusiness/dap-derive";
import { t } from "@generalbusiness/dap-derive/testing";
import { INVITATION_KEY_COHORT as C, DIRECTORY_OF, SIBLINGS_OF, platform } from "../src/index.ts";
import { Roster, rita, una, vic, paul } from "./support.ts";

// Roster's creator is a STAND-IN office; membership data, rules, judgments and
// signatures are real, in memory. This proves neither native SQLite nor replay.
test("new membership redeems only exact public-key invitations and keeps private seeds out of signed history", () => {
  const m = new Roster(C.membership).seated();
  const seed = new Uint8Array(32).fill(71), seedText = b64url(seed), inviteKey = keyIdOfSecret(seed);
  const invite = (handle: string) => m.did(rita, "invite-member", { fields: { handle, role: "member", inviteKey, inviteEnds: t(600) } }).seq;
  const first = invite("@una"), second = invite("@vic");
  const proof = signInvitationProof(seed, m.at, first, una.key);
  expect(m.act(vic, "join", { fields: { invitation: first, proof } })).toMatchObject({ result: "refused", name: "invitation-refused" });
  expect(m.act(una, "join", { fields: { invitation: second, proof } })).toMatchObject({ result: "refused", name: "invitation-refused" });
  m.did(una, "join", { fields: { invitation: first, proof } });
  expect(m.item(first).state).toBe("active");
  expect(m.act(vic, "join", { fields: { invitation: first, proof: signInvitationProof(seed, m.at, first, vic.key) } })).toMatchObject({ result: "refused", name: "invitation-used" });
  const keyInvitation = m.did(rita, "invite-key", { fields: { member: 2, kind: "device", inviteKey, inviteEnds: t(600) }, expected: { member: m.item(2).revision } }).seq;
  m.did(paul, "enrol", { on: 0, expected: { on: m.item(0).revision, member: m.item(2).revision }, fields: { invitation: keyInvitation, proof: signInvitationProof(seed, m.at, keyInvitation, paul.key) } });
  expect(m.item(keyInvitation).values["id"]).toBe(paul.key);
  m.now = t(601);
  const expired = () => m.act(vic, "join", { fields: { invitation: second, proof: signInvitationProof(seed, m.at, second, vic.key) } });
  expect(expired()).toMatchObject({ result: "due" });
  expect(m.drain().map(judgment => judgment.result)).toEqual(["write"]);
  expect(expired()).toMatchObject({ result: "refused", name: "invitation-expired" });
  const history = JSON.stringify(m.entries);
  expect(history).not.toContain(seedText);
  expect(history).not.toContain('"secret"');
  expect(history).not.toContain('"inviteHash"');
  expect(history).toContain(inviteKey);
});

test("new cohort is whole runnable native data and leaves every legacy pin's invitation fields unchanged", () => {
  expect(DIRECTORY_OF[C.register]).toBe(C.directory);
  expect(SIBLINGS_OF[C.directory]).toEqual({ membership: C.membership, rules: C.rules, destination: C.destination });
  for (const pin of Object.values(C)) {
    const code = platform(pin)!;
    const checked = validateDefinition(code.data, PROPOSED_BOUNDS, PROFILES, { platform: true });
    expect(checked.ok ? [] : checked.problems, pin).toEqual([]);
    if (checked.ok) expect(runnable(checked.definition, code.rules), pin).toBe(true);
  }
  for (const pin of ["platform:membership@1", "platform:membership@2", "platform:membership@4", "platform:membership@5"]) {
    expect(platform(pin)!.data.acts["join"]!.fields).toHaveProperty("secret");
    expect(platform(pin)!.data.acts["invite-member"]!.fields).toHaveProperty("inviteHash");
  }
  expect(platform(C.membership)!.data.acts["join"]!.fields).not.toHaveProperty("secret");
});
