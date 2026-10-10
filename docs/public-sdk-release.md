# Producing the public SDK

This is the active six-package producer boundary. It builds and inspects
JavaScript and declarations for contract, bytes, client, derive, platform and replay. It does
not publish, install application packages, configure accounts or deploy a
service. The earlier release guide is historical and inactive.

The six-package amendment is request `fecf7160fd4a8c4b9219d7713a11036ff48db85e`,
promise `ffae23e0f56d0a17d773264588f98940f04cd963`. It follows the public
verifier handoff reported in `008c3cfd35443d23c44ad13a64af867282aee2c8`.
Its source, capture, producer, checker, browser bundle and gate outcomes are
unrun at this source delivery. Frozen four-package attempts remain separate.

The source-authoring request is `23e6d5e8e2773f11c2271f86d3c1cbf019dd5cf0`,
promise `a01fe0506ee046908c7a9d97c18df388223c02a0`, under public-release
request `7b31f843fac3bcc5f64b0b5caaad72f1f8191082`. Source authoring alone
establishes no successful build or public consumer. All new checks remain
unrun at this delivery.

Run only after the exact producer source and tool view are reviewed and its
execution is released. Use a clean checkout and a fresh absolute staging
path outside it. Its canonical physical parent must already exist; on this
macOS host `/private/tmp` is canonical, while `/tmp` is a symlink. Tools come from the reviewed existing lock and a prepared
view; never install a tool in a checkout. The npm CLI argument names the
actual pinned npm `bin/npm-cli.js`, not a shell wrapper. Supply its exact
reviewed version. Commands below are execution recipes, not recorded runs.

```
node scripts/public-release.mjs --source /absolute/clean/checkout --head <full-commit> --version <reviewed-version> --output /private/tmp/fresh-sdk-stage --npm-cli /absolute/npm/bin/npm-cli.js --npm-version <exact-npm-version>
node scripts/check-public-release.mjs --manifest /private/tmp/fresh-sdk-stage/release-manifest.json --native-capture /private/tmp/reviewed-native-capture.json --native-capture-sha256 <reviewed-SHA256> --esbuild /absolute/pinned-native-esbuild/bin/esbuild --esbuild-sha256 <reviewed-SHA256>
```

The proposed coordinated version `0.1.0-dev.2` is conditional. It is neither
reserved nor an adopted public version. Publisher identity, npm namespace
rights and that exact version's availability must be established before a
separately authorized publication. Source workspace versions and lockfile
remain unchanged. The producer parameter changes only staged manifests and
their exact internal dependencies.

The producer copies tracked inputs to an owned external build root and
verifies their bytes. Every package compiles from its actual copied source
ancestry. That root contains copied, pinned third-party dependencies and
only the preceding completed Artroom JavaScript/declaration stages. There
are no source-workspace aliases or Artroom fallback links. Compiler file
lists are confined to the owned inputs/stages/dependencies and the exact
pinned compiler wrapper and native package directories, including the native
package's standard libraries. No whole-cache root is allowed. Before each
package emits, a resolution-only `--listFilesOnly --noEmit` pass checks the
actual canonical input paths and records their hashes. One emission follows;
its file set and input hashes must match that preflight. Consumer `noEmit`
checks keep their single pass. Source HEAD, clean state and copied bytes are
checked again before the release manifest is sealed.

Build order is contract, bytes, client, derive, platform, replay. TypeScript 7.0.2 emits ES2022
ESM plus declarations without maps. Relative JavaScript extensions are
rewritten by the compiler. Relative declaration module specifiers are
converted to `.js` where needed and checked against real `.d.ts` files in
the same stage. The manifest records each such declaration rewrite. Neither
an extension flag nor a source typecheck proves declaration closure.

Platform publishes only its production root. The source manifest's exact
`./testing` export is accounted for but excluded; an extra source export still
refuses. Replay publishes its existing portable library and pure command
function. Its Node process wrapper `src/bin.ts` is copied only into an
excluded evidence directory, hashed, and omitted from compiler ancestry and
public output. This release supplies no `artroom-replay` executable. The checker
compares the complete included source inventory and that one exclusion. Both
packages depend on the coordinated contract, bytes and derive stages. Their
input compilation uses the opt-in bytes/web declaration, as client and derive
do; it does not inject default consumer globals or broad Node/DOM types.

