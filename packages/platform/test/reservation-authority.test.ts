import { expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/artroom-contract";
import { textDigest } from "@generalbusiness/artroom-bytes";
import { observationOf } from "@generalbusiness/artroom-derive";
import { d, otherLane, t } from "@generalbusiness/artroom-derive/testing";
import { MEMBERSHIP, standingOf } from "../src/membership.ts";
import { judgeReservation, type Statement } from "../src/reservation.ts";
import { FOUND, HEAD, NEXT, reading, rulesObserved } from "./support-destination.ts";
import { Roster, paul, rita, una } from "./support.ts";

// Membership is judged in memory with its real rules below the made-up office of Roster. Its standing is the actual
// platform projection. Lane facts, manifest evidence and rules observations are hand-written; no host or lane is reached.
const fact = (seq: number): FactRef => ({ at: otherLane, seq, hash: d("a") });
const statement: Statement = { operation: fact(1), manifest: fact(2), verdicts: [], jobs: [], reports: [], links: [] };

for (const loses of ["last active key", "membership"] as const) test(`a customized agent can merge while its controller is active; loss of the controller's ${loses} removes current merge authority while historical approval and check evidence still count`, () => {
  const m = new Roster().seated();
  const controller = m.did(rita, "invite-member", { fields: { handle: "@paul", role: "member", inviteHash: textDigest("controller invitation"), inviteEnds: t(600) } }).seq;
  const controllerKey = m.did(paul, "join", { fields: { invitation: controller, secret: "controller invitation" } }).seq;
  const agent = m.did(rita, "add-member", { fields: { handle: "@una", kind: "agent", controller: { membership: m.at, member: "@paul" } } }).seq;
  const invitation = m.did(rita, "invite-key", { fields: { member: agent, kind: "agent", inviteHash: textDigest("agent invitation"), inviteEnds: t(600) }, expected: { member: m.item(agent).revision } }).seq;
  m.did(una, "enrol", { on: 0, expected: { on: m.item(0).revision, member: m.item(agent).revision }, fields: { invitation, secret: "agent invitation" } });
  m.did(rita, "set-actions", { on: 0, expected: { on: m.item(0).revision }, fields: { role: "agent", actions: ["change.merge", "change.review", "change.check"] } });
  const observed = (key: typeof una.key) => observationOf(standingOf(m.state, { of: m.at, key }, MEMBERSHIP), m.now)!;
  const judge = (read = reading(m.now, { merger: observed(una.key) }), named = statement) => judgeReservation({ recorded: HEAD, evidence: FOUND, statement: named, read, time: m.now });
  const before = observed(una.key);
  expect(before).toMatchObject({ keyState: "active", memberState: "active", role: "agent", controller: "@paul", controllerActive: true, actions: ["change.merge", "change.review", "change.check"] });
  expect(judge()).toEqual({ reserved: true, integration: NEXT, reason: null });

  if (loses === "last active key") m.did(rita, "revoke-key", { on: controllerKey, expected: { on: m.item(controllerKey).revision, roster: m.item(0).revision, member: m.item(controller).revision }, fields: { as: "retired" } });
  else m.did(rita, "remove-member", { on: controller, expected: { on: m.item(controller).revision } });
  const after = observed(una.key);
  expect(after).toMatchObject({ keyState: "active", memberState: "active", controller: "@paul", controllerActive: false, actions: before.actions });
  expect(judge()).toEqual({ reserved: false, reason: "authority-lost" });

  // A currently authorized human merges. The agent's earlier approval remains valid while its key is not compromised;
  // a controller losing current authority does not turn that historical approval into a new act needing a current grant.
  const approve = { review: fact(3), reviewer: { membership: m.at, member: after.member }, verdict: "approve" as const };
  expect(judge(reading(m.now, { merger: observed(rita.key), rules: rulesObserved(m.now, { approvals: 1 }), verdicts: [{ sound: true, key: after }] }), { ...statement, verdicts: [approve] }))
    .toEqual({ reserved: true, integration: NEXT, reason: null });
  const job = { job: fact(4), name: "verify", state: "passed" as const, decidedBy: fact(5) };
  expect(judge(reading(m.now, { merger: observed(rita.key), rules: rulesObserved(m.now, { checks: [{ name: "verify", configuration: d("b"), required: true, checker: after.member }] }), checks: { verify: { opening: "sound", deciding: true, key: after } } }), { ...statement, jobs: [job] }))
    .toEqual({ reserved: true, integration: NEXT, reason: null });
});
