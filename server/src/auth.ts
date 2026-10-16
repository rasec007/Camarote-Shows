import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Perfil } from "@camarote/shared";
import { auditContext, pool } from "./database.js";

export type AuthUser = { id: string; perfil: Perfil; empresaPadraoId: string | null; podeVisualizarRelatorios: boolean };
export type Modulo = "cadastros" | "eventos" | "contratos" | "banda" | "cobranca" | "financeiro" | "rh" | "auditoria" | "dashboard";

declare module "fastify" {
  interface FastifyRequest { authUser: AuthUser | null }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

export function issueRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const payload = await request.jwtVerify<{ sub: string; type: "access" }>();
    if (payload.type !== "access") throw new Error("Invalid token type");
    const result = await pool.query<{ id: string; perfil: Perfil; status: string; empresa_padrao_id: string | null; pode_visualizar_relatorios: boolean }>(
      "SELECT id, perfil, status, empresa_padrao_id, pode_visualizar_relatorios FROM usuarios WHERE id=$1",
      [payload.sub],
    );
    const user = result.rows[0];
    if (!user || user.status !== "ativo") {
      return reply.code(401).send({ message: "Seu perfil está desativado ou sua sessão expirou." });
    }
    request.authUser = { id: user.id, perfil: user.perfil, empresaPadraoId: user.empresa_padrao_id, podeVisualizarRelatorios: user.pode_visualizar_relatorios };
    const context = auditContext.getStore();
    if (context) context.userId = user.id;
    else auditContext.enterWith({ userId: user.id });
  } catch {
    return reply.code(401).send({ message: "Autenticação necessária." });
  }
}

export function authorize(...profiles: Perfil[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.authUser) return reply.code(401).send({ message: "Autenticação necessária." });
    if (!profiles.includes(request.authUser.perfil)) return reply.code(403).send({ message: "Seu perfil não permite esta operação." });
  };
}

const moduloPermissoes: Record<Modulo, { leitura: Perfil[]; escrita: Perfil[] }> = {
  cadastros: { leitura: ["super_administrador", "administrador"], escrita: ["super_administrador", "administrador"] },
  eventos: { leitura: ["super_administrador", "administrador", "contrato", "agenda", "vendedor", "produtor"], escrita: ["super_administrador", "administrador", "contrato", "agenda"] },
  contratos: { leitura: ["super_administrador", "administrador", "contrato", "financeiro"], escrita: ["super_administrador", "administrador", "contrato"] },
  banda: { leitura: ["super_administrador", "administrador", "financeiro"], escrita: ["super_administrador", "administrador", "financeiro"] },
  cobranca: { leitura: ["super_administrador", "administrador", "financeiro"], escrita: ["super_administrador", "administrador", "financeiro"] },
  financeiro: { leitura: ["super_administrador", "administrador", "financeiro"], escrita: ["super_administrador", "administrador", "financeiro"] },
  rh: { leitura: ["super_administrador", "administrador"], escrita: ["super_administrador", "administrador"] },
  auditoria: { leitura: ["super_administrador", "administrador"], escrita: ["super_administrador", "administrador"] },
  dashboard: { leitura: ["super_administrador", "administrador", "financeiro", "contrato", "agenda", "vendedor", "produtor"], escrita: [] },
};

export function authorizeModulo(modulo: Modulo, acao: "leitura" | "escrita" = "leitura") {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.authUser) return reply.code(401).send({ message: "Autenticação necessária." });
    const usuario = request.authUser;
    if (!moduloPermissoes[modulo][acao].includes(usuario.perfil)) return reply.code(403).send({ message: "Seu perfil não permite esta operação." });
    if (modulo === "dashboard" && !usuario.podeVisualizarRelatorios && !["super_administrador", "administrador"].includes(usuario.perfil)) {
      return reply.code(403).send({ message: "Seu perfil não permite visualizar relatórios." });
    }
  };
}

export async function hasEmpresaAccess(usuarioId: string, empresaId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM usuario_empresas WHERE usuario_id=$1 AND empresa_id=$2", [usuarioId, empresaId]);
  return result.rowCount === 1;
}

export async function hasArtistaAccess(usuarioId: string, artistaId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM usuario_artistas WHERE usuario_id=$1 AND artista_id=$2", [usuarioId, artistaId]);
  return result.rowCount === 1;
}

export async function issueSession(app: FastifyInstance, user: { id: string; perfil: Perfil }, reply: FastifyReply): Promise<string> {
  const accessToken = app.jwt.sign({ sub: user.id, type: "access", perfil: user.perfil }, { expiresIn: "15m" });
  const refreshToken = issueRefreshToken();
  await pool.query(
    "INSERT INTO tokens_refresh(usuario_id,token_hash,expira_em) VALUES($1,$2,now()+interval '30 days')",
    [user.id, hashToken(refreshToken)],
  );
  reply.setCookie("camarote_refresh", refreshToken, {
    httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "lax", path: "/auth", maxAge: 60 * 60 * 24 * 30,
  });
  return accessToken;
}