Exports have `types` before JavaScript `default`. bytes/web remains a
**types-only, opt-in ambient declaration**, with no exported types or
runtime module. It is tested separately without Node or DOM ambient types.
Do not inject it into ordinary consumer defaults. The client's narrow
WebCrypto declaration is used to compile its input; it is not injected into
a published consumer's default globals. Normal NodeNext and browser-bundler
type checks use their own environments, with `skipLibCheck: false`.

derive/rule supplies `RULE_PROFILES` for the real restricted-rule validator
and pins jsonata 2.2.2 plus its existing engine fingerprint. The default
validator profile table does not check rule syntax. Use
`validateDefinition(value, bounds, RULE_PROFILES)` for declared input,
without `platform: true`. This local result does not grant authority or
prove that a deployed runtime supplies every capability, closure input or
platform rule. No production or protocol semantics change here.

derive/testing preserves the existing compiled fixture export. It uses
fixed keys, manufactured grants and in-memory scopes; it is not a native
membership or private Worker test SDK. The producer includes only that
explicit fixture and its production-code closure, not unrelated tests.
Package README files retain their source history; the release manifest and
this guide qualify this producer's current boundary. Historical README
statements are not an assertion of current hosted support.

Each stage contains its manifest, dist, README, LICENSE and NOTICE. Packing
is offline with scripts disabled, an owned npm cache and separate empty
owned user/global npm configuration files. It performs no registry query. The manifest records
source/tree/lock/tool/input/dependency/file identities, tarball length,
SHA256 and SHA512 integrity. The checker compares actual tarball contents
with every staged file. It then runs one coherent real compiled-output
journey through bytes, signing, client shaping, declaration/rule validation
and the actual engine, and checks NodeNext, bundler and opt-in ambient
resolution. It neither loads raw SDK TypeScript nor installs tarballs.
It records a separate check result; producer output alone is not a pass.

The same compiled-output journey now replays a separately reviewed public
native-history capture with proven grants, a known target head and a foreign
fact. It compares target identity, full target coverage, verified foreign
dependencies and trust labels, including exact agreement with the capture's
retained native report. Missing dependencies and authority, anchor or target-head
trust must be absent explicitly; consistency alone is not used to infer that.
Removing the directory source must give the
exact missing-dependency fact; no anchor or test-authority grant is substituted.
The capture's original and owned copy are bound to the supplied SHA-256 and
remain unchanged through the checker. Actual replay reports are kept in its
result, including coverage, trusts and the negative outcome.

The capture comes from the existing `founding-real.test.ts` first rules
publication, before scripted lane facts. Select that whole file alone with
the existing `DEMO_RECORD=1` flag in the reviewed native capture plan. The
opt-in block wraps the actual HTTP history and retained-input source and keeps
only complete prefixes the successful native replay covered. It emits numbered
`PUBLIC-SDK-NATIVE-CAPTURE` base64url chunks and a terminal marker, following the
existing verbose recorder's raw-line framing. Only ASCII is chunked, so native
UTF-8 characters cannot be damaged at a boundary. The owner extracts only
that explicitly public channel into a fresh external file and seals its bytes
with the exact tested source, target and native run proof before checker use.
The ordinary gate leaves recording off. No private log body becomes public
because it contains this channel.

The captured directory genesis and summary must match the exact `DIRECTORY`
pin. A retained entry's `under` states `platformName(DIRECTORY)`, preserving
the platform prefix and omitting the version; its digest and canonical bytes
remain exact. The first body attempt's mistaken bare name was retained as a
capture assertion failure; its positive native replay ran before that failure
and no capture was emitted.

The block rejects the entire capture before any marker if decoded canonical
entries or retained inputs contain credential fields, or if its text contains
known fixture secrets or the current session secret/header. It never redacts
hashed bytes. Public keys and signatures remain. The fixture's real Durable
Objects, SQLite, platform rules and membership authority are labeled, along
with the stand-in Git host, clock/transport and test-secret read provisioning.
This is a recorded local native fixture, not a deployed service or Jam proof.

After the three strict contexts, the checker uses the supplied physical native
esbuild 0.28.1 binary and reviewed SHA-256 to bundle the same compiled replay
journey for the browser. Its bounded metafile must show only the owned journey,
compiled stages and copied exact dependencies, including actual replay and
platform code, with no external modules. The binary is checked before and
after use. This is a real browser closure build; it does not prove browser
execution, public installation or physical sound.

