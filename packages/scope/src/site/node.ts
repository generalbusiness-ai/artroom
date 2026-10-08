/**
 * The document tree of the markdown converter, and the character rules that
 * the block parser, the inline parser and the renderer share. The tree is a
 * linked list of children, as the inline parser's delimiter algorithm
 * needs: it moves runs of siblings into a new parent.
 *
 * The rules are those of the GitHub Flavored Markdown specification,
 * version 0.29-gfm (packages/scope/test/site/), which the conformance test
 * runs.
 */
import { namedEntity } from "./entities.ts";

export type NodeType =
  | "document" | "block_quote" | "list" | "item" | "paragraph" | "heading" | "thematic_break" | "code_block" | "html_block"
  | "table" | "table_row" | "table_cell"
  | "text" | "softbreak" | "linebreak" | "code" | "emph" | "strong" | "del" | "link" | "image" | "html_inline";

export interface ListData {
  type: "bullet" | "ordered";
  tight: boolean;
  bulletChar: string;
  start: number;
  delimiter: string;
  padding: number;
  markerOffset: number;
}

export type Align = "left" | "center" | "right" | null;

/** GFM's extensions to CommonMark, by the names its specification tags its examples with. */
export type Extension = "table" | "tasklist" | "strikethrough" | "autolink" | "tagfilter";
export const EXTENSIONS: ReadonlySet<Extension> = new Set(["table", "tasklist", "strikethrough", "autolink", "tagfilter"]);

export class Node {
  parent: Node | null = null;
  firstChild: Node | null = null;
  lastChild: Node | null = null;
  prev: Node | null = null;
  next: Node | null = null;
  /** Block state while the document is parsed. */
  open = true;
  lastLineBlank = false;
  lastLineChecked = false;
  startLine = 0;
  content = "";
  /** The text of a leaf: a code block, an HTML block or inline, a code span, a text run. */
  literal = "";
  info = "";
  fenced = false;
  fenceChar = "";
  fenceLength = 0;
  fenceOffset = 0;
  level = 0;
  htmlBlockType = 0;
  list: ListData | null = null;
  /** A task list item: whether its box is checked, or null for an item that is no task. */
  task: boolean | null = null;
  destination = "";
  title = "";
  /** A table's alignments, one for each column; a table's lines while it is open. */
  aligns: Align[] = [];
  rows: string[] = [];
  /** A header cell (`th`) rather than a body cell. */
  header = false;

  readonly type: NodeType;

  constructor(type: NodeType, literal = "") {
    this.type = type;
    this.literal = literal;
  }

  appendChild(child: Node): void {
    child.unlink();
    child.parent = this;
    if (this.lastChild) {
      this.lastChild.next = child;
      child.prev = this.lastChild;
      this.lastChild = child;
    } else {
      this.firstChild = this.lastChild = child;
    }
  }

  insertAfter(sibling: Node): void {
    sibling.unlink();
    sibling.next = this.next;
    if (sibling.next) sibling.next.prev = sibling;
    sibling.prev = this;
    this.next = sibling;
    sibling.parent = this.parent;
    if (sibling.parent && !sibling.next) sibling.parent.lastChild = sibling;
  }

  insertBefore(sibling: Node): void {
    sibling.unlink();
    sibling.prev = this.prev;
    if (sibling.prev) sibling.prev.next = sibling;
    sibling.next = this;
    this.prev = sibling;
    sibling.parent = this.parent;
    if (sibling.parent && !sibling.prev) sibling.parent.firstChild = sibling;
  }

  unlink(): void {
    if (this.prev) this.prev.next = this.next;
    else if (this.parent) this.parent.firstChild = this.next;
    if (this.next) this.next.prev = this.prev;
    else if (this.parent) this.parent.lastChild = this.prev;
    this.parent = this.next = this.prev = null;
  }

  /** Every node of the tree under this one, in document order, this one first. Children are read as the walk reaches them. */
  *walk(): Generator<Node> {
    for (const [node, entering] of this.events()) if (entering) yield node;
  }

  /**
   * The tree under this one as events: a container is entered and later
   * left, a leaf is entered once. Iterative, so a deep tree costs no stack.
   */
  *events(): Generator<readonly [Node, boolean]> {
    let node: Node | null = this;
    let entering = true;
    while (node) {
      yield [node, entering] as const;
      if (entering && node.firstChild) {
        node = node.firstChild;
        continue;
      }
      if (entering && !LEAVES.has(node.type)) {
        entering = false;
        continue;
      }
      if (node === this) break;
      if (node.next) {
        node = node.next;
        entering = true;
      } else {
        node = node.parent;
        entering = false;
      }
    }
  }
}

/** The nodes that hold no children. */
const LEAVES: ReadonlySet<NodeType> = new Set(["thematic_break", "code_block", "html_block", "text", "softbreak", "linebreak", "code", "html_inline"]);

/** The characters that a backslash escapes: ASCII punctuation. */
export const ESCAPABLE = "[!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]";
const ENTITY = "&(?:#[xX][a-fA-F0-9]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});";
const ESCAPE_OR_ENTITY = new RegExp(`\\\\${ESCAPABLE}|${ENTITY}`, "g");
export const ENTITY_HERE = new RegExp(ENTITY, "y");

/** The text of one entity or numeric reference, or the reference itself when it names nothing. */
export function decodeEntity(reference: string): string {
  if (reference[1] === "#") {
    const hex = reference[2] === "x" || reference[2] === "X";
    const code = parseInt(reference.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    // Code point 0, a surrogate or one past Unicode's range is the replacement character.
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "�" : String.fromCodePoint(code);
  }
  return namedEntity(reference.slice(1, -1)) ?? reference;
}

/** Backslash escapes and entity references replaced by what they stand for. */
export function unescapeString(text: string): string {
  return text.includes("\\") || text.includes("&") ? text.replace(ESCAPE_OR_ENTITY, (found) => (found[0] === "\\" ? found[1]! : decodeEntity(found))) : text;
}

/** A link label's key: its inner text with whitespace collapsed, case folded. */
export function normalizeLabel(label: string): string {
  return label.slice(1, -1).trim().replace(/[ \t\r\n]+/g, " ").toLowerCase().toUpperCase();
}

const URI_SAFE = /[A-Za-z0-9;/?:@&=+$,\-_.!~*'()#]/;
/** A URL as written, percent-encoded where it is not already: a `%` with two hex digits is kept. */
export function normalizeURI(uri: string): string {
  let out = "";
  for (let i = 0; i < uri.length; i++) {
    const c = uri[i]!;
    const code = uri.charCodeAt(i);
    if (c === "%" && /^[0-9a-fA-F]{2}$/.test(uri.slice(i + 1, i + 3))) {
      out += uri.slice(i, i + 3);
      i += 2;
    } else if (code < 0x80) {
      out += URI_SAFE.test(c) ? c : `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < uri.length && uri.charCodeAt(i + 1) >= 0xdc00 && uri.charCodeAt(i + 1) <= 0xdfff) {
      out += encodeURIComponent(uri.slice(i, i + 2));
      i++;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      out += "%EF%BF%BD";
    } else {
      out += encodeURIComponent(c);
    }
  }
  return out;
}

/** Text as HTML: `&`, `<`, `>` and `"` escaped. */
export function escapeHtml(text: string): string {
  return /[&<>"]/.test(text) ? text.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;")) : text;
}

export const isSpaceOrTab = (c: string | undefined): boolean => c === " " || c === "\t";
