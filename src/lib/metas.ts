import type { Usuario } from "./config";
import { dataComparavel } from "./lancamentos";
import { aba, cliente } from "./planilha";

/**
 * Metas de gasto por mês. Ficam na coluna E ("Meta de Despesas") da aba de categorias,
 * na linha de cada despesa, que é onde a planilha modelo já guarda a meta.
 */
export interface Meta {
  despesa: string;
  valor: number;
}

/** Uma linha do fluxo de caixa com o que as metas e a previsão precisam. */
export interface LinhaDoFluxo {
  /** Número da linha na planilha. */
  linha: number;
  data: string; // AAAA-MM-DD
  despesa: string;
  descricao: string;
  valor: number;
  /** Colunas que só o painel usa. */
  tipo?: string;
  pagoCom?: string;
  banco?: string;
}

const comparavel = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** "R$ 1.234,56", "800", 800 ou "(35,31)" viram número. Texto sem número vira 0. */
export function numeroBR(v: unknown): number {
  if (typeof v === "number") return v;
  const t = String(v ?? "").trim();
  const negativo = /^\(.*\)$/.test(t) || t.includes("-");
  const limpo = t.replace(/[^\d.,]/g, "");
  if (!limpo) return 0;
  const n = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo.replace(/\.(?=\d{3}(\D|$))/g, ""));
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

/** Linhas da aba de categorias (A:E) viram metas; só entram as maiores que zero. */
export function metasDasLinhas(linhas: unknown[][]): Meta[] {
  return linhas
    .map((l) => ({ despesa: String(l[2] ?? "").trim(), valor: Math.abs(numeroBR(l[4])) }))
    .filter((m) => m.despesa && m.valor > 0);
}

/** Quanto saiu em cada despesa no mês ("AAAA-MM"), em valor positivo. Entradas (estornos) abatem. */
export function gastosDoMes(fluxo: LinhaDoFluxo[], mes: string): Map<string, number> {
  const total = new Map<string, number>();
  for (const l of fluxo) {
    if (!l.data.startsWith(mes) || !l.despesa) continue;
    const k = comparavel(l.despesa);
    total.set(k, (total.get(k) ?? 0) - l.valor);
  }
  return total;
}

/** Acha a despesa que a pessoa quis dizer: nome exato, ou o único nome que contém o que ela escreveu. */
export function acharDespesa(despesas: string[], pedido: string): string | string[] | undefined {
  const alvo = comparavel(pedido);
  const exata = despesas.find((d) => comparavel(d) === alvo);
  if (exata) return exata;
  const parecidas = despesas.filter((d) => comparavel(d).includes(alvo) || alvo.includes(comparavel(d)));
  if (parecidas.length === 1) return parecidas[0];
  return parecidas.length > 1 ? parecidas : undefined;
}

export async function lerMetas(usuario: Usuario): Promise<Meta[]> {
  const res = await cliente().spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(usuario.abaCategorias)}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return metasDasLinhas((res.data.values ?? []) as unknown[][]);
}

/** Grava a meta na linha da despesa. Devolve false se a despesa não está na aba de categorias. */
export async function definirMeta(usuario: Usuario, despesa: string, valor: number): Promise<boolean> {
  const sheets = cliente();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(usuario.abaCategorias)}!C1:C`,
  });
  const i = ((res.data.values ?? []) as unknown[][]).findIndex((l) => comparavel(String(l[0] ?? "")) === comparavel(despesa));
  if (i < 1) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(usuario.abaCategorias)}!E${i + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[valor]] },
  });
  return true;
}

/** Lançamentos do fluxo com data, despesa, descrição e valor. */
export async function lerFluxo(usuario: Usuario): Promise<LinhaDoFluxo[]> {
  const res = await cliente().spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(usuario.abaFluxo)}!A2:H5000`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return ((res.data.values ?? []) as unknown[][])
    .map((l, i) => ({
      linha: i + 2,
      data: dataComparavel(String(l[0] ?? "")),
      despesa: String(l[2] ?? "").trim(),
      descricao: String(l[3] ?? "").trim(),
      valor: numeroBR(l[7]),
      tipo: String(l[1] ?? "").trim(),
      pagoCom: String(l[5] ?? "").trim(),
      banco: String(l[6] ?? "").trim(),
    }))
    .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.data) && l.valor !== 0);
}

export interface Investimento {
  nome: string;
  valor: number;
}

/**
 * Valor atualizado de cada investimento da aba "Investimentos" (coluna C = ativo, K = total atualizado,
 * a partir da linha 10, como na planilha modelo). Sem a aba, devolve undefined.
 */
export async function lerInvestimentos(usuario: Usuario): Promise<Investimento[] | undefined> {
  try {
    const res = await cliente().spreadsheets.values.get({
      spreadsheetId: usuario.planilhaId,
      range: `${aba("Investimentos")}!C10:K500`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return investimentosDasLinhas((res.data.values ?? []) as unknown[][]);
  } catch {
    return undefined;
  }
}

export function investimentosDasLinhas(linhas: unknown[][]): Investimento[] {
  return linhas
    .map((l) => ({ nome: String(l[0] ?? "").trim(), valor: Math.round(numeroBR(l[8]) * 100) / 100 }))
    .filter((i) => i.nome && i.valor !== 0);
}
