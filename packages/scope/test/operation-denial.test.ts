import { describe, expect, test } from "vitest";
import type { Entry, OperationId } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "@generalbusiness/artroom-bytes";
import { snapshotCommit, ZERO_ID } from "@generalbusiness/artroom-git";
import { sendOnce } from "../src/github-host.ts";
import type { DestinationProvider } from "../src/destination-host.ts";
import { SqliteStore, type EffectRequest } from "../src/index.ts";
import { pushOf, wired } from "./outside.ts";
import { type Lane, START, found } from "./support.ts";
import { open } from "./operation-opening.ts";

const surface = (s: Lane) => s.object as unknown as { effect(): Promise<number> };

// This real Scope/SQLite witness has its own Worker runtime. The original
// assertions and producer remain; it does not claim cross-test native abort cleanup.
describe("outside operations at a real scope (scope contract, section 4.3; authority note, section 5.4). The outside system and the opening entry are stand-ins", () => {
  // Invariant: local denial after the actual durable sent mark is unknown,
  // retaining the original request bindings/reservation without another ask.
  // Opening/owner rules, live authorization, producer conversion and finite
  // HTTP upstream are STAND-INS. Scope, SQLite, mark readback, Operations,
  // sendOnce and smart Git validation/transport are actual. No host or mint
  // revocation/expiry authority is claimed; no executor design is involved.
  test("post-sent local denial keeps unknown and original bindings; unmarked standalone classification remains not-sent", async () => {
    const s = await found();
    const built = snapshotCommit([], "post-sent denial fixture\n");
    const remote = "https://git.example/artroom/denial.git";
    let liveAuthorization = true;
    let posts = 0;
    let release!: () => void;
    let reached!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    let holdDiscovery = true;
    const requests: EffectRequest[] = [];
    const packet = (text: string) => `${(utf8(text).length + 4).toString(16).padStart(4, "0")}${text}`;
    const fetch = async (request: Request): Promise<Response> => {
      if (request.method === "POST") { posts++; return new Response(null, { status: 500 }); }
      expect(request.url).toBe(`${remote}/info/refs?service=git-receive-pack`);
      if (holdDiscovery) { reached(); await held; }
      return new Response(packet("# service=git-receive-pack\n") + "0000" + packet(`${ZERO_ID} capabilities^{}\0report-status object-format=sha1\n`) + "0000", { headers: { "content-type": "application/x-git-receive-pack-advertisement" } });
    };
    const transport = { remote, maxBytes: 1024 * 1024, fetch };
    const argumentsOf = (request: EffectRequest): Parameters<DestinationProvider["send"]>[0] => ({
      repository: { host: "git.example", namespace: "artroom", name: "denial", id: "scripted-71" }, ref: "refs/heads/main", old: null, commit: built.commit,
      objects: built.objects.map(({ id, type, data }) => ({ id, kind: type, body: data })), requireParentless: true, token: "scripted_private_token",
      binding: { scope: request.scope, mint: request.operation, attempt: 1, write: request.operation, writeAttempt: request.attempt, ref: "refs/heads/main" },
      ...(request.sentAt === undefined ? {} : { sentAt: request.sentAt }), allowed: () => liveAuthorization,
    });
    wired.set(s.name, () => ({ outside: { accepts: () => true, send: async (request) => {
      requests.push(request);
      const reply = await sendOnce(argumentsOf(request), transport, async () => null);
      // Stand-in conversion exposes the same decisive/non-answer distinction
      // consumed by the production destination adapter and Operations.
      return reply === null ? null : { result: "refused", evidence: { basis: "own-answer", body: reply as { send: string } } };
    } } }));
    try {
      await s.restart(); // Construct wired port before opening the one attempt.
      const [op] = await open(s, pushOf(1)) as [OperationId];
      const opening = (await s.sealed(1))[0]!;
      const inspect = () => s.inside((state) => {
        const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
        const status = store.operationStatus(op);
        const outcome = status?.operation.attempts[0]?.outcomes[0];
        const entry = outcome ? JSON.parse(store.stored(outcome.seq)!.bytes) as Entry : null;
        return { row: store.sending(op, 1), status, outcome: entry?.input ?? null, outstanding: store.outstanding() };
      });
      const pass = surface(s).effect();
      expect(await Promise.race([ready.then(() => true), pass.then(() => false)])).toBe(true);
      const marked = await inspect();
      expect(marked.row).toMatchObject({ operation: op, attempt: 1, sent: START });
      expect(requests).toEqual([{ scope: s.at, operation: op, attempt: 1, owner: "platform:destination@1", kind: "push", origin: opening, sentAt: marked.row!.sent }]);
      const bindings = canonicalize(requests);
      liveAuthorization = false;
      release();
      await pass;
      const denied = await inspect();
      expect([requests.length, posts, denied.row]).toEqual([1, 0, marked.row]);
      expect(canonicalize(requests)).toBe(bindings);
      expect(denied.outcome).toMatchObject({ type: "outcome", operation: op, attempt: 1, result: "unknown", evidence: { basis: "none" } });
      expect([denied.status?.state, denied.outstanding.unknown]).toEqual(["unknown", 1]);
      expect((await s.sealed(1))[0]).toEqual(opening);
      holdDiscovery = false;
      // Independent low-level standalone invocation, not another request of
      // the Scope attempt; explicitly omit internal sent bookkeeping.
      const { sentAt: _sentAt, ...unmarked } = argumentsOf(requests[0]!);
      expect(await sendOnce(unmarked, transport, async () => null)).toEqual({ send: "not-sent" });
      expect([requests.length, posts, (await inspect()).row]).toEqual([1, 0, marked.row]);
    } finally { release(); wired.delete(s.name); }
  });

});
