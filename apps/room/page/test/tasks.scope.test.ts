import { runInDurableObject } from "cloudflare:test";
import type { Entry } from "@generalbusiness/dap-contract";
import { SqliteStore } from "@generalbusiness/artroom-scope";
import { Platform } from "../../../../packages/scope/test/repository.ts";
import { expect, test } from "vitest";
import { act, actsOn, fieldValue, listLanes, loadChange, loadIssue, openRoom, placeOf } from "../src/data.ts";
import { changeTaskContext, issueTaskValues } from "../src/task-values.ts";
import { firstExtents, platform } from "@generalbusiness/dap-platform";
import { demo } from "./support/demo.ts";

/** Read-only bounded diagnostic projection; no values, tokens or recorded bodies. */
async function publicationCheckpoint(node: Platform) {
  return runInDurableObject(node.object, (_instance, state) => {
    const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: closure => state.storage.transactionSync(closure) });
    const scope = store.scope();
    const operationPage = store.operations(null, 16, false);
    const first = store.stored(0);
    const birth = first ? JSON.parse(first.bytes) as Entry : null;
    const definition = birth?.input.type === "genesis" ? birth.input.seed.definition : null;
    const code = definition ? platform(definition) : null;
    const publicationPage = store.page("publication", Object.keys(code?.data.items["publication"]?.states ?? {}), null, 16);
    const branch = store.page("branch", ["empty", "ready"], null, 1).items[0];
    const entries = [];
    for (let seq = Math.max(0, (scope?.head.seq ?? -1) - 7); seq <= (scope?.head.seq ?? -1); seq++) {
      const row = store.stored(seq);
      if (!row) continue;
      const entry = JSON.parse(row.bytes) as Entry;
      entries.push({ seq, hash: row.hash, input: entry.input.type,
        kind: entry.input.type === "act" ? entry.input.signed.intent.kind : entry.input.type === "outcome" ? entry.input.kind : null,
        effects: entry.effects.map(effect => ({ effect: effect.effect,
          ...(effect.effect === "state" ? { item: effect.item, state: effect.state } : {}),
          ...(effect.effect === "value" || effect.effect === "ref" ? { item: effect.item, slot: effect.slot } : {}) })) });
    }
    return { scope: scope?.at ?? null, head: scope?.head ?? null, definition,
      branch: branch ? { id: branch.id, state: branch.state, directory: branch.refs["directory"] ?? null, judging: branch.refs["judging"] ?? null, slot: branch.refs["slot"] ?? null } : null,
      publications: publicationPage.items.map(item => ({ id: item.id, state: item.state, operation: item.refs["operation"] ?? null, lane: item.refs["lane"] ?? null })),
      operations: operationPage.operations.map(({ operation, state, sends }) => ({ id: operation.id, kind: operation.kind, for: operation.for ?? null, state,
        attempts: operation.attempts.map(attempt => ({ attempt: attempt.attempt, opened: attempt.opened, outcomes: attempt.outcomes.map(outcome => ({ seq: outcome.seq, result: outcome.result })) })), sends })),
      operationsMore: operationPage.more, publicationsMore: publicationPage.more, entries };
  });
}

// The same pure form payload reaches actual native Page signing and Scope
// outcomes. DOM rendering has its Node witness; host and scheduler are stand-ins.
test("Create issue task values and conversation comments produce native recorded work", async ({ task }) => {
  const d = await demo();
  try {
    const room = await openRoom(d.as(await d.secretOf(d.paul)), placeOf(JSON.stringify(d.config))!);
    const open = (await actsOn(room, room.directory)).acts.find((value) => value.kind === "open-issue")!;
    const definition = open.fields.find((value) => value.name === "definition")!.choices![0]!.value;
    const typed = issueTaskValues({ definition, title: "Write the start page", body: "Explain how to begin." });
    const fields = Object.fromEntries(Object.entries(typed).map(([name, value]) => [name, fieldValue(room, open.fields.find((field) => field.name === name)!.type, value)]));
    const result = await act(room, room.directory, "open-issue", { fields });
    expect(result.answer.answer, JSON.stringify(result.answer)).toBe("accepted");
    await d.pause([room.directory]);
    const issue = (await listLanes(room)).issues.find((value) => value.title === "Write the start page")!;
    expect(await loadIssue(room, issue.scope)).toMatchObject({ conditions: ["Write the start page"], body: "Explain how to begin." });
    const commented = await act(room, issue.scope, "comment", { fields: { body: "I can write this." } });
    expect(commented.answer.answer).toBe("accepted");
    expect((await loadIssue(room, issue.scope)).comments.at(-1)).toMatchObject({ author: "@paul", body: "I can write this." });
    const controller = await openRoom(d.as(await d.secretOf(d.rita)), placeOf(JSON.stringify(d.config))!);
    const extents = firstExtents({ approvals: 1, checks: [] });
    expect((await d.run(d.rita, "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=1", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(extents)}`)).code).toBe(0);
    const proposal = await d.run(d.paul, "edit", "README.md", "--file", "readme.md", "--title", "Reviewed handbook");
    expect(proposal.code).toBe(1);
    const row = (await listLanes(room)).changes.find((value) => value.title === "Reviewed handbook")!;
    const authored = await loadChange(room, row.scope);
    expect(authored.currentManifest).toEqual(expect.any(Number));
    expect(authored.reviewMembers?.map((value) => value.value)).toContain("@rita");
    const requested = await act(room, row.scope, "request-review-own", { fields: { requested: fieldValue(room, "member", "@rita") } });
    expect(requested.answer.answer).toBe("accepted");
    if (requested.answer.answer !== "accepted") throw new Error("Native review request unavailable");
    const request = requested.answer.receipt.fact.seq;
    const selected = await loadChange(controller, row.scope), reviewValues = changeTaskContext(selected, controller).defaults!["review-verdict"]!.fields!;
    expect(selected.reviewExtents?.map((value) => value.value)).toContain("source");
    expect(selected.requests.find(value => value.id === request)?.requestedRef).toEqual(controller.me?.ref);
    expect(reviewValues["request"]).toBe(String(request));
    expect((await act(controller, row.scope, "review-verdict", { fields: { manifest: Number(reviewValues["manifest"]), request: Number(reviewValues["request"]), verdict: "approve", extent: "source" } })).answer.answer).toBe("accepted");
    expect((await loadChange(controller, row.scope)).requests.find(value => value.id === request)?.state).toBe("met");
    const mergeValues = changeTaskContext(await loadChange(room, row.scope)).defaults!["merge"]!.fields!;
    const current = (await loadChange(room, row.scope)).manifests.find((value) => value.id === Number(mergeValues["manifest"]))!;
    expect(current.selectedReports).toEqual([]); // Authenticated source-only selection, not a checker-log substitute.
    expect((await act(room, row.scope, "merge", { fields: { manifest: Number(mergeValues["manifest"]), reports: fieldValue(room, "list", mergeValues["reports"]!) } })).answer.answer).toBe("accepted");
    await d.pause([row.scope, d.G.name]);
    const published = await loadChange(room, row.scope);
    Object.assign(task.meta, { publicationCheckpoint: await publicationCheckpoint(d.G) });
    expect(published.merges.some((value) => value.state === "published" && value.manifest === Number(mergeValues["manifest"]))).toBe(true);
    expect(published.state).toBe("merged");
  } finally { d.done(); }
}, 120_000);
