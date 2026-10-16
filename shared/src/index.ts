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

export const passwordRequirements = [
  { id: "length", label: "Mínimo de 12 caracteres", test: (value: string) => value.length >= 12 },
  { id: "letter", label: "Pelo menos uma letra", test: (value: string) => /\p{L}/u.test(value) },
  { id: "number", label: "Pelo menos um número", test: (value: string) => /\p{N}/u.test(value) },
  { id: "uppercase", label: "Pelo menos uma letra maiúscula", test: (value: string) => /\p{Lu}/u.test(value) },
  { id: "special", label: "Pelo menos um caractere especial", test: (value: string) => /[^\p{L}\p{N}\s]/u.test(value) },
] as const;

export const senhaSchema = z.string().max(128, "A senha deve ter no máximo 128 caracteres.").superRefine((value, context) => {
  for (const requirement of passwordRequirements) {
    if (!requirement.test(value)) context.addIssue({ code: "custom", message: requirement.label });
  }
});

export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  senha: z.string().min(1),
});

export type Perfil = z.infer<typeof perfilSchema>;
export type StatusUsuario = z.infer<typeof statusUsuarioSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

const textUpper = z.string().trim().min(1).max(240).transform((value) => value.toLocaleUpperCase("pt-BR"));
const optionalUpper = z.string().trim().max(2000).transform((value) => value ? value.toLocaleUpperCase("pt-BR") : null).nullable().optional();
const emailOptional = z.union([z.string().trim().email().max(254), z.literal("")]).transform((value) => value ? value.toLowerCase() : null).optional();
const statusSchema = statusUsuarioSchema;
const documentCpfCnpj = z.string().trim().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 11 || value.length === 14, "Informe um CPF ou CNPJ válido.");
const documentCnpj = z.string().trim().transform((value) => value.replace(/\D/g, "")).refine((value) => !value || value.length === 14, "Informe um CNPJ válido.").optional();

export const empresaCadastroSchema = z.object({
  nome: textUpper, status: statusSchema.default("ativo"), cnpj: documentCnpj,
  email: emailOptional, fone: optionalUpper, responsavel: optionalUpper,
  endereco: optionalUpper, numero: optionalUpper, complemento: optionalUpper,
});
export const bancoCadastroSchema = z.object({ nome: textUpper, codigo: optionalUpper, agencia: optionalUpper, conta: optionalUpper });
export const pessoaCadastroSchema = z.object({
  nome: textUpper, cpf_cnpj: documentCpfCnpj, email: emailOptional, celular: optionalUpper,
  responsavel: optionalUpper, observacoes: optionalUpper, endereco: optionalUpper,
  numero: optionalUpper, complemento: optionalUpper, status: statusSchema.default("ativo"),
});
export const artistaCadastroSchema = z.object({
  nome: textUpper, email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  celular: optionalUpper, responsavel: optionalUpper,
  comissao_camarote: z.coerce.number().min(0).max(100), imposto: z.coerce.number().min(0).max(100), status: statusSchema.default("ativo"),
});
export const contratanteCadastroSchema = z.object({
  nome: textUpper, cpf_cnpj: documentCpfCnpj, email: emailOptional,
  celular: z.string().trim().min(8).max(30), responsavel: optionalUpper,
  observacoes: optionalUpper, status: statusSchema.default("ativo"),
});
export const planoContasCadastroSchema = z.object({
  nome: textUpper,
  categoria: z.enum(["atividades_investimento", "custos_operacionais", "atividades_financiamento", "despesas_operacionais_outras_receitas", "receitas_operacionais"]),
  tipo: z.enum(["entrada", "saida"]),
});
export const usuarioCadastroSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), nome: textUpper,
  fone: z.string().trim().min(8).max(30), perfil: perfilSchema, empresaIds: z.array(z.string().uuid()).min(1).refine((ids) => new Set(ids).size === ids.length, "Não repita empresas."),
  empresaPadraoId: z.string().uuid(), status: statusSchema.default("ativo"),
  podeVisualizarRelatorios: z.boolean().default(false),
  artistas: z.array(z.object({ artistaId: z.string().uuid(), acessoTotal: z.boolean() })).default([]).refine((items) => new Set(items.map((item) => item.artistaId)).size === items.length, "Não repita artistas."),
});

export type EmpresaCadastroInput = z.infer<typeof empresaCadastroSchema>;
export type BancoCadastroInput = z.infer<typeof bancoCadastroSchema>;
export type PessoaCadastroInput = z.infer<typeof pessoaCadastroSchema>;
export type ArtistaCadastroInput = z.infer<typeof artistaCadastroSchema>;
export type PlanoContasCadastroInput = z.infer<typeof planoContasCadastroSchema>;
