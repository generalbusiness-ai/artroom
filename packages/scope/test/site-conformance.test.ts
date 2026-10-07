import { expect, test } from "vitest";
import examples from "./site/gfm-spec.json";
import { EXTENSIONS, renderMarkdown, type Extension } from "../src/site/markdown.ts";

// The GitHub Flavored Markdown specification's examples (test/site/gfm-spec.json, under CC BY-SA 4.0: test/site/LICENSE).
// Each example runs with the extensions that the specification's own runner, cmark-gfm's test/spec_tests.py, turns on for it:
// the extension it is tagged with, else none. The two task list examples are tagged `disabled`, which that runner skips; here they
// run with `tasklist`. Raw HTML passes through (`safe: false`) and headings get no id, as the examples expect.
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
test("GFM specification conformance: every example, as the specification's runner configures it, renders the stated HTML; the pass count by section is reported", () => {
  expect((examples as Example[]).length).toBe(BAR);
  const rows = bySection((example) => renderMarkdown(example.markdown, { safe: false, headingIds: false, extensions: extensionsOf(example) }).html === example.html);
  const passed = rows.reduce((n, r) => n + r.passed, 0);
  console.info(`GFM conformance, as the specification's runner configures each example: ${passed}/${BAR}\n${table(rows)}`);
  expect(rows.filter((r) => r.passed < r.total).map((r) => r.section)).toEqual([]);
  expect(passed).toBe(BAR);
});

// Not a bar: what the route serves differs from the examples by design. Every extension is on, as GitHub renders, so a
// tag filter and extended autolinks change ten core examples; and raw HTML is escaped, and javascript: addresses emptied.
test("as served (every extension on, raw HTML escaped), the examples that differ are reported, and each one holds raw HTML, an autolink or a tag the filter names", () => {
  const all = bySection((example) => renderMarkdown(example.markdown, { safe: false, headingIds: false, extensions: EXTENSIONS }).html === example.html);
  const served = bySection((example) => renderMarkdown(example.markdown, { headingIds: false }).html === example.html);
  const count = (rows: ReturnType<typeof bySection>) => rows.reduce((n, r) => n + r.passed, 0);
  console.info(`GFM examples, every extension on, raw HTML passed: ${count(all)}/${BAR}\n${table(all.filter((r) => r.failed.length))}`);
  console.info(`GFM examples as served (every extension on, raw HTML escaped): ${count(served)}/${BAR}\n${table(served.filter((r) => r.failed.length))}`);
  // Each served difference is an example whose source has something that could be raw HTML (`<`), or an address with a scheme.
  const failed = served.flatMap((r) => r.failed).map((n) => (examples as Example[])[n - 1]!);
  expect(failed.filter((e) => !e.markdown.includes("<") && !/[a-z]+:|www\.|@/.test(e.markdown)).map((e) => e.example)).toEqual([]);
});
