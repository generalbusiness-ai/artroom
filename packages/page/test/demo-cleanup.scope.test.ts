import { expect, test } from "vitest";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { demo } from "./support/demo.ts";

// The actual helper fails through its existing synchronous wrap boundary.
// No setup transport, native Scope state or unresolved timeout is simulated.
test("demo setup exceptions release owned globals and preserve newer fixture wiring", async () => {
  const before = { hold: net.hold, deaf: net.deaf, secret: platformNet.secret, sessions: platformNet.sessions, outside: [...platformOutside] };
  const original = new Error("intentional setup boundary failure");
  await expect(demo(() => { throw original; })).rejects.toBe(original);
  expect({ hold: net.hold, deaf: net.deaf, secret: platformNet.secret, sessions: platformNet.sessions, outside: [...platformOutside] }).toEqual(before);
  let inner: Promise<unknown> | null = null;
  await expect(demo(() => { inner = demo(() => { throw original; }).catch((error) => error); throw original; })).rejects.toBe(original);
  expect(await inner).toBe(original);
  expect({ hold: net.hold, deaf: net.deaf, secret: platformNet.secret, sessions: platformNet.sessions, outside: [...platformOutside] }).toEqual(before);
  const newerHold = () => true, newerDeaf = () => true;
  const newerSecret = "newer-fixture-test-secret";
  try {
    await expect(demo(() => { net.hold = newerHold; net.deaf = newerDeaf; platformNet.secret = newerSecret; platformNet.sessions = false; throw original; })).rejects.toBe(original);
    expect([net.hold, net.deaf, platformNet.secret, platformNet.sessions]).toEqual([newerHold, newerDeaf, newerSecret, false]);
    expect([...platformOutside]).toEqual(before.outside);
  } finally { net.hold = before.hold; net.deaf = before.deaf; platformNet.secret = before.secret; platformNet.sessions = before.sessions; }
});
