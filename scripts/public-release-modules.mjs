// Source-specific ESM/TypeScript module literals, with byte-preserving spans.
// This is not a JavaScript evaluator or a replacement for compiler resolution.
const bad = () => { throw new Error("unsupported-module-syntax"); };

function literal(text, token) {
  let value = "";
  const raw = text.slice(token.start + 1, token.end - 1);
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "\\") { value += c; continue; }
    const next = raw[++i];
    if (next === undefined) bad();
    const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" };
    if (/[1-9]/.test(next) || next === "0" && /\d/.test(raw[i + 1] ?? "")) bad();
    if (next === "\n" || next === "\u2028" || next === "\u2029") continue;
    if (next === "\r") { if (raw[i + 1] === "\n") i++; continue; }
    if (next === "x" || next === "u") {
      const braced = next === "u" && raw[i + 1] === "{";
      const end = braced ? raw.indexOf("}", i + 2) : i + (next === "x" ? 2 : 4) + 1;
      const digits = raw.slice(i + (braced ? 2 : 1), end);
      if (!/^[0-9a-fA-F]+$/.test(digits) || (!braced && digits.length !== (next === "x" ? 2 : 4)) || braced && (end < 0 || digits.length > 6)) bad();
      const point = Number.parseInt(digits, 16);
      if (point > 0x10ffff) bad();
      value += braced ? String.fromCodePoint(point) : String.fromCharCode(point);
      i = braced ? end : end - 1;
    } else value += escapes[next] ?? next;
  }
  return { value, start: token.start + 1, end: token.end - 1, quote: text[token.start] };
}

function tokens(text) {
  const result = []; let i = 0;
  const push = (kind, start, value, extra = {}) => { const token = { kind, start, end: i, value, ...extra }; result.push(token); return token; };
  const regexPosition = () => {
    const previous = result.at(-1);
    return !previous || previous.kind === "word" && /^(return|throw|case|yield|typeof|void|delete)$/.test(previous.value)
      || previous.kind === "punct" && "({[=:;,!?&|+*%~^<>-".includes(previous.value);
  };
  function code(interpolation = false) {
    let depth = 0;
    while (i < text.length) {
      const start = i, c = text[i];
      if (/\s/.test(c)) { i++; continue; }
      if (text.startsWith("//", i)) { i = text.indexOf("\n", i + 2); if (i < 0) i = text.length; continue; }
      if (text.startsWith("/*", i)) { const end = text.indexOf("*/", i + 2); if (end < 0) bad(); i = end + 2; continue; }
      if (interpolation && c === "}" && depth === 0) { i++; return; }
      if (c === "'" || c === '"') {
        i++;
        while (i < text.length && text[i] !== c) { if (text[i] === "\\") i++; i++; }
        if (i >= text.length) bad(); i++; push("string", start); continue;
      }
      if (c === "`") {
        i++; const token = push("template", start, undefined, { substituted: false });
        while (i < text.length && text[i] !== "`") {
          if (text[i] === "\\") { i += 2; continue; }
          if (text.startsWith("${", i)) { token.substituted = true; i += 2; push("punct", i - 1, "{"); code(true); push("punct", i - 1, "}"); continue; }
          i++;
        }
        if (i >= text.length) bad(); i++; token.end = i; continue;
      }
      if (c === "/" && regexPosition()) {
        i++; let bracket = false, ended = false;
        while (i < text.length) {
          const next = text[i++];
          if (next === "\\") { i++; continue; }
          if (next === "[") bracket = true;
          if (next === "]") bracket = false;
          if (next === "/" && !bracket) { ended = true; break; }
          if (next === "\n" || next === "\r") bad();
        }
        if (!ended) bad(); while (/[a-z]/i.test(text[i] ?? "")) i++;
        push("data", start); continue;
      }
      if (/[A-Za-z_$]/.test(c)) { i++; while (/[A-Za-z0-9_$]/.test(text[i] ?? "")) i++; push("word", start, text.slice(start, i)); continue; }
      if (/\d/.test(c)) { i++; while (/[\dA-Za-z_.]/.test(text[i] ?? "")) i++; push("data", start); continue; }
      if (c === "{") depth++;
      if (c === "}") depth--;
      i++; push("punct", start, c);
    }
    if (interpolation) bad();
  }
  code(); return result;
}

/** Literal module references only; ordinary strings and 'from' data are inert. */
export function moduleSpecifierSpans(text) {
  const read = tokens(text), found = [];
  const module = token => {
    if (!token || !(token.kind === "string" || token.kind === "template" && !token.substituted)) bad();
    found.push(literal(text, token));
  };
  for (let i = 0; i < read.length; i++) {
    const token = read[i], next = read[i + 1];
    if (token.kind !== "word" || !(token.value === "import" || token.value === "export") || read[i - 1]?.value === ".") continue;
    if (token.value === "import") {
      if (next?.value === "." || next?.value === ":") continue;
      if (next?.kind === "string") { module(next); i++; continue; }
      if (next?.value === "(") {
        module(read[i + 2]);
        if (!(read[i + 3]?.value === ")" || read[i + 3]?.value === ",")) bad();
        i += 2; continue;
      }
    } else {
      if (next?.value === ":") continue;
      const binding = next?.value === "type" ? read[i + 2] : next;
      if (!(binding?.value === "{" || binding?.value === "*")) continue; // local exported declarations
    }
    let braces = 0, complete = false;
    for (let j = i + 1; j < read.length; j++) {
      const part = read[j];
      if (part.value === "{") braces++;
      if (part.value === "}") braces--;
      if (token.value === "export" && part.value === "}" && braces === 0 && read[j + 1]?.value !== "from") { i = j; complete = true; break; }
      if (braces === 0 && part.kind === "word" && /^(?:const|let|function|class|interface|import|export)$/.test(part.value)) bad();
      if (braces === 0 && part.kind === "word" && part.value === "from") { module(read[j + 1]); i = j + 1; complete = true; break; }
      if (braces === 0 && (part.value === ";" || part.value === "=")) { if (token.value === "import") bad(); i = j; complete = true; break; }
    }
    if (!complete) bad();
  }
  return found.sort((a, b) => a.start - b.start);
}
