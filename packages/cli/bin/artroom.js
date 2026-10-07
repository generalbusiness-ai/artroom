#!/usr/bin/env node
// The installed CLI owns its pinned TypeScript loader. Resolve it beside this
// launcher, independently of the caller's working directory. No tool is fetched
// or installed when the command runs.
import { spawnSync } from "node:child_process";

const source = new URL("../src/main.ts", import.meta.url).href;
const run = `const { main } = await import(${JSON.stringify(source)}); process.exitCode = await main(process.argv.slice(1));`;
const child = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--disable-warning=DEP0205", "--input-type=module", "--eval", run, "--", ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = child.status ?? 1;
