import { expect, test } from "vitest";
import { act, actsOn, fieldValue, listLanes, loadChange, loadIssue, openRoom, placeOf } from "../src/data.ts";
import { changeTaskContext, issueTaskValues } from "../src/task-values.ts";
import { firstExtents } from "@generalbusiness/artroom-platform";
import { demo } from "./support/demo.ts";

// The same pure form payload reaches actual native Page signing and Scope
// outcomes. DOM rendering has its Node witness; host and scheduler are stand-ins.
test("Create issue task values and conversation comments produce native recorded work", async () => {
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
    expect((await act(room, row.scope, "request-review-own", { fields: { requested: fieldValue(room, "member", "@rita") } })).answer.answer).toBe("accepted");
    const selected = await loadChange(controller, row.scope), reviewValues = changeTaskContext(selected).defaults!["review-verdict"]!.fields!;
    expect(selected.reviewExtents?.map((value) => value.value)).toContain("source");
    expect((await act(controller, row.scope, "review-verdict", { fields: { manifest: Number(reviewValues["manifest"]), verdict: "approve", extent: "source" } })).answer.answer).toBe("accepted");
    const mergeValues = changeTaskContext(await loadChange(room, row.scope)).defaults!["merge"]!.fields!;
    const current = (await loadChange(room, row.scope)).manifests.find((value) => value.id === Number(mergeValues["manifest"]))!;
    expect(current.selectedReports).toEqual([]); // Authenticated source-only selection, not a checker-log substitute.
    expect((await act(room, row.scope, "merge", { fields: { manifest: Number(mergeValues["manifest"]), reports: fieldValue(room, "list", mergeValues["reports"]!) } })).answer.answer).toBe("accepted");
    await d.pause([row.scope, d.G.name]);
    const published = await loadChange(room, row.scope);
    expect(published.merges.some((value) => value.state === "published" && value.manifest === Number(mergeValues["manifest"]))).toBe(true);
    expect(published.state).toBe("merged");
  } finally { d.done(); }
}, 120_000);
