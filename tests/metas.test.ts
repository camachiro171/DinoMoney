import { describe, expect, it } from "vitest";
import { acharDespesa, gastosDoMes, numeroBR } from "@/lib/metas";
import { projetar } from "@/lib/previsao";
import { categorias } from "./fixtures";

describe("numeroBR", () => {
  it("entende os formatos da planilha", () => {
    expect(numeroBR("R$ 1.234,56")).toBe(1234.56);
    expect(numeroBR("(35,31)")).toBe(-35.31);
    expect(numeroBR(800)).toBe(800);
    expect(numeroBR("R$ 0,00")).toBe(0);
    expect(numeroBR("")).toBe(0);
  });
});

describe("acharDespesa", () => {
  const despesas = ["Supermercado", "Padaria", "Outros Gastos com Lazer", "Outros Gastos com Casa"];
  it("acha pelo nome exato ou por parte dele", () => {
    expect(acharDespesa(despesas, "padaria")).toBe("Padaria");
    expect(acharDespesa(despesas, "mercado")).toBe("Supermercado");
  });
  it("devolve as opções quando é ambíguo", () => {
    expect(acharDespesa(despesas, "outros gastos")).toEqual(["Outros Gastos com Lazer", "Outros Gastos com Casa"]);
  });
});

describe("gastosDoMes", () => {
  it("soma as saídas do mês e abate estornos", () => {
    const g = gastosDoMes(
      [
        { linha: 2, data: "2026-10-01", despesa: "Padaria", descricao: "", valor: -10 },
        { linha: 3, data: "2026-10-05", despesa: "padaria", descricao: "", valor: -5 },
        { linha: 4, data: "2026-10-06", despesa: "Padaria", descricao: "", valor: 3 },
        { linha: 5, data: "2026-09-30", despesa: "Padaria", descricao: "", valor: -99 },
      ],
      "2026-10",
    );
    expect(g.get("padaria")).toBe(12);
  });
});

describe("projetar", () => {
  it("dia 31 vira o último dia dos meses curtos", () => {
    const base = { data: "31/10/2026", dataISO: "2026-10-31", despesa: "Internet", descricao: "net", nome: "", pagoCom: "Pix", banco: "Itaú", valor: -100, categoria: categorias[0] };
    expect(projetar(base, 31, "2026-10-31").map((l) => l.dataISO)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
  });
});
