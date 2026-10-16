import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import {
  artistaCadastroSchema, bancoCadastroSchema, contratanteCadastroSchema, empresaCadastroSchema,
  pessoaCadastroSchema, planoContasCadastroSchema, usuarioCadastroSchema,
  type ArtistaCadastroInput, type BancoCadastroInput, type EmpresaCadastroInput,
  type PessoaCadastroInput, type PlanoContasCadastroInput,
} from "@camarote/shared";
import { z } from "zod";
import { authorizeModulo, authenticate, hasEmpresaAccess, hashToken } from "../auth.js";
import { pool } from "../database.js";
import { WahaApiService } from "../integrations/waha-api.service.js";

const idParams = z.object({ id: z.string().uuid() });
const nullable = (value: string | null | undefined) => value || null;
const addressJson = (value: string | null | undefined) => value ? JSON.stringify({ formatted: value }) : null;
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

function moduleLabel(table: string): string {
  const labels: Record<string, string> = {
    usuario_empresas: "Empresas",
    usuario_artistas: "Artistas",
    usuarios: "Usuários",
    empresas: "Empresas",
    eventos: "Eventos / Agenda",
    contratos: "Contratos",
    recebimentos_banda: "Banda / Recebimentos",
    cobrancas: "Banda / Cobrança",
    historicos_cobranca: "Banda / Cobrança",
    negociacoes: "Banda / Negociações",
    contas: "Financeiro / Pagar e Receber",
    movimentacoes: "Financeiro / Pagar e Receber",
    cheques: "Financeiro / Pagar e Receber",
    planos_contas: "Financeiro / Plano de Contas",
    arquivos: "Arquivos",
    clientes: "Clientes",
    fornecedores: "Fornecedores",
    contratantes: "Contratantes",
    artistas: "Artistas",
    bancos: "Financeiro / Bancos",
    documentos_rh: "RH",
    planos_viagem: "Viagens",
    auditoria: "Auditoria",
  };
  return labels[table] ?? table.split("_").map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1)).join(" ");
}

