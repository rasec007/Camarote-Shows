import { z } from "zod";

export const perfilSchema = z.enum([
  "super_administrador",
  "administrador",
  "financeiro",
  "contrato",
  "agenda",
  "vendedor",
  "produtor",
]);

export const statusUsuarioSchema = z.enum(["ativo", "inativo"]);

export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  senha: z.string().min(1),
});

export type Perfil = z.infer<typeof perfilSchema>;
export type StatusUsuario = z.infer<typeof statusUsuarioSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
