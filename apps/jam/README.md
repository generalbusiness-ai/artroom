# dap-jam

Jam is an application in the dap project. This deployed example runs a
procedural band locally in the browser: a phrase or mood enters its record,
and each player responds at a later bar. It has no connected dap scope,
AI model or microphone. See the [framework guide](../../docs/what-is-dap.md)
for the scope model used by the other applications.

The [landing page](landing/index.html) belongs to the main homepage build.
It keeps its existing served path, `/jam/`. The [procedural page](page/index.html)
and its managed assets belong to the separate `artroom-jam` Worker.
Neither Worker name nor the links in either page change in this move.

## Reproduce the recorded managed assets

From the repository root, give the recipe a new directory with an existing
parent outside this checkout:

```sh
node apps/jam/scripts/build-managed-assets.mjs /tmp/dap-jam-managed-assets
```

The recipe checks every recorded source file and asset before writing. It
reproduces the HTML entry rewrite, copies the brand masters and security
headers, and uses the exact retained `app.js` bundle. It refuses changed
inputs, extra asset files, an output inside the checkout, or an existing
output directory. It does not install tools or contact a provider.

Run the app's offline file checks with:

```sh
node --test apps/jam/test/managed-assets.test.mjs
```

These checks cover deployment bytes, configuration and stale-input refusals.
They do not establish browser playback or a new deployment.

## Recorded source and deployment

[deployed-source.json](deployed-source.json) records the imported file hashes,
the 19 public asset hashes, the original configuration hash and the retained
public deployment evidence. The source is foreign Jam commit
`b4b7c764199e5b9758771e43f8132c618858bf32`, tree
`6f4e999396d719205c1834de24602dac69925959`. The recorded active Worker version
is `8f53e237-b1c8-4d5b-b309-7ac2b5a3c99c`. This consolidation imports that
recorded source, rather than treating an arbitrary foreign branch tip as
the deployed version.

The actual recipe deployed managed assets only, retaining the existing
runtime with no bindings or native handlers. [wrangler.jsonc](wrangler.jsonc)
preserves its Worker name, compatibility date and asset routing options;
only its asset directory becomes app-local. Its tool was Wrangler
`4.147.0`. No deployment is part of this consolidation.

The unchanged [inline authoring recipe](scripts/build-static-worker.mjs)
is retained from the source repository. It expects an explicitly supplied
esbuild `0.28.1` module and an external output directory. That recipe builds
an inline `worker.mjs`; it is distinct from the recorded managed-assets
deployment. A source edit needs a newly reviewed bundle and refreshed
record before the managed recipe can accept it.

The [source license](LICENSE), [copyright notice](NOTICE) and the public
font licenses under `page/brand/fonts/` retain their original bytes.
Unrelated foreign spikes, recordings, installed dependencies and caches
are outside this imported production closure.
