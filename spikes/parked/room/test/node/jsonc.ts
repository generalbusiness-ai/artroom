/**
 * A wrangler config file as it is written: JSON with comments and trailing
 * commas. The tests read these files for a few plain fields. Wrangler's own
 * reader gives the same fields, but importing wrangler costs a test file
 * about a second.
 */

import { readFileSync } from "node:fs";

/** Copy `text`, giving each character outside a string to `other`, which says how many characters it used. */
function outsideStrings(text: string, other: (at: number) => { readonly keep: string; readonly used: number }): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      out += text.slice(start, ++i);
    } else {
      const { keep, used } = other(i);
      out += keep;
      i += used;
    }
  }
  return out;
}

/** The text as JSON: comments removed, then trailing commas, both outside strings. */
export function stripJsonc(text: string): string {
  const plain = outsideStrings(text, (i) => {
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      return { keep: "", used: (end < 0 ? text.length : end) - i };
    }
    if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      return { keep: "", used: (end < 0 ? text.length : end + 2) - i };
    }
    return { keep: text[i]!, used: 1 };
  });
  return outsideStrings(plain, (i) => ({ keep: plain[i] === "," && /^\s*[}\]]/.test(plain.slice(i + 1, i + 200)) ? "" : plain[i]!, used: 1 }));
}

/** The config at `file`, a path relative to `base` (a test passes `import.meta.url`). */
export function readJsonc<T>(file: string, base: string): T {
  return JSON.parse(stripJsonc(readFileSync(new URL(file, base).pathname, "utf8"))) as T;
}
