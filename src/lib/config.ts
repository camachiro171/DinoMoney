import { z } from "zod";

const CartaoSchema = z.object({
  nome: z.string().min(1),
  /** Dia do mês em que a fatura fecha. */
  fechamento: z.number().int().min(1).max(31),
  /** Dia do mês em que a fatura vence. */
  vencimento: z.number().int().min(1).max(31),
});

const UsuarioSchema = z.object({
  nome: z.string().min(1),
  /** Número no formato internacional, só dígitos (ex.: 5511999998888). */
  telefone: z.string().regex(/^\d{10,15}$/),
  /** Código do chat no Telegram (o bot mostra para quem ainda não está cadastrado). */
  telegram: z.string().regex(/^-?\d+$/).optional(),
  planilhaId: z.string().min(10),
  abaFluxo: z.string().default("Cashflow"),
  abaCategorias: z.string().default("Contas"),
  /** Contas bancárias e carteiras (coluna "Banco" da planilha). */
  contas: z.array(z.string().min(1)).min(1),
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

export function encontrarUsuarioTelegram(chatId: string, usuarios = carregarUsuarios()): Usuario | undefined {
  return usuarios.find((u) => u.telegram === chatId);
}

export function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não configurada`);
  return valor;
}
