/**
 * The document tree as HTML, in the form of the specification's examples:
 * one block per line, `<hr />` and `<br />`, a fenced block's first info
 * word as the class `language-<word>`, and a table's alignment as `align`.
 *
 * With `safe` (the default), raw HTML is shown as text, never passed
 * through, and a link or image to a `javascript:`, `vbscript:`, `file:` or
 * `data:` address (other than a `data:` image) has an empty address.
 * Without it, raw HTML passes through with GFM's tag filter, as the
 * specification's examples expect; the conformance test renders so.
 */
import { EXTENSIONS, Node, escapeHtml, type Extension } from "./node.ts";

export interface RenderOptions {
  /** Raw HTML escaped and unsafe addresses emptied. Default true. */
  safe?: boolean;
  /** Each heading gets the id that GitHub gives it. Default true. */
  headingIds?: boolean;
  /** The address to write for a link's or an image's destination. Default: as written. */
  resolve?: (destination: string, image: boolean) => string;
  /** GFM's extensions. Default all five. Of them only `tagfilter` is the renderer's. */
  extensions?: ReadonlySet<Extension>;
}

const UNSAFE_PROTOCOL = /^(?:javascript|vbscript|file|data):/i;
const SAFE_DATA = /^data:image\/(?:png|gif|jpeg|webp)/i;
/** GFM's tag filter: these tags are made inert when raw HTML passes through. */
const FILTERED = /<(?=\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:[\s/>]|$))/gi;

/** The plain text of a node: its text and code, a line break as a space. */
export function plainText(node: Node): string {
  let out = "";
  for (const inner of node.walk()) {
    if (inner.type === "text" || inner.type === "code") out += inner.literal;
    else if (inner.type === "softbreak" || inner.type === "linebreak") out += " ";
  }
  return out;
}

/** GitHub's heading anchor: lower case, every character but letters, marks, digits, `_`, `-` and space removed, each space a hyphen. */
export function slugOf(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
}

