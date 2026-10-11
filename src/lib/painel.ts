import type { Usuario } from "./config";
import type { DataISO } from "./datas";
import type { LinhaDoFluxo, Meta } from "./metas";
import { ehPrevisto } from "./previsao";

/**
 * Números do painel do site, calculados a partir do fluxo de caixa:
 * saldo de cada conta, gastos do mês por categoria, a cascata do mês e as faturas futuras dos cartões.
 */

export interface Saldo {
  conta: string;
  valor: number;
}

export interface Gasto {
  despesa: string;
  valor: number;
  meta?: number;
}

export interface DegrauCascata {
  rotulo: string;
  valor: number;
  tipo: "inicio" | "entrada" | "saida" | "fim";
}

export interface Fatura {
  mes: string; // AAAA-MM do vencimento
  valor: number;
}

export interface ResumoCartao {
  nome: string;
  faturas: Fatura[];
  /** Tudo que ainda vai ser cobrado no cartão (inclui parcelas futuras). */
  emAberto: number;
  limite?: number;
  disponivel?: number;
}

export interface Painel {
  hoje: DataISO;
  mes: string; // AAAA-MM
  mesAnterior?: string;
  mesSeguinte?: string;
  saldos: Saldo[];
  saldoTotal: number;
  entradasMes: number;
  saidasMes: number;
  temPrevistosNoMes: boolean;
  gastos: Gasto[];
  cascata: DegrauCascata[];
  cartoes: ResumoCartao[];
}

const comparavel = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const ehCredito = (l: LinhaDoFluxo) => comparavel(l.pagoCom ?? "") === "credito";
const centavos = (v: number) => Math.round(v * 100) / 100;
const MAX_DEGRAUS_SAIDA = 6;

/** Soma por chave, guardando o primeiro jeito em que o nome apareceu escrito. */
function somarPor<T>(itens: T[], nome: (i: T) => string, valor: (i: T) => number): { nome: string; valor: number }[] {
  const mapa = new Map<string, { nome: string; valor: number }>();
  for (const i of itens) {
    const n = nome(i).trim();
    if (!n) continue;
    const k = comparavel(n);
    const atual = mapa.get(k) ?? { nome: n, valor: 0 };
    atual.valor += valor(i);
    mapa.set(k, atual);
  }
  return [...mapa.values()].map((x) => ({ ...x, valor: centavos(x.valor) }));
}

/**
 * O cartão de uma compra no crédito. A coluna Banco às vezes traz o nome do banco ("Nubank")
 * e o cadastro traz o cartão ("Nubank Cartão"): vale o único cartão cujo nome contém o outro.
 */
function cartaoDaLinha(banco: string, cartoes: string[]): string {
  const b = comparavel(banco);
  const exato = cartoes.find((c) => comparavel(c) === b);
  if (exato) return exato;
  const parecidos = b ? cartoes.filter((c) => comparavel(c).includes(b) || b.includes(comparavel(c))) : [];
  return parecidos.length === 1 ? parecidos[0] : banco || "Cartão";
}

/**
 * Saldo de cada conta até hoje: tudo que já aconteceu, como na planilha.
 * O que foi lançado com o nome de um cartão cadastrado aparece como faturas já vencidas daquele cartão.
 */
export function saldosPorConta(fluxo: LinhaDoFluxo[], hoje: DataISO, cartoes: string[]): Saldo[] {
  const ehCartao = new Set(cartoes.map(comparavel));
  const linhas = fluxo.filter((l) => l.data <= hoje && !ehPrevisto(l.descricao));
  const nome = (l: LinhaDoFluxo) =>
    ehCartao.has(comparavel(l.banco ?? "")) ? `${l.banco} (faturas vencidas)` : l.banco || "Sem conta";
  return somarPor(linhas, nome, (l) => l.valor)
    .filter((s) => Math.abs(s.valor) >= 0.01)
    .map((s) => ({ conta: s.nome, valor: s.valor }))
    .sort((a, b) => b.valor - a.valor);
}

