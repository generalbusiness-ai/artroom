# Name the physical CLI launcher dap.js

Request `a5ef601d2e42f292f28a0138e9f1f901bc90f573`, promise
`c098e3725be2ca433c545aed11c9b2e397b8eaa2`, follows the Logo landing on
`6afbb5b53dd6950f537b4a8aab4421b7b926209a`.

`packages/cli/bin/artroom.js` moves to `packages/cli/bin/dap.js`, with its
contents and executable mode unchanged. Both installed names, `dap` and
`artroom`, map to the new file. The workspace manifest and its lock entry
change those two bin targets only. External dependencies, versions, and
workspace identities remain unchanged.

The CLI guide, self-host guide, and CLI README name the new physical path.
The self-host guide keeps its recorded commands and run notes, and removes
the confusing physical-filename explanation. Existing CLI file and MCP
stdio tests follow the renamed launcher. Their behavior is unchanged.
The inactive release guide explicitly names the parked CLI bundle
`dist/artroom.js`, which the unchanged parked build actually produces.
No dated historical note or parked file changes.

The literal filename check, `git grep -n -F artroom.js -- packages docs
homepage examples`, leaves only the two parked-build references in
`docs/release.md`. The unescaped regex `artroom.js` also matches the
unchanged `artroom-jsonata-v1` protocol tag. Those matches are not physical
filename references and are outside this rename.

Owning checks and the required ordinary gate are UNRUN at this Source
preparation. Root must first review the held fresh namespace and check
plans. The new lock stamp and both bin links must follow `dap.js` before
the gate, so the gate does not install dependencies unexpectedly.
No dependency install, runtime probe, provider operation, or credential
access occurred. Exact-head checker review and landing remain pending.


## Composition onto the MCP discovery landing

The rename is composed onto actual clean main
`8235c6b39da464dc076a094cd7f71d2bdb71a2bc`, tree
`833812fc0fb21a89bc1b698bdb7ff7ce468801cf`, in a new isolated worktree.
The receiving MCP discovery changes remain intact. This Source composition
has not run owning checks or a gate; validation of the earlier head does
not transfer to it.

The earlier head `49d80bbb2b8349b6dbd71fae73e1221b1aad280a` retains its
original failed gate `67717`: whitespace and typecheck passed, and Vitest
reported 1139 passed, two native five-second timeouts, and three original
skips. That gate remains failed. A later bounded completion `83302` passed
those two unchanged native cases in one body of 4.156613 seconds, with
postguard passing. It did not retry the whole gate or change deadlines.

The separate downstream completion `90673` then ran only the two commands
that the failed gate had left unrun. The Node command passed all 10 tests
in 1.514551 seconds; the normal Counter test command passed all 55 tests
in 2.175904 seconds. Both children exited zero, with no failures, skips,
cancellations or pending tests, and the final postguard passed. These
separate completions qualify the earlier failed gate; they do not make it
a passed gate or validate this new composition. The Counter command kept
its normal temporary test compilation and produced no public assets.


## Checked joint Source

The preparation statements above describe earlier heads. The final executable
Source is `2dab21e5ecfd531aa7fe68382ef7606908d6d148`, tree
`6d90c282903acc7fc9ba0cb14673796676e88ee0`. It combines this launcher rename
with the separately tracked invitation URL request on actual receiving main
`27bb745f0012ce5994ea983ae1bd51e9e3ad17f8`. Receiving MCP discovery and the
landed delivery notes remain intact. Each request keeps its own promise.

Both aliases resolve to `packages/cli/bin/dap.js` in the fresh, private
13-workspace dependency namespace. Its 5,498 files and 229 external lock
entries were verified. No dependency was installed. The launcher contents,
mode, protocol names, and parked release files remain unchanged.

Every original stop remains recorded:

| Source | Original run | Outcome and correction |
| --- | --- | --- |
| `8f221266` | 22781 | First CLI case failed because it imported `command` from the wrong module. Later phases were unrun. |
| `c9f8a0a7` | 89172 | First CLI case expected exit 1 for a usage refusal whose existing contract is exit 2. Later phases were unrun. |
| `ccf6ebf2` | 45776 | CLI and tagged-client cases passed. MCP expected an internal field in its public error response and failed. The control was unrun. |
| `bbb858bb` | 81540 and 43997 | MCP baseline passed and its control failed by assertion as required. The gate then failed typecheck on an unused import and two incomplete test ports. All gate tests were unrun. |
| `8646f800` | 80222 | Typecheck failed because the CLI fixture widened its literal types. All gate tests were unrun. |
| `1840d3f9` | 12338 and 11523 | The selected CLI test compiler passed. The gate passed whitespace and typecheck, then reported 1,144 Vitest passes, one stale Page asset failure, and three skips. Downstream commands were unrun. |
| `2dab21e5` | 56019 and 29384 | The generated asset successor passed its owning asset case, Node 10, Counter 55, and the final ordinary gate. |

The normal Page producer ran once as 7424 on `1840d3f9`, before the generated
successor was committed. Only `packages/scope/src/page-assets.ts` changed in
that commit. The public script and embedded script match. HTML, inline CSS,
Brand assets, and all other Source stayed unchanged. No public host was
updated by this build.

The final gate, 29384, exited zero with its postguard passing in 153.640
seconds of measured wall time. Whitespace, typecheck, and test phases passed.
Vitest reported 1,145 passed cases and three original skips across 210 passed
files and one skipped file. The chained Node and Counter commands passed
10 and 55 tests. Installation was skipped. These counts belong to this
original gate, not a sum of earlier runs. The three skips remain unrun.

The earlier rename-only gate 1467 remains failed: its Counter child was
stopped with SIGTERM after the observed stall. The bounded diagnostic did
not reproduce the stall, and the separate original client-file completion
passed nine cases. Neither result establishes the stall's cause or turns
that old gate green. The user's instruction to mark the issue-close refusal
nrep remains unchanged; this work does not reopen it.

Closed proof references are machine-independent basenames and hashes:
`producer-one/public-result.json`, SHA-256
`356747f755480ccc5391bdb4d7eb67bf2a4b726215dba401c9974b57911bf4f8`;
`completion-one/public-result.json`, SHA-256
`d13e53e7cbc62723b7e3740e0296b47e8cfd20cbcb494f69ce37cbc30ee80339`;
and `gate-one/result.public.json`, SHA-256
`f3cd1ed0fb40958960817f6ded9e2b55bfaf915040dd9cd3531323b83453e53c`.
The checker packet lists the exact direct files for the complete lineage.
These appended delivery records change prose only. Their final head retains
the checked executable Source exactly. Review and normal landing are pending.
