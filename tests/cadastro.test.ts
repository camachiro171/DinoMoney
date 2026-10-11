import { describe, expect, it } from "vitest";
import { idDaPlanilha, lerMentorados, lerMinhasContas } from "@/lib/cadastro";

describe("lerMentorados", () => {
  it("lê as linhas da planilha central, aceitando link ou ID e pulando inativos", () => {
    const usuarios = lerMentorados([
      ["Maria", "(11) 99999-8888", "codigo-maria-1", "https://docs.google.com/spreadsheets/d/abc123XYZ_-def/edit#gid=0", "Sim"],
      ["João", "5511988887777", "codigo-joao-1", "outraPlanilhaId123", "Não"],
      ["", "", "", "", ""],
      ["Ana", "", "curto", "planilhaDaAna1234", ""],
    ]);
    expect(usuarios.map((u) => u.nome)).toEqual(["Maria", "Ana"]);
    expect(usuarios[0]).toMatchObject({ telefone: "5511999998888", codigo: "codigo-maria-1", planilhaId: "abc123XYZ_-def" });
    expect(usuarios[1].codigo).toBeUndefined();
  });

  it("idDaPlanilha devolve o próprio valor quando já é um ID", () => {
    expect(idDaPlanilha(" abc123 ")).toBe("abc123");
  });
});

describe("lerMinhasContas", () => {
  it("separa contas e cartões; cartão sem os dias da fatura fica como conta", () => {
    expect(
      lerMinhasContas([
        ["Itaú", "Conta"],
        ["Nubank", "Cartão", "8", "15"],
        ["Caixinha", "Investimento"],
        ["Bradesco", "cartao", "", ""],
        ["", "Conta"],
      ]),
    ).toEqual({
      contas: ["Itaú", "Caixinha", "Bradesco"],
      cartoes: [{ nome: "Nubank", fechamento: 8, vencimento: 15 }],
    });
  });
});
