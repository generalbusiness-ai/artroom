/**
 * GitHub Flavored Markdown's extended autolinks (the specification's
 * section "Autolinks (extension)"): `www.` and `http://`, `https://` and
 * `ftp://` addresses, and email addresses, found in plain text after the
 * inline parser has run. Text inside a link or an image is left alone, and
 * so is a code span, which is no text node.
 *
 * The rules follow the specification's text, and where it is silent, the
 * reference implementation's (cmark-gfm, `extensions/autolink.c`): which
 * trailing characters a link leaves out, and how a domain is checked.
 */
import { Node, normalizeURI } from "./node.ts";

const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const ASCII_ALNUM = /^[A-Za-z0-9]$/;
const ASCII_ALPHA = /^[A-Za-z]$/;
const SPACE = /^\s$/u;

/**
 * The length of a valid domain at the start of `s`, or 0. Segments of
 * letters, digits, `_` and `-`, separated by `.`; no `_` in the last two
 * segments; at least one `.` unless `short` allows none.
 */
function domain(s: string, short: boolean): number {
  let i = 0;
  let periods = 0;
  let underscoresBefore = 0;
  let underscores = 0;
  for (; i < s.length; i++) {
    const c = s[i]!;
    if (c === "_") underscores++;
    else if (c === ".") {
      // A period is part of the domain only when a domain character follows it.
      const next = s[i + 1];
      if (next === undefined || !(LETTER_OR_DIGIT.test(next) || next === "-" || next === "_")) break;
      underscoresBefore = underscores;
      underscores = 0;
      periods++;
    } else if (!(LETTER_OR_DIGIT.test(c) || c === "-")) break;
  }
  if (i === 0 || underscoresBefore > 0 || underscores > 0) return 0;
  return short || periods > 0 ? i : 0;
}

/** Where a link that could run to `end` ends: trailing punctuation, unbalanced `)` and an entity-like `&name;` left out. */
function trimmed(s: string, end: number): number {
  const lt = s.indexOf("<");
  if (lt >= 0 && lt < end) end = lt;
  while (end > 0) {
    const last = s[end - 1]!;
    if ("?!.,:*_~'\"".includes(last)) {
      end--;
    } else if (last === ";") {
      let at = end - 2;
      while (at > 0 && ASCII_ALPHA.test(s[at]!)) at--;
      end = at < end - 2 && s[at] === "&" ? at : end - 1;
    } else if (last === ")") {
      let opening = 0;
      let closing = 0;
      for (let i = 0; i < end; i++) {
        if (s[i] === "(") opening++;
        else if (s[i] === ")") closing++;
      }
      if (closing <= opening) break;
      end--;
    } else {
      break;
    }
  }
  return end;
}

/** The end of the path after a domain: the first space or `<`. */
function pathEnd(s: string, from: number): number {
  let i = from;
  while (i < s.length && !SPACE.test(s[i]!) && s[i] !== "<") i++;
  return i;
}

interface Found { start: number; end: number; href: string }

/** A `www.` or scheme link that starts at `at`, or null. `at` must follow the start of the text, a space, or one of `*_~(`. */
function webAt(s: string, at: number): Found | null {
  const rest = s.slice(at);
  if (rest.startsWith("www.")) {
    const length = domain(rest, false);
    if (length === 0) return null;
    const end = trimmed(rest, pathEnd(rest, length));
    return end === 0 ? null : { start: at, end: at + end, href: `http://${rest.slice(0, end)}` };
  }
  const scheme = /^(?:https?|ftp):\/\//i.exec(rest);
  if (scheme) {
    const length = domain(rest.slice(scheme[0].length), true);
    if (length === 0) return null;
    const end = trimmed(rest, pathEnd(rest, scheme[0].length + length));
    return end <= scheme[0].length ? null : { start: at, end: at + end, href: rest.slice(0, end) };
  }
  return null;
}

/** An email address around the `@` at `at`, or null. */
function emailAt(s: string, at: number): Found | null {
  let start = at;
  while (start > 0 && (ASCII_ALNUM.test(s[start - 1]!) || ".+-_".includes(s[start - 1]!))) start--;
  if (start === at) return null;
  let end = at + 1;
  let periods = 0;
  for (; end < s.length; end++) {
    const c = s[end]!;
    if (ASCII_ALNUM.test(c)) continue;
    if (c === "." && end < s.length - 1 && ASCII_ALNUM.test(s[end + 1]!)) periods++;
    else if (c !== "-" && c !== "_") break;
  }
  if (end - at < 2 || periods === 0 || !(ASCII_ALPHA.test(s[end - 1]!) || s[end - 1] === ".")) return null;
  const length = trimmed(s.slice(at), end - at);
  if (length < 2) return null;
  return { start, end: at + length, href: `mailto:${s.slice(start, at + length)}` };
}

/** Every extended autolink of one text, left to right, none overlapping. */
function links(s: string): Found[] {
  const found: Found[] = [];
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    let hit: Found | null = null;
    const boundary = i === 0 || SPACE.test(s[i - 1]!) || "*_~(".includes(s[i - 1]!);
    if (c === "w" && boundary) hit = webAt(s, i);
    else if ((c === "h" || c === "H" || c === "f" || c === "F") && (i === 0 || !ASCII_ALPHA.test(s[i - 1]!))) hit = webAt(s, i);
    else if (c === "@") {
      hit = emailAt(s, i);
      if (hit && hit.start < from) hit = null;
    }
    if (hit) {
      found.push(hit);
      from = hit.end;
      i = hit.end - 1;
    }
  }
  return found;
}

/** Adjacent text nodes merged into one, in every inline container under `root`. */
export function mergeTexts(root: Node): void {
  for (const node of root.walk()) {
    if (node.type === "text") {
      while (node.next && node.next.type === "text") {
        node.literal += node.next.literal;
        node.next.unlink();
      }
    }
  }
}

/** Replace each extended autolink in the text of `root` with a link. */
export function extendedAutolinks(root: Node): void {
  mergeTexts(root);
  const texts: Node[] = [];
  let inLink = 0;
  for (const [node, entering] of root.events()) {
    if (node.type === "link" || node.type === "image") inLink += entering ? 1 : -1;
    else if (node.type === "text" && inLink === 0) texts.push(node);
  }
  for (const node of texts) {
    const s = node.literal;
    const found = links(s);
    if (found.length === 0) continue;
    let at = 0;
    let before = node;
    const place = (made: Node) => { before.insertAfter(made); before = made; };
    node.literal = s.slice(0, found[0]!.start);
    for (const hit of found) {
      if (hit.start > at && at > 0) place(new Node("text", s.slice(at, hit.start)));
      const link = new Node("link");
      link.destination = normalizeURI(hit.href);
      link.appendChild(new Node("text", s.slice(hit.start, hit.end)));
      place(link);
      at = hit.end;
    }
    if (at < s.length) place(new Node("text", s.slice(at)));
    if (node.literal === "") node.unlink();
  }
}
