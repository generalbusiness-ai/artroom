/**
 * The transport over a service binding to the scope Worker's entrypoint,
 * for a client in another Worker. The entrypoint has one method for each
 * operation of the contract's `ScopeApi`, so each call here is one call
 * there. A call that fails is a `TransportError`: nothing is known about
 * what was recorded.
 */

import type { ScopeApi } from "@generalbusiness/artroom-contract";
import { TransportError, type Transport } from "./handle.ts";

/** A binding to the entrypoint: each operation, as a stub over RPC has it. */
export type ServiceBinding = { [K in keyof ScopeApi]: (...args: Parameters<ScopeApi[K]>) => PromiseLike<Awaited<ReturnType<ScopeApi[K]>>> };

export function bindingTransport(service: ServiceBinding): Transport {
  const call = async <T>(run: () => PromiseLike<T>): Promise<T> => {
    let answer: T;
    try {
      answer = await run();
    } catch (error) {
      throw new TransportError(`no reply: ${error instanceof Error ? error.message : String(error)}`);
    }
    // A result over RPC can keep the service's side open until it is disposed. Every answer here is plain data, which stays readable.
    if (typeof answer === "object" && answer !== null) (answer as Partial<Disposable>)[Symbol.dispose]?.();
    return answer;
  };
  return {
    found: (founding, definition, definitions = []) => call(() => service.found(founding, definition, definitions)),
    submit: (scope, signed, grants) => call(() => service.submit(scope, signed, grants)),
    settle: (scope, signed) => call(() => service.settle(scope, signed)),
    summary: (scope, reader) => call(() => service.summary(scope, reader)),
    items: (scope, reader, type, cursor) => call(() => service.items(scope, reader, type, cursor)),
    history: (scope, reader, cursor) => call(() => service.history(scope, reader, cursor)),
    entry: (scope, reader, seq) => call(() => service.entry(scope, reader, seq)),
    outbox: (scope, reader, cursor) => call(() => service.outbox(scope, reader, cursor)),
    duty: (scope, reader, duty) => call(() => service.duty(scope, reader, duty)),
    log: (scope, reader, cursor) => call(() => service.log(scope, reader, cursor)),
    retained: (scope, reader, kind, digest) => call(() => service.retained(scope, reader, kind, digest)),
  };
}
