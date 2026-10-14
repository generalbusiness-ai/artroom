#!/usr/bin/env node
// Runs the bundled CLI when it has been built (the npm package), and the
// TypeScript source otherwise (this repository, Node 22.18 or later).
import { existsSync } from "node:fs";

const built = new URL("../dist/artroom.js", import.meta.url);
const entry = existsSync(built) ? built : new URL("../src/cli.ts", import.meta.url);
const { main } = await import(entry.href);
process.exitCode = await main(process.argv.slice(2));
