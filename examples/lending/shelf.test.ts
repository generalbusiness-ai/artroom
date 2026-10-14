import { expect, test } from "vitest";
import { grantOf, keys } from "@generalbusiness/dap-derive/testing";
import { renderMarkdown, titleOf } from "../../packages/scope/src/site/markdown.ts";
import { make, submit, donation, over } from "./test-support.ts";
import { literal, shelfPage, shelfPath, thingsOf, type RecordPointer, type Thing } from "./shelf.ts";

const record: RecordPointer = { scope: "sc_example", incarnation: "in_example", seq: 7, hash: "sha256:" + "a".repeat(64) };
const pot: Thing = { id: 2, revision: 2, page: "shelf/0123456789abcdef.md", state: "lent", name: "Big pot", description: "A heavy copper pot. Holds eight litres.", donor: "@neighbour", borrower: "@nasruddin", reason: null, seq: 3 };

test("a shelf page is the design's page: a title, the description, and three generated lines", () => {
  expect(shelfPage({ ...pot, name: "Big pot", description: "Holds eight litres" }, record)).toBe([
    "# Big pot", "", "Holds eight litres", "",
    "- Status: lent to \\@nasruddin", "- Donated by: \\@neighbour",
    `- Record: lending scope sc_example, incarnation in_example`, "",
  ].join("\n"));
  expect(shelfPage({ ...pot, state: "available", borrower: null }, record)).toContain("- Status: available\n");
  expect(shelfPage({ ...pot, state: "gone", borrower: null, reason: "Nasruddin says the pot died" }, record)).toContain("- Status: gone: Nasruddin says the pot died\n");
  expect(shelfPath(new Uint8Array([1,2,3,4,5,6,7,8]))).toBe("shelf/0102030405060708.md");
  expect(() => shelfPath(new Uint8Array(7))).toThrow();
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

test("thingsOf reads every thing from the record, with the gone ones and their reasons", async () => {
  const s = make();
  const grants = { grants: [keys.rita, keys.una, keys.vic].map((who) => ({ grant: grantOf(who, s.at, ["lending.member", "lending.staff"]), current: true })) };
  const did = async (who: typeof keys.rita, kind: string, over = {}) => { expect((await submit(s, who, kind, over, grants)).result).toBe("write"); return s.last.seq; };
  const big = await did(keys.rita, "donate", donation(s,"Big pot","Copper."));
  await did(keys.una, "borrow", over(s, big));
  await did(keys.una, "return", over(s, big));
  const small = await did(keys.una, "donate", donation(s,"Small pot","Baby born when the big pot was with me"));
  await did(keys.una, "borrow", over(s, big));
  const cancelled = await did(keys.rita, "cancel", over(s, big, { reason: "Nasruddin says the pot died" }));
  const lent = await did(keys.vic, "borrow", over(s, small));
  // A refused act writes no entry and changes no thing.
  expect((await submit(s, keys.vic, "borrow", over(s, small), grants)).result).toBe("refused");
  const things = thingsOf(s.entries.map((sealed) => sealed.entry));
  expect(things).toEqual([
    { id: big, revision: 5, page: String(s.item(big).values["page"]), state: "gone", name: "Big pot", description: "Copper.", donor: "@rita", borrower: null, reason: "Nasruddin says the pot died", seq: cancelled },
    { id: small, revision: 2, page: String(s.item(small).values["page"]), state: "lent", name: "Small pot", description: "Baby born when the big pot was with me", donor: "@una", borrower: "@vic", reason: null, seq: lent },
  ]);
  // It agrees with the fold for every live thing.
  for (const live of s.state.page("thing", ["available", "lent"], null, 64).items) {
    const read = things.find((thing) => thing.id === live.id)!;
    expect([read.state, read.name, read.borrower]).toEqual([live.state, live.values["name"], (live.parties["borrower"] as { member: string } | null)?.member ?? null]);
  }
});

// The longest bounded user values remain below the signed publication content limit after escaping.
test("maximum escaped name, description and reason fit 4096 UTF-8 bytes without a future entry claim", () => {
 const page = shelfPage({ ...pot, state:"gone", name:"!".repeat(80), description:"!".repeat(1000), reason:"!".repeat(280), donor:"@"+"d".repeat(63), borrower:null }, {scope:"sc_"+"a".repeat(52),incarnation:"in_"+"b".repeat(26)});
 expect(new TextEncoder().encode(page).length).toBeLessThanOrEqual(4096);
 expect(page).not.toContain("entry "); expect(page).not.toContain("hash ");
});
