import { DurableObject } from "cloudflare:workers";

/** An empty Durable Object: probes SQLite transaction behaviour, and hosts the storage conformance runs. */
export class Scratch extends DurableObject {
  async probe(): Promise<Record<string, unknown>> {
    const sql = this.ctx.storage.sql;
    const out: Record<string, unknown> = {};
    sql.exec("CREATE TABLE IF NOT EXISTS t (v TEXT)");
    try {
      sql.exec("SAVEPOINT s1");
      sql.exec("RELEASE s1");
      out["savepoint"] = "allowed";
    } catch (e) {
      out["savepoint"] = String(e);
    }
    try {
      await this.ctx.storage.transaction(async () => {
        sql.exec("INSERT INTO t VALUES ('a')");
        await Promise.resolve();
        sql.exec("INSERT INTO t VALUES ('b')");
        throw new Error("rollback please");
      });
    } catch (e) {
      out["asyncTxError"] = String(e);
    }
    out["afterAsyncTx"] = sql.exec("SELECT count(*) AS n FROM t").one();
    try {
      await this.ctx.storage.transaction(async () => {
        sql.exec("INSERT INTO t VALUES ('c')");
        await new Promise((r) => setTimeout(r, 5));
        sql.exec("INSERT INTO t VALUES ('d')");
      });
      out["asyncTxWithTimer"] = "ok";
    } catch (e) {
      out["asyncTxWithTimer"] = String(e);
    }
    out["afterTimerTx"] = sql.exec("SELECT count(*) AS n FROM t").one();
    return out;
  }
}
