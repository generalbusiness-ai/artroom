// One built-output invariant: approved pages retain exact copy, routes, brand/style and shareable previews.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHome } from "../build.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HOME = "https://dap.generalbusiness.ai/", DOCS = "https://github.com/generalbusiness-ai/dap/blob/main/docs/README.md", GITHUB = "https://github.com/generalbusiness-ai/dap";
const PREVIEW_IMAGE = "https://dap.generalbusiness.ai/brand/dap-card-1200x630.png";
const words = html => html.replace(/<br\s*\/?\s*>/g, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const anchors = html => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({ attributes: Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(part => [part[1], part[2]])), content: match[2] }));
const expected = {
  "index.html": { title: "dap", description: "Durable action platform for people and agents.", url: "https://dap.generalbusiness.ai/", copy: "Durable action platform for people and agents. Room Shared work, governed by your rules. → Library Demo: kitchenware and tools, shared by members → Counter Demo: agents take turns counting aloud → Jam Demo: music improvisation → Documentation Build your own applications and learn to self-host. →", targets: [HOME, GITHUB, DOCS, "/room/", "/library/", "/counter/", "/jam/", "https://github.com/generalbusiness-ai/dap/blob/main/docs/self-host.md"] },
  "room/index.html": { title: "dap - room", description: "Raise issues, propose changes and publish when the room’s rules are met.", url: "https://dap.generalbusiness.ai/room/", copy: "A room for shared work. Raise issues, propose changes and publish when the room’s rules are met. Open room Raise an issue Propose a change Publish under the rules The room records who did what, and why.", targets: [HOME, GITHUB, DOCS, "https://artroom-scope.inguz.workers.dev/page/"] },
  "library/index.html": { title: "dap - library", description: "Donate kitchenware and tools. Borrow what is available, return what is lent, and keep the story in the record.", url: "https://dap.generalbusiness.ai/library/", copy: "A lending library. Donate kitchenware and tools. Borrow what is available, return what is lent, and keep the story in the record. Open library Donate a thing Borrow and return Keep its story Member interface : join with the invitation link the library’s staff gave you, then donate, borrow and return. Published shelf : public pages show each thing and its story. Public history : a published copy of the library’s story. Member journal: in the member interface, after you join. It is the authority for acts that took effect and who signed them. The published history is a copy. Membership is by invitation. Shelf pages and public history are public. The journal is for members. Only staff can cancel a thing.", targets: [HOME, GITHUB, DOCS, "https://dap-library-publication-final-1014.inguz.workers.dev/lending/", "https://dap-library-publication-final-1014.inguz.workers.dev/lending/", "https://dap-library-publication-final-1014.inguz.workers.dev/site/sc_jfdinhhufm5jfjqr4cqsgk5kvw2lhyxx5lh4gaqgp74ldijemsla/main/shelf/", "https://dap-library-publication-final-1014.inguz.workers.dev/site/sc_jfdinhhufm5jfjqr4cqsgk5kvw2lhyxx5lh4gaqgp74ldijemsla/main/history.md"] },
  "counter/index.html": { title: "dap - counter", description: "Three agents take turns counting aloud, with each completed turn added to the record.", url: "https://dap.generalbusiness.ai/counter/", copy: "Agents that count. Three agents take turns counting aloud, with each completed turn added to the record. Open counter A Ada → B Beau → C Cleo One turn at a time. Choose an identity and join. The turns follow automatically.", targets: [HOME, GITHUB, DOCS, "https://artroom-counting.inguz.workers.dev/counting/"] },
  "jam/index.html": { title: "dap - jam", description: "Explore a procedural music demo.", url: "https://dap.generalbusiness.ai/jam/", copy: "A little music. Explore a procedural music demo. Open jam Synth Percussion Lead Sound starts when you press Play.", targets: [HOME, GITHUB, DOCS, "https://artroom-jam.inguz.workers.dev/"] },
};
test("five built homepages preserve approved copy, links, child headers, shared style and link previews", async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), "dap-home-test-"));
  try {
    const built = await buildHome(resolve(temporary, "assets")), pages = {};
    for (const [file, wanted] of Object.entries(expected)) {
      const html = await readFile(resolve(built, file), "utf8"); pages[file] = html;
      assert.equal(html.match(/<title>(.*?)<\/title>/)?.[1], wanted.title);
      const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1]; assert.ok(head);
      const tags = [...head.matchAll(/<meta\b([^>]*)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(part => [part[1], part[2]])));
      const meta = (attribute, name) => {
        const matches = tags.filter(tag => tag[attribute] === name);
        assert.equal(matches.length, 1, `${file} has exactly one ${name}`);
        return matches[0].content;
      };
      assert.equal(meta("name", "description"), wanted.description);
      for (const [name, value] of Object.entries({ "og:title": wanted.title, "og:description": wanted.description, "og:url": wanted.url, "og:type": "website", "og:site_name": "dap", "og:image": PREVIEW_IMAGE, "og:image:width": "1200", "og:image:height": "630", "og:image:alt": "dap wordmark with the tagline Durable action platform for people and agents." })) assert.equal(meta("property", name), value, `${file} ${name}`);
      assert.equal(meta("name", "twitter:card"), "summary_large_image");
      assert.equal(words(html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ""), wanted.copy);
      assert.ok(!/<script\b|preview\.js|sketch-note/.test(html), "preview helpers and notes are removed");
      const links = anchors(html); assert.deepEqual(links.map(link => link.attributes.href), wanted.targets);
      const logos = links.filter(link => link.attributes.class === "brand-link"); assert.equal(logos.length, 1);
      assert.deepEqual([logos[0].attributes.href, logos[0].attributes["aria-label"]], [HOME, "dap homepage"]);
      assert.match(logos[0].content, /<img src="\/brand\/dap\.svg"/);
      if (file !== "index.html") {
        const header = html.match(/<header class="utility page">([\s\S]*?)<\/header>/)?.[1]; assert.ok(header);
        assert.deepEqual(anchors(header).map(link => link.attributes.href), [HOME, GITHUB, DOCS]); assert.ok(!/<nav\b|role="tab|class=".*tabs/.test(header), "children share the utility header without navigation tabs");
      }
    }
    const utility = pages["index.html"].match(/<div class="utility">([\s\S]*?)<\/div>/)?.[1]; assert.ok(utility);
    assert.match(utility, /^<a class="brand-link" data-home /, "the homepage wordmark is the utility row’s first child");
    for (const file of ["room/index.html", "library/index.html", "counter/index.html", "jam/index.html"]) assert.equal(pages[file].match(/<header class="utility page">([\s\S]*?)<\/header>/)?.[1], file === "jam/index.html" ? utility.replace('width="432"', 'width="440"') : utility, "all five pages share header links and labels; Jam retains its deferred intrinsic width");
    const rows = anchors(pages["index.html"]).filter(link => link.attributes.class === "destination");
    assert.deepEqual(rows.map(row => row.content.match(/<h2>(.*?)<\/h2>/)?.[1]), ["Room", "Library", "Counter", "Jam", "Documentation"]);
    const icons = anchors(pages["index.html"]).filter(link => link.attributes.class === "icon-link");
    assert.deepEqual(icons.map(icon => [icon.attributes["aria-label"], icon.attributes.href]), [["GitHub repository", GITHUB], ["Documentation", DOCS]]);
    const support = html => html.match(/<p class="([^"]+)">(?:The room records who did what, and why\.|Sound starts when you press Play\.)<\/p>/)?.[1];
    assert.deepEqual([support(pages["room/index.html"]), support(pages["jam/index.html"])], ["support", "support"]);
    assert.equal(await readFile(resolve(built, "_headers"), "utf8"), "/*\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n", "the built serving metadata preserves cache policy and forbids HTML transforms");
    const css = await readFile(resolve(built, "style.css"), "utf8");
    assert.match(css, /\.support\{[^}]*font-family:OpenRunde,system-ui,sans-serif;[^}]*font-size:20px;[^}]*font-weight:400;[^}]*line-height:1\.5/);
    for (const [master, asset] of [["dap-wordmark-green.svg", "dap.svg"], ["dist/favicon.svg", "favicon.svg"], ["dist/favicon.ico", "favicon.ico"], ["dist/dap-card-1200x630.png", "dap-card-1200x630.png"], ...["Regular", "Semibold", "Bold"].map(weight => [`fonts/OpenRunde-${weight}.woff2`, `fonts/OpenRunde-${weight}.woff2`])]) assert.deepEqual(await readFile(resolve(built, "brand", asset)), await readFile(resolve(root, "brand", master)));
    const card = await readFile(resolve(built, new URL(PREVIEW_IMAGE).pathname.slice(1)));
    assert.ok(card.length >= 24 && card.length < 300_000, "the emitted preview is a PNG under 300 KB");
    assert.deepEqual(card.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(card.readUInt32BE(8), 13);
    assert.equal(card.toString("ascii", 12, 16), "IHDR");
    assert.deepEqual([card.readUInt32BE(16), card.readUInt32BE(20)], [1200, 630]);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
