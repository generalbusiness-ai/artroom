# Verification modes: precise disclosure

2026-10-04. Clarification of the complete carry contract accepted in
`7634a884`, adopted in `4fa3fe0c` / `1d2319ba`, and saved in 015.
This changes only its verification-report wording. Every lifecycle rule,
ownership fence, public barrier, owner and all fifteen acceptance cases
remain. It introduces no new source task, mode, protocol version or
first-Jam gate. Source incorporation remains builder work.

## Evidence and the distinction

The current independent review of `f2582a68` reports that the repair's
replay-off disclosure denies checks that remain active. Read-only source
inspection confirms two paths in `packages/log/src/verify.ts` at exact
`f2582a68fa33992964165e6bf1c5f67ffd67f602`:

- `witnessOf` reads Git objects at line 651. The declared version path
  calls it at line 1449, before the replay option at line 1457.
- `land-evaluated` resolves evidence and checks blocking obligations at
  lines 1190–1201, before the replay option at line 1203.

The checker reports passive Git-read observations from an existing
integrity-run witness; this planner has inspected the source ordering,
not run that witness. The normal guarded verdict and its exact source
binding remain the independent review's responsibility. These findings
concern the currently commissioned intermediate verifier, not proof that
the future carry-pass implementation works.

Consulting Git objects does not, by itself, establish that every recorded
context or canonical rule input was independently checked. A retained
blocking-obligation guard does not establish full land-input replay.
Conversely, disabling policy replay does not mean those consultations
and guards stopped. Reports must distinguish each of these facts.

## Exact replacement in the accepted contract

In 015's Verify section, replace the paragraph beginning "The report
states the selected mode" with this paragraph:

> The report states the selected mode, `full` or `integrity`, and the
> position through which each positive claim is established. `integrity`
> means the caller disabled policy replay; it does not disable or deny
> independently performed decoding, authority, evidence, Git-object or
> landing guards. Report the checks actually performed and their limits.
> With replay disabled, `carryAccounting` is `"none"`: do not claim policy
> decisions were replayed, the complete required-call/input/budget work was
> checked, or public carry accounting was completed. Any retained guard or
> Git-object consultation is disclosed separately, with its actual proof
> strength; it must not be described as a full semantic replay. CLI and
> JSON express the same guarantees. Integrity-only success is not full
> replay success.

The next paragraphs of 015 remain, including partial accounting for
legacy/mixed/pending history and the conditions for complete public carry
accounting in a successful full run. Requiring a lifecycle minimum does
not enable replay or certify old operations retroactively. Supported
prefix and unsupported-version boundaries remain unchanged.

This clarification replaces a possible blanket reading of "no Git
witnesses are claimed" with explicit per-check disclosure. It does not
require removing current checks to make a simpler statement true. Nor
does a label such as `full` certify every Room transition, private job,
worker's present progress or publication completion.

## Implementation and validation

The existing intermediate request `42342e35` / `4e66accc` owns truthful
machine and human output for its delivered modes. Correct the output on
that same commission, preserving the retained defenses and valid legacy
controls. The original Stage 3 `1e8fee4b` / `3af8ebc7` and Stage 4
`48c021ea` / `8d497ff5` incorporate this wording with the complete accepted
015 contract when implementing full accounting. Their original scope,
explicit dual-scope review, normal landing and consumer-before-emission
order remain intact.

Use the existing selected-mode paired evidence and the actual retained
guard boundary to distinguish the disclosure repair. No broad guard
mutation sweep, repeated baseline, new test quota or platform acceptance
gate is requested. This planner ran no tests, build, install or provider
operation and made no source edit. Local validation is complete-text
inspection, whitespace and exact attachment identity.