The first complete six-package stage built and packed all six packages, and
its checker reached consistent compiled replay, the exact missing-directory
control, all three strict contexts and the browser build. It then refused
JSONata's synthetic `<runtime>` input edge. The pinned esbuild 0.28.1 parser
inserts that already-resolved helper import; this edge is not a module left
in the output. The successor accepts only its exact path/kind/three-field
shape on the byte-bound copied JSONata input. Every other external input,
every external output import and every emitted module reference still
refuses. The earlier stage and refusal stay immutable; this source delivery
does not claim a successful successor checker.

The public platform catalog must match every selected target and foreign
genesis pin. Main f722 supports the explicit F1 register5/directory5/membership4
cohort, not Counting register6/directory6/membership5. If Jam selects later
versions, publish matching reviewed platform code first. Do not infer a cohort
from `NEWEST`. Supply the actual `hold@1`/`git-read@1` code as both capabilities
and owners where needed, with the deployed parameters; absent versions or
owners remain unsupported. The verifier's mode, coverage, foreign facts,
redactions, limits, incomplete outcomes and external-world trusts remain intact.

Later verification must still include the affected source/compiler checks,
one build/output check and one changed-head normal gate before independent
review. Do not repeat platform permutations. On failure retain the owned
stage and diagnostics, fix source and review the new subject; no implicit
retry, deadline widening or publication follows.

The release owner assembles and verifies source/artifacts. A separately
verified namespace administrator/publisher controls publication. A deployed
operator controls the HTTPS URL, version, bindings, migration and real
membership/definition/read provisioning. GitHub App authority does not
establish npm publishing rights. Publishing six packages is not atomic;
complete the set and verify all public versions/integrities before calling
it an available coordinated release.

Jam and starter consumers must install exact **published registry packages**
with a public lockfile and use a real deployed URL. Producer stages or local
tarballs cannot substitute. The later isolated public consumer must prove
Node loading, strict NodeNext/bundler declarations, browser bundling and
actual browser execution without repository aliases/private SDK. A single
provisioned external smoke must preserve independent source/log read
custody, two-actor conflict, exact durable context-qualified retry and one
actual supported Jam interaction. C1/IA and C4/I5 keep their own storage
adapter ownership. The one-singer J0 amendment is effective; no obsolete
second-singer requirement is introduced here.

N3's current-model design/adoption, publisher/operator availability, cold
outsider commands/help/cost, public verifier support, native authorization,
read custody, durable adapters, browser hosting and local-versus-hosted
fidelity remain separately owned and open. Browser cross-origin access is
not established by packaging. This producer adds no CORS, grant, hosting,
onboarding or universal durable-outbox protocol.

## Module-reference Source repair

Request `0c3828a0ca7b50dda540dc1c9023950c03b72668` rests on Artroom
promise `git:sha1:589bca982736a2361d15d53f7572375ef2f7aaf3#git:sha1:4291f1e6caa20c865f5c2c983418c408b9d65895`. The original one-run
`5e1f` producer failed before compiler/pack; its generic diagnostic did not
name the specific refusal. Static inspection and the retained lexical
reproduction locate false module references in quoted `from` capability
data. The failed attempt and its partial stage remain immutable.

The producer and output checker now share an internal token/span reader.
It recognizes literal import/export/type/dynamic module references without
reading data strings or comments as module clauses. Declaration rewriting
uses only those literal offsets, leaving other bytes unchanged. Unsupported
computed module forms refuse explicitly. No parser dependency, SDK source,
manifest, lockfile or compiler ancestry guard changed. This source-specific
reader is not a JavaScript evaluator or general code-security boundary.

One coherent own Node witness uses the actual capability data, genuine
module clauses and an owned declaration rewrite/refusal journey:

```
node --test scripts/public-release-modules.test.mjs
```

The case, syntax checks, new-head producer and output checker are all
unrun at that Source delivery. A later guarded `c4bd` attempt passed the
one reader case, then compiled and packed contract, bytes and client. Derive
emission failed with `TS2304: Cannot find name 'structuredClone'` in its
exported testing fixture. Its resolution-only pass was not semantic type
acceptance. The complete checker was never dispatched; all three packs and
derive's partial output remain unvalidated local artifacts. Neither failed
attempt may be retried or reused as a completed release.

## Fixture clone type boundary

