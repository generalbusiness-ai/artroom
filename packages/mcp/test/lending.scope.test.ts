import { expect, test } from "vitest";
import type { FactRef, ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, keyIdOfSecret } from "@generalbusiness/artroom-bytes";
import { FILE_PUBLICATION_COHORT, FIRST_ACTIONS_OF } from "@generalbusiness/dap-platform";
import { lending } from "../../../examples/lending/definition.ts";
import { LENDING_DEFINITION } from "../../../examples/lending/pin.ts";
import { mcpRoom, type Agent, type Room } from "./support/room.ts";
import DOC from "../../../docs/mcp.md?raw";

/** The library's definition name: the name room lists and the prefix of its act tools. */
const NAME = lending.name;

/** docs/mcp.md's recipe for taking part in the lending library, by mode: the tools it names, in order, and its count. */
function libraryRecipe(mode: "default" | "generic"): { tools: string[]; count: number } {
  const at = DOC.indexOf("## Taking part in the lending library");
  const row = DOC.slice(at, DOC.indexOf("\n## ", at + 5)).split("\n").find((l: string) => l.startsWith("| Take part in the lending library"))!;
  const cell = row.split(" | ")[mode === "default" ? 1 : 2]!;
  return { tools: [...cell.matchAll(/`([a-z][a-z0-9.-]*)`/g)].map((m) => m[1]!), count: Number([...cell.matchAll(/: (\d+)/g)].at(-1)![1]) };
}

/** A room of the application-publication cohort, founded by rita, with the library's definition active and its actions in the admin role. */
async function libraryRoom(room: Room): Promise<Agent> {
  const rita = room.agent("rita");
  const installed = await rita.ok("create", { definition: FILE_PUBLICATION_COHORT.register, kind: "install", fields: { host: "artifacts", namespace: "artroom-demo", policy: "keys", "founders": [rita.key] }, idempotencyKey: "install" });
  const register = installed["scope"] as ScopeId;
  await room.wireRegister(register);
  const claimed = await rita.ok("room.create", { target: register, fields: { branch: "main", "founderHandle": "@rita", recoveryKey: keyIdOfSecret(crypto.getRandomValues(new Uint8Array(32))) }, idempotencyKey: "claim" });
  expect(claimed["answer"], JSON.stringify(claimed)).toBe("accepted");
  const w = await rita.ok("wait", { scope: register, entry: (claimed["fact"] as FactRef).seq });
  expect(w["timedOut"], JSON.stringify(w)).toBe(false);
  room.know(rita.config.repository!.destination);
  const seat = await rita.ok("room.seat", { idempotencyKey: "seat" });
  await rita.ok("room.first-key", { fields: { member: (seat["fact"] as FactRef).seq }, idempotencyKey: "first-key" });
  expect((await rita.ok("rules.activate", { fields: { digest: LENDING_DEFINITION, name: NAME }, values: [canonicalize(lending)], idempotencyKey: "activate" }))["answer"]).toBe("accepted");
  // The deployed library's admin role: every first admin action, and both of the library's.
  const actions = [...FIRST_ACTIONS_OF[FILE_PUBLICATION_COHORT.membership]!.admin, "lending.member", "lending.staff"];
  expect((await rita.ok("member.actions", { on: 0, fields: { role: "admin", actions }, idempotencyKey: "actions" }))["answer"]).toBe("accepted");
  room.advance(301_000);   // the earlier grant's reuse window ends; no immediate-revocation claim
  const established = await rita.ok("application.create", { fields: { definition: LENDING_DEFINITION, values: "{}", execution: "recorded-do" }, values: [canonicalize(lending)], idempotencyKey: "library" });
  expect(established["answer"], JSON.stringify(established)).toBe("accepted");
  const created = await rita.ok("wait", { scope: "directory", entry: (established["fact"] as FactRef).seq });
  expect(created["timedOut"], JSON.stringify(created)).toBe(false);
  return rita;
}

