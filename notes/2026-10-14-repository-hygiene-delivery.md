# Repository hygiene delivery

Request: `dc706047d1486b8a6ba542a87f98ad0b36fe20d2`.
Builder promise: `f4a5cfd065cf9b78b0fc3d44beb26d8a1afe5a2c`.
Both use the workroom prefix
`git:sha1:589bca982736a2361d15d53f7572375ef2f7aaf3#git:sha1:`.

This candidate adds runtime dependency attributions to [NOTICE](../NOTICE),
moves the inactive archive to [spikes/parked](../spikes/parked/README.md),
and dates six early notes by their first addition to Git. It removes the
twelve `.keep-i5-*` placeholders and `notes/.gitkeep`. Active references and
the archive checks follow the new paths. Runtime code, dependency manifests
and the package lock are unchanged.

## License coverage

The inventory starts with the runtime dependencies of all thirteen workspace
manifests. Their four external dependencies are `@noble/curves@2.4.0`,
`@noble/hashes@2.4.0`, `jsonata@2.2.2` and `tsx@4.21.0`. Each internal
workspace uses the project's Apache-2.0 license.

`license-checker-rseidelsohn@4.4.2` was installed and run only in
`/tmp/artroom-license-dc706`. A direct workspace scan missed the hoisted
dependencies; its incomplete result was retained and was not used for NOTICE.
The complete scan used a physical scratch copy of the union of runtime
dependencies, following each package's actual nested resolution. The source
manifests and lock matched the read-only dependency donor exactly.

The complete scan found nine installed runtime packages, all MIT. The
inventory also checked every optional esbuild platform package against its
exact lock entry: 34 external runtime package names in total, including all
26 optional platforms. `tsx` uses nested esbuild 0.27.7; the root's development
esbuild 0.28.1 and other development tools are excluded.

NOTICE groups the MIT packages and retains the permission and warranty text.
Where the scanner omitted copyright text, it uses the shipped JSONata IBM
headers and esbuild's parent LICENSE for its platform binaries. The original
scan, runtime closure and optional-platform inventory remain separate evidence.

## File and link checks

All 326 archive files, including its README, have the same SHA256 as before
the move. Each renamed note also retains its exact bytes:

| Original note | Dated note |
| --- | --- |
| amendment4-log.md | [2026-10-02-amendment4-log.md](2026-10-02-amendment4-log.md) |
| deploy-spike.md | [2026-10-01-deploy-spike.md](2026-10-01-deploy-spike.md) |
| laneF-carry.md | [2026-10-01-laneF-carry.md](2026-10-01-laneF-carry.md) |
| laneL-carry.md | [2026-10-01-laneL-carry.md](2026-10-01-laneL-carry.md) |
| log-bounded.md | [2026-10-01-log-bounded.md](2026-10-01-log-bounded.md) |
| mcp-stage0.md | [2026-10-02-mcp-stage0.md](2026-10-02-mcp-stage0.md) |

The worker reports these original focused checks on the implementation bytes
later committed as `70f1cb899edc0402cc2b540e7f7a42470d854cf9`. These are
reported outcomes, with no independent sealed claim of the exact start head:

- `node --test scripts/active-source.test.mjs`: seven passed, none failed.
- `node scripts/check-doc-links.mjs`: 285 relative links, none broken.
- `node scripts/check-doc-links.mjs --self-test`: passed.
- `git diff --check` and the byte/path audit: passed.

The default link checker continues to exclude the inactive archive and history
notes and plans. Archive payloads deliberately retain their historical text;
these results do not assert that archive links resolve or its code runs.
The separate `--history` mode still includes the archive.

## Gate preparation

The isolated candidate includes actual landed main
`5e11ca0300cc0a538f7c59b36d490f5cf14be15f`. The merge commit
`629f7af54870d12e55be997016b06d396e6f1da5` retained the implementation tree
`3f6d6f08b34f61df8dfc9cdef7db3c1ee315b943` before this delivery note.

An independent physical dependency namespace was copied from the read-only
publication composition worktree after equality checks on the root manifest,
lock and thirteen workspace manifests. The reviewed materializer verified
5,498 files, mapped all thirteen workspace and eighteen executable aliases
locally, and created private empty Vite cache directories. It preserved the
donor's bytes, modes, ownership and inode identities. No package was installed,
and no application module was imported during preparation.

Root ran the single ordinary `npm run gate` required by
[docs/testing.md](../docs/testing.md) at commit
`09ed389510971df71adc50f62ecc35a9fd2f978c`, tree
`febf9114cc6d8fb78365b46b5be2e68a4c5c4500`. The public result records exit 0
and 206.007 seconds elapsed. Whitespace, typecheck and test each exited 0;
Vitest passed 1,195 cases and skipped three, and the two Node groups passed
ten and 55 cases. Installation was skipped and the postguard passed.

The result follows the recorded scoped Source review. It does not claim that
Root read every candidate file in full. The byte checks for all archive files
and renamed note bodies are program verification, distinct from human body
reads. This gate summary comes from the retained public result; private raw
logs were not read for this note update. This successor changes only the note;
Source and tests are otherwise unchanged. The gate is not repeated for it.
Final review, filing and landing remain with Root.
