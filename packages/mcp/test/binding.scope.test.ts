import { expect, test } from "vitest";
import type { DeclaredDefinition, Digest, FactRef } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { firstExtents, platform } from "@generalbusiness/dap-platform";
import { change, change3 } from "@generalbusiness/dap-lanes";
import { declarationDigest, variantOf, type DefinitionLike, type Tool } from "../src/index.ts";
import { issueLike, roomLike } from "./support/collisions.ts";
import { mcpRoom, type Agent } from "./support/room.ts";
import { exercises, created } from "./support/story.ts";

/** The tools of an agent's list, with the binding each records. */
async function tools(agent: Agent): Promise<Tool[]> {
  const all: Tool[] = [];
  for (let cursor: string | undefined, n = 0; n < 32; n++) {
    const page = await agent.service.page(cursor);
    all.push(...page.tools);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}
const bindingOf = (t: Tool) => t._meta?.["dap/binding"] as { definition: string; kind: string; declaration: string; digests: string[] } | undefined;
const toolFor = (list: Tool[], definition: string, kind: string, digest?: string): Tool => {
  const matched = list.find((t) => bindingOf(t)?.definition === definition && bindingOf(t)?.kind === kind && (digest === undefined || bindingOf(t)!.digests.includes(digest)));
  expect(matched, `a tool for ${definition} ${kind}`).toBeDefined();
  return matched!;
};

// Invariant: a tool is bound to exact declarations: same-name definitions whose rows differ get two variant tools, each refusing
// the other's lane as stale-descriptor before signing; names are resolved after mapping across the whole catalogue, with no
// privileged name, the same on every connection; a lane under a retired definition keeps its tools; a different-name definition
// with the same kind is served by neither; a field named like a control lives under fields; and a call by a name the list no
// longer holds is refused and the list derived again.
test("binding: variants, stale descriptors, retirement, collisions and controls", async () => {
  const room = mcpRoom();
  try {
    const rita = room.agent("rita");
    await created(room, rita);
    await rita.ok("rules.publish", { on: 0, fields: { approvals: 0, ownerMayReview: false, checks: [], labels: [], extents: firstExtents({ approvals: 0, checks: [] }) }, idempotencyKey: "publish" });
    for (const [key, definition] of [["change", change], ["change3", change3], ["issue-like", issueLike], ["room-like", roomLike]] as const) {
      const activated = await rita.ok("rules.activate", { fields: { digest: definitionDigest(definition), name: definition.name }, values: [canonicalize(definition)], idempotencyKey: `activate-${key}` });
      expect(activated["answer"], JSON.stringify(activated)).toBe("accepted");
    }
    const open = async (tool: string, fields: Record<string, unknown>, key: string): Promise<void> => {
      const opened = await rita.ok(tool, { fields, idempotencyKey: key });
      expect(opened["answer"], JSON.stringify(opened)).toBe("accepted");
      expect((await rita.ok("wait", { scope: "directory", entry: (opened["fact"] as FactRef).seq }))["timedOut"]).toBe(false);
    };
    // Lanes 1 and 2: the two same-name change definitions. Lane 3: the room-like definition.
    await open("change.create", { definition: definitionDigest(change), title: "Under change", draft: false }, "lane-1");
    // A cached descriptor: with one change lane, change.propose-version is that declaration's alone. After a lane under change3,
    // a call by the cached name on that lane is refused before signing, names the tool that serves it, and the list is derived again.
    expect(await rita.names()).toContain("change.propose-version");
    await open("change.create", { definition: definitionDigest(change3), title: "Under change3", draft: false }, "lane-2");
    const cachedManifest = { base: "a".repeat(40), complete: true, decisions: [], instance: "i-1", integration: "b".repeat(40), selected: [], tree: "c".repeat(40) };
    const cached = await rita.call("change.propose-version", { target: 2, fields: cachedManifest, idempotencyKey: "cached" });
    expect([cached.isError, cached.structuredContent["error"]]).toEqual([true, "stale-descriptor"]);
    expect(cached.structuredContent["message"]).toMatch(/The tool for that target is change\.propose-version@[0-9a-f]{8}\./);
    await open("issue.create", { definition: definitionDigest(roomLike), title: "Room-like", conditions: ["c"] }, "lane-3");

    // The same-name case: two variants of change.propose-version, each recording the digests it binds; no unsuffixed name.
    let list = await tools(rita);
    const names = list.map((t) => t.name);
    const v1 = toolFor(list, "change", "propose-manifest", definitionDigest(change));
    const v2 = toolFor(list, "change", "propose-manifest", definitionDigest(change3));
    const expected = (d: DeclaredDefinition) => `change.propose-version@${variantOf({ definition: "change", kind: "propose-manifest", declaration: declarationDigest(d as unknown as DefinitionLike, "propose-manifest") }, 8)}`;
    expect([v1.name, v2.name]).toEqual([expected(change), expected(change3)]);
    expect(names).not.toContain("change.propose-version");
    // A row both definitions hold byte for byte is one tool serving both digests.
    expect(bindingOf(toolFor(list, "change", "comment"))!.digests.sort()).toEqual([definitionDigest(change), definitionDigest(change3)].sort());

    // Each variant refuses the other's lane before anything is signed, and names the tool that serves it.
    const manifest = { base: "a".repeat(40), complete: true, decisions: [], instance: "i-1", integration: "b".repeat(40), selected: [], tree: "c".repeat(40) };
    const before = (await rita.ok("inspect", { scope: 2 }))["head"];
    const stale = await rita.call(v1.name, { target: 2, fields: manifest, idempotencyKey: "stale-1" });
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent["message"]).toMatch(new RegExp(`Before signing, the server found that sc_\\w+ runs change ${definitionDigest(change3)}, which this tool does not serve\\. Nothing was sent\\. The tool for that target is ${v2.name.replace(".", "\\.")}\\.`));
    expect((await rita.ok("inspect", { scope: 2 }))["head"]).toEqual(before);
    expect((await rita.call(v2.name, { target: 1, fields: manifest, idempotencyKey: "stale-2" })).structuredContent["message"]).toContain(`The tool for that target is ${v1.name}.`);
    // On its own lane, the variant sends the presented fact beside the intent, and the lane judges it.
    exercises("change", "propose-manifest", "presented");
    const judged = await rita.ok(v1.name, { target: 1, fields: manifest, presented: { pin: { at: (await rita.ok("inspect", { scope: 1 }))["ref"], seq: 0, hash: `sha256:${"0".repeat(64)}` } }, idempotencyKey: "presented-1" });
    expect(["accepted", "refused", "unavailable"]).toContain(judged["answer"]);

    // A different-name definition that declares the same kind is served by neither variant.
    const other = await rita.call(v1.name, { target: 3, fields: manifest, idempotencyKey: "stale-3" });
    expect(other.structuredContent["message"]).toMatch(/runs room sha256:\w+, which this tool does not serve\. Nothing was sent\. The tool for that target is room\.propose-manifest\./);

    // A byte-identical row under another kind and another name is another identity: room-like's join collides with membership's
    // room.join by name, and both get variants; the inbox's mark-read, whose row it copies, keeps its own name.
    expect(names).toEqual(expect.arrayContaining(["inbox.mark-read"]));
    const joins = names.filter((n) => n.startsWith("room.join"));
    expect([joins.length, joins.every((n) => /^room\.join@[0-9a-f]{8}$/.test(n))]).toEqual([2, true]);
    expect(canonicalize(roomLike.acts["join"])).toBe(canonicalize(platform("platform:inbox@1")!.data.acts["mark-read"]));
    expect(toolFor(list, "room", "join").name).not.toBe(toolFor(list, "platform:inbox", "mark-read").name);

    // issue.create is the directory's alone until a definition named issue declares create: the lane under issueLike makes the
    // name shared, and neither keeps it unsuffixed. No name is privileged.
    expect(names).toContain("issue.create");
    await open("issue.create", { definition: definitionDigest(issueLike), title: "Issue-like", conditions: ["c"] }, "lane-4");
    list = await tools(rita);
    expect(list.map((t) => t.name)).not.toContain("issue.create");
    const creates = list.filter((t) => t.name.startsWith("issue.create"));
    expect([creates.length, creates.every((t) => /^issue\.create@[0-9a-f]{8}$/.test(t.name))]).toEqual([2, true]);
    const directoryCreate = toolFor(list, "platform:directory", "open-issue");
    const laneCreate = toolFor(list, "issue", "create");
    // Both stay reachable: the directory's opens a lane; the lane's records a field named target, under fields.
    await open(directoryCreate.name, { definition: definitionDigest(issueLike), title: "Another", conditions: ["c"] }, "lane-5");
    const controlled = await rita.ok(laneCreate.name, { target: 4, fields: { target: "a field named target", idempotencyKey: "a field named idempotencyKey" }, idempotencyKey: "control-names" });
    expect(controlled["answer"], JSON.stringify(controlled)).toBe("accepted");
    const entry = await rita.ok("step", { scope: 4, seq: (controlled["fact"] as FactRef).seq });
    expect((entry["entry"] as { input: { signed: { intent: { fields: unknown; idempotencyKey: string } } } }).input.signed.intent).toMatchObject({ fields: { target: "a field named target", idempotencyKey: "a field named idempotencyKey" }, idempotencyKey: "control-names" });

    // The same names on a second connection, and after a reconnect; and both activities reachable in every launch mode.
    const second = room.agent("rita again", { secret: rita.secret, config: rita.config });
    expect((await tools(second)).map((t) => t.name)).toEqual(list.map((t) => t.name));
    const added = room.agent("rita, --generic=add", { secret: rita.secret, config: rita.config, mode: "add" });
    expect((await tools(added)).map((t) => t.name)).toEqual(expect.arrayContaining([...creates.map((t) => t.name), "actions", "act"]));
    const generic = room.agent("rita, --generic", { secret: rita.secret, config: rita.config, mode: "generic" });
    expect((await tools(generic)).some((t) => t.name.startsWith("issue.create"))).toBe(false);
    const offered = await generic.ok("actions", { scope: 4 });
    expect((offered["acts"] as { kind: string }[]).map((a) => a.kind)).toContain("create");
    const viaAct = await generic.ok("act", { target: 4, kind: "create", digest: offered["digest"], fields: { target: "via act" }, idempotencyKey: "via-act" });
    expect(viaAct["answer"]).toBe("accepted");
    const viaDirectory = await generic.ok("act", { target: "directory", kind: "open-issue", digest: "platform:directory@3", fields: { definition: definitionDigest(issueLike), title: "Via act", conditions: ["c"] }, idempotencyKey: "via-act-directory" });
    expect(viaDirectory["answer"]).toBe("accepted");

    // A lane under a retired definition keeps its tools: retire change3; its variant is listed and its lane is served.
    const rules = await rita.ok("items", { scope: "rules", type: "definition" });
    const row = (rules["items"] as { id: number; values: { digest: Digest } }[]).find((i) => i.values.digest === definitionDigest(change3))!;
    expect((await rita.ok("rules.retire", { on: row.id, idempotencyKey: "retire-change3" }))["answer"]).toBe("accepted");
    list = await tools(rita);
    expect(list.map((t) => t.name)).toContain(v2.name);
    const served = await rita.ok("change.comment", { target: 2, fields: { body: "Still served." }, idempotencyKey: "after-retire" });
    expect(served["answer"], JSON.stringify(served)).toBe("accepted");
    const third = room.agent("rita, reconnected", { secret: rita.secret, config: rita.config });
    expect((await tools(third)).map((t) => t.name)).toEqual(list.map((t) => t.name));
  } finally { room.done(); }
}, 600_000);
