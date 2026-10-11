import { describe, expect, it } from "vitest";
import { dataDaParcelaMensal, dataValida, hojeEmSaoPaulo, paraPlanilha, vencimentoDaParcela } from "@/lib/datas";

const nubank = { nome: "Nubank", fechamento: 3, vencimento: 10 };

describe("vencimentoDaParcela", () => {
  it("compra antes do fechamento cai na fatura do mês", () => {
    expect(vencimentoDaParcela("2026-10-02", nubank)).toBe("2026-10-10");
  });
  it("compra no dia do fechamento ou depois vai para a fatura seguinte", () => {
    expect(vencimentoDaParcela("2026-10-03", nubank)).toBe("2026-11-10");
    expect(vencimentoDaParcela("2026-10-20", nubank)).toBe("2026-11-10");
  });
  it("vencimento menor que o fechamento cai no mês seguinte ao fechamento", () => {
    const cartao = { nome: "Itaú", fechamento: 25, vencimento: 5 };
    expect(vencimentoDaParcela("2026-10-10", cartao)).toBe("2026-11-05");
    expect(vencimentoDaParcela("2026-10-26", cartao)).toBe("2026-12-05");
  });
  it("parcelas vencem nos meses seguintes, virando o ano", () => {
    expect(vencimentoDaParcela("2026-11-20", nubank, 1)).toBe("2026-12-10");
    expect(vencimentoDaParcela("2026-11-20", nubank, 3)).toBe("2027-02-10");
  });
  it("vencimento dia 31 em mês curto cai no último dia", () => {
    expect(vencimentoDaParcela("2027-01-05", { nome: "X", fechamento: 20, vencimento: 31 })).toBe("2027-01-31");
    expect(vencimentoDaParcela("2027-01-25", { nome: "X", fechamento: 20, vencimento: 31 })).toBe("2027-02-28");
  });
});

describe("outras datas", () => {
  it("parcela mensal fora do cartão", () => {
    expect(dataDaParcelaMensal("2026-09-15", 7)).toBe("2027-03-15");
  });
  it("formato da planilha e validação", () => {
    expect(paraPlanilha("2026-07-06")).toBe("06/07/2026");
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("2026-02-28")).toBe(true);
  });
  it("hoje usa o fuso de São Paulo", () => {
    // 01:30 UTC do dia 11 ainda é dia 10 em São Paulo
    expect(hojeEmSaoPaulo(new Date("2026-10-11T01:30:00Z"))).toBe("2026-10-10");
  });
});
