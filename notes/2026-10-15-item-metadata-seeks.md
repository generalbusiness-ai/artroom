# Bounded item metadata seeks

This is G2a, child `88232b7a`, promise `3166f060`, under Priority 1
request `e0292346` and checker decision `69a33abc`.

`itemCandidates` is an internal synchronous storage primitive. It returns
item IDs and stored byte sizes, with one lookahead, before a later query
admits or reads any item body. It has no runtime caller or public export.
It does not implement an authorized query, cursor, response envelope or
client pagination.

State selection uses the existing `(type, state, id)` index. Each of at
most 16 byte-sorted unique states seeks at most 101 IDs, in ascending
order. Merging yields at most 101 candidates for a 100-row page. Explicit
IDs use at most 100 primary-key seeks with bounded type/state predicates;
they do not scan state buckets to find sparse IDs. Each statement binds
at most 18 parameters. Empty IDs select nothing, with no SQL.

The whole selector is checked before SQL: bounded UTF-8 type/state names,
state and ID ordering/uniqueness, safe integer positions, row limits,
candidate work and encoded metadata allowance. Candidate capacity and a
conservative 64-byte reservation per candidate, plus framing, are admitted
before execution. Lookahead counts against both bounds. No record bytes
are selected, parsed or copied by this primitive. Returned metadata has
strict numeric/order checks. Unsupported SQL or a missing index refuses;
there is no body-loading fallback or schema migration.

The caller must supply the verified UTF-8 Scope backend. Direct
`octet_length(record)` uses the TEXT column's byte size. SQLite documents
its [column metadata optimization](https://sqlite.org/lang_corefunc.html#octet_length)
and its [introduction in 3.43.0](https://sqlite.org/releaselog/3_43_0.html).
The optimization is an implementation premise, not a physical disk-I/O
measurement here. A different or unverified backend needs its own support
and encoding decision before use.

## Validation

Four focused cases passed in the actual local Durable Object SQLite
runtime, with source/test compilers passing. Installed workerd is
`1.20260815.1`, with `@cloudflare/vitest-pool-workers` `0.22.0` and the
repository's pinned compatibility preparation. This is local runtime
evidence, not a deployed SQLite version claim.

The native cases use clearly labelled synthetic item rows in isolated
test scopes. There are 203 selected rows, 3,000 unrelated final rows and
a 1 MiB body whose size is returned without a body column. The complete
state-query witness reads 314 rows, writes zero, and reports
`SEARCH item USING INDEX item_by_state (type=? AND state=? AND id>?)`.
The sparse-ID witness reads three rows in three lookups, including a
missing ID, with `SEARCH item USING INTEGER PRIMARY KEY (rowid=?)`.
Neither plan contains a scan or temporary sort. UTF-8 multi-byte sizes,
lookahead, suffix order and exhaustion are checked. These counters describe
those fixtures, not general service latency or peak-memory measurements.

Preflight, empty-ID, metadata and unavailable-primitive boundaries also
pass. One targeted control substitutes character length for byte length;
the existing native case observes 23 rather than 28 bytes and fails.
Another removes candidate capacity preflight; the existing case observes
one SQL call where zero was required. Both fail by assertions without
timeouts, and the original source bytes are restored. Exact hashes and the
single frozen-head gate are filed separately.

Full G2 still owes read/session compatibility, exact signed resource
binding and summary-equivalent eligibility, bounded signer/root
preparation, stale-cursor behavior, synchronous head/body/response
assembly, actual envelope admission and bounded consumers. No public read,
new authority, history or item write, provider operation or deployment is
enabled. The full parent remains open.
