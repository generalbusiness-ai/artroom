import type { OperationId } from "@generalbusiness/artroom-contract";
import { checkpointOf, operationId, operationOpening, timeMs, type Opening } from "@generalbusiness/artroom-derive";
import { SqliteStore, Turns, Wakes, production } from "../src/index.ts";
import { owners } from "./outside.ts";
import { type Lane, definition } from "./support.ts";

/**
 * A stand-in for the entry that opens an operation: no form of this step
 * opens one. The entry is made by hand, as a checkpoint input with the
 * ledger's own opening effects at the ordinals 0, 1 and so on. It is written
 * through a turn of the real commit protocol, on the object's own storage,
 * with the real alarm. The IDs of the operations, or `scope-full` when the
 * entry and what it reserves do not fit.
 */
export function open(s: Lane, ...opens: Opening[]): Promise<OperationId[] | "scope-full"> {
  return s.inside(async (state) => {
    const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
    const wakes = new Wakes(store, { set: (time) => (time === null ? state.storage.deleteAlarm() : state.storage.setAlarm(timeMs(time)!)) }, false);
    const turns = new Turns(store, { clock: s.c.clock, rules: production().rules, alarm: wakes.deadline, capabilities: null }, s.c.bounds, () => definition, () => owners);
    const end = await turns.run<OperationId[] | "scope-full">({
      asks: () => [],
      judge: (view) => ({
        verdict: "write", retain: [],
        draft: { input: { type: "checkpoint", ...checkpointOf(view) }, uses: [], prepared: [], effects: opens.flatMap((o, k) => operationOpening(k, o)), sends: [], judgesTime: false },
        sealed: ({ entry }) => opens.map((_, k) => operationId(entry.seq, k)), unfit: () => "scope-full", full: () => "scope-full",
      }),
    });
    if (end.end !== "answer") throw new Error(`the opening entry was not judged: ${end.end}`);
    return end.answer;
  });
}
