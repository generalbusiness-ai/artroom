import { expect, onTestFinished, test } from "vitest";
import { b64url, entryHash, timeMs } from "@generalbusiness/artroom-bytes";
import { command, memoryStore } from "@generalbusiness/artroom-cli";
import { Gate, net } from "../src/testing.ts";
import { routed } from "./repository.ts";
import { beginSessionChild, beginSessionFixture, observeSessionReads, sessionSettings, type SessionReadChoice } from "./session-settings.ts";
import { nativeFixtureLifetime } from "./support/native-fixture-lifetime.ts";
import { NO_OUTSIDE } from "../src/index.ts";
import { wired } from "./outside.ts";
import { platformOutside } from "./worker.ts";

// Native register/route/session readers. The lifecycle Gate is a model, not
// evidence of the unknown 270 chronology. No response data/credentials logged.
test("stale session cleanup and one completed lease cannot expose a new owner's headerless register read", async () => {
  const old = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: true });
  onTestFinished(old.close);
  let stop = () => {};
  onTestFinished(() => stop());
  const gate = new Gate(); gate.hold();
  const lateCleanup = gate.pass().then(old.close);
  await gate.held();
  const fresh = beginSessionFixture({ secret: b64url(crypto.getRandomValues(new Uint8Array(32))), sessions: false, inspector: null });
  onTestFinished(fresh.close);
  const lease1 = fresh.acquireRequired(), lease2 = fresh.acquireRequired();
  const choices: SessionReadChoice[] = [];
  try {
    const store = memoryStore();
    const installed = await command({ store, fetch: routed as never, now: () => timeMs(net.clock.now)! }, ["install", "https://scopes.test", "--host", "git.example", "--namespace", "session-owner"]);
    expect(installed.code).toBe(0);
    const register = (await store.config())!.register!;
    gate.release(); await lateCleanup;
    lease1.close();
    stop = observeSessionReads(fresh, (choice) => { if (choices.length >= 64) throw new Error("Session witness read bound exceeded."); choices.push(choice); });
    const response = await routed(`https://scopes.test/v1/scopes/${register.scope}`);
    const body = await response.json() as { ok?: boolean; reason?: string; value?: { scope?: { scope?: string; inc?: string; kind?: string } } };
    const matches = body.value?.scope?.scope === register.scope && body.value?.scope?.inc === register.inc && body.value?.scope?.kind === register.kind;
    const classification = body.ok === false && body.reason === "forbidden" ? "forbidden" : body.ok === true && matches ? "ok-summary" : "unrecognized";
    // The control must reach this actual parsed native response assertion.
    expect([response.status, classification]).toEqual([403, "forbidden"]);
    expect([sessionSettings().sessions, fresh.isCurrent(), choices.some(c => c.phase === "prepare"), choices.some(c => c.phase === "allows")]).toEqual([true, true, true, true]);
    expect(choices.every(c => c.sessions && c.ownerMatches && c.requiredLeases === 1 && c.nullReader && !c.inspectorPresent && c.branch === "real")).toBe(true);

    // Ownership-only waits preserve the configured read mode. Explicit
    // authenticated leases still force real readers and keep child ancestry.
    stop(); stop = () => {};
    lease2.close();
    const lifetime = nativeFixtureLifetime(fresh, { required: false });
    const held = new Gate(); held.hold();
    try {
      expect(await lifetime.wait(async () => sessionSettings().sessions)).toBe(false);
      const child = await lifetime.wait(async () => beginSessionChild(fresh, { secret: null, sessions: false }));
      try {
        expect(await lifetime.waitFor(child, async () => sessionSettings().sessions)).toBe(false);
        expect(await lifetime.waitFor(child, () => child.required(async () => sessionSettings().sessions))).toBe(true);
        expect([sessionSettings().sessions, child.belongsTo(fresh), fresh.ownsCurrentFrame()]).toEqual([false, true, true]);
      } finally { child.close(); }
      // Retaining one actual entry twice must not turn semantic peer identity
      // into a cyclic ownership token. Borrowing a hold predicate is likewise
      // distinct from installing another owner's token.
      const genesis = (await lifetime.platform(register.scope).entries())[0]!;
      const hash = entryHash(genesis), peer = { entry: genesis, under: "platform:register" };
      lifetime.peer(hash, peer);
      const outerHold = net.hold;
      const nestedOwner = beginSessionChild(fresh, { sessions: false });
      const nested = nativeFixtureLifetime(nestedOwner, { required: false });
      try {
        nested.peer(hash, peer);
        nested.setHold(outerHold!);
      } finally { nested.release(); }
      expect([net.peers.get(hash), lifetime.current()]).toEqual([peer, true]);
      lifetime.wire(register.scope, () => ({}));
      lifetime.outside(register.scope, () => NO_OUTSIDE);
      let continued = false;
      const late = lifetime.wait(() => held.pass()).then(() => { continued = true; });
      const refused = expect(late).rejects.toThrow("Native fixture session ownership ended");
      await held.held();
      const next = beginSessionFixture({ sessions: false });
      onTestFinished(next.close);
      const replacement = nativeFixtureLifetime(next, { required: false });
      onTestFinished(replacement.release);
      try {
        replacement.wire(register.scope, () => ({}));
        replacement.outside(register.scope, () => NO_OUTSIDE);
        const successorWire = wired.get(register.scope), successorOutside = platformOutside.get(register.scope);
        lifetime.release(); held.release(); await refused;
        expect(() => { lifetime.unWire(register.scope); lifetime.unOutside(register.scope); }).not.toThrow();
        expect([wired.get(register.scope), platformOutside.get(register.scope)]).toEqual([successorWire, successorOutside]);
        expect([continued, replacement.current(), sessionSettings().sessions]).toEqual([false, true, false]);
      } finally { held.release(); replacement.release(); }
    } finally { held.release(); lifetime.release(); }
  } finally {
    stop(); gate.release(); await lateCleanup;
    lease1.close(); lease2.close(); fresh.close(); old.close();
  }
});
