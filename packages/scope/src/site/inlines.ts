/**
 * The inline parser: the text of a paragraph, a heading or a table cell
 * into code spans, emphasis, strikethrough, links, images, autolinks, raw
 * HTML, entities, escapes and line breaks, by the algorithm of the GitHub
 * Flavored Markdown specification's appendix ("An algorithm for parsing
 * nested emphasis and links"). The extended autolinks of GFM are found
 * afterwards, in the text that no link holds (`autolinks.ts`).
 *
 * Positions are UTF-16 indexes into the subject. Regular expressions are
 * sticky (`y`) or global and are run at `lastIndex`, so no text is copied
 * while it is scanned.
 */
import { ENTITY_HERE, ESCAPABLE, Node, decodeEntity, normalizeLabel, normalizeURI, unescapeString } from "./node.ts";

export interface Reference { destination: string; title: string }
export type References = Map<string, Reference>;

const TAGNAME = "[A-Za-z][A-Za-z0-9-]*";
const ATTRIBUTENAME = "[a-zA-Z_:][a-zA-Z0-9:._-]*";
const ATTRIBUTEVALUE = "(?:[^\"'=<>`\\x00-\\x20]+|'[^']*'|\"[^\"]*\")";
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}(?:\\s*=\\s*${ATTRIBUTEVALUE})?)`;
export const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`;
export const CLOSETAG = `</${TAGNAME}\\s*[>]`;
const HTMLCOMMENT = "<!-->|<!--->|<!--[\\s\\S]*?-->";
const PROCESSING = "[<][?][\\s\\S]*?[?][>]";
const DECLARATION = "<![A-Z]+\\s+[^>]*>";
const CDATA = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>";
const HTML_TAG = new RegExp(`(?:${OPENTAG}|${CLOSETAG}|${HTMLCOMMENT}|${PROCESSING}|${DECLARATION}|${CDATA})`, "iy");

