# I5 site conformance: reference configuration and safe output

2026-10-08. Preparation under gitseq request
`a2317893c5728e29cffb14f78439e3ad506fb56a`, following intake
`f6661ccd18448e18958a6268b0d3f8e22163f655`. Branch
`request/i5-site-prep`, original preparation base
`c6bc3e5c7c0d99294f69bd7ea48854fad2d74a61`, after the separate host/route
repair `2cd336c586348ccb1f783bb25cbd7490dc4388d6`. This change owns only
`site-conformance.test.ts`, the conformance paragraph of `docs/pages.md`,
and this note. Host, route and their witnesses are the preceding agent's
work and are not changed here.

## What the claim now means

The exact reference bar remains 672 of 672 retained examples. Its
configuration is explicit: only each example's tagged extension, raw HTML
passed through, heading ids disabled, and no URL rewriting. Examples 279
and 280 are tagged `disabled` but run locally with `tasklist`. This does not
claim to run the upstream runner with identical options or independently
compare every retained byte against upstream.

The retained fixture SHA-256 is
`56b5146726dbb38da0e2c873e86af47d3a4937515407334844419bc2c16a76ae`.
Its attribution, upstream commit and converter remain in
`packages/scope/test/site/LICENSE` and `spec-to-json.mjs`; they were not
regenerated or changed. Intake read selected actual fixture records and
inventoried the corpus, not all corresponding upstream bytes.

The previous 662/672 and 595/672 reports disable heading ids and omit the
URL resolver. They are diagnostic comparisons, not output of the served
profile. They still print as diagnostics within the reference test, but no
permissive predicate treats a `<` or scheme in Markdown as sufficient
evidence for an arbitrary output difference. A report-only comparison is
no longer counted as its own successful test.

## Exact selected safe-profile witnesses

The route passes its relative-address resolver to the converter, with safe
HTML, heading ids and all extensions enabled by default. The renderer
boundary now uses that same `resolveAddress` function and configuration,
with exact expected HTML and title for selected behavior:

- repeated headings get `guide`, `setup` and `setup-1` ids;
- relative links/images resolve within the page folder and same site/ref;
  repository-root links resolve at the root, fragments and HTTPS stay;
- inline HTML is escaped, a script block is displayed in `raw-html`,
  strikethrough, extended autolinks and a checked task box render together;
- JavaScript, VBScript, file and HTML data links, plus an SVG data image,
  have empty addresses; a selected PNG data image remains allowed.

No reference example contains a literal `javascript:`, `vbscript:`, `file:`
or `data:` destination, so the last compact witness supplies that missing
selected coverage explicitly. These assertions do not establish exact
served-profile output across all 672 examples, all allowed image formats,
the complete upstream specification, browser behavior or host access.
`docs/pages.md` now makes the configuration and evidence limits explicit.
This section corrects the broader "as served" interpretation in the cloud
delivery note's conformance section without rewriting that historical run.

## Validation and limits

Only `test/site-conformance.test.ts` ran in the scope project. The first
run passed the reference/scheme checks but found a newline in the manually
written raw-block expected output that the block parser does not retain:
`blocks.ts` strips trailing block newlines. The expectation was corrected;
no parser or renderer behavior changed. Scope source and test typechecks
passed.

One authorized control used `scripts/control.mjs` to temporarily replace
`safe && UNSAFE_PROTOCOL.test(resolved)` with
`false && UNSAFE_PROTOCOL.test(resolved)` in `html.ts`, after the host
agent's focused tests finished. It left the exact safe expected outputs
unchanged. The unsafe-address witness failed by assertion: actual HTML
contained the forbidden destinations instead of empty addresses. The helper
reported **DISTINGUISHES** and restored the source. No renderer change is
committed. After folding the diagnostic report into the reference test, the
final focused file run passed all three meaningful tests (0.866 s), and its
reference comparison reported 672/672. Whitespace checks passed.

No new engine, runtime policy, test matrix, gate, installation, provider
operation or deployment was performed. Full site reconciliation, gate,
independent review and the live/product obligations remain open under the
existing order after read/clone; this is selected conformance preparation,
not full-site approval or request closure.
