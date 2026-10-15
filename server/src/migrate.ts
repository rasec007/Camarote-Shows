import "./env.js";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./database.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const client = await pool.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  // Registra o schema legado instalado manualmente antes da introdução do runner.
  // Assim, atualizar uma instalação existente não tenta recriar a migration inicial.
  const baseline = await client.query<{ has_schema: boolean; has_files: boolean; has_catalog_scope: boolean; has_contract_files: boolean }>(
    `SELECT to_regclass('public.empresas') IS NOT NULL AS has_schema,
            to_regclass('public.arquivos') IS NOT NULL AS has_files,
            EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='artistas' AND column_name='empresa_id') AS has_catalog_scope,
            to_regclass('public.contrato_arquivos') IS NOT NULL AS has_contract_files`,
  );
  const state = baseline.rows[0]!;
  const mark = async (name: string, exists: boolean) => { if (exists) await client.query("INSERT INTO schema_migrations(name) VALUES($1) ON CONFLICT DO NOTHING", [name]); };
  await mark("001_initial_schema.sql", state.has_schema);
  await mark("002_arquivos.sql", state.has_files);
  await mark("003_catalogos_por_empresa.sql", state.has_catalog_scope);
  await mark("004_eventos_contratos.sql", state.has_contract_files);
  const files = (await readdir(migrationsDir)).filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file)).sort();
  for (const name of files) {
    const exists = await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]);
    if (exists.rowCount) continue;
    const sql = (await readFile(join(migrationsDir, name), "utf8")).replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
    process.stdout.write(`Aplicando ${name}...\n`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
} finally { client.release(); await pool.end(); }
