/**
 * The block parser: lines into block quotes, lists and their items,
 * headings, thematic breaks, code blocks, HTML blocks, paragraphs, link
 * reference definitions and GFM's tables, by the parsing strategy of the
 * GitHub Flavored Markdown specification's appendix ("A parsing
 * strategy"): each line first continues the open blocks it can, then may
 * start new ones, and what remains is text for the innermost open block.
 * Inline content is parsed when the document is closed.
 */
import { extendedAutolinks, mergeTexts } from "./autolinks.ts";
import { CLOSETAG, InlineParser, OPENTAG, type References } from "./inlines.ts";
import { EXTENSIONS, Node, isSpaceOrTab, unescapeString, type Align, type Extension, type ListData, type NodeType } from "./node.ts";

const CODE_INDENT = 4;
const MAYBE_SPECIAL = /^[#`~*+_=<>0-9|:-]/;
const NONSPACE = /[^ \t\f\v\r\n]/;
const ATX_HEADING = /^#{1,6}(?:[ \t]+|$)/;
const CODE_FENCE = /^`{3,}(?!.*`)|^~{3,}/;
const CLOSING_CODE_FENCE = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
const SETEXT_HEADING = /^(?:=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
const BULLET_MARKER = /^[*+-]/;
const ORDERED_MARKER = /^(\d{1,9})([.)])/;
const LINE_ENDING = /\r\n|\n|\r/;
const HTML_BLOCK_OPEN = [
  /./, // no type 0
  /^<(?:script|pre|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
  new RegExp(`^(?:${OPENTAG}|${CLOSETAG})\\s*$`, "i"),
];
const HTML_BLOCK_CLOSE = [/./, /<\/(?:script|pre|style)>/i, /-->/, /\?>/, />/, /\]\]>/];
/** A table's delimiter row: cells of hyphens with optional colons, and at least one pipe. */
const DELIMITER_ROW = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const TASK = /^\[([ xX])\](?=[ \t]|$)/;

/** The cells of one table row: split at each pipe that no backslash escapes, the outer pipes dropped, each cell trimmed. An escaped pipe is a pipe. */
export function rowCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\" && s[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (c === "\\" && i + 1 < s.length) {
      cell += c + s[i + 1];
      i++;
    } else if (c === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : left ? "left" : right ? "right" : null;
}

type Continue = 0 | 1 | 2;

export class BlockParser {
  readonly extensions: ReadonlySet<Extension>;
  doc = new Node("document");
  tip: Node = this.doc;
  oldtip: Node = this.doc;
  currentLine = "";
  lineNumber = 0;
  offset = 0;
  column = 0;
  nextNonspace = 0;
  nextNonspaceColumn = 0;
  indent = 0;
  indented = false;
  blank = false;
  partiallyConsumedTab = false;
  allClosed = true;
  lastMatchedContainer: Node = this.doc;
  refmap: References = new Map();
  inline = new InlineParser();

  constructor(extensions: ReadonlySet<Extension> = EXTENSIONS) {
    this.extensions = extensions;
    this.inline.strikethrough = extensions.has("strikethrough");
  }

  parse(input: string): Node {
    this.doc = new Node("document");
    this.tip = this.oldtip = this.lastMatchedContainer = this.doc;
    this.refmap = new Map();
    this.lineNumber = 0;
    const lines = input.split(LINE_ENDING);
    let length = lines.length;
    if (input.endsWith("\n") || input.endsWith("\r")) length -= 1;
    for (let i = 0; i < length; i++) this.incorporateLine(lines[i]!);
    while (this.tip !== this.doc) this.finalize(this.tip);
    this.finalize(this.doc);
    this.processInlines();
    return this.doc;
  }

  // ------------------------------------------------------------ positions

  findNextNonspace(): void {
    const line = this.currentLine;
    let i = this.offset;
    let cols = this.column;
    let c: string | undefined;
    while ((c = line[i]) !== undefined) {
      if (c === " ") {
        i++;
        cols++;
      } else if (c === "\t") {
        i++;
        cols += 4 - (cols % 4);
      } else break;
    }
    this.blank = c === undefined || c === "\n" || c === "\r";
    this.nextNonspace = i;
    this.nextNonspaceColumn = cols;
    this.indent = this.nextNonspaceColumn - this.column;
    this.indented = this.indent >= CODE_INDENT;
  }

