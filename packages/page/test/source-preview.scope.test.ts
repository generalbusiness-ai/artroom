import { expect, onTestFinished, test } from "vitest";
import type { Read, Sealed } from "@generalbusiness/artroom-contract";
import { entryHash, takeBytes } from "@generalbusiness/artroom-bytes";
import { listLanes, loadChange, openRoom, placeOf } from "../src/index.ts";
import { demo } from "./support/demo.ts";

// The authenticated selected proposal is the preview source even when the
// repository has moved. Missing or forged opening bytes never become HEAD.
// Real Scope/HTTP/session reads; STAND-IN Git host and scheduler.
test("exact retained proposal source survives later publication; missing and tampered entry replies offer no source or HEAD fallback", async () => {
  const stageOrigin = performance.now();
  let lastStarted = "none", lastCompleted = "none";
  onTestFinished(() => { console.info("native-stage", "preview", "finished", performance.now() - stageOrigin, lastStarted, lastCompleted); });
  let failure: "none" | "missing" | "tampered" | "resealed" = "none";
  let entryReads = 0;
  let siteReads = 0;
  console.info("native-stage", "preview", "started", performance.now() - stageOrigin, lastStarted = "setup", lastCompleted);
  const d = await demo((fetch, owner) => async (url, init) => {
    if (new URL(url).pathname.startsWith("/site/")) siteReads++;
    const response = await fetch(url, init);
    owner.active();
    if (!new URL(url).pathname.includes("/entries/")) return response;
    entryReads++;
    if (failure === "missing") {
      await owner.required(async () => { await response.body?.getReader().cancel(); });
      return new Response(JSON.stringify({ ok: false, reason: "not-found" }));
    }
    if (failure === "none") return response;
    const bytes = response.body ? await owner.required(() => takeBytes(response.body!, 256 * 1024, AbortSignal.timeout(30_000))) : null;
    if (!(bytes instanceof Uint8Array)) throw new Error("The source-entry witness received no whole reply.");
    const read = JSON.parse(new TextDecoder().decode(bytes)) as Read<Sealed>;
    if (read.ok && read.value.entry.input.type === "act") {
      read.value.entry.input.signed.intent.fields["content"] = "# Forged latest content\n";
      if (failure === "resealed") read.value.hash = entryHash(read.value.entry);
    }
    return new Response(JSON.stringify(read));
  }, null, { editorOnly: true, invitation: false });
  console.info("native-stage", "preview", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "setup");
  try {
    console.info("native-stage", "preview", "started", performance.now() - stageOrigin, lastStarted = "open-room", lastCompleted);
    const room = await openRoom(d.as(await d.secretOf(d.rita)), placeOf(JSON.stringify(d.config))!);
    console.info("native-stage", "preview", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "open-room");
    console.info("native-stage", "preview", "started", performance.now() - stageOrigin, lastStarted = "original-publication-and-source", lastCompleted);
    expect((await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Original source")).code).toBe(0);
    const lane = (await listLanes(room)).changes.find((row) => row.title === "Original source")!;
    const original = await loadChange(room, lane.scope);
    expect(original.manifests[0]!.file?.content).toBe("# The handbook\n\nWritten by the room.\n");
    const published = original.merges[0]!.commit;
    console.info("native-stage", "preview", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "original-publication-and-source");
    console.info("native-stage", "preview", "started", performance.now() - stageOrigin, lastStarted = "later-publication-and-retained-source", lastCompleted);
    expect((await d.run(d.rita, "edit", "README.md", "--file", "agents.md", "--title", "Later source")).code).toBe(0);
    expect(d.at.stand.refs.get("refs/heads/main")).not.toBe(published);
    expect((await loadChange(room, lane.scope)).manifests[0]!.file?.content).toBe(original.manifests[0]!.file?.content);
    console.info("native-stage", "preview", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "later-publication-and-retained-source");
    console.info("native-stage", "preview", "started", performance.now() - stageOrigin, lastStarted = "fresh-source-faults", lastCompleted);
    for (failure of ["missing", "tampered", "resealed"] as const) {
      const before = entryReads;
      const change = await loadChange(room, lane.scope);
      expect(change.manifests[0]!.file?.content).toBeNull();
      expect(change.merges[0]!.commit).toBe(published);
      expect(entryReads - before).toBe(1);
    }
    expect(siteReads).toBe(0);
    console.info("native-stage", "preview", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "fresh-source-faults");
  } finally {
    console.info("native-stage", "preview", "started", performance.now() - stageOrigin, lastStarted = "cleanup", lastCompleted);
    d.done();
    console.info("native-stage", "preview", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "cleanup");
  }
});
