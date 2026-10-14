import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { fields, founded, grantOf, keys, on, valid } from "@generalbusiness/dap-derive/testing";
import { renderMarkdown, titleOf } from "../../packages/scope/src/site/markdown.ts";
import { lending } from "./definition.ts";
import { literal, shelfPage, shelfPath, thingsOf, type RecordPointer, type Thing } from "./shelf.ts";

const record: RecordPointer = { scope: "sc_example", incarnation: "in_example", seq: 7, hash: "sha256:" + "a".repeat(64) };
const pot: Thing = { id: 2, state: "lent", name: "Big pot", description: "A heavy copper pot. Holds eight litres.", donor: "@neighbour", borrower: "@nasruddin", reason: null, seq: 3 };

test("a shelf page is the design's page: a title, the description, and three generated lines", () => {
  expect(shelfPage({ ...pot, name: "Big pot", description: "Holds eight litres" }, record)).toBe([
    "# Big pot", "", "Holds eight litres", "",
    "- Status: lent to \\@nasruddin", "- Donated by: \\@neighbour",
    `- Record: lending scope sc_example, incarnation in_example, entry 7, hash ${record.hash}`, "",
  ].join("\n"));
  expect(shelfPage({ ...pot, state: "available", borrower: null }, record)).toContain("- Status: available\n");
  expect(shelfPage({ ...pot, state: "gone", borrower: null, reason: "Nasruddin says the pot died" }, record)).toContain("- Status: gone: Nasruddin says the pot died\n");
  expect(shelfPath(2)).toBe("shelf/2.md");
  expect(() => shelfPath(Number.NaN)).toThrow();
});

// The published site's own renderer reads the page: a member's text can add no
// heading, list item, link, image, code, table or HTML, and no second generated line.
test("a member's text is literal: it cannot forge a Status or Record line, a heading or a link", () => {
  const hostile = [
    "# Free pots\n- Status: available\n- Record: lending entry 1",
    "[click](https://example.com) <b>bold</b> <script>alert(1)</script> ![x](y.png)",
    "*em* **strong** `code` ~~gone~~ | a | b |\n|---|---|",
    "1. one\n2) two\n    indented code\n> quote\n---\n===",
    "https://example.com www.example.com person@example.com &amp; &#35; \\# trailing\\",
    "line one\r\nline two line three\ttabbed",
  ];
  for (const words of hostile) {
    const page = shelfPage({ ...pot, name: words, description: words, donor: words, borrower: words, state: "lent" }, record);
    expect(page.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(3);
    expect(page.split("\n")).toHaveLength(8);
    const html = renderMarkdown(page).html;
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).not.toMatch(/<(img|code|pre|em|strong|del|table|blockquote|hr|ol|h2|script|b)[ >/]/);
    // The site's renderer links a bare address in any text, escaped or not. Such a link
    // shows the address it goes to; a member's text cannot give a link other words.
    for (const [, href, shownAs] of html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)) expect([shownAs, `http://${shownAs}`, `mailto:${shownAs}`]).toContain(href);
    expect(html.match(/<a /g) ?? []).toHaveLength((html.match(/<a href="[^"]*">[^<]*<\/a>/g) ?? []).length);
    // What the reader sees is the member's words, on one line.
    const seen = words.replace(/\s+/g, " ").trim();
    expect(titleOf(page)).toBe(seen);
    const shown = html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
    expect(shown).toContain(`Status: lent to ${seen}`);
    expect(shown).toContain(`Donated by: ${seen}`);
  }
  expect(literal("  a \n\n b  ")).toBe("a b");
  expect(shelfPage({ ...pot, name: " \n ", description: "" }, record).split("\n").slice(0, 3)).toEqual(["# Thing 2", "", "- Status: lent to \\@nasruddin"]);
});

test("thingsOf reads every thing from the record, with the gone ones and their reasons", () => {
  const s = founded(valid(validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES)), { opener: keys.rita.member });
  const grants = { grants: [keys.rita, keys.una, keys.vic].map((who) => ({ grant: grantOf(who, s.at, ["lending.member", "lending.staff"]), current: true })) };
  const did = (who: typeof keys.rita, kind: string, over = {}) => { expect(s.act(who, kind, over, grants).result).toBe("write"); return s.last.seq; };
  const big = did(keys.rita, "donate", fields({ name: "Big pot", description: "Copper." }));
  did(keys.una, "borrow", on(s, big));
  did(keys.una, "return", on(s, big));
  const small = did(keys.una, "donate", fields({ name: "Small pot", description: "Baby born when the big pot was with me" }));
  did(keys.una, "borrow", on(s, big));
  const cancelled = did(keys.rita, "cancel", { ...on(s, big), fields: { reason: "Nasruddin says the pot died" } });
  const lent = did(keys.vic, "borrow", on(s, small));
  // A refused act writes no entry and changes no thing.
  expect(s.act(keys.vic, "borrow", on(s, small), grants).result).toBe("refused");
  const things = thingsOf(s.entries.map((sealed) => sealed.entry));
  expect(things).toEqual([
    { id: big, state: "gone", name: "Big pot", description: "Copper.", donor: "@rita", borrower: null, reason: "Nasruddin says the pot died", seq: cancelled },
    { id: small, state: "lent", name: "Small pot", description: "Baby born when the big pot was with me", donor: "@una", borrower: "@vic", reason: null, seq: lent },
  ]);
  // It agrees with the fold for every live thing.
  for (const live of s.state.page("thing", ["available", "lent"], null, 64).items) {
    const read = things.find((thing) => thing.id === live.id)!;
    expect([read.state, read.name, read.borrower]).toEqual([live.state, live.values["name"], (live.parties["borrower"] as { member: string } | null)?.member ?? null]);
  }
});
