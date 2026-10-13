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
