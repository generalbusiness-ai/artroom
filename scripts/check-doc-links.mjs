#!/usr/bin/env node
// Check the relative links of every Markdown file in the repository.
//
// A link fails when its target file does not exist, or when it names a
// heading anchor that the target Markdown file does not have. Links with a
// scheme (https:, mailto:) and absolute paths are not relative and are not
// checked. Fenced code and inline code are not read.
//
// Skipped: node_modules, .git, and every test/ directory, whose Markdown
// files are fixtures. notes/, plans/ and parked/ are history and keep their
// links as written; --history adds plans/ and parked/ to the check.
//
// Usage: node scripts/check-doc-links.mjs [--history] [root]
// Exits 0 when every link resolves, 1 otherwise.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const history = args.includes("--history");
const root = resolve(args.find((arg) => !arg.startsWith("--")) ?? new URL("..", import.meta.url).pathname);
const skipAtRoot = new Set(history ? ["notes"] : ["notes", "plans", "parked"]);
const skipAnywhere = new Set(["node_modules", ".git", "test"]);

function* markdown(dir) {
	for (const name of readdirSync(dir)) {
		if (skipAnywhere.has(name) || (dir === root && skipAtRoot.has(name))) continue;
		const path = join(dir, name);
		const stat = statSync(path);
		if (stat.isDirectory()) yield* markdown(path);
		else if (name.endsWith(".md")) yield path;
	}
}

// Remove fenced code blocks and inline code, keeping line count.
function prose(text) {
	const lines = text.split("\n");
	let fence = null;
	return lines.map((line) => {
		const open = line.match(/^\s*(`{3,}|~{3,})/);
		if (fence) {
			if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
			return "";
		}
		if (open) {
			fence = open[1];
			return "";
		}
		return line.replace(/(`+)[\s\S]*?\1/g, "");
	}).join("\n");
}

// GitHub's heading anchors: lower case, punctuation removed, spaces to hyphens,
// a repeated anchor numbered from -1.
function anchors(path) {
	const found = new Set();
	const seen = new Map();
	for (const line of prose(readFileSync(path, "utf8")).split("\n")) {
		const heading = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
		if (heading) {
			const base = heading[1]
				.replace(/<[^>]*>/g, "")
				.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
				.toLowerCase()
				.replace(/[^\p{L}\p{N}\s_-]/gu, "")
				.replace(/\s/g, "-");
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			found.add(n === 0 ? base : `${base}-${n}`);
		}
		for (const html of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) found.add(html[1]);
	}
	return found;
}

const cache = new Map();
const anchorsOf = (path) => {
	if (!cache.has(path)) cache.set(path, anchors(path));
	return cache.get(path);
};

const failures = [];
let checked = 0;
for (const file of markdown(root)) {
	const lines = prose(readFileSync(file, "utf8")).split("\n");
	lines.forEach((line, index) => {
		const targets = [
			...[...line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
			...[...line.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/g)].map((m) => m[1]),
		];
		for (const target of targets) {
			if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue;
			checked++;
			const [pathPart, anchor] = target.split("#", 2);
			const decoded = decodeURIComponent(pathPart);
			const path = decoded === "" ? file : resolve(dirname(file), decoded);
			const where = `${relative(root, file)}:${index + 1}`;
			if (!existsSync(path)) {
				failures.push(`${where}: no file ${target}`);
				continue;
			}
			if (anchor && path.endsWith(".md") && !anchorsOf(path).has(decodeURIComponent(anchor))) {
				failures.push(`${where}: no heading #${anchor} in ${relative(root, path)}`);
			}
		}
	});
}

for (const failure of failures) console.log(failure);
console.log(`${checked} relative links checked, ${failures.length} broken.`);
process.exitCode = failures.length === 0 ? 0 : 1;