/** Faturas que ainda vão vencer, por cartão, e quanto do limite sobra. */
export function resumoDosCartoes(fluxo: LinhaDoFluxo[], hoje: DataISO, usuario: Pick<Usuario, "cartoes">): ResumoCartao[] {
  const cadastrados = usuario.cartoes.map((c) => c.nome);
  const futuras = fluxo
    .filter((l) => l.data > hoje && ehCredito(l))
    .map((l) => ({ ...l, cartao: cartaoDaLinha(l.banco ?? "", cadastrados) }));
  const nomes = new Map<string, string>();
  for (const c of cadastrados) nomes.set(comparavel(c), c);
  for (const l of futuras) if (!nomes.has(comparavel(l.cartao))) nomes.set(comparavel(l.cartao), l.cartao);

  return [...nomes.entries()].map(([chave, nome]) => {
    const doCartao = futuras.filter((l) => comparavel(l.cartao) === chave);
    // Estornos no cartão abatem da fatura do mesmo mês.
    const faturas = somarPor(doCartao, (l) => l.data.slice(0, 7), (l) => -l.valor)
      .filter((f) => f.valor > 0)
      .map((f) => ({ mes: f.nome, valor: f.valor }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    const emAberto = centavos(faturas.reduce((s, f) => s + f.valor, 0));
    const limite = usuario.cartoes.find((c) => comparavel(c.nome) === chave)?.limite;
    return { nome, faturas, emAberto, ...(limite ? { limite, disponivel: centavos(limite - emAberto) } : {}) };
  });
}

/** Transferência entre contas e pagamento de fatura não são gasto: o gasto já está nas compras. */
const ehTransferencia = (l: LinhaDoFluxo) => /entre contas|transfer/.test(comparavel(`${l.tipo ?? ""} ${l.despesa}`));

/** Saídas do mês por categoria, das maiores para as menores, com a meta quando existe. */
export function gastosPorCategoria(fluxo: LinhaDoFluxo[], mes: string, metas: Meta[]): Gasto[] {
  const doMes = fluxo.filter((l) => l.data.startsWith(mes) && !ehTransferencia(l));
  const metaDe = new Map(metas.map((m) => [comparavel(m.despesa), m.valor]));
  // Estornos (entradas na mesma categoria de uma despesa) abatem do gasto.
  const porDespesa = somarPor(doMes, (l) => l.despesa, (l) => -l.valor);
  return porDespesa
    .filter((g) => g.valor > 0 && doMes.some((l) => l.valor < 0 && comparavel(l.despesa) === comparavel(g.nome)))
    .map((g) => {
      const meta = metaDe.get(comparavel(g.nome));
      return { despesa: g.nome, valor: g.valor, ...(meta ? { meta } : {}) };
    })
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Cascata do mês: saldo no começo, cada grupo de entrada e de saída (coluna TIPO da planilha)
 * e o saldo no fim. As saídas menores viram "Outros" para o gráfico não ficar ilegível.
 */
export function cascataDoMes(fluxo: LinhaDoFluxo[], mes: string): DegrauCascata[] {
  const inicio = centavos(fluxo.filter((l) => l.data < `${mes}-01`).reduce((s, l) => s + l.valor, 0));
  const doMes = fluxo.filter((l) => l.data.startsWith(mes));
  const grupo = (l: LinhaDoFluxo) => l.tipo || l.despesa || "Outros";
  // Cada grupo entra pelo saldo líquido: um estorno abate da saída do próprio grupo em vez de virar entrada.
  const grupos = somarPor(doMes, grupo, (l) => l.valor).filter((g) => Math.abs(g.valor) >= 0.01);
  const entradas = grupos.filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor);
  const saidas = grupos
    .filter((g) => g.valor < 0)
    .map((g) => ({ nome: g.nome, valor: -g.valor }))
    .sort((a, b) => b.valor - a.valor);
  const principais = saidas.slice(0, MAX_DEGRAUS_SAIDA);
  const resto = saidas.slice(MAX_DEGRAUS_SAIDA).reduce((s, x) => s + x.valor, 0);
  if (resto > 0) principais.push({ nome: "Outros", valor: centavos(resto) });
  const fim = centavos(inicio + doMes.reduce((s, l) => s + l.valor, 0));
  return [
    { rotulo: "Início do mês", valor: inicio, tipo: "inicio" },
    ...entradas.map((e) => ({ rotulo: e.nome, valor: e.valor, tipo: "entrada" as const })),
    ...principais.map((s) => ({ rotulo: s.nome, valor: s.valor, tipo: "saida" as const })),
    { rotulo: "Fim do mês", valor: fim, tipo: "fim" },
  ];
}

function somarMes(mes: string, k: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function montarPainel(
  fluxo: LinhaDoFluxo[],
  usuario: Pick<Usuario, "cartoes">,
  metas: Meta[],
  hoje: DataISO,
  mesPedido?: string,
): Painel {
  const meses = [...new Set(fluxo.map((l) => l.data.slice(0, 7)))].sort();
  const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : hoje.slice(0, 7);
  const primeiro = meses[0] ?? mes;
  const ultimo = meses[meses.length - 1] ?? mes;
  const doMes = fluxo.filter((l) => l.data.startsWith(mes));
  const semTransferencias = doMes.filter((l) => !ehTransferencia(l));
  const saldos = saldosPorConta(fluxo, hoje, usuario.cartoes.map((c) => c.nome));
  return {
    hoje,
    mes,
    mesAnterior: mes > primeiro ? somarMes(mes, -1) : undefined,
    mesSeguinte: mes < ultimo ? somarMes(mes, 1) : undefined,
    saldos,
    saldoTotal: centavos(saldos.reduce((s, x) => s + x.valor, 0)),
    entradasMes: centavos(semTransferencias.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0)),
    saidasMes: centavos(semTransferencias.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0)),
    temPrevistosNoMes: doMes.some((l) => l.data > hoje || ehPrevisto(l.descricao)),
    gastos: gastosPorCategoria(fluxo, mes, metas),
    cascata: cascataDoMes(fluxo, mes),
    cartoes: resumoDosCartoes(fluxo, hoje, usuario),
  };
}
