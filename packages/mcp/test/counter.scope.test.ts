import { expect, test } from "vitest";
import type { FactRef, ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, keyIdOfSecret } from "@generalbusiness/artroom-bytes";
import { valueDigest } from "@generalbusiness/dap-derive";
import { APPLICATION_COHORT, CONFIGURATION_DOMAIN, FIRST_ACTIONS_OF } from "@generalbusiness/dap-platform";
import { countingCommitments } from "../../../apps/counter/commitments.ts";
import { COUNTING_COMMITMENTS_DEFINITION } from "../../../apps/counter/commitments-pin.ts";
import { mcpRoom, type Agent, type Room } from "./support/room.ts";
import { exercises } from "./support/story.ts";
import DOC from "../../../docs/mcp.md?raw";

/** The Counter's definition name: the name room lists and the prefix of its act tools. */
const NAME = countingCommitments.name;

/** docs/mcp.md's recipe for taking part in a Counter, by mode: the tools it names, in order, and its count. */
function counterRecipe(mode: "default" | "generic"): { tools: string[]; count: number } {
  const at = DOC.indexOf("## Taking part in a Counter");
  const row = DOC.slice(at, DOC.indexOf("\n## ", at + 5)).split("\n").find((l: string) => l.startsWith("| Take part in a Counter"))!;
  const cell = row.split(" | ")[mode === "default" ? 1 : 2]!;
  return { tools: [...cell.matchAll(/`([a-z][a-z0-9.-]*)`/g)].map((m) => m[1]!), count: Number([...cell.matchAll(/: (\d+)/g)].at(-1)![1]) };
}

/** A room of the application cohort, founded by rita, with the Counter's definition active and its actions in the admin role. */
async function counterRoom(room: Room, options: { subscribe?: boolean } = {}): Promise<Agent> {
  const rita = room.agent("rita", options);
  // The explicit application cohort: register@5, whose claim creates directory@5, membership@4, rules@3 and destination@2.
  const installed = await rita.ok("create", { definition: APPLICATION_COHORT.register, kind: "install", fields: { host: "artifacts", namespace: "artroom-demo", policy: "keys", founders: [rita.key] }, idempotencyKey: "install" });
  const register = installed["scope"] as ScopeId;
  await room.wireRegister(register);
  const claimed = await rita.ok("room.create", { target: register, fields: { branch: "main", founderHandle: "@rita", recoveryKey: keyIdOfSecret(crypto.getRandomValues(new Uint8Array(32))) }, idempotencyKey: "claim" });
  expect(claimed["answer"], JSON.stringify(claimed)).toBe("accepted");
  const w = await rita.ok("wait", { scope: register, entry: (claimed["fact"] as FactRef).seq });
  expect(w["timedOut"], JSON.stringify(w)).toBe(false);
  room.know(rita.config.repository!.destination);
  const seat = await rita.ok("room.seat", { idempotencyKey: "seat" });
  await rita.ok("room.first-key", { fields: { member: (seat["fact"] as FactRef).seq }, idempotencyKey: "first-key" });
  // The Counter's definition activated with its bytes; the room's role list holds the Counter's actions.
  expect((await rita.ok("rules.activate", { fields: { digest: COUNTING_COMMITMENTS_DEFINITION, name: NAME }, values: [canonicalize(countingCommitments)], idempotencyKey: "activate" }))["answer"]).toBe("accepted");
  // A check configuration kept by the rules scope, its bytes beside the act.
  exercises("platform:rules", "keep-configuration", "values");
  const configuration = { name: "unit", image: `sha256:${"a".repeat(64)}`, environment: {}, steps: [["npm", "test"]], judged: { passed: { exit: 0, line: "ok" }, failed: { exit: 1, line: "not ok" } }, limits: { seconds: 600, bytes: 65536 } };
  const kept = await rita.ok("rules.keep-configuration", { fields: { digest: valueDigest(CONFIGURATION_DOMAIN, configuration), name: "unit" }, values: [canonicalize(configuration)], idempotencyKey: "configuration" });
  expect(kept["answer"], JSON.stringify(kept)).toBe("accepted");
  const actions = [...FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]!.admin, "counting.control", "counting.participate", "counting.activity", "counting.commit", "counting.fulfill", "counting.fail"];
  expect((await rita.ok("member.actions", { on: 0, fields: { role: "admin", actions }, idempotencyKey: "actions" }))["answer"]).toBe("accepted");
  room.advance(301_000);   // the earlier grant's reuse window ends; no immediate-revocation claim
  return rita;
}

