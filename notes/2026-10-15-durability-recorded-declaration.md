# Recorded durability declaration

This delivery covers child `82442262`, promise `bd9e36d5`, under the full
Priority 1 durability request `e871ba09`. Checker decision `e9e0094c`
sets its boundary. It completes only the first declaration slice, A0a.

A format1 definition can state `level: { name: "recorded", version: 1 }`.
Omission keeps its recorded meaning and original bytes. Explicit Recorded
has its own digest. The validator refuses extra or missing level fields,
unknown names and unsupported versions. Live and Archived cannot fall
back to recorded execution. Public founding and replay refusals remain
`unsupported-definition`.

No existing declaration, lane pin, platform version, journal, judgment,
receipt, authority rule or publication path changes. The reusable contract
exports the versioned level type through its existing export. No package
manifest, lockfile or generated browser asset changes.

Focused validation passed 120 cases across Derive validation, Replay
verification and Scope replay. Derive, Replay and Scope typechecks passed.
The real Scope test retains the exact explicit declaration and replays its
native genesis. Unsupported Live and Archived attempts leave zero entries
and zero operations in SQLite. That test uses the existing fixture authority,
a stand-in, with real Durable Object storage. A separate synthetic untrusted
journal tests Replay's refusal; it proves no runtime admission. Existing lane
pin witnesses remain part of the required final gate.

The gate result is filed separately against the final exact head. No Source
approval or landing is claimed by this note. Archive permission, discovery,
new cohorts, backend and progress, offline replay, Live format2 and its
executor remain owed under the parent. No provider operation ran.
