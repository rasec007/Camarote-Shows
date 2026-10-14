import pg from "pg";

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

pool.on("error", (error) => {
  process.stderr.write(`Erro inesperado no pool PostgreSQL: ${error.message}\n`);
});
