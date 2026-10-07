import { describe, expect, test } from "vitest";
import type { Entry, OperationId } from "@generalbusiness/artroom-contract";
import { entryHash, newIncarnation } from "@generalbusiness/artroom-bytes";
import { d } from "@generalbusiness/artroom-derive/testing";
import { repositoryName } from "@generalbusiness/artroom-platform";
import { Register, rita } from "../../platform/test/support-founding.ts";
import type { OutsideGiven } from "../src/object.ts";
import type { EffectRequest } from "../src/operations.ts";
import { RegisterHost, type RegisterProvider } from "../src/register-host.ts";

/** STAND-IN: a provider that answers by script. No Git host or network runs. */
class Provider implements RegisterProvider {
  readonly calls: [string, string][] = [];
  reply: unknown = null;
  createRepository(name: string): Promise<unknown> { return this.call("create", name); }
  deleteRepository(id: string): Promise<unknown> { return this.call("delete", id); }
  revokeCredential(id: string): Promise<unknown> { return this.call("revoke", id); }
  private async call(kind: string, id: string): Promise<unknown> {
    this.calls.push([kind, id]);
    if (this.reply instanceof Error) throw this.reply;
    return this.reply;
  }
}

/** The register's own rules judge these entries in memory; no Durable Object runs here. */
function fixture() {
  const register = new Register();
  const provider = new Provider();
  const given: OutsideGiven = {
    state: register.state, own: register.own, retained: () => null, scope: () => register.state.scope(),
    genesis: () => { const input = register.own(0)?.entry.input; return input?.type === "genesis" ? input : null; },
    clock: { read: () => register.now }, random: { bytes: (length) => new Uint8Array(length) },
  };
  // Construct before the found entry: its reads must stay live.
  const host = new RegisterHost(given, { host: "git.example", namespace: "artroom", provider });
  expect(register.found(rita).result).toBe("write");
  const request = (operation: OperationId = "1:0", attempt = 1): EffectRequest => {
    const recorded = register.state.operation(operation)!;
    return { scope: register.at, operation, attempt, owner: recorded.owner, kind: recorded.kind, origin: register.own(Number(operation.split(":")[0]))! };
  };
  const name = (attempt = 1) => repositoryName(register.item(1).values["seed"] as ReturnType<typeof d>, attempt);
  return { register, provider, given, host, request, name };
}

const resealed = (request: EffectRequest, change: (entry: Entry) => void): EffectRequest => {
  const entry = structuredClone(request.origin.entry);
  change(entry);
  return { ...request, origin: { entry, hash: entryHash(entry) } };
};

