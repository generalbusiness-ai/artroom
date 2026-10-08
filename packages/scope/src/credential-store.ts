/**
 * Credential custody beside one scope's history. These rows are private
 * runtime storage: no StateView, entry, public read or RPC method includes
 * them. The caller validates the host's own reply and the scope's judgment;
 * this table records neither a judgment nor an outside effect.
 *
 * Losing a plaintext does not revoke a provider credential. Only the
 * caller's explicit `revoked` instruction records that fact here. The
 * original mint reply metadata remains, even after expiry or revocation,
 * so a restarted outside port can recover that attempt's own evidence.
 */
import type { OperationId, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { timeMs } from "@generalbusiness/artroom-derive";

export interface CredentialReply { id: string; ends: Timestamp }
export interface CredentialPosition { mint: OperationId; attempt: number }
export interface PendingCredentialReply extends CredentialReply, CredentialPosition {}
export interface RevocationPosition { revoke: OperationId; attempt: number }
export interface ExpectedRevocation extends RevocationPosition { mint: OperationId; mintAttempt: number; id: string }
export interface MintedCredential extends CredentialReply { mint: OperationId; attempt: number; plaintext: string }
export interface ScopePrivateCredential extends Omit<MintedCredential, "plaintext"> {
  plaintext: string | null;
  /** Custody and the mint's judgment, not proof that a provider token is still usable or that expiry revoked it. */
  state: "held" | "live" | "revoked";
}
export type CredentialPut = "stored" | "repeat" | "conflict" | "no-scope";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS private_credential (
  scope TEXT NOT NULL, id TEXT NOT NULL, mint TEXT NOT NULL, attempt INTEGER NOT NULL,
  ends TEXT NOT NULL, plaintext TEXT, state TEXT NOT NULL CHECK (state IN ('held', 'live', 'revoked')),
  PRIMARY KEY (scope, id), UNIQUE (scope, mint, attempt)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS private_credential_pending ON private_credential (scope, state, mint, attempt);
CREATE TABLE IF NOT EXISTS private_credential_revocation (
  scope TEXT NOT NULL, revoke TEXT NOT NULL, attempt INTEGER NOT NULL,
  mint TEXT NOT NULL, mint_attempt INTEGER NOT NULL, id TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, revoke, attempt)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS private_credential_revocations ON private_credential_revocation (scope, done, revoke, attempt);
CREATE TRIGGER IF NOT EXISTS private_credential_revoked AFTER UPDATE OF state ON private_credential
WHEN NEW.state = 'revoked'
BEGIN
  UPDATE private_credential_revocation SET done = 1
  WHERE scope = NEW.scope AND mint = NEW.mint AND mint_attempt = NEW.attempt;
END;
`;

export class CredentialStore {
  readonly #sql: Pick<SqlStorage, "exec">;
  readonly #current: () => ScopeRef | null;

  /** `sql` is the object's SQLite storage; `current` reads its current scope and incarnation. */
  constructor(sql: Pick<SqlStorage, "exec">, current: () => ScopeRef | null) {
    this.#sql = sql;
    this.#current = current;
    sql.exec(SCHEMA).toArray();
  }

  #scope(): string | null {
    const current = this.#current();
    return current ? canonicalize(current) : null;
  }

  #read(scope: string, mint: OperationId, attempt: number): ScopePrivateCredential | null {
    const row = this.#sql.exec("SELECT id, mint, attempt, ends, plaintext, state FROM private_credential WHERE scope = ? AND mint = ? AND attempt = ?", scope, mint, attempt).toArray()[0];
    return row ? {
      id: row["id"] as string, mint: row["mint"] as OperationId, attempt: row["attempt"] as number,
      ends: row["ends"] as Timestamp, plaintext: row["plaintext"] as string | null, state: row["state"] as ScopePrivateCredential["state"],
    } : null;
  }

  /**
   * Keep a validated own reply, initially held. An ID belongs to one mint
   * attempt, and an attempt has one ID. Conflicts change nothing. Repeating
   * an identity never restores a plaintext that was dropped or revoked.
   */
  put(credential: MintedCredential): CredentialPut {
    const scope = this.#scope();
    if (scope === null) return "no-scope";
    const existing = this.#sql.exec("SELECT id, mint, attempt, ends, plaintext FROM private_credential WHERE scope = ? AND (id = ? OR (mint = ? AND attempt = ?))", scope, credential.id, credential.mint, credential.attempt).toArray();
    if (existing.length !== 0) {
      const row = existing[0]!;
      return existing.length === 1 && row["id"] === credential.id && row["mint"] === credential.mint && row["attempt"] === credential.attempt && row["ends"] === credential.ends && (row["plaintext"] === null || row["plaintext"] === credential.plaintext) ? "repeat" : "conflict";
    }
    this.#sql.exec("INSERT INTO private_credential (scope, id, mint, attempt, ends, plaintext, state) VALUES (?, ?, ?, ?, ?, ?, 'held')", scope, credential.id, credential.mint, credential.attempt, credential.ends, credential.plaintext).toArray();
    return "stored";
  }

  /** The retained own-reply metadata of that exact attempt. This read returns no secret and does not deliver an answer. */
  reply(mint: OperationId, attempt: number): CredentialReply | null {
    const scope = this.#scope();
    if (scope === null) return null;
    const row = this.#sql.exec("SELECT id, ends FROM private_credential WHERE scope = ? AND mint = ? AND attempt = ?", scope, mint, attempt).toArray()[0];
    return row ? { id: row["id"] as string, ends: row["ends"] as Timestamp } : null;
  }

  /**
   * At most the caller's limit of held own replies after that mint attempt,
   * in mint and attempt order. The index starts at the cursor; no secret is
   * selected. Expired or dropped plaintext leaves the historical reply
   * valid. This read never offers that reply or claims a revocation.
   */
  pending(after: CredentialPosition | null, limit: number): { items: PendingCredentialReply[]; more: boolean } {
    const scope = this.#scope();
    if (scope === null || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(limit + 1)) return { items: [], more: false };
    const rows = after === null
      ? this.#sql.exec("SELECT mint, attempt, id, ends FROM private_credential WHERE scope = ? AND state = 'held' ORDER BY mint, attempt LIMIT ?", scope, limit + 1).toArray()
      : this.#sql.exec("SELECT mint, attempt, id, ends FROM private_credential WHERE scope = ? AND state = 'held' AND (mint, attempt) > (?, ?) ORDER BY mint, attempt LIMIT ?", scope, after.mint, after.attempt, limit + 1).toArray();
    return {
      items: rows.slice(0, limit).map((row) => ({ mint: row["mint"] as OperationId, attempt: row["attempt"] as number, id: row["id"] as string, ends: row["ends"] as Timestamp })),
      more: rows.length > limit,
    };
  }

  /**
   * Before DELETE leaves, bind its attempt to an exact private mint and ID.
   * A repeat is the same binding; a conflict changes nothing. This records
   * an expectation, never a host answer or proof of revocation.
   */
  expectRevoke(expected: ExpectedRevocation): boolean {
    const scope = this.#scope();
    if (scope === null) return false;
    const credential = this.#sql.exec("SELECT id FROM private_credential WHERE scope = ? AND mint = ? AND attempt = ?", scope, expected.mint, expected.mintAttempt).toArray()[0];
    if (credential?.["id"] !== expected.id) return false;
    const existing = this.#sql.exec("SELECT mint, mint_attempt, id FROM private_credential_revocation WHERE scope = ? AND revoke = ? AND attempt = ?", scope, expected.revoke, expected.attempt).toArray()[0];
    if (existing) return existing["mint"] === expected.mint && existing["mint_attempt"] === expected.mintAttempt && existing["id"] === expected.id;
    this.#sql.exec("INSERT INTO private_credential_revocation (scope, revoke, attempt, mint, mint_attempt, id) VALUES (?, ?, ?, ?, ?, ?)", scope, expected.revoke, expected.attempt, expected.mint, expected.mintAttempt, expected.id).toArray();
    return true;
  }

  /** Bounded metadata of expected revocations still awaiting the caller's verified committed answer, never plaintext or an inferred answer. */
  revocations(after: RevocationPosition | null, limit: number): { items: ExpectedRevocation[]; more: boolean } {
    const scope = this.#scope();
    if (scope === null || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(limit + 1)) return { items: [], more: false };
    const rows = after === null
      ? this.#sql.exec("SELECT revoke, attempt, mint, mint_attempt, id FROM private_credential_revocation WHERE scope = ? AND done = 0 ORDER BY revoke, attempt LIMIT ?", scope, limit + 1).toArray()
      : this.#sql.exec("SELECT revoke, attempt, mint, mint_attempt, id FROM private_credential_revocation WHERE scope = ? AND done = 0 AND (revoke, attempt) > (?, ?) ORDER BY revoke, attempt LIMIT ?", scope, after.revoke, after.attempt, limit + 1).toArray();
    return {
      items: rows.slice(0, limit).map((row) => ({ revoke: row["revoke"] as OperationId, attempt: row["attempt"] as number, mint: row["mint"] as OperationId, mintAttempt: row["mint_attempt"] as number, id: row["id"] as string })),
      more: rows.length > limit,
    };
  }

  /** An explicit private read, including the plaintext, if custody still holds it. */
  read(mint: OperationId, attempt: number): ScopePrivateCredential | null {
    const scope = this.#scope();
    return scope === null ? null : this.#read(scope, mint, attempt);
  }

  /** An explicit private read of a usable token for that exact mint attempt, strictly before its end time. */
  live(mint: OperationId, attempt: number, now: Timestamp): ScopePrivateCredential | null {
    const credential = this.read(mint, attempt);
    const at = timeMs(now);
    const ends = credential ? timeMs(credential.ends) : null;
    return credential?.state === "live" && credential.plaintext !== null && credential.plaintext !== "" && at !== null && ends !== null && at < ends ? credential : null;
  }

  /** The custody row of that credential ID, including its plaintext if custody still holds it. An explicit private read. */
  held(id: string): ScopePrivateCredential | null {
    const scope = this.#scope();
    const row = scope === null ? undefined : this.#sql.exec("SELECT mint, attempt FROM private_credential WHERE scope = ? AND id = ?", scope, id).toArray()[0];
    return row ? this.#read(scope!, row["mint"] as OperationId, row["attempt"] as number) : null;
  }

  /**
   * The one-time take of a live plaintext by its ID (a member's read token, I5): strictly before its end, the plaintext is
   * returned and dropped from custody in the same step, so no second take finds it. At or after its end it is dropped and
   * nothing is returned. A held, revoked or dropped row returns nothing and changes nothing.
   */
  take(id: string, now: Timestamp): (ScopePrivateCredential & { plaintext: string }) | null {
    const credential = this.held(id);
    const scope = this.#scope();
    if (scope === null || credential?.state !== "live" || credential.plaintext === null || credential.plaintext === "") return null;
    this.#sql.exec("UPDATE private_credential SET plaintext = NULL WHERE scope = ? AND id = ?", scope, id).toArray();
    const [at, ends] = [timeMs(now), timeMs(credential.ends)];
    return at !== null && ends !== null && at < ends ? { ...credential, plaintext: credential.plaintext } : null;
  }

  /**
   * The caller has checked a mint's judgment. Only its exact confirmed live
   * metadata makes custody live. A rejected or mismatched judgment drops
   * plaintext without claiming the provider revoked anything. Confirmed
   * metadata records `live` even if custody lost the secret; the returned
   * boolean says whether custody still has usable plaintext.
   */
  judged(mint: OperationId, attempt: number, confirmed: CredentialReply | null): boolean {
    const scope = this.#scope();
    if (scope === null) return false;
    const credential = this.#read(scope, mint, attempt);
    if (!credential) return false;
    if (confirmed === null || credential.id !== confirmed.id || credential.ends !== confirmed.ends) {
      this.#sql.exec("UPDATE private_credential SET plaintext = NULL WHERE scope = ? AND mint = ? AND attempt = ?", scope, mint, attempt).toArray();
      return false;
    }
    if (credential.state === "revoked") return false;
    this.#sql.exec("UPDATE private_credential SET state = 'live' WHERE scope = ? AND mint = ? AND attempt = ?", scope, mint, attempt).toArray();
    return credential.plaintext !== null && credential.plaintext !== "";
  }

  /**
   * The caller verified an actual committed revocation answer. The update
   * and its trigger atomically drop plaintext and complete every matching
   * expected binding. No expiry, rejection or dropped plaintext calls this.
   */
  revoked(mint: OperationId, attempt: number): boolean {
    const scope = this.#scope();
    if (scope === null || !this.#read(scope, mint, attempt)) return false;
    this.#sql.exec("UPDATE private_credential SET state = 'revoked', plaintext = NULL WHERE scope = ? AND mint = ? AND attempt = ?", scope, mint, attempt).toArray();
    return true;
  }
}
