# Can an application install Artroom's packages?

Builder, 2026-10-04. An inventory, by experiment, for request `f3299ab4`
(the public-package starter) and for the first-Jam readiness judgment
(`b4ef9b7a`, assert `77a2aadaf`). It proposes changes and decides none. No
package was published and nothing in the repository was changed.

## The question

The jam is a separate repository. It may depend on Artroom only through
installable packages and the URL of a deployed room. Today no package is
published: `npm view @generalbusiness/artroom-client` answers 404, and
`npm org ls generalbusiness` answers "Scope not found". So the question is
what stands between the packages as they are and a repository outside the
workspace using them.

The packages an application needs are `contract`, `policy`, `client`, the
`artroom` command (`cli`) and `mcp`. The command also draws on `log` and
`git`.

## What was tried

At `a10c9bec`, with Node 26.10.0 and npm 11.19.1. Each of contract, policy,
log, git, client, mcp and cli was packed with `npm pack` into a scratch
directory and installed into a fresh project with no workspace.

| Step | Result |
|---|---|
| Install all seven tarballs together | Works. 178 packages, 116 MB, most of them drawn in by `mcp` |
| Install the `cli` tarball alone | Fails: its dependencies `client`, `contract` and `mcp` at `0.0.0` are not in any registry |
| `npx artroom --help`, `npx artroom mcp` | Work. The command is one bundled file that imports only Node's own modules |
| Import any library from Node (client, contract, policy, log, git, mcp and their subpaths) | Fails: `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Each package's `exports` points at TypeScript source, and Node does not strip types under `node_modules` |
| `npx artroom-verify` (the log package's command) | Fails the same way: its `bin` is a `.ts` file |
| Typecheck a consumer with `tsc`, default options | 43 errors, all from the packages' own source: their imports end in `.ts` |
| The same, with `allowImportingTsExtensions`, lib ES2024 with DOM, and Node's types | No errors. So the consumer's compiler options are applied to Artroom's source |
| Bundle a consumer with esbuild, for Node or a browser | Works: 71 kB for a script that uses the client |

## What this means

Only the command line works from outside today, and only when it is built
at pack time. A library works only for a consumer that bundles and that
sets its compiler the way Artroom does. A plain Node program, and a
TypeScript project with ordinary settings, cannot use any library.

## What must change, in order

1. **A place to install from.** Nothing is published, and the scope does
   not exist on the public registry. This is a decision for the project
   owner: publish to the public registry under a scope, or give the jam
   packed tarballs from a release. Either way the packages need real
   versions, not `0.0.0`.
2. **Built output for the libraries.** Emit JavaScript and declarations,
   and point `exports` at them. Tried on scratch copies of contract,
   policy, client and mcp, with no change to their source:
   `tsc --noEmit false --declaration --rewriteRelativeImportExtensions
   --allowImportingTsExtensions false --rootDir src --outDir dist`. All
   four built. A fresh consumer then imported them from plain Node, and
   typechecked with ordinary settings under both `bundler` and `nodenext`
   resolution. The tarballs were smaller (client 36 kB, contract 48 kB).
   Inside the workspace the tests run from source; an export condition or
   `publishConfig.exports` can keep that.
3. **Dependencies between the packages.** They are written `0.0.0` or
   `*`. They resolve only if every package is published at a matching
   version.
4. **The command's dependencies.** The bundle needs none of client,
   contract and mcp at run time. As `dependencies` they make a global
   install fetch 170 packages, or fail. They belong in `devDependencies`.
5. **`artroom-verify`.** Give it a built target, or drop the command and
   keep `artroom verify`.
6. **What each tarball holds.** Only the command has a `files` list. The
   others ship their tests, configuration and measurement results: log is
   1.5 MB unpacked.
7. **Licence files.** No tarball has one. The repository has `LICENSE`
   and `NOTICE` at its root.
8. **`engines` and public access** for each scoped package.

## What an application should depend on

- A browser or Worker application needs `client`, `contract` and, to
  write or check policy, `policy`. None of the three imports a Node or
  Cloudflare module.
- `mcp` brings most of the 178 packages. An application that only acts in
  a room should not depend on it; an agent uses `artroom mcp`.
- `git`'s `./publisher` export imports `cloudflare:workers`. It is the
  Room's, not an application's.

## Proposal

One small implementation request, after the owner decides item 1: the
build of item 2 for contract, policy, client, mcp and log; items 3 to 8;
and one test that packs the packages, installs them in a fresh project and
imports each from Node, so that the packages stay installable. It would be
the "published supported client and declaration release" that request
`f3299ab4` lists as its dependency. The starter itself stays with that
request.

The first jam task needs items 1 to 4 and nothing else from this list.
