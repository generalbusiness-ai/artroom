# Demo Git host and deployment

Request: `225da894f5fc9322a6e86f923ffe6fd52b9739dd`.
Producer: `f8a56f1ca6d6a55c3127cb4d66a806256371af36`.
Branch: `request/demo-git-host`, from published main `9b753bf74`.

This delivery is in progress. No real provider run, deployment, final gate,
independent approval or landing is claimed here.

The scope creates its outside port after storage is available. The port
receives live state reads, its own sealed entries and already retained
inputs. It receives a read facade, without the store's write methods. The
destination port uses the platform rules' existing operation-context
functions; the host adapter supplies evidence to those rules.

The Git package has separate Web API entry points for smart HTTP writes,
exact object reads and GitHub App requests. A write builds a verified SHA-1
pack, checks the advertised old ref, sends one exact update and requires a
complete status reply. It performs the caller's live authorization check
immediately before the POST, after compression and discovery. A lost reply
remains unknown, even when a subsequent read finds the requested commit.
The reader checks complete pack trailers, object bytes and both Git delta
formats before retaining any object. A failed object read is never absence.
The caller configures the transport buffer allowance; it is no adopted
platform quota.

GitHub App requests use RS256 JWTs and explicitly restricted installation
tokens. The primitive validates repository IDs, account, permissions,
expiry and clean fixed provider URLs. Repository creation requests no
initial commit. Deletion requires an administration token restricted to
the exact recorded repository ID. The caller still owns the name binding,
credential custody and cleanup. Creation authority and the App installation
remain configuration prerequisites. GitHub returns token plaintext and
expiry, without a separate credential ID; the adapter's nonsecret identity
mapping must be explicit before production use.

Private credential rows live beside scope history. They keep a mint's
reply metadata and plaintext across a restart. Only the matching confirmed
mint judgment makes a credential usable, and only before expiry. Expiry or
dropped plaintext does not claim provider revocation. These rows are absent
from the state facade, entries, history, log and public methods.

Focused producer evidence so far:

- Real local Git receives the exact founding commit, binary blobs, tree,
  compare-and-set update and deletion. The same witness distinguishes a
  race, a lost reply and authorization changing during discovery.
- Real local Git supplies upload packs and independently generated OFS and
  REF delta packs. The production reader verifies their exact objects.
- Real SQLite witnesses show live read-only factory context and private
  custody across an object restart, with unchanged public history and log.
- Register rules run in memory with a scripted provider. GitHub HTTP
  responses are scripted; real RSA verifies the JWT signature. Neither
  fixture demonstrates a hosted provider.
- The byte-copy, final authorization, pack-checksum, read-facade and expiry
  controls distinguish their injected faults. Register and GitHub controls
  also distinguish, but their raw output remains in tool transcripts;
  register's saved file is explicitly an observed-result summary.

Retained logs: `/tmp/artroom-smart-http-copy-control.log`,
`/tmp/artroom-smart-http-live-guard-control.log`,
`/tmp/artroom-smart-http-read-checksum-control.log`,
`/tmp/artroom-demo-outside-factory-final.log`,
`/tmp/artroom-demo-outside-facade-control.log`, and
`/tmp/artroom-demo-credential-expiry-control.log`.
The initial checksum control was inconclusive because the test reporter
classified a promise assertion as an error. The same fault then
distinguished after the assertion was made explicit; the initial output
remains in the transcript. Logs without executed-head/source-hash stamps
are producer correspondence evidence, not independent reproduction.

The required real run still owes install and register, repository claim,
directory/membership/rules/destination confirmation, a judged publication,
a person's Git clone, and verification through deployed authenticated
reads, with times and deployment identities. Runner, browser and agent
stand-ins must be named in the final delivery. Nothing is registry-published
and the old deployed spike is outside this change.
