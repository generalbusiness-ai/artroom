  test("Retained prefix and determinism: 5,000 retained files whose digests share their first two hex characters, and a replay context and a policy document of 20 MiB never published. inputs/ splits by the first group and again by the next, no tree lists more than 4,096 entries, each 20 MiB file is three chunks, verify finds and checks each by its digest; two publishers and a restarted one make the same commit, laid out where the reference functions say; a changed chunk of a retained file is chunk-mismatch", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    // 5,000 replay contexts whose digests all start with "ab".
    const prefixed: Retained[] = [];
    for (let i = 0, s = 0; prefixed.length < 5000; s++) {
      const body = `{"budget":{},"input":{"n":${i},"s":${s}},"kind":"refuse"}`;
      if (sha256Hex(utf8(body)).startsWith("ab")) {
        prefixed.push({ kind: "input", body });
        i++;
        s = -1;
      }
    }
    sim.retained.push(...prefixed);
    await notified(sim, lane!, ["@alice" as MemberId], { pad: "x".repeat(20 * MiB) }); // a 20 MiB replay context
    const big = bigPolicy(20 * MiB);
    sim.activate(big, DEMO_CHECKERS); // a 20 MiB policy document
    await sim.claim(keys.alice, alice, ["docs/**"]); // decided under it
    const sizes = sim.retained.map((r) => utf8(r.body).length);
    expect(sizes.filter((n) => n > 2 * B)).toHaveLength(2);

    const cp = sim.checkpoint(L2(0));
    const git = new MemoryGit();
    git.objectLimit = B;
    const p = new LogPublisher(git);
    const loads = { n: 0 };
    const r = await p.publish(sim.entries, cp, refsInParts(sim.retained, loads));
    expect(loads.n).toBe(0); // read in parts, never loaded whole
    expect(p.stats.peakObjectBytes).toBeLessThan(400_000);
    // Determinism: another publisher, and the same one after a restart.
    expect(new LogPublisher(new MemoryGit()).commitFor(null, sim.entries, cp, sim.retained)).toBe(r.commit);
    const reopened = await LogPublisher.open(git);
    expect(reopened.commitFor(null, sim.entries, cp, refsInParts(sim.retained))).toBe(r.commit);
    expect((await reopened.publish(sim.entries, cp, refsInParts(sim.retained))).commit).toBe(r.commit);

    // Where the reference functions put each file.
    const { files, trees } = await walk(git, r.commit);
    expectSmallTrees(trees);
    const names = (sub: string) => [...new Set(sim.retained.filter((x) => (sub === "inputs") === (x.kind === "input")).map((x) => `${sha256Hex(utf8(x.body))}.json`))];
    for (const sub of ["inputs", "policies"]) {
      const all = names(sub);
      for (const name of all) {
        const dirs = ref.shardsOf(all, name, hexKey, 2);
        const at = [`${ROOT}/${sub}`, ...dirs, name].join("/");
        const size = sizes[sim.retained.findIndex((x) => `${sha256Hex(utf8(x.body))}.json` === name)]!;
        if (size <= B) expect(files.has(at), at).toBe(true);
        else expect([...files.keys()].filter((k) => k.startsWith(`${at}/`)).map((k) => [k.slice(-12), files.get(k)!.length])).toEqual(ref.chunks(size).map((c) => [c.name, c.bytes]));
      }
    }
    const inputDirs = trees.filter((t) => /^artroom-log\/v1\/inputs\/ab\/[0-9a-f]{2}$/.test(t.path));
    expect(inputDirs.length).toBeGreaterThan(200); // inputs/ab/ split again by the next two characters
    expect(trees.find((t) => t.path === `${ROOT}/inputs`)!.names).toContain("ab");

    const report = await verifies(git, sim.entries.length - 1);
    expect(report.decisionsReplayed).toBeGreaterThan(0);

    // A file moved to a sibling shard directory that exists: fan-out, though its bytes and name are right.
    const moved = new MemoryGit();
    for (const [k, v] of git.objects) moved.objects.set(k, v);
    const prefixedPaths = [...files.keys()].filter((k) => /^artroom-log\/v1\/inputs\/ab\/[0-9a-f]{2}\/[0-9a-f]{64}\.json$/.test(k));
    const from = prefixedPaths[0]!;
    const sibling = prefixedPaths.find((k) => k.split("/")[4] !== from.split("/")[4])!.split("/")[4]!;
    await rewrite(moved, r.commit, (f) => {
      f.set(from.replace(/\/ab\/[0-9a-f]{2}\//, `/ab/${sibling}/`), f.get(from)!);
      f.delete(from);
    });
    const misplaced = await verifyLog(moved);
    expect(misplaced.failures.map((x) => x.reason)).toEqual(["fan-out"]);

    // Bad chunk: a changed chunk of the 20 MiB policy document.
    const policyName = `${sha256Hex(utf8(canonicalize(big)))}.json`;
    const chunk = [...files.keys()].find((k) => k.includes(`/policies/`) && k.includes(`${policyName}/`) && k.endsWith("/000000000002"))!;
    await rewrite(git, r.commit, (f) => {
      const d = f.get(chunk)!.slice();
      d[0] = d[0] === 0x78 ? 0x79 : 0x78;
      f.set(chunk, d);
    });
    expect((await verifyLog(git)).failures.map((f) => f.reason)).toContain("chunk-mismatch");
