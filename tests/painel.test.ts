import { describe, expect, it } from "vitest";
import { investimentosDasLinhas, type LinhaDoFluxo } from "@/lib/metas";
import { montarPainel, pagaFaturaSeparado } from "@/lib/painel";

let n = 2;
const l = (
  data: string,
  valor: number,
  despesa: string,
  banco: string,
  pagoCom = "Pix",
  descricao = despesa,
  tipo = valor > 0 ? "Renda Principal" : "Gastos Pessoais",
): LinhaDoFluxo => ({ linha: n++, data, valor, despesa, descricao, banco, pagoCom, tipo });

const HOJE = "2026-10-11";

// Quem lança as compras do cartão e também o pagamento da fatura saindo da conta.
const comPagamento: LinhaDoFluxo[] = [
  l("2026-09-01", 1000, "SI", "Itaú", "SI", "SI", "SI"),
  l("2026-09-05", 2000, "Salário", "Itaú"),
  l("2026-09-15", -300, "Lanches", "Nubank", "Crédito"),
  l("2026-09-15", -300, "Transferencia entre contas", "Itaú", "Debito", "Pagamento do Cartão", "Entre Contas"),
  l("2026-09-20", -400, "Supermercado", "Itaú"),
  l("2026-09-20", 60, "Reembolsos", "Itaú", "Pix", "Pagar fatura", "Outras Rendas"),
  l("2026-10-05", 3000, "Salário", "Itaú"),
  l("2026-10-06", -100, "Transferencia entre contas", "Itaú", "Debito", "Pagamento do Cartão", "Entre Contas"),
  l("2026-10-07", -500, "Supermercado", "Itaú"),
  l("2026-10-09", -112.42, "Educação", "Itaú", "Previsão", "Resgate 10/12"), // atrasada
  l("2026-10-15", -700, "Supermercado", "Nubank", "Crédito"),
  l("2026-10-15", 0, "Transferencia entre contas", "Itaú", "Previsão", "Pagamento do Cartão", "Entre Contas"),
  l("2026-10-17", -65, "Telefone", "Itaú", "Previsão", "[previsto] Celular"),
  l("2026-11-05", -361.67, "Custo de trabalho", "Itaú", "Previsão", "7/12 - Livro"),
  l("2026-11-10", -5000, "Aluguel", "Itaú", "Previsão", "Reforma"),
  l("2026-11-15", -200, "Supermercado", "Nubank", "Crédito", "Mercado - compra em 16/10/2026"),
  l("2026-12-05", -361.67, "Custo de trabalho", "Itaú", "Previsão", "8/12 - Livro"),
  l("2026-12-07", 6000, "Salário", "Itaú", "Previsão"),
];
const usuario = { contas: ["Itaú", "Nubank"], cartoes: [{ nome: "Nubank", fechamento: 8, vencimento: 15, limite: 400 }] };

