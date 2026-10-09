import { expect, test } from "vitest";
import { act, actsOn, fieldValue, listLanes, loadIssue, openRoom, placeOf } from "../src/data.ts";
import { issueTaskValues } from "../src/task-values.ts";
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
  } finally { d.done(); }
}, 120_000);
