/**
 * The founding publication of a real destination, with a STAND-IN Git host.
 *
 * A destination that is created with no import opens `first-head` in its
 * genesis, and the outcome of each of its operations opens the next: a
 * `mint` of a token, the `first-head` write, a `mint` for the receipt, the
 * `receipt` write and a `revoke` of each token. `foundingPublication`
 * answers each of them by `OutsideDouble` of `outside.ts`, with the exact
 * commit IDs that the platform package computes, as
 * `founding-real.test.ts` does. The destination, its rules and its store are
 * real: the stand-in only gives each request the answer that the test
 * writes from the destination's own SQLite records. No host runs, nothing is
 * pushed, and no token is minted.
 */

import { runInDurableObject } from "cloudflare:test";
import type { Entry, FactRef, OperationId } from "@generalbusiness/artroom-contract";
import { timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import { destinationReceipt, foundingObjects, revokedToken } from "@generalbusiness/artroom-platform";
import { targetOf } from "../../platform/src/destination.ts";
import { SqliteStore } from "../src/index.ts";
import { net } from "../src/testing.ts";
import { outsideOf, wired } from "./outside.ts";
import type { Platform } from "./repository.ts";

/**
 * Drive the founding publication of the destination `G`, which the claim at `claim` caused, to its end: the branch is `ready` at
 * the first head, and the receipt is written. The STAND-IN host is wired for the destination while this runs, and unwired after.
 */
export async function foundingPublication(G: Platform, claim: FactRef): Promise<void> {
  const host = outsideOf(G.name);
  const firstHead = foundingObjects("sha1", G.name, (await G.entries())[0]!.time, claim).commit;
  let driving = "";
  wired.set(G.name, () => ({ outside: { accepts: (_owner, kind) => kind === driving, send: (request) => host.send(request) } }));
  const drive = async (kind: string) => {
    const answers = await runInDurableObject(G.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      const own = (seq: number) => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; };
      return store.all().operations.filter((operation) => operation.kind === kind).flatMap((operation) => operation.attempts.filter((attempt) => attempt.outcomes.length === 0).map((attempt) => {
        const body = kind === "mint" ? { token: `token-${operation.id}`, ends: timeOf(timeMs(net.clock.now)! + 60_000) }
          : kind === "revoke" ? { token: revokedToken(store, own, operation) }
          : kind === "receipt" ? { send: "accepted", seen: destinationReceipt(store, own, targetOf(store, own, operation)!, "sha1").commit }
          : { send: "accepted", seen: firstHead };
        return { operation: operation.id as OperationId, attempt: attempt.attempt, body };
      }));
    });
    for (const answer of answers) host.answer(answer.operation, answer.attempt, { result: "confirmed", evidence: { basis: "own-answer", body: answer.body } });
    driving = kind;
    await G.restart();
    await (G.stub as unknown as { effect(): Promise<number> }).effect();
  };
  try {
    for (const kind of ["mint", "first-head", "mint", "receipt", "revoke"]) await drive(kind);
  } finally {
    wired.delete(G.name);
    await G.restart();
  }
}
