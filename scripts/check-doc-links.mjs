#!/usr/bin/env node
// Check the relative links of every Markdown file in the repository.
//
// A link fails when its target file does not exist, or when it names a
// heading anchor that the target Markdown file does not have. Links with a
// scheme (https:, mailto:) and absolute paths are not relative and are not
// checked. Fenced code and inline code are not read.
//
// Skipped: node_modules, .git, and every test/ directory, whose Markdown
// files are fixtures. notes/ (with notes/plans/) and spikes/parked/ are history and keep
// their links as written; --history adds notes/plans/ and spikes/parked/ to the check.
//
// A heading's anchor keeps the text of its inline code, with the backticks
// removed, as GitHub's does: "Host `artifacts`" is #host-artifacts.
//
// Usage: node scripts/check-doc-links.mjs [--history] [root]
// Exits 0 when every link resolves, 1 otherwise.
//
// node scripts/check-doc-links.mjs --self-test checks the anchor rules on a
// small fixture in this file, reads no other file, and exits 0 when they hold.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const history = args.includes("--history");
const selfTest = args.includes("--self-test");
const root = resolve(args.find((arg) => !arg.startsWith("--")) ?? new URL("..", import.meta.url).pathname);
const skipAnywhere = new Set(["node_modules", ".git", "test"]);

function* markdown(dir) {
	for (const name of readdirSync(dir)) {
		if (skipAnywhere.has(name)) continue;
		const path = join(dir, name);
		const at = relative(root, path);
		if (at === "notes") {
			// Of notes/, only notes/plans/ is read, and only with --history.
			if (history && existsSync(join(path, "plans"))) yield* markdown(join(path, "plans"));
			continue;
		}
		if (!history && at === "spikes/parked") continue;
		const stat = statSync(path);
		if (stat.isDirectory()) yield* markdown(path);
		else if (name.endsWith(".md")) yield path;
	}
}

// Blank the lines of fenced code blocks, keeping line count.
function outsideFences(text) {
	let fence = null;
	return text.split("\n").map((line) => {
		const open = line.match(/^\s*(`{3,}|~{3,})/);
		if (fence) {
			if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
			return "";
		}
		if (open) {
			fence = open[1];
			return "";
		}
		return line;
	});
}

// The lines where links are read: no fenced code and no inline code.
function prose(text) {
	return outsideFences(text).map((line) => line.replace(/(`+)[\s\S]*?\1/g, "")).join("\n");
}

// GitHub's heading anchors: inline code keeps its text without backticks,
// then lower case, punctuation removed, spaces to hyphens, and a repeated
// anchor numbered from -1.
function anchorsOfText(text) {
	const matched = new Set();
	const seen = new Map();
	for (const line of outsideFences(text)) {
		const heading = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
		if (heading) {
			const base = heading[1]
				.replace(/(`+)([\s\S]*?)\1/g, "$2")
				.replace(/<[^>]*>/g, "")
				.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
				.toLowerCase()
				.replace(/[^\p{L}\p{N}\s_-]/gu, "")
				.replace(/\s/g, "-");
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			matched.add(n === 0 ? base : `${base}-${n}`);
		}
		const html = line.replace(/(`+)[\s\S]*?\1/g, "");
		for (const anchor of html.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) matched.add(anchor[1]);
	}
	return matched;
}

const anchors = (path) => anchorsOfText(readFileSync(path, "utf8"));

if (selfTest) {
	const fixture = [
		"# Host `artifacts`",
		"## Notes",
		"## Notes",
		"## Notes",
		"```",
		"## Not a heading",
		"```",
		"## Use `dap verify --all`",
	].join("\n");
	const expected = ["host-artifacts", "notes", "notes-1", "notes-2", "use-dap-verify---all"];
	const actual = [...anchorsOfText(fixture)];
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`self-test ${ok ? "passed" : "failed"}: ${actual.join(", ")}`);
	process.exit(ok ? 0 : 1);
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