export function renderHtml(doc: Node, options: RenderOptions = {}): string {
  const safe = options.safe ?? true;
  const ids = options.headingIds ?? true;
  const resolve = options.resolve ?? ((destination: string) => destination);
  const passed = (raw: string): string => ((options.extensions ?? EXTENSIONS).has("tagfilter") ? raw.replace(FILTERED, "&lt;") : raw);
  const seen = new Map<string, number>();
  let buffer = "";
  let last = "\n";
  let disableTags = 0;

  const lit = (s: string): void => {
    if (s === "") return;
    buffer += s;
    last = s[s.length - 1]!;
  };
  const cr = (): void => {
    if (last !== "\n") lit("\n");
  };
  const tag = (s: string): void => {
    if (disableTags === 0) lit(s);
  };
  const address = (destination: string, image: boolean): string => {
    const resolved = resolve(destination, image);
    return safe && UNSAFE_PROTOCOL.test(resolved) && !(image && SAFE_DATA.test(resolved)) ? "" : resolved;
  };
  const slug = (heading: Node): string => {
    // As github-slugger counts: a repeated anchor gets `-1`, `-2` and so on.
    const base = slugOf(plainText(heading));
    if (base === "") return "";
    let id = base;
    while (seen.has(id)) {
      const n = seen.get(base)! + 1;
      seen.set(base, n);
      id = `${base}-${n}`;
    }
    seen.set(id, 0);
    return id;
  };
  const checkbox = (paragraph: Node): void => {
    const item = paragraph.parent;
    if (item?.type === "item" && item.task !== null && item.firstChild === paragraph) tag(`<input${item.task ? ' checked=""' : ""} disabled="" type="checkbox">`);
  };
  const tight = (paragraph: Node): boolean => {
    const list = paragraph.parent?.parent;
    return list?.type === "list" && list.list!.tight;
  };

  const enter = (node: Node): void => {
    switch (node.type) {
      case "paragraph":
        if (!tight(node)) {
          cr();
          tag("<p>");
        }
        checkbox(node);
        return;
      case "heading": {
        const id = ids ? slug(node) : "";
        cr();
        tag(`<h${node.level}${id ? ` id="${escapeHtml(id)}"` : ""}>`);
        return;
      }
      case "code_block": {
        const word = node.info.split(/\s+/)[0] ?? "";
        cr();
        tag(`<pre><code${word ? ` class="language-${escapeHtml(word)}"` : ""}>`);
        lit(escapeHtml(node.literal));
        tag("</code></pre>");
        cr();
        return;
      }
      case "html_block":
        cr();
        lit(safe ? `<pre class="raw-html">${escapeHtml(node.literal)}</pre>` : passed(node.literal));
        cr();
        return;
      case "thematic_break":
        cr();
        tag("<hr />");
        cr();
        return;
      case "block_quote":
        cr();
        tag("<blockquote>");
        cr();
        return;
      case "list": {
        const data = node.list!;
        cr();
        tag(data.type === "bullet" ? "<ul>" : data.start !== 1 ? `<ol start="${data.start}">` : "<ol>");
        cr();
        return;
      }
      case "item":
        tag("<li>");
        return;
      case "table":
        cr();
        tag("<table>");
        cr();
        return;
      case "table_row":
        // The first row is the header; the second opens the body.
        if (node.prev === null) tag("<thead>");
        else if (node.prev.prev === null) tag("<tbody>");
        cr();
        tag("<tr>");
        cr();
        return;
      case "table_cell": {
        let column = 0;
        for (let cell = node.prev; cell; cell = cell.prev) column++;
        const align = node.parent!.parent!.aligns[column];
        tag(`<${node.header ? "th" : "td"}${align ? ` align="${align}"` : ""}>`);
        return;
      }
      case "text":
        lit(escapeHtml(node.literal));
        return;
      case "softbreak":
        lit("\n");
        return;
      case "linebreak":
        tag("<br />");
        cr();
        return;
      case "code":
        tag("<code>");
        lit(escapeHtml(node.literal));
        tag("</code>");
        return;
      case "emph":
        tag("<em>");
        return;
      case "strong":
        // As GitHub's renderer does: strong emphasis directly inside strong emphasis adds no tag.
        if (node.parent?.type !== "strong") tag("<strong>");
        return;
      case "del":
        tag("<del>");
        return;
      case "html_inline":
        lit(safe ? escapeHtml(node.literal) : passed(node.literal));
        return;
      case "link":
        tag(`<a href="${escapeHtml(address(node.destination, false))}"${node.title ? ` title="${escapeHtml(node.title)}"` : ""}>`);
        return;
      case "image":
        if (disableTags === 0) lit(`<img src="${escapeHtml(address(node.destination, true))}" alt="`);
        disableTags++;
        return;
      default:
        return;
    }
  };

  const leave = (node: Node): void => {
    switch (node.type) {
      case "paragraph":
        if (!tight(node)) {
          tag("</p>");
          cr();
        }
        return;
      case "heading":
        tag(`</h${node.level}>`);
        cr();
        return;
      case "block_quote":
        cr();
        tag("</blockquote>");
        cr();
        return;
      case "list":
        cr();
        tag(node.list!.type === "bullet" ? "</ul>" : "</ol>");
        cr();
        return;
      case "item":
        tag("</li>");
        cr();
        return;
      case "table":
        tag("</table>");
        cr();
        return;
      case "table_row":
        tag("</tr>");
        cr();
        if (node.prev === null) {
          tag("</thead>");
          cr();
        } else if (node.next === null) {
          tag("</tbody>");
          cr();
        }
        return;
      case "table_cell":
        tag(node.header ? "</th>" : "</td>");
        cr();
        return;
      case "emph":
        tag("</em>");
        return;
      case "strong":
        if (node.parent?.type !== "strong") tag("</strong>");
        return;
      case "del":
        tag("</del>");
        return;
      case "link":
        tag("</a>");
        return;
      case "image":
        disableTags--;
        if (disableTags === 0) lit(`"${node.title ? ` title="${escapeHtml(node.title)}"` : ""} />`);
        return;
      default:
        return;
    }
  };

  for (const [node, entering] of doc.events()) (entering ? enter : leave)(node);
  return buffer;
}
