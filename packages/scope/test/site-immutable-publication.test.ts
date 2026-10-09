import { expect, test } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { takeBytes } from "@generalbusiness/artroom-bytes";
import { demo } from "../../page/test/support/demo.ts";
import { PUBLICATION_PROOF_BOUNDS, type SitePublicationPeer } from "../src/site/publication.ts";

// Real CLI, lanes, destination judgments, receipt writes and production Git wiring.
// OwnGit/scheduler/clock/memory stores are labelled STAND-INs in the shared fixture.
// No provider or browser runs. Published authority is never fabricated in this witness.
test("two native publications retain older immutable content and deny pending/conflicting receipt before 304 without SQLite writes", async () => {
  const d = await demo();
  const snapshot = () => runInDurableObject(d.G.object, (_instance, state) => {
    const tables = state.storage.sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").toArray();
    return tables.map(({ name }) => [name, state.storage.sql.exec(`SELECT * FROM "${name.replaceAll('"', '""')}"`).toArray()]);
  });
  try {
    expect((await d.run(d.rita, "edit", "README.md", "--file", "readme.md", "--title", "Original")).code).toBe(0);
    const first = d.at.stand.refs.get("refs/heads/main")!;
    expect((await d.run(d.rita, "edit", "README.md", "--file", "agents.md", "--title", "Later")).code).toBe(0);
    const later = d.at.stand.refs.get("refs/heads/main")!;
    expect(later).not.toBe(first);
    const get = (ref: string, headers?: Record<string, string>) => d.fetch(`https://scopes.test/site/${d.D.name}/${ref}/README.md`, { ...(headers ? { headers } : {}) });
    const before = await snapshot();
    const old = await get(first);
    expect(old.status).toBe(200);
    const bodyOf = async (reply: Awaited<ReturnType<typeof get>>) => new TextDecoder().decode(await takeBytes(reply.body!, 1024 * 1024, AbortSignal.timeout(30_000)) as Uint8Array);
    const body = await bodyOf(old);
    expect(body).toContain("The handbook");
    expect(body).toContain(`Rendered from commit <code>${first}</code>`);
    expect(body).toContain(`/site/${d.D.name}/${first}/`);
    expect(await bodyOf(await get("HEAD"))).toContain("Ask before you push");
    expect((await get(first, { "if-none-match": "*" })).status).toBe(304);
    expect(await snapshot()).toEqual(before);
    // Deliberate store-corruption controls exercise the projection boundary;
    // they do not pretend a SQL change is a native lifecycle transition.
    for (const stateName of ["owed", "conflict"]) {
      const prior = await runInDurableObject(d.G.object, (_instance, state) => {
        const row = state.storage.sql.exec<{ id: number; record: string }>("SELECT id, record FROM item WHERE type = 'receipt' AND json_extract(record, '$.values.commit') = ?", first).one();
        const changed = JSON.parse(row.record); changed.state = stateName;
        state.storage.sql.exec("UPDATE item SET state = ?, record = ? WHERE id = ?", stateName, JSON.stringify(changed), row.id);
        return row;
      });
      try { expect((await get(first, { "if-none-match": "*" })).status).toBe(404); }
      finally { await runInDurableObject(d.G.object, (_instance, state) => { state.storage.sql.exec("UPDATE item SET state = 'written', record = ? WHERE id = ?", prior.record, prior.id); }); }
    }
    const peer = d.G.stub as unknown as SitePublicationPeer;
    const directory = d.config.repository!.directory;
    const repo = await runInDurableObject(d.D.object, (_instance, state) => JSON.parse(state.storage.sql.exec<{ record: string }>("SELECT record FROM item WHERE type = 'repository'").one().record).values.repository);
    expect(await peer.sitePublishedCommit(directory, repo as never, "e".repeat(40))).toEqual({ ok: false, reason: "not-published" });
    const metadata = await runInDurableObject(d.G.object, (_instance, state) => {
      const saved = state.storage.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'scope'").one().v;
      const changed = JSON.parse(saved); changed.head.seq = PUBLICATION_PROOF_BOUNDS.historyEntries;
      state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", JSON.stringify(changed));
      return saved;
    });
    try {
      expect(await peer.sitePublishedCommit(directory, repo as never, first)).toEqual({ ok: false, reason: "publication-history-limit" });
      const limited = await get(first, { "if-none-match": "*" });
      expect(limited.status).toBe(502);
      expect(await bodyOf(limited)).toContain("publication-history-limit");
    } finally { await runInDurableObject(d.G.object, (_instance, state) => { state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", metadata); }); }
    // Invalid oversized retained JSON must hit the byte preflight before SQL
    // json_each or JavaScript parsing can inspect it.
    const historyRows = await runInDurableObject(d.G.object, (_instance, state) => {
      const rows = state.storage.sql.exec<{ seq: number; bytes: string }>("SELECT seq, bytes FROM entry ORDER BY seq LIMIT 18").toArray();
      for (const row of rows) state.storage.sql.exec("UPDATE entry SET bytes = ? WHERE seq = ?", "x".repeat(1024 * 1024), row.seq);
      return rows;
    });
    try { expect(await peer.sitePublishedCommit(directory, repo as never, first)).toEqual({ ok: false, reason: "publication-history-limit" }); }
    finally { await runInDurableObject(d.G.object, (_instance, state) => { for (const row of historyRows) state.storage.sql.exec("UPDATE entry SET bytes = ? WHERE seq = ?", row.bytes, row.seq); }); }
    const oversized = await runInDurableObject(d.G.object, (_instance, state) => {
      const row = state.storage.sql.exec<{ id: number; record: string }>("SELECT id, record FROM item WHERE type = 'receipt' AND json_extract(record, '$.values.commit') = ?", first).one();
      const changed = JSON.parse(row.record); changed.values.padding = "x".repeat(PUBLICATION_PROOF_BOUNDS.bytes + 1);
      state.storage.sql.exec("UPDATE item SET record = ? WHERE id = ?", JSON.stringify(changed), row.id);
      return row;
    });
    try { expect(await peer.sitePublishedCommit(directory, repo as never, first)).toEqual({ ok: false, reason: "publication-history-limit" }); }
    finally { await runInDurableObject(d.G.object, (_instance, state) => { state.storage.sql.exec("UPDATE item SET record = ? WHERE id = ?", oversized.record, oversized.id); }); }
    expect(await peer.sitePublishedCommit({ ...directory, inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa" as never }, repo as never, first)).toEqual({ ok: false, reason: "not-published" });
    expect(await peer.sitePublishedCommit(directory, { ...repo, id: "foreign" } as never, first)).toEqual({ ok: false, reason: "not-published" });
    const selection = await peer.sitePublishedCommit(directory, repo as never, first);
    if (!selection.ok) throw new Error("No native proof for the earlier publication");
    const savedObject = d.at.stand.objects.get(selection.proof.receipt.blob)!;
    d.at.stand.objects.set(selection.proof.receipt.blob, { ...savedObject, data: new TextEncoder().encode("wrong receipt") });
    try { expect((await get(first, { "if-none-match": "*" })).status).toBe(502); }
    finally { d.at.stand.objects.set(selection.proof.receipt.blob, savedObject); }

  } finally { d.done(); }
});
