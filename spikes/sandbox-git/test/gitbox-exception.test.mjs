// Review c20125d6: when the container fails after commit-tree, a land response
// must keep what is already known: the integration commit and the resolved
// expected base. The real GitBox code runs here against a stub container;
// `cloudflare:workers` is replaced with minimal classes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
	resolve(specifier, context, next) {
		if (specifier === "cloudflare:workers") {
			const src = "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" +
				" export class WorkerEntrypoint {}";
			return { url: "data:text/javascript," + encodeURIComponent(src), shortCircuit: true };
		}
		return next(specifier, context);
	},
});
const { GitBox } = await import("../src/index.ts");

const BASE = "1".repeat(40), HEAD = "2".repeat(40), TREE = "3".repeat(40), COMMIT = "4".repeat(40);
const env = { ARTIFACTS_HOST: "test.invalid", ARTIFACTS_NAMESPACE: "ns" };
const enc = (s) => new TextEncoder().encode(s).buffer;

// A running container. `failOn` names the git subcommand whose output throws.
function box(failOn) {
	const calls = [];
	const container = {
		running: true,
		setInactivityTimeout: async () => {},
		interceptOutboundHttps: async () => {},
		exec: async (argv) => {
			calls.push(argv);
			const sub = argv[0] === "git" ? argv[argv.indexOf("-C") >= 0 ? 3 : 1] : argv[0];
			const reply = {
				"rev-parse": `${BASE}\n${HEAD}\n`,
				"merge-tree": `${TREE}\n`,
				"commit-tree": `${COMMIT}\n`,
			}[sub] ?? "";
			return {
				output: async () => {
					if (sub === failOn) throw new Error(`container output lost during ${sub}`);
					return { stdout: enc(reply), stderr: enc(""), exitCode: 0 };
				},
			};
		},
	};
	const state = {
		container,
		blockConcurrencyWhile: (f) => f(),
		exports: { ArtifactsGateway: () => ({}) },
	};
	return { gitbox: new GitBox(state, env), calls };
}

const land = (extra = {}) => ({ op: "land", box: "t", remote: "https://test.invalid/git/ns/repo.git", token: "t",
	base: "main", head: "candidate", ...extra });

test("push output lost after commit-tree: unknown, with the commit and the fetched base", async () => {
	const { gitbox, calls } = box("push");
	const r = await gitbox.op(land());
	assert.ok(calls.some((a) => a.includes("push")), "the push was started");
	assert.equal(r.outcome, "unknown");
	assert.equal(r.landed, false);
	assert.equal(r.commit, COMMIT);
	assert.equal(r.expect, BASE);
});

test("push output lost with an explicit expect: unknown, with the commit and that expect", async () => {
	const { gitbox } = box("push");
	const r = await gitbox.op(land({ expect: BASE }));
	assert.equal(r.outcome, "unknown");
	assert.equal(r.commit, COMMIT);
	assert.equal(r.expect, BASE);
});

test("output lost before the push: error, with no commit", async () => {
	const { gitbox, calls } = box("fetch");
	const r = await gitbox.op(land({ expect: BASE }));
	assert.ok(!calls.some((a) => a.includes("push")), "no push was started");
	assert.equal(r.outcome, "error");
	assert.equal(r.commit, null);
	assert.equal(r.expect, BASE);
});

test("output lost at commit-tree: error; the base is known, the commit is not", async () => {
	const { gitbox } = box("commit-tree");
	const r = await gitbox.op(land());
	assert.equal(r.outcome, "error");
	assert.equal(r.commit, null);
	assert.equal(r.expect, BASE);
});
