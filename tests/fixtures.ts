import type { Usuario } from "@/lib/config";
import { lerCategorias } from "@/lib/categorias";

export const usuario: Usuario = {
  nome: "Maria",
  telefone: "5511999998888",
  planilhaId: "planilha-de-teste-123",
  abaFluxo: "Cashflow",
  abaCategorias: "Contas",
  contas: ["Itaú", "Inter"],
  cartoes: [{ nome: "Nubank", fechamento: 3, vencimento: 10 }],
};

// Trecho real da aba "Contas" do modelo
export const categorias = lerCategorias([
  ["Categoria", "Tipo de Despesa", "Despesa", "Mês Vigente/Analisado", "Meta de Despesas"],
  ["Essencial", "Casa", "Internet", "R$ 0,00", "R$ 0,00"],
  ["Essencial", "Alimentação", "Padaria", "R$ 0,00", "R$ 0,00"],
  ["Essencial", "Alimentação", "Supermercado", "R$ 0,00", "R$ 0,00"],
  ["", "", "", "R$ 0,00"],
  ["Supérflua", "Lazer", "Shows/Eventos/Cinema", "R$ 0,00", "R$ 0,00"],
  ["Supérflua", "Gastos Pessoais", "Lanches", "R$ 0,00", "R$ 0,00"],
  ["Renda ", "Renda Principal", "Salário/Pró-labore", "R$ 0,00", "R$ 0,00"],
  ["Entre Contas", "Entre Contas", "Entre Contas", "R$ 0,00", "R$ 0,00"],
]);
