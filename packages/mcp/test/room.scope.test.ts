import { expect, test } from "vitest";
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { keyIdOfSecret } from "@generalbusiness/artroom-bytes";
import { mcpRoom, type Agent, type Room } from "./support/room.ts";

/** A W2 marker: this story exercises the act with that beside input (inventory.test.ts reads these). */
export const exercises = (_definition: string, _kind: string, _input: "presented" | "values"): void => {};

/** Create the register and claim a room through the tools: create, room.create, wait, room.seat, room.first-key, wait. */
export async function founded(room: Room, rita: Agent): Promise<{ register: ScopeId }> {
  const installed = await rita.ok("create", { definition: "platform:register@3", kind: "install", fields: { host: "artifacts", namespace: "artroom-demo", policy: "keys", founders: [rita.key] }, idempotencyKey: "install" });
  expect(installed["answer"]).toBe("accepted");
  const register = installed["scope"] as ScopeId;
  await room.wireRegister(register);
  expect(await rita.names()).toContain("room.create");
  const recovery = keyIdOfSecret(crypto.getRandomValues(new Uint8Array(32)));
  const claimed = await rita.ok("room.create", { target: register, fields: { branch: "main", founderHandle: "@rita", recoveryKey: recovery }, idempotencyKey: "claim" });
  expect(claimed["answer"], JSON.stringify(claimed)).toBe("accepted");
  const created = await rita.ok("wait", { scope: register, entry: (claimed["fact"] as { seq: number }).seq });
  expect(created["timedOut"], JSON.stringify(created)).toBe(false);
  expect(rita.config.repository).toBeDefined();
  const seat = await rita.ok("room.seat", { idempotencyKey: "seat" });
  expect(seat["answer"], JSON.stringify(seat)).toBe("accepted");
  const member = (seat["fact"] as { seq: number }).seq;
  const key = await rita.ok("room.first-key", { fields: { member }, idempotencyKey: "first-key" });
  expect(key["answer"], JSON.stringify(key)).toBe("accepted");
  const inbox = await rita.ok("wait", { scope: "membership", entry: member });
  expect(inbox["timedOut"], JSON.stringify(inbox)).toBe(false);
  return { register };
}

// Invariant: through the act tools alone (and once more through actions and act alone), an agent creates the register and the
// room, and every tool it calls was listed for its role at that moment.
test("the room story, through the act tools", async () => {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita", { subscribe: true });
    await founded(room, rita);
    const listed = await rita.names();
    expect(listed).toEqual(expect.arrayContaining(["member.invite", "rules.publish", "rules.activate", "issue.create"]));
  } finally { room.done(); }
}, 180_000);
