import { expect, test } from "vitest";
import { ScopeHandle, httpTransport, type Fetch } from "@generalbusiness/artroom-client";
import { command } from "@generalbusiness/artroom-cli";
import { canonicalize, definitionDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { changeDemo3 } from "@generalbusiness/artroom-lanes";
import { act, joinRoom, listLanes, loadChange, openRoom, placeOf, type Room } from "../src/data.ts";
import { checkEditRequest, continueEdit, editFields, prepareEdit, readEditSource } from "../src/retained-editor-data.ts";
import { demo } from "./support/demo.ts";

// Native directory, membership, collection/freeze and exact signed receipts.
// Git host, scheduler and clock are the demo's explicit stand-ins.
async function fixture() {
  const d = await demo(undefined, null, { editorOnly: true });
  expect((await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Original editor source")).code).toBe(0);
  const secret = crypto.getRandomValues(new Uint8Array(32));
  expect((await joinRoom(d.as(secret), d.link)).answer.answer).toBe("accepted");
  const room = await openRoom(d.as(secret), placeOf(JSON.stringify(d.config))!);
  const row = (await listLanes(room)).changes.find(value => value.title === "Original editor source")!;
  const source = await loadChange(room, row.scope), original = source.manifests.find(value => value.id === source.currentManifest)!;
  const bytes = utf8(canonicalize(changeDemo3));
  expect((await command({ ...d.rita, read: async () => bytes }, ["act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "list1.json"])).code).toBe(0);
  return { d, room, source, original, options: { current: () => true, pause: d.pause }, draft: { title: "One frozen edit", path: "docs/correct.md", content: "\ufeff# café\r\n" } };
}

test("the known LIST1 member editor freezes exactly one authenticated source; source receipts are not versions (native; Git/scheduler stand-ins)", async () => {
  const f = await fixture();
  try {
    const before = f.d.at.stand.refs.get("refs/heads/main"), task = await prepareEdit(f.room, f.source, f.original.id, f.draft, f.options);
    expect(task.workflow).toBe("list1");
    const stages: { state: string; version: number | undefined }[] = [];
    await continueEdit(f.room, task, { ...f.options, changed: () => stages.push({ state: task.state, version: task.version?.seq }) });
    expect(task.state, task.message).toBe("recorded");
    expect(stages.some(value => value.state === "source-recorded" && value.version === undefined)).toBe(true);
    expect(task.steps.map(step => [step.kind, step.answer?.answer, step.receiptVerified])).toEqual([["open-pr","accepted",true],["ask-rules","accepted",true],["propose-file","accepted",true],["propose-manifest","accepted",true]]);
    const sourceStep = task.steps[2]!, frozen = task.steps[3]!;
    expect(frozen.signed.intent.fields).toEqual({ base: task.base, files: [{ path: f.draft.path, entry: task.collectedSource, digest: sourceStep.signed.intent.fields["digest"] }] });
    expect(task.version).not.toEqual(task.collectedSource);
    const changed = await loadChange(f.room, task.lane!), manifest = changed.manifests.find(value => value.id === task.version!.seq)!;
    expect([changed.currentManifest, changed.merges, manifest.file?.content]).toEqual([task.version!.seq, [], f.draft.content]);
    const retained = await readEditSource(f.room, changed, manifest.id);
    expect([retained.manifestFact, retained.sourceFact, retained.base, retained.path, retained.size]).toEqual([task.version, task.collectedSource, task.base, f.draft.path, utf8(f.draft.content).length]);
    expect(f.d.at.stand.refs.get("refs/heads/main")).toBe(before);
    expect((await loadChange(f.room, f.source.scope)).manifests.find(value => value.id === f.original.id)).toEqual(f.original);
  } finally { f.d.done(); }
}, 120_000);

test("an extra collected source stops the bounded editor before freeze without silently including it (native; Git/scheduler stand-ins)", async () => {
  const f = await fixture();
  try {
    let inserted = false;
    const watched: Room = { ...f.room, session: { ...f.room.session, fetch: (async (url, init) => {
      const response = await f.d.fetch(url, init);
      const signed = init?.method === "POST" && new URL(url).pathname.endsWith("/acts") ? JSON.parse(String(init.body)).signed : null;
      if (!inserted && signed?.intent.kind === "propose-file") {
        inserted = true;
        expect((await act(f.room, signed.intent.to.scope, "propose-file", { fields: editFields({ title: "Another source", path: "extra.md", content: "extra\n" }, signed.intent.fields.base) })).answer.answer).toBe("accepted");
      }
      return response;
    }) as Fetch } };
    const task = await prepareEdit(watched, f.source, f.original.id, f.draft, f.options);
    await continueEdit(watched, task, f.options);
    expect(task.state).toBe("stopped"); expect(task.message).toContain("Another collected source");
    expect(task.steps.map(step => step.kind)).toEqual(["open-pr","ask-rules","propose-file"]);
    expect(task.collectedSource).toBeDefined(); expect(task.version).toBeUndefined();
    expect((await loadChange(f.room, task.lane!)).currentManifest).toBeNull();
  } finally { f.d.done(); }
}, 120_000);

test.each(["propose-file", "propose-manifest"] as const)("unknown %s keeps the exact original envelope and no next signature until native settlement (Git/scheduler/loss stand-ins)", async (lostKind) => {
  const f = await fixture();
  try {
    let lost = false, posts = 0;
    const watched: Room = { ...f.room, session: { ...f.room.session, fetch: (async (url, init) => {
      const signed = init?.method === "POST" && new URL(url).pathname.endsWith("/acts") ? JSON.parse(String(init.body)).signed : null;
      if (signed) posts++;
      if (!lost && signed?.intent.kind === lostKind && lostKind === "propose-file") { lost = true; throw new Error("Source delivery has no answer"); }
      const response = await f.d.fetch(url, init);
      if (!lost && signed?.intent.kind === lostKind) { lost = true; await (response as unknown as Response).body?.cancel(); throw new Error("Lost accepted freeze reply"); }
      return response;
    }) as Fetch } };
    const task = await prepareEdit(watched, f.source, f.original.id, f.draft, f.options);
    await continueEdit(watched, task, f.options);
    expect(task.state).toBe("unknown"); expect(task.version).toBeUndefined();
    const before = posts, envelope = canonicalize(task.steps.at(-1)!.signed);
    await continueEdit(watched, task, f.options);
    expect([posts, canonicalize(task.steps.at(-1)!.signed)]).toEqual([before, envelope]);
    if (lostKind === "propose-file") {
      await checkEditRequest(f.room, task, f.options);
      expect(task.state).toBe("unknown");
      expect(task.message).toContain("remains unresolved");
      await continueEdit(watched, task, f.options);
      expect([posts, canonicalize(task.steps.at(-1)!.signed)]).toEqual([before, envelope]);
      // The transport later delivers the original request, not a new signature.
      const original = task.steps.at(-1)!;
      expect((await new ScopeHandle(httpTransport(f.room.session.service, { fetch: f.d.fetch }), original.target.scope, f.room.reader!.reader()).submit(original.signed, original.grants, original.beside)).answer).toBe("accepted");
    }
    await checkEditRequest(f.room, task, f.options);
    expect(task.state).toBe(lostKind === "propose-file" ? "source-recorded" : "recorded");
    await continueEdit(f.room, task, f.options);
    expect(task.state, task.message).toBe("recorded");
    expect(canonicalize(task.steps.find(step => step.kind === lostKind)!.signed)).toBe(envelope);
    expect(task.version).toBeDefined(); expect((await loadChange(f.room, task.lane!)).merges).toEqual([]);
  } finally { f.d.done(); }
}, 120_000);
