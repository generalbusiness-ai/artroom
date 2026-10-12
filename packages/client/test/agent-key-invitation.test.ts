import { expect, test } from "vitest";
import { b64url, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import { AGENT_KEY_LINK, agentKeyInvitationOf, encodeAgentKeyInvitation, type AgentKeyInvitation } from "../src/index.ts";
// Encoding only. Full native agent/controller/key admission is a separate witness.
test("agent-key invitations are explicitly closed private handoffs, preserve full native context and cannot be mistaken for a person invitation or a signing-key config", () => {
  const ref = (kind: "directory" | "membership") => ({ kind, scope: scopeIdOf({ v: 1, kind, definition: kind === "directory" ? "platform:directory@3" : "platform:membership@2", creator: null, cause: textDigest("SCRIPTED agent codec " + kind), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(19)) });
  const membership = ref("membership"), directory = ref("directory");
  const value: AgentKeyInvitation = { v: 1, kind: "agent-key", service: "https://agents.test", repository: { directory, membership, rules: directory.scope, destination: directory.scope }, definition: "platform:membership@2", handle: "@helper", controller: { membership, member: "@founder" }, member: { at: membership, seq: 4, hash: textDigest("SCRIPTED member") }, invitation: { at: membership, seq: 6, hash: textDigest("SCRIPTED key invitation") }, secret: b64url(new Uint8Array(32).fill(12)), expected: { on: 1, member: 5 } };
  const encoded = encodeAgentKeyInvitation(value);
  expect([encoded.startsWith(AGENT_KEY_LINK), agentKeyInvitationOf(encoded)?.kind, agentKeyInvitationOf(encoded)?.controller.member]).toEqual([true, "agent-key", "@founder"]);
  expect(agentKeyInvitationOf("artroom-invite:" + encoded.slice(AGENT_KEY_LINK.length))).toBeNull();
  expect(() => encodeAgentKeyInvitation({ ...value, controller: { ...value.controller, membership: { ...membership, inc: newIncarnation(new Uint8Array(16).fill(20)) } } })).toThrow("not valid");
  expect(() => encodeAgentKeyInvitation({ ...value, ...{ signingKey: "must never enter a handoff" } })).toThrow("not valid");
  expect(agentKeyInvitationOf(AGENT_KEY_LINK + "a".repeat(16 * 1024))).toBeNull();
});
