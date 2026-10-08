# Site component preparation

Request `a2317893c5728e29cffb14f78439e3ad506fb56a`. Prepared on
`c6bc3e5c7c0d99294f69bd7ea48854fad2d74a61`, independently of main's
Gate1 and the clone preparation branch. This is a component repair, not
an integration or deployment receipt.

The own-host reader accepts only the deployed binding's `artroom-demo`
namespace. A returned token must explicitly state read scope and a valid
reported ISO expiry later than the current clock. It never derives expiry
from the requested TTL. Each new smart-HTTP request checks that expiry
again. A request already in flight is not aborted merely because the
reported expiry passes, and expiry is still the service's assertion.

Usable plaintext from an unacceptable token reply is revoked once. A false
answer or an error does not confirm revocation. Repeated close calls share
one cleanup attempt and its result; no hidden retry is made. The route also withholds a
rendered or cached response if cleanup after reading is unconfirmed,
answering `502`, `no-store`, with `x-site-step: cleanup`. Errors report fixed
words, not the token ID or plaintext. This stateless reader has no durable
cleanup custody: withholding content does not retain a cleanup duty or
prove revocation. A token whose cleanup fails may remain valid until the
reported expiry, if the service honors that expiry. Without a valid reported
expiry, no lifetime is known. Durable cleanup after
failure or process loss remains an owner decision.

GitHub's reader now calls the existing `GitHubApp.repository` lookup before
smart HTTP. That lookup checks the configured account, repository name and
remote; the site then compares its numeric ID with the room's recorded ID.
A replacement repository at the same name does not inherit the room's
identity. Even public reads now need the configured App fields and a
structurally valid `GITHUB_APP_PRIVATE_KEY` to construct that helper. Public
identity lookup still sends no token, performs no JWT signing and mints
nothing; private reads use the independently configured read credential.

A conditional response checks the actual commit and tree path before
answering `304`. Missing paths, a file addressed as a directory, symbolic
links and submodules remain refusals even with a guessed validator or `*`.
The conditional path need not render a blob. These checks do not establish
room access or publication provenance.

The current route still reads directory genesis through `source(0)`,
presents no room session, accepts named branches and tags, and derives
`HEAD` from the directory's recorded branch. Public versus member access,
published-ref provenance, and compatibility with the selected platform
versions remain outstanding seams; proposal `0e8` is not adopted here.
Conformance claims, annotated tags and a live browser/provider render also
need their own evidence. No PACK parser change is included.

Focused witnesses use scripted binding and REST answers, and the existing
site-route fixture's real register/directory with a stand-in Git host.
They show refusal before HTTP for host identity or token grant mismatch,
expiry at request time, explicit failed cleanup, and missing-path cache
refusal. They prove nothing about a live Git provider. The repository gate
and independent review belong to the eventual integrated candidate.
