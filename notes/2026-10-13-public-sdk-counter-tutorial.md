# Published SDK Counter tutorial preparation

Request `82a401071d275f6ca7bd66941c2054b88e08b779`, promise
`ec79be679eaebec6848b8944c43e6fe0cf238104`.

The cold registry run, original handle 41396, completed with exit 0. It
installed all six exact public packages and ran all five tutorial states
successfully. No tutorial command or install was repeated to update this
record. The exact mixed checkout sample and one changed-head gate also
passed, separately from the cold tutorial.

The original inert preparation and validation index below are retained as
history. They are not a claim that the remaining checks have run.

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

## Original cold-run validation index

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

Hosted Counter, browser, enrollment, speech, and deployed scope duties
remain outside this in-memory tutorial.

## Observed cold registry run

Tested Source: `6a5f4a5d52826f09fa64ea12f8f3b66d3d5d0c11`, tree
`346dbf28747585f57a0e48917c24aec52096065a`.
Fresh reader directory: `/private/tmp/dap-counter-tutorial-82a401-one/my-counter`.
Node: `v26.11.1`. npm: `11.20.0`.

The exact registry install and all five `node run.ts` commands exited 0.
The source and tool guards passed before and after every command. No command
timed out or ended by a signal. Each step's stderr was empty. The installed
package manifests all reported `0.1.0-dev.2`: dap-contract, dap-bytes,
dap-client, dap-derive, dap-platform, and dap-replay, under `@generalbusiness`.
Actual imports of derive/rule and derive/testing succeeded. The public
lockfile is 5,050 bytes, SHA-256
`0c3e02fabcc3ac23031534e613f9534519872399862d5f2bad0edf566409daa7`.

The closed result SHA-256 is
`a86bc99a0f3942d4e36b67475bbc191d61660ff7183852aef41351ca6519be86`.
The scratch run was preserved separately at
`/Users/hughpyle/play/artroom-diagnostics/public-sdk-counter-tutorial-cold-one`.
Its result bytes and original paths are unchanged. This update read only the
closed result and the five named step stdout files, after verifying their
recorded lengths and hashes. No other nested logs were followed.

Each block below is the complete observed stdout for that step. The page's
first two blocks match whole output. Its later three blocks match the
observed suffixes, and the step 4 digest also matches its stated digest.

### Step 1

```text
valid: sha256:5e5920090685d2c61ddd10ee5a7e5637f13c11ea85e48294e9bb6a85e848044e
  item 0, configuration, ready: controller=@rita target=3
```

### Step 2

```text
valid: sha256:1a9565645b890ced4de65761cb7a4cc25ba114a964350f9b26a2a0c7920b0d6b
  item 0, configuration, ready: controller=@rita target=3
@una join: write
@vic join: write
@una join: refused (guard-failed, guards.1)
  item 1, participant, joined: agent=@una
  item 2, participant, joined: agent=@vic
```

### Step 3

```text
valid: sha256:f9c11a1f1dcd6312c2d6e25552698a995c5eaa0db1365f7bc8b8b4ed150a8f70
  item 0, configuration, ready: controller=@rita target=3
@una join: write
@vic join: write
@una join: refused (guard-failed, guards.1)
  item 1, participant, joined: agent=@una
  item 2, participant, joined: agent=@vic
@vic initialize: refused (guard-failed, guards.1)
@rita initialize: write
  item 3, board, paused: controller=@rita target=3 lastNumber=0 serial=0
```

### Step 4

```text
valid: sha256:761d5a92b407842fd304f9e9a4f448811a36bf6f3c9989b046e1e38eb8e7514a
  item 0, configuration, ready: controller=@rita target=3
@una join: write
@vic join: write
@una join: refused (guard-failed, guards.1)
  item 1, participant, joined: agent=@una
  item 2, participant, joined: agent=@vic
@vic initialize: refused (guard-failed, guards.1)
@rita initialize: write
  item 3, board, paused: controller=@rita target=3 lastNumber=0 serial=0
@vic start: refused (guard-failed, guards.1)
@rita start: write
  item 3, board, running: controller=@rita speaker=@una target=3 lastNumber=0 serial=1 number=1 basis=[{"id":1,"member":"@una"},{"id":2,"member":"@vic"}]
```

### Step 5

```text
valid: sha256:761d5a92b407842fd304f9e9a4f448811a36bf6f3c9989b046e1e38eb8e7514a
  item 0, configuration, ready: controller=@rita target=3
@una join: write
@vic join: write
@una join: refused (guard-failed, guards.1)
  item 1, participant, joined: agent=@una
  item 2, participant, joined: agent=@vic
@vic initialize: refused (guard-failed, guards.1)
@rita initialize: write
  item 3, board, paused: controller=@rita target=3 lastNumber=0 serial=0
@vic start: refused (guard-failed, guards.1)
@rita start: write
  item 3, board, running: controller=@rita speaker=@una target=3 lastNumber=0 serial=1 number=1 basis=[{"id":1,"member":"@una"},{"id":2,"member":"@vic"}]
@vic spoken: refused (guard-failed, guards.1)
@una spoken: write
  item 3, board, running: controller=@rita speaker=@vic target=3 lastNumber=1 serial=2 number=2 basis=[{"id":1,"member":"@una"},{"id":2,"member":"@vic"}]
@vic spoken: write
@una spoken: write
  item 3, board, finished: controller=@rita target=3 lastNumber=3 serial=4
8 entries; replay gives the same state: true
```

This update changes only documents. The measured executable source and tests
are unchanged. Independent review and landing remain owed. The tutorial
does not prove browser,
provider, or hosted authorization behaviour.

## Exact checkout sample and ordinary gate

The owning command printed in `docs/write-an-application.md` ran once from
the tutorial checkout at `fdafc051ae2ddc384c5dea940fe469e677993dec`, tree
`6c3dd8ea38809ebeded0326a82b05b2ff7ef2c84`. Original handle 60460 completed
with exit 0 and a passed postguard. It uses the materialized repository
workspace SDK and checkout lane definitions. It is separate from the cold
registry consumer run, which used compiled public packages.

The command's observed stdout is the two-line output already shown on that
page. Its 173 bytes have SHA-256
`a836dc4a28d5999a2a2d63d83a222053d8734c3c266abb847550038b9b481c14`.
Stderr is empty. The closed mixed result is 759 bytes, SHA-256
`a9d8426d1715fbcad72f5657abba49f309c1acdac87fbbaa2ff3399c385ec6b3`.
No second public mixed variant was executed.

One ordinary `npm run gate`, original handle 74421, completed with exit 0
at the same exact head and tree. Whitespace, typecheck, and test phases
passed; 1,042 Vitest cases passed with the two original recorder skips.
The Node groups passed 9 and 55 cases respectively. The postguard passed.
Install was skipped under the reused exact lock and owned dependency view.
The outer command took 123.329872 seconds wall. This is the original whole
command's measured duration on the builder's macOS host, not a sum of phase
times. Machine load and operating-system cache state were not measured.
The closed gate result is 2,985 bytes, SHA-256
`0e9f883c6a8b2f577b836a40b6b7468754b3798ec09836866c7fe59fa6f9aef0`.

The final delivery update changes narrative only. All code and output fences
remain identical to checked `fdafc051ae2ddc384c5dea940fe469e677993dec`.
Executable source, tests, settings, lockfile, and assets also remain exact.
The external correspondence proof names the final commit and tree alongside
the checked head and tree. No cold install, tutorial step, mixed command, or
gate was repeated for this update. Independent review and landing remain open.
