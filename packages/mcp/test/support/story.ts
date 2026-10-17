/** The steps every MCP story shares: a W2 marker, one act as a recipe step in either mode, and the creation of a room. */
import { expect } from "vitest";
import type { PlatformDefinition, ScopeId } from "@generalbusiness/dap-contract";
import { keyIdOfSecret } from "@generalbusiness/artroom-bytes";
import type { Agent, Room } from "./room.ts";

/** A W2 marker: this story exercises the act with that beside input (inventory.test.ts reads these). */
export const exercises = (_definition: string, _kind: string, _input: "presented" | "values"): void => {};

/**
 * One act, as a recipe step: by its tool in the default mode, by actions and act in --generic mode. The call comes first, with
 * no list derived before it, so the server's own refresh is what makes a new tool callable; the list is checked afterwards: the
 * tool is listed in the default mode, and not in --generic mode.
 */
export async function step(agent: Agent, mode: "default" | "generic", at: { tool: string; scope: string | number; kind: string }, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (mode === "default") {
    const done = await agent.ok(at.tool, { ...(typeof at.scope === "number" || at.scope.startsWith("sc_") ? { target: at.scope } : {}), ...args });
    expect(await agent.names(), `${agent.name} sees ${at.tool} listed`).toContain(at.tool);
    return done;
  }
  const acts = await agent.ok("actions", { scope: at.scope });
  const offered = (acts["acts"] as { kind: string }[]).map((a) => a.kind);
  expect(offered, `${agent.name} is offered ${at.kind} on ${at.scope}`).toContain(at.kind);
  const done = await agent.ok("act", { target: at.scope, kind: at.kind, digest: acts["digest"], ...args });
  const names = await agent.names();
  expect(names).toEqual(expect.arrayContaining(["actions", "act"]));
  expect(names).not.toContain(at.tool);
  return done;
}

/** Whether an act is offered: its tool listed in the default mode, its kind in actions in --generic mode. */
export async function offers(agent: Agent, mode: "default" | "generic", at: { tool: string; scope: string | number; kind: string }): Promise<boolean> {
  if (mode === "default") return (await agent.names()).includes(at.tool);
  const acts = await agent.call("actions", { scope: at.scope });
  return !acts.isError && (acts.structuredContent["acts"] as { kind: string }[]).some((a) => a.kind === at.kind);
}

/** Create the register and claim a room through the tools: create, room.create, wait, room.seat, room.first-key, wait. */
export async function created(room: Room, rita: Agent, mode: "default" | "generic" = "default", definition: PlatformDefinition = "platform:register@3"): Promise<{ register: ScopeId }> {
  const installed = await rita.ok("create", { definition, kind: "install", fields: { host: "artifacts", namespace: "artroom-demo", policy: "keys", "founders": [rita.key] }, idempotencyKey: "install" });
  expect(installed["answer"]).toBe("accepted");
  const register = installed["scope"] as ScopeId;
  await room.wireRegister(register);
  const recovery = keyIdOfSecret(crypto.getRandomValues(new Uint8Array(32)));
  const claimed = await step(rita, mode, { tool: "room.create", scope: register, kind: "found" }, { fields: { branch: "main", "founderHandle": "@rita", recoveryKey: recovery }, idempotencyKey: "claim" });
  expect(claimed["answer"], JSON.stringify(claimed)).toBe("accepted");
  const created = await rita.ok("wait", { scope: register, entry: (claimed["fact"] as { seq: number }).seq });
  expect([created["timedOut"], (created["created"] as { kind: string }[]).map((c) => c.kind).sort()]).toEqual([false, ["destination", "directory", "membership", "rules"]]);
  expect(rita.config.repository).toBeDefined();
  room.know(rita.config.repository!.destination);
  const seat = await step(rita, mode, { tool: "room.seat", scope: "membership", kind: "seat" }, { idempotencyKey: "seat" });
  const member = (seat["fact"] as { seq: number }).seq;
  await step(rita, mode, { tool: "room.first-key", scope: "membership", kind: "first-key" }, { fields: { member }, idempotencyKey: "first-key" });
  const inbox = await rita.ok("wait", { scope: "membership", entry: member });
  expect([inbox["timedOut"], rita.config.repository?.inbox]).toEqual([false, expect.stringMatching(/^sc_/)]);
  return { register };
}
