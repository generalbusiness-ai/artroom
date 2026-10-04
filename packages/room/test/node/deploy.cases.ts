import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkerBinding } from "../../src/config.ts";
import { readJsonc, stripJsonc } from "./jsonc.ts";

/**
 * The deployable Worker config declares what src/config.ts reads. These
 * cases hold what the source and a config must agree on. They do not repeat
 * a config's own values, or compare the spike's files with production's.
 */
interface Config {
  readonly vars: Record<string, string>;
  readonly artifacts?: readonly { binding: string; namespace: string }[];
  readonly containers?: readonly { class_name: string }[];
  readonly durable_objects: { readonly bindings: readonly { name: string; class_name: string }[] };
  readonly migrations: readonly { new_sqlite_classes?: readonly string[] }[];
}

describe("wrangler.jsonc (deploy)", () => {
  const read = (file: string) => readJsonc<Config>(file, import.meta.url);
  const deploy = read("../../wrangler.jsonc");

  it("the reader takes comments and trailing commas out, and leaves strings alone", () => {
    expect(JSON.parse(stripJsonc('// one\n{ "a": "x // y", /* two */ "b": [1, 2,], "c": "/* z */", }'))).toEqual({ a: "x // y", b: [1, 2], c: "/* z */" });
  });

  it("binds Artifacts for ARTIFACTS_NAMESPACE, and the publisher sandbox as a container Durable Object", () => {
    const vars = deploy.vars;
    expect(deploy.artifacts).toEqual([expect.objectContaining({ binding: "ARTIFACTS", namespace: vars["ARTIFACTS_NAMESPACE"] })]);
    expect(vars["ARTIFACTS_NAMESPACE"]).toBe(vars["PUBLIC_NAMESPACE"]);
    expect(vars["ARTIFACTS_HOST"]).toMatch(/\.artifacts\.cloudflare\.net$/);
    expect(deploy.durable_objects.bindings.map((b) => [b.name, b.class_name])).toEqual([
      ["ROOMS", "Room"],
      ["REGISTRY", "Registry"],
      ["PUBLISHER", "Publisher"],
    ]);
    expect(deploy.containers?.map((c) => c.class_name)).toEqual(["Publisher"]);
    expect(deploy.migrations.flatMap((m) => m.new_sqlite_classes ?? [])).toEqual(["Room", "Registry", "Publisher"]);
  });

  it("8bd623cc: no config sets PIN_DELAY_MS; only an explicit measurement step on the spike does (assert 66a41558)", () => {
    for (const file of ["../../wrangler.jsonc", "../../wrangler.spike.jsonc", "../../wrangler.test.jsonc"]) expect(read(file).vars["PIN_DELAY_MS"], file).toBeUndefined();
  });

  it("9f81f372: the spike Room binds each lane G checker as CHECKER_<NAME>, to an entrypoint artroom-spike-checkers exports", () => {
    const spike = read("../../wrangler.spike.jsonc") as Config & { services?: readonly { binding: string; service: string; entrypoint?: string }[] };
    const worker = readFileSync(new URL("../../../checkers/src/worker.ts", import.meta.url).pathname, "utf8");
    // The checker names lane G's service runs, from its own table.
    const names = [...(/export const CHECKERS = \{([^}]*)\}/.exec(worker)?.[1] ?? "").matchAll(/"?([a-z][a-z0-9-]*)"?:/g)].map((m) => m[1]!);
    expect(names).toEqual(["tests", "types", "llm-review"]);
    const entrypoints: Record<string, string> = { tests: "TestsCheckerService", types: "TypesCheckerService", "llm-review": "LlmReviewService" };
    expect(spike.services).toEqual(names.map((n) => ({ binding: checkerBinding(n), service: "artroom-spike-checkers", entrypoint: entrypoints[n] })));
    for (const e of Object.values(entrypoints)) expect(worker).toMatch(new RegExp(`export class ${e} extends`));
  });

});
