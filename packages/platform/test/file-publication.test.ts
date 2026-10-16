import { expect, test } from "vitest";
import type { Entry, FactRef, FieldValue, Item, ScopeRef } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, newIncarnation, scopeIdOf, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { MemoryState, PROFILES, validateDefinition, type Operation, type Own, type StateView } from "@generalbusiness/dap-derive";
import { destination4, destinationPublicationAt, filePublicationCause, filePublicationCurrent, fileSupersededOutcome, newestFilePublication } from "../src/destination.ts";
import { filePublicationCommit, fileReceiptObjects, fileReceiptRef } from "../src/destination-objects.ts";

// Pure schema/state/object witnesses. These rows and causes are scripted;
// no Native application birth, operation driver, provider or replay is proved.
const sender: ScopeRef = { kind: "lane", scope: scopeIdOf({ v: 1, kind: "lane", definition: textDigest("PUBLIC TEST definition"), creator: null, cause: textDigest("PUBLIC TEST cause"), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(3)) };
const file = (id: number, seq: number, n = 0, state = "queued", at = sender): Item => ({
  id, type: "file-publication", state, revision: id, opened: textDigest(`PUBLIC TEST opening ${id}`), attributed: [], parties: {},
  refs: { sender: at as ScopeRef & FieldValue }, values: { sourceSeq: seq, sourceHash: textDigest(`PUBLIC TEST source ${seq}`), sourceOrdinal: n, path: "shelf/pot.md", content: "# Pot\n", contentDigest: textDigest("# Pot\n") },
});
const pages = (rows: readonly Item[]): Pick<StateView, "page"> => ({ page: (type, states, after, limit) => {
  const all = rows.filter(row => row.type === type && states.includes(row.state) && (after === null || row.id > after)).sort((a, b) => a.id - b.id);
  return { items: all.slice(0, limit), more: all.length > limit };
} });

test("destination4 validates integer queue pointers with zero as a real publication ID", () => {
  const checked = validateDefinition(destination4, PROPOSED_BOUNDS, PROFILES, { platform: true });
  expect(checked.ok ? [] : checked.problems).toEqual([]);
  for (const slot of ["slot", "judging"]) {
    expect(destination4.items["branch"]!.values[slot]).toEqual({ fixed: false, required: false, of: { type: "int", min: 0, max: Number.MAX_SAFE_INTEGER } });
    expect(destination4.items["branch"]!.refs[slot]).toBeUndefined();
  }
  const first = file(0, 1), wrong: Item = { ...first, type: "receipt" };
  expect(destinationPublicationAt({ item: id => id === 0 ? first : wrong }, 0)).toEqual(first);
  for (const id of [null, undefined, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, 1]) expect(destinationPublicationAt({ item: () => wrong }, id)).toBeNull();
  expect(destination4.items["receipt"]!.max).toBe(193);
  expect(destination4.outcomes["file-judge"]!.observes).toBeUndefined();
  expect(destination4.outcomes["file-judge"]!.most!.opens).toBe("receipt");
  expect(destination4.outcomes["file-judge"]!.most!.operations).toContain("receipt");
  expect(destination4.items["file-publication"]!.holds!.operations?.["file-judge"]).toBe(1);
});

test("source order wins across every retained page and final state, with send ordinal and full sender incarnation as part of its key", () => {
  const early = file(0, 7), newer = file(130, 8, 0, "published"), ordinal = file(131, 8, 1, "superseded");
  const other = file(132, 999, 0, "published", { ...sender, inc: newIncarnation(new Uint8Array(16).fill(4)) });
  const rows = [early, ...Array.from({ length: 129 }, (_, n) => ({ ...file(n + 1, 0, 0, "aborted"), values: { ...file(n + 1, 0).values, path: `other/${n}.md` } })), newer, ordinal, other];
  const state = pages(rows);
  expect(newestFilePublication(state, early)).toEqual(ordinal);
  expect(filePublicationCurrent(state, early)).toBe(false);
  expect(filePublicationCurrent(state, ordinal)).toBe(true);
  expect(filePublicationCurrent(state, other)).toBe(true);
  expect(filePublicationCause(early)).toEqual({ from: { at: sender, seq: 7, hash: early.values["sourceHash"] }, n: 0 });
  const sameEntrySecondPath = { ...file(133, 8, 2), values: { ...file(133, 8, 2).values, path: "shelf/ladle.md" } };
  expect(filePublicationCurrent(pages([...rows, sameEntrySecondPath]), ordinal)).toBe(true);
});

for (const format of ["sha1", "sha256"] as const) test(`file ${format} commit and receipt bind the exact send ordinal and both superseded causes`, () => {
  const cause = { from: filePublicationCause(file(0, 7))!.from, n: 0 }, later = { from: cause.from, n: 1 };
  const width = format === "sha1" ? 40 : 64, tree = "a".repeat(width), parent = "b".repeat(width);
  const time = "2026-10-14T03:00:00Z", digest = textDigest("# Pot\n");
  const made = filePublicationCommit(format, sender.scope, time, tree, parent, "shelf/pot.md", cause, digest);
  expect(new TextDecoder().decode(made.body)).toContain(`cause ${canonicalize(cause)}\ncontent ${digest}\n`);
  expect(made.id).not.toBe(filePublicationCommit(format, sender.scope, time, tree, parent, "shelf/pot.md", later, digest).id);
  const receipt = { v: 1, cause, supersededBy: later, path: "shelf/pot.md", contentDigest: digest, commit: parent };
  const objects = fileReceiptObjects(format, sender.scope, time, cause, receipt);
  expect(objects.objects.find(object => object.kind === "blob")!.body).toEqual(utf8(canonicalize(receipt)));
  expect(fileReceiptRef(cause)).not.toBe(fileReceiptRef(later));
  expect(objects.commit).not.toBe(fileReceiptObjects(format, sender.scope, time, later, { ...receipt, cause: later }).commit);
  expect(() => fileReceiptRef({ from: cause.from as FactRef, n: -1 })).toThrow();
});


test.each(["platform:destination@4", "platform:destination@5"] as const)("%s: only an unsent stale file holding the shared slot yields a cause-bound supersession; unknown stays held", owner => {
  const state = new MemoryState(), early = file(1, 7, 0, "reserved"), later = file(4, 8, 0, "published");
  state.putItem({ ...file(0, 0), type: "branch", state: "ready", refs: {}, values: { slot: early.id, judging: null, head: "a".repeat(40) } });
  state.putItem(early); state.putItem(later);
  const operation: Operation = { id: "2:0", owner, kind: "push", for: early.id, most: 1, selected: null, attempts: [{ attempt: 1, opened: 2, outcomes: [] }] };
  const entry: Entry = { v: 1, at: { ...sender, kind: "destination" }, seq: 2, prev: null, time: "2026-10-14T03:00:00Z", clamped: false, epoch: 0,
    input: { type: "outcome", owner, kind: "judge", operation: "1:0", attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: { head: "a".repeat(40), present: true, tree: "b".repeat(40) } } }, uses: [], prepared: [], effects: [{ effect: "state", item: early.id, state: "reserved" }], sends: [] };
  const own: Own = seq => seq === 2 ? { entry, hash: textDigest("PUBLIC TEST scripted opening") } : null;
  const before = state.snapshot();
  expect(fileSupersededOutcome(state, operation, own)).toEqual({ basis: "own-answer", body: { send: "not-sent", seen: "a".repeat(40), supersededBy: filePublicationCause(later) } });
  expect(fileSupersededOutcome(state, { ...operation, owner: "platform:destination@6" }, own)).toBeNull();
  expect(state.snapshot()).toEqual(before);
  const unknown: Operation = { ...operation, attempts: [{ ...operation.attempts[0]!, outcomes: [{ seq: 3, result: "unknown", evidence: textDigest("PUBLIC TEST unknown"), selected: null }] }] };
  expect(fileSupersededOutcome(state, unknown, own)).toBeNull();
  state.putItem({ ...state.item(0)!, values: { ...state.item(0)!.values, slot: null } });
  expect(fileSupersededOutcome(state, operation, own)).toBeNull();
});
