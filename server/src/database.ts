import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não configurada.");

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX ?? 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "camarote-shows-api",
});

export const auditContext = new AsyncLocalStorage<{ userId?: string }>();
const transactionState = new WeakMap<object, { active: boolean; actor: string | null }>();
pool.on("connect", (client) => {
  const original = client.query.bind(client) as (...args: any[]) => Promise<any>;
  transactionState.set(client, { active: false, actor: null });
  client.query = (async (...args: any[]) => {
    const query = args[0] as string | { text?: string };
    const statement = typeof query === "string" ? query : query.text ?? "";
    const state = transactionState.get(client)!;
    const actor = auditContext.getStore()?.userId;
    if (/^\s*BEGIN\b/i.test(statement)) {
      const result = await original(...args);
      state.active = true;
      state.actor = null;
      if (actor) {
        await original("SELECT set_config('app.usuario_id',$1,true)", [actor]);
        state.actor = actor;
      }
      return result;
    }
    if (/^\s*(COMMIT|ROLLBACK)\b/i.test(statement)) {
      try { return await original(...args); }
      finally { state.active = false; state.actor = null; }
    }
    if (!actor || !/^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(statement)) return original(...args);
    if (state.active) {
      if (state.actor !== actor) {
        await original("SELECT set_config('app.usuario_id',$1,true)", [actor]);
        state.actor = actor;
      }
      return original(...args);
    }
    await original("BEGIN");
    await original("SELECT set_config('app.usuario_id',$1,true)", [actor]);
    try {
      const result = await original(...args);
      await original("COMMIT");
      return result;
    } catch (error) {
      await original("ROLLBACK");
      throw error;
    }
  }) as pg.PoolClient["query"];
});

pool.on("error", (error) => {
  process.stderr.write(`Erro inesperado no pool PostgreSQL: ${error.message}\n`);
});
