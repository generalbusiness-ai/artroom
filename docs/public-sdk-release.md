# Producing the public SDK

This is the active four-package producer boundary. It builds and inspects
JavaScript and declarations for contract, bytes, client and derive. It does
not publish, install application packages, configure accounts or deploy a
service. The earlier release guide is historical and inactive.

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
node scripts/check-public-release.mjs --manifest /private/tmp/fresh-sdk-stage/release-manifest.json
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

Build order is contract, bytes, client, derive. TypeScript 7.0.2 emits ES2022
ESM plus declarations without maps. Relative JavaScript extensions are
rewritten by the compiler. Relative declaration module specifiers are
converted to `.js` where needed and checked against real `.d.ts` files in
the same stage. The manifest records each such declaration rewrite. Neither
an extension flag nor a source typecheck proves declaration closure.

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

Later verification must still include the affected source/compiler checks,
one build/output check and one changed-head normal gate before independent
review. Do not repeat platform permutations. On failure retain the owned
stage and diagnostics, fix source and review the new subject; no implicit
retry, deadline widening or publication follows.

The release owner assembles and verifies source/artifacts. A separately
verified namespace administrator/publisher controls publication. A deployed
operator controls the HTTPS URL, version, bindings, migration and real
membership/definition/read provisioning. GitHub App authority does not
establish npm publishing rights. Publishing four packages is not atomic;
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
checks remain unrun. A future attempt needs its own exact reviewed source,
fresh owned stage and release. One changed-head gate and normal independent
review are still owed before landing; no public publication follows.