/** The application factory creates a Counter, a child under the room's membership; wait sees it as it sees a created lane. */
async function establish(rita: Agent, key: string): Promise<ScopeId> {
  exercises("platform:directory", "establish-application", "values");
  const established = await rita.ok("application.create", { fields: { definition: COUNTING_COMMITMENTS_DEFINITION, values: '{"target":3}', execution: "recorded-do" }, values: [canonicalize(countingCommitments)], idempotencyKey: key });
  expect(established["answer"], JSON.stringify(established)).toBe("accepted");
  const created = await rita.ok("wait", { scope: "directory", entry: (established["fact"] as FactRef).seq });
  expect(created["timedOut"], JSON.stringify(created)).toBe(false);
  return (created["created"] as { scope: ScopeId; definition: string }[]).find((c) => c.definition === COUNTING_COMMITMENTS_DEFINITION)!.scope;
}

/** room's applications. */
const applicationsOf = async (agent: Agent) => (await agent.ok("room", {}))["applications"] as { definition: string | null; digest: string | null; scope: ScopeId | null; state: string }[];

/**
 * The recipe of docs/mcp.md, run by `taker` in its mode: find the Counter through room, participate, activate, start, commit to
 * the next number, fulfill it, deactivate. Returns the tools called. An admin has initialized the board before.
 */
async function takePart(taker: Agent, mode: "default" | "generic"): Promise<string[]> {
  const from = taker.calls.length;
  const found = (await applicationsOf(taker)).find((a) => a.definition === NAME && a.state === "created");
  expect(found, "room lists the Counter among the applications").toBeDefined();
  const counter = found!.scope!;
  let digest = "";
  const act = async (kind: string, args: Record<string, unknown>) => {
    if (mode === "default") return taker.ok(`${NAME}.${kind}`, { target: counter, ...args });
    if (!digest) digest = (await taker.ok("actions", { scope: counter }))["digest"] as string;
    return taker.ok("act", { target: counter, kind, digest, ...args });
  };
  const did = async (kind: string, args: Record<string, unknown>) => {
    const answer = await act(kind, { ...args, idempotencyKey: `${kind}-${mode}` });
    expect(answer["answer"], JSON.stringify(answer)).toBe("accepted");
    return (answer["fact"] as FactRef).seq;
  };
  const board = async () => ((await taker.ok("inspect", { scope: counter }))["items"] as { id: number; type: string; state: string; values: Record<string, number> }[]).find((i) => i.type === "board")!;
  const participant = await did("participate", {});
  await did("activate", { on: participant });
  let b = await board();
  await did("start", { on: b.id });
  b = await board();
  expect(b.state).toBe("open");
  const turn = { generation: b.values["generation"]!, serial: b.values["serial"]! + 1, n: b.values["lastNumber"]! + 1 };
  const promise = await did("commit", { fields: { participant, ...turn, basis: [{ id: participant, member: "@rita" }] } });
  await did("fulfill", { on: promise, fields: turn });
  await did("deactivate", { on: participant });
  const calls = taker.calls.slice(from);
  expect((await board()).values["lastNumber"]).toBe(1);
  const kinds = ["initialize", "participate", "activate", "start", "commit", "fulfill", "deactivate"];
  expect(((await taker.ok("steps", { scope: counter }))["steps"] as { kind: string }[]).filter((s) => kinds.includes(s.kind)).map((s) => s.kind)).toEqual(kinds);
  return calls;
}

