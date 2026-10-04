/**
 * The Room's pure parts: canonical bytes, keys and signatures, identifiers,
 * globs, the shapes of acts, secret scanning, the redaction of diagnoses,
 * the log remote's encoding, and how the services are chosen from the
 * bindings.
 *
 * One worker runs these case files, so the cost of starting a test file is
 * paid once for all of them.
 */

import "./canonical.cases.ts";
import "./crypto.cases.ts";
import "./ids.cases.ts";
import "./glob.cases.ts";
import "./schema.cases.ts";
import "./secrets.cases.ts";
import "./diag.cases.ts";
import "./logremote.cases.ts";
import "./config.cases.ts";
