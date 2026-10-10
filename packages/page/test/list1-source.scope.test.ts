import { expect, test } from "vitest";
import type { FactRef } from "@generalbusiness/artroom-contract";
import type { Fetch } from "@generalbusiness/artroom-client";
import { canonicalize, definitionDigest, digestBytes, entryHash, takeBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { changeDemo3 } from "@generalbusiness/artroom-lanes";
import { command } from "@generalbusiness/artroom-cli";
import { act, fieldValue, listLanes, loadChange, openRoom, placeOf } from "../src/data.ts";
import { demo } from "./support/demo.ts";

// Actual native collection/freeze and authenticated reads. Git host and
// scheduler remain the demo's stand-ins; no Site/HEAD fallback is used.
test("LIST1 preview authenticates the exact frozen source and rejects altered or missing source evidence", async () => {
  let source: FactRef | null = null, fault: "none" | "missing" | "tampered" | "resealed" | "wrong-incarnation" | "wrong-hash" = "none", siteReads = 0;
  const d = await demo((fetch) => (async (url, init) => {
    if (new URL(url).pathname.startsWith("/site/")) siteReads++;
    if (!source || new URL(url).pathname !== `/v1/scopes/${source.at.scope}/entries/${source.seq}` || fault === "none") return fetch(url, init);
    if (fault === "missing") return Response.json({ ok: false, reason: "not-found" });
    const response = await fetch(url, init), bytes = response.body ? await takeBytes(response.body, 1024 * 1024, AbortSignal.timeout(30_000)) : null;
    if (!(bytes instanceof Uint8Array)) throw new Error("The source read returned no bounded whole reply.");
    const read = JSON.parse(new TextDecoder().decode(bytes)) as { ok: boolean; value: { entry: import("@generalbusiness/artroom-contract").Entry; hash: string } };
    if (read.ok && read.value.entry.input.type === "act") { if (fault === "wrong-hash") read.value.hash = `sha256:${"f".repeat(64)}`; else if (fault === "wrong-incarnation") read.value.entry.at = { ...read.value.entry.at, inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa" }; else read.value.entry.input.signed.intent.fields["content"] = "# Forged\n"; if (fault === "resealed" || fault === "wrong-incarnation") read.value.hash = entryHash(read.value.entry); }
    return Response.json(read);
  }) as Fetch);
  try {
    const bytes = utf8(canonicalize(changeDemo3));
    expect((await command({ ...d.rita, read: async () => bytes }, ["act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "list1.json"])).code).toBe(0);
    const room = await openRoom(d.as(await d.secretOf(d.rita)), placeOf(JSON.stringify(d.config))!);
    expect((await act(room, room.directory, "open-pr", { fields: { definition: definitionDigest(changeDemo3), title: "Frozen one-file source", draft: false } })).answer.answer).toBe("accepted");
    await d.pause([room.directory]); const lane = (await listLanes(room)).changes.find((value) => value.title === "Frozen one-file source")!;
    const base = d.at.stand.refs.get("refs/heads/main")!, content = "# Frozen source\n", digest = digestBytes(utf8(content));
    const offered = await act(room, lane.scope, "propose-file", { fields: { base, path: "guide.md", digest, size: utf8(content).length, content } });
    expect(offered.answer.answer).toBe("accepted"); if (offered.answer.answer !== "accepted") return;
    source = offered.answer.receipt.fact;
    expect((await act(room, lane.scope, "propose-manifest", { fields: { base, files: fieldValue(room, "list", JSON.stringify([{ path: "guide.md", digest, entry: source }])) } })).answer.answer).toBe("accepted");
    const projected = await loadChange(room, lane.scope);
    expect(projected.manifests.find((value) => value.id === projected.currentManifest)?.file).toMatchObject({ path: "guide.md", digest, size: utf8(content).length, content });
    for (fault of ["missing", "tampered", "resealed", "wrong-incarnation", "wrong-hash"] as const) expect((await loadChange(room, lane.scope)).manifests.find((value) => value.state === "current")?.file).toBeNull();
    expect(siteReads).toBe(0);
  } finally { d.done(); }
}, 120_000);
