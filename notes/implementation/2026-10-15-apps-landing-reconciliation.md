# Apps landing reconciliation

15 October 2026. Request `5c4da4cc`, promise `350529a1`.

The document correction is tracked separately by Source request `4c8c6377`
and promise `0f72c350`. The original request asks for evidence and owes no
Git artifact. Its prepared README pointer alone cannot authorize a merge.
This successor binds both changed documents to the Source request for
independent review and local integration.

Local main `0548b726d0a3e17ec171e71d93365d5311f61ccf` contains the
approved consolidation commit `80976213df684ed6bed200c793e76001eed74b11`.
Its tree differs from that approved tree in README.md alone. The merge
restored the old links to `packages/lanes` and `examples/counting`, whose
directories the consolidation moved.

Hugh's upstream commit `a86b8fdaf427f08f4d2927a7a817792896c40c93`
already has the correct links to `apps/room/lanes` and `apps/counter`. It
also adds the contest submission link to the fixed `be7d3df` version.
The prepared merge `1299ae694d63b4a249e119c51e3bde920ef9d8e1` preserves
that exact upstream commit as its second parent. README.md matches Hugh's
upstream blob exactly. Every other path matches the approved consolidation
tree. No application source, test, asset, manifest, or lockfile changes.

## Verification

Run these commands in the prepared checkout:

```sh
git diff --exit-code 80976213df684ed6bed200c793e76001eed74b11 HEAD -- . ':!README.md' ':!notes/2026-10-15-apps-landing-reconciliation.md'
git diff --exit-code a86b8fdaf427f08f4d2927a7a817792896c40c93 HEAD -- README.md
git merge-base --is-ancestor a86b8fdaf427f08f4d2927a7a817792896c40c93 HEAD
git diff --check 0548b726d0a3e17ec171e71d93365d5311f61ccf HEAD
test -d apps/room/lanes
test -d apps/counter
```

These checks passed at the prepared merge. The later note commit changes
only this file. The gate was not repeated for a document-only correction.
The approved tree is `3dde3ce262d2a94c175c6a58a1f89dab64c51e42`;
the prepared merge tree is `29aa44df9bf7adeba84bad6b897a50d09e774ec9`.
The accompanying public verification records the final note commit and
tree separately.

## Original operation and remaining work

The original landing's process, reported as PID 184, is absent after the
machine restarted. This session has no retained terminal result for that
process. Its exit status and any final push attempt remain unknown. A Git
merge commit proves the local tree and ancestry. It does not prove that
the original command completed or that its durable receipt was sealed.
The workroom still reports the original approval as awaiting landing.

This correction requires independent review before local integration.
The original receipt and accounting remain unresolved. Do not repeat the
original landing command to fill that gap. Hugh holds GitHub pushes and
Cloudflare deployments until Friday 16 October. This work performs neither.