const ESCAPABLE_CHAR = new RegExp(`^${ESCAPABLE}$`);
const LINK_TITLE = new RegExp(`"(?:\\\\${ESCAPABLE}|[^"\\x00])*"|'(?:\\\\${ESCAPABLE}|[^'\\x00])*'|\\((?:\\\\${ESCAPABLE}|[^()\\x00])*\\)`, "y");
const LINK_DESTINATION_BRACES = /<(?:[^<>\n\\\x00]|\\.)*>/y;
const LINK_LABEL = /\[(?:[^\\[\]]|\\.){0,1000}\]/sy;
const EMAIL_AUTOLINK = /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y;
const AUTOLINK = /<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/y;
const SPNL = / *(?:\n *)?/y;
const WHITESPACE_CHAR = /^[ \t\n\x0b\x0c\x0d]$/;
const UNICODE_WHITESPACE = /^\s$/u;
const PUNCTUATION = /^[!-/:-@[-`{-~\p{P}]$/u;
const MAIN = /[^\n`[\]\\!<&*_~]+/y;
const TICKS = /`+/g;
const TICKS_HERE = /`+/y;
const INITIAL_SPACE = / */y;
const FINAL_SPACE = / *$/;

interface Delimiter {
  cc: string;
  numdelims: number;
  origdelims: number;
  node: Node;
  previous: Delimiter | null;
  next: Delimiter | null;
  canOpen: boolean;
  canClose: boolean;
}
interface Bracket {
  node: Node;
  previous: Bracket | null;
  previousDelimiter: Delimiter | null;
  index: number;
  image: boolean;
  active: boolean;
  bracketAfter: boolean;
}

const text = (literal: string): Node => new Node("text", literal);

export class InlineParser {
  /** GFM's strikethrough: `~` and `~~` delimit. Without it a tilde is text. */
  strikethrough = true;
  subject = "";
  pos = 0;
  delimiters: Delimiter | null = null;
  brackets: Bracket | null = null;
  refmap: References = new Map();

  /** The text matched by a sticky or global expression at the position, which then moves past it; or null. */
  match(re: RegExp): string | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.subject);
    if (m === null) return null;
    this.pos = m.index + m[0].length;
    return m[0];
  }

  peek(): string | undefined {
    return this.subject[this.pos];
  }

  spnl(): true {
    this.match(SPNL);
    return true;
  }

  /** Parse the content of a block into its inline children. */
  parse(block: Node, content: string, refmap: References): void {
    this.subject = content.trim();
    this.pos = 0;
    this.delimiters = null;
    this.brackets = null;
    this.refmap = refmap;
    while (this.parseInline(block));
    this.processEmphasis(null);
  }

  parseInline(block: Node): boolean {
    const c = this.peek();
    if (c === undefined) return false;
    let res = false;
    switch (c) {
      case "\n": res = this.parseNewline(block); break;
      case "\\": res = this.parseBackslash(block); break;
      case "`": res = this.parseBackticks(block); break;
      case "*": case "_": res = this.handleDelim(c, block); break;
      case "~": res = this.strikethrough && this.handleDelim(c, block); break;
      case "[": res = this.parseOpenBracket(block); break;
      case "!": res = this.parseBang(block); break;
      case "]": res = this.parseCloseBracket(block); break;
      case "<": res = this.parseAutolink(block) || this.parseHtmlTag(block); break;
      case "&": res = this.parseEntity(block); break;
      default: res = this.parseString(block); break;
    }
    if (!res) {
      this.pos += 1;
      block.appendChild(text(c));
    }
    return true;
  }

  parseNewline(block: Node): boolean {
    this.pos += 1;
    const last = block.lastChild;
    if (last && last.type === "text" && last.literal.endsWith(" ")) {
      const hard = last.literal[last.literal.length - 2] === " ";
      last.literal = last.literal.replace(FINAL_SPACE, "");
      block.appendChild(new Node(hard ? "linebreak" : "softbreak"));
    } else {
      block.appendChild(new Node("softbreak"));
    }
    this.match(INITIAL_SPACE);
    return true;
  }

  parseBackslash(block: Node): boolean {
    this.pos += 1;
    const c = this.peek();
    if (c === "\n") {
      this.pos += 1;
      block.appendChild(new Node("linebreak"));
    } else if (c !== undefined && ESCAPABLE_CHAR.test(c)) {
      block.appendChild(text(c));
      this.pos += 1;
    } else {
      block.appendChild(text("\\"));
    }
    return true;
  }

  parseBackticks(block: Node): boolean {
    const ticks = this.match(TICKS_HERE);
    if (ticks === null) return false;
    const after = this.pos;
    for (let found = this.match(TICKS); found !== null; found = this.match(TICKS)) {
      if (found === ticks) {
        const contents = this.subject.slice(after, this.pos - ticks.length).replace(/\n/g, " ");
        const strip = contents.length > 0 && /[^ ]/.test(contents) && contents[0] === " " && contents[contents.length - 1] === " ";
        block.appendChild(new Node("code", strip ? contents.slice(1, -1) : contents));
        return true;
      }
    }
    this.pos = after;
    block.appendChild(text(ticks));
    return true;
  }

  scanDelims(cc: string): { numdelims: number; canOpen: boolean; canClose: boolean } | null {
    const start = this.pos;
    let numdelims = 0;
    while (this.peek() === cc) {
      numdelims++;
      this.pos++;
    }
    if (numdelims === 0) return null;
    const before = start === 0 ? "\n" : charBefore(this.subject, start);
    const after = this.pos >= this.subject.length ? "\n" : charAt(this.subject, this.pos);
    const afterWhite = UNICODE_WHITESPACE.test(after);
    const afterPunct = PUNCTUATION.test(after);
    const beforeWhite = UNICODE_WHITESPACE.test(before);
    const beforePunct = PUNCTUATION.test(before);
    const left = !afterWhite && (!afterPunct || beforeWhite || beforePunct);
    const right = !beforeWhite && (!beforePunct || afterWhite || afterPunct);
    let canOpen: boolean;
    let canClose: boolean;
    if (cc === "_") {
      canOpen = left && (!right || beforePunct);
      canClose = right && (!left || afterPunct);
    } else if (cc === "~") {
      // Strikethrough: one or two tildes; a longer run is text.
      canOpen = left && numdelims <= 2;
      canClose = right && numdelims <= 2;
    } else {
      canOpen = left;
      canClose = right;
    }
    this.pos = start;
    return { numdelims, canOpen, canClose };
  }

  handleDelim(cc: string, block: Node): boolean {
    const scanned = this.scanDelims(cc);
    if (!scanned) return false;
    const start = this.pos;
    this.pos += scanned.numdelims;
    const node = text(this.subject.slice(start, this.pos));
    block.appendChild(node);
    this.delimiters = { cc, numdelims: scanned.numdelims, origdelims: scanned.numdelims, node, previous: this.delimiters, next: null, canOpen: scanned.canOpen, canClose: scanned.canClose };
    if (this.delimiters.previous) this.delimiters.previous.next = this.delimiters;
    return true;
  }

  removeDelimiter(delim: Delimiter): void {
    if (delim.previous !== null) delim.previous.next = delim.next;
    if (delim.next === null) this.delimiters = delim.previous;
    else delim.next.previous = delim.previous;
  }

  processEmphasis(bottom: Delimiter | null): void {
    // The lowest opener to look at, by the closer's character, whether it can open, and its length modulo 3.
    const openersBottom = new Map<string, Delimiter | null>();
    const key = (closer: Delimiter) => `${closer.cc}${closer.canOpen ? 1 : 0}${closer.origdelims % 3}`;
    let closer = this.delimiters;
    while (closer !== null && closer.previous !== bottom) closer = closer.previous;
    while (closer !== null) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const index = key(closer);
      const floor = openersBottom.has(index) ? openersBottom.get(index)! : bottom;
      let opener = closer.previous;
      let found = false;
      while (opener !== null && opener !== bottom && opener !== floor) {
        const oddMatch = closer.cc !== "~" && (closer.canOpen || opener.canClose) && closer.origdelims % 3 !== 0 && (opener.origdelims + closer.origdelims) % 3 === 0;
        if (opener.cc === closer.cc && opener.canOpen && !oddMatch && (closer.cc !== "~" || opener.origdelims === closer.origdelims)) {
          found = true;
          break;
        }
        opener = opener.previous;
      }
      const oldCloser = closer;
      if (!found) {
        closer = closer.next;
      } else {
        const use = closer.cc === "~" ? closer.numdelims : closer.numdelims >= 2 && opener!.numdelims >= 2 ? 2 : 1;
        const openerNode = opener!.node;
        const closerNode = closer.node;
        opener!.numdelims -= use;
        closer.numdelims -= use;
        openerNode.literal = openerNode.literal.slice(0, openerNode.literal.length - use);
        closerNode.literal = closerNode.literal.slice(0, closerNode.literal.length - use);
        const wrap = new Node(closer.cc === "~" ? "del" : use === 1 ? "emph" : "strong");
        for (let tmp = openerNode.next; tmp && tmp !== closerNode; ) {
          const next = tmp.next;
          wrap.appendChild(tmp);
          tmp = next;
        }
        openerNode.insertAfter(wrap);
        // The delimiters between opener and closer are gone.
        if (opener!.next !== closer) {
          opener!.next = closer;
          closer.previous = opener!;
        }
        if (opener!.numdelims === 0) {
          openerNode.unlink();
          this.removeDelimiter(opener!);
        }
        if (closer.numdelims === 0) {
          closerNode.unlink();
          const next = closer.next;
          this.removeDelimiter(closer);
          closer = next;
        }
      }
      if (!found) {
        openersBottom.set(index, oldCloser.previous);
        if (!oldCloser.canOpen) this.removeDelimiter(oldCloser);
      }
    }
    while (this.delimiters !== null && this.delimiters !== bottom) this.removeDelimiter(this.delimiters);
  }

  addBracket(node: Node, index: number, image: boolean): void {
    if (this.brackets !== null) this.brackets.bracketAfter = true;
    this.brackets = { node, previous: this.brackets, previousDelimiter: this.delimiters, index, image, active: true, bracketAfter: false };
  }

  parseOpenBracket(block: Node): boolean {
    const start = this.pos;
    this.pos += 1;
    const node = text("[");
    block.appendChild(node);
    this.addBracket(node, start, false);
    return true;
  }

  parseBang(block: Node): boolean {
    const start = this.pos;
    this.pos += 1;
    if (this.peek() === "[") {
      this.pos += 1;
      const node = text("![");
      block.appendChild(node);
      this.addBracket(node, start + 1, true);
    } else {
      block.appendChild(text("!"));
    }
    return true;
  }

  parseCloseBracket(block: Node): boolean {
    this.pos += 1;
    const start = this.pos;
    let opener = this.brackets;
    if (opener === null) {
      block.appendChild(text("]"));
      return true;
    }
    if (!opener.active) {
      block.appendChild(text("]"));
      this.brackets = opener.previous;
      return true;
    }
    const image = opener.image;
    const save = this.pos;
    let destination: string | null = null;
    let title: string | null = null;
    let matched = false;
    // An inline link: `(destination "title")`.
    if (this.peek() === "(") {
      this.pos++;
      if (this.spnl() && (destination = this.parseLinkDestination()) !== null && this.spnl()) {
        // A title must follow whitespace.
        if (WHITESPACE_CHAR.test(this.subject[this.pos - 1] ?? "")) title = this.parseLinkTitle();
        if (this.spnl() && this.peek() === ")") {
          this.pos += 1;
          matched = true;
        }
      }
      if (!matched) this.pos = save;
    }
    if (!matched) {
      // A reference link: full, collapsed or shortcut.
      const beforeLabel = this.pos;
      const n = this.parseLinkLabel();
      let label: string | null = null;
      if (n > 2) label = this.subject.slice(beforeLabel, beforeLabel + n);
      else if (!opener.bracketAfter) label = this.subject.slice(opener.index, start);
      if (n === 0) this.pos = save;
      if (label) {
        const reference = this.refmap.get(normalizeLabel(label));
        if (reference) {
          destination = reference.destination;
          title = reference.title;
          matched = true;
        }
      }
    }
    if (!matched) {
      this.brackets = opener.previous;
      this.pos = start;
      block.appendChild(text("]"));
      return true;
    }
    const node = new Node(image ? "image" : "link");
    node.destination = destination ?? "";
    node.title = title ?? "";
    for (let tmp = opener.node.next; tmp; ) {
      const next = tmp.next;
      node.appendChild(tmp);
      tmp = next;
    }
    block.appendChild(node);
    this.processEmphasis(opener.previousDelimiter);
    this.brackets = opener.previous;
    opener.node.unlink();
    // No link holds a link: the openers before this one cannot make one now.
    if (!image) {
      for (opener = this.brackets; opener !== null; opener = opener.previous) if (!opener.image) opener.active = false;
    }
    return true;
  }

  parseLinkDestination(): string | null {
    const braced = this.match(LINK_DESTINATION_BRACES);
    if (braced !== null) return normalizeURI(unescapeString(braced.slice(1, -1)));
    if (this.peek() === "<") return null;
    const save = this.pos;
    let parens = 0;
    let c: string | undefined;
    while ((c = this.peek()) !== undefined) {
      if (c === "\\" && ESCAPABLE_CHAR.test(this.subject[this.pos + 1] ?? "")) {
        this.pos += 2;
      } else if (c === "(") {
        this.pos += 1;
        parens += 1;
        // The specification lets an implementation limit this nesting, to at least 32; cmark's limit is 32. It bounds the scan.
        if (parens > 32) return null;
      } else if (c === ")") {
        if (parens < 1) break;
        this.pos += 1;
        parens -= 1;
      } else if (WHITESPACE_CHAR.test(c) || c.charCodeAt(0) < 0x20 || c === "\x7f") {
        break;
      } else {
        this.pos += 1;
      }
    }
    if (this.pos === save && c !== ")") return null;
    if (parens !== 0) return null;
    return normalizeURI(unescapeString(this.subject.slice(save, this.pos)));
  }

  parseLinkTitle(): string | null {
    const title = this.match(LINK_TITLE);
    return title === null ? null : unescapeString(title.slice(1, -1));
  }

  /** The length of a link label at the position, brackets included, or 0. */
  parseLinkLabel(): number {
    const label = this.match(LINK_LABEL);
    return label === null || label.length > 1001 ? 0 : label.length;
  }

  parseAutolink(block: Node): boolean {
    let m = this.match(EMAIL_AUTOLINK);
    if (m !== null) {
      const address = m.slice(1, -1);
      const node = new Node("link");
      node.destination = normalizeURI(`mailto:${address}`);
      node.appendChild(text(address));
      block.appendChild(node);
      return true;
    }
    m = this.match(AUTOLINK);
    if (m !== null) {
      const address = m.slice(1, -1);
      const node = new Node("link");
      node.destination = normalizeURI(address);
      node.appendChild(text(address));
      block.appendChild(node);
      return true;
    }
    return false;
  }

  parseHtmlTag(block: Node): boolean {
    const m = this.match(HTML_TAG);
    if (m === null) return false;
    block.appendChild(new Node("html_inline", m));
    return true;
  }

  parseEntity(block: Node): boolean {
    const m = this.match(ENTITY_HERE);
    if (m === null) return false;
    block.appendChild(text(decodeEntity(m)));
    return true;
  }

  parseString(block: Node): boolean {
    const m = this.match(MAIN);
    if (m === null) return false;
    block.appendChild(text(m));
    return true;
  }

  /**
   * A link reference definition at the start of `content`: it is added to
   * `refmap` unless one of that label is there, and the answer is the number
   * of characters it took, or 0 when there is none.
   */
  parseReference(content: string, refmap: References): number {
    this.subject = content;
    this.pos = 0;
    const start = this.pos;
    const n = this.parseLinkLabel();
    if (n === 0) return 0;
    const raw = this.subject.slice(0, n);
    if (this.peek() !== ":") {
      this.pos = start;
      return 0;
    }
    this.pos++;
    this.spnl();
    const destination = this.parseLinkDestination();
    if (destination === null) {
      this.pos = start;
      return 0;
    }
    const beforeTitle = this.pos;
    this.spnl();
    let title: string | null = null;
    if (this.pos !== beforeTitle) title = this.parseLinkTitle();
    if (title === null) {
      title = "";
      this.pos = beforeTitle;
    }
    // The title, if any, ends the line.
    let atLineEnd = true;
    if (this.match(/[ \t]*(?:\n|$)/y) === null) {
      if (title === "") {
        atLineEnd = false;
      } else {
        // The title was not at the end of the line: try without it.
        title = "";
        this.pos = beforeTitle;
        atLineEnd = this.match(/[ \t]*(?:\n|$)/y) !== null;
      }
    }
    if (!atLineEnd) {
      this.pos = start;
      return 0;
    }
    const label = normalizeLabel(raw);
    if (label === "") {
      this.pos = start;
      return 0;
    }
    if (!refmap.has(label)) refmap.set(label, { destination, title });
    return this.pos - start;
  }
}

/** The character that ends just before `at`, a surrogate pair taken whole. */
function charBefore(s: string, at: number): string {
  const low = s.charCodeAt(at - 1);
  if (low >= 0xdc00 && low <= 0xdfff && at >= 2) {
    const high = s.charCodeAt(at - 2);
    if (high >= 0xd800 && high <= 0xdbff) return s.slice(at - 2, at);
  }
  return s[at - 1]!;
}
function charAt(s: string, at: number): string {
  return String.fromCodePoint(s.codePointAt(at)!);
}