Repair request `0da42a1126c471750cec1ccaf3adf17f4c94ee7c` rests on promise
`git:sha1:589bca982736a2361d15d53f7572375ef2f7aaf3#git:sha1:1694fa7a6b5005d72c3085c1ca037a4a21cc49ec`.
Planner adopted the module-local boundary in
`git:sha1:589bca982736a2361d15d53f7572375ef2f7aaf3#git:sha1:5bdb4183391917025edeb8c9b23786e625034360`.
The existing testing fixture now declares only its native one-argument clone
of `DeclaredDefinition`, privately inside the same module. It supplies no
implementation, polyfill or replacement clone semantics. It adds no global
augmentation or public clone API. Manifests, exports, lock, bytes/web and
compiler options/ancestry remain unchanged.

The complete checker now inspects actual emitted fixture JavaScript and
declarations for the existing native call, erased private declaration and
unchanged exported `variant` signature. Its existing compiled-output journey
calls the real compiled helper, changes a nested cloned value and checks
that the original small fixture retains exactly its canonical bytes.

All repaired-head imports, cases, compilers, packing and complete output
checks were unrun at that Source delivery. A later exact `7695` attempt
passed the reader case and all four packages' resolution, emission and
offline packing, and sealed its producer manifest. The checker passed its
archive and emitted fixture ABI guards, then the compiled journey failed:
the clone witness narrowed the text slot to 39 while write/edit fields
still admitted 200. The actual validator refused both assignments. The
journey failed before any of the three strict consumer contexts were
dispatched.

The successor changes only the witness's nested slot maximum and expected
value to 201. This preserves assignment from the original 200-byte fields
and stays inside the declared text bound. The real clone/name mutation and
original canonical-byte preservation assertions remain. All successor
checks remain unrun; the frozen failed attempt and its output stay intact.
A future attempt needs its own exact reviewed source, fresh owned stage
and release. One changed-head gate and normal independent review are still
owed before landing; no public publication follows.

## Six-package validation outcome

The checked source is `f1a5a434f595ef37ada7a0cbde518f87d1f430ba`, tree
`44da261079aba5428721bd1be04fb12a080d3625`. Original gate handle 90198
completed with exit 0: whitespace, typecheck and tests passed; 1,005 Vitest
cases passed with the two original recorder skips, followed by eight passing
Node cases. Install was skipped under the exact existing lock. Whole time was
89.66 seconds wall and 144.59 seconds CPU on this machine. These figures are
not a global speedup, physical-drain or deployed acceptance claim.

Earlier native capture attempts remain separate: the first passed the one
Node case and Scope test compiler, then failed collection on a temporary alias;
the second refused mismatched temporary config metadata before any phase;
the third reached consistent native replay, then failed the retained input's
mistaken bare definition-name assertion without exporting a capture. The
corrected capture's handle 93455 passed the affected compiler and whole native
founding case. Its public canonical capture is 96,949 bytes, SHA-256
`f01d6a82fb57f72bceb8160b9f0bf6f3a8b32a443bbf87a112b044efbd190833`:
five complete prefixes, 18 entries, 12 retained inputs and 11 verified foreign
facts, with no anchors, missing dependencies or redactions. The complete
report retains every clock, source-head, delivery, observation, outside-host,
bounds and exact platform-code trust. It is a labeled local native fixture.

The first producer stopped at the missing platform README after four packs;
the second built all six packs but its checker refused the synthetic runtime
edge after replay, strict contexts and bundling. Both stages remain intact.
The corrected handle 12018 passed the affected existing Node case, fresh
six-package producer and complete checker. Compiled replay matches the native
report exactly; withholding the directory yields its precise missing fact.
Strict NodeNext, Bundler and opt-in ambient contexts passed. The browser bundle
contains 118 actual compiled inputs; SHA-256 is
`c66c72b8c0351396113e8a092442b639247a522c47871d9119d1d9477b8deb6a`.
The bounded public proof is
`/private/tmp/artroom-public-sdk-six-stage3-public-proof.json`, SHA-256
`f931de5d38544a16034e572a10760c5c2df3eec214accac7c43bf96b6cedf328`.

This outcome update changes only this guide; checked code, tests, settings,
lock and assets remain identical, so no gate is repeated for it. All six
`0.1.0-dev.2` artifacts remain local staged outputs. Verified npm publication
authority, six public versions and integrities, a cold public consumer and
actual Jam provisioning, browser, model, audio, recovery and Cloudflare
acceptance remain owed. The Source request closes none of those whole-demo
obligations.