async function findRecordModules(client: PoolClient, tableName: string, recordId: string, actorId?: string): Promise<string[]> {
  const foreignKeys = await client.query<{ schema_name: string; table_name: string; column_name: string }>(
    `SELECT DISTINCT source_ns.nspname AS schema_name, source_table.relname AS table_name, source_column.attname AS column_name
     FROM pg_constraint fk
     JOIN pg_class source_table ON source_table.oid=fk.conrelid
     JOIN pg_namespace source_ns ON source_ns.oid=source_table.relnamespace
     JOIN LATERAL unnest(fk.conkey, fk.confkey) AS key_columns(source_attnum, target_attnum) ON true
     JOIN pg_attribute source_column ON source_column.attrelid=fk.conrelid AND source_column.attnum=key_columns.source_attnum
     JOIN pg_attribute target_column ON target_column.attrelid=fk.confrelid AND target_column.attnum=key_columns.target_attnum
     WHERE fk.contype='f' AND fk.confrelid=to_regclass($1) AND target_column.attname='id'
     ORDER BY source_ns.nspname, source_table.relname, source_column.attname`,
    [`public.${tableName}`],
  );
  const modules = new Set<string>();
  for (const foreignKey of foreignKeys.rows) {
    if (tableName === "usuarios" && ["tokens_acesso", "tokens_refresh"].includes(foreignKey.table_name)) continue;
    const source = `${quoteIdentifier(foreignKey.schema_name)}.${quoteIdentifier(foreignKey.table_name)}`;
    const column = quoteIdentifier(foreignKey.column_name);
    let linked;
    if (tableName === "empresas" && actorId && foreignKey.table_name === "usuario_empresas") {
      linked = await client.query(`SELECT EXISTS(SELECT 1 FROM ${source} WHERE ${column}=$1 AND usuario_id<>$2) AS linked`, [recordId, actorId]);
    } else if (tableName === "empresas" && actorId && foreignKey.table_name === "usuarios") {
      linked = await client.query(`SELECT EXISTS(SELECT 1 FROM ${source} WHERE ${column}=$1 AND id<>$2) AS linked`, [recordId, actorId]);
    } else {
      linked = await client.query(`SELECT EXISTS(SELECT 1 FROM ${source} WHERE ${column}=$1) AS linked`, [recordId]);
    }
    if (linked.rows[0]?.linked) {
      const label = foreignKey.table_name === "usuario_artistas"
        ? (tableName === "artistas" ? "Usuários" : "Artistas")
        : foreignKey.table_name === "usuario_empresas"
          ? (tableName === "empresas" ? "Usuários" : "Empresas")
          : moduleLabel(foreignKey.table_name);
      modules.add(label);
    }
  }
  return [...modules].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function recordLinksMessage(title: string, modules: string[]): string {
  return modules.length
    ? `Não é possível excluir ${title.toLocaleLowerCase("pt-BR")}: existem vínculos nos módulos ${modules.join(", ")}.`
    : `${title} não possui vínculos com outros módulos.`;
}

async function findUserModules(client: PoolClient, userId: string): Promise<string[]> {
  const foreignKeys = await client.query<{ schema_name: string; table_name: string; column_name: string }>(
    `SELECT DISTINCT source_ns.nspname AS schema_name, source_table.relname AS table_name, source_column.attname AS column_name
     FROM pg_constraint fk
     JOIN pg_class source_table ON source_table.oid=fk.conrelid
     JOIN pg_namespace source_ns ON source_ns.oid=source_table.relnamespace
     JOIN LATERAL unnest(fk.conkey, fk.confkey) AS key_columns(source_attnum, target_attnum) ON true
     JOIN pg_attribute source_column ON source_column.attrelid=fk.conrelid AND source_column.attnum=key_columns.source_attnum
     JOIN pg_attribute target_column ON target_column.attrelid=fk.confrelid AND target_column.attnum=key_columns.target_attnum
     WHERE fk.contype='f' AND fk.confrelid=to_regclass('public.usuarios') AND target_column.attname='id'
     ORDER BY source_ns.nspname, source_table.relname, source_column.attname`,
  );
  const modules = new Set<string>();
  for (const foreignKey of foreignKeys.rows) {
    // Session and access tokens are technical rows and are removed with the user; they are not module records.
    if (foreignKey.table_name === "tokens_acesso" || foreignKey.table_name === "tokens_refresh") continue;
    const table = `${quoteIdentifier(foreignKey.schema_name)}.${quoteIdentifier(foreignKey.table_name)}`;
    const column = quoteIdentifier(foreignKey.column_name);
    const linked = await client.query<{ linked: boolean }>(`SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${column}=$1) AS linked`, [userId]);
    if (!linked.rows[0]?.linked) continue;

    if (foreignKey.table_name === "arquivos") {
      const contexts = await client.query<{ contexto: string }>(
        `SELECT DISTINCT contexto::text AS contexto FROM ${table} WHERE ${column}=$1`, [userId],
      );
      for (const { contexto } of contexts.rows) {
        modules.add(({ evento: "Eventos / Agenda", contrato: "Contratos", financeiro: "Financeiro / Pagar e Receber", rh: "RH", geral: "Arquivos" } as Record<string, string>)[contexto] ?? "Arquivos");
      }
    } else if (foreignKey.table_name === "auditoria") {
      const changedTables = await client.query<{ tabela: string }>(
        `SELECT DISTINCT tabela FROM ${table} WHERE ${column}=$1`, [userId],
      );
      modules.add("Auditoria");
      for (const { tabela: changedTable } of changedTables.rows) modules.add(moduleLabel(changedTable));
    } else {
      modules.add(moduleLabel(foreignKey.table_name));
    }
  }
  return [...modules].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function userModulesMessage(modules: string[]): string {
  return modules.length
    ? `Não é possível excluir este usuário: existem vínculos nos módulos ${modules.join(", ")}.`
    : "Este usuário não possui vínculos com outros módulos.";
}

function companyLinksMessage(bancos: boolean, usuarios: string[], modules: string[] = []): string {
  const links: string[] = [];
  if (bancos) links.push("há bancos vinculados");
  if (usuarios.length) links.push(`ela está vinculada aos usuários ${usuarios.join(", ")}`);
  const otherModules = modules.filter((module) => !["Bancos", "Usuários", "Empresas"].includes(module));
  if (otherModules.length) links.push(`há registros vinculados nos módulos ${otherModules.join(", ")}`);
  return `Não é possível excluir esta empresa: ${links.join("; ")}.`;
}

async function actorCompanies(userId: string): Promise<string[]> {
  const result = await pool.query<{ empresa_id: string }>("SELECT empresa_id FROM usuario_empresas WHERE usuario_id=$1", [userId]);
  return result.rows.map((row) => row.empresa_id);
}

async function activeCompany(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const user = request.authUser!;
  if (!user.empresaPadraoId) { reply.code(409).send({ message: "Selecione uma empresa padrão antes de acessar os cadastros." }); return null; }
  if (!(await hasEmpresaAccess(user.id, user.empresaPadraoId))) { reply.code(403).send({ message: "A empresa padrão não está vinculada ao seu usuário." }); return null; }
  const company = await pool.query("SELECT 1 FROM empresas WHERE id=$1 AND status='ativo'", [user.empresaPadraoId]);
  if (!company.rowCount) { reply.code(403).send({ message: "A empresa padrão está inativa." }); return null; }
  return user.empresaPadraoId;
}

function errorResponse(error: unknown, reply: FastifyReply, duplicateMessage: string) {
  const code = (error as { code?: string })?.code;
  if (code === "23505") return reply.code(409).send({ message: duplicateMessage });
  if (code === "23503") return reply.code(409).send({ message: "Este cadastro possui vínculos e não pode ser excluído ou alterado." });
  throw error;
}

type Catalog = {
  path: string; table: string; schema: z.ZodType; title: string;
  columns: string[]; global?: boolean; address?: boolean; searchColumn?: string; searchColumns?: string[]; dependencies?: Array<[string, string]>;
};
const catalogs: Catalog[] = [
  { path: "clientes", table: "clientes", schema: pessoaCadastroSchema, title: "Cliente", columns: ["nome", "cpf_cnpj", "email", "celular", "responsavel", "observacoes", "endereco", "numero", "complemento", "status"], address: true, searchColumn: "cpf_cnpj", searchColumns: ["email"], dependencies: [["eventos", "cliente_id"]] },
  { path: "fornecedores", table: "fornecedores", schema: pessoaCadastroSchema, title: "Fornecedor", columns: ["nome", "cpf_cnpj", "email", "celular", "responsavel", "observacoes", "endereco", "numero", "complemento", "status"], address: true, searchColumn: "cpf_cnpj", searchColumns: ["email"], dependencies: [["contas", "fornecedor_id"]] },
  { path: "contratantes", table: "contratantes", schema: contratanteCadastroSchema, title: "Contratante", columns: ["nome", "cpf_cnpj", "email", "celular", "responsavel", "observacoes", "status"], searchColumn: "cpf_cnpj", searchColumns: ["email"], dependencies: [["eventos", "contratante_id"], ["contratos", "contratante_id"]] },
  { path: "artistas", table: "artistas", schema: artistaCadastroSchema, title: "Artista", global: true, columns: ["nome", "email", "celular", "responsavel", "comissao_camarote", "imposto", "status"], searchColumns: ["responsavel", "email"], dependencies: [["eventos", "artista_id"], ["contratos", "artista_id"]] },
  { path: "planos-de-contas", table: "planos_contas", schema: planoContasCadastroSchema, title: "Plano de Contas", columns: ["nome", "categoria", "tipo"], dependencies: [["contas", "plano_contas_id"], ["movimentacoes", "plano_contas_id"]] },
];

export async function cadastrosRoutes(app: FastifyInstance): Promise<void> {
  const whatsapp = new WahaApiService();
  const readGuard = [authenticate, authorizeModulo("cadastros", "leitura")];
  const writeGuard = [authenticate, authorizeModulo("cadastros", "escrita")];

  app.get("/empresas", { preHandler: readGuard }, async (request) => {
    const query = z.object({ q: z.string().trim().max(120).optional() }).parse(request.query);
    const companies = await pool.query(
      `SELECT e.id,e.nome,e.cnpj,e.email,e.fone,e.endereco,e.numero,e.complemento,e.responsavel,e.padrao,e.status
       FROM empresas e JOIN usuario_empresas ue ON ue.empresa_id=e.id
       WHERE ue.usuario_id=$1 AND e.nome <> 'INDEFINIDO'
         AND ($2::text IS NULL OR e.nome ILIKE '%'||$2||'%' OR e.cnpj ILIKE '%'||$2||'%' OR e.email ILIKE '%'||$2||'%')
       ORDER BY e.nome`, [request.authUser!.id, query.q ?? null],
    );
    return companies.rows;
  });

  app.post("/empresas", { preHandler: writeGuard }, async (request, reply) => {
    const parsed = empresaCadastroSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Confira os dados da empresa.", issues: parsed.error.issues });
    const data = parsed.data as EmpresaCadastroInput;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<{ id: string }>(
        `INSERT INTO empresas(nome,status,cnpj,email,fone,responsavel,endereco,numero,complemento)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING id`,
        [data.nome, data.status, nullable(data.cnpj), nullable(data.email), nullable(data.fone), nullable(data.responsavel), addressJson(data.endereco), nullable(data.numero), nullable(data.complemento)],
      );
      const empresaId = created.rows[0]!.id;
      await client.query("INSERT INTO usuario_empresas(usuario_id,empresa_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [request.authUser!.id, empresaId]);
      await client.query("COMMIT");
      return reply.code(201).send({ id: empresaId });
    } catch (error) { await client.query("ROLLBACK"); return errorResponse(error, reply, "Já existe uma empresa com este CNPJ."); }
    finally { client.release(); }
  });

  app.patch("/empresas/:id", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params); const parsed = empresaCadastroSchema.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ message: "Confira os dados da empresa.", issues: parsed.success ? undefined : parsed.error.issues });
    if (!(await hasEmpresaAccess(request.authUser!.id, params.data.id))) return reply.code(404).send({ message: "Empresa não encontrada." });
    const d = parsed.data as EmpresaCadastroInput;
    try {
      const updated = await pool.query(
        `UPDATE empresas SET nome=$1,status=$2,cnpj=$3,email=$4,fone=$5,responsavel=$6,endereco=$7::jsonb,numero=$8,complemento=$9,updated_at=now() WHERE id=$10 RETURNING id`,
        [d.nome, d.status, nullable(d.cnpj), nullable(d.email), nullable(d.fone), nullable(d.responsavel), addressJson(d.endereco), nullable(d.numero), nullable(d.complemento), params.data.id],
      );
      return updated.rows[0];
    } catch (error) { return errorResponse(error, reply, "Já existe uma empresa com este CNPJ."); }
  });

  app.delete("/empresas/:id", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Empresa inválida." });
    const empresaId = params.data.id;
    if (!(await hasEmpresaAccess(request.authUser!.id, empresaId))) return reply.code(404).send({ message: "Empresa não encontrada." });
    const refs = await pool.query<{ bancos: boolean; eventos: boolean; contas: boolean; usuarios: string[]; padrao: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM bancos WHERE empresa_id=$1) AS bancos,
       EXISTS(SELECT 1 FROM eventos WHERE empresa_id=$1) AS eventos,
       EXISTS(SELECT 1 FROM contas WHERE empresa_id=$1) AS contas,
       ARRAY(SELECT u.nome FROM usuario_empresas ue JOIN usuarios u ON u.id=ue.usuario_id WHERE ue.empresa_id=$1 AND ue.usuario_id<>$2 ORDER BY u.nome) AS usuarios,
       (SELECT padrao FROM empresas WHERE id=$1) AS padrao`, [empresaId, request.authUser!.id],
    );
    const found = refs.rows[0]!;
    const linksClient = await pool.connect();
    let modules: string[];
    try { modules = await findRecordModules(linksClient, "empresas", empresaId, request.authUser!.id); }
    finally { linksClient.release(); }
    if (found.bancos || found.usuarios.length || found.eventos || found.contas || modules.length) {
      return reply.code(409).send({ message: companyLinksMessage(found.bancos, found.usuarios, modules), modules });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const replacement = await client.query<{id:string}>("SELECT e.id FROM empresas e JOIN usuario_empresas ue ON ue.empresa_id=e.id WHERE ue.usuario_id=$1 AND e.id<>$2 AND e.status='ativo' ORDER BY e.padrao DESC,e.nome LIMIT 1", [request.authUser!.id, empresaId]);
      const replacementId = replacement.rows[0]?.id ?? null;
      if (found.padrao && replacementId) await client.query("UPDATE empresas SET padrao=true WHERE id=$1", [replacementId]);
      await client.query("UPDATE usuarios SET empresa_padrao_id=$1 WHERE id=$2 AND empresa_padrao_id=$3", [replacementId,request.authUser!.id,empresaId]);
      await client.query("DELETE FROM usuario_empresas WHERE usuario_id=$1 AND empresa_id=$2", [request.authUser!.id,empresaId]);
      await client.query("DELETE FROM empresas WHERE id=$1", [empresaId]);
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch(error) { await client.query("ROLLBACK"); return errorResponse(error, reply, "Não foi possível excluir a empresa."); }
    finally { client.release(); }
  });

  app.get("/empresas/:id/vinculos", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Empresa inválida." });
    if (!(await hasEmpresaAccess(request.authUser!.id, params.data.id))) return reply.code(404).send({ message: "Empresa não encontrada." });
    const result = await pool.query<{ bancos: boolean; usuarios: string[] }>(
      `SELECT EXISTS(SELECT 1 FROM bancos WHERE empresa_id=$1) AS bancos,
       ARRAY(SELECT u.nome FROM usuario_empresas ue JOIN usuarios u ON u.id=ue.usuario_id WHERE ue.empresa_id=$1 AND ue.usuario_id<>$2 ORDER BY u.nome) AS usuarios`,
      [params.data.id, request.authUser!.id],
    );
    const bancos = Boolean(result.rows[0]?.bancos);
    const usuarios = result.rows[0]?.usuarios ?? [];
    const client = await pool.connect();
    let modules: string[];
    try { modules = await findRecordModules(client, "empresas", params.data.id, request.authUser!.id); }
    catch (error) { return errorResponse(error, reply, "Não foi possível consultar os vínculos da empresa."); }
    finally { client.release(); }
    return {
      bancos,
      usuarios,
      modules,
      message: bancos || usuarios.length || modules.length ? companyLinksMessage(bancos, usuarios, modules) : "Esta empresa não possui vínculos com outros módulos.",
    };
  });

  app.get("/empresas/:id/bancos", { preHandler: readGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success || !(await hasEmpresaAccess(request.authUser!.id, params.data.id))) return reply.code(404).send({ message: "Empresa não encontrada." });
    const banks = await pool.query("SELECT id,empresa_id,nome,codigo,agencia,conta FROM bancos WHERE empresa_id=$1 ORDER BY nome", [params.data.id]);
    return banks.rows;
  });

  app.post("/empresas/:id/bancos", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params); const parsed = bancoCadastroSchema.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ message: "Confira os dados do banco." });
    if (!(await hasEmpresaAccess(request.authUser!.id, params.data.id))) return reply.code(404).send({ message: "Empresa não encontrada." });
    const d = parsed.data as BancoCadastroInput;
    const result = await pool.query("INSERT INTO bancos(empresa_id,nome,codigo,agencia,conta) VALUES($1,$2,$3,$4,$5) RETURNING id", [params.data.id,d.nome,nullable(d.codigo),nullable(d.agencia),nullable(d.conta)]);
    return reply.code(201).send({ id: result.rows[0]!.id });
  });

  app.patch("/bancos/:id", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params); const parsed = bancoCadastroSchema.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ message: "Confira os dados do banco." });
    const bank = await pool.query<{ empresa_id: string }>("SELECT empresa_id FROM bancos WHERE id=$1", [params.data.id]);
    if (!bank.rows[0] || !(await hasEmpresaAccess(request.authUser!.id, bank.rows[0].empresa_id))) return reply.code(404).send({ message: "Banco não encontrado." });
    const d = parsed.data as BancoCadastroInput;
    await pool.query("UPDATE bancos SET nome=$1,codigo=$2,agencia=$3,conta=$4 WHERE id=$5", [d.nome,nullable(d.codigo),nullable(d.agencia),nullable(d.conta),params.data.id]);
    return { id: params.data.id };
  });

  app.get("/bancos/:id/vinculos", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Banco inválido." });
    const bank = await pool.query<{ empresa_id: string }>("SELECT empresa_id FROM bancos WHERE id=$1", [params.data.id]);
    if (!bank.rows[0] || !(await hasEmpresaAccess(request.authUser!.id, bank.rows[0].empresa_id))) return reply.code(404).send({ message: "Banco não encontrado." });
    const client = await pool.connect();
    try {
      const modules = await findRecordModules(client, "bancos", params.data.id);
      return { modules, message: recordLinksMessage("Banco", modules) };
    } catch (error) { return errorResponse(error, reply, "Não foi possível consultar os vínculos do banco."); }
    finally { client.release(); }
  });

  app.delete("/bancos/:id", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Banco inválido." });
    const bank = await pool.query<{ empresa_id: string }>("SELECT empresa_id FROM bancos WHERE id=$1", [params.data.id]);
    if (!bank.rows[0] || !(await hasEmpresaAccess(request.authUser!.id, bank.rows[0].empresa_id))) return reply.code(404).send({ message: "Banco não encontrado." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM bancos WHERE id=$1 FOR UPDATE", [params.data.id]);
      const modules = await findRecordModules(client, "bancos", params.data.id);
      if (modules.length) { await client.query("ROLLBACK"); return reply.code(409).send({ message: recordLinksMessage("Banco", modules), modules }); }
      await client.query("DELETE FROM bancos WHERE id=$1", [params.data.id]);
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) { await client.query("ROLLBACK"); return errorResponse(error, reply, "Não foi possível excluir o banco."); }
    finally { client.release(); }
  });

  for (const catalog of catalogs) {
    const table = catalog.table;
    app.get(`/${catalog.path}`, { preHandler: readGuard }, async (request, reply) => {
      const companyId = catalog.global ? null : await activeCompany(request, reply); if (!catalog.global && !companyId) return;
      const query = z.object({ q: z.string().trim().max(120).optional(), documento: z.string().trim().max(30).optional(), status: z.enum(["ativo", "inativo"]).optional() }).safeParse(request.query);
      if (!query.success) return reply.code(400).send({ message: "Filtros inválidos." });
      const conditions = catalog.global ? [] : ["empresa_id=$1"]; const values: unknown[] = catalog.global ? [] : [companyId];
      if (query.data.q) {
        values.push(`%${query.data.q.toLocaleUpperCase("pt-BR")}%`);
        const qIndex = values.length;
        const searchColumns = [catalog.searchColumn, ...(catalog.searchColumns ?? [])].filter((column): column is string => Boolean(column));
        let searchCondition = [`nome ILIKE $${qIndex}`, ...searchColumns.map((column) => `${column} ILIKE $${qIndex}`)].join(" OR ");
        const queryDigits = query.data.q.replace(/\D/g, "");
        if (queryDigits && catalog.searchColumn === "cpf_cnpj") {
          values.push(`%${queryDigits}%`);
          searchCondition += ` OR regexp_replace(${catalog.searchColumn}, '[^0-9]', '', 'g') ILIKE $${values.length}`;
        }
        conditions.push(`(${searchCondition})`);
      }
      const documentDigits = query.data.documento?.replace(/\D/g, "");
      if (documentDigits && catalog.searchColumn === "cpf_cnpj") {
        values.push(`%${documentDigits}%`);
        conditions.push(`regexp_replace(${catalog.searchColumn}, '[^0-9]', '', 'g') ILIKE $${values.length}`);
      }
      if (query.data.status) { values.push(query.data.status); conditions.push(`status=$${values.length}`); }
      const result = await pool.query(`SELECT * FROM ${table}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY nome${catalog.global ? "" : " LIMIT 500"}`, values);
      return result.rows;
    });

    app.post(`/${catalog.path}`, { preHandler: writeGuard }, async (request, reply) => {
      const companyId = catalog.global ? null : await activeCompany(request, reply); if (!catalog.global && !companyId) return;
      const parsed = catalog.schema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ message: `Confira os dados: ${catalog.title.toLocaleLowerCase("pt-BR")} com campos inválidos.`, issues: parsed.error.issues });
      const values = parsed.data as Record<string, unknown>;
      if (!catalog.global) values.empresa_id = companyId;
      if (catalog.address && values.endereco !== undefined) values.endereco = addressJson(values.endereco as string | null);
      const columns = Object.keys(values); const parameters = columns.map((_, index) => `$${index + 1}${columns[index] === "endereco" && catalog.address ? "::jsonb" : ""}`);
      try {
        const result = await pool.query(`INSERT INTO ${table}(${columns.join(",")}) VALUES(${parameters.join(",")}) RETURNING *`, columns.map((column) => values[column]));
        return reply.code(201).send(result.rows[0]);
      } catch (error) { return errorResponse(error, reply, `${catalog.title} já cadastrado com estes dados.`); }
    });

    app.patch(`/${catalog.path}/:id`, { preHandler: writeGuard }, async (request, reply) => {
      const params = idParams.safeParse(request.params); const parsed = (catalog.schema as z.ZodObject<any>).partial().safeParse(request.body);
      const companyId = catalog.global ? null : await activeCompany(request, reply); if (!catalog.global && !companyId) return;
      if (!params.success || !parsed.success) return reply.code(400).send({ message: "Confira os dados informados.", issues: parsed.success ? undefined : parsed.error.issues });
      const values = parsed.data as Record<string, unknown>;
      delete values.empresa_id;
      if (catalog.address && values.endereco !== undefined) values.endereco = addressJson(values.endereco as string | null);
      const columns = Object.keys(values);
      if (!columns.length) return reply.code(400).send({ message: "Informe ao menos um campo para atualizar." });
      const assignments = columns.map((column, index) => `${column}=$${index + 1}${column === "endereco" && catalog.address ? "::jsonb" : ""}`);
      try {
        const result = await pool.query(`UPDATE ${table} SET ${assignments.join(",")} WHERE id=$${columns.length + 1}${catalog.global ? "" : ` AND empresa_id=$${columns.length + 2}`} RETURNING *`, [...columns.map((column) => values[column]),params.data.id,...(catalog.global ? [] : [companyId])]);
        if (!result.rowCount) return reply.code(404).send({ message: `${catalog.title} não encontrado.` });
        return result.rows[0];
      } catch (error) { return errorResponse(error, reply, `${catalog.title} já cadastrado com estes dados.`); }
    });

    app.get(`/${catalog.path}/:id/vinculos`, { preHandler: writeGuard }, async (request, reply) => {
      const params = idParams.safeParse(request.params); const companyId = catalog.global ? null : await activeCompany(request, reply); if (!catalog.global && !companyId) return;
      if (!params.success) return reply.code(400).send({ message: "Cadastro inválido." });
      const client = await pool.connect();
      try {
        const found = await client.query(`SELECT 1 FROM ${table} WHERE id=$1${catalog.global ? "" : " AND empresa_id=$2"}`, catalog.global ? [params.data.id] : [params.data.id, companyId]);
        if (!found.rowCount) return reply.code(404).send({ message: `${catalog.title} não encontrado.` });
        const modules = await findRecordModules(client, table, params.data.id);
        return { modules, message: recordLinksMessage(catalog.title, modules) };
      } catch (error) { return errorResponse(error, reply, "Não foi possível consultar os vínculos do cadastro."); }
      finally { client.release(); }
    });

    app.delete(`/${catalog.path}/:id`, { preHandler: writeGuard }, async (request, reply) => {
      const params = idParams.safeParse(request.params); const companyId = catalog.global ? null : await activeCompany(request, reply); if (!catalog.global && !companyId) return;
      if (!params.success) return reply.code(400).send({ message: "Cadastro inválido." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query(`SELECT 1 FROM ${table} WHERE id=$1${catalog.global ? "" : " AND empresa_id=$2"} FOR UPDATE`, catalog.global ? [params.data.id] : [params.data.id,companyId]);
        if (!found.rowCount) { await client.query("ROLLBACK"); return reply.code(404).send({ message: `${catalog.title} não encontrado.` }); }
        const modules = await findRecordModules(client, table, params.data.id);
        if (modules.length) { await client.query("ROLLBACK"); return reply.code(409).send({ message: recordLinksMessage(catalog.title, modules), modules }); }
        const result = await client.query(`DELETE FROM ${table} WHERE id=$1${catalog.global ? "" : " AND empresa_id=$2"} RETURNING id`, catalog.global ? [params.data.id] : [params.data.id,companyId]);
        if (!result.rowCount) { await client.query("ROLLBACK"); return reply.code(404).send({ message: `${catalog.title} não encontrado.` }); }
        await client.query("COMMIT");
        return reply.code(204).send();
      } catch (error) { await client.query("ROLLBACK"); return errorResponse(error, reply, `Não foi possível excluir ${catalog.title.toLocaleLowerCase("pt-BR")}.`); }
      finally { client.release(); }
    });
  }

  app.get("/usuarios", { preHandler: readGuard }, async (request, reply) => {
    const companies = await actorCompanies(request.authUser!.id);
    const query = z.object({ q: z.string().trim().max(120).optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ message: "Filtro inválido." });
    const result = await pool.query(
      `SELECT u.id,u.email,u.nome,u.fone,u.perfil,u.status,u.pode_visualizar_relatorios,u.empresa_padrao_id,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome) ORDER BY e.nome) FROM usuario_empresas ue JOIN empresas e ON e.id=ue.empresa_id WHERE ue.usuario_id=u.id), '[]'::jsonb) AS empresas,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('artistaId',ua.artista_id,'nome',a.nome,'acessoTotal',ua.acesso_total) ORDER BY a.nome) FROM usuario_artistas ua JOIN artistas a ON a.id=ua.artista_id WHERE ua.usuario_id=u.id), '[]'::jsonb) AS artistas
       FROM usuarios u WHERE (NOT EXISTS(SELECT 1 FROM usuario_empresas own WHERE own.usuario_id=u.id)
       OR EXISTS(SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=ANY($1::uuid[])))
       AND ($2::text IS NULL OR u.nome ILIKE '%'||upper($2)||'%' OR u.email ILIKE '%'||lower($2)||'%') ORDER BY u.nome LIMIT 500`, [companies,query.data.q ?? null],
    );
    return result.rows;
  });

  app.get("/usuarios/artistas", { preHandler: readGuard }, async (request) => {
    const result = await pool.query(
      "SELECT id,nome FROM artistas WHERE status='ativo' ORDER BY nome",
    );
    return result.rows;
  });

  app.post("/usuarios", { preHandler: writeGuard }, async (request, reply) => {
    const parsed = usuarioCadastroSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Confira os dados do usuário.", issues: parsed.error.issues });
    const data = parsed.data;
    if (data.perfil === "super_administrador" && request.authUser!.perfil !== "super_administrador") return reply.code(403).send({ message: "Somente um superadministrador pode criar outro superadministrador." });
    const available = await actorCompanies(request.authUser!.id);
    if (data.empresaIds.some((id) => !available.includes(id))) return reply.code(403).send({ message: "Só é possível vincular o usuário às empresas em que você tem acesso." });
    if (data.empresaPadraoId && !data.empresaIds.includes(data.empresaPadraoId)) return reply.code(400).send({ message: "A empresa padrão deve estar entre as empresas selecionadas." });
    if (data.artistas.length) {
      const artistIds = [...new Set(data.artistas.map((item) => item.artistaId))];
      const validArtists = await pool.query("SELECT id FROM artistas WHERE id=ANY($1::uuid[]) AND status='ativo'", [artistIds]);
      if (validArtists.rowCount !== artistIds.length) return reply.code(400).send({ message: "Selecione apenas artistas ativos." });
    }
    const token = randomBytes(32).toString("base64url"); const client = await pool.connect(); let userId = "";
    try {
      await client.query("BEGIN");
      const created = await client.query<{ id: string }>(
        `INSERT INTO usuarios(email,nome,fone,perfil,status,pode_visualizar_relatorios,empresa_padrao_id)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [data.email,data.nome,data.fone,data.perfil,data.status,data.podeVisualizarRelatorios,data.empresaPadraoId],
      );
      userId = created.rows[0]!.id;
      await client.query("INSERT INTO usuario_empresas(usuario_id,empresa_id) SELECT $1,unnest($2::uuid[])", [userId,data.empresaIds]);
      if (data.artistas.length) await client.query("INSERT INTO usuario_artistas(usuario_id,artista_id,acesso_total) SELECT $1,x.artista_id,x.acesso_total FROM unnest($2::uuid[],$3::boolean[]) x(artista_id,acesso_total)", [userId,data.artistas.map((a) => a.artistaId),data.artistas.map((a) => a.acessoTotal)]);
      await client.query("INSERT INTO tokens_acesso(usuario_id,token_hash,finalidade,expira_em) VALUES($1,$2,'convite',now()+interval '48 hours')", [userId,hashToken(token)]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); return errorResponse(error, reply, "Já existe um usuário com este e-mail."); }
    finally { client.release(); }
    const url = `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/primeiro-acesso?token=${encodeURIComponent(token)}`;
    try { await whatsapp.sendText(data.fone, `Olá ${data.nome}, seu acesso ao Camarote Shows foi criado. Seu e-mail de acesso é: ${data.email}. Defina sua senha neste link, válido por 48 horas: ${url}`); }
    catch (error) { request.log.error({ err: error, userId }, "Usuário criado, mas o convite não foi enviado"); return reply.code(502).send({ id: userId, message: "Usuário criado, mas o convite não foi enviado. Confira a WAHA e solicite um novo acesso." }); }
    return reply.code(201).send({ id: userId, message: "Convite enviado pelo WhatsApp." });
  });

  app.patch("/usuarios/:id", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params); const parsed = usuarioCadastroSchema.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ message: "Confira os dados do usuário.", issues: parsed.success ? undefined : parsed.error.issues });
    const actor = request.authUser!; const data = parsed.data;
    if (params.data.id === actor.id) {
      const result = await pool.query(
        "UPDATE usuarios SET nome=$1,fone=$2,updated_at=now() WHERE id=$3",
        [data.nome,data.fone,actor.id],
      );
      if (!result.rowCount) return reply.code(404).send({ message: "Usuário não encontrado." });
      return { id: actor.id, message: "Dados pessoais atualizados." };
    }
    if (data.perfil === "super_administrador" && actor.perfil !== "super_administrador") return reply.code(403).send({ message: "Somente um superadministrador pode definir esse perfil." });
    const available = await actorCompanies(actor.id);
    const target = await pool.query("SELECT 1 FROM usuarios u WHERE u.id=$1 AND (NOT EXISTS(SELECT 1 FROM usuario_empresas own WHERE own.usuario_id=u.id) OR EXISTS(SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=ANY($2::uuid[])))", [params.data.id,available]);
    if (!target.rowCount) return reply.code(404).send({ message: "Usuário não encontrado nas suas empresas." });
    if (data.empresaIds.some((id) => !available.includes(id))) return reply.code(403).send({ message: "Só é possível vincular o usuário às empresas em que você tem acesso." });
    if (data.empresaPadraoId && !data.empresaIds.includes(data.empresaPadraoId)) return reply.code(400).send({ message: "A empresa padrão deve estar entre as empresas selecionadas." });
    const artistIds = [...new Set(data.artistas.map((item) => item.artistaId))];
    if (artistIds.length) {
      const validArtists = await pool.query("SELECT id FROM artistas WHERE id=ANY($1::uuid[]) AND status='ativo'", [artistIds]);
      if (validArtists.rowCount !== artistIds.length) return reply.code(400).send({ message: "Selecione apenas artistas ativos." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET CONSTRAINTS usuarios_empresa_padrao_vinculada_fk DEFERRED");
      await client.query("INSERT INTO usuario_empresas(usuario_id,empresa_id) SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING", [params.data.id,data.empresaIds]);
      if (!data.empresaPadraoId) await client.query("UPDATE usuarios SET empresa_padrao_id=NULL WHERE id=$1", [params.data.id]);
      const result = await client.query("UPDATE usuarios SET nome=$1,fone=$2,perfil=$3,status=$4,pode_visualizar_relatorios=$5,empresa_padrao_id=$6,updated_at=now() WHERE id=$7", [data.nome,data.fone,data.perfil,data.status,data.podeVisualizarRelatorios,data.empresaPadraoId,params.data.id]);
      if (!result.rowCount) { await client.query("ROLLBACK"); return reply.code(404).send({ message: "Usuário não encontrado." }); }
      await client.query("SET CONSTRAINTS usuarios_empresa_padrao_vinculada_fk IMMEDIATE");
      await client.query("DELETE FROM usuario_empresas WHERE usuario_id=$1 AND NOT (empresa_id=ANY($2::uuid[]))", [params.data.id,data.empresaIds]);
      await client.query("DELETE FROM usuario_artistas WHERE usuario_id=$1", [params.data.id]);
      if (data.artistas.length) await client.query("INSERT INTO usuario_artistas(usuario_id,artista_id,acesso_total) SELECT $1,x.artista_id,x.acesso_total FROM unnest($2::uuid[],$3::boolean[]) x(artista_id,acesso_total)", [params.data.id,data.artistas.map((a) => a.artistaId),data.artistas.map((a) => a.acessoTotal)]);
      await client.query("COMMIT");
      return { id: params.data.id, message: "Usuário atualizado." };
    } catch (error) { await client.query("ROLLBACK"); return errorResponse(error, reply, "Não foi possível atualizar o usuário."); }
    finally { client.release(); }
  });

  app.delete("/usuarios/:id", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Usuário inválido." });
    const actor = request.authUser!;
    if (params.data.id === actor.id) return reply.code(409).send({ message: "Você não pode excluir o próprio usuário." });

    const available = await actorCompanies(actor.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query(
        "SELECT u.id FROM usuarios u WHERE u.id=$1 AND (NOT EXISTS(SELECT 1 FROM usuario_empresas own WHERE own.usuario_id=u.id) OR EXISTS(SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=ANY($2::uuid[]))) FOR UPDATE OF u",
        [params.data.id, available],
      );
      if (!target.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ message: "Usuário não encontrado nas suas empresas." });
      }
      const modules = await findUserModules(client, params.data.id);
      if (modules.length) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          message: userModulesMessage(modules),
          modules,
        });
      }

      await client.query("UPDATE usuarios SET empresa_padrao_id=NULL WHERE id=$1", [params.data.id]);
      await client.query("DELETE FROM usuarios WHERE id=$1", [params.data.id]);
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) {
      await client.query("ROLLBACK");
      return errorResponse(error, reply, "Não foi possível excluir o usuário.");
    } finally {
      client.release();
    }
  });

  app.get("/usuarios/:id/vinculos", { preHandler: writeGuard }, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Usuário inválido." });
    const available = await actorCompanies(request.authUser!.id);
    const client = await pool.connect();
    try {
      const target = await client.query(
        "SELECT 1 FROM usuarios u WHERE u.id=$1 AND (NOT EXISTS(SELECT 1 FROM usuario_empresas own WHERE own.usuario_id=u.id) OR EXISTS(SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=ANY($2::uuid[])))",
        [params.data.id, available],
      );
      if (!target.rowCount) return reply.code(404).send({ message: "Usuário não encontrado nas suas empresas." });
      const modules = await findUserModules(client, params.data.id);
      return { modules, message: userModulesMessage(modules) };
    } finally {
      client.release();
    }
  });
}
