# Definition-domain retained keys

Source child `a1622876`, promise `2661cab6`, is a bounded prerequisite of
archive inventory request `02252148` under durability request `e871ba09`.
It implements checker decision `78127fe6`, point 4. Its base is local main
`5cfbaae712063ed351fe1b2ce457240a7ffb9a13`.

The runtime already stores a value in `DOMAINS.definition` as a retained
`definition`, without a value-domain component. Replay's act-place reader
already followed that rule, but its observation and outcome-evidence
readers asked for `value` with a domain instead. A native history could
therefore retain the exact bytes that a successful replay needed, while
replay reported them missing. The outcome driver also used the wrong key
when an operation reused bytes already retained by an earlier entry.

`packages/bytes/src/retained-key.ts` now supplies the shared choice:
definition domain gives `definition` and digest; every other typed domain
gives `value`, domain and digest. The producer, all three typed replay
consumers and the outcome driver's stored-value lookup use that choice.
Callers keep their existing validation of canonical bytes, digest, bound
and authority. The outside-answer format still supplies its typed value;
the retained service performs no alias or fallback between keys.

The native scope tests strengthen the existing value and observation
witnesses with a definition-domain case beside the ordinary-domain case.
The declaration bytes are the repository's actual issue definition. The
owning platform data/rules, outside answers and observation producers are
labelled stand-ins. Actual scope turns, SQLite retention, restart, service
routes and replay are real. Observation histories retain explicit anchors
for their scripted membership/rules and foreign entries; they establish no
native authority or foreign admission claim.

Five selected cases pass: three value cases and two observation cases.
They show successful native producer-to-service-to-replay round trips,
missing named bytes remaining `incomplete`, wrong-kind definition requests
remaining `not-found`, malformed or oversized offered values writing
nothing, and a second native outcome reusing the exact retained key without
another payload. The initial observation fixture addressed the row outside
its `tell` form and failed before setup; correcting that fixture path made
both domains pass. Bytes, replay and scope typechecks pass.

A targeted control restores the two wrong replay consumer keys, leaving
the producer unchanged. Both definition-domain round trips then fail by
assertion: replay reports the actual retained dependency missing. Source
is restored to verifier SHA-256
`a90d57ac113ea674656b5e8b1dc272ac5f82dc98847b9302aaed60c74bba6b54`.
Restoring only the outcome driver's wrong stored-value lookup makes the
second native operation refuse instead of writing, and fails its existing
assertion. The restored driver SHA-256 is
`746ca7fb6af705cdc14ba1966bfbb74b41c9a47f589162173d0d3c02eaa57433`.
These are selected counterexamples, not a mutation sweep.

The final gate at a frozen Source head and exact-head independent review
remain owed. This slice adds no archive scanner, manifest, closure walk,
export, writer or clone reader. The archive's stronger transitive
declaration closure still needs the explicit reconciliation in section
15.3 before dependent Source. Ordinary replay does not gain a requirement
to fetch unused static child declarations. Archive/clone parity remains a
later witness; these service round trips do not claim it. No push or
deployment ran.
