import { expect, test } from "vitest";
import type { FactRef, ScopeKind, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, keyIdOfSecret, newIncarnation, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { SITE_CONFIGURATION_DOMAIN, SITE_DELEGATION_DOMAIN, parseSiteConfiguration, parseSiteDelegation, type SiteConfiguration, type SiteDeclarationContext, type SiteDelegation } from "../src/site-declarations.ts";

// Pure declared-data boundary. IDs, key and fact references are made up;
// no scope admitted them and no registration, custody or receipt is proved.
test("site declarations require exact realm/provider, closed policy and canonical bounded bytes", () => {
  const ref = <K extends ScopeKind>(kind: K): ScopeRef & { kind: K } => ({ kind, scope: `sc_${"a".repeat(52)}`, inc: newIncarnation(new Uint8Array(16)) });
  const expected: SiteDeclarationContext = {
    directory: ref("directory"), membership: ref("membership"), rules: ref("rules"), destination: ref("destination"),
    repository: { host: "artifacts", namespace: "test", name: "room", id: "stable-test-id" },
  };
  const fact = (at: ScopeRef, seq: number): FactRef => ({ at, seq, hash: textDigest(`TEST fact ${seq}`) });
  const delegated: SiteDelegation = { v: 1, ...expected, authority: expected.rules, renderer: { installation: textDigest("TEST installation"), key: keyIdOfSecret(new Uint8Array(32).fill(1)) }, actions: ["repository.read"], notAfter: "2026-10-08T12:00:00Z" };
  const configured: SiteConfiguration = { v: 1, ...expected, authority: expected.rules, audience: "members", versions: { mode: "latest-published", ref: "HEAD" }, rendering: "site-safe@1", delegation: fact(expected.rules, 7) };
  const pinned: SiteConfiguration = { ...configured, audience: "public", versions: { mode: "pinned-published", commit: "b".repeat(40), publication: fact(expected.destination, 8), receipt: fact(expected.destination, 9) } };
  const readConfiguration = (value: unknown) => {
    const bytes = canonicalBytes(value);
    return parseSiteConfiguration(SITE_CONFIGURATION_DOMAIN, bytes, expected, bytes.length);
  };
  const bytes = canonicalBytes(delegated);
  expect(parseSiteDelegation(SITE_DELEGATION_DOMAIN, bytes, expected, bytes.length)).toEqual(delegated);
  expect([readConfiguration(configured), readConfiguration(pinned)]).toEqual([configured, pinned]);
  // Native authority is required, complete and equal to the expected rules
  // reference; old bytes or a substituted authority never infer that field.
  const { authority: _authority, ...missingAuthority } = configured;
  expect(readConfiguration(missingAuthority)).toBeNull();
  const { authority: _delegatedAuthority, ...missingDelegatedAuthority } = delegated;
  const missing = canonicalBytes(missingDelegatedAuthority);
  expect(parseSiteDelegation(SITE_DELEGATION_DOMAIN, missing, expected, missing.length)).toBeNull();
  const otherAuthority = { ...expected.rules, inc: newIncarnation(new Uint8Array(16).fill(2)) };
  expect(readConfiguration({ ...configured, authority: otherAuthority })).toBeNull();
  const substituted = canonicalBytes({ ...delegated, authority: otherAuthority });
  expect(parseSiteDelegation(SITE_DELEGATION_DOMAIN, substituted, expected, substituted.length)).toBeNull();
  expect(readConfiguration({ ...configured, authority: expected.destination })).toBeNull();
  expect(readConfiguration({ ...configured, authority: { ...expected.rules, kind: "site" } })).toBeNull();
  const unsupportedAttachment = canonicalBytes({ ...delegated, authority: { ...expected.rules, kind: "site" } });
  expect(parseSiteDelegation(SITE_DELEGATION_DOMAIN, unsupportedAttachment, expected, unsupportedAttachment.length)).toBeNull();
  // Same IDs with another incarnation, or a substituted stable provider ID,
  // cannot be accepted merely because their shapes and byte forms are valid.
  const otherRealm = { ...expected, membership: { ...expected.membership, inc: newIncarnation(new Uint8Array(16).fill(1)) } };
  expect(parseSiteDelegation(SITE_DELEGATION_DOMAIN, bytes, otherRealm, bytes.length)).toBeNull();
  expect(readConfiguration({ ...configured, repository: { ...expected.repository, id: "replacement" } })).toBeNull();
  expect(readConfiguration({ ...configured, audience: "repository-default" })).toBeNull();
  expect(readConfiguration({ ...configured, rendering: "unknown-profile" })).toBeNull();
  expect(readConfiguration({ ...configured, previous: configured.delegation })).toBeNull();
  expect(readConfiguration({ ...pinned, versions: { ...pinned.versions, receipt: fact(expected.rules, 9) } })).toBeNull();
  const broad = canonicalBytes({ ...delegated, actions: ["repository.read", "repository.write"] });
  expect(parseSiteDelegation(SITE_DELEGATION_DOMAIN, broad, expected, broad.length)).toBeNull();
  expect(parseSiteDelegation(SITE_CONFIGURATION_DOMAIN, bytes, expected, bytes.length)).toBeNull();
  expect(parseSiteDelegation(SITE_DELEGATION_DOMAIN, bytes, expected, bytes.length - 1)).toBeNull();
  // Equivalent JSON is not the immutable canonical byte declaration.
  const spaced = utf8(`${canonicalize(configured)}\n`);
  expect(parseSiteConfiguration(SITE_CONFIGURATION_DOMAIN, spaced, expected, spaced.length)).toBeNull();
  const duplicate = utf8(canonicalize(configured).replace('"audience":"members"', '"audience":"members","audience":"public"'));
  expect(parseSiteConfiguration(SITE_CONFIGURATION_DOMAIN, duplicate, expected, duplicate.length)).toBeNull();
});
