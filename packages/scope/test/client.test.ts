import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { ScopeHandle, bindingTransport, found, httpTransport, secretSigner, signedIntent, type ServiceBinding, type Transport } from "@generalbusiness/artroom-client";
import { timeMs } from "@generalbusiness/artroom-derive";
import { deskDefinition, grantOf, ticketDefinition } from "@generalbusiness/artroom-derive/testing";
import { net, rita } from "./net.ts";
import { reader } from "./support.ts";

const transports: [string, () => Transport][] = [
  ["the Worker's fetch routes", () => httpTransport("https://scopes.test", { fetch: (url, init) => SELF.fetch(url, init) })],
  ["the Worker's service-binding entrypoint", () => bindingTransport(env.API as unknown as ServiceBinding)],
];

test.each(transports)("a scope handle over %s: an act returns its receipt; the exact retry and a later settlement return the same receipt; a followed receipt is checked against the entry's own hash", async (_name, transport) => {
  // No send is delivered, so the desk's history is the two entries this test writes.
  net.deaf = null;
  net.hold = () => true;
  const signer = secretSigner(rita.secret);
  const now = timeMs(net.clock.now)!;
  const founding = await signedIntent(signer, { to: null, kind: "found", fields: { source: "a repository" } }, { now });
  const { answer, scope } = await found(transport(), founding, deskDefinition.declared, [ticketDefinition.declared], reader);
  if (answer.answer !== "accepted" || !scope) throw new Error(`not founded: ${JSON.stringify(answer)}`);
  const at = answer.receipt.fact.at;
  expect(scope).toBeInstanceOf(ScopeHandle);
  // The client learns what it may do by reading: the published definition is the declaration the scope pins, checked by its digest.
  expect(await scope.definition()).toMatchObject({ ok: true, value: deskDefinition.declared });

  const signed = await signedIntent(signer, { to: at, kind: "open-issue", fields: { title: "A flaky test" } }, { now });
  const grants = [grantOf(rita, at, ["open-issue"])];
  const first = await scope.submit(signed, grants);
  if (first.answer !== "accepted") throw new Error(`not accepted: ${JSON.stringify(first)}`);
  const receipt = first.receipt;
  expect(receipt).toMatchObject({ fact: { at, seq: 1 }, sends: ["1.0"] });
  // The same signed intent again, as after a lost reply: the same receipt, and no second entry.
  expect([await scope.submit(signed, grants), await scope.settle(signed)]).toMatchObject([first, { ok: true, value: receipt, complete: true }]);
  expect((await scope.summary())).toMatchObject({ ok: true, at: { seq: 1, hash: receipt.fact.hash } });

  expect(await scope.followReceipt(receipt)).toMatchObject({ ok: true, entry: { seq: 1, input: { type: "act", signed } } });
  // A receipt that names another hash at that position is not of this history.
  expect(await scope.followReceipt({ ...receipt, fact: { ...receipt.fact, hash: answer.receipt.fact.hash } })).toEqual({ ok: false, reason: "hash-mismatch" });
  expect(await scope.followDuty(receipt.sends[0]!)).toMatchObject({ ok: true, value: { duty: "1.0", class: "request", held: false, result: null } });
  net.hold = null;
});
