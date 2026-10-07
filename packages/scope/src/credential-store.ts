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
export interface MintedCredential extends CredentialReply { mint: OperationId; attempt: number; plaintext: string }
export interface ScopePrivateCredential extends Omit<MintedCredential, "plaintext"> {
  plaintext: string | null;
  state: "held" | "live" | "revoked";
}
export type CredentialPut = "stored" | "repeat" | "conflict" | "no-scope";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS private_credential (
  scope TEXT NOT NULL, id TEXT NOT NULL, mint TEXT NOT NULL, attempt INTEGER NOT NULL,
  ends TEXT NOT NULL, plaintext TEXT, state TEXT NOT NULL CHECK (state IN ('held', 'live', 'revoked')),
  PRIMARY KEY (scope, id), UNIQUE (scope, mint, attempt)
) WITHOUT ROWID;
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

  /**
   * The caller has checked a mint's judgment. Only its exact confirmed live
   * metadata makes custody live. A rejected or mismatched judgment drops
   * plaintext without claiming the provider revoked anything.
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
    if (credential.state === "revoked" || credential.plaintext === null || credential.plaintext === "") return false;
    this.#sql.exec("UPDATE private_credential SET state = 'live' WHERE scope = ? AND mint = ? AND attempt = ?", scope, mint, attempt).toArray();
    return true;
  }

  /** The caller has an actual revocation answer. No expiry, rejection or dropped plaintext calls this automatically. */
  revoked(mint: OperationId, attempt: number): boolean {
    const scope = this.#scope();
    if (scope === null || !this.#read(scope, mint, attempt)) return false;
    this.#sql.exec("UPDATE private_credential SET state = 'revoked', plaintext = NULL WHERE scope = ? AND mint = ? AND attempt = ?", scope, mint, attempt).toArray();
    return true;
  }
}