describe("montarPainel (pagamento da fatura lançado à parte)", () => {
  const p = montarPainel(comPagamento, usuario, [{ despesa: "Supermercado", valor: 600 }], HOJE);

  it("percebe o jeito de lançar e não tira as compras no crédito do saldo", () => {
    expect(pagaFaturaSeparado(comPagamento)).toBe(true);
    // 1000 + 2000 − 300 − 400 + 60 + 3000 − 100 − 500 (a previsão atrasada ainda não saiu)
    expect(p.saldos).toEqual([{ conta: "Itaú", valor: 4760 }]);
    expect(p.saldoHoje).toBe(4760);
  });

  it("abate da fatura o que já foi pago antes do vencimento e mostra o limite livre", () => {
    const [nubank] = p.cartoes;
    expect(nubank.antecipado).toBe(100); // pago em 06/10, depois do vencimento de 15/09
    expect(nubank.proxima).toEqual({ data: "2026-10-15", valor: 700, restante: 600 });
    expect(nubank.emAberto).toBe(800); // 700 + 200 − 100
    expect(nubank.disponivel).toBe(-400);
  });

  it("lista as contas a pagar com a atrasada primeiro, e a fatura pelo valor que falta", () => {
    expect(p.aPagar.map((c) => [c.descricao, c.valor, c.atrasada])).toEqual([
      ["Resgate 10/12", 112.42, true],
      ["Fatura Nubank", 600, false],
      ["Celular", 65, false],
    ]);
    expect(p.totalAPagar).toBe(777.42);
  });

  it("avisa quando o saldo vai ficar negativo e quando volta", () => {
    // 4760 − 112,42 (atrasada, amanhã) − 600 (fatura) − 65 − 361,67 − 5000 → negativo em 10/11
    expect(p.alerta?.negativoEm).toBe("2026-11-10");
    expect(p.alerta?.menor.data).toBe("2026-12-05");
    expect(p.alerta?.voltaEm).toBe("2026-12-07");
  });

  it("monta a cascata por semana do passado ao futuro, emendando os saldos", () => {
    expect(p.porDia).toBe(false);
    expect(p.barras.at(0)!.inicio).toBe("2026-07-12");
    const ultimaDoPassado = p.barras.filter((b) => !b.futuro).at(-1)!;
    expect(ultimaDoPassado.fim).toBe(HOJE);
    expect(ultimaDoPassado.saldoFinal).toBe(4760);
    p.barras.slice(1).forEach((b, i) => expect(b.saldoInicial).toBe(p.barras[i].saldoFinal));
    const umMes = montarPainel(comPagamento, usuario, [], HOJE, { passado: 1, futuro: 1 });
    expect(umMes.porDia).toBe(true);
  });

  it("separa dívidas de parcelamentos", () => {
    expect(p.dividas).toEqual([]);
    expect(p.parcelamentos).toEqual([
      { nome: "Livro", valor: 723.34, parcelas: 2 },
      { nome: "Resgate", valor: 112.42, parcelas: 1 },
    ]);
    const comEmprestimo = montarPainel(
      [
        ...comPagamento,
        l("2026-10-27", -240, "Parcela de emprestimos", "Itaú", "Previsão", "Pagamento do emprestimo"),
        l("2026-10-27", -239.52, "Custo de trabalho", "Itaú", "Previsão", "Dividas acumuladas 2/3"),
        l("2026-11-15", -50, "Lanches", "Nubank", "Crédito", "Fone (2/3) - compra em 10/09/2026"),
      ],
      usuario,
      [],
      HOJE,
    );
    expect(comEmprestimo.dividas.map((d) => d.nome)).toEqual(["Pagamento do emprestimo", "Dividas acumuladas"]);
    expect(comEmprestimo.parcelamentos.map((d) => d.nome)).toContain("Fone (cartão)");
  });

  it("trata 'Atrasado' em Pago com como conta atrasada, fora do saldo", () => {
    const comStatus = montarPainel([...comPagamento, l("2026-10-10", -50, "Telefone", "Itaú", "Atrasado", "Internet")], usuario, [], HOJE);
    expect(comStatus.saldoHoje).toBe(4760);
    expect(comStatus.aPagar.filter((c) => c.atrasada).map((c) => c.descricao)).toEqual(["Resgate 10/12", "Internet"]);
  });

  it("compara os gastos com o mês anterior, sem transferências nem pagamento de fatura", () => {
    expect(p.gastos.itens).toEqual([
      { despesa: "Supermercado", atual: 1200, anterior: 400, variacao: 2, meta: 600 },
      { despesa: "Educação", atual: 112.42, anterior: 0 },
      { despesa: "Telefone", atual: 65, anterior: 0 },
      { despesa: "Lanches", atual: 0, anterior: 300, variacao: -1 },
    ]);
  });

  it("filtra por banco", () => {
    const so = montarPainel(comPagamento, usuario, [], HOJE, { banco: "itau" });
    expect(so.filtro.banco).toBe("Itaú");
    expect(so.aPagar.map((c) => c.descricao)).toEqual(["Resgate 10/12", "Celular"]);
  });
});

describe("montarPainel (só as compras, como o Dino lança)", () => {
  const soCompras: LinhaDoFluxo[] = [
    l("2026-10-01", 2000, "Salário", "Itaú"),
    l("2026-10-10", -300, "Lanches", "Nubank Cartão", "Crédito"),
    l("2026-11-10", -150, "Lanches", "Nubank Cartão", "Crédito"),
  ];
  const p = montarPainel(soCompras, { contas: ["Itaú"], cartoes: [{ nome: "Nubank Cartão", fechamento: 3, vencimento: 10, limite: 1000 }] }, [], HOJE);

  it("conta a fatura vencida como saída e a próxima como conta a pagar futura", () => {
    expect(pagaFaturaSeparado(soCompras)).toBe(false);
    expect(p.saldoHoje).toBe(1700);
    expect(p.cartoes[0]).toMatchObject({ emAberto: 150, disponivel: 850, proxima: { data: "2026-11-10", restante: 150 } });
    expect(p.alerta).toBeUndefined();
  });
});

