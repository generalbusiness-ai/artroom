import { describe, expect, it } from "vitest";
import { pinDelayMs, servicesFor, type RoomEnv } from "../../src/config.ts";
import type { ArtifactsBinding } from "../../src/artifacts.ts";

/** A binding that records the repository names it was asked for, and has none. */
function binding(seen: string[]): ArtifactsBinding {
  const none = async (name: string): Promise<never> => {
    seen.push(name);
    throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
  };
  return { get: none, create: none, delete: none };
}

const SHA = "a".repeat(40);
/** Object reads take no token: the mint ledger is never reached here. */
const noMints = { withToken: () => Promise.reject(new Error("no token is minted for an object read")) };

describe("production services: one deployment, a binding per namespace (request b6b51de7)", () => {
  it("the import namespace's binding serves rooms whose repository is there; the public binding serves the rest", async () => {
    const pub: string[] = [];
    const imp: string[] = [];
    const env = { PUBLIC_NAMESPACE: "pub", ARTIFACTS: binding(pub), IMPORT_NAMESPACE: "imp", IMPORT_ARTIFACTS: binding(imp) } as unknown as RoomEnv;
    const r = servicesFor(env, "room-object").remotes;
    expect(r.namespace).toBe("pub");
    expect(Object.keys(r.bindings ?? {})).toEqual(["imp"]);
    expect(typeof r.firstCommit).toBe("function");
    // The log remote follows the repository's namespace.
    await (await r.logRemote({ namespace: "imp", name: "x" }, noMints)).readObject(SHA as never).catch(() => undefined);
    await (await r.logRemote({ namespace: "pub", name: "y" }, noMints)).readObject(SHA as never).catch(() => undefined);
    expect(imp.length > 0 && imp.every((n) => n === "x")).toBe(true);
    expect(pub.length > 0 && pub.every((n) => n === "y")).toBe(true);
  });

  it("without an import binding there is one binding, even with IMPORT_NAMESPACE set; its log remote is unavailable, never the public binding (review a35b4b61)", async () => {
    const pub: string[] = [];
    expect(servicesFor({ PUBLIC_NAMESPACE: "pub", ARTIFACTS: binding(pub) } as unknown as RoomEnv, "o").remotes.bindings).toEqual({});
    const r = servicesFor({ PUBLIC_NAMESPACE: "pub", ARTIFACTS: binding(pub), IMPORT_NAMESPACE: "imp" } as unknown as RoomEnv, "o").remotes;
    expect(r.bindings).toEqual({});
    await expect((await r.logRemote({ namespace: "imp", name: "x" }, noMints)).readObject(SHA as never)).rejects.toThrow();
    expect(pub).toEqual([]);
  });
});

describe("PIN_DELAY_MS (spike measurement only, assert 66a41558)", () => {
  it("is off unless set to a whole number of milliseconds; anything else stops the Room from starting", () => {
    expect(pinDelayMs({})).toBe(0);
    expect(pinDelayMs({ PIN_DELAY_MS: "" })).toBe(0);
    expect(pinDelayMs({ PIN_DELAY_MS: "0" })).toBe(0);
    expect(pinDelayMs({ PIN_DELAY_MS: "180000" })).toBe(180_000);
    for (const bad of ["-1", "1.5", "3m", " 5", "1e3", "NaN", "99999999999999999999"]) expect(() => pinDelayMs({ PIN_DELAY_MS: bad }), bad).toThrow("PIN_DELAY_MS must be a whole number of milliseconds");
  });
});
