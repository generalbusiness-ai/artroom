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
import { timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import { destinationReceipt, foundingOf, revokedToken } from "@generalbusiness/artroom-platform";
import { targetOf } from "../../platform/src/destination.ts";
import { SqliteStore } from "../src/index.ts";
import { net } from "../src/testing.ts";
import { outsideOf, wired } from "./outside.ts";
import type { Platform } from "./repository.ts";
import type { nativeFixtureLifetime } from "./support/native-fixture-lifetime.ts";

/**
 * Drive the founding publication of the destination `G` to its end: the branch is `ready` at the first head, and the receipt is
 * written. The first head is the founding commit of the destination's own version, from its own records (`foundingOf`). The
 * STAND-IN host is wired for the destination while this runs, and unwired after.
 */
export async function foundingPublication(G: Platform, lifetime?: ReturnType<typeof nativeFixtureLifetime>): Promise<void> {
  const wait = <T>(run: () => Promise<T>): Promise<T> => lifetime ? lifetime.wait(run) : run();
  const host = outsideOf(G.name);
  let driving = "";
  const ports = () => ({ outside: {
    accepts: (_owner: string, kind: string) => { lifetime?.active(); return kind === driving; },
    send: (request: import("../src/index.ts").EffectRequest) => wait(() => host.send(request)),
  } });
  if (lifetime) lifetime.wire(G.name, ports); else wired.set(G.name, ports);
  const drive = async (kind: string) => {
    const answers = await wait(() => runInDurableObject(G.object, (_instance, state) => {
      lifetime?.active();
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      const own = (seq: number) => { const row = store.stored(seq); return row ? { entry: JSON.parse(row.bytes) as Entry, hash: row.hash } : null; };
      return store.all().operations.filter((operation) => operation.kind === kind).flatMap((operation) => operation.attempts.filter((attempt) => attempt.outcomes.length === 0).map((attempt) => {
        const body = kind === "mint" ? { token: `token-${operation.id}`, ends: timeOf(timeMs(net.clock.now)! + 60_000) }
          : kind === "revoke" ? { token: revokedToken(store, own, operation) }
          : kind === "receipt" ? { send: "accepted", seen: destinationReceipt(store, own, targetOf(store, own, operation)!, "sha1").commit }
          : { send: "accepted", seen: foundingOf(store, own, "sha1").commit };
        return { operation: operation.id as OperationId, attempt: attempt.attempt, body };
      }));
    }));
    lifetime?.active();
    for (const answer of answers) host.answer(answer.operation, answer.attempt, { result: "confirmed", evidence: { basis: "own-answer", body: answer.body } });
    driving = kind;
    await wait(() => G.restart());
    await wait(() => (G.stub as unknown as { effect(): Promise<number> }).effect());
  };
  try {
    for (const kind of ["mint", "first-head", "mint", "receipt", "revoke"]) await drive(kind);
  } finally {
    if (lifetime) {
      // A finished fixture already owns synchronous resource retirement.
      // Its continuation cannot evict an object under a successor's settings.
      if (lifetime.current()) {
        lifetime.unWire(G.name);
        await wait(() => G.restart());
      }
    } else {
      wired.delete(G.name);
      await G.restart();
    }
  }
}
