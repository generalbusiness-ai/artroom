import { expect, test } from "vitest";
import examples from "./site/gfm-spec.json";
import { EXTENSIONS, renderMarkdown, type Extension } from "../src/site/markdown.ts";
import { resolveAddress } from "../src/site/route.ts";

// The GitHub Flavored Markdown specification's examples (test/site/gfm-spec.json, under CC BY-SA 4.0: test/site/LICENSE).
// Reference-fixture configuration: the extension each example is tagged with, else none. The two task list examples are tagged
// `disabled` but are run locally with `tasklist`. This is not a claim of running the upstream runner or comparing upstream bytes.
// Raw HTML passes through (`safe: false`), headings get no id, and addresses are not rewritten, as these fixtures expect.
//
// The bar: every example, 672 of 672.

interface Example { example: number; section: string; extension: string | null; markdown: string; html: string }
const BAR = 672;

const extensionsOf = (example: Example): ReadonlySet<Extension> =>
  new Set<Extension>(example.extension === null ? [] : example.extension === "disabled" ? ["tasklist"] : [example.extension as Extension]);

/** Pass counts by section, in the specification's order. */
function bySection(passes: (example: Example) => boolean): { section: string; passed: number; total: number; failed: number[] }[] {
  const sections = new Map<string, { section: string; passed: number; total: number; failed: number[] }>();
  for (const example of examples as Example[]) {
    const row = sections.get(example.section) ?? { section: example.section, passed: 0, total: 0, failed: [] };
    sections.set(example.section, row);
    row.total++;
    if (passes(example)) row.passed++;
    else row.failed.push(example.example);
  }
  return [...sections.values()];
}

const table = (rows: ReturnType<typeof bySection>): string => rows.map((r) => `${r.section}: ${r.passed}/${r.total}${r.failed.length ? ` (fails ${r.failed.join(", ")})` : ""}`).join("\n");

// Invariant: the converter renders each example of the GFM specification as the specification states.
test("GFM reference fixtures: all 672 render the stated HTML with tagged extensions, the two disabled task examples enabled, raw HTML passed and heading ids disabled", () => {
  expect((examples as Example[]).length).toBe(BAR);
  const rows = bySection((example) => renderMarkdown(example.markdown, { safe: false, headingIds: false, extensions: extensionsOf(example) }).html === example.html);
  const passed = rows.reduce((n, r) => n + r.passed, 0);
  console.info(`GFM reference fixtures, tagged extensions with task-list exceptions, raw HTML passed, no heading ids or URL rewrites: ${passed}/${BAR}\n${table(rows)}`);
  expect(rows.filter((r) => r.passed < r.total).map((r) => r.section)).toEqual([]);
  expect(passed).toBe(BAR);
  diagnosticComparisons();
});

// Diagnostic counts only: these configurations deliberately omit the route's heading ids and URL resolver. They are not a
// served-profile oracle. The actual safe profile is checked against exact selected outputs below.
function diagnosticComparisons(): void {
  const all = bySection((example) => renderMarkdown(example.markdown, { safe: false, headingIds: false, extensions: EXTENSIONS }).html === example.html);
  const safe = bySection((example) => renderMarkdown(example.markdown, { headingIds: false }).html === example.html);
  const count = (rows: ReturnType<typeof bySection>) => rows.reduce((n, r) => n + r.passed, 0);
  console.info(`GFM examples, every extension on, raw HTML passed: ${count(all)}/${BAR}\n${table(all.filter((r) => r.failed.length))}`);
  console.info(`GFM diagnostic safe-HTML comparison, every extension on, no heading ids or URL rewrites: ${count(safe)}/${BAR}\n${table(safe.filter((r) => r.failed.length))}`);
}

// Invariant: the route's selected safe rendering behavior has exact output, including heading-id collisions, URL rewriting,
// raw HTML escaping and extensions together. This is a renderer-boundary witness, not a full served-profile corpus claim.
test("the safe page profile renders selected headings, relative URLs, raw HTML and extensions exactly", () => {
  const prefix = `/site/sc_${"a".repeat(52)}/HEAD/`;
  const markdown = '# Guide\n\n## Setup\n\n## Setup\n\nRead [home](../README.md), [top](/README.md), [anchor](#setup), [outside](https://example.com/x), ![diagram](images/diagram.png).\n\n<b onclick="alert(1)">inline</b>.\n\n<script>alert(1)</script>\n\n~~old~~ and www.example.com\n\n- [x] done\n';
  expect(renderMarkdown(markdown, { safe: true, resolve: (destination) => resolveAddress(prefix, "docs/guide.md", destination) })).toEqual({
    title: "Guide",
    html: '<h1 id="guide">Guide</h1>\n<h2 id="setup">Setup</h2>\n<h2 id="setup-1">Setup</h2>\n'
      + `<p>Read <a href="${prefix}README.md">home</a>, <a href="${prefix}README.md">top</a>, <a href="#setup">anchor</a>, <a href="https://example.com/x">outside</a>, <img src="${prefix}docs/images/diagram.png" alt="diagram" />.</p>\n`
      + '<p>&lt;b onclick=&quot;alert(1)&quot;&gt;inline&lt;/b&gt;.</p>\n'
      + '<pre class="raw-html">&lt;script&gt;alert(1)&lt;/script&gt;</pre>\n'
      + '<p><del>old</del> and <a href="http://www.example.com">www.example.com</a></p>\n'
      + '<ul>\n<li><input checked="" disabled="" type="checkbox"> done</li>\n</ul>\n',
  });
});

// The reference corpus contains no literal javascript:, vbscript:, file: or data: destination. Keep the selected scheme
// behavior explicit: unsafe links and an SVG data image are emptied; a PNG data image remains allowed.
test("the safe page profile empties selected unsafe addresses and preserves an allowed PNG data image exactly", () => {
  const prefix = `/site/sc_${"a".repeat(52)}/HEAD/`;
  const markdown = '[js](javascript:alert(1)) [vb](vbscript:msgbox(1)) [file](file:///tmp/x) [data](data:text/html,hi) ![bad](data:image/svg+xml;base64,AAAA) ![png](data:image/png;base64,AAAA)\n';
  expect(renderMarkdown(markdown, { safe: true, resolve: (destination) => resolveAddress(prefix, "docs/guide.md", destination) })).toEqual({
    title: null,
    html: '<p><a href="">js</a> <a href="">vb</a> <a href="">file</a> <a href="">data</a> <img src="" alt="bad" /> <img src="data:image/png;base64,AAAA" alt="png" /></p>\n',
  });
});