describe("investimentosDasLinhas", () => {
  it("acha as colunas pelo cabeçalho e pula linhas vazias", () => {
    const linhas = [
      ["", "Meta", "25%"],
      ["Data de Compra", "Data de Venda", "Ativo", "Banco", "Ticker", "ARCA", "Tipo", "Valor de Compra", "Valor Atualizado", "Quantidade", "Total investido", "Total Atualizado"],
      ["", "", "", "", "", "Ações", "Ações", "", "", "", "R$ 0,00", "R$ 0,00"],
      ["11/10/2026", "", "Cofrinho PicPay", "PicPay", "-", "Caixa", "Cofrinhos", 553.67, 605.45, 1, 553.67, 605.45],
    ];
    expect(investimentosDasLinhas(linhas)).toEqual([{ nome: "Cofrinho PicPay", banco: "PicPay", tipo: "Cofrinhos", valor: 605.45 }]);
  });
});

describe("montarPainel (caixinhas e cofrinhos)", () => {
  const fluxo: LinhaDoFluxo[] = [
    l("2026-10-01", 1000, "Salário", "Nubank"),
    l("2026-10-05", -1000, "Transferencia entre contas", "Nubank"),
    l("2026-10-05", 1000, "Transferencia entre contas", "Caixinha Nubank"),
    l("2026-10-10", 4, "Rendimento", "Caixinha Nubank", "Rendimento"),
  ];
  const p = montarPainel(fluxo, { contas: ["Nubank", "Caixinha Nubank"], cartoes: [], guardados: ["Caixinha Nubank"] }, [], HOJE);

  it("esconde a conta zerada, marca a caixinha como guardada e mantém o dinheiro disponível", () => {
    expect(p.saldos).toEqual([{ conta: "Caixinha Nubank", valor: 1004, guardado: true }]);
    expect(p.saldoHoje).toBe(1004);
    expect(p.alerta).toBeUndefined();
  });
});

describe("limite do cartão (pagamentos feitos entre o fechamento e o vencimento)", () => {
  const fatura = [
    l("2026-09-01", 2000, "Salário", "Itaú"),
    l("2026-09-10", -200, "Pagamento", "Itaú", "Debito", "Pagamento do Cartão", "Entre Contas"), // antes do vencimento de 15/09
    l("2026-09-15", -300, "Supermercado", "Nubank", "Crédito"),
    l("2026-09-20", -100, "Pagamento", "Itaú", "Debito", "Pagamento do Cartão", "Entre Contas"),
    l("2026-10-08", -250, "Pagamento", "Itaú", "Debito", "Pagamento do Cartão", "Entre Contas"),
    l("2026-10-08", 250, "Pagamento", "Nubank", "Crédito", "Pagamento do Cartão", "Entre Contas"), // espelho, não é estorno
    l("2026-10-15", -650, "Supermercado", "Nubank", "Crédito"),
    l("2026-11-15", -50, "Assinaturas", "Nubank", "Crédito"),
  ];
  const p = montarPainel(fatura, usuario, [], HOJE);

  it("usa todas as compras menos todos os pagamentos, sem contar o espelho do pagamento", () => {
    // 300 + 650 + 50 − 200 − 100 − 250 = 450 (o pagamento de 10/09 já pagou parte da compra de 15/09)
    expect(p.cartoes[0].emAberto).toBe(450);
    expect(p.cartoes[0].disponivel).toBe(-50);
  });

  it("não confunde um gasto chamado 'Pagar fatura' com pagamento do cartão", () => {
    const comLembrete = [...fatura, l("2026-09-14", -25.82, "Lanches", "Itaú", "Pix", "Pagar fatura")];
    expect(montarPainel(comLembrete, usuario, [], HOJE).cartoes[0].emAberto).toBe(450);
  });
});
