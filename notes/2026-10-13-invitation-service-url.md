# Invitation service URL boundary

Request `eee29145f6eaee9a1550ed84312f2c10c6243562`, promise
`9505b12eaf109215ca1b4a70ff3b31395eab59ab`.

This Source rejects an invitation service before joining can sign an intent
or change configuration. A private client helper parses the URL and permits
HTTPS, or HTTP at a numeric IPv4 loopback address in 127.0.0.0/8 or IPv6 ::1.
Credentials, query strings, and fragments are refused, including bare `?`
and `#` delimiters. A name such as localhost is not a numeric loopback host.
The original accepted service string is retained without normalization.

Both person join paths use the existing `wellFormedInvitation` API. MCP
already calls it before reading configuration, adopting the service, or
signing. CLI now calls it before touching the key store. The existing shape
errors remain. The helper is not re-exported from the client package.

Tagged agent-key links use the same URL boundary while keeping their stricter
canonical-origin, closed-field, native-reference, revision, and secret checks.
Their distinct dispatch, enrollment, retry, and custody behavior remains.
No MCP roots configuration, protocol, credential custody, grant, or network
transport behavior changes.

The strengthened CLI case calls real person and tagged join with invalid
endpoints and store and transport tripwires. It combines positive shape
forms with the tagged parser's canonical-origin restrictions. One MCP case
calls the actual service with a real signer: invalid endpoints cause no
signature, request, configuration read or write, or custody write. Permitted
endpoints cross the real signing boundary; a labelled transport stand-in
returns a scripted refusal before enrollment reads. Existing client tagged
handoff coverage remains selected. These cases are prepared but unrun.

HTTPS syntax does not establish a trusted host, invitation provenance, or
DNS policy. The five P3 advisories remain separate follow-up work after the
submission. This head changes only the requested P2 boundary.

No focused case, compiler, control, gate, install, provider request, or public
publication has run for this Source. A prepared namespace, the focused plan,
one meaningful URL-guard control, one ordinary changed-head gate, independent
review, and normal landing remain owed.


## Checked URL boundary

The unrun statements above record the original preparation. The checked
joint executable Source is `2dab21e5ecfd531aa7fe68382ef7606908d6d148`, tree
`6d90c282903acc7fc9ba0cb14673796676e88ee0`. Its launcher rename remains under
the separate CLI request and promise. The full sequence of original failures
and corrections is preserved in the [CLI delivery note](2026-10-13-cli-physical-dap.md).

The original CLI and tagged-client cases passed in 45776. They retained their
original Source identity rather than being repeated for a report label. The
corrected MCP baseline passed in 81540. Its single control replaced the URL
predicate with a string-only check, and the same selected case failed by an
assertion. The original Source was restored and every final guard passed.
All five collected MCP cases remained accounted for: one selected case and
four explicitly unselected cases. The report parser accepts the observed
skipped status without counting those cases as executed.

The assertions still cover nine forbidden URL forms and six allowed forms.
The CLI public command returns usage exit 2 for an invalid person link and
failure exit 1 for an invalid tagged link, with its existing messages. The
MCP public error is `{ error, message, next }`, with `isError: true`; its
message identifies the link field. Invalid URLs cause zero signatures,
requests, configuration reads or writes, or custody writes. Both required
root-write test ports count and throw on unexpected adoption. The six
allowed forms cross the real signer once each and receive the labelled
transport stand-in's refusal; this proves no native enrollment or host trust.

The fixture types use the public invitation and repository interfaces. The
old misleading scope-kind cast is removed. These type-only corrections
preserve every runtime fixture and assertion. The unused CLI import is also
removed; the production refusal boundary remains unchanged.

The normal Page bundle now contains the same shared URL guard. Its generated
module is 674,652 bytes, SHA-256
`2dab33e5b477acbc8f134a4aaa34a80c41d02598e56905a6da6a865b8eb4aca4`.
The owning asset case passed in 56019. The final ordinary gate 29384 passed
whitespace, typecheck, and tests, with 1,145 Vitest passes, three original
skips, Node 10, and Counter 55. The skips remain unrun. No installation,
provider action, or public deployment was part of this validation.

The original MCP baseline and control proof is
`cli-p2-mcp-only-completion-held/focused-one/public-result.json`, SHA-256
`d5a4ce6215892dc63c5b2bad026a4cd1f4f0f81a2d85a08ff90f1695cccaf23b`.
The final gate proof is `gate-one/result.public.json`, SHA-256
`f3cd1ed0fb40958960817f6ded9e2b55bfaf915040dd9cd3531323b83453e53c`.
The final delivery head changes only these two notes. The checked executable
Source remains exact. Independent review and normal landing are pending.
The five P3 advisories remain separate follow-up work.
