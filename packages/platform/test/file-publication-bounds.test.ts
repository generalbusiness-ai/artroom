import { expect, test } from "vitest";
import { publicationJourney } from "./support-publication-journey.ts";
const { make, file, answer, reserve } = publicationJourney();
const changeReceipt = (ledger: ReturnType<typeof make>) => { const { publication, push } = reserve(ledger); answer(ledger, push, { send: "accepted", seen: publication.values["integration"]! }); expect(ledger.state.count("receipt", "owed")).toBe(1); };

test("change and file receipts share the 64/65 admission boundary while final file rows leave item capacity available", () => {
  const ledger = make(); changeReceipt(ledger);
  for (let n = 0; n < 63; n++) {
    expect(file(ledger).result).toBe("write");
    answer(ledger, `${ledger.head.seq}:0`, { head: ledger.item(0).values["head"]!, present: false, tree: null });
  }
  expect(ledger.state.count("receipt", "owed")).toBe(64);
  expect(ledger.state.count("file-publication", "aborted")).toBe(63);
  expect(file(ledger).result).toBe("write");
  answer(ledger, `${ledger.head.seq}:0`, { head: ledger.item(0).values["head"]!, present: false, tree: null });
  expect(ledger.state.count("receipt", "owed")).toBe(65);
  const before = ledger.state.snapshot(), rejected = file(ledger);
  expect(rejected.result).toBe("write");
  if (rejected.result !== "write") throw Error("Refusal is recorded");
  expect(rejected.draft.input).toMatchObject({ type: "delivery", decision: "refused", reason: { code: "guard-failed", name: "receipts-owed" } });
  expect(ledger.state.count("receipt", "owed")).toBe(65);
  expect(ledger.state.count("file-publication", "queued")).toBe(0);
  expect(ledger.state.snapshot()).not.toBe(before); // Only the refusal advances the record.
});

test("publish-file accepts 65536 UTF-8 bytes and rejects the next byte before opening a file row", () => {
  const ledger = make();
  expect(file(ledger, "x".repeat(65536)).result).toBe("write");
  expect(ledger.state.count("file-publication", "queued")).toBe(1);
  const rejected = file(ledger, "x".repeat(65537));
  expect(rejected.result).toBe("write");
  if (rejected.result !== "write") throw Error("Refusal is recorded");
  expect(rejected.draft.input).toMatchObject({ type: "delivery", decision: "refused", reason: { code: "bad-field" } });
  expect(ledger.state.count("file-publication", "queued")).toBe(1);
});
