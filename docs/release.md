# Releasing the installable packages

Six packages can be installed outside this repository:

| Package | What it is | Runs in |
|---|---|---|
| `@generalbusiness/artroom-contract` | Types, the signed envelope, type guards | Node, browsers, Workers |
| `@generalbusiness/artroom-policy` | The policy runtime and authoring helpers | Node, browsers, Workers |
| `@generalbusiness/artroom-client` | The typed client | Node, browsers, Workers |
| `@generalbusiness/artroom-mcp` | The MCP tools, a Workers handler and a stdio server | Node, Workers |
| `@generalbusiness/artroom-log` | Log publication and offline verification, and the `artroom-verify` command | Node, Workers; `./git-cli` and the command need Node and git |
| `@generalbusiness/artroom-cli` | The `artroom` command, as one bundled file | Node |

A release is six tarballs and a manifest that identifies them. Nothing is
published to a registry. Publishing is a separate decision for the project
owner.

## Source in the repository, built files in the tarball

Inside the repository each package's `exports` and `bin` name TypeScript
source (`./src/index.ts`). The tests, the typecheck and the Workers all
resolve the packages through the workspace, so they run the source. Packaging
does not change that: no workspace manifest names a built file.

npm does not rewrite `exports` or `bin` when it packs (tried with npm
11.19.1: a `publishConfig` with `exports`, `bin` and `types` is copied to
the tarball unchanged, and the top-level fields stay as they were). So the
release script writes the tarball's manifest itself:

1. `npm run build` in the package compiles `src` to `dist` with
   `tsconfig.build.json`: JavaScript and declarations, with each relative
   `.ts` import rewritten to `.js`. The CLI's build bundles `dist/artroom.js`
   as before.
2. The script copies `dist` (and `bin` for the CLI), the package's README,
   and `LICENSE` and `NOTICE` from the repository root into a staging
   directory outside the repository.
3. It writes the staged `package.json` from the workspace manifest
   (`publishManifest` in [scripts/release-lib.mjs](../scripts/release-lib.mjs)).
   Each `./src/x.ts` export becomes `{ "types": "./dist/x.d.ts", "default":
   "./dist/x.js" }`, each `./src/x.ts` bin becomes `./dist/x.js`, and
   `scripts` and `devDependencies` are left out. The subpaths, version,
   dependencies and `engines` are the workspace manifest's own.
4. It runs `npm pack` in the staging directory.

Do not run `npm pack` or `npm publish` in a library's own directory: that
packs the workspace manifest, which names source files the tarball does not
hold.

## The version

All six packages carry one version, `0.1.0-dev.1`. It is a pre-release
version because no public release has been decided. Each dependency between
the six names that exact version. Raise the number in all six manifests
together, and in `packages/ui/package.json`, then run
`npm install --package-lock-only`. The gate fails if the six disagree.

The CLI's bundle holds everything it runs, so its manifest lists no runtime
dependency. Its Artroom packages are development dependencies.

## Make a release

From a clean checkout of the commit to release:

```
npm ci
npm run release:pack -- <output directory>
npm run release:check -- <output directory>
```

`release:pack` ([scripts/pack-release.mjs](../scripts/pack-release.mjs))
builds and packs the six packages and writes
`<output directory>/release-manifest.json`: the source commit and tree,
whether the working tree was clean, and each tarball's package name,
version, file name, byte length and SHA-256. Packing the same source again
gives the same bytes. If the tree was not clean the manifest says so, and
the tarballs do not identify a commit.

`release:check` ([scripts/check-release.mjs](../scripts/check-release.mjs))
checks that release from outside the repository:

- each tarball has the bytes and SHA-256 the manifest records;
- every export, declaration and bin a tarball's manifest names is a file in
  that tarball; `LICENSE` and `NOTICE` are present; no test, TypeScript
  source or configuration file is;
- all six tarballs install together into a copy of
  [release/consumer](../release/consumer) in a fresh temporary directory.
  The lock file is saved as `<output directory>/consumer-package-lock.json`.
  It names each tarball by file and integrity, with no link;
- plain Node imports every export subpath of every library, and runs the
  compiled fixture;
- `tsc --noEmit` passes on the fixture under NodeNext and under bundler
  resolution;
- `artroom-verify` runs and prints its usage;
- the CLI tarball installs alone in a second fresh directory, with no other
  package, and `npx artroom --help` runs.

The check uses the network only to fetch third-party packages from npm's
public registry. It contacts no room. It shows that the packages install
and load. It does not show that a room admits an act.

## Install a release in an application

Put the tarballs in the application's repository, for example in
`vendor/artroom/`, and install the ones the application uses in one command:

```
npm install --save-exact ./vendor/artroom/generalbusiness-artroom-contract-0.1.0-dev.1.tgz \
  ./vendor/artroom/generalbusiness-artroom-policy-0.1.0-dev.1.tgz \
  ./vendor/artroom/generalbusiness-artroom-client-0.1.0-dev.1.tgz
```

Name every Artroom package that the chosen ones depend on, because no
registry holds them: `policy` needs `contract`; `client` needs `contract`
and `policy`; `log` needs `contract` and `policy`; `mcp` needs `client`,
`contract` and `policy`. The CLI needs none. Commit the tarballs and the
lock file, which records each tarball's integrity value.

A TypeScript application needs `Disposable` and `Symbol.dispose` in its
library types, because the contract's subscriptions are disposable. Node's
types (`@types/node` 22) supply them. Without Node's types, add
`"ESNext.Disposable"` to `lib`, as
[release/consumer/tsconfig.bundler.json](../release/consumer/tsconfig.bundler.json)
does.

## Where each entry point runs

Every export subpath of the five libraries loads in plain Node 22 or later;
the release check imports each one. None imports a `cloudflare:` module.

- `contract`, `policy` and `client` import no Node module. They use Web
  APIs only, and run in Node, browsers and Workers.
- `mcp`: `./worker` is the handler for a Cloudflare Worker. It loads in
  Node but is of use only in a Worker. `./stdio` reads and writes a
  process's standard streams: Node only.
- `log`: `.` uses Web APIs only. `./git-cli` and `artroom-verify` run
  `git` as a child process: Node only.