  advanceNextNonspace(): void {
    this.offset = this.nextNonspace;
    this.column = this.nextNonspaceColumn;
    this.partiallyConsumedTab = false;
  }

  /** Move by `count` characters, or by `count` columns when `columns`, where a tab may be taken in part. */
  advanceOffset(count: number, columns: boolean): void {
    const line = this.currentLine;
    let c: string | undefined;
    while (count > 0 && (c = line[this.offset]) !== undefined) {
      if (c === "\t") {
        const toTab = 4 - (this.column % 4);
        if (columns) {
          this.partiallyConsumedTab = toTab > count;
          const advance = toTab > count ? count : toTab;
          this.column += advance;
          this.offset += this.partiallyConsumedTab ? 0 : 1;
          count -= advance;
        } else {
          this.partiallyConsumedTab = false;
          this.column += toTab;
          this.offset += 1;
          count -= 1;
        }
      } else {
        this.partiallyConsumedTab = false;
        this.offset += 1;
        this.column += 1;
        count -= 1;
      }
    }
  }

  // ------------------------------------------------------------ the tree

  addLine(): void {
    if (this.partiallyConsumedTab) {
      this.offset += 1;
      this.tip.content += " ".repeat(4 - (this.column % 4));
    }
    this.tip.content += `${this.currentLine.slice(this.offset)}\n`;
  }

  addChild(type: NodeType): Node {
    while (!canContain(this.tip.type, type)) this.finalize(this.tip);
    const node = new Node(type);
    node.startLine = this.lineNumber;
    this.tip.appendChild(node);
    this.tip = node;
    return node;
  }

  closeUnmatchedBlocks(): void {
    if (this.allClosed) return;
    while (this.oldtip !== this.lastMatchedContainer) {
      const parent = this.oldtip.parent!;
      this.finalize(this.oldtip);
      this.oldtip = parent;
    }
    this.allClosed = true;
  }

  finalize(block: Node): void {
    const above = block.parent;
    block.open = false;
    switch (block.type) {
      case "paragraph": {
        let found = false;
        let taken: number;
        while (block.content[0] === "[" && (taken = this.inline.parseReference(block.content, this.refmap)) > 0) {
          block.content = block.content.slice(taken);
          found = true;
        }
        if (found && !NONSPACE.test(block.content)) block.unlink();
        break;
      }
      case "code_block":
        if (block.fenced) {
          const newline = block.content.indexOf("\n");
          block.info = unescapeString(block.content.slice(0, newline).trim());
          block.literal = block.content.slice(newline + 1);
        } else {
          block.literal = block.content.replace(/(\n *)+$/, "\n");
        }
        block.content = "";
        break;
      case "html_block":
        block.literal = block.content.replace(/(\n *)+$/, "");
        block.content = "";
        break;
      case "list":
        block.list!.tight = tightList(block);
        break;
      default:
        break;
    }
    this.tip = above ?? this.doc;
  }

  // ------------------------------------------------------------ one line

  /** What each open block of a type does with a line: 0 it continues, 1 it does not, 2 the line is used up. */
  continues(container: Node): Continue {
    const line = this.currentLine;
    switch (container.type) {
      case "document":
      case "list":
        return 0;
      case "block_quote":
        if (!this.indented && line[this.nextNonspace] === ">") {
          this.advanceNextNonspace();
          this.advanceOffset(1, false);
          if (isSpaceOrTab(line[this.offset])) this.advanceOffset(1, true);
          return 0;
        }
        return 1;
      case "item": {
        const data = container.list!;
        if (this.blank) {
          if (container.firstChild === null) return 1;
          this.advanceNextNonspace();
        } else if (this.indent >= data.markerOffset + data.padding) {
          this.advanceOffset(data.markerOffset + data.padding, true);
        } else {
          return 1;
        }
        return 0;
      }
      case "heading":
      case "thematic_break":
        return 1;
      case "code_block":
        if (container.fenced) {
          const m = this.indent <= 3 && line[this.nextNonspace] === container.fenceChar ? CLOSING_CODE_FENCE.exec(line.slice(this.nextNonspace)) : null;
          if (m && m[0].length >= container.fenceLength) {
            this.finalize(container);
            return 2;
          }
          for (let i = container.fenceOffset; i > 0 && isSpaceOrTab(line[this.offset]); i--) this.advanceOffset(1, true);
        } else if (this.indent >= CODE_INDENT) {
          this.advanceOffset(CODE_INDENT, true);
        } else if (this.blank) {
          this.advanceNextNonspace();
        } else {
          return 1;
        }
        return 0;
      case "html_block":
        return this.blank && (container.htmlBlockType === 6 || container.htmlBlockType === 7) ? 1 : 0;
      case "paragraph":
      case "table":
        return this.blank ? 1 : 0;
      default:
        return 1;
    }
  }

