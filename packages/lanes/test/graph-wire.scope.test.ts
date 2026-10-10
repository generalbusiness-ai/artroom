import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import { canonicalize, definitionDigest, textDigest } from "@generalbusiness/artroom-bytes";
import { httpTransport } from "@generalbusiness/artroom-client";
import { DIGESTS } from "../src/index.ts";
import { graph, officeDefinition, README, reader, transport } from "./support/graph.ts";

// One dedicated wire founding combination: real SELF HTTP/client transport,
// native NET scopes/storage/dispatch; office data/readers/authority and peers
// remain the graph fixture's labelled stand-ins. No real Git provider.
test("HTTP office founding retains detached README and both declarations, then confirms issue and change children", async () => {
  let crossings = 0;
  const statuses: number[] = [];
  const wire = httpTransport("https://scopes.test", { fetch: async (url, init) => {
    crossings++;
    const response = await SELF.fetch(url, init);
    statuses.push(response.status);
    return response;
  } });
  const g = await graph(wire);
  expect([crossings, statuses]).toEqual([1, [201]]);
  expect(await g.office.handle.scope.text(textDigest(README))).toMatchObject({ ok: true, value: README, complete: true });
  const own = await g.office.entry(0);
  expect(own.input).toMatchObject({ type: "genesis", seed: { definition: definitionDigest(officeDefinition) } });
  const issue = await g.goal(); const change = await g.change();
  for (const [node, digest] of [[issue, DIGESTS.issue], [change, DIGESTS.change]] as const) {
    const state = await transport.summary(node.name, reader);
    expect(state).toMatchObject({ ok: true, complete: true, value: { status: "active", definition: digest } });
    if (!state.ok) throw new Error("The native child could not be read");
    expect(canonicalize(state.value.scope)).toBe(canonicalize(node.at));
    const entry = await node.entry(0);
    expect(entry.input).toMatchObject({ type: "genesis", decision: "applied", seed: { definition: digest, creator: g.office.at } });
  }
  // Only founding crosses SELF; ordinary child creation and reads remain real api.
  expect(crossings).toBe(1);
});
