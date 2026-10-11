import { describe, expect, it } from "vitest";
import { complementos, proximaLinhaVazia } from "@/lib/planilha";

describe("proximaLinhaVazia", () => {
  it("vai para a linha logo abaixo do último lançamento", () => {
    const colA = [["DATA"], ["01/01/2026"], [""], ["03/01/2026"]];
    const colC = [["DESPESA"], ["SI"], ["Salário/Pró-labore"], [""]];
    expect(proximaLinhaVazia(colA, colC)).toBe(5);
  });
  it("ignora linhas vazias no topo e no meio (como na planilha do Camacho)", () => {
    const colA = [["DATA"], [], [], ["01/01/2026"], [""], ["05/01/2026"]];
    const colC = [["DESPESA"], [], [], ["SI"], [""], ["Padaria"]];
    expect(proximaLinhaVazia(colA, colC)).toBe(7);
  });
  it("conta a despesa mesmo sem data e começa na linha 2 numa planilha vazia", () => {
    expect(proximaLinhaVazia([["DATA"], ["x"]], [["DESPESA"], [""], ["", ""], ["Padaria"]])).toBe(5);
    expect(proximaLinhaVazia([["DATA"]], [["DESPESA"]])).toBe(2);
  });
});

describe("complementos", () => {
  it("não mexe quando TIPO e CAIXA já têm fórmula (planilha modelo)", () => {
    expect(complementos(10, "Alimentação", "=XLOOKUP(C10;Contas!C:C;Contas!B:B)", "=H10+I9")).toEqual({});
  });
  it("preenche TIPO e o saldo acumulado quando estão vazios", () => {
    expect(complementos(250, "Estudos", "", "")).toEqual({ b: "Estudos", i: "=H250+I249" });
    expect(complementos(2, "Casa", "", "")).toEqual({ b: "Casa", i: "=H2" });
  });
});
