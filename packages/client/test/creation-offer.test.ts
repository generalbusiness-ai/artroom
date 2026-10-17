import { expect, test } from "vitest";
import { newIncarnation, scopeIdOf, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { creationOffer, isCreationOffer, type CreationOffer, type CreationOfferFetch } from "../src/creation-offer.ts";

// Actual SDK byte/URL guard over SCRIPTED HTTP, no native creation or permission.
test("fixed same-origin founding discovery accepts only the closed bounded demo projection and refuses redirects without consuming their body", async () => {
  const origin = "https://offer.test";
  const register = { kind: "register" as const, scope: scopeIdOf({ v: 1, kind: "register", definition: "platform:register@8", creator: null, cause: textDigest("TEST offer"), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(8)) };
  const offer: CreationOffer = { v: 1, origin, register, definition: "platform:register@8", at: { seq: 0, hash: textDigest("TEST head") }, registerItem: { id: 0, revision: 1, state: "open", host: "github.com", namespace: "generalbusiness-ai", policy: "open", purpose: "demo-start" } };
  let calls = 0;
  const fetch: CreationOfferFetch = async (url, init) => {
    calls++;
    expect(url).toBe(origin + "/v1/demo/creation-offer");
    expect(init).toMatchObject({ method: "GET", redirect: "error", credentials: "omit", cache: "no-store", headers: { accept: "application/json" } });
    return { status: 200, url, redirected: false, body: Response.json(offer).body };
  };
  expect(await creationOffer(origin, { fetch })).toEqual(offer);
  expect(calls).toBe(1);
  // Native genesis opens its register at head0 with itemrevision1.
  expect(isCreationOffer(offer, origin, register)).toBe(true);
  expect(isCreationOffer(offer, origin, { ...register, inc: newIncarnation(new Uint8Array(16).fill(9)) })).toBe(false);
  expect(isCreationOffer({ ...offer, operator: "an extra authority hint" }, origin, register)).toBe(false);
  expect(isCreationOffer({ ...offer, registerItem: { ...offer.registerItem, revision: 2 } }, origin, register)).toBe(false);
  await expect(creationOffer(origin + "/another", { fetch })).rejects.toThrow("No claim was submitted");
  expect(calls).toBe(1);
  let canceled = 0, read = 0;
  const body = { getReader: () => ({ read: async () => { read++; return { done: false, value: utf8("not needed") }; }, cancel: async () => { canceled++; } }) };
  await expect(creationOffer(origin, { fetch: async () => ({ status: 200, url: "https://foreign.test/v1/demo/creation-offer", redirected: true, body }) })).rejects.toThrow("No claim was submitted");
  expect([read, canceled]).toEqual([0, 1]);
  const oversized = { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(16 * 1024 + 1) }), cancel: async () => { canceled++; } }) };
  await expect(creationOffer(origin, { fetch: async url => ({ status: 200, url, redirected: false, body: oversized }) })).rejects.toThrow("No claim was submitted");
  expect(canceled).toBe(2);
  const legacy = { ...register, scope: scopeIdOf({ v: 1, kind: "register", definition: "platform:register@7", creator: null, cause: textDigest("TEST retained offer"), ordinal: 0 }) };
  const legacyOffer: CreationOffer = { ...offer, register: legacy, definition: "platform:register@7" };
  let selectedReads = 0;
  const selected: CreationOfferFetch = async url => {
    selectedReads++;
    expect(url).toBe(`${origin}/v1/demo/creation-offer?register=${legacy.scope}&inc=${legacy.inc}`);
    return { status: 200, url, redirected: false, body: Response.json(legacyOffer).body };
  };
  expect(await creationOffer(origin, { register: legacy, fetch: selected })).toEqual(legacyOffer);
  expect(selectedReads).toBe(1);
  expect(isCreationOffer({ ...offer, definition: "platform:register@9" }, origin)).toBe(false);
  await expect(creationOffer(origin, { fetch: async url => ({ status: 200, url, redirected: false, body: Response.json(legacyOffer).body }) })).rejects.toThrow("No claim was submitted");
  await expect(creationOffer(origin, { register: legacy, fetch: async url => ({ status: 200, url, redirected: false, body: Response.json(offer).body }) })).rejects.toThrow("No claim was submitted");
  await expect(creationOffer(origin, { register: { ...legacy, inc: newIncarnation(new Uint8Array(16).fill(9)) }, fetch: async url => ({ status: 200, url, redirected: false, body: Response.json(legacyOffer).body }) })).rejects.toThrow("No claim was submitted");
});