describe("register outside adapter; provider is a STAND-IN, register judgments are real in memory", () => {
  // Invariant: a lost own answer remains unknown; only a new attempt's own name and answer can select a creation.
  test("live state names each attempt and a lost reply remains unknown until a new own answer", async () => {
    const f = fixture();
    expect(await f.host.send(f.request())).toBeNull();
    expect(f.register.outcome("1:0", 1, "unknown").result).toBe("write");
    expect(f.register.last.input).toMatchObject({ result: "unknown", evidence: { basis: "none", body: { name: f.name(1) } } });
    f.provider.reply = { created: true, name: f.name(2), id: "repo-7" };
    const reply = await f.host.send(f.request("1:0", 2));
    expect(reply).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { name: f.name(2), id: "repo-7" } } });
    expect(f.register.outcome("1:0", 2, reply!.result, reply!.evidence.body).result).toBe("write");
    expect(f.provider.calls).toEqual([["create", f.name(1)], ["create", f.name(2)]]);
    expect(f.register.item(1).values["repository"]).toEqual({ host: "git.example", namespace: "artroom", name: f.name(2), id: "repo-7" });
  });

  // Invariant: a caller cannot turn another scope, operation, opening, claim or configured namespace into a provider effect.
  test("only the current scope's recorded operation and sealed claim reach the configured provider", async () => {
    const f = fixture();
    const original = f.request();
    const unbound: EffectRequest[] = [
      { ...original, scope: { ...original.scope, inc: newIncarnation(new Uint8Array(16).fill(4)) } },
      { ...original, owner: "platform:destination@1" },
      { ...original, kind: "delete-repository" },
      { ...original, operation: "1:1" },
      { ...original, attempt: 2 },
      { ...original, origin: { ...original.origin, hash: d("f") } },
      resealed(original, (entry) => { entry.seq = 2; }),
      // Same claimed hash, different bytes must not be trusted either.
      { ...original, origin: { hash: original.origin.hash, entry: { ...original.origin.entry, time: "2026-01-01T00:00:00.000Z" } } },
    ];
    for (const request of unbound) expect(await f.host.send(request)).toBeNull();
    const wrongNamespace = new RegisterHost(f.given, { host: "git.example", namespace: "elsewhere", provider: f.provider });
    const wrongHost = new RegisterHost(f.given, { host: "another.example", namespace: "artroom", provider: f.provider });
    expect(await wrongNamespace.send(original)).toBeNull();
    expect(await wrongHost.send(original)).toBeNull();
    const claim = f.register.item(1);
    f.register.state.putItem({ ...claim, values: { ...claim.values, seed: d("f") } });
    expect(await f.host.send(original)).toBeNull();
    expect(f.provider.calls).toEqual([]);
  });

  // Invariant: only an exact, bounded own reply supplies evidence; provider failures and malformed replies supply none.
  test("refusals retain nameExists; malformed, substituted and failing replies remain no answer", async () => {
    const f = fixture();
    f.provider.reply = { created: false, name: f.name(), nameExists: true };
    expect(await f.host.send(f.request())).toEqual({ result: "refused", evidence: { basis: "own-answer", body: { name: f.name(), nameExists: true } } });
    const malformed = [
      { created: true, name: "another", id: "repo-7" },
      { created: true, name: f.name(), id: "é".repeat(129) },
      { created: true, name: f.name(), id: "repo-7", secret: "never retain" },
      { created: true, name: f.name(), id: "repo-7", nameExists: false },
      { created: false, name: f.name(), nameExists: "yes" },
      { created: false, name: f.name(), nameExists: false, id: "repo-7" },
      { result: "confirmed", evidence: { basis: "read", body: { name: f.name(), id: "repo-7" } } },
      new Error("secret provider error"),
    ];
    for (const reply of malformed) { f.provider.reply = reply; expect(await f.host.send(f.request())).toBeNull(); }
    let reads = 0;
    f.provider.reply = { created: true, name: f.name(), get id() { return ++reads === 1 ? "repo-7" : "unchecked"; } };
    expect(await f.host.send(f.request())).toMatchObject({ evidence: { body: { id: "repo-7" } } });
    expect(reads).toBe(1);
    f.provider.reply = { created: true, name: f.name(), get id() { throw new Error("secret"); } };
    expect(await f.host.send(f.request())).toBeNull();
  });

  // Invariant: cleanup addresses only IDs from its sealed confirmed creation and trusts only that cleanup's own matching reply.
  test("a late unselected creation opens exact repository deletion and credential revocation", async () => {
    const f = fixture();
    expect(f.register.outcome("1:0", 1, "unknown").result).toBe("write");
    expect(f.register.outcome("1:0", 2, "confirmed", { name: f.name(2), id: "selected-repo" }).result).toBe("write");
    expect(f.register.outcome("1:0", 1, "confirmed", { name: f.name(1), id: "owed-repo", credential: "owed-credential" }).result).toBe("write");
    const cleanups = f.register.last.effects.filter((effect) => effect.effect === "operation");
    expect(cleanups.map((effect) => effect.kind)).toEqual(["revoke-credential", "delete-repository"]);
    const revoke = f.request(`${f.register.last.seq}:0`);
    const deletion = f.request(`${f.register.last.seq}:1`);
    f.provider.reply = { revoked: true, credential: "another-credential" };
    expect(await f.host.send(revoke)).toBeNull();
    f.provider.reply = { revoked: true, credential: "owed-credential" };
    expect(await f.host.send(revoke)).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { credential: "owed-credential" } } });
    f.provider.reply = { deleted: false, id: "owed-repo" };
    expect(await f.host.send(deletion)).toEqual({ result: "refused", evidence: { basis: "own-answer", body: { id: "owed-repo" } } });
    f.provider.reply = { deleted: true, id: "owed-repo" };
    expect(await f.host.send(deletion)).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { id: "owed-repo" } } });
    expect(f.provider.calls).toEqual([["revoke", "owed-credential"], ["revoke", "owed-credential"], ["delete", "owed-repo"], ["delete", "owed-repo"]]);
    const forged = resealed(deletion, (entry) => { if (entry.input.type === "outcome") entry.input.evidence.body = { name: f.name(1), id: "selected-repo" }; });
    expect(await f.host.send(forged)).toBeNull();
    expect(f.provider.calls).toHaveLength(4);
  });
});
