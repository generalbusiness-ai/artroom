/**
 * Test support: two STAND-INS for the token ledger's driver (`src/host.ts`).
 * Each proves only the boundary that it exposes, and every test that uses
 * one says so.
 *
 * - `TokenHost` stands for a Git host's token interface. It keeps the tokens
 *   that it minted, in memory, and answers a revocation from them. A test
 *   sets a fault for the request of one token. It shows what the driver and
 *   a scope do with a host's answers, and nothing about a real host: its
 *   clock, its lifetimes, how late a request can apply, or its account's
 *   credential. No request leaves the process.
 * - `Vault` stands for the gateway's side of the handoff. It keeps what it
 *   is given. It shows when the driver hands a plaintext over, and nothing
 *   about a gateway.
 *
 * A token's plaintext here is made from random bytes in the test, so no
 * source file holds a credential.
 */

import type { Custody, GitHost, LiveToken, MintAsk, MintReply, RevokeAsk, RevokeReply } from "../../src/host.ts";

/**
 * What happens to one request.
 * - `refuse`: the host's own answer refuses it, and nothing is changed.
 * - `lose-request`: the request does not reach the host, and the call fails.
 * - `lose-reply`: the request takes effect, and the call fails. `reply` then
 *   holds that request's own answer, for a test to deliver later.
 * - `replies`: the request takes effect, and the host replies with this
 *   value in place of its answer.
 * `throws`, with a loss: what the failed call throws, in place of a plain error.
 */
export type Fault = { fault: "refuse" } | { fault: "lose-request" | "lose-reply"; throws?: unknown } | { fault: "replies"; reply: unknown };

/** Random text that no pattern knows as a credential: 24 lower-case letters and digits. */
export function secret(): string {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

export class TokenHost implements GitHost {
  /** Every request that reached the stand-in or was lost on its way, in order. */
  readonly asked: (({ call: "mint" } & MintAsk) | ({ call: "revoke" } & RevokeAsk))[] = [];
  /** The tokens that the host minted, by ID. */
  readonly tokens = new Map<string, { plaintext: string; live: boolean; ends: string; token: number }>();
  /** The fault of the next mint of the ledger's token with that number, and of the next revocation of it. */
  readonly faults = new Map<string, Fault>();
  /** The answers of requests whose reply was lost, by `mint` or `revoke` and the ledger's token number. */
  readonly reply = new Map<string, { ask: MintAsk | RevokeAsk; reply: MintReply | RevokeReply }>();
  /** The end time that the host gives each token, on its own clock. */
  ends = "2099-01-01T00:10:00Z";

  /** Set the fault of the next mint or revocation of the ledger's token `token`. */
  fault(call: "mint" | "revoke", token: number, fault: Fault): void { this.faults.set(`${call} ${token}`, fault); }
  #take(call: "mint" | "revoke", token: number): Fault | null {
    const fault = this.faults.get(`${call} ${token}`) ?? null;
    this.faults.delete(`${call} ${token}`);
    return fault;
  }

  /** The IDs of the tokens that are live at the host: what a listing would show. */
  listing(): string[] { return [...this.tokens].filter(([, t]) => t.live).map(([id]) => id); }

  mint(ask: MintAsk): Promise<MintReply> {
    this.asked.push({ call: "mint", ...ask });
    const fault = this.#take("mint", ask.token);
    if (fault?.fault === "refuse") return Promise.resolve({ minted: false });
    if (fault?.fault === "lose-request") return Promise.reject(fault.throws ?? new Error("the request was lost"));
    const id = `tok-${this.tokens.size + 1}`;
    const plaintext = secret();
    this.tokens.set(id, { plaintext, live: true, ends: this.ends, token: ask.token });
    const reply: MintReply = { minted: true, id, ends: this.ends, plaintext };
    if (fault?.fault === "replies") return Promise.resolve(fault.reply as MintReply);
    if (fault?.fault !== "lose-reply") return Promise.resolve(reply);
    this.reply.set(`mint ${ask.token}`, { ask, reply });
    return Promise.reject(fault.throws ?? new Error("the reply was lost"));
  }

  revoke(ask: RevokeAsk): Promise<RevokeReply> {
    this.asked.push({ call: "revoke", ...ask });
    const fault = this.#take("revoke", ask.token);
    if (fault?.fault === "lose-request") return Promise.reject(fault.throws ?? new Error("the request was lost"));
    const held = this.tokens.get(ask.id);
    const reply: RevokeReply = { revoked: fault?.fault !== "refuse" && held !== undefined && held.live };
    if (reply.revoked) held!.live = false;
    if (fault?.fault === "replies") return Promise.resolve(fault.reply as RevokeReply);
    if (fault?.fault !== "lose-reply") return Promise.resolve(reply);
    this.reply.set(`revoke ${ask.token}`, { ask, reply });
    return Promise.reject(fault.throws ?? new Error("the reply was lost"));
  }
}

export class Vault implements Custody {
  /** Every token that the driver handed over, in order, with its plaintext. */
  readonly held: LiveToken[] = [];
  take(token: LiveToken): void { this.held.push(token); }
}