  incorporateLine(input: string): void {
    let container: Node = this.doc;
    this.oldtip = this.tip;
    this.offset = 0;
    this.column = 0;
    this.blank = false;
    this.partiallyConsumedTab = false;
    this.lineNumber += 1;
    this.currentLine = input.includes("\u0000") ? input.replace(/\0/g, "�") : input;

    // Continue the open blocks that the line continues.
    let last: Node | null;
    while ((last = container.lastChild) !== null && last.open) {
      container = last;
      this.findNextNonspace();
      const result = this.continues(container);
      if (result === 1) {
        container = container.parent!;
        break;
      }
      if (result === 2) return;
    }
    this.allClosed = container === this.oldtip;
    this.lastMatchedContainer = container;

    // Start new blocks while the line starts one.
    let matchedLeaf = container.type !== "paragraph" && acceptsLines(container.type);
    while (!matchedLeaf) {
      this.findNextNonspace();
      if (!this.indented && !MAYBE_SPECIAL.test(this.currentLine.slice(this.nextNonspace))) {
        this.advanceNextNonspace();
        break;
      }
      let started: Continue = 0;
      for (const start of STARTS) {
        started = start(this, container);
        if (started !== 0) break;
      }
      if (started === 0) {
        this.advanceNextNonspace();
        break;
      }
      container = this.tip;
      if (started === 2) matchedLeaf = true;
    }

    // What remains is text: a lazy paragraph continuation, or the content of the innermost block.
    if (!this.allClosed && !this.blank && this.tip.type === "paragraph") {
      this.addLine();
      return;
    }
    this.closeUnmatchedBlocks();
    if (this.blank && container.lastChild) container.lastChild.lastLineBlank = true;
    const t = container.type;
    const lastLineBlank = this.blank && !(t === "block_quote" || (t === "code_block" && container.fenced) || (t === "item" && container.firstChild === null && container.startLine === this.lineNumber));
    for (let up: Node | null = container; up; up = up.parent) up.lastLineBlank = lastLineBlank;
    if (acceptsLines(t)) {
      this.addLine();
      if (t === "html_block" && container.htmlBlockType >= 1 && container.htmlBlockType <= 5 && HTML_BLOCK_CLOSE[container.htmlBlockType]!.test(this.currentLine.slice(this.offset))) this.finalize(container);
    } else if (t === "table") {
      if (this.offset < this.currentLine.length && !this.blank) container.rows.push(this.currentLine.slice(this.offset));
    } else if (this.offset < this.currentLine.length && !this.blank) {
      this.addChild("paragraph");
      this.advanceNextNonspace();
      this.addLine();
    }
  }

  // ------------------------------------------------------------ inlines

  processInlines(): void {
    for (const node of this.doc.walk()) {
      if (node.type === "paragraph" || node.type === "heading") {
        this.inline.parse(node, node.content, this.refmap);
        node.content = "";
      } else if (node.type === "table") {
        this.buildTable(node);
      }
    }
    // A task's box is found in merged text: `[`, ` ` and `]` are parsed as three texts.
    mergeTexts(this.doc);
    if (this.extensions.has("autolink")) extendedAutolinks(this.doc);
    if (this.extensions.has("tasklist")) for (const node of this.doc.walk()) if (node.type === "item") taskOf(node);
  }

  /** A table's rows and cells from its lines: the header, then each body row, as many cells as the header has. */
  buildTable(table: Node): void {
    const [head, ...body] = table.rows;
    const columns = table.aligns.length;
    const row = (line: string, header: boolean): Node => {
      const tr = new Node("table_row");
      const cells = rowCells(line);
      for (let i = 0; i < columns; i++) {
        const cell = new Node("table_cell");
        cell.header = header;
        this.inline.parse(cell, cells[i] ?? "", this.refmap);
        tr.appendChild(cell);
      }
      return tr;
    };
    table.appendChild(row(head!, true));
    for (const line of body) table.appendChild(row(line, false));
    table.rows = [];
  }
}

