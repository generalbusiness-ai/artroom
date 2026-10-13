# Published SDK Counter tutorial preparation

Request `82a401071d275f6ca7bd66941c2054b88e08b779`, promise
`ec79be679eaebec6848b8944c43e6fe0cf238104`.

This is inert Source preparation. No cold install, tutorial command,
compiler, test, gate, network request, or credential read ran here.
The tutorial's current outputs remain expected results, not a newly observed
run. Node 26.11.1 with `node run.ts` and an ESM package configuration is the
proposed reader command until the cold run proves it.

The source base is main `d1b845f837c2b4a8431b5be325b881e0f5c6027b`, tree
`a624aa3b9ceefe6769b26602c08faf31c2957b06`.

## Source changes

The Counter tutorial imports contract, derive, derive/rule, and
derive/testing by their published names. Setup names all six exact public
SDK packages at `0.1.0-dev.2`. The reader writes only `definition.ts` and
`run.ts`. The checkout-only Step 6 is removed. A next-step link identifies
the full Counter as repository source, without adding a clone requirement
to this tutorial.

`docs/testing.md` has no executable relative imports into package source.
Its three dap-scope references do not match the internal artroom-scope
manifest, and its dap-room/testing reference names no current workspace.
They now name artroom-scope and dap-platform/testing respectively. The
platform test export is qualified as checkout-only, not part of the public
SDK. The derive workspace name already matches its manifest.

`docs/write-an-application.md` has two framework imports by relative source
paths. They now name dap-contract and dap-derive. The lane demo import remains
relative and explicitly checkout-only because lanes is not a public SDK
package. Its old printed output is labelled as a historical run before this
substitution. Other source links, pin commands, and application instructions
are unchanged.

## Cold-run validation index — unrun

1. Create one fresh directory outside every checkout. Record its absolute
   path, Node and npm versions, and Source head and tree. Use an owned npm
   cache and empty user and global configuration files. Do not inherit
   credentials, workspace aliases, or `NODE_PATH`.
2. Follow the tutorial's setup there, installing the exact six packages
   from the public npm registry. Retain the public lockfile, complete command
   terminal result, elapsed and CPU time, and bounded stdout and stderr.
   Record each installed package's actual name and version. No local stage,
   tarball, symlink, or repository SDK import can substitute.
3. Extract each TypeScript fence from the page as data. Assemble its five
   successive states using the page's insertion and replacement instructions.
   Keep snapshots of the reader's two files and their hashes outside the
   checkout. Do not introduce a separate definition or test implementation.
4. Run `node run.ts` once at each state. The actual imports must include
   derive/rule and derive/testing. If either export is missing, stop and
   report the result rather than use a workspace or private fixture.
5. Retain the complete printed output and terminal result of each state.
   Compare the full output, including digest and item order, against the
   page. Replace every output block with the corresponding observed lines.
   For steps showing only new lines, retain the full observed output and
   identify that suffix explicitly. Record the installed package version and
   actual Node version in the page after the run.
6. Check the mixed checkout validation command in write-an-application
   separately if its new import substitution is retained. Preserve the
   checkout-only lane-source qualification and original historical output.
7. After any justified repair, complete only the failed or unrun work.
   Retain original failures. Run one ordinary changed-head gate before Source
   review, with the reviewed dependency view and its normal guards.
8. Deliver the observed scratch path, versions, each step's output, original
   terminal results, and gate proof. Seek normal independent review and
   landing of the original tutorial request. SDK publication evidence alone
   cannot satisfy this tutorial's cold consumer criterion.

No observed run is recorded yet. Hosted Counter, browser, enrollment,
speech, and deployed scope duties remain outside this in-memory tutorial.
