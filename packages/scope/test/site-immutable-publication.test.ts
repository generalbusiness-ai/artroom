import { expect, test } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { takeBytes } from "@generalbusiness/artroom-bytes";
import { demo } from "../../page/test/support/demo.ts";
import { PUBLICATION_PROOF_BOUNDS, type SitePublicationPeer } from "../src/site/publication.ts";

// Real CLI, lanes, destination judgments, receipt writes and production Git wiring.
// OwnGit/scheduler/clock/memory stores are labelled STAND-INs in the shared fixture.
// No provider or browser runs. Published authority is never fabricated in this witness.
test("two native publications retain older immutable content and deny pending/conflicting receipt before 304 without SQLite writes", async () => {
  const stageOrigin = performance.now();
  let lastStarted = "none", lastCompleted = "none";
  console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "setup", lastCompleted);
  const d = await demo(undefined, null, { editorOnly: true, invitation: false });
  console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "setup");
  const snapshot = () => d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
    d.active();
    const tables = state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").toArray();
    return tables.map(({ name }) => [name, state.storage.sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray()]);
  }));
  try {
    console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "two-publications", lastCompleted);
    expect((await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Original")).code).toBe(0);
    const first = d.at.stand.refs.get("refs/heads/main")!;
    expect((await d.run(d.rita, "edit", "README.md", "--file", "agents.md", "--title", "Later")).code).toBe(0);
    const later = d.at.stand.refs.get("refs/heads/main")!;
    expect(later).not.toBe(first);
    console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "two-publications");
    console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "retained-and-head-site", lastCompleted);
    const get = (ref: string, headers?: Record<string, string>) => d.fetch(`https://scopes.test/site/${d.D.name}/${ref}/README.md`, { ...(headers ? { headers } : {}) });
    const before = await snapshot();
    const old = await get(first);
    expect(old.status).toBe(200);
    const bodyOf = async (reply: Awaited<ReturnType<typeof get>>) => new TextDecoder().decode(await d.wait(() => takeBytes(reply.body!, 1024 * 1024, AbortSignal.timeout(30_000))) as Uint8Array);
    const body = await bodyOf(old);
    expect(body).toContain("The handbook");
    expect(body).toContain(`Rendered from commit <code>${first}</code>`);
    expect(body).toContain(`/site/${d.D.name}/${first}/`);
    expect(await bodyOf(await get("HEAD"))).toContain("Ask before you push");
    expect((await get(first, { "if-none-match": "*" })).status).toBe(304);
    expect(await snapshot()).toEqual(before);
    console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "retained-and-head-site");
    // Deliberate store-corruption controls exercise the projection boundary;
    // they do not pretend a SQL change is a native lifecycle transition.
    console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "receipt-refusals", lastCompleted);
    for (const stateName of ["owed", "conflict"]) {
      const prior = await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
        d.active();
        const row = state.storage.sql.exec<{ id: number; state: string; record: string }>("SELECT id, state, record FROM item WHERE type = 'receipt' AND json_extract(record, '$.values.commit') = ?", first).one();
        const changed = JSON.parse(row.record); changed.state = stateName;
        state.storage.sql.exec("UPDATE item SET state = ?, record = ? WHERE id = ?", stateName, JSON.stringify(changed), row.id);
        return row;
      }));
      try { expect((await get(first, { "if-none-match": "*" })).status).toBe(404); }
      finally { await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => { d.active(); state.storage.sql.exec("UPDATE item SET state = ?, record = ? WHERE id = ?", prior.state, prior.record, prior.id); })); }
    }
    console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "receipt-refusals");
    console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "cleanup-and-opening-proof", lastCompleted);
    const peer = d.G.stub as unknown as SitePublicationPeer;
    const directory = d.config.repository!.directory;
    const repo = await d.wait(() => runInDurableObject(d.D.object, (_instance, state) => { d.active(); return JSON.parse(state.storage.sql.exec<{ record: string }>("SELECT record FROM item WHERE type = 'repository'").one().record).values.repository; }));
    expect(await peer.sitePublishedCommit(directory, repo as never, "e".repeat(40))).toEqual({ ok: false, reason: "not-published" });
    // The default CLI install founds the actual @3 graph, including native
    // publication cleanup. These are deliberate folded-state corruptions;
    // restore the exact original column and bytes after each projection check.
    const historicalPublication = await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
      d.active();
      const receipt = JSON.parse(state.storage.sql.exec<{ record: string }>("SELECT record FROM item WHERE type = 'receipt' AND json_extract(record, '$.values.commit') = ?", first).one().record);
      return state.storage.sql.exec<{ id: number; state: string; record: string }>("SELECT id, state, record FROM item WHERE id = ?", receipt.refs.publication).one();
    }));
    for (const cleanupState of ["cleanup-deleted", "cleanup-owed", "cleaned"]) {
      await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
        d.active();
        const changed = JSON.parse(historicalPublication.record); changed.state = cleanupState;
        state.storage.sql.exec("UPDATE item SET state = ?, record = ? WHERE id = ?", cleanupState, JSON.stringify(changed), historicalPublication.id);
      }));
      try { expect((await get(first)).status).toBe(200); }
      finally { await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => { d.active(); state.storage.sql.exec("UPDATE item SET state = ?, record = ? WHERE id = ?", historicalPublication.state, historicalPublication.record, historicalPublication.id); })); }
    }
    // Cleanup state alone cannot replace the original publication judgment.
    const openingProof = await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
      d.active();
      const receipt = JSON.parse(state.storage.sql.exec<{ record: string }>("SELECT record FROM item WHERE type = 'receipt' AND json_extract(record, '$.values.commit') = ?", first).one().record);
      const row = state.storage.sql.exec<{ seq: number; bytes: string }>("SELECT seq, bytes FROM entry WHERE seq = ?", receipt.id).one();
      const held = JSON.parse(historicalPublication.record); held.state = "cleaned";
      state.storage.sql.exec("UPDATE item SET state = 'cleaned', record = ? WHERE id = ?", JSON.stringify(held), historicalPublication.id);
      const changed = JSON.parse(row.bytes);
      changed.effects = changed.effects.filter((e: { effect: string; state?: string }) => !(e.effect === "state" && e.state === "published"));
      state.storage.sql.exec("UPDATE entry SET bytes = ? WHERE seq = ?", JSON.stringify(changed), row.seq);
      return row;
    }));
    try { expect((await get(first, { "if-none-match": "*" })).status).toBe(404); }
    finally { await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => { d.active(); state.storage.sql.exec("UPDATE entry SET bytes = ? WHERE seq = ?", openingProof.bytes, openingProof.seq); state.storage.sql.exec("UPDATE item SET state = ?, record = ? WHERE id = ?", historicalPublication.state, historicalPublication.record, historicalPublication.id); })); }
    console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "cleanup-and-opening-proof");
    console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "history-byte-bounds", lastCompleted);
    const metadata = await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
      d.active();
      const saved = state.storage.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'scope'").one().v;
      const changed = JSON.parse(saved); changed.head.seq = PUBLICATION_PROOF_BOUNDS.historyEntries;
      state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", JSON.stringify(changed));
      return saved;
    }));
    try {
      expect(await peer.sitePublishedCommit(directory, repo as never, first)).toEqual({ ok: false, reason: "publication-history-limit" });
      const limited = await get(first, { "if-none-match": "*" });
      expect(limited.status).toBe(502);
      expect(await bodyOf(limited)).toContain("publication-history-limit");
    } finally { await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => { d.active(); state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", metadata); })); }
    // Invalid oversized retained JSON must hit the byte preflight before SQL
    // json_each or JavaScript parsing can inspect it.
    const historyRows = await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
      d.active();
      const rows = state.storage.sql.exec<{ seq: number; bytes: string }>("SELECT seq, bytes FROM entry ORDER BY seq LIMIT 18").toArray();
      for (const row of rows) state.storage.sql.exec("UPDATE entry SET bytes = ? WHERE seq = ?", "x".repeat(1024 * 1024), row.seq);
      return rows;
    }));
    try { expect(await peer.sitePublishedCommit(directory, repo as never, first)).toEqual({ ok: false, reason: "publication-history-limit" }); }
    finally { await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => { d.active(); for (const row of historyRows) state.storage.sql.exec("UPDATE entry SET bytes = ? WHERE seq = ?", row.bytes, row.seq); })); }
    const oversized = await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => {
      d.active();
      const row = state.storage.sql.exec<{ id: number; state: string; record: string }>("SELECT id, state, record FROM item WHERE type = 'receipt' AND json_extract(record, '$.values.commit') = ?", first).one();
      const changed = JSON.parse(row.record); changed.values.padding = "x".repeat(PUBLICATION_PROOF_BOUNDS.bytes + 1);
      state.storage.sql.exec("UPDATE item SET record = ? WHERE id = ?", JSON.stringify(changed), row.id);
      return row;
    }));
    try { expect(await peer.sitePublishedCommit(directory, repo as never, first)).toEqual({ ok: false, reason: "publication-history-limit" }); }
    finally { await d.wait(() => runInDurableObject(d.G.object, (_instance, state) => { d.active(); state.storage.sql.exec("UPDATE item SET state = ?, record = ? WHERE id = ?", oversized.state, oversized.record, oversized.id); })); }
    console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "history-byte-bounds");
    console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "identity-and-receipt-corruption", lastCompleted);
    expect(await peer.sitePublishedCommit({ ...directory, inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa" as never }, repo as never, first)).toEqual({ ok: false, reason: "not-published" });
    expect(await peer.sitePublishedCommit(directory, { ...repo, id: "foreign" } as never, first)).toEqual({ ok: false, reason: "not-published" });
    const selection = await peer.sitePublishedCommit(directory, repo as never, first);
    if (!selection.ok) throw new Error("No native proof for the earlier publication");
    const savedObject = await d.wait(async () => {
      const saved = d.at.stand.objects.get(selection.proof.receipt.blob)!;
      d.at.stand.objects.set(selection.proof.receipt.blob, { ...saved, data: new TextEncoder().encode("wrong receipt") });
      return saved;
    });
    try { expect((await get(first, { "if-none-match": "*" })).status).toBe(502); }
    finally { await d.wait(async () => { d.at.stand.objects.set(selection.proof.receipt.blob, savedObject); }); }
    console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "identity-and-receipt-corruption");

  } finally {
    console.info("native-stage", "immutable", "started", performance.now() - stageOrigin, lastStarted = "cleanup", lastCompleted);
    d.done();
    console.info("native-stage", "immutable", "completed", performance.now() - stageOrigin, lastStarted, lastCompleted = "cleanup");
  }
});