// Invariant: a Counter, an application created by the room's application factory, is found through room with no configuration
// and no scope ID handed over, and is driven through the same server with no counting code, in each launch mode: participate,
// activate, start, commit, fulfill, deactivate, calling exactly the tools docs/mcp.md's recipe names, as many times as it counts.
for (const mode of ["default", "generic"] as const) {
  test(`the Counter under its cohort, found through room: participate, activate, start, commit, fulfill, deactivate (${mode})`, async ({ annotate }) => {
    const room = mcpRoom();
    try {
      const rita = await counterRoom(room);
      const before = JSON.stringify(rita.config);
      await establish(rita, "counter");
      expect(JSON.stringify(rita.config), "nothing is written to the configuration").toBe(before);
      expect(await rita.names()).toEqual(expect.arrayContaining(["initialize", "participate", "activate", "start", "commit", "fulfill", "deactivate"].map((k) => `${NAME}.${k}`)));
      const counter = (await applicationsOf(rita)).find((a) => a.definition === NAME)!.scope!;
      expect((await rita.ok(`${NAME}.initialize`, { target: counter, idempotencyKey: "initialize" }))["answer"]).toBe("accepted");
      // The taker: rita's own connection in the default mode; a second connection of her configuration in --generic mode.
      const taker = mode === "default" ? rita : room.agent("rita, --generic", { mode: "generic", secret: rita.secret, config: rita.config, share: true });
      const calls = await takePart(taker, mode);
      const recipe = counterRecipe(mode);
      expect([calls, calls.length]).toEqual([recipe.tools, recipe.count]);
      await annotate(`${mode}: taking part in a Counter, found through room: ${calls.length} calls (${calls.join(", ")})`);
    } finally { room.done(); }
  }, 600_000);
}

// Invariant: an application created through the tools is discovered with no configuration write: room lists it with its
// definition name, digest, scope and state; the list holds its tools; inspect reads it by scope ID; a subscribed client is told
// of it once; and a root configured by hand that is also the directory's application is listed once, as the application.
test("an application created through the tools: room, the list and one list change, with no configuration", async ({ annotate }) => {
  const room = mcpRoom();
  try {
    const rita = await counterRoom(room, { subscribe: true });
    await rita.tick(); await rita.tick();
    const told = rita.told;
    const before = JSON.stringify(rita.config);
    expect((await applicationsOf(rita))).toEqual([]);
    expect((await rita.names()).some((n) => n.startsWith(`${NAME}.`) && n !== `${NAME}.initialize`)).toBe(false);
    const generation = (await rita.service.page()).generation;
    const counter = await establish(rita, "discovered");
    expect(JSON.stringify(rita.config), "nothing is written to the configuration").toBe(before);
    expect(await applicationsOf(rita)).toEqual([{ definition: NAME, digest: COUNTING_COMMITMENTS_DEFINITION, scope: counter, state: "created" }]);
    expect(await rita.names()).toEqual(expect.arrayContaining(["participate", "start", "commit", "fulfill"].map((k) => `${NAME}.${k}`)));
    const inspected = await rita.ok("inspect", { scope: counter });
    expect(inspected["scope"]).toBe(counter);
    expect((await rita.service.page()).generation).not.toBe(generation);
    await rita.tick(); await rita.tick();
    const toldOfApplication = rita.told - told;
    expect(toldOfApplication, "a new application is told once").toBe(1);
    // A hand-configured root that is also the directory's application: held and listed once, as the application. (Writing a
    // root is itself a configuration change, which the generation counts, as for any root.)
    rita.config.roots = [{ scope: counter, membership: rita.config.repository!.membership }];
    const page = await rita.ok("room", {});
    expect([(page["applications"] as { scope: string }[]).filter((a) => a.scope === counter).length, (page["roots"] as { scope: string }[]).filter((r) => r.scope === counter).length]).toEqual([1, 0]);
    const names = await rita.names();
    expect(names.filter((n) => n === `${NAME}.participate`)).toHaveLength(1);
    await annotate(`a new application: told ${toldOfApplication} time; room lists ${JSON.stringify(page["applications"])}`);
  } finally { room.done(); }
}, 600_000);
