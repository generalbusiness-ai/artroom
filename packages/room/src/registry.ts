/**
 * The deployment's one registry (R-GEN-13). It holds one binding per
 * repository identity: the room ID and the room's name. Each method runs
 * synchronously over the Durable Object's SQLite, so a bind is one atomic
 * step: the same binding again succeeds; any other use of the repository,
 * the room ID or the name is refused. A binding is never removed or moved.
 */

import { DurableObject } from "cloudflare:workers";
import type { RoomId, RoomRef } from "@generalbusiness/artroom-contract";
import { clock, type RoomEnv } from "./config.ts";
import { artroomError, wire, type Wire } from "./errors.ts";
import type { Sql } from "./ports.ts";
import { migrate, type Migration } from "./store.ts";

/** The registry's migrations, through the same mechanism as the Room's. */
export const REGISTRY_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "bindings",
    up: (sql) => {
      sql.all("CREATE TABLE IF NOT EXISTS bindings (repo TEXT PRIMARY KEY, room TEXT NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE)");
    },
  },
];

export interface Binding {
  readonly repo: string;
  readonly room: RoomId;
  readonly name: string;
}

export class Registry extends DurableObject<RoomEnv> {
  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    const sql: Sql = {
      all: (q, ...b) => ctx.storage.sql.exec(q, ...b).toArray() as ReturnType<Sql["all"]>,
      transaction: (fn) => ctx.storage.transactionSync(fn),
    };
    migrate(sql, REGISTRY_MIGRATIONS);
  }

  private row(query: string, value: string): Binding | null {
    const r = this.ctx.storage.sql.exec(query, value).toArray()[0] as Record<string, string> | undefined;
    return r ? { repo: r["repo"]!, room: r["room"] as RoomId, name: r["name"]! } : null;
  }

  /** Bind repository, room ID and name in one step (R-GEN-13). */
  /**
   * Bind atomically. `notAfter` is an import grant's deadline (epoch ms): a
   * first binding at or after it is refused, judged with the clock read here.
   * The same binding again succeeds whatever the time, so founding completes
   * forward after an interruption.
   */
  bind(repo: string, room: RoomId, name: string, notAfter?: number): Promise<Wire<"bound" | "already-bound">> {
    return wire(async () => {
      const byRepo = this.row("SELECT * FROM bindings WHERE repo = ?", repo);
      if (byRepo) {
        if (byRepo.room === room && byRepo.name === name) return "already-bound";
        throw artroomError("forbidden", "This repository is already bound to another room.");
      }
      if (notAfter !== undefined && notAfter <= clock()) throw artroomError("forbidden", "The grant has expired.");
      if (this.row("SELECT * FROM bindings WHERE room = ?", room)) throw artroomError("forbidden", "This room is already bound to another repository.");
      if (this.row("SELECT * FROM bindings WHERE name = ?", name)) throw artroomError("forbidden", "This name is already bound to another room.");
      this.ctx.storage.sql.exec("INSERT INTO bindings (repo, room, name) VALUES (?, ?, ?)", repo, room, name);
      return "bound";
    });
  }

  byRepo(repo: string): Promise<Binding | null> {
    return Promise.resolve(this.row("SELECT * FROM bindings WHERE repo = ?", repo));
  }

  /** A room by ID or by name (R-API-11). */
  lookup(ref: string): Promise<RoomRef | null> {
    const b = this.row("SELECT * FROM bindings WHERE room = ?", ref) ?? this.row("SELECT * FROM bindings WHERE name = ?", ref);
    return Promise.resolve(b ? { room: b.room, name: b.name } : null);
  }
}

/** The registry's stub. One per deployment. */
export function registry(env: RoomEnv): DurableObjectStub<Registry> {
  return env.REGISTRY.get(env.REGISTRY.idFromName("registry")) as unknown as DurableObjectStub<Registry>;
}
