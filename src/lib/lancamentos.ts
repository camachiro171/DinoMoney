import type { Usuario } from "./config";
import type { LinhaExistente } from "./planilha";
import { ehRenda, type Categoria } from "./categorias";
import { FORMAS_PAGAMENTO, type LancamentoClassificado } from "./classificador";
import { dataDaParcelaMensal, dataValida, paraPlanilha, vencimentoDaParcela, type DataISO } from "./datas";

/** Uma linha pronta para o fluxo de caixa (colunas A e C a H da planilha). */
export interface LinhaFluxo {
  data: string; // DD/MM/AAAA
  despesa: string;
  descricao: string;
  nome: string;
  pagoCom: string;
  banco: string;
  valor: number; // negativo = saída
  /** Para a mensagem de confirmação. */
  dataISO: DataISO;
  categoria: Categoria;
}

export class CategoriaDesconhecida extends Error {}

const comparavel = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Acha o item da lista mesmo com diferença de acento, maiúscula ou espaço. */
function acharNaLista<T>(lista: T[], valor: string, chave: (x: T) => string): T | undefined {
  const alvo = comparavel(valor);
  return lista.find((x) => comparavel(chave(x)) === alvo);
}

const centavos = (v: number) => Math.round(v * 100);

/** Divide o total em parcelas que somam exatamente o total; os centavos que sobram vão na primeira. */
export function dividirEmParcelas(total: number, parcelas: number): number[] {
  const t = centavos(total);
  const base = Math.floor(t / parcelas);
  const resto = t - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => (base + (i === 0 ? resto : 0)) / 100);
}

/**
 * Transforma o que a IA entendeu em linhas do fluxo de caixa:
 * - compra no crédito entra na data de vencimento da fatura, uma linha por parcela;
 * - parcelado fora do cartão vira uma linha por mês;
 * - saída fica negativa, entrada positiva (Renda é sempre entrada).
 */
export function paraLinhas(
  l: LancamentoClassificado,
  categorias: Categoria[],
  usuario: Usuario,
  hoje: DataISO,
): LinhaFluxo[] {
  const categoria = acharNaLista(categorias, l.despesa, (c) => c.despesa);
  if (!categoria) throw new CategoriaDesconhecida(l.despesa);
  const pagoCom = acharNaLista([...FORMAS_PAGAMENTO], l.pago_com, (f) => f) ?? l.pago_com;
  const banco =
    acharNaLista([...usuario.contas, ...usuario.cartoes.map((c) => c.nome)], l.banco, (b) => b) ?? l.banco;
  const data = dataValida(l.data) ? l.data : hoje;
  const parcelas = Number.isInteger(l.parcelas) && l.parcelas >= 1 && l.parcelas <= 48 ? l.parcelas : 1;
  const entrada = ehRenda(categoria) || comparavel(l.natureza) === "entrada";
  const sinal = entrada ? 1 : -1;
  const cartao = pagoCom === "Crédito" ? usuario.cartoes.find((c) => c.nome === banco) : undefined;

  return dividirEmParcelas(Math.abs(l.valor), parcelas).map((valor, i) => {
    const n = i + 1;
    const dataISO = cartao ? vencimentoDaParcela(data, cartao, n) : dataDaParcelaMensal(data, n);
    let descricao = l.descricao;
    if (parcelas > 1) descricao += ` (${n}/${parcelas})`;
    if (cartao) descricao += ` - compra em ${paraPlanilha(data)}`;
    return {
      data: paraPlanilha(dataISO),
      despesa: categoria.despesa,
      descricao,
      nome: l.nome,
      pagoCom,
      banco,
      valor: sinal * valor,
      dataISO,
      categoria,
    };
  });
}

/** "5/11/2026", "05/11/26" ou "2026-11-05" viram "2026-11-05", para comparar datas escritas de jeitos diferentes. */
export function dataComparavel(texto: string): string {
  const t = texto.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!br) return t;
  const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
  return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
}

/**
 * Tira as compras no crédito que já estão na planilha (mesmo cartão, mesmo vencimento e mesmo valor),
 * para a fatura não contar de novo o que a pessoa já mandou por foto. Cada linha da planilha só
 * cobre uma linha nova: duas compras iguais na fatura e uma na planilha fazem entrar só uma.
 * Devolve as linhas que sobram de cada lançamento e quantas foram puladas.
 */
export function tirarRepetidas(
  linhas: LinhaFluxo[][],
  existentes: LinhaExistente[],
): { linhas: LinhaFluxo[][]; puladas: LinhaFluxo[] } {
  const chave = (data: string, banco: string, valor: number) =>
    `${dataComparavel(data)}|${comparavel(banco)}|${centavos(Math.abs(valor))}`;
  const disponiveis = new Map<string, number>();
  for (const e of existentes) {
    const k = chave(e.data, e.banco, e.valor);
    disponiveis.set(k, (disponiveis.get(k) ?? 0) + 1);
  }
  const puladas: LinhaFluxo[] = [];
  const restantes = linhas.map((ls) =>
    ls.filter((l) => {
      if (l.pagoCom !== "Crédito") return true;
      const k = chave(l.data, l.banco, l.valor);
      const n = disponiveis.get(k) ?? 0;
      if (n === 0) return true;
      disponiveis.set(k, n - 1);
      puladas.push(l);
      return false;
    }),
  );
  return { linhas: restantes, puladas };
}

/** O WhatsApp corta mensagens longas; num extrato inteiro mostramos só os primeiros itens. */
const MAX_ITENS_NO_RESUMO = 10;

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
const mesAno = (d: DataISO) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });

/** Mensagem de confirmação enviada no WhatsApp. */
export function resumir(lancamentos: LancamentoClassificado[], linhas: LinhaFluxo[][]): string {
  const partes = lancamentos.map((l, i) => {
    const ls = linhas[i];
    const primeira = ls[0];
    const total = ls.reduce((s, x) => s + x.valor, 0);
    const sinal = total >= 0 ? "+" : "-";
    let texto = `${sinal} *${reais(Math.abs(total))}* ${primeira.nome ? `em ${primeira.nome} ` : ""}→ _${primeira.categoria.tipo} › ${primeira.despesa}_ (${primeira.banco})`;
    if (ls.length > 1) {
      texto += `\n   ${ls.length}x de ${reais(Math.abs(ls[ls.length - 1].valor))}, de ${mesAno(ls[0].dataISO)} a ${mesAno(ls[ls.length - 1].dataISO)}`;
    } else if (primeira.pagoCom === "Crédito") {
      texto += `\n   entra no caixa em ${primeira.data}, no vencimento da fatura`;
    }
    return texto;
  });
  const rodape = "Se algo estiver errado, responda *desfazer* e mande de novo.";
  if (lancamentos.length === 1) return `✅ Lancei:\n${partes[0]}\n\n${rodape}`;
  const todas = linhas.flat();
  const saidas = todas.filter((x) => x.valor < 0).reduce((s, x) => s - x.valor, 0);
  const entradas = todas.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0);
  const visiveis = partes.slice(0, MAX_ITENS_NO_RESUMO);
  const resto = partes.length - visiveis.length;
  return [
    `✅ Lancei ${lancamentos.length} itens (saídas ${reais(saidas)}, entradas ${reais(entradas)}):`,
    ...visiveis,
    ...(resto > 0 ? [`…e mais ${resto} itens. Confira na planilha.`] : []),
    "",
    rodape,
  ].join("\n");
}
