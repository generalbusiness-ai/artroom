/**
 * Typechecked only; no test runs it. The Worker's service entrypoint and the
 * client's transport agree on one declared interface, the contract's
 * `ScopeApi`. This file stops compiling if either side drifts from it: an
 * operation added to one and not the other, or a parameter or an answer of
 * another type.
 */

import type { WorkerEntrypoint } from "cloudflare:workers";
import type { ScopeApi } from "@generalbusiness/artroom-contract";
import type { ServiceBinding, Transport } from "@generalbusiness/artroom-client";
import type { ScopeService } from "../src/worker.ts";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The client's transport is the declared interface, exactly. */
export const transportIsTheInterface: Same<Transport, ScopeApi> = true;

/** The entrypoint has every operation of the interface, with its parameters and its answer. */
export const serviceHasTheInterface = (service: ScopeService): ScopeApi => service;

/** So a binding to the entrypoint is what the client's binding transport takes. */
export const bindingIsTheService = (service: ScopeService): ServiceBinding => service;

/** And the entrypoint has no operation the interface lacks: every member it adds to a Worker entrypoint is one of the interface's. */
export const serviceAddsNothing: Same<Exclude<keyof ScopeService, keyof ScopeApi | keyof WorkerEntrypoint>, never> = true;
