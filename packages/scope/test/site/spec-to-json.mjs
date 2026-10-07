// Turns the GFM spec text into its examples as JSON, as cmark-gfm's test/spec_tests.py reads them.
// Usage: node spec-to-json.mjs spec.txt gfm-spec.json
import { readFileSync, writeFileSync } from "node:fs";
const [, , input, output] = process.argv;
const lines = readFileSync(input, "utf8").split("\n");
const FENCE = "````````````````````````````````";
const examples = [];
let section = "", state = 0, markdown = [], html = [], extension = "", start = 0, number = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (state === 0) {
    if (line.startsWith(FENCE + " example")) { state = 1; extension = line.slice(FENCE.length + " example".length).trim(); markdown = []; html = []; start = i + 1; }
    else { const m = /^#{1,6} +(.*)$/.exec(line); if (m) section = m[1].trim(); }
  } else if (state === 1) {
    if (line === ".") state = 2; else markdown.push(line);
  } else if (state === 2) {
    if (line === FENCE) {
      number++;
      const join = (a) => a.map((l) => l + "\n").join("").replaceAll("→", "\t");
      examples.push({ example: number, section, extension: extension || null, start_line: start, markdown: join(markdown), html: join(html) });
      state = 0;
    } else html.push(line);
  }
}
writeFileSync(output, JSON.stringify(examples, null, 1) + "\n");
console.log(examples.length, [...new Set(examples.map((e) => e.section))].length);
