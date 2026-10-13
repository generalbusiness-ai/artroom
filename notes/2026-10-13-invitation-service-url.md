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
