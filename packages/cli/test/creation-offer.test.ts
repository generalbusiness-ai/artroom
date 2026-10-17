import { expect, test } from "vitest";
import { newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { CreationOffer } from "@generalbusiness/artroom-client";
import { checkClaim, claim, memoryStore, type Context } from "../src/index.ts";

// Real shared command boundary with SCRIPTED offer/transport; no native admission.
test("explicit demo preflight refuses another full register before recovery preparation, while Check without an original reads no offer or mutation", async () => {
  const service = "https://claim-offer.test", store = memoryStore();
  const register = { kind: "register" as const, scope: scopeIdOf({ v: 1, kind: "register", definition: "platform:register@7", creator: null, cause: textDigest("TEST claim offer"), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(3)) };
  await store.keep("operator", new Uint8Array(32).fill(41));
  await store.save({ v: 1, service, key: "operator", register });
  let transports = 0, offers = 0;
  const offered: CreationOffer = { v: 1, origin: service, register: { ...register, inc: newIncarnation(new Uint8Array(16).fill(4)) }, definition: "platform:register@7", at: { seq: 0, hash: textDigest("TEST head") }, registerItem: { id: 0, revision: 1, state: "open", host: "github.com", namespace: "generalbusiness-ai", policy: "open", purpose: "demo-start" } };
  const ctx: Context = { store, fetch: async () => { transports++; throw Error("No preflight transport expected"); }, creationOffer: async expected => { offers++; expect(expected).toEqual(register); return offered; } };
  const before = await store.config();
  expect((await claim(ctx, "TEST"))).toMatchObject({ code: 1, lines: [expect.stringContaining("does not match")] });
  expect([transports, offers, await store.secret("recovery")]).toEqual([0, 1, null]);
  expect(await store.config()).toEqual(before);
  expect(await checkClaim({ ...ctx, creationOffer: async () => { throw Error("Check must not read an offer"); } }, "TEST")).toMatchObject({ code: 1, lines: [expect.stringContaining("No original claim")] });
  expect([transports, offers, await store.secret("recovery")]).toEqual([0, 1, null]);
  expect(await store.config()).toEqual(before);
});
