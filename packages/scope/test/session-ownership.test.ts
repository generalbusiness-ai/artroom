import { expect, onTestFinished, test } from "vitest";
import { b64url, timeMs } from "@generalbusiness/artroom-bytes";
import { command, memoryStore } from "@generalbusiness/artroom-cli";
import { Gate, net } from "../src/testing.ts";
import { routed } from "./repository.ts";
import { beginSessionFixture, observeSessionReads, sessionSettings, type SessionReadChoice } from "./session-settings.ts";

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
  } finally {
    stop(); gate.release(); await lateCleanup;
    lease1.close(); lease2.close(); fresh.close(); old.close();
  }
});
