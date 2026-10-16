import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authorizeModulo, authenticate, hasEmpresaAccess, hasArtistaAccess } from "../auth.js";
import { pool } from "../database.js";
import { WahaApiService } from "../integrations/waha-api.service.js";

const idSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  artista_id: z.string().uuid(), contratante_id: z.string().uuid(), cliente_id: z.string().uuid().nullable().optional(),
  tipo_agendamento: z.enum(["show_particular","label","show","campanha_publica","compromisso","ensaio_fotos","ensaio_dvd","gravacao_clipe","gravacao_dvd","participacao_especial","presenca_vip","programa_tv_radio","reuniao","corporativo","outros"]),
  inicio: z.string().datetime(), nome: z.string().trim().max(240).optional(), cidade: z.string().trim().min(1).max(120), estado: z.string().trim().min(2).max(120),
  endereco: z.string().trim().max(500).optional(), local: z.string().trim().max(240).optional(), contratante_fone: z.string().trim().max(30).optional(),
  informacoes: z.string().trim().max(4000).optional(), cache: z.coerce.number().min(0), producao_local: z.coerce.number().min(0).default(0),
  diaria: z.coerce.number().min(0).default(0), imposto: z.coerce.number().min(0).default(0), comissao_pct: z.coerce.number().min(0).max(100).optional(),
  camarote: z.coerce.number().min(0).default(0), show_colocado: z.enum(["sim","nao"]).default("sim"), hospedagem: z.enum(["banda","contratante"]).default("banda"),
  publico_privado: z.enum(["publico","privado"]).default("publico"), nota_fiscal: z.enum(["sim","nao"]).default("nao"),
});
const blockSchema = z.object({ artista_id: z.string().uuid(), inicio: z.string().datetime(), informacoes: z.string().trim().max(4000).optional() });
const upper = (v: string | undefined) => v?.trim().toLocaleUpperCase("pt-BR") || null;
const whatsapp = new WahaApiService();
async function company(request: any, reply: any): Promise<string | null> {
  const id = request.authUser?.empresaPadraoId;
  if (!id) { reply.code(409).send({ message: "Selecione uma empresa padrão." }); return null; }
  if (!(await hasEmpresaAccess(request.authUser.id, id))) { reply.code(403).send({ message: "Empresa sem vínculo para este usuário." }); return null; }
  return id;
}
async function artistAllowed(user: { id: string; perfil: string }, artistId: string): Promise<boolean> {
  if (["super_administrador","administrador"].includes(user.perfil)) return true;
  return hasArtistaAccess(user.id, artistId);
}
function pgError(error: unknown, reply: any) {
  const code = (error as {code?:string})?.code;
  if (code === "23505" || code === "23P01") return reply.code(409).send({ message: "Já existe um evento ou bloqueio para este artista nesta data." });
  if (code === "23503") return reply.code(409).send({ message: "Artista, contratante ou cliente inválido para esta empresa." });
  throw error;
}

