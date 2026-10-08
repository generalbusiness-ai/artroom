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
import type { Entry, OperationId } from "@generalbusiness/artroom-contract";
import { isFactRef, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import { destinationReceipt, foundingObjects, destinationBranch, destination2Helpers, revokedToken } from "@generalbusiness/artroom-platform";
import { targetOf } from "../../platform/src/destination.ts";
import { SqliteStore } from "../src/index.ts";
import { net } from "../src/testing.ts";
import { outsideOf, wired } from "./outside.ts";
import type { Platform } from "./repository.ts";

/**
 * Drive the founding publication of the destination `G` to its end: the branch is `ready` at the first head, and the receipt is
 * written. The first head is the founding commit of the destination's own version, from its own records (`foundingOf`). The
 * STAND-IN host is wired for the destination while this runs, and unwired after.
 */
export async function foundingPublication(G: Platform): Promise<void> {
  const host = outsideOf(G.name);
  let driving = "";
  wired.set(G.name, () => ({ outside: { accepts: (_owner, kind) => kind === driving, send: (request) => host.send(request) } }));
  const drive = async (kind: string) => {
    const answers = await runInDurableObject(G.object, (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      const own = (seq: number) => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; };
      const genesis = own(0)!.entry;
      const named = genesis.input.type === "genesis" ? genesis.input.seed.definition : null;
      if (named !== "platform:destination@1" && named !== "platform:destination@2") throw new Error("unsupported publication fixture version");
      const future = named === "platform:destination@2";
      const receipt = future ? destination2Helpers.destinationReceipt : destinationReceipt;
      const target = future ? destination2Helpers.targetOf : targetOf;
      const revoked = future ? destination2Helpers.revokedToken : revokedToken;
      const claim = destinationBranch(store)?.refs["claim"];
      if (!isFactRef(claim)) throw new Error("missing verified claim");
      const first = future ? destination2Helpers.foundingOf(store, own, "sha1") : foundingObjects("sha1", genesis.at.scope, genesis.time, claim);
      return store.all().operations.filter((operation) => operation.kind === kind).flatMap((operation) => operation.attempts.filter((attempt) => attempt.outcomes.length === 0).map((attempt) => {
        const body = kind === "mint" ? { token: `token-${operation.id}`, ends: timeOf(timeMs(net.clock.now)! + 60_000) }
          : kind === "revoke" ? { token: revoked(store, own, operation) }
          : kind === "receipt" ? { send: "accepted", seen: receipt(store, own, target(store, own, operation)!, "sha1").commit }
          : { send: "accepted", seen: first.commit };
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
