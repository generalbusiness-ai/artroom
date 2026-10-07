#!/usr/bin/env -S node --experimental-transform-types --no-warnings
// Runs the command from its TypeScript source, in this repository. The client package has
// TypeScript parameter properties, which need the transform, not only the stripping of types.
import { main } from "../src/main.ts";

process.exitCode = await main(process.argv.slice(2));
