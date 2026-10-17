/**
 * The transport over a service binding to the scope Worker's entrypoint,
 * for a client in another Worker. The entrypoint has one method for each
 * operation of the contract's `ScopeApi`, so each call here is one call
 * there. A call that fails, or returns what is not an answer of its
 * operation (`answers.ts`), is a `TransportError`: nothing is known about
 * what was recorded.
 */

import type { ScopeApi } from "@generalbusiness/dap-contract";
import { itemQueryReadFor, readItemQueryParameter, within, LATE } from "@generalbusiness/artroom-bytes";
import { ANSWERS } from "./answers.ts";
import { TransportError, type Transport } from "./handle.ts";

/** A binding to the entrypoint: each operation, as a stub over RPC has it. */
export type ServiceBinding = { [K in keyof ScopeApi]: (...args: Parameters<ScopeApi[K]>) => PromiseLike<Awaited<ReturnType<ScopeApi[K]>>> };

export function bindingTransport(service: ServiceBinding): Transport {
  const call = async <K extends keyof ScopeApi>(op: K, run: () => PromiseLike<Awaited<ReturnType<ScopeApi[K]>>>): Promise<Awaited<ReturnType<ScopeApi[K]>>> => {
    let answer: Awaited<ReturnType<ScopeApi[K]>>;
    try {
      answer = await run();
    } catch (error) {
      throw new TransportError(`no reply: ${error instanceof Error ? error.message : String(error)}`);
    }
    let ok = false;
    try {
      ok = ANSWERS[op](answer);
    } catch {
      ok = false;   // A reply the guard cannot walk is no answer.
    } finally {
      // A result over RPC can keep the service's side open until it is disposed. Every answer here is plain data, which stays readable.
      if (typeof answer === "object" && answer !== null) (answer as Partial<Disposable>)[Symbol.dispose]?.();
    }
    if (!ok) throw new TransportError(`the reply is not an answer of ${op}`);
    return answer;
  };
  return {
    create: (creation, definition, definitions = [], beside = {}) => call("create", () => service.create(creation, definition, definitions, beside)),
    submit: (scope, signed, grants, beside = {}) => call("submit", () => service.submit(scope, signed, grants, beside)),
    prepare: (scope, signed, grants, capability, step) => call("prepare", () => service.prepare(scope, signed, grants, capability, step)),
    settle: (scope, signed) => call("settle", () => service.settle(scope, signed)),
    summary: (scope, reader) => call("summary", () => service.summary(scope, reader)),
    items: (scope, reader, type, cursor) => call("items", () => service.items(scope, reader, type, cursor)),
    queryItems: async (scope, reader, encoded) => {
      const query = readItemQueryParameter(encoded);
      if (!query || query.scope.scope !== scope) throw new TransportError("invalid bounded item query");
      const reply = await within(10, () => call("queryItems", () => service.queryItems(scope, reader, encoded)));
      if (reply === LATE) throw new TransportError("no whole item query within 10 seconds; coverage is incomplete");
      if (!itemQueryReadFor(reply, query)) throw new TransportError("the reply does not match the bounded item query");
      return reply;
    },
    history: (scope, reader, cursor) => call("history", () => service.history(scope, reader, cursor)),
    entry: (scope, reader, seq) => call("entry", () => service.entry(scope, reader, seq)),
    outbox: (scope, reader, cursor) => call("outbox", () => service.outbox(scope, reader, cursor)),
    outboxItem: (scope, reader, outboxId) => call("outboxItem", () => service.outboxItem(scope, reader, outboxId)),
    log: (scope, reader, cursor) => call("log", () => service.log(scope, reader, cursor)),
    retained: (scope, reader, kind, digest, domain) => call("retained", () => service.retained(scope, reader, kind, digest, domain)),
  };
}
