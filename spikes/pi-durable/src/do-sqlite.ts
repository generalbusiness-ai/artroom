/**
 * pi-durable's portable SQLite facade (`SqliteDatabase`, from
 * `@earendil-works/pi-durable/storage/sqlite`) over a Durable Object's own
 * SQLite storage.
 *
 * pi-durable 1.0.0 ships Node, memory and JSONL adapters, and says its
 * portable core runs in a Durable Object "given an asynchronous SqliteDatabase
 * facade". This is that facade. Two facts about Durable Object SQLite shape
 * it (both measured in this spike, test/do-sqlite.test.ts):
 *
 * - `SAVEPOINT` (and, by its error message, `BEGIN TRANSACTION`) is refused
 *   by `sql.exec`; transactions must use `storage.transaction()` or
 *   `storage.transactionSync()`.
 * - `storage.transaction(async () => ...)` runs `sql.exec` writes inside it as
 *   one transaction, across awaits, and rolls them all back when the closure
 *   throws.
 *
 * The facade's contract (database.ts in pi-durable): operations run in call
 * order; a transaction holds every other operation until it settles; a
 * transaction handle stops working when its callback settles.
 */

import type { SqliteDatabase, SqliteExecutor, SqliteValue } from "@earendil-works/pi-durable/storage/sqlite";

type Bound = ArrayBuffer | string | number | null;

function bind(value: SqliteValue): Bound {
  if (value instanceof Uint8Array) return value.slice().buffer as ArrayBuffer;
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError("bigint out of the safe integer range");
    return Number(value);
  }
  return value;
}

function unbind(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof ArrayBuffer ? new Uint8Array(v) : v;
  return out;
}

class Executor implements SqliteExecutor {
  constructor(
    protected readonly sql: SqlStorage,
    private readonly live: () => boolean,
  ) {}

  #check(): void {
    if (!this.live()) throw new Error("This transaction handle has expired.");
  }

  async exec(text: string): Promise<void> {
    this.#check();
    this.sql.exec(text);
  }

  async run(text: string, ...params: SqliteValue[]): Promise<void> {
    this.#check();
    this.sql.exec(text, ...params.map(bind)).toArray();
  }

  async get<T extends object>(text: string, ...params: SqliteValue[]): Promise<T | undefined> {
    this.#check();
    const rows = this.sql.exec(text, ...params.map(bind)).toArray();
    return rows[0] === undefined ? undefined : (unbind(rows[0] as Record<string, unknown>) as T);
  }

  async all<T extends object>(text: string, ...params: SqliteValue[]): Promise<T[]> {
    this.#check();
    return this.sql.exec(text, ...params.map(bind)).toArray().map((r) => unbind(r as Record<string, unknown>) as T);
  }
}

/** One Durable Object's SQLite, as pi-durable's `SqliteDatabase`. The Durable Object must be the only user of these tables. */
export class DurableObjectSqlite implements SqliteDatabase {
  readonly #storage: DurableObjectStorage;
  readonly #direct: Executor;
  #tail: Promise<unknown> = Promise.resolve();
  #closed = false;

  constructor(storage: DurableObjectStorage) {
    this.#storage = storage;
    this.#direct = new Executor(storage.sql, () => !this.#closed);
  }

  /** Runs `op` after everything queued before it. */
  #queue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.#tail.then(op, op);
    this.#tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  exec(text: string): Promise<void> {
    return this.#queue(() => this.#direct.exec(text));
  }

  run(text: string, ...params: SqliteValue[]): Promise<void> {
    return this.#queue(() => this.#direct.run(text, ...params));
  }

  get<T extends object>(text: string, ...params: SqliteValue[]): Promise<T | undefined> {
    return this.#queue(() => this.#direct.get<T>(text, ...params));
  }

  all<T extends object>(text: string, ...params: SqliteValue[]): Promise<T[]> {
    return this.#queue(() => this.#direct.all<T>(text, ...params));
  }

  transaction<T>(callback: (transaction: SqliteExecutor) => Promise<T>): Promise<T> {
    return this.#queue(async () => {
      let live = true;
      try {
        // Rolls back every write made through the handle if the callback throws.
        return await this.#storage.transaction(() => callback(new Executor(this.#storage.sql, () => live && !this.#closed)));
      } finally {
        live = false;
      }
    });
  }

  async close(): Promise<void> {
    await this.#queue(async () => {
      this.#closed = true;
    });
  }
}