function canContain(parent: NodeType, child: NodeType): boolean {
  switch (parent) {
    case "document":
    case "block_quote":
      return child !== "item";
    case "item":
      return child !== "item";
    case "list":
      return child === "item";
    default:
      return false;
  }
}

const acceptsLines = (type: NodeType): boolean => type === "paragraph" || type === "code_block" || type === "html_block";

function endsWithBlankLine(start: Node): boolean {
  let block: Node | null = start;
  while (block) {
    if (block.lastLineBlank) return true;
    if (!block.lastLineChecked && (block.type === "list" || block.type === "item")) {
      block.lastLineChecked = true;
      block = block.lastChild;
    } else {
      block.lastLineChecked = true;
      break;
    }
  }
  return false;
}

function tightList(list: Node): boolean {
  for (let item = list.firstChild; item; item = item.next) {
    if (endsWithBlankLine(item) && item.next) return false;
    for (let sub = item.firstChild; sub; sub = sub.next) {
      if (endsWithBlankLine(sub) && (item.next || sub.next)) return false;
    }
  }
  return true;
}

/** A list item whose first paragraph starts with `[ ]` or `[x]` is a task: its box is taken out of the text. */
function taskOf(item: Node): void {
  const first = item.firstChild;
  if (first?.type !== "paragraph") return;
  const text = first.firstChild;
  if (text?.type !== "text") return;
  const m = TASK.exec(text.literal);
  if (m === null) return;
  // The box must be followed by text or a line ending, never be the whole item.
  const rest = text.literal.slice(3);
  if (rest === "" && text.next === null) return;
  item.task = m[1] !== " ";
  text.literal = rest;
  if (text.literal === "") text.unlink();
}

function parseListMarker(p: BlockParser, container: Node): ListData | null {
  if (p.indent >= 4) return null;
  const line = p.currentLine;
  const rest = line.slice(p.nextNonspace);
  const data: ListData = { type: "bullet", tight: true, bulletChar: "", start: 0, delimiter: "", padding: 0, markerOffset: p.indent };
  let m = BULLET_MARKER.exec(rest);
  if (m) {
    data.bulletChar = m[0][0]!;
  } else if ((m = ORDERED_MARKER.exec(rest)) && (container.type !== "paragraph" || m[1] === "1")) {
    data.type = "ordered";
    data.start = parseInt(m[1]!, 10);
    data.delimiter = m[2]!;
  } else {
    return null;
  }
  const next = line[p.nextNonspace + m[0].length];
  if (!(next === undefined || next === "\t" || next === " ")) return null;
  // A list item that interrupts a paragraph must not start with a blank line.
  if (container.type === "paragraph" && !NONSPACE.test(line.slice(p.nextNonspace + m[0].length))) return null;
  p.advanceNextNonspace();
  p.advanceOffset(m[0].length, true);
  const spacesStartCol = p.column;
  const spacesStartOffset = p.offset;
  do {
    p.advanceOffset(1, true);
  } while (p.column - spacesStartCol < 5 && isSpaceOrTab(line[p.offset]));
  const blankItem = line[p.offset] === undefined;
  const spacesAfterMarker = p.column - spacesStartCol;
  if (spacesAfterMarker >= 5 || spacesAfterMarker < 1 || blankItem) {
    data.padding = m[0].length + 1;
    p.column = spacesStartCol;
    p.offset = spacesStartOffset;
    if (isSpaceOrTab(line[p.offset])) p.advanceOffset(1, true);
  } else {
    data.padding = m[0].length + spacesAfterMarker;
  }
  return data;
}

type Start = (p: BlockParser, container: Node) => Continue;