export async function eventosRoutes(app: FastifyInstance): Promise<void> {
  const read = [authenticate, authorizeModulo("eventos", "leitura")];
  const write = [authenticate, authorizeModulo("eventos", "escrita")];
  app.get("/eventos", { preHandler: read }, async (request, reply) => {
    const empresaId = await company(request, reply); if (!empresaId) return;
    const q = z.object({ de: z.string().date().optional(), ate: z.string().date().optional(), artista_id: z.string().uuid().optional(), contratante_id: z.string().uuid().optional(), estado: z.string().max(120).optional() }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ message: "Filtros de agenda inválidos." });
    const user = request.authUser!;
    if (q.data.artista_id && !(await artistAllowed(user, q.data.artista_id))) return reply.code(403).send({ message: "Você não tem acesso a este artista." });
    const values: unknown[] = [empresaId]; const where = ["e.empresa_id=$1"];
    if (!["super_administrador","administrador"].includes(user.perfil)) { values.push(user.id); where.push(`EXISTS(SELECT 1 FROM usuario_artistas ua WHERE ua.usuario_id=$${values.length} AND ua.artista_id=e.artista_id)`); }
    if (q.data.de) { values.push(q.data.de); where.push(`e.inicio >= $${values.length}::date`); }
    if (q.data.ate) { values.push(q.data.ate); where.push(`e.inicio < ($${values.length}::date + interval '1 day')`); }
    if (q.data.artista_id) { values.push(q.data.artista_id); where.push(`e.artista_id=$${values.length}`); }
    if (q.data.contratante_id) { values.push(q.data.contratante_id); where.push(`e.contratante_id=$${values.length}`); }
    if (q.data.estado) { values.push(q.data.estado.toLocaleUpperCase("pt-BR")); where.push(`e.estado=$${values.length}`); }
    const result = await pool.query(`SELECT e.*,a.nome AS artista_nome,ct.nome AS contratante_nome,cl.nome AS cliente_nome FROM eventos e JOIN artistas a ON a.id=e.artista_id LEFT JOIN contratantes ct ON ct.id=e.contratante_id LEFT JOIN clientes cl ON cl.id=e.cliente_id WHERE ${where.join(" AND ")} ORDER BY e.inicio LIMIT 1000`, values);
    return result.rows;
  });
  app.post("/eventos", { preHandler: write }, async (request, reply) => {
    const empresaId = await company(request, reply); if (!empresaId) return;
    const parsed = bodySchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ message: "Confira os campos obrigatórios do orçamento.", issues: parsed.error.issues });
    const d = parsed.data; const user = request.authUser!;
    if (!(await artistAllowed(user,d.artista_id))) return reply.code(403).send({ message: "Você não tem acesso ao artista selecionado." });
    const refs = await pool.query(`SELECT (SELECT count(*) FROM artistas WHERE id=$1 AND status='ativo') AS artista,(SELECT count(*) FROM contratantes WHERE id=$2 AND empresa_id=$4 AND status='ativo') AS contratante,(SELECT count(*) FROM clientes WHERE id=$3 AND empresa_id=$4) AS cliente`, [d.artista_id,d.contratante_id,d.cliente_id ?? null,empresaId]);
    if (Number(refs.rows[0]?.artista)!==1 || Number(refs.rows[0]?.contratante)!==1 || (d.cliente_id && Number(refs.rows[0]?.cliente)!==1)) return reply.code(400).send({ message: "Selecione um artista ativo, um contratante ativo e um cliente da empresa selecionada." });
    const conflict = await pool.query<{inicio:string;nome:string|null}>(`SELECT inicio,nome FROM eventos WHERE artista_id=$1 AND tipo_agendamento<>'bloqueado' AND (inicio AT TIME ZONE 'America/Fortaleza')::date=($2::timestamptz AT TIME ZONE 'America/Fortaleza')::date LIMIT 1`,[d.artista_id,d.inicio]);
    try {
      const inserted = await pool.query(`INSERT INTO eventos(empresa_id,artista_id,contratante_id,cliente_id,nome,tipo_agendamento,inicio,endereco,local,cidade,estado,cache,camarote,diaria,imposto,producao_local,comissao_pct,hospedagem,nota_fiscal,publico_privado,show_colocado,informacoes,status,situacao_contrato,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'reservado',false,$23) RETURNING *`,
      [empresaId,d.artista_id,d.contratante_id,d.cliente_id ?? null,upper(d.nome),d.tipo_agendamento,d.inicio,d.endereco?JSON.stringify({formatted:upper(d.endereco)}):null,upper(d.local),upper(d.cidade),upper(d.estado),d.cache,d.camarote,d.diaria,d.imposto,d.producao_local,d.comissao_pct ?? null,d.hospedagem,d.nota_fiscal,d.publico_privado,d.show_colocado,upper(d.informacoes),user.id]);
      if (conflict.rowCount) {
        const actor = await pool.query<{fone:string|null;nome:string}>("SELECT fone,nome FROM usuarios WHERE id=$1",[user.id]);
        if (actor.rows[0]?.fone) void whatsapp.sendText(actor.rows[0].fone, `ATENÇÃO: existe outro evento do artista nesta data. Verifique a logística antes de prosseguir. Evento: ${upper(d.nome) ?? "SEM NOME"}.`).catch((error) => request.log.warn({err:error},"Alerta de conflito não enviado via WAHA"));
      }
      return reply.code(201).send({ ...inserted.rows[0], aviso_conflito: conflict.rowCount ? "ATENÇÃO, JÁ EXISTE UMA DATA PARA ESTE ARTISTA NO DIA SELECIONADO. VERIFIQUE A LOGÍSTICA ANTES DE PROSSEGUIR!" : null });
    } catch (error) { return pgError(error,reply); }
  });
  app.post("/eventos/bloqueios", { preHandler: write }, async (request, reply) => {
    const empresaId = await company(request, reply); if (!empresaId) return;
    const parsed=blockSchema.safeParse(request.body); if(!parsed.success)return reply.code(400).send({message:"Informe artista e data do bloqueio.",issues:parsed.error.issues});
    const d=parsed.data; if(!(await artistAllowed(request.authUser!,d.artista_id)))return reply.code(403).send({message:"Você não tem acesso ao artista selecionado."});
    const validArtist=await pool.query("SELECT 1 FROM artistas WHERE id=$1 AND status='ativo'",[d.artista_id]);if(!validArtist.rowCount)return reply.code(400).send({message:"Selecione um artista ativo."});
    const conflicts=await pool.query(`SELECT tipo_agendamento FROM eventos WHERE artista_id=$1 AND (inicio AT TIME ZONE 'America/Fortaleza')::date=($2::timestamptz AT TIME ZONE 'America/Fortaleza')::date LIMIT 1`,[d.artista_id,d.inicio]);
    if(conflicts.rowCount)return reply.code(409).send({message:conflicts.rows[0]!.tipo_agendamento==="bloqueado"?"JÁ EXISTE UM BLOQUEIO PARA O DIA SELECIONADO!":"NÃO É POSSÍVEL BLOQUEAR: JÁ EXISTE UM EVENTO REGISTRADO PARA ESTE ARTISTA NESTE DIA."});
    try { const inserted=await pool.query(`INSERT INTO eventos(empresa_id,artista_id,tipo_agendamento,inicio,informacoes,status,bloqueado) VALUES($1,$2,'bloqueado',$3,$4,'reservado',true) RETURNING *`,[empresaId,d.artista_id,d.inicio,upper(d.informacoes)]);return reply.code(201).send(inserted.rows[0]); } catch(error){return pgError(error,reply);}
  });
  app.patch("/eventos/:id", { preHandler: write }, async (request, reply) => {
    const params=idSchema.safeParse(request.params);const parsed=bodySchema.partial().omit({artista_id:true,tipo_agendamento:true}).safeParse(request.body);const empresaId=await company(request,reply);if(!empresaId)return;
    if(!params.success||!parsed.success)return reply.code(400).send({message:"Dados de evento inválidos.",issues:parsed.success?undefined:parsed.error.issues});
    const existing=await pool.query<{artista_id:string;bloqueado:boolean;situacao_contrato:boolean;contrato_id:string|null}>("SELECT e.artista_id,e.bloqueado,e.situacao_contrato,c.id AS contrato_id FROM eventos e LEFT JOIN contratos c ON c.evento_id=e.id WHERE e.id=$1 AND e.empresa_id=$2",[params.data.id,empresaId]);
    const row=existing.rows[0];if(!row)return reply.code(404).send({message:"Evento não encontrado."});if(!(await artistAllowed(request.authUser!,row.artista_id)))return reply.code(403).send({message:"Você não tem acesso a este artista."});if(row.bloqueado)return reply.code(409).send({message:"Bloqueios de agenda não podem ser editados como orçamento."});
    const d=parsed.data;if(row.situacao_contrato&&(d.show_colocado!==undefined||d.hospedagem!==undefined||d.publico_privado!==undefined||d.nota_fiscal!==undefined))return reply.code(409).send({message:"Os dados operacionais deste evento estão travados pelo contrato."});
    const map:Record<string,string>={contratante_id:"contratante_id",cliente_id:"cliente_id",inicio:"inicio",nome:"nome",cidade:"cidade",estado:"estado",local:"local",informacoes:"informacoes",cache:"cache",producao_local:"producao_local",diaria:"diaria",imposto:"imposto",comissao_pct:"comissao_pct",camarote:"camarote",show_colocado:"show_colocado",hospedagem:"hospedagem",publico_privado:"publico_privado",nota_fiscal:"nota_fiscal",endereco:"endereco"};
    const entries=Object.entries(d).filter(([key])=>map[key]);if(!entries.length)return reply.code(400).send({message:"Informe campos para atualização."});
    const values=entries.map(([key,value])=>key==="endereco"?(value?JSON.stringify({formatted:upper(value as string)}):null):typeof value==="string"&&["nome","cidade","estado","local","informacoes"].includes(key)?upper(value):value);const sets=entries.map(([key],i)=>`${map[key]}=$${i+1}${key==="endereco"?"::jsonb":""}`);
    try{const updated=await pool.query(`UPDATE eventos SET ${sets.join(",")},updated_at=now() WHERE id=$${values.length+1} AND empresa_id=$${values.length+2} RETURNING *`,[...values,params.data.id,empresaId]);return updated.rows[0];}catch(error){return pgError(error,reply);}
  });
  app.delete("/eventos/:id", { preHandler: write }, async (request, reply) => {
    const params=idSchema.safeParse(request.params);const empresaId=await company(request,reply);if(!empresaId)return;if(!params.success)return reply.code(400).send({message:"Evento inválido."});
    const found=await pool.query<{artista_id:string}>("SELECT artista_id FROM eventos WHERE id=$1 AND empresa_id=$2",[params.data.id,empresaId]);if(!found.rows[0])return reply.code(404).send({message:"Evento não encontrado."});if(!(await artistAllowed(request.authUser!,found.rows[0].artista_id)))return reply.code(403).send({message:"Você não tem acesso a este artista."});
    const contract=await pool.query("SELECT 1 FROM contratos WHERE evento_id=$1",[params.data.id]);if(contract.rowCount)return reply.code(409).send({message:"Não é possível excluir um evento que possui contrato."});
    await pool.query("DELETE FROM eventos WHERE id=$1 AND empresa_id=$2",[params.data.id,empresaId]);return reply.code(204).send();
  });
}
