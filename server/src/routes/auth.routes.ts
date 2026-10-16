import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { loginSchema, perfilSchema, senhaSchema, type Perfil } from "@camarote/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, authorize, hashPassword, hashToken, issueRefreshToken, issueSession } from "../auth.js";
import { pool } from "../database.js";
import { WahaApiService } from "../integrations/waha-api.service.js";

const conviteSchema = z.object({
  email: z.string().email(), nome: z.string().min(1), fone: z.string().min(8),
  perfil: perfilSchema, empresaIds: z.array(z.string().uuid()).min(1),
  artistaIds: z.array(z.string().uuid()).default([]), empresaPadraoId: z.string().uuid(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const whatsapp = new WahaApiService();

  app.post("/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Informe um e-mail e uma senha válidos." });
    const { email, senha } = parsed.data;
    const result = await pool.query<{ id: string; senha_hash: string | null; perfil: Perfil; status: string }>(
      "SELECT id, senha_hash, perfil, status FROM usuarios WHERE email=$1", [email],
    );
    const user = result.rows[0];
    if (!user?.senha_hash || !(await argon2.verify(user.senha_hash, senha))) {
      return reply.code(401).send({ message: "E-mail ou senha inválidos." });
    }
    if (user.status !== "ativo") return reply.code(403).send({ message: "Seu perfil está desativado. Procure a administração." });
    await pool.query("UPDATE usuarios SET ultimo_login_em=now() WHERE id=$1", [user.id]);
    return { accessToken: await issueSession(app, user, reply) };
  });

  app.post("/refresh", async (request, reply) => {
    const token = request.cookies.camarote_refresh;
    if (!token) return reply.code(401).send({ message: "Sessão expirada." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string; usuario_id: string; perfil: Perfil; status: string }>(
        `SELECT t.id, u.id AS usuario_id, u.perfil, u.status
         FROM tokens_refresh t JOIN usuarios u ON u.id=t.usuario_id
         WHERE t.token_hash=$1 AND t.expira_em>now() FOR UPDATE OF t`, [hashToken(token)],
      );
      const session = result.rows[0];
      if (!session || session.status !== "ativo") {
        await client.query("DELETE FROM tokens_refresh WHERE token_hash=$1", [hashToken(token)]);
        await client.query("COMMIT");
        reply.clearCookie("camarote_refresh", { path: "/auth" });
        return reply.code(401).send({ message: "Sessão expirada ou usuário inativo." });
      }
      await client.query("DELETE FROM tokens_refresh WHERE id=$1", [session.id]);
      const refresh = issueRefreshToken();
      await client.query("INSERT INTO tokens_refresh(usuario_id,token_hash,expira_em) VALUES($1,$2,now()+interval '30 days')", [session.usuario_id, hashToken(refresh)]);
      await client.query("COMMIT");
      reply.setCookie("camarote_refresh", refresh, { httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "lax", path: "/auth", maxAge: 60 * 60 * 24 * 30 });
      return { accessToken: app.jwt.sign({ sub: session.usuario_id, type: "access", perfil: session.perfil }, { expiresIn: "15m" }) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies.camarote_refresh;
    if (token) await pool.query("DELETE FROM tokens_refresh WHERE token_hash=$1", [hashToken(token)]);
    reply.clearCookie("camarote_refresh", { path: "/auth" });
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: authenticate }, async (request) => {
    const result = await pool.query("SELECT id,email,nome,apelido,fone,perfil,status,empresa_padrao_id,pode_visualizar_relatorios FROM usuarios WHERE id=$1", [request.authUser!.id]);
    const companies = await pool.query("SELECT e.id,e.nome FROM usuario_empresas ue JOIN empresas e ON e.id=ue.empresa_id WHERE ue.usuario_id=$1 AND e.status='ativo' ORDER BY e.nome", [request.authUser!.id]);
    return { ...result.rows[0], empresas: companies.rows };
  });

  app.put("/empresa-padrao", { preHandler: authenticate }, async (request, reply) => {
    const parsed = z.object({ empresaId: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Empresa inválida." });
    const result = await pool.query(
      `UPDATE usuarios u SET empresa_padrao_id=$1,updated_at=now()
       WHERE u.id=$2 AND EXISTS(SELECT 1 FROM usuario_empresas ue JOIN empresas e ON e.id=ue.empresa_id WHERE ue.usuario_id=u.id AND ue.empresa_id=$1 AND e.status='ativo')
       RETURNING u.empresa_padrao_id`,
      [parsed.data.empresaId, request.authUser!.id],
    );
    if (!result.rowCount) return reply.code(403).send({ message: "Você não tem acesso à empresa selecionada." });
    return { empresaPadraoId: result.rows[0]!.empresa_padrao_id };
  });

  app.post("/convites", { preHandler: [authenticate, authorize("super_administrador", "administrador")] }, async (request, reply) => {
    const parsed = conviteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Dados do convite inválidos.", issues: parsed.error.issues });
    const data = parsed.data;
    if (!data.empresaIds.includes(data.empresaPadraoId)) return reply.code(400).send({ message: "A empresa padrão precisa estar entre as empresas vinculadas." });
    const client = await pool.connect();
    const token = randomBytes(32).toString("base64url");
    try {
      await client.query("BEGIN");
      const created = await client.query<{ id: string }>(
        `INSERT INTO usuarios(email,nome,fone,perfil,status,empresa_padrao_id)
         VALUES(lower(btrim($1)),upper(btrim($2)),btrim($3),$4,'ativo',$5) RETURNING id`,
        [data.email, data.nome, data.fone, data.perfil, data.empresaPadraoId],
      );
      const userId = created.rows[0]!.id;
      await client.query("INSERT INTO usuario_empresas(usuario_id,empresa_id) SELECT $1,unnest($2::uuid[])", [userId, data.empresaIds]);
      if (data.artistaIds.length) await client.query("INSERT INTO usuario_artistas(usuario_id,artista_id) SELECT $1,unnest($2::uuid[])", [userId, data.artistaIds]);
      await client.query("INSERT INTO tokens_acesso(usuario_id,token_hash,finalidade,expira_em) VALUES($1,$2,'convite',now()+interval '48 hours')", [userId, hashToken(token)]);
      await client.query("COMMIT");
      const accessUrl = `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/primeiro-acesso?token=${encodeURIComponent(token)}`;
      try {
        await whatsapp.sendText(data.fone, `Olá ${data.nome}, seu acesso ao Camarote Shows foi criado. Defina sua senha neste link (válido por 48 horas): ${accessUrl}`);
      } catch (error) {
        request.log.error({ err: error, userId }, "Não foi possível enviar o convite pela WAHA");
        return reply.code(502).send({ message: "Usuário criado, mas o convite não foi enviado. Confira a WAHA e use 'Esqueci minha senha' para receber o link." });
      }
      return reply.code(201).send({ id: userId, message: "Convite enviado pelo WhatsApp." });
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ message: "Já existe usuário com este e-mail." });
      throw error;
    } finally { client.release(); }
  });

  app.post("/primeiro-acesso", async (request, reply) => {
    const parsed = z.object({ token: z.string().min(20), senha: senhaSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Token ou senha inválidos.", issues: parsed.error.issues });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ id: string; usuario_id: string; usado_em: Date | null; vigente: boolean }>(
        "SELECT id,usuario_id,usado_em,expira_em>now() AS vigente FROM tokens_acesso WHERE token_hash=$1 AND finalidade='convite' FOR UPDATE",
        [hashToken(parsed.data.token)],
      );
      const invite = found.rows[0];
      if (!invite) {
        request.log.warn({ reason: "not_found" }, "Convite de primeiro acesso não encontrado");
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Este convite não foi reconhecido pelo servidor. Solicite um novo link." });
      }
      if (invite.usado_em) {
        request.log.info({ userId: invite.usuario_id, reason: "already_used" }, "Convite de primeiro acesso já utilizado");
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Este convite já foi utilizado. Entre com sua senha ou solicite a redefinição." });
      }
      if (!invite.vigente) {
        request.log.info({ userId: invite.usuario_id, reason: "expired" }, "Convite de primeiro acesso expirado");
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Este convite expirou. Solicite um novo link." });
      }
      await client.query("UPDATE usuarios SET senha_hash=$1,email_verificado_em=now(),updated_at=now() WHERE id=$2", [await hashPassword(parsed.data.senha), invite.usuario_id]);
      await client.query("UPDATE tokens_acesso SET usado_em=now() WHERE id=$1", [invite.id]);
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });

  app.post("/esqueci-senha", { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Informe um e-mail válido." });
    const found = await pool.query<{ id: string; fone: string; nome: string }>("SELECT id,fone,nome FROM usuarios WHERE email=lower(btrim($1)) AND status='ativo'", [parsed.data.email]);
    if (found.rows[0]) {
      const user = found.rows[0];
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      await pool.query("UPDATE tokens_acesso SET usado_em=now() WHERE usuario_id=$1 AND finalidade='redefinicao' AND usado_em IS NULL", [user.id]);
      const issued = await pool.query<{ id: string; expira_em: Date }>(
        "INSERT INTO tokens_acesso(usuario_id,token_hash,finalidade,expira_em) VALUES($1,$2,'redefinicao',now()+interval '30 minutes') RETURNING id,expira_em",
        [user.id, tokenHash],
      );
      request.log.info({ userId: user.id, tokenId: issued.rows[0]!.id, fingerprint: tokenHash.slice(0, 12), expiresAt: issued.rows[0]!.expira_em, instance: process.env.HOSTNAME }, "Link de redefinição criado");
      try {
        await whatsapp.sendText(user.fone, `Olá ${user.nome}, use este link para redefinir sua senha do Camarote Shows (válido por 30 minutos): ${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/redefinir-senha?token=${encodeURIComponent(token)}`);
      } catch (error) { request.log.error({ err: error, userId: user.id }, "Falha ao enviar link de redefinição"); }
    }
    return reply.send({ message: "Se o cadastro existir, enviaremos um link de redefinição pelo WhatsApp." });
  });

  app.post("/redefinir-senha", async (request, reply) => {
    const parsed = z.object({ token: z.string().min(20), senha: senhaSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Token ou senha inválidos.", issues: parsed.error.issues });
    const tokenHash = hashToken(parsed.data.token);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ id: string; usuario_id: string; usado_em: Date | null; vigente: boolean }>(
        "SELECT id,usuario_id,usado_em,expira_em>now() AS vigente FROM tokens_acesso WHERE token_hash=$1 AND finalidade='redefinicao' FOR UPDATE",
        [tokenHash],
      );
      const reset = found.rows[0];
      if (!reset) {
        request.log.warn({ reason: "not_found", fingerprint: tokenHash.slice(0, 12), instance: process.env.HOSTNAME }, "Link de redefinição de senha não encontrado");
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Este link de redefinição não foi reconhecido pelo servidor. Solicite um novo link." });
      }
      if (reset.usado_em) {
        request.log.info({ userId: reset.usuario_id, reason: "already_used_or_replaced" }, "Link de redefinição de senha já utilizado ou substituído");
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Este link já foi utilizado ou substituído por uma solicitação mais recente. Solicite um novo link." });
      }
      if (!reset.vigente) {
        request.log.info({ userId: reset.usuario_id, reason: "expired" }, "Link de redefinição de senha expirado");
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Este link de redefinição expirou. Solicite um novo link." });
      }
      const userId = reset.usuario_id;
      await client.query("UPDATE usuarios SET senha_hash=$1,updated_at=now() WHERE id=$2", [await hashPassword(parsed.data.senha), userId]);
      await client.query("UPDATE tokens_acesso SET usado_em=now() WHERE id=$1", [reset.id]);
      await client.query("DELETE FROM tokens_refresh WHERE usuario_id=$1", [userId]);
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
}
