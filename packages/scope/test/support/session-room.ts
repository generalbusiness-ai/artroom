/** Genuine native cohort creation/confirmation. Host is OutsideDouble,
 * clock scripted, setup reads inspected; final tokens are manually minted. */
import { expect } from "vitest";
import type { Intent, OperationId, PlatformDefinition, Seed, SessionClaims } from "@generalbusiness/dap-contract";
import { intentDigest, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { DEMO_PURPOSE, DIRECTORY_OF, REGISTER, repositoryName } from "@generalbusiness/dap-platform";
import { sessionsOf } from "../../src/sessions.ts";
import { soon } from "../net.ts";
import { outsideOf } from "../outside.ts";
import { rita, sam } from "../repository.ts";
import { beginSessionFixture } from "../session-settings.ts";
import { TEST_DEPLOYMENT } from "../worker.ts";
import { nativeFixtureLifetime, dispatchFixture, effectFixture } from "./native-fixture-lifetime.ts";

export const sessionCohorts = Object.entries(DIRECTORY_OF).filter(([, directory], index, entries) => entries.findIndex(([, pin]) => pin === directory) === index).map(([register, directory]) => [register as PlatformDefinition, directory] as const);
export async function sessionRoom(registerPin: PlatformDefinition = REGISTER) {
  const secret = "a synthetic native reference test secret", owner = beginSessionFixture({ secret, sessions: false, inspector: null });
  const life = nativeFixtureLifetime(owner, { required: false });
  try {
    const directoryPin = DIRECTORY_OF[registerPin]; if (!directoryPin) return expect.fail("no exact cohort");
    const demo = registerPin === "platform:register@7" || registerPin === "platform:register@8";
    const install: Intent = { v: 1, to: null, actor: rita.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "bounded-reference", ...(demo ? { policy: "open", purpose: DEMO_PURPOSE } : { policy: "keys", founders: [rita.key] }) }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
    const R = life.platform(scopeIdOf({ v: 1, kind: "register", definition: registerPin, creator: null, cause: intentDigest(install), ordinal: 0 }));
    const host = outsideOf(R.name); life.wire(R.name, () => ({ outside: host }));
    expect(await life.wait(() => R.stub.found(signIntent(install, rita.secret), registerPin))).toMatchObject({ answer: "accepted" });
    const register = await life.wait(() => R.at());
    const found = await life.wait(() => R.intent(rita, "found", { expected: { register: 1 }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: sam.key } }));
    const seed: Seed = { v: 1, kind: "directory", definition: directoryPin, creator: register, cause: intentDigest(found.intent), ordinal: 0 };
    const D = life.platform(scopeIdOf(seed));
    host.answer("1:0" as OperationId, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: "bounded-reference-repo" } } });
    expect(await life.wait(() => R.stub.submit(found, []))).toMatchObject({ answer: "accepted" });
    await effectFixture([R], life.wait); await dispatchFixture([R, D], life.wait);
    const entries = await life.wait(() => D.entries());
    const children = [1, 2, 3].map(n => life.platform(scopeIdOf(entries[0]!.sends.find(send => send.n === n)!.to as Seed)));
    await dispatchFixture([R, D, ...children], life.wait);
    const membership = await life.wait(() => children[0]!.at()), rules = await life.wait(() => children[1]!.at()), directory = await life.wait(() => D.at());
    const claims: SessionClaims = { v: 1, deployment: TEST_DEPLOYMENT, membership, member: rita.member.member, key: rita.key, reads: ["summary"], ends: soon(60) };
    return { life, R, D, children, membership, rules, directory, directoryPin, claims, secret, sessions: sessionsOf(secret, TEST_DEPLOYMENT)! };
  } catch (error) { life.release(); throw error; }
}