/**
 * The recipe of docs/mcp.md, run by `taker` in its mode: find the library through room, donate a thing, borrow it and return it.
 * Returns the tools called and the library's scope.
 */
async function takePart(taker: Agent, mode: "default" | "generic"): Promise<{ calls: string[]; library: ScopeId; thing: number }> {
  const from = taker.calls.length;
  const matched = ((await taker.ok("room", {}))["applications"] as { definition: string | null; scope: ScopeId | null; state: string }[])
    .find((a) => a.definition === NAME && a.state === "created");
  expect(matched, "room lists the library among the applications").toBeDefined();
  const library = matched!.scope!;
  let digest = "";
  const act = async (kind: string, args: Record<string, unknown>) => {
    if (mode === "default") return taker.ok(`${NAME}.${kind}`, { target: library, ...args });
    if (!digest) digest = (await taker.ok("actions", { scope: library }))["digest"] as string;
    return taker.ok("act", { target: library, kind, digest, ...args });
  };
  const did = async (kind: string, args: Record<string, unknown>) => {
    const answer = await act(kind, { ...args, idempotencyKey: `${kind}-${mode}` });
    expect(answer["answer"], JSON.stringify(answer)).toBe("accepted");
    return (answer["fact"] as FactRef).seq;
  };
  // Each act carries the shelf page's text, which the library tells the destination to publish at the thing's path. A donation
  // opens the thing at the entry that records it: the fact's position is the thing's ID.
  const page = (state: string) => `# Big pot\n\nA heavy copper pot. Holds eight litres.\n\nStatus: ${state}\n`;
  const thing = await did("donate", { fields: { name: "Big pot", description: "A heavy copper pot. Holds eight litres.", page: `shelf/${mode}-big-pot.md`, content: page("available") } });
  await did("borrow", { on: thing, fields: { content: page("lent") } });
  await did("return", { on: thing, fields: { content: page("available") } });
  return { calls: taker.calls.slice(from), library, thing };
}

// Invariant: the lending library, an application created by the room's application factory, is found through room with no
// scope ID handed over and driven through the same server with no lending code, in each launch mode: donate, borrow and return,
// calling exactly the tools docs/mcp.md's recipe names, as many times as it counts. A refusal is an answer, not a tool error.
for (const mode of ["default", "generic"] as const) {
  test(`the lending library under its cohort, found through room: donate, borrow, return (${mode})`, async ({ annotate }) => {
    const room = mcpRoom();
    try {
      const rita = await libraryRoom(room);
      expect(await rita.names()).toEqual(expect.arrayContaining(["donate", "borrow", "return", "cancel", "publish"].map((k) => `${NAME}.${k}`)));
      const taker = mode === "default" ? rita : room.agent("rita, --generic", { mode: "generic", secret: rita.secret, config: rita.config, share: true });
      const { calls, library, thing } = await takePart(taker, mode);
      const recipe = libraryRecipe(mode);
      expect([calls, calls.length]).toEqual([recipe.tools, recipe.count]);
      // The thing is available again; a second return is refused by the guard, and nothing is written.
      const inspected = (await rita.ok("inspect", { scope: library }))["items"] as { id: number; type: string; state: string }[];
      expect(inspected.find((i) => i.id === thing)).toMatchObject({ type: "thing", state: "available" });
      const again = await rita.ok(`${NAME}.return`, { target: library, on: thing, fields: { content: "A page" }, idempotencyKey: "return-again" });
      expect([again["answer"], again["reason"]], JSON.stringify(again)).toEqual(["refused", "guard-failed"]);
      const kinds = ["establish", "donate", "borrow", "return"];
      expect(((await rita.ok("steps", { scope: library }))["steps"] as { kind: string }[]).map((s) => s.kind).filter((k) => kinds.includes(k))).toEqual(kinds);
      await annotate(`${mode}: taking part in the lending library, found through room: ${calls.length} calls (${calls.join(", ")})`);
    } finally { room.done(); }
  }, 600_000);
}
