import { describe, expect, it } from "vitest";
import { unstable_readConfig } from "wrangler";

/** The deployable Worker config declares what src/config.ts reads, and the test pool's config stays separate. */
interface Config {
  readonly vars: Record<string, string>;
  readonly artifacts?: readonly { binding: string; namespace: string }[];
  readonly containers?: readonly { class_name: string }[];
  readonly durable_objects: { readonly bindings: readonly { name: string; class_name: string }[] };
  readonly migrations: readonly { new_sqlite_classes?: readonly string[] }[];
}

describe("wrangler.jsonc (deploy)", () => {
  const read = (file: string) => unstable_readConfig({ config: new URL(file, import.meta.url).pathname }) as unknown as Config;
  const deploy = read("../../wrangler.jsonc");
  const test = read("../../wrangler.test.jsonc");

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

  it("the test pool's config has no remote or container binding", () => {
    expect(test.artifacts ?? []).toEqual([]);
    expect(test.containers ?? []).toEqual([]);
    expect(test.durable_objects.bindings.map((b) => b.name)).toEqual(["ROOMS", "REGISTRY"]);
  });
});
