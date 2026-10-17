import { expect, test } from "vitest";
import type { FactRef, ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { firstExtents } from "@generalbusiness/dap-platform";
import { DEMO_DIGESTS, issueDemo } from "@generalbusiness/dap-lanes";
import { ListRestart } from "../src/index.ts";
import { garden } from "./support/garden.ts";
import { mcpRoom } from "./support/room.ts";
import { created } from "./support/story.ts";

// Invariant: the list is a function of the configured inventory and the caller's standing, never of a connection: a scope founded
// on one connection is listed by a second and by a restarted one; an idle subscribed client is told of an activation made
// elsewhere at the watch's next run; an ordinary head advance is told nothing and keeps cursors good, while a genuine change is
// told once and restarts a cursor; and a room with mixed standing lists each scope's acts under its own.
test("discovery: shared configuration, idle watch, heads against generations, cursors, mixed standing", async () => {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita", { subscribe: true, listPageBytes: 16 * 1024 });
    await created(room, rita);
    await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" });
    await rita.ok("rules.activate", { fields: { digest: DEMO_DIGESTS.issue, name: "issue" }, values: [canonicalize(issueDemo)], idempotencyKey: "activate-issue" });
    const opened = await rita.ok("issue.create", { fields: { definition: DEMO_DIGESTS.issue, title: "An issue", conditions: ["c"] }, idempotencyKey: "issue-1" });
    await rita.ok("wait", { scope: "directory", entry: (opened["fact"] as FactRef).seq });
    await rita.tick(); await rita.tick();
    const baseline = rita.told;

    // A standalone scope founded through one connection. The configuration records it; a second connection of the same
    // configuration, and a restarted one, list its acts.
    const second = room.agent("rita, second connection", { secret: rita.secret, config: rita.config, share: true });
    // The second connection has derived its list once, before the scope exists.
    await second.ok("room", {});
    const creation = await rita.ok("create", { definition: garden, kind: "start", fields: { opener: "@rita", title: "A garden", conditions: ["it grows"] }, membership: rita.config.repository!.membership, idempotencyKey: "garden" });
    expect(creation["answer"], JSON.stringify(creation)).toBe("accepted");
    const root = creation["scope"] as ScopeId;
    expect(rita.config.roots).toContainEqual({ scope: root, membership: rita.config.repository!.membership });
    // Changed by another connection: the second's next call by a tool name it has not listed finds the new root's act, with no
    // list or room call first.
    const planted = await second.ok("garden.plant", { target: root, fields: { crop: "beans", rows: ["north"] }, idempotencyKey: "external-root" });
    // The scope's own answer may be unavailable until its authority is observed; what this shows is that the call was bound,
    // signed and judged under the new root's tool.
    expect([planted["tool"], ["accepted", "unavailable"].includes(planted["answer"] as string)], JSON.stringify(planted)).toEqual(["garden.plant", true]);
    expect(await second.names()).toEqual(expect.arrayContaining(["garden.plant", "garden.tend", "garden.harvest"]));
    const restarted = room.agent("rita, restarted", { secret: rita.secret, config: rita.config, share: true });
    expect(await restarted.names()).toEqual(await second.names());
    await rita.tick(); await rita.tick();
    expect(rita.told - baseline, "a configured scope is a change of the list").toBe(1);

    // An activation made elsewhere, while rita's client is idle and subscribed: told at the watch's next run, once.
    const page1 = await rita.service.page();
    expect(page1.nextCursor).toBeDefined();
    const before = rita.told;
    // An ordinary head advance first: a comment. Nothing is told, and the cursor stays good.
    await second.ok("issue.comment", { target: 1, fields: { body: "An ordinary step." }, idempotencyKey: "comment-1" });
    await rita.tick();
    expect(rita.told).toBe(before);
    const page2 = await rita.service.page(page1.nextCursor);
    expect(page2.generation).toBe(page1.generation);
    const activated = await second.ok("rules.activate", { fields: { digest: definitionDigest(garden), name: "garden" }, values: [canonicalize(garden)], idempotencyKey: "activate-garden" });
    expect(activated["answer"], JSON.stringify(activated)).toBe("accepted");
    expect(rita.told, "nothing is told before the watch runs").toBe(before);
    await rita.tick();
    expect(rita.told).toBe(before + 1);
    await rita.tick();
    expect(rita.told, "a change is told once").toBe(before + 1);
    // A cursor of the earlier generation is refused with restart.
    await expect(room.wait(() => rita.service.page(page1.nextCursor))).rejects.toBeInstanceOf(ListRestart);

    // Mixed standing: a second standalone scope whose membership is not known. Its acts are listed with the sentence that the
    // standing is unknown; the room's scopes keep the caller's role.
    const unknown = await rita.ok("create", { definition: garden, kind: "start", fields: { opener: { membership: rita.config.repository!.membership, member: "@rita" }, title: "Another garden", conditions: ["c"] }, idempotencyKey: "garden-2" });
    expect(unknown["answer"]).toBe("accepted");
    const tools = (await rita.service.page()).tools;
    const all = [...tools];
    for (let cursor = (await rita.service.page()).nextCursor; cursor; ) { const p = await rita.service.page(cursor); all.push(...p.tools); cursor = p.nextCursor; }
    const plant = all.find((t) => t.name === "garden.plant")!;
    expect(plant.description).toContain("needs issue.comment; your standing is unknown on some scopes of this kind, and each scope decides");
    expect(all.find((t) => t.name === "issue.comment")!.description).toContain("which your role (admin) holds");
    const roomView = await rita.ok("room", {});
    expect(roomView["standing"]).toEqual(expect.arrayContaining([expect.objectContaining({ membership: rita.config.repository!.membership.scope, role: "admin" })]));
    expect((roomView["roots"] as { scope: string }[]).map((r) => r.scope)).toEqual([root, unknown["scope"]]);
  } finally { room.done(); }
}, 600_000);
