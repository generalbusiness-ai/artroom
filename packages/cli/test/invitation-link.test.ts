import { expect, test } from "vitest";
import { b64url, newIncarnation, scopeIdOf, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { INVITATION_LINK, invitationOf, wellFormedInvitation } from "@generalbusiness/artroom-client";
import { LINK, linkOf } from "../src/commands.ts";

// Invariant: the client's invitation parser, which the MCP server's join uses, reads every link as `artroom join` reads it, and
// refuses what it refuses; its shape check accepts exactly the references `artroom join` accepts.
test("the client's invitation link is the command line's", () => {
  expect(INVITATION_LINK).toBe(LINK);
  const id = (kind: string) => scopeIdOf({ v: 1, kind: kind as "directory", definition: "platform:directory@3", creator: null, cause: textDigest(kind), ordinal: 0 });
  const inc = (n: number) => newIncarnation(new Uint8Array(16).fill(n));
  const repository = { directory: { scope: id("directory"), inc: inc(1), kind: "directory" }, membership: { scope: id("membership"), inc: inc(2), kind: "membership" }, rules: id("rules"), destination: id("destination") };
  const link = { v: 1, service: "https://scopes.test", repository, invitation: 5, secret: "s".repeat(43), handle: "@una", definition: "platform:membership@2" };
  const text = (value: unknown) => `${LINK}${b64url(utf8(JSON.stringify(value)))}`;
  const cases = [text(link), text({ ...link, definition: undefined }), text({ ...link, v: 2 }), text({ ...link, invitation: 1.5 }), text({ ...link, secret: 7 }), `${LINK}not-base64!`, "https://not-a-link", text(null)];
  for (const c of cases) expect(invitationOf(c), c.slice(0, 40)).toEqual(linkOf(c));
  expect(wellFormedInvitation(invitationOf(text(link))!)).toBe(true);
  expect(wellFormedInvitation(invitationOf(text({ ...link, repository: { ...repository, membership: { ...repository.membership, kind: "lane" } } }))!)).toBe(false);
  expect(wellFormedInvitation(invitationOf(text({ ...link, invitation: 0 }))!)).toBe(false);
});
