/**
 * What the deployable configs and the source must agree on, the required
 * public URL, and the rule that only the token ledgers reach Artifacts'
 * token creation.
 *
 * One worker runs these case files, so the cost of starting a test file is
 * paid once for all of them.
 */

import "./deploy.cases.ts";
import "./hygiene-55be0661.cases.ts";
import "./mint-sites-scan.cases.ts";
