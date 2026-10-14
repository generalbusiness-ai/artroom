// Genuine Node WebCrypto; public TEST seeds and scripted binding, no enrollment or native acts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { b64url, keyIdOfSecret, newIncarnation, scopeIdOf, textDigest, verify, verifySessionRequest } from "@generalbusiness/artroom-bytes";
import { signerSessionRequest } from "@generalbusiness/artroom-client";
import type { ScopeRef } from "@generalbusiness/dap-contract";
import { COUNTING_COMMITMENTS_DEFINITION } from "../commitments-pin.ts";
import { deviceSigner, importDemoBundle, importLegacyDevice } from "./device-key.ts";

const origin = "https://counter-keys.test";
Object.defineProperty(globalThis, "location", { configurable: true, value: { origin } });
const ref = (kind: ScopeRef["kind"]): ScopeRef => ({ scope: scopeIdOf({ v: 1, kind, definition: COUNTING_COMMITMENTS_DEFINITION, creator: null, cause: textDigest("TEST device " + kind), ordinal: 0 }), kind, inc: newIncarnation(new Uint8Array(16).fill(7)) });
const membership = ref("membership"), scope = ref("lane");
function fixture() {
  return { v: 1, identities: ["Ada", "Beau", "Cleo"].map((name, index) => {
    const seed = new Uint8Array(32).fill(21 + index);
    return { name, seed: b64url(seed), binding: { origin, deployment: "TEST deployment", scope, membership, member: { membership, member: "@" + name.toLowerCase() }, publicKey: keyIdOfSecret(seed), definition: COUNTING_COMMITMENTS_DEFINITION, cohort: { directory: "platform:directory@6", membership: "platform:membership@5", rules: "platform:rules@3", destination: "platform:destination@2" } } };
  }) };
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test("TEST bundle becomes non-extractable keys that survive structured clone and sign existing request domains; loader buffers are cleared", async () => {
  const input = bytes(fixture());
  const devices = await importDemoBundle(input, origin);
  assert.ok(input.every(byte => byte === 0), "bundle byte buffer must be cleared");
  assert.deepEqual(devices.map(device => device.name), ["Ada", "Beau", "Cleo"]);
  for (const device of structuredClone(devices)) {
    assert.equal(device.key.extractable, false);
    await assert.rejects(crypto.subtle.exportKey("pkcs8", device.key), { name: "InvalidAccessError" });
    const signer = await deviceSigner(device);
    const message = new TextEncoder().encode("TEST local signing challenge");
    assert.ok(verify(device.binding.publicKey, await signer.sign(message), message));
    assert.ok(verifySessionRequest(await signerSessionRequest(device.binding.membership, signer, "2026-10-12T00:01:00Z", "TEST operation")));
    assert.deepEqual(Object.keys(device).sort(), ["binding", "key", "name"]);
  }
  const swapped = { ...devices[0]!, key: devices[1]!.key };
  await assert.rejects(deviceSigner(swapped), /does not match/);
});

test("TEST mismatched bundles are refused and cleared; legacy raw seed imports use the same non-extractable path", async () => {
  const wrong = fixture(); wrong.identities[0]!.binding.publicKey = wrong.identities[1]!.binding.publicKey;
  const input = bytes(wrong);
  await assert.rejects(importDemoBundle(input, origin), /does not match/);
  assert.ok(input.every(byte => byte === 0));
  const foreign = bytes(fixture());
  await assert.rejects(importDemoBundle(foreign, "https://different.test"), /origin/);
  assert.ok(foreign.every(byte => byte === 0));
  const row = fixture().identities[0]!, bindingBytes = bytes({ ...row.binding, publicNote: "TEST legacy metadata", cohort: { ...row.binding.cohort, register: "platform:register@6" } }), seedBytes = new Uint8Array(32).fill(21);
  const device = await importLegacyDevice(bindingBytes, seedBytes, origin);
  assert.ok(bindingBytes.every(byte => byte === 0) && seedBytes.every(byte => byte === 0));
  assert.equal(device.key.extractable, false);
  assert.ok(!Object.hasOwn(device.binding, "publicNote") && !Object.hasOwn(device.binding, "cohort"));
  assert.equal((await deviceSigner(device)).key, row.binding.publicKey);
});
