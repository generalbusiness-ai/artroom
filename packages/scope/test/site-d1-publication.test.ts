/** Actual @5 validator/judges/fold in memory, projected into fresh native
 * SQLite for the storage-only site selector. Creator, application and Git
 * answers are scripted; this is not native admission, a provider or HTTP. */
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { OperationId } from "@generalbusiness/dap-contract";
import { canonicalize, factRefOf, utf8 } from "@generalbusiness/artroom-bytes";
import { DESTINATION_5, destination5, destinationRules5, destinationReceipt } from "@generalbusiness/dap-platform";
import { publicationJourney } from "../../platform/test/support-publication-journey.ts";
import { HEAD, TREE } from "../../platform/test/support-destination.ts";
import { sitePublishedCommit } from "../src/site/publication.ts";
import { SqliteStore } from "../src/sqlite.ts";
import { objectOf } from "./support.ts";

test("D1 immutable publication selects the file receipt's integer publication pointer and exact file reservation", async () => {
  const journey = publicationJourney(destination5, DESTINATION_5, destinationRules5), ledger = journey.make();
  journey.file(ledger);
  journey.answer(ledger, `${ledger.head.seq}:0`, { head: HEAD, present: true, tree: TREE });
  const reservation = ledger.last, publication = ledger.state.page("file-publication", ["reserved"], null, 1).items[0]!;
  const integration = publication.values["integration"]!;
  journey.answer(ledger, `${reservation.seq}:0`, { send: "accepted", seen: integration });
  const receipt = ledger.item(ledger.head.seq), opening = ledger.last.effects.find(effect => effect.effect === "operation" && effect.kind === "receipt")!;
  if (opening.effect !== "operation") throw Error("Native rule opened its receipt operation");
  journey.answer(ledger, `${ledger.head.seq}:${opening.k}` as OperationId, { send: "accepted", seen: destinationReceipt(ledger.state, ledger.own, receipt, "sha1").commit });
  const branch = ledger.item(0), rows = ledger.entries.map(row => ({ ...row, bytes: canonicalize(row.entry) }));
  await runInDurableObject(objectOf(ledger.at.scope), (_instance, state) => {
    const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
    store.transaction(() => {
      store.setScope(ledger.state.scope()!);
      for (const row of rows) store.append(row.entry, row.hash, row.bytes, utf8(row.bytes).length);
      for (const item of ledger.state.all().items) store.putItem(item);
    });
    const changes = () => state.storage.sql.exec<{ n: number }>("SELECT total_changes() AS n").one().n;
    const before = changes();
    expect(sitePublishedCommit(store, DESTINATION_5, branch.refs["directory"], branch.values["repository"], integration)).toMatchObject({ ok: true, proof: { publication: factRefOf(reservation), commit: integration } });
    expect(changes()).toBe(before);
    // Explicitly corrupted projection: pending receipt cannot authorize content.
    const written = store.item(receipt.id)!;
    store.putItem({ ...written, state: "owed" });
    expect(sitePublishedCommit(store, DESTINATION_5, branch.refs["directory"], branch.values["repository"], integration)).toEqual({ ok: false, reason: "not-published" });
    store.putItem(written);
  });
});
