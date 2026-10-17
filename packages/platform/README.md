# @generalbusiness/dap-platform

The production data and rule code for Artroom's platform definitions. The
library reads no clock, storage or network. Its rules receive the state and
recorded inputs supplied by the runtime or independent replay.

The root export includes `platform(named)` and `VERSIONS`, with each exact
supported `platform:<name>@<version>` pin's data, rules and available observation,
membership and rules-reference functions. A missing version returns `null`.
`APPLICATION_COHORT` names the original supporting application cohort;
`FILE_PUBLICATION_COHORT` names the additive register@9, directory@8,
membership@4, rules@3, destination@4 and inbox@1 cohort.
`NEWEST` describes the existing default creation cohort. None of these selects a
new version for an existing scope or history.

Destination@4 admits `publish-file` from an application whose native origin
proves creation by its own directory. File and change publications share one
slot. The file receipt binds the sender's full reference, sending entry and
send ordinal, path and content digest to the commit or superseded result.
Source order is kept across retained final publications; an unknown push
holds the slot and is never resent.

An application may overwrite any path, including the rules extent. Change
review rules do not govern these writes. The room controls applications
through `rules.activate` and `application.establish`.
Directory@8 reserves the genesis `destination` field and supplies its own
recorded full reference when the declaration requests type `scope`, kind
`destination`. Old factories and cohort pins retain their original behavior.

```js
import { platform } from "@generalbusiness/dap-platform";

const coded = platform("platform:membership@2");
// Pass the matching catalog lookup to the independent replay's platform option.
// A null lookup remains an unsupported definition.
```

A verifier must use the code for every version the target and its foreign
histories actually pinned. The replay report states which platform code it
takes on trust; it cannot show that a remote runtime used those same rules.
The operator's deployed version and any capability or operation-owner code
remain separate inputs. Supplying this catalog grants no native authority.
Only trusted platform code uses the validator's platform option. Application
declarations received as input use the ordinary declaration validator.

The six-package producer publishes this production root as JavaScript and
declarations, with exact coordinated contract, bytes and derive dependencies.
The source workspace's `./testing` export contains stand-ins and is explicitly
excluded from that public release. See `docs/public-sdk-release.md` in the
repository for artifact guards and acceptance requirements. A local stage
does not establish registry availability, browser execution or deployment.

Licensed under Apache-2.0; the package carries LICENSE and NOTICE.
