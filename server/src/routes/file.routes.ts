import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, authorizeModulo, hasEmpresaAccess } from "../auth.js";
import { pool } from "../database.js";
import { removePrivateFile, savePrivateFile, signedDownload, type FileContext } from "../integrations/storage.service.js";

const contextSchema = z.enum(["evento", "contrato", "financeiro", "rh", "geral"]);
const modules: Record<FileContext, "eventos" | "contratos" | "financeiro" | "rh" | "cadastros"> = {
  evento: "eventos", contrato: "contratos", financeiro: "financeiro", rh: "rh", geral: "cadastros",
};

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.post("/arquivos", { preHandler: [authenticate] }, async (request, reply) => {
    let empresaId: string | undefined;
    let contexto: FileContext | undefined;
    let destinatarioUsuarioId: string | undefined;
    let file: { filename: string; mimetype: string; bytes: Buffer } | undefined;
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (file) return reply.code(400).send({ message: "Envie apenas um arquivo por vez." });
        file = { filename: part.filename, mimetype: part.mimetype, bytes: await part.toBuffer() };
      } else {
        if (part.fieldname === "empresaId") empresaId = String(part.value);
        if (part.fieldname === "contexto") {
          const parsedContext = contextSchema.safeParse(part.value);
          if (!parsedContext.success) return reply.code(400).send({ message: "Contexto de arquivo inválido." });
          contexto = parsedContext.data;
        }
        if (part.fieldname === "destinatarioUsuarioId") destinatarioUsuarioId = String(part.value);
      }
    }
    if (!file || !empresaId || !contexto) return reply.code(400).send({ message: "Informe empresa, contexto e arquivo." });
    const parsedId = z.string().uuid().safeParse(empresaId);
    if (!parsedId.success) return reply.code(400).send({ message: "Empresa inválida." });
    const user = request.authUser!;
    if (!(await hasEmpresaAccess(user.id, empresaId))) return reply.code(403).send({ message: "Você não tem acesso a esta empresa." });
    await authorizeModulo(modules[contexto], "escrita")(request, reply);
    if (reply.sent) return;
    if (contexto === "rh" && !["super_administrador", "administrador"].includes(user.perfil)) return reply.code(403).send({ message: "Apenas administradores podem enviar arquivos de RH." });
    if (contexto === "rh") {
      if (!destinatarioUsuarioId || !z.string().uuid().safeParse(destinatarioUsuarioId).success) return reply.code(400).send({ message: "Informe o usuário destinatário do documento de RH." });
      const recipient = await pool.query("SELECT 1 FROM usuario_empresas WHERE usuario_id=$1 AND empresa_id=$2", [destinatarioUsuarioId, empresaId]);
      if (!recipient.rowCount) return reply.code(400).send({ message: "O usuário destinatário não está vinculado à empresa." });
    }

    const maxSize = Number(process.env.MAX_FILE_SIZE_BYTES ?? 25 * 1024 * 1024);
    if (file.bytes.length > maxSize) return reply.code(413).send({ message: `O arquivo excede o limite de ${Math.floor(maxSize / 1024 / 1024)} MB.` });
    const filename = file.filename.replace(/[\\/\r\n\0]/g, "_").slice(0, 240) || "arquivo";
    const contentType = file.mimetype.slice(0, 160) || "application/octet-stream";
    const stored = await savePrivateFile({ ...file, filename, contentType, context: contexto });
    try {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO arquivos(empresa_id,enviado_por,destinatario_usuario_id,contexto,bucket,object_key,nome_original,content_type,tamanho_bytes,sha256)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [empresaId, user.id, contexto === "rh" ? destinatarioUsuarioId : null, contexto, stored.bucket, stored.objectKey, filename, contentType, file.bytes.length, stored.sha256],
      );
      return reply.code(201).send({ id: inserted.rows[0]!.id, nome: filename, tamanho: file.bytes.length });
    } catch (error) {
      await removePrivateFile(stored.bucket, stored.objectKey);
      throw error;
    }
  });

  app.get("/arquivos/:id/url", { preHandler: [authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: "Arquivo inválido." });
    const found = await pool.query<{ empresa_id: string; contexto: FileContext; bucket: string; object_key: string; nome_original: string; destinatario_usuario_id: string | null; document_rh_exists: boolean }>(
      "SELECT a.empresa_id,a.contexto,a.bucket,a.object_key,a.nome_original,a.destinatario_usuario_id,EXISTS(SELECT 1 FROM documentos_rh d WHERE d.arquivo_id=a.id) AS document_rh_exists FROM arquivos a WHERE a.id=$1", [params.data.id],
    );
    const item = found.rows[0];
    if (!item) return reply.code(404).send({ message: "Arquivo não encontrado." });
    const user = request.authUser!;
    if (!(await hasEmpresaAccess(user.id, item.empresa_id))) return reply.code(403).send({ message: "Você não tem acesso a esta empresa." });
    if (item.contexto === "rh") {
      if (!item.document_rh_exists) return reply.code(404).send({ message: "Documento de RH não encontrado." });
      if (item.destinatario_usuario_id !== user.id && !["super_administrador", "administrador"].includes(user.perfil)) return reply.code(403).send({ message: "Você não tem acesso a este documento de RH." });
    } else {
      await authorizeModulo(modules[item.contexto], "leitura")(request, reply);
      if (reply.sent) return;
    }
    return { url: await signedDownload(item.bucket, item.object_key, item.nome_original), expiraEmSegundos: 300 };
  });
}
