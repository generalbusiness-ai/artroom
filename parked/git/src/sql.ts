/**
 * The synchronous SQLite surface this package needs. A Durable Object's
 * `ctx.storage.sql` provides it (see `durableSql`), and so does Node's
 * `node:sqlite` in tests (test/support.ts). Every method is synchronous, so a
 * transaction can never contain an `await` (R-LAND-7).
 */

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface Sql {
  /** Run a statement and return every row. */
  all(query: string, ...bindings: SqlValue[]): SqlRow[];
  /** Run `fn` atomically. A throw rolls back everything it wrote. Nesting is allowed. */
  transaction<T>(fn: () => T): T;
}

/** The parts of `DurableObjectStorage` used here. */
export interface DurableStorageLike {
  readonly sql: { exec(query: string, ...bindings: SqlValue[]): { toArray(): unknown[] } };
  transactionSync<T>(fn: () => T): T;
}

/** A Durable Object's SQLite storage as `Sql`. */
export function durableSql(storage: DurableStorageLike): Sql {
  return {
    all: (query, ...bindings) => storage.sql.exec(query, ...bindings).toArray() as SqlRow[],
    transaction: (fn) => storage.transactionSync(fn),
  };
}

/** Read one text column, or null. */
export function text(row: SqlRow | undefined, column: string): string | null {
  const v = row?.[column];
  return typeof v === "string" ? v : null;
}
