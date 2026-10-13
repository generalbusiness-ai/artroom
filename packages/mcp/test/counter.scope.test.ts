import { expect, test } from "vitest";
import type { FactRef, ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, keyIdOfSecret } from "@generalbusiness/artroom-bytes";
import { valueDigest } from "@generalbusiness/dap-derive";
import { APPLICATION_COHORT, CONFIGURATION_DOMAIN, FIRST_ACTIONS_OF } from "@generalbusiness/dap-platform";
import { counting } from "../../../examples/counting/definition.ts";
import { COUNTING_DEFINITION } from "../../../examples/counting/pin.ts";
import { mcpRoom } from "./support/room.ts";
import { exercises } from "./support/story.ts";

// Invariant: a Counter, an application created by the room's application factory and configured into the server by hand as a
// standalone scope under its membership, is driven through the same server with no counting code: join, start, spoken, leave.
test("the Counter under its cohort: join, start, spoken, leave", async () => {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita");
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
    expect((await rita.ok("rules.activate", { fields: { digest: COUNTING_DEFINITION, name: "counting" }, values: [canonicalize(counting)], idempotencyKey: "activate" }))["answer"]).toBe("accepted");
    // A check configuration kept by the rules scope, its bytes beside the act.
    exercises("platform:rules", "keep-configuration", "values");
    const configuration = { name: "unit", image: `sha256:${"a".repeat(64)}`, environment: {}, steps: [["npm", "test"]], judged: { passed: { exit: 0, line: "ok" }, failed: { exit: 1, line: "not ok" } }, limits: { seconds: 600, bytes: 65536 } };
    const kept = await rita.ok("rules.keep-configuration", { fields: { digest: valueDigest(CONFIGURATION_DOMAIN, configuration), name: "unit" }, values: [canonicalize(configuration)], idempotencyKey: "configuration" });
    expect(kept["answer"], JSON.stringify(kept)).toBe("accepted");
    const actions = [...FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]!.admin, "counting.control", "counting.join", "counting.spoken", "counting.leave"];
    expect((await rita.ok("member.actions", { on: 0, fields: { role: "admin", actions }, idempotencyKey: "actions" }))["answer"]).toBe("accepted");
    room.advance(301_000);   // the earlier grant's reuse window ends; no immediate-revocation claim

    // The application factory creates the Counter, a child under the room's membership.
    exercises("platform:directory", "establish-application", "values");
    const established = await rita.ok("application.create", { fields: { definition: COUNTING_DEFINITION, values: '{"target":3}', execution: "recorded-do" }, values: [canonicalize(counting)], idempotencyKey: "counter" });
    expect(established["answer"], JSON.stringify(established)).toBe("accepted");
    const created = await rita.ok("wait", { scope: "directory", entry: (established["fact"] as FactRef).seq });
    expect(created["timedOut"], JSON.stringify(created)).toBe(false);
    const counter = (created["created"] as { scope: ScopeId; definition: string }[]).find((c) => c.definition === COUNTING_DEFINITION)!.scope;

    // Configured by hand, as `dap mcp --scope <counter> --membership membership` records it.
    rita.config.roots = [...(rita.config.roots ?? []), { scope: counter, membership: rita.config.repository!.membership }];
    const names = await rita.names();
    expect(names).toEqual(expect.arrayContaining(["counting.initialize", "counting.join", "counting.start", "counting.spoken", "counting.leave"]));

    const board = async () => ((await rita.ok("inspect", { scope: counter }))["items"] as { id: number; type: string; state: string; values: Record<string, number> }[]);
    expect((await rita.ok("counting.initialize", { target: counter, idempotencyKey: "initialize" }))["answer"]).toBe("accepted");
    const joined = await rita.ok("counting.join", { target: counter, idempotencyKey: "join" });
    expect(joined["answer"], JSON.stringify(joined)).toBe("accepted");
    const participant = (joined["fact"] as FactRef).seq;
    const basis = [{ id: participant, member: "@rita" }];
    let b = (await board()).find((i) => i.type === "board")!;
    const started = await rita.ok("counting.start", { target: counter, on: b.id, fields: { n: b.values["lastNumber"]! + 1, nextSerial: b.values["serial"]! + 1, basis, next: participant }, idempotencyKey: "start" });
    expect(started["answer"], JSON.stringify(started)).toBe("accepted");
    b = (await board()).find((i) => i.type === "board")!;
    const spoken = await rita.ok("counting.spoken", { target: counter, on: b.id, fields: { generation: b.values["generation"]!, serial: b.values["serial"]!, n: b.values["number"]!, nextN: Math.min(b.values["number"]! + 1, b.values["target"]!), nextSerial: b.values["serial"]! + 1, basis, next: participant }, idempotencyKey: "spoken" });
    expect(spoken["answer"], JSON.stringify(spoken)).toBe("accepted");
    b = (await board()).find((i) => i.type === "board")!;
    expect(b.values["lastNumber"]).toBe(1);
    const left = await rita.ok("counting.leave", { target: counter, on: participant, fields: { generation: b.values["generation"]!, serial: b.values["serial"]!, nextSerial: b.values["serial"]! + 1, basis: [], replace: false }, idempotencyKey: "leave" });
    expect(left["answer"], JSON.stringify(left)).toBe("accepted");
    expect(((await rita.ok("steps", { scope: counter }))["steps"] as { kind: string }[]).filter((s) => ["initialize", "join", "start", "spoken", "leave"].includes(s.kind)).map((s) => s.kind)).toEqual(["initialize", "join", "start", "spoken", "leave"]);
  } finally { room.done(); }
}, 600_000);
