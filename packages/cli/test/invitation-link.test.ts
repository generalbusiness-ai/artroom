import { expect, test } from "vitest";
import type { ScopeKind } from "@generalbusiness/dap-contract";
import { b64url, newIncarnation, scopeIdOf, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { AGENT_KEY_LINK, INVITATION_LINK, agentKeyInvitationOf, invitationOf, wellFormedInvitation, type InvitationLink, type InvitedRepository } from "@generalbusiness/artroom-client";
import { LINK, linkOf } from "../src/commands.ts";
import { command } from "../src/line.ts";
import type { Store } from "../src/store.ts";

// Invariant: the client's invitation parser, which the MCP server's join uses, reads every link as `artroom join` reads it, and
// refuses what it refuses; its shape check accepts exactly the references `artroom join` accepts.
test("the client's invitation link is the command line's", async () => {
  expect(INVITATION_LINK).toBe(LINK);
  const id = (kind: ScopeKind) => scopeIdOf({ v: 1, kind, definition: "platform:directory@3", creator: null, cause: textDigest(kind), ordinal: 0 });
  const inc = (n: number) => newIncarnation(new Uint8Array(16).fill(n));
  const repository: InvitedRepository = { directory: { scope: id("directory"), inc: inc(1), kind: "directory" }, membership: { scope: id("membership"), inc: inc(2), kind: "membership" }, rules: id("rules"), destination: id("destination") };
  const link: InvitationLink = { v: 1, service: "https://scopes.test", repository, invitation: 5, secret: "s".repeat(43), handle: "@una", definition: "platform:membership@2" };
  const text = (value: unknown) => `${LINK}${b64url(utf8(JSON.stringify(value)))}`;
  const cases = [text(link), text({ ...link, definition: undefined }), text({ ...link, v: 2 }), text({ ...link, invitation: 1.5 }), text({ ...link, secret: 7 }), `${LINK}not-base64!`, "https://not-a-link", text(null)];
  for (const c of cases) expect(invitationOf(c), c.slice(0, 40)).toEqual(linkOf(c));
  // Invalid endpoints must be refused before even looking up a signing key or retaining an envelope.
  let storeCalls = 0, fetchCalls = 0;
  const touched = async (): Promise<never> => { storeCalls++; throw Error("Signing store must not be read or written"); };
  const store: Store = { config: touched, save: touched, secret: touched, keep: touched, private: touched, keepPrivate: touched };
  const ctx = { store, fetch: async () => { fetchCalls++; throw Error("No transport before URL validation"); } };
  const invalid = ["not a URL", "http://scopes.test", "http://localhost:7781", "http://127.example.test", "https://user:pass@scopes.test", "https://scopes.test?x=1", "https://scopes.test#x", "https://scopes.test?", "https://scopes.test#"];
  const agent = { v: 1, kind: "agent-key", service: link.service, repository, definition: "platform:membership@2", handle: "@helper", controller: { membership: repository.membership, member: "@founder" }, member: { at: repository.membership, seq: 4, hash: textDigest("SCRIPTED member") }, invitation: { at: repository.membership, seq: 6, hash: textDigest("SCRIPTED invitation") }, secret: b64url(new Uint8Array(32).fill(12)), expected: { on: 1, member: 5 } };
  const tagged = (service: string) => AGENT_KEY_LINK + b64url(utf8(JSON.stringify({ ...agent, service })));
  for (const service of invalid) {
    expect(await command(ctx, ["join", text({ ...link, service })]), service).toMatchObject({ code: 2, lines: ["That invitation link has invalid repository references."] });
    expect(await command(ctx, ["join", tagged(service)]), service).toMatchObject({ code: 1, lines: ["The original agent enrollment is unavailable or unverified. Nothing was replaced."] });
  }
  // A person link must reject unusable proof input before touching private custody, just as an agent link does.
  const seed = b64url(new Uint8Array(32));
  for (const secret of ["not-a-seed", b64url(new Uint8Array(31)), seed.slice(0, -1) + "B", seed + "="]) {
    expect(await command(ctx, ["join", text({ ...link, definition: "platform:membership@6", secret })])).toMatchObject({ code: 2 });
  }
  expect(await command(ctx, ["join", text({ ...link, definition: "platform:membership@6", secret: seed, invitation: 1_000_000_001 })])).toMatchObject({ code: 2 });
  expect(wellFormedInvitation({ ...link, definition: "platform:membership@6", secret: seed })).toBe(true);
  expect([storeCalls, fetchCalls]).toEqual([0, 0]);
  for (const service of ["https://scopes.test", "https://scopes.test/base/", "https://scopes.test:8443", "http://127.0.0.1:7781", "http://127.2.3.4", "http://[::1]:7781"]) {
    expect(wellFormedInvitation({ ...link, service }), service).toBe(true);
    // Tagged key links retain their stricter canonical-origin requirement.
    expect(agentKeyInvitationOf(tagged(service)) !== null, service).toBe(new URL(service).origin === service);
  }
  expect(wellFormedInvitation(invitationOf(text(link))!)).toBe(true);
  expect(wellFormedInvitation(invitationOf(text({ ...link, repository: { ...repository, membership: { ...repository.membership, kind: "lane" } } }))!)).toBe(false);
  expect(wellFormedInvitation(invitationOf(text({ ...link, invitation: 0 }))!)).toBe(false);
});
