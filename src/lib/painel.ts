import type { Usuario } from "./config";
import type { DataISO } from "./datas";
import type { LinhaDoFluxo, Meta } from "./metas";
import { ehPrevisto } from "./previsao";

/**
 * Números do painel do site, calculados a partir do fluxo de caixa: saldos, a linha do tempo do caixa
 * (passado e futuro), contas a pagar, cartões, dívidas e gastos por categoria comparados ao mês anterior.
 *
 * Cartão de crédito tem dois jeitos de lançar, e o painel percebe qual a pessoa usa:
 * - só as compras, na data do vencimento (é o que o Dino faz): a compra é a saída de dinheiro;
 * - as compras e também o "Pagamento do cartão" saindo da conta: aí o dinheiro sai no pagamento,
 *   e as compras servem só para as categorias.
 */

export interface Filtro {
  banco?: string;
  /** Meses de passado na linha do tempo. */
  passado: number;
  /** Meses de futuro projetado na linha do tempo. */
  futuro: number;
  /** Mês dos gastos por categoria (AAAA-MM). */
  mes?: string;
}

export interface Saldo {
  conta: string;
  valor: number;
  /** Caixinha ou cofrinho (conta do tipo Investimento): dinheiro guardado, mas que pode ser resgatado. */
  guardado?: boolean;
}

export interface Barra {
  inicio: DataISO;
  fim: DataISO;
  entrou: number;
  saiu: number;
  saldoInicial: number;
  saldoFinal: number;
  futuro: boolean;
}

export interface Alerta {
  /** Primeiro dia em que o saldo fica abaixo de zero. */
  negativoEm?: DataISO;
  menor: { valor: number; data: DataISO };
  /** Primeiro dia depois do menor saldo em que ele volta a ficar positivo. */
  voltaEm?: DataISO;
}

export interface ContaAPagar {
  data: DataISO;
  descricao: string;
  banco: string;
  valor: number;
  atrasada: boolean;
  recorrente: boolean;
}

export interface ResumoCartao {
  nome: string;
  proxima?: { data: DataISO; valor: number; restante: number };
  /** Pago antes do vencimento desde a última fatura. */
  antecipado: number;
  /** O que ainda ocupa o limite: compras a vencer menos o que já foi pago. */
  emAberto: number;
  limite?: number;
  disponivel?: number;
}

export interface Divida {
  nome: string;
  valor: number;
  parcelas: number;
}

export interface GastoComparado {
  despesa: string;
  atual: number;
  anterior: number;
  /** Variação em relação ao mês anterior (0,27 = +27%). Sem gasto no mês anterior, fica undefined. */
  variacao?: number;
  meta?: number;
}

export interface Painel {
  hoje: DataISO;
  filtro: Filtro;
  bancos: string[];
  pagamentoSeparado: boolean;
  saldos: Saldo[];
  saldoHoje: number;
  barras: Barra[];
  porDia: boolean;
  alerta?: Alerta;
  aPagar: ContaAPagar[];
  totalAPagar: number;
  cartoes: ResumoCartao[];
  dividas: Divida[];
  totalDividas: number;
  parcelamentos: Divida[];
  totalParcelamentos: number;
  gastos: {
    mes: string;
    mesAnterior: string;
    mesSeguinte?: string;
    itens: GastoComparado[];
    totalAtual: number;
    totalAnterior: number;
  };
}

const comparavel = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const centavos = (v: number) => Math.round(v * 100) / 100;
const somar = (xs: { valor: number }[]) => centavos(xs.reduce((s, x) => s + x.valor, 0));

const ehCredito = (l: LinhaDoFluxo) => comparavel(l.pagoCom ?? "") === "credito";
/** Marcada como "Atrasado" em Pago com: conta que venceu e ainda não foi paga. */
const ehAtrasada = (l: LinhaDoFluxo) => comparavel(l.pagoCom ?? "").startsWith("atrasad");
/** Ainda não aconteceu: "[previsto]" na descrição, ou "Previsão" ou "Atrasado" em Pago com. */
export const ehPrevista = (l: LinhaDoFluxo) =>
  ehPrevisto(l.descricao) || comparavel(l.pagoCom ?? "").startsWith("previs") || ehAtrasada(l);
