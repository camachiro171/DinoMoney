import { describe, expect, it } from "vitest";
import type { LinhaDoFluxo } from "@/lib/metas";
import { montarPainel } from "@/lib/painel";

let n = 2;
const l = (data: string, valor: number, despesa: string, banco: string, extra: Partial<LinhaDoFluxo> = {}): LinhaDoFluxo => ({
  linha: n++,
  data,
  valor,
  despesa,
  descricao: despesa,
  banco,
  pagoCom: "Pix",
  tipo: valor > 0 ? "Renda Principal" : "Gastos Pessoais",
  ...extra,
});

const fluxo: LinhaDoFluxo[] = [
  l("2026-09-01", 1000, "SI", "Itaú", { tipo: "SI" }),
  l("2026-10-05", 3000, "Salário", "Itaú"),
  l("2026-10-06", -500, "Supermercado", "Itaú"),
  l("2026-10-07", -200, "Supermercado", "Inter"),
  l("2026-10-08", 50, "Supermercado", "Inter"), // estorno
  l("2026-10-09", -1200, "Aluguel", "Itaú", { tipo: "Gastos Fixos" }),
  l("2026-10-10", -300, "Lanches", "Nubank", { pagoCom: "Crédito" }), // fatura já paga
  l("2026-10-20", -2357, "Aluguel", "Itaú", { tipo: "Gastos Fixos", descricao: "[previsto] Aluguel" }),
  l("2026-11-10", -400, "Lanches", "Nubank", { pagoCom: "Crédito" }),
  l("2026-12-10", -100, "Educação", "Nubank", { pagoCom: "Crédito" }),
  l("2026-11-10", -80, "Lanches", "Bradesco", { pagoCom: "Crédito" }),
  l("2026-10-09", -150, "Transferencia entre contas", "Itaú", { tipo: "Entre Contas" }),
  l("2026-10-09", 150, "Transferencia entre contas", "Inter", { tipo: "Entre Contas" }),
  // Compra no crédito com o nome do banco na coluna Banco: é do cartão "Nubank Cartão".
  l("2026-11-15", -60, "Lanches", "Nubank", { pagoCom: "Crédito" }),
];

const usuario = {
  cartoes: [
    { nome: "Nubank", fechamento: 3, vencimento: 10, limite: 2000 },
    { nome: "Itaú Click", fechamento: 1, vencimento: 8 },
  ],
};

describe("montarPainel", () => {
  const p = montarPainel(fluxo, usuario, [{ despesa: "Supermercado", valor: 600 }], "2026-10-11");

  it("soma o saldo de cada conta até hoje, sem previstos; o que foi no cartão aparece como fatura vencida", () => {
    expect(p.saldos).toEqual([
      { conta: "Itaú", valor: 2150 },
      { conta: "Inter", valor: 0 },
      { conta: "Nubank (faturas vencidas)", valor: -300 },
    ].filter((s) => s.valor !== 0));
    expect(p.saldoTotal).toBe(1850);
  });

  it("mostra a próxima fatura e o limite livre de cada cartão", () => {
    const nubank = p.cartoes.find((c) => c.nome === "Nubank")!;
    expect(nubank.faturas).toEqual([
      { mes: "2026-11", valor: 460 },
      { mes: "2026-12", valor: 100 },
    ]);
    expect(nubank.emAberto).toBe(560);
    expect(nubank.disponivel).toBe(1440);
    expect(p.cartoes.find((c) => c.nome === "Itaú Click")!.faturas).toEqual([]);
    const bradesco = p.cartoes.find((c) => c.nome === "Bradesco")!;
    expect(bradesco.emAberto).toBe(80);
    expect(bradesco.limite).toBeUndefined();
  });

  it("agrupa os gastos do mês por categoria, com estorno abatendo e a meta junto", () => {
    expect(p.gastos).toEqual([
      { despesa: "Aluguel", valor: 3557 },
      { despesa: "Supermercado", valor: 650, meta: 600 },
      { despesa: "Lanches", valor: 300 },
    ]);
    expect(p.temPrevistosNoMes).toBe(true);
  });

  it("monta a cascata do mês do saldo inicial ao final", () => {
    expect(p.cascata[0]).toEqual({ rotulo: "Início do mês", valor: 1000, tipo: "inicio" });
    expect(p.cascata.at(-1)).toEqual({ rotulo: "Fim do mês", valor: 1000 + 3000 + 50 - 500 - 200 - 1200 - 300 - 2357, tipo: "fim" });
    const meio = p.cascata.slice(1, -1);
    const soma = meio.reduce((s, d) => s + (d.tipo === "entrada" ? d.valor : -d.valor), 0);
    expect(1000 + soma).toBeCloseTo(p.cascata.at(-1)!.valor);
    expect(meio.map((d) => d.rotulo)).toEqual(["Renda Principal", "Gastos Fixos", "Gastos Pessoais"]);
    // Transferências entre contas se anulam e não viram degrau.
  });

  it("navega entre os meses que têm lançamentos", () => {
    expect(p.mesAnterior).toBe("2026-09");
    expect(p.mesSeguinte).toBe("2026-11");
    expect(montarPainel(fluxo, usuario, [], "2026-10-11", "2026-09").mesAnterior).toBeUndefined();
  });
});
