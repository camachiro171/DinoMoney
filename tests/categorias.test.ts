import { describe, expect, it } from "vitest";
import { categoriasDoHistorico, exemplosDoHistorico } from "@/lib/categorias";
import { categorias } from "./fixtures";

// Trecho real (colunas B:E) do fluxo do Camacho, que usa categorias próprias
const fluxo = [
  ["TIPO", "DESPESA", "Descrição da Despesa", "NOME"],
  [],
  ["SI", "SI", "SI", "SI"],
  ["RENDA", "Lucros Distribuídos aos Sócios", "lucros de Janeiro KNC", "Folego"],
  ["Estudos", "Educação Financeira", "Resgate  1/12", "Efinc"],
  ["Locomoção", "Gasolina", "Buscar Duda", "Ipiranga"],
  ["Entre Contas", "Transferencia entre contas", "Saída PicPay > Nubank", "Douglas Camacho"],
  ["", "", "Desodorante", "AYUMI"],
  ["Rendimento", "-", "Rendimento cofrinho", "-"],
  ["#N/A", "", "", ""],
  ["Alimentação", "Supermercado", "Almoço sexta", "Supermercado São Vicente"],
  ["Locomoção", "Gasolina", "Levar Duda", "Ipiranga"],
];

describe("categoriasDoHistorico", () => {
  it("acrescenta as categorias próprias do fluxo e ignora SI, vazios e as que já existem", () => {
    const novas = categoriasDoHistorico(fluxo, categorias);
    expect(novas.map((c) => c.despesa)).toEqual([
      "Lucros Distribuídos aos Sócios",
      "Educação Financeira",
      "Gasolina",
      "Transferencia entre contas",
    ]);
    expect(novas[0].grupo).toBe("Renda");
    expect(novas[3].grupo).toBe("Entre Contas");
  });
});

describe("exemplosDoHistorico", () => {
  it("guarda um exemplo por estabelecimento, o mais recente por último", () => {
    const ex = exemplosDoHistorico(fluxo);
    expect(ex.at(-1)).toBe("Ipiranga (Levar Duda) → Gasolina");
    expect(ex.filter((e) => e.startsWith("Ipiranga"))).toHaveLength(1);
    expect(ex.some((e) => e.includes("AYUMI"))).toBe(false);
  });
});
