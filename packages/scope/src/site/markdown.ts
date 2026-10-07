/**
 * Markdown to HTML, by GitHub Flavored Markdown (specification version
 * 0.29-gfm): CommonMark with GFM's tables, task list items,
 * strikethrough and extended autolinks. No wiki-style links, no
 * footnotes. By default raw HTML is shown as text (`html.ts`).
 */
import { BlockParser } from "./blocks.ts";
import { plainText, renderHtml, type RenderOptions } from "./html.ts";

export type { RenderOptions } from "./html.ts";
export { EXTENSIONS, type Extension } from "./node.ts";

export interface Rendered {
  html: string;
  /** The plain text of the first heading of the highest level, or null when the page has none. */
  title: string | null;
}

export function renderMarkdown(source: string, options: RenderOptions = {}): Rendered {
  const doc = new BlockParser(options.extensions).parse(source);
  let title: string | null = null;
  let level = 7;
  for (const node of doc.walk()) {
    if (node.type === "heading" && node.level < level) {
      level = node.level;
      title = plainText(node).trim();
    }
  }
  return { html: renderHtml(doc, options), title: title === "" ? null : title };
}
