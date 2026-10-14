import { describe, expect, it } from "vitest";
import { cleanupMcp, finishRun, sessionEnder, type Agent, type SessionDuty } from "../../measure/mcp-stage0.mjs";
import type { Answer, Api } from "../../measure/cleanup.mjs";

/**
 * Review 66fec276: the MCP stage 0 harness's cleanup and finalizer. These
 * run the harness's own `cleanupMcp` and `finishRun` against a fake
 * Artifacts REST API (no live calls). The first seven are the checker's
 * controls; each must give the exit code the remote state deserves. The
 * rest cover the bearer sessions the harness also owes.
 */

const CANON = "0123456789abcdef0123456789abcdef";
const FORK = `${CANON}--act_5_d0f22a95`;

type Mode = "clean" | "inventory-refused" | "cleanup-threw" | "malformed-repo-items" | "revoke-refused" | "delete-refused" | "delete-refused-final-inventory-unknown";

/** The checker's fake: one repository with one write token, and a fault by mode. */
function fake(mode: Mode) {
  const state = { deleted: new Set<string>(), revoked: new Set<string>(), inventories: 0 };
  const repos = [CANON, FORK];
  const api: Api = async (method, path): Promise<Answer> => {
    if (mode === "cleanup-threw") throw new Error("inventory transport failure");
    if (method === "GET" && path.startsWith("/repos?")) {
      state.inventories++;
      if (mode === "inventory-refused" || (mode === "delete-refused-final-inventory-unknown" && state.inventories > 1)) return { success: false };
      if (mode === "malformed-repo-items") return { success: true, result: [{}] };
      return { success: true, result: repos.filter((r) => !state.deleted.has(r)).map((name) => ({ name })) };
    }
    const tokens = /^\/repos\/([^/]+)\/tokens\?/.exec(path);
    if (method === "GET" && tokens) return { success: true, result: [{ id: `tok-${tokens[1]!.slice(-6)}`, scope: "write" }].filter((t) => !state.revoked.has(t.id)) };
    const tok = /^\/tokens\/(.+)$/.exec(path);
    if (method === "DELETE" && tok) {
      if (mode === "revoke-refused") return { success: false, errors: [{ code: 403, message: "refused" }] };
      state.revoked.add(tok[1]!);
      return { success: true };
    }
    const repo = /^\/repos\/([^/?]+)$/.exec(path);
    if (method === "DELETE" && repo) {
      if (mode.startsWith("delete-refused")) return { success: false, errors: [{ code: 403, message: "refused" }] };
      state.deleted.add(repo[1]!);
      return { success: true };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { api, state };
}

const noSessions = async (): Promise<SessionDuty[]> => [];

/** The harness's finalizer over its real cleanup: the exit code and the recorded result. */
async function finish(api: Api, opts: { agents?: Agent[]; endSession?: (a: Agent) => Promise<readonly SessionDuty[]>; failed?: boolean; steps?: { ok: boolean }[]; minted?: Map<string, string> } = {}) {
  const out: { steps: { ok: boolean }[]; cleanup?: any; ok?: boolean } = { steps: opts.steps ?? [{ ok: true }] };
  const code = await finishRun(out, opts.failed ?? false, () =>
    cleanupMcp({ api, canonical: CANON, expected: [CANON, FORK], minted: opts.minted ?? new Map(), agents: opts.agents ?? [], endSession: opts.endSession ?? noSessions }),
  );
  return { code, out };
}

describe("review 66fec276: the checker's seven controls against the harness's finalizer", () => {
  it("clean: every token revoked, every repository deleted, the final inventory empty: exit 0", async () => {
    const f = fake("clean");
    const { code, out } = await finish(f.api);
    expect(code).toBe(0);
    expect(out.ok).toBe(true);
    expect(out.cleanup).toMatchObject({ ok: true, unresolved: [], reposLeft: [] });
    expect([...f.state.deleted].sort()).toEqual([CANON, FORK].sort());
  });

  it("inventory refused: exit 1, what is left is unknown (null), and the known repositories are still cleaned", async () => {
    const f = fake("inventory-refused");
    const { code, out } = await finish(f.api);
    expect(code).toBe(1);
    expect(out.cleanup.reposLeft).toBeNull();
    expect(out.cleanup.unresolved.map((d: { duty: string; outcome: string }) => `${d.duty}:${d.outcome}`)).toEqual(["inventory:refused", "final-inventory:refused"]);
    expect([...f.state.deleted].sort()).toEqual([CANON, FORK].sort());
    expect([...f.state.revoked].length).toBe(2);
  });

});

describe("review 66fec276: bearer sessions and the run's own result", () => {
  const redeemed = (member: string): Agent => ({ member, invitation: "act_3_00000000", redeemed: "done", key: `key_${member.slice(1)}`, bearer: "arb_fake" });
  const ended = async (a: Agent): Promise<SessionDuty[]> => [
    { duty: "revoke-agent-key", member: a.member, key: a.key!, outcome: "done" },
    { duty: "bearer-refused", member: a.member, key: a.key!, outcome: "done" },
  ];

  it("ended sessions and clean Artifacts: exit 0", async () => {
    const { code, out } = await finish(fake("clean").api, { agents: [redeemed("@a"), redeemed("@b")], endSession: ended });
    expect(code).toBe(0);
    expect(out.cleanup.duties.filter((d: { duty: string }) => d.duty === "bearer-refused")).toHaveLength(2);
  });

  it("an exception ending one agent's session: exit 1, and the later agents and the Artifacts cleanup still run", async () => {
    const f = fake("clean");
    const seen: string[] = [];
    const endSession = async (a: Agent) => {
      seen.push(a.member);
      if (a.member === "@a") throw new Error("room unreachable");
      return ended(a);
    };
    const { code, out } = await finish(f.api, { agents: [redeemed("@a"), redeemed("@b")], endSession });
    expect(code).toBe(1);
    expect(seen).toEqual(["@a", "@b"]);
    expect(out.cleanup.unresolved).toEqual([{ duty: "end-session", member: "@a", key: "key_a", outcome: "unknown", detail: "room unreachable" }]);
    expect([...f.state.deleted].sort()).toEqual([CANON, FORK].sort());
  });

  it("a bearer still answered after its key was revoked: exit 1", async () => {
    const endSession = async (a: Agent): Promise<SessionDuty[]> => [
      { duty: "revoke-agent-key", member: a.member, key: a.key!, outcome: "done" },
      { duty: "bearer-refused", member: a.member, key: a.key!, outcome: "refused", detail: "status 200" },
    ];
    const { code, out } = await finish(fake("clean").api, { agents: [redeemed("@a")], endSession });
    expect(code).toBe(1);
    expect(out.cleanup.unresolved).toEqual([{ duty: "bearer-refused", member: "@a", key: "key_a", outcome: "refused", detail: "status 200" }]);
  });

  it("a failed step, or a drive that threw, fails the run even when cleanup is all done", async () => {
    expect((await finish(fake("clean").api, { steps: [{ ok: true }, { ok: false }] })).code).toBe(1);
    expect((await finish(fake("clean").api, { failed: true })).code).toBe(1);
    expect((await finish(fake("clean").api, { steps: [] })).code).toBe(1);
  });

  it("a cleanup that throws outside any duty is a failed cleanup: exit 1, recorded", async () => {
    const out: { steps: { ok: boolean }[]; cleanup?: any; ok?: boolean } = { steps: [{ ok: true }] };
    const code = await finishRun(out, false, async () => {
      throw new Error("bug");
    });
    expect(code).toBe(1);
    expect(out.cleanup).toMatchObject({ ok: false, reposLeft: null, unresolved: [{ duty: "cleanup", outcome: "unknown", detail: "bug" }] });
  });

  it("sessionEnder: a revoked key and a refused bearer are done; a live bearer, a refused revocation or a lost redemption are not", async () => {
    const io = (revoke: number, read: number) => sessionEnder({ act: async () => ({ status: revoke, body: revoke === 409 ? { rule: "not-authorized" } : {} }), read: async () => ({ status: read }) });
    const a = redeemed("@a");
    expect((await io(200, 401)(a)).map((d) => d.outcome)).toEqual(["done", "done"]);
    expect((await io(200, 200)(a)).map((d) => d.outcome)).toEqual(["done", "refused"]);
    expect((await io(409, 200)(a)).map((d) => d.outcome)).toEqual(["refused", "refused"]);
    expect((await io(503, 503)(a)).map((d) => d.outcome)).toEqual(["unknown", "unknown"]);
    expect((await io(200, 401)({ ...a, redeemed: "unknown", key: null, bearer: null })).map((d) => d.outcome)).toEqual(["unknown"]);
    expect((await io(200, 401)({ ...a, redeemed: "refused", key: null, bearer: null })).map((d) => d.outcome)).toEqual(["done"]);
    // Through the finalizer, a lost redemption fails the run.
    const { code } = await finish(fake("clean").api, { agents: [{ ...a, redeemed: "unknown", key: null, bearer: null }], endSession: io(200, 401) });
    expect(code).toBe(1);
  });

  it("an exception inside the Artifacts cleanup that no duty catches: exit 1, recorded as an unknown duty", async () => {
    const f = fake("clean");
    // A token record whose keys cannot be read: cleanupRun throws while taking its metadata, outside any remote call.
    const hostile = new Proxy({ id: "tok-hostile", scope: "write" }, { ownKeys: () => { throw new Error("unreadable record"); } });
    const api: Api = async (method, path) => (method === "GET" && path.includes("/tokens?") ? { success: true, result: [hostile] } : f.api(method, path));
    const { code, out } = await finish(api, { agents: [redeemed("@a")], endSession: ended });
    expect(code).toBe(1);
    expect(out.cleanup.unresolved).toEqual([{ duty: "artifacts-cleanup", outcome: "unknown", detail: "unreadable record" }]);
  });

});
