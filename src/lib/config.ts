import crypto from "node:crypto";
import { z } from "zod";

const CartaoSchema = z.object({
  nome: z.string().min(1),
  /** Dia do mês em que a fatura fecha. */
  fechamento: z.number().int().min(1).max(31),
  /** Dia do mês em que a fatura vence. */
  vencimento: z.number().int().min(1).max(31),
  /** Limite total do cartão, para o painel mostrar quanto ainda está disponível. */
  limite: z.number().positive().optional(),
});

const UsuarioSchema = z.object({
  nome: z.string().min(1),
  /** Número no formato internacional, só dígitos (ex.: 5511999998888). */
  telefone: z.string().regex(/^\d{10,15}$/),
  /** Código de acesso ao site do DinoMoney (secreto, pelo menos 8 caracteres). */
  codigo: z.string().min(8).optional(),
  planilhaId: z.string().min(10),
  abaFluxo: z.string().default("Cashflow"),
  abaCategorias: z.string().default("Contas"),
  /** Contas bancárias e carteiras (coluna "Banco" da planilha). A aba "Minhas contas" da planilha tem prioridade. */
  contas: z.array(z.string().min(1)).default([]),
  cartoes: z.array(CartaoSchema).default([]),
});

export type Cartao = z.infer<typeof CartaoSchema>;
export type Usuario = z.infer<typeof UsuarioSchema>;

export function carregarUsuarios(json = process.env.DINOMONEY_USUARIOS): Usuario[] {
  if (!json) return [];
  return z.array(UsuarioSchema).parse(JSON.parse(json));
}

/** O WhatsApp às vezes manda celulares brasileiros sem o 9 extra; aceitamos as duas formas. */
export function normalizarTelefone(tel: string): string {
  const digitos = tel.replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length === 12) {
    return digitos.slice(0, 4) + "9" + digitos.slice(4);
  }
  return digitos;
}

export function encontrarUsuario(telefone: string, usuarios = carregarUsuarios()): Usuario | undefined {
  const alvo = normalizarTelefone(telefone);
  return usuarios.find((u) => normalizarTelefone(u.telefone) === alvo);
}

function iguais(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function encontrarUsuarioPorCodigo(codigo: string, usuarios = carregarUsuarios()): Usuario | undefined {
  const limpo = codigo.trim();
  if (limpo.length < 8) return undefined;
  return usuarios.find((u) => u.codigo !== undefined && iguais(u.codigo, limpo));
}

export function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não configurada`);
  return valor;
}