const STARTS: readonly Start[] = [
  // Block quote.
  (p) => {
    if (p.indented || p.currentLine[p.nextNonspace] !== ">") return 0;
    p.advanceNextNonspace();
    p.advanceOffset(1, false);
    if (isSpaceOrTab(p.currentLine[p.offset])) p.advanceOffset(1, true);
    p.closeUnmatchedBlocks();
    p.addChild("block_quote");
    return 1;
  },
  // ATX heading.
  (p) => {
    const m = p.indented ? null : ATX_HEADING.exec(p.currentLine.slice(p.nextNonspace));
    if (!m) return 0;
    p.advanceNextNonspace();
    p.advanceOffset(m[0].length, false);
    p.closeUnmatchedBlocks();
    const heading = p.addChild("heading");
    heading.level = m[0].trim().length;
    heading.content = p.currentLine.slice(p.offset).replace(/^[ \t]*#+[ \t]*$/, "").replace(/[ \t]+#+[ \t]*$/, "");
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // Fenced code block.
  (p) => {
    const m = p.indented ? null : CODE_FENCE.exec(p.currentLine.slice(p.nextNonspace));
    if (!m) return 0;
    p.closeUnmatchedBlocks();
    const code = p.addChild("code_block");
    code.fenced = true;
    code.fenceLength = m[0].length;
    code.fenceChar = m[0][0]!;
    code.fenceOffset = p.indent;
    p.advanceNextNonspace();
    p.advanceOffset(m[0].length, false);
    return 2;
  },
  // HTML block.
  (p, container) => {
    if (p.indented || p.currentLine[p.nextNonspace] !== "<") return 0;
    const s = p.currentLine.slice(p.nextNonspace);
    for (let type = 1; type <= 7; type++) {
      if (HTML_BLOCK_OPEN[type]!.test(s) && (type < 7 || (container.type !== "paragraph" && !(!p.allClosed && !p.blank && p.tip.type === "paragraph")))) {
        p.closeUnmatchedBlocks();
        const block = p.addChild("html_block");
        block.htmlBlockType = type;
        return 2;
      }
    }
    return 0;
  },
  // Setext heading.
  (p, container) => {
    const m = !p.indented && container.type === "paragraph" ? SETEXT_HEADING.exec(p.currentLine.slice(p.nextNonspace)) : null;
    if (!m) return 0;
    p.closeUnmatchedBlocks();
    let taken: number;
    while (container.content[0] === "[" && (taken = p.inline.parseReference(container.content, p.refmap)) > 0) container.content = container.content.slice(taken);
    if (container.content.length === 0) return 0;
    const heading = new Node("heading");
    heading.level = m[0][0] === "=" ? 1 : 2;
    heading.content = container.content;
    heading.startLine = container.startLine;
    container.insertAfter(heading);
    container.unlink();
    p.tip = heading;
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // Table: a delimiter row under a paragraph whose last line has as many cells.
  (p, container) => {
    if (p.indented || container.type !== "paragraph" || !p.extensions.has("table")) return 0;
    const line = p.currentLine.slice(p.nextNonspace);
    if (!line.includes("|") || !DELIMITER_ROW.test(line)) return 0;
    const lines = container.content.replace(/\n$/, "").split("\n");
    const header = lines[lines.length - 1]!;
    const aligns = rowCells(line).map(alignOf);
    if (rowCells(header).length !== aligns.length) return 0;
    p.closeUnmatchedBlocks();
    const table = new Node("table");
    table.aligns = aligns;
    table.rows = [header];
    table.startLine = p.lineNumber;
    // The lines before the header stay a paragraph.
    if (lines.length > 1) {
      container.content = `${lines.slice(0, -1).join("\n")}\n`;
      container.insertAfter(table);
      p.finalize(container);
    } else {
      container.insertAfter(table);
      container.unlink();
    }
    p.tip = table;
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // Thematic break.
  (p) => {
    if (p.indented || !THEMATIC_BREAK.test(p.currentLine.slice(p.nextNonspace))) return 0;
    p.closeUnmatchedBlocks();
    p.addChild("thematic_break");
    p.advanceOffset(p.currentLine.length - p.offset, false);
    return 2;
  },
  // List item.
  (p, container) => {
    if (p.indented && container.type !== "list") return 0;
    const data = parseListMarker(p, container);
    if (!data) return 0;
    p.closeUnmatchedBlocks();
    if (p.tip.type !== "list" || !listsMatch(container.list, data)) {
      const list = p.addChild("list");
      list.list = data;
    }
    const item = p.addChild("item");
    item.list = data;
    return 1;
  },
  // Indented code block.
  (p) => {
    if (!p.indented || p.tip.type === "paragraph" || p.blank) return 0;
    p.advanceOffset(CODE_INDENT, true);
    p.closeUnmatchedBlocks();
    p.addChild("code_block");
    return 2;
  },
];

function listsMatch(a: ListData | null, b: ListData): boolean {
  return a !== null && a.type === b.type && a.delimiter === b.delimiter && a.bulletChar === b.bulletChar;
}
