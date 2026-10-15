import "./env.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { authRoutes } from "./routes/auth.routes.js";
import { fileRoutes } from "./routes/file.routes.js";
import { cadastrosRoutes } from "./routes/cadastros.routes.js";
import { eventosRoutes } from "./routes/eventos.routes.js";
import { contratosRoutes } from "./routes/contratos.routes.js";
import { bandaRoutes } from "./routes/banda.routes.js";
import { financeiroRoutes } from "./routes/financeiro.routes.js";
import { operacaoRoutes } from "./routes/operacao.routes.js";
import { auditContext, pool } from "./database.js";
import { attachRealtime } from "./realtime.js";

const accessSecret = process.env.JWT_ACCESS_SECRET;
if (!accessSecret || accessSecret.length < 32) throw new Error("JWT_ACCESS_SECRET deve ter pelo menos 32 caracteres.");

const allowedOrigins = [process.env.WEB_ORIGIN ?? "http://localhost:5173", process.env.MOBILE_ORIGIN ?? "http://localhost:5174"];
if (process.env.NODE_ENV !== "production") allowedOrigins.push("http://localhost:5173", "http://localhost:5174");
const app = Fastify({ logger: true, bodyLimit: Number(process.env.MAX_FILE_SIZE_BYTES ?? 25 * 1024 * 1024) + 2 * 1024 * 1024 });
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.decorateRequest("authUser", null);
app.addHook("onRequest", (request, _reply, done) => auditContext.run({}, done));

await app.register(helmet);
await app.register(cors, { origin: allowedOrigins, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
await app.register(cookie);
await app.register(jwt, { secret: accessSecret, sign: { expiresIn: "15m" } });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
await app.register(authRoutes, { prefix: "/auth" });
await app.register(cadastrosRoutes, { prefix: "/cadastros" });
await app.register(eventosRoutes);
await app.register(contratosRoutes);
await app.register(bandaRoutes);
await app.register(financeiroRoutes);
await app.register(operacaoRoutes);
await app.register(fileRoutes);
await app.register(async (routes) => {
  routes.get("/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });
});

await attachRealtime(app);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Encerrando API");
  await app.close();
  await pool.end();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: process.env.SERVER_HOST ?? "0.0.0.0", port: Number(process.env.SERVER_PORT ?? 3333) });
