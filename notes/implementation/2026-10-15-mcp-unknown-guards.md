# Unknown MCP guards

Request `9d13c665` changes the fallback for guards the MCP description
renderer does not recognize. Tool descriptions and `inspect describe`
now say “a guard of an unrecognized form.” They do not print the guard's
JSON or append its unrecognized reason text. This includes non-object
guard values, malformed fact forms and malformed nested guard lists.
Known forms keep their existing descriptions. `inspect declaration`
still returns the original declaration bytes.

The existing known-form and worked-example tests remain in place. One
additional boundary test uses the real MCP service with its labelled
stand-in scope transport. A future/malformed declaration carries sentinel
text in four unknown positions. Both description channels omit it and
label the four positions; the declaration read preserves the full value.
This proves rendering and channel selection, not native acceptance of
the malformed declaration.

All eight focused description tests and the MCP compiler checks pass.
One focused control restores the old final guard fallback. The boundary
test then fails because the tool description contains the sentinel; the
existing unknown-form assertion also fails. The control restores source.
No mutation sweep has run.

The gate passes at `9b995c5bd9cff71e675fd6083b7c599613dd84a9`, tree
`e50fc7bc07740cd45e2a533cacad96270daa6fd3`, with no changed files.
Whitespace exits 0 in 0.1 seconds, typecheck exits 0 in 7.4 seconds, and
tests exit 0 in 207.4 seconds: 1,336 Vitest tests pass with 3 skipped,
followed by 16 Node checks and 55 Counter browser module checks passing.
The final reporting successor changes only this note; source, tests,
generated assets, manifests and lockfile remain equal to the passing gate
head. It does not repeat the gate.
Dependencies came from the unchanged pinned lock with `npm ci
--ignore-scripts` and the normal pool preparation. No probing tool changed
a manifest or lockfile. No push or deployment runs here.
