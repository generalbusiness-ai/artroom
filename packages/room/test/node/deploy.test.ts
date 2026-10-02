import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { unstable_readConfig } from "wrangler";
import { checkerBinding } from "../../src/config.ts";

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

  it("the spike config (wrangler.spike.jsonc) is the same Worker under its own name, namespaces and URL", () => {
    const spike = read("../../wrangler.spike.jsonc") as Config & { name: string; containers: readonly unknown[] };
    const prod = deploy as Config & { name: string; containers: readonly unknown[] };
    expect(spike.name).toBe("artroom-spike-room");
    expect(spike.vars["ARTIFACTS_NAMESPACE"]).toBe("gitseq-spike");
    expect(spike.vars["PUBLIC_NAMESPACE"]).toBe("gitseq-spike");
    // Public founding in gitseq-spike, imports in gitseq-spike-import (request b6b51de7).
    expect(spike.artifacts).toEqual([
      expect.objectContaining({ binding: "ARTIFACTS", namespace: "gitseq-spike" }),
      expect.objectContaining({ binding: "IMPORT_ARTIFACTS", namespace: "gitseq-spike-import" }),
    ]);
    expect(spike.vars["IMPORT_NAMESPACE"]).toBe("gitseq-spike-import");
    expect(spike.vars["PUBLIC_URL"]).toBe("https://artroom-spike-room.inguz.workers.dev");
    expect(spike.vars["OPERATOR_KEYS"]).toMatch(/^key_[A-Za-z0-9_-]{43}$/);
    expect(spike.vars["ROOM_KEY_SECRET"]).toBeUndefined();
    expect(spike.vars["ARTIFACTS_HOST"]).toBe(prod.vars["ARTIFACTS_HOST"]);
    expect(spike.durable_objects).toEqual(prod.durable_objects);
    expect(spike.migrations).toEqual(prod.migrations);
    // The same image by digest; wrangler names each container application after its Worker.
    const unnamed = (cs: readonly unknown[]) => cs.map((c) => ({ ...(c as object), name: undefined }));
    expect(unnamed(spike.containers)).toEqual(unnamed(prod.containers));
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

  it("9f81f372: the spike checker service (packages/checkers/wrangler.spike.jsonc) is production's under its own name, serving the spike Room's namespaces", () => {
    type Checkers = { name: string; main: string; workers_dev?: boolean; vars: Record<string, string>; secrets?: { required?: string[] }; services?: unknown[]; ai?: unknown; containers: readonly unknown[]; durable_objects: unknown };
    const ck = read("../../../checkers/wrangler.spike.jsonc") as unknown as Checkers;
    const prod = read("../../../checkers/wrangler.jsonc") as unknown as Checkers;
    const room = read("../../wrangler.spike.jsonc");
    expect(ck.name).toBe("artroom-spike-checkers");
    expect(ck.main).toBe(prod.main);
    expect(ck.workers_dev).toBe(false);
    expect(ck.services).toEqual([{ binding: "ROOM", service: "artroom-spike-room" }]);
    expect(ck.vars["ARTIFACTS_NAMESPACES"]!.split(",")).toEqual([room.vars["ARTIFACTS_NAMESPACE"], room.vars["IMPORT_NAMESPACE"]]);
    expect(ck.vars["ARTIFACTS_HOST"]).toBe(room.vars["ARTIFACTS_HOST"]);
    expect(ck.vars["RUNNER_IMAGE"]).toBe(prod.vars["RUNNER_IMAGE"]);
    expect(ck.secrets?.required).toEqual(["CHECKER_KEY"]);
    expect(ck.ai).toEqual(prod.ai);
    expect(ck.durable_objects).toEqual(prod.durable_objects);
    const unnamed = (cs: readonly unknown[]) => cs.map((c) => ({ ...(c as object), name: undefined }));
    expect(unnamed(ck.containers)).toEqual(unnamed(prod.containers));
  });

  it("9f81f372: deploy-spike.sh puts both secrets, then deploys the checker service, then the Room (the order their mutual bindings need)", () => {
    const sh = readFileSync(new URL("../../scripts/deploy-spike.sh", import.meta.url).pathname, "utf8");
    const at = (needle: string) => {
      const i = sh.indexOf(needle);
      expect(i, needle).toBeGreaterThan(0);
      return i;
    };
    const roomSecret = at('secret put ROOM_KEY_SECRET --config "$CONFIG"');
    const checkerSecret = at('jwk | "${WRANGLER[@]}" secret put CHECKER_KEY --config "$CHECKERS_CONFIG"');
    const checkersDeploy = at('deploy --config "$CHECKERS_CONFIG"');
    const roomDeploy = at('deploy --config "$CONFIG"');
    expect(Math.max(roomSecret, checkerSecret)).toBeLessThan(checkersDeploy);
    expect(checkersDeploy).toBeLessThan(roomDeploy);
    // No secret is passed on a command line or read by sourcing the env file.
    expect(sh).not.toMatch(/source |^\. /m);
    expect(sh).not.toMatch(/secret put \S+ .*<<</);
  });

  it("the test pool's config has no remote or container binding", () => {
    expect(test.artifacts ?? []).toEqual([]);
    expect(test.containers ?? []).toEqual([]);
    expect(test.durable_objects.bindings.map((b) => b.name)).toEqual(["ROOMS", "REGISTRY"]);
  });
});
