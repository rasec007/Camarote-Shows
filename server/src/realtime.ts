import type { FastifyInstance } from "fastify";
import pg from "pg";
import { Server as SocketServer } from "socket.io";
import { pool } from "./database.js";

type RealtimePayload = { table: string; operation: string; empresa_id: string; id: string };

export async function attachRealtime(app: FastifyInstance): Promise<void> {
  const allowedOrigins = [process.env.WEB_ORIGIN ?? "http://localhost:5173", process.env.MOBILE_ORIGIN ?? "http://localhost:5174"];
  const io = new SocketServer(app.server, { cors: { origin: allowedOrigins, credentials: true } });
  app.decorate("io", io);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "camarote-realtime-listener" });
  await client.connect();
  await client.query("LISTEN camarote_realtime");
  client.on("notification", (message) => {
    if (!message.payload) return;
    try {
      const event = JSON.parse(message.payload) as RealtimePayload;
      app.io.to(`empresa:${event.empresa_id}`).emit("data.changed", event);
    } catch (error) {
      app.log.error({ err: error }, "Notificação PostgreSQL inválida");
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== "string") return next(new Error("Autenticação necessária"));
      const payload = app.jwt.verify<{ sub: string; type: string }>(token);
      if (payload.type !== "access") return next(new Error("Token inválido"));
      const result = await pool.query<{ id: string; status: string }>(
        `SELECT ue.empresa_id AS id,u.status FROM usuarios u
         JOIN usuario_empresas ue ON ue.usuario_id=u.id WHERE u.id=$1`, [payload.sub],
      );
      if (result.rows.length === 0 || result.rows[0]!.status !== "ativo") return next(new Error("Usuário sem acesso ativo"));
      socket.data.userId = payload.sub;
      socket.data.empresaIds = result.rows.map((row) => row.id);
      next();
    } catch { next(new Error("Autenticação necessária")); }
  });

  io.on("connection", (socket) => {
    for (const empresaId of socket.data.empresaIds as string[]) socket.join(`empresa:${empresaId}`);
  });

  app.addHook("onClose", async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await client.end();
  });
}

declare module "fastify" {
  interface FastifyInstance { io: SocketServer }
}
