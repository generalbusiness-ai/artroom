# @generalbusiness/artroom-platform

The production data and rule code for Artroom's platform definitions. The
library reads no clock, storage or network. Its rules receive the state and
recorded inputs supplied by the runtime or independent replay.

The root export includes `platform(named)` and `VERSIONS`, with each exact
supported `platform:<name>@<version>` pin's data, rules and available observation,
membership and rules-reference functions. A missing version returns `null`.
`APPLICATION_COHORT` names the explicit supporting application cohort;
`NEWEST` describes the existing default founding cohort. Neither changes a
scope's genesis pin or selects a version for an existing history.

```js
import { platform } from "@generalbusiness/artroom-platform";

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
