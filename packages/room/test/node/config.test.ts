import { describe, expect, it } from "vitest";
import { servicesFor, type RoomEnv } from "../../src/config.ts";
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
    await (await r.logRemote({ namespace: "imp", name: "x" })).readObject(SHA as never).catch(() => undefined);
    await (await r.logRemote({ namespace: "pub", name: "y" })).readObject(SHA as never).catch(() => undefined);
    expect(imp.length > 0 && imp.every((n) => n === "x")).toBe(true);
    expect(pub.length > 0 && pub.every((n) => n === "y")).toBe(true);
  });

  it("without an import binding there is one binding, even with IMPORT_NAMESPACE set; its log remote is unavailable, never the public binding (review a35b4b61)", async () => {
    const pub: string[] = [];
    expect(servicesFor({ PUBLIC_NAMESPACE: "pub", ARTIFACTS: binding(pub) } as unknown as RoomEnv, "o").remotes.bindings).toEqual({});
    const r = servicesFor({ PUBLIC_NAMESPACE: "pub", ARTIFACTS: binding(pub), IMPORT_NAMESPACE: "imp" } as unknown as RoomEnv, "o").remotes;
    expect(r.bindings).toEqual({});
    await expect((await r.logRemote({ namespace: "imp", name: "x" })).readObject(SHA as never)).rejects.toThrow();
    expect(pub).toEqual([]);
  });
});
