import { describe, expect, it } from "vitest";
import { dividirEmParcelas, paraLinhas, resumir, tirarRepetidas } from "@/lib/lancamentos";
import type { LancamentoClassificado } from "@/lib/classificador";
import { categorias, usuario } from "./fixtures";

const base: LancamentoClassificado = {
  data: "2026-10-10",
  despesa: "Padaria",
  descricao: "café",
  nome: "Padaria do Everton",
  pago_com: "Pix",
  banco: "Itaú",
  valor: 6,
  natureza: "saida",
  parcelas: 1,
};

describe("paraLinhas", () => {
  it("gasto à vista vira uma linha negativa na data da compra", () => {
    const [l] = paraLinhas(base, categorias, usuario, "2026-10-10");
    expect(l).toMatchObject({ data: "10/10/2026", despesa: "Padaria", valor: -6, banco: "Itaú", pagoCom: "Pix" });
  });

  it("renda é sempre positiva, mesmo se a IA errar a natureza", () => {
    const [l] = paraLinhas({ ...base, despesa: "Salário/Pró-labore", natureza: "saida", valor: 960 }, categorias, usuario, "2026-10-10");
    expect(l.valor).toBe(960);
  });

  it("compra no cartão em 3x vira 3 linhas nas datas de vencimento", () => {
    const linhas = paraLinhas(
      { ...base, despesa: "Supermercado", pago_com: "Crédito", banco: "Nubank", valor: 100, parcelas: 3, descricao: "mercado" },
      categorias,
      usuario,
      "2026-10-10",
    );
    expect(linhas.map((l) => [l.data, l.valor])).toEqual([
      ["10/11/2026", -33.34],
      ["10/12/2026", -33.33],
      ["10/01/2027", -33.33],
    ]);
    expect(linhas[0].descricao).toBe("mercado (1/3) - compra em 10/10/2026");
  });

  it("data inválida da IA cai para hoje e parcelas absurdas viram 1", () => {
    const linhas = paraLinhas({ ...base, data: "ontem", parcelas: 0 }, categorias, usuario, "2026-10-09");
    expect(linhas).toHaveLength(1);
    expect(linhas[0].data).toBe("09/10/2026");
  });

  it("aceita diferença de acento e maiúscula vinda da IA", () => {
    const [l] = paraLinhas({ ...base, despesa: "salario/pro-labore", pago_com: "pix", banco: "itau", valor: 10 }, categorias, usuario, "2026-10-10");
    expect(l).toMatchObject({ despesa: "Salário/Pró-labore", pagoCom: "Pix", banco: "Itaú", valor: 10 });
  });

  it("categoria fora da lista é erro", () => {
    expect(() => paraLinhas({ ...base, despesa: "Inventada" }, categorias, usuario, "2026-10-10")).toThrow();
  });
});

describe("dividirEmParcelas", () => {
  it("soma exatamente o total", () => {
    const p = dividirEmParcelas(2100, 7);
    expect(p).toEqual([300, 300, 300, 300, 300, 300, 300]);
    expect(dividirEmParcelas(10, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(10, 10);
  });
});

describe("resumir", () => {
  it("mensagem de um item cita valor, categoria e conta", () => {
    const l = [paraLinhas(base, categorias, usuario, "2026-10-10")];
    const texto = resumir([base], l);
    expect(texto).toContain("R$ 6,00");
    expect(texto).toContain("Alimentação › Padaria");
    expect(texto).toContain("desfazer");
  });
  it("extrato grande mostra só os 10 primeiros e os totais", () => {
    const itens = Array.from({ length: 15 }, () => base);
    const texto = resumir(itens, itens.map((i) => paraLinhas(i, categorias, usuario, "2026-10-10")));
    expect(texto).toContain("Lancei 15 itens (saídas R$ 90,00, entradas R$ 0,00)");
    expect(texto).toContain("e mais 5 itens");
  });
});

describe("tirarRepetidas", () => {
  const compra = { ...base, pago_com: "Crédito", banco: "Nubank", valor: 50, data: "2026-10-05" };
  const linhas = () => [paraLinhas(compra, categorias, usuario, "2026-10-10"), paraLinhas(base, categorias, usuario, "2026-10-10")];

  it("pula a compra no cartão que já está na planilha, mesmo com a data escrita de outro jeito", () => {
    const [cartao] = linhas()[0];
    const [d, m, a] = cartao.data.split("/");
    const r = tirarRepetidas(linhas(), [{ data: `${Number(d)}/${Number(m)}/${a}`, banco: "nubank", valor: -50 }]);
    expect(r.puladas).toHaveLength(1);
    expect(r.linhas[0]).toHaveLength(0);
    expect(r.linhas[1]).toHaveLength(1);
  });

  it("valor diferente ou outro cartão não conta como repetida", () => {
    const [cartao] = linhas()[0];
    const r = tirarRepetidas(linhas(), [
      { data: cartao.data, banco: "Nubank", valor: -49.9 },
      { data: cartao.data, banco: "Itaú", valor: -50 },
    ]);
    expect(r.puladas).toHaveLength(0);
  });

  it("cada linha da planilha cobre só uma compra igual", () => {
    const [cartao] = linhas()[0];
    const duas = [linhas()[0], linhas()[0]];
    const r = tirarRepetidas(duas, [{ data: cartao.data, banco: "Nubank", valor: -50 }]);
    expect(r.puladas).toHaveLength(1);
    expect(r.linhas.flat()).toHaveLength(1);
  });

  it("gasto fora do cartão nunca é pulado", () => {
    const [pix] = linhas()[1];
    const r = tirarRepetidas(linhas(), [{ data: pix.data, banco: "Itaú", valor: -6 }]);
    expect(r.puladas).toHaveLength(0);
  });
});
