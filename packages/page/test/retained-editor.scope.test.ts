import { expect, test } from "vitest";
import { takeBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { act, joinRoom, listLanes, loadChange, openRoom, placeOf } from "../src/data.ts";
import { checkEditRequest, continueEdit, prepareEdit } from "../src/retained-editor-data.ts";
import { demo } from "./support/demo.ts";

// Real native directory/membership/change/rules and HTTP reads/signing. STAND-INS: Git host and scheduler from demo.
// Invariant: a member can create a NEW corrected one-file proposal, retaining the old manifest; unknown replies stop next steps.
test("retained text creates a new member proposal with exact bytes and original history; lost accepted opening has no second signature (STAND-IN Git/scheduler)", async () => {
  const d = await demo();
  try {
    const sourceRun = await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Editor source");
    expect(sourceRun.code, sourceRun.lines.join("\n")).toBe(0);
    const secret = crypto.getRandomValues(new Uint8Array(32)); expect((await joinRoom(d.as(secret), d.link)).answer.answer).toBe("accepted");
    const room = await openRoom(d.as(secret), placeOf(JSON.stringify(d.config))!);
    const row = (await listLanes(room)).changes.find(r => r.title === "Editor source")!;
    const source = await loadChange(room, row.scope); const original = source.manifests[0]!;
    const draft = { title: "Member correction", path: "docs/correct.md", content: "\ufeff# café\r\n" };
    const options = { current: () => true, pause: d.pause };
    const task = await prepareEdit(room, source, original.id, draft, options);
    await continueEdit(room, task, options);
    expect(task.state, task.message).toBe("recorded");
    expect(task.lane).not.toBe(source.scope);
    expect(task.steps.map(s => [s.kind, s.attempted, s.answer?.answer, s.receiptVerified])).toEqual([["open-pr",true,"accepted",true],["ask-rules",true,"accepted",true],["propose-file",true,"accepted",true]]);
    const file = task.steps[2]!.signed.intent.fields;
    expect(file).toMatchObject({ base: task.base, path: draft.path, content: draft.content, size: utf8(draft.content).length });
    const corrected = await loadChange(room, task.lane!);
    expect(corrected.state).toBe("open"); expect(corrected.merges).toEqual([]); expect(corrected.manifests[0]!.file?.content).toBe(draft.content);
    expect(corrected.body).toContain(source.scope);
    expect((await loadChange(room, source.scope)).manifests[0]).toEqual(original);
    const rewrite = await act(room, task.lane!, "propose-file", { fields: file });
    expect(rewrite.answer).toMatchObject({ answer: "refused", name: "one-version" });
    const merge = await act(room, task.lane!, "merge", { fields: { manifest: corrected.manifests[0]!.id, reports: [] } });
    expect(merge.answer).toMatchObject({ answer: "refused", reason: "unauthorized" });

    let mutationPosts = 0;
    const lost = { ...room, session: { ...room.session, fetch: (async (url: string, init?: Parameters<typeof d.fetch>[1]) => {
      const reply = await d.fetch(url, init);
      if (init?.method === "POST" && new URL(url).pathname.endsWith("/acts")) { mutationPosts++; throw new Error("Lost accepted answer"); }
      return reply;
    }) as typeof d.fetch } };
    const unknown = await prepareEdit(lost, source, original.id, { ...draft, title: "Lost opening" }, options);
    await continueEdit(lost, unknown, options);
    expect(unknown.state).toBe("unknown"); expect(unknown.steps).toHaveLength(1); expect(unknown.steps[0]!.attempted).toBe(true);
    const envelope = JSON.stringify(unknown.steps[0]!.signed);
    await continueEdit(lost, unknown, options);
    expect(mutationPosts).toBe(1); expect(JSON.stringify(unknown.steps[0]!.signed)).toBe(envelope);
    await checkEditRequest(room, unknown, options);
    expect(unknown.state).toBe("waiting-lane");
    await continueEdit(room, unknown, options);
    expect(unknown.state, unknown.message).toBe("recorded");
    expect(JSON.stringify(unknown.steps[0]!.signed)).toBe(envelope);
  } finally { d.done(); }
}, 180_000);

// Invariant: invalid input and changed context/base cannot cause a new mutation, including after an accepted opening.
test("invalid target and stale context/base send nothing new; an invalid old proposal is corrected in a new lane (STAND-IN Git/scheduler)", async () => {
  const d = await demo();
  try {
    const bad = await d.run(d.paul, "edit", "../outside.md", "--file", "readme.md", "--title", "Invalid source");
    expect(bad.code).toBe(1);
    const room = await openRoom(d.as(await d.secretOf(d.paul)), placeOf(JSON.stringify(d.config))!);
    const oldRow = (await listLanes(room)).changes.find(r => r.title === "Invalid source")!;
    const old = await loadChange(room, oldRow.scope);
    expect(old.manifests[0]!.file?.path).toBe("../outside.md");
    let posts = 0;
    const watched = { ...room, session: { ...room.session, fetch: (async (url: string, init?: Parameters<typeof d.fetch>[1]) => { if (init?.method === "POST" && new URL(url).pathname.endsWith("/acts")) posts++; return d.fetch(url, init); }) as typeof d.fetch } };
    const options = { current: () => true, pause: d.pause };
    await expect(prepareEdit(watched, old, old.manifests[0]!.id, { title: "Bad", path: "../bad.md", content: "x" }, options)).rejects.toThrow("relative path");
    expect(posts).toBe(0);
    const corrected = await prepareEdit(watched, old, old.manifests[0]!.id, { title: "Correct path", path: "inside.md", content: "# corrected\n" }, options);
    await continueEdit(watched, corrected, options);
    expect(corrected.state, corrected.message).toBe("recorded");
    expect((await loadChange(room, old.scope)).manifests[0]!.file?.path).toBe("../outside.md");

    const mutable = { title: "Captured draft", path: "capture.md", content: "original bytes" };
    const preparing = prepareEdit(room, old, old.manifests[0]!.id, mutable, options);
    mutable.content = "changed during reads";
    const captured = await preparing;
    expect(captured.draft.content).toBe("original bytes");

    let same = true;
    const stopped = await prepareEdit(watched, old, old.manifests[0]!.id, { title: "Context guard", path: "context.md", content: "x" }, { current: () => same });
    const before = posts; same = false;
    await continueEdit(watched, stopped, { current: () => same });
    expect(stopped.state).toBe("stopped"); expect(stopped.steps).toEqual([]); expect(posts).toBe(before);

    let current = true; let triggered = false; let crossed = 0;
    const raceRoom = { ...room, session: { ...room.session, fetch: (async (url: string, init?: Parameters<typeof d.fetch>[1]) => {
      const reply = await d.fetch(url, init);
      if (init?.method === "POST" && new URL(url).pathname.endsWith("/acts")) crossed++;
      if (!triggered && race.steps.length > 0 && !race.steps[0]!.attempted && new URL(url).pathname.includes(room.destination)) { triggered = true; current = false; }
      return reply;
    }) as typeof d.fetch } };
    const race = await prepareEdit(room, old, old.manifests[0]!.id, { title: "Pre-POST context guard", path: "race.md", content: "x" }, options);
    await continueEdit(raceRoom, race, { current: () => current, pause: d.pause });
    expect(triggered).toBe(true); expect(crossed).toBe(0); expect(race.steps[0]!.attempted).toBe(false); expect(race.state).toBe("stopped");

    let reIncPosts = 0;
    const reincarnated = await prepareEdit(room, old, old.manifests[0]!.id, { title: "Directory identity guard", path: "inc.md", content: "x" }, options);
    const changedDirectory = { ...room, session: { ...room.session, fetch: (async (url: string, init?: Parameters<typeof d.fetch>[1]) => {
      const reply = await d.fetch(url, init);
      if (init?.method === "POST" && new URL(url).pathname.endsWith("/acts")) reIncPosts++;
      if (reIncPosts > 0 && new URL(url).pathname.endsWith(`/${room.directory}`)) {
        const bytes = reply.body ? await takeBytes(reply.body, 256 * 1024, AbortSignal.timeout(30_000)) : null;
        if (!(bytes instanceof Uint8Array)) return reply;
        const read = JSON.parse(new TextDecoder().decode(bytes));
        if (read.ok) read.value.scope.inc = d.config.repository!.membership.inc;
        return new Response(JSON.stringify(read));
      }
      return reply;
    }) as typeof d.fetch } };
    await continueEdit(changedDirectory, reincarnated, options);
    expect(reIncPosts).toBe(1); expect(reincarnated.state).toBe("stopped"); expect(reincarnated.message).toContain("directory incarnation");
    expect(reincarnated.steps[0]!.answer?.answer).toBe("accepted");

    const moved = await prepareEdit(watched, old, old.manifests[0]!.id, { title: "Moved base", path: "moved.md", content: "x" }, options);
    const published = await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Move base before editor submit");
    expect(published.code, published.lines.join("\n")).toBe(0);
    const beforeMoved = posts;
    await continueEdit(watched, moved, options);
    expect(moved.state).toBe("stopped"); expect(moved.steps).toEqual([]); expect(posts).toBe(beforeMoved);
  } finally { d.done(); }
}, 180_000);