/** "Pagamento do cartão", "Pagamento da fatura", "Pag fatura Nubank". */
const ehPagamentoDeCartao = (l: LinhaDoFluxo) =>
  l.valor < 0 && /\bpag\w*\s+(?:d[aoe]s?\s+)?(?:cart|fatura)/.test(comparavel(l.descricao));
/** Transferência entre contas e pagamento de fatura não são gasto: o gasto já está nas compras. */
const ehTransferencia = (l: LinhaDoFluxo) =>
  /entre contas|transfer/.test(comparavel(`${l.tipo ?? ""} ${l.despesa}`)) || ehPagamentoDeCartao(l);

/** A pessoa lança o pagamento da fatura saindo da conta? Então as compras no crédito não são saída de caixa. */
export function pagaFaturaSeparado(fluxo: LinhaDoFluxo[]): boolean {
  return fluxo.some((l) => !ehCredito(l) && ehPagamentoDeCartao(l));
}

function somarDias(data: DataISO, dias: number): DataISO {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function somarMeses(data: DataISO, meses: number): DataISO {
  const [a, m, d] = data.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/**
 * O cartão de uma linha. A coluna Banco às vezes traz o nome do banco ("Nubank") e o cadastro traz
 * o cartão ("Nubank Cartão"): vale o único cartão cujo nome contém o outro.
 */
function cartaoDaLinha(banco: string, cartoes: string[]): string | undefined {
  const b = comparavel(banco);
  const exato = cartoes.find((c) => comparavel(c) === b);
  if (exato) return exato;
  const parecidos = b ? cartoes.filter((c) => comparavel(c).includes(b) || b.includes(comparavel(c))) : [];
  if (parecidos.length === 1) return parecidos[0];
  return undefined;
}

const doBanco = (banco: string | undefined, filtro?: string) => {
  if (!filtro) return true;
  const b = comparavel(banco ?? "");
  const f = comparavel(filtro);
  return b === f || b.includes(f) || (b.length > 0 && f.includes(b));
};

/** Saldo de cada conta até hoje, com o que já aconteceu. Batem com o extrato quando a planilha está em dia. */
export function saldosPorConta(fluxo: LinhaDoFluxo[], hoje: DataISO, separado = pagaFaturaSeparado(fluxo)): Saldo[] {
  const mapa = new Map<string, Saldo>();
  for (const l of fluxo) {
    if (l.data > hoje || ehPrevista(l) || (separado && ehCredito(l))) continue;
    const nome = l.banco || "Sem conta";
    const k = comparavel(nome);
    const s = mapa.get(k) ?? { conta: nome, valor: 0 };
    s.valor += l.valor;
    mapa.set(k, s);
  }
  return [...mapa.values()]
    .map((s) => ({ ...s, valor: centavos(s.valor) }))
    .filter((s) => Math.abs(s.valor) >= 0.01)
    .sort((a, b) => b.valor - a.valor);
}

/** Resumo dos cartões: próxima fatura, o que já foi pago antes do vencimento e o limite livre. */
export function resumoDosCartoes(
  fluxo: LinhaDoFluxo[],
  hoje: DataISO,
  usuario: Pick<Usuario, "cartoes">,
  separado = pagaFaturaSeparado(fluxo),
): ResumoCartao[] {
  const cadastrados = usuario.cartoes.map((c) => c.nome);
  const nomes = new Map<string, string>(cadastrados.map((c) => [comparavel(c), c]));
  const futuras = fluxo
    .filter((l) => l.data > hoje && ehCredito(l))
    .map((l) => {
      const cartao = cartaoDaLinha(l.banco ?? "", cadastrados) ?? (l.banco || "Cartão");
      if (!nomes.has(comparavel(cartao))) nomes.set(comparavel(cartao), cartao);
      return { ...l, cartao };
    });

  return [...nomes.entries()].map(([chave, nome]) => {
    const cadastro = usuario.cartoes.find((c) => comparavel(c.nome) === chave);
    const doCartao = futuras.filter((l) => comparavel(l.cartao) === chave).sort((a, b) => a.data.localeCompare(b.data));
    const total = Math.max(0, -somar(doCartao));
    const dataProxima = doCartao[0]?.data;
    const valorProxima = dataProxima ? Math.max(0, -somar(doCartao.filter((l) => l.data === dataProxima))) : 0;

    // Pagamentos feitos depois do último vencimento abatem a próxima fatura (e liberam limite).
    let antecipado = 0;
    if (separado && cadastro) {
      const [a, m, d] = hoje.split("-").map(Number);
      const venceEsteMes = `${a}-${String(m).padStart(2, "0")}-${String(cadastro.vencimento).padStart(2, "0")}`;
      const ultimoVencimento = d >= cadastro.vencimento ? venceEsteMes : somarMeses(venceEsteMes, -1);
      const pagamentos = fluxo.filter(
        (l) =>
          !ehPrevista(l) &&
          !ehCredito(l) &&
          ehPagamentoDeCartao(l) &&
          l.data > ultimoVencimento &&
          l.data <= hoje &&
          (usuario.cartoes.length === 1 || cartaoDaLinha(l.banco ?? "", cadastrados) === cadastro.nome),
      );
      antecipado = -somar(pagamentos);
    }
    const emAberto = centavos(Math.max(0, total - antecipado));
    const limite = cadastro?.limite;
    return {
      nome,
      antecipado: centavos(antecipado),
      emAberto,
      ...(dataProxima
        ? { proxima: { data: dataProxima, valor: centavos(valorProxima), restante: centavos(Math.max(0, valorProxima - antecipado)) } }
        : {}),
      ...(limite ? { limite, disponivel: centavos(limite - emAberto) } : {}),
    };
  });
}

interface Movimento {
  data: DataISO;
  valor: number;
  futuro: boolean;
}

/**
 * Entradas e saídas de dinheiro, no passado e no futuro. O que estava previsto e não aconteceu
 * (atrasado) entra amanhã. No jeito "pagamento separado", a fatura futura entra pelo valor das
 * compras, menos o que já foi pago antes do vencimento.
 */
function movimentosDeCaixa(
  fluxo: LinhaDoFluxo[],
  hoje: DataISO,
  cartoes: ResumoCartao[],
  separado: boolean,
  banco?: string,
): Movimento[] {
  const amanha = somarDias(hoje, 1);
  const movimentos: Movimento[] = [];
  for (const l of fluxo) {
    if (!doBanco(l.banco, banco)) continue;
    const prevista = ehPrevista(l);
    if (l.data <= hoje && !prevista) {
      if (separado && ehCredito(l)) continue;
      movimentos.push({ data: l.data, valor: l.valor, futuro: false });
    } else {
      if (separado && ehPagamentoDeCartao(l) && !ehCredito(l)) continue; // a fatura já entra pelas compras
      movimentos.push({ data: l.data <= hoje ? amanha : l.data, valor: l.valor, futuro: true });
    }
  }
  for (const c of cartoes) {
    if (c.proxima && c.antecipado > 0 && doBanco(c.nome, banco)) {
      movimentos.push({ data: c.proxima.data, valor: Math.min(c.antecipado, c.proxima.valor), futuro: true });
    }
  }
  return movimentos.sort((a, b) => a.data.localeCompare(b.data));
}

/** Barras da cascata no tempo: por dia até dois meses de janela, por semana acima disso. */
export function linhaDoTempo(
  movimentos: Movimento[],
  hoje: DataISO,
  passado: number,
  futuro: number,
): { barras: Barra[]; porDia: boolean; saldoHoje: number; alerta?: Alerta } {
  const inicio = somarDias(somarMeses(hoje, -passado), 1);
  const fim = somarMeses(hoje, futuro);
  const dias = Math.round((Date.parse(fim) - Date.parse(inicio)) / 86_400_000) + 1;
  const porDia = dias <= 62;
  const passo = porDia ? 1 : 7;

  // Janelas: do passado terminando hoje, e do futuro começando amanhã.
  const janelas: { inicio: DataISO; fim: DataISO; futuro: boolean }[] = [];
  for (let f = hoje; f >= inicio; f = somarDias(f, -passo)) {
    const i = somarDias(f, -(passo - 1));
    janelas.unshift({ inicio: i < inicio ? inicio : i, fim: f, futuro: false });
  }
  for (let i = somarDias(hoje, 1); i <= fim; i = somarDias(i, passo)) {
    const f = somarDias(i, passo - 1);
    janelas.push({ inicio: i, fim: f > fim ? fim : f, futuro: true });
  }

  let saldo = somar(movimentos.filter((m) => m.data < inicio && !m.futuro));
  const barras: Barra[] = janelas.map((j) => {
    const dentro = movimentos.filter((m) => m.data >= j.inicio && m.data <= j.fim && m.futuro === j.futuro);
    const entrou = somar(dentro.filter((m) => m.valor > 0));
    const saiu = -somar(dentro.filter((m) => m.valor < 0));
    const saldoInicial = saldo;
    saldo = centavos(saldo + entrou - saiu);
    return { ...j, entrou, saiu, saldoInicial, saldoFinal: saldo };
  });

  // Saldo de hoje e alerta dia a dia no futuro (independe do tamanho das barras).
  const saldoHoje = somar(movimentos.filter((m) => !m.futuro));
  let corrente = saldoHoje;
  let negativoEm = corrente < 0 ? hoje : undefined;
  let menor = { valor: corrente, data: hoje };
  let voltaEm: DataISO | undefined;
  const porData = new Map<DataISO, number>();
  for (const m of movimentos) if (m.futuro && m.data <= fim) porData.set(m.data, (porData.get(m.data) ?? 0) + m.valor);
  for (const [data, valor] of [...porData.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    corrente = centavos(corrente + valor);
    if (corrente < 0 && !negativoEm) negativoEm = data;
    if (corrente < menor.valor) {
      menor = { valor: corrente, data };
      voltaEm = undefined;
    } else if (menor.valor < 0 && corrente >= 0 && !voltaEm) {
      voltaEm = data;
    }
  }
  const alerta = menor.valor < 0 ? { negativoEm, menor, voltaEm } : undefined;
  return { barras, porDia, saldoHoje, alerta };
}

const DIAS_A_PAGAR = 7;

/** Contas atrasadas (previstas com data que já passou) e as que vencem nos próximos 7 dias. */
export function contasAPagar(
  fluxo: LinhaDoFluxo[],
  hoje: DataISO,
  cartoes: ResumoCartao[],
  separado: boolean,
  banco?: string,
): ContaAPagar[] {
  const limite = somarDias(hoje, DIAS_A_PAGAR);
  const contas: ContaAPagar[] = [];
  for (const l of fluxo) {
    if (l.valor >= 0 || ehCredito(l) || !doBanco(l.banco, banco)) continue;
    if (separado && ehPagamentoDeCartao(l)) continue; // a fatura aparece pelo cartão
    const prevista = ehPrevista(l);
    const atrasada = ehAtrasada(l) || (prevista && l.data < hoje);
    const proxima = (l.data > hoje || (prevista && l.data === hoje)) && l.data <= limite;
    if (!atrasada && !proxima) continue;
    contas.push({
      data: l.data,
      descricao: ehPrevisto(l.descricao) ? l.descricao.replace(/^\s*\[previsto\]\s*/i, "") : l.descricao || l.despesa,
      banco: l.banco ?? "",
      valor: -l.valor,
      atrasada,
      recorrente: ehPrevisto(l.descricao),
    });
  }
  for (const c of cartoes) {
    if (!c.proxima || c.proxima.data > limite || c.proxima.restante <= 0 || !doBanco(c.nome, banco)) continue;
    contas.push({ data: c.proxima.data, descricao: `Fatura ${c.nome}`, banco: c.nome, valor: c.proxima.restante, atrasada: false, recorrente: false });
  }
  return contas.sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || a.data.localeCompare(b.data));
}

/** "7/12", "(2/3)", "Mentor IA 05/08": número da parcela; datas como 16/08/2026 não contam. */
const PARCELA = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/;
const EMPRESTIMO = /empr[eé]stimo|financiamento|d[ií]vida|consignado/i;

/**
 * O que ainda falta pagar, separado em dívidas (empréstimos, financiamentos, dívidas) e parcelamentos
 * (compras e serviços em "n/N" parcelas, inclusive no cartão).
 */
export function compromissos(
  fluxo: LinhaDoFluxo[],
  hoje: DataISO,
  banco?: string,
): { dividas: Divida[]; parcelamentos: Divida[] } {
  const dividas = new Map<string, Divida>();
  const parcelamentos = new Map<string, Divida>();
  for (const l of fluxo) {
    if (l.valor >= 0 || !doBanco(l.banco, banco)) continue;
    if (l.data <= hoje && !ehPrevista(l)) continue; // já pago
    const p = l.descricao.match(PARCELA);
    const ehParcela = !!p && Number(p[1]) <= Number(p[2]) && Number(p[2]) >= 2;
    const ehDivida = EMPRESTIMO.test(`${l.despesa} ${l.descricao}`);
    if (ehCredito(l) && !ehParcela) continue; // compra à vista no cartão aparece na fatura
    if (!ehParcela && !ehDivida) continue;
    const base =
      l.descricao
        .replace(/^\s*\[previsto\]\s*/i, "")
        .replace(/\s*-\s*compra em .*$/i, "")
        .replace(PARCELA, "")
        .replace(/\(\s*\)/g, "")
        .replace(/^[\s\-–]+|[\s\-–]+$/g, "")
        .replace(/\s{2,}/g, " ")
        .trim() || l.despesa;
    const nome = ehCredito(l) ? `${base} (cartão)` : base;
    const grupo = ehDivida ? dividas : parcelamentos;
    const k = comparavel(nome);
    const g = grupo.get(k) ?? { nome, valor: 0, parcelas: 0 };
    g.valor = centavos(g.valor - l.valor);
    g.parcelas += 1;
    grupo.set(k, g);
  }
  const ordenar = (m: Map<string, Divida>) => [...m.values()].sort((a, b) => b.valor - a.valor);
  return { dividas: ordenar(dividas), parcelamentos: ordenar(parcelamentos) };
}

/** Gastos por categoria no mês, comparados com o mês anterior. */
export function gastosComparados(fluxo: LinhaDoFluxo[], mes: string, metas: Meta[], banco?: string) {
  const anterior = somarMeses(`${mes}-01`, -1).slice(0, 7);
  const metaDe = new Map(metas.map((m) => [comparavel(m.despesa), m.valor]));
  const mapa = new Map<string, GastoComparado>();
  for (const l of fluxo) {
    const m = l.data.slice(0, 7);
    if ((m !== mes && m !== anterior) || !l.despesa || ehTransferencia(l) || !doBanco(l.banco, banco)) continue;
    const k = comparavel(l.despesa);
    const g = mapa.get(k) ?? { despesa: l.despesa, atual: 0, anterior: 0 };
    if (m === mes) g.atual -= l.valor;
    else g.anterior -= l.valor;
    mapa.set(k, g);
  }
  // Só despesas: categorias que no saldo dos dois meses deram entrada (renda) ficam de fora.
  const itens = [...mapa.values()]
    .map((g) => ({ ...g, atual: centavos(Math.max(0, g.atual)), anterior: centavos(Math.max(0, g.anterior)) }))
    .filter((g) => g.atual > 0 || g.anterior > 0)
    .map((g) => {
      const meta = metaDe.get(comparavel(g.despesa));
      return {
        ...g,
        ...(g.anterior > 0 ? { variacao: Math.round(((g.atual - g.anterior) / g.anterior) * 1000) / 1000 } : {}),
        ...(meta ? { meta } : {}),
      };
    })
    .sort((a, b) => b.atual - a.atual || b.anterior - a.anterior);
  return {
    mes,
    mesAnterior: anterior,
    itens,
    totalAtual: centavos(itens.reduce((s, g) => s + g.atual, 0)),
    totalAnterior: centavos(itens.reduce((s, g) => s + g.anterior, 0)),
  };
}

export const OPCOES_MESES = [1, 3, 6] as const;
const opcao = (n: number | undefined, padrao: number) => (OPCOES_MESES.includes(n as 1) ? (n as number) : padrao);

export function montarPainel(
  fluxo: LinhaDoFluxo[],
  usuario: Pick<Usuario, "cartoes" | "contas" | "guardados">,
  metas: Meta[],
  hoje: DataISO,
  pedido: Partial<Filtro> = {},
): Painel {
  const separado = pagaFaturaSeparado(fluxo);
  const guardados = new Set((usuario.guardados ?? []).map(comparavel));
  const saldosTodos = saldosPorConta(fluxo, hoje, separado).map((s) =>
    guardados.has(comparavel(s.conta)) ? { ...s, guardado: true } : s,
  );
  const bancos = usuario.contas.length > 0 ? usuario.contas : saldosTodos.map((s) => s.conta);
  const banco = bancos.find((b) => comparavel(b) === comparavel(pedido.banco ?? ""));
  const mesAtual = hoje.slice(0, 7);
  const mes = pedido.mes && /^\d{4}-\d{2}$/.test(pedido.mes) ? pedido.mes : mesAtual;
  const filtro: Filtro = { banco, passado: opcao(pedido.passado, 3), futuro: opcao(pedido.futuro, 3), mes };

  const cartoes = resumoDosCartoes(fluxo, hoje, usuario, separado);
  const movimentos = movimentosDeCaixa(fluxo, hoje, cartoes, separado, banco);
  const tempo = linhaDoTempo(movimentos, hoje, filtro.passado, filtro.futuro);
  const aPagar = contasAPagar(fluxo, hoje, cartoes, separado, banco);
  const { dividas, parcelamentos } = compromissos(fluxo, hoje, banco);
  const ultimoMes = fluxo.reduce((m, l) => (l.data.slice(0, 7) > m ? l.data.slice(0, 7) : m), mesAtual);
  const gastos = gastosComparados(fluxo, mes, metas, banco);

  return {
    hoje,
    filtro,
    bancos,
    pagamentoSeparado: separado,
    saldos: banco ? saldosTodos.filter((s) => doBanco(s.conta, banco)) : saldosTodos,
    saldoHoje: tempo.saldoHoje,
    barras: tempo.barras,
    porDia: tempo.porDia,
    ...(tempo.alerta ? { alerta: tempo.alerta } : {}),
    aPagar,
    totalAPagar: somar(aPagar),
    cartoes: banco ? cartoes.filter((c) => doBanco(c.nome, banco)) : cartoes,
    dividas,
    totalDividas: somar(dividas),
    parcelamentos,
    totalParcelamentos: somar(parcelamentos),
    gastos: { ...gastos, ...(mes < ultimoMes ? { mesSeguinte: somarMeses(`${mes}-01`, 1).slice(0, 7) } : {}) },
  };
}
