import { describe, expect, it, vi } from "vitest";
import { responder, type Dependencias } from "@/lib/bot";
import { RespostaGrandeDemais, type Classificacao } from "@/lib/classificador";
import type { LinhaFluxo } from "@/lib/lancamentos";
import type { LinhaExistente } from "@/lib/planilha";
import { categorias, usuario } from "./fixtures";

function fakes(classificacao?: Classificacao, existentes: LinhaExistente[] = []) {
  const gravadas: LinhaFluxo[] = [];
  const deps: Dependencias = {
    buscarContexto: vi.fn(async () => ({ categorias, exemplos: [] })),
    classificar: vi.fn(async () => classificacao!),
    gravarNoFluxo: vi.fn(async (_u: unknown, linhas: LinhaFluxo[]) => {
      gravadas.push(...linhas);
      return { linhas: linhas.map((_, i) => 10 + i), extras: false };
    }),
    lerComprasNoCartao: vi.fn(async () => existentes),
    cadastrarConta: vi.fn(async () => {}),
    definirCartao: vi.fn(async (_u: unknown, nome: string) => nome),
    removerConta: vi.fn(async (_u: unknown, nome: string) => (nome.toLowerCase() === "inter" ? "Inter" : undefined)),
    registrarNoLog: vi.fn(async () => {}),
    desfazerUltimo: vi.fn(async () => 3),
    baixarMidia: vi.fn(async () => ({ base64: "AAAA", mime: "image/jpeg" })),
    agora: () => new Date("2026-10-10T15:00:00Z"),
  };
  return { deps, gravadas };
}

const texto = (t: string) => ({ id: "wamid.1", de: usuario.telefone, tipo: "texto" as const, texto: t });

describe("responder", () => {
  it("lança um gasto em texto e confirma", async () => {
    const { deps, gravadas } = fakes({
      resposta: "lancamentos",
      pergunta: "",
      lancamentos: [
        { data: "2026-10-10", despesa: "Lanches", descricao: "café", nome: "OXXO", pago_com: "Pix", banco: "Itaú", valor: 6.5, natureza: "saida", parcelas: 1 },
      ],
    });
    const r = await responder(texto("café 6,50 no oxxo"), usuario, deps);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].valor).toBe(-6.5);
    expect(r).toContain("R$ 6,50");
    expect(deps.registrarNoLog).toHaveBeenCalledWith(usuario, "wamid.1", { linhas: [10], extras: false }, expect.any(String));
  });

  it("devolve a pergunta da IA quando falta informação, sem gravar", async () => {
    const { deps, gravadas } = fakes({ resposta: "pergunta", pergunta: "Quanto foi o mercado?", lancamentos: [] });
    expect(await responder(texto("fui no mercado"), usuario, deps)).toBe("Quanto foi o mercado?");
    expect(gravadas).toHaveLength(0);
  });

  it("pede para dividir o arquivo quando a resposta da IA passa do limite", async () => {
    const { deps, gravadas } = fakes();
    deps.classificar = vi.fn(async () => {
      throw new RespostaGrandeDemais("grande");
    });
    expect(await responder(texto("extrato"), usuario, deps)).toContain("partes menores");
    expect(gravadas).toHaveLength(0);
  });

  describe("fatura do cartão", () => {
    const fatura: Classificacao = {
      resposta: "lancamentos",
      pergunta: "",
      lancamentos: [
        { data: "2026-10-05", despesa: "Lanches", descricao: "lanche", nome: "OXXO", pago_com: "Crédito", banco: "Nubank", valor: 30, natureza: "saida", parcelas: 1 },
        { data: "2026-10-06", despesa: "Lanches", descricao: "café", nome: "Padaria", pago_com: "Crédito", banco: "Nubank", valor: 12, natureza: "saida", parcelas: 1 },
      ],
    };
    const pdf = { id: "w3", de: usuario.telefone, tipo: "documento" as const, mediaId: "m2", mime: "application/pdf" };

    it("não lança de novo a compra que já foi mandada por foto", async () => {
      const ja = { data: "10/11/2026", banco: "Nubank", valor: -30 };
      const { deps, gravadas } = fakes(fatura, [ja]);
      const r = await responder(pdf, usuario, deps);
      expect(gravadas).toHaveLength(1);
      expect(gravadas[0].nome).toBe("Padaria");
      expect(r).toContain("Pulei 1 compra");
    });

    it("avisa quando todas já estavam na planilha, sem gravar", async () => {
      const { deps, gravadas } = fakes(fatura, [
        { data: "10/11/2026", banco: "Nubank", valor: -30 },
        { data: "10/11/2026", banco: "Nubank", valor: -12 },
      ]);
      expect(await responder(pdf, usuario, deps)).toContain("já estavam na sua planilha");
      expect(gravadas).toHaveLength(0);
    });

    it("texto digitado não passa pela checagem", async () => {
      const { deps, gravadas } = fakes(fatura, [{ data: "10/11/2026", banco: "Nubank", valor: -30 }]);
      await responder(texto("lanche 30 no nubank"), usuario, deps);
      expect(deps.lerComprasNoCartao).not.toHaveBeenCalled();
      expect(gravadas).toHaveLength(2);
    });
  });

  it("conta nova citada pela pessoa é cadastrada e avisada", async () => {
    const { deps, gravadas } = fakes({
      resposta: "lancamentos",
      pergunta: "",
      lancamentos: [
        { data: "2026-10-10", despesa: "Lanches", descricao: "lanche", nome: "OXXO", pago_com: "Crédito", banco: "Bradesco", valor: 20, natureza: "saida", parcelas: 1 },
        { data: "2026-10-10", despesa: "Lanches", descricao: "café", nome: "Padaria", pago_com: "Pix", banco: "itaú", valor: 5, natureza: "saida", parcelas: 1 },
      ],
    });
    const r = await responder(texto("lanche 20 no cartão bradesco e café 5 no itaú"), usuario, deps);
    expect(deps.cadastrarConta).toHaveBeenCalledTimes(1);
    expect(deps.cadastrarConta).toHaveBeenCalledWith(usuario, "Bradesco", "Cartão");
    expect(gravadas[0].data).toBe("10/10/2026");
    expect(r).toContain("Cadastrei o cartão *Bradesco*");
  });

  it("comando de cartão grava fechamento e vencimento sem chamar a IA", async () => {
    const { deps } = fakes();
    const r = await responder(texto("Bradesco fecha dia 5 e vence dia 12"), usuario, deps);
    expect(deps.definirCartao).toHaveBeenCalledWith(usuario, "Bradesco", 5, 12);
    expect(deps.classificar).not.toHaveBeenCalled();
    expect(r).toContain("fecha dia 5, vence dia 12");
  });

  describe("contas pela conversa", () => {
    it("lista contas e cartões", async () => {
      const { deps } = fakes();
      const r = await responder(texto("minhas contas"), usuario, deps);
      expect(r).toContain("• Itaú");
      expect(r).toContain("Nubank (fecha dia 3, vence dia 10)");
      expect(deps.classificar).not.toHaveBeenCalled();
    });

    it("cadastra conta nova e não repete uma que já existe", async () => {
      const { deps } = fakes();
      expect(await responder(texto("nova conta Bradesco"), usuario, deps)).toContain("Cadastrei a conta *Bradesco*");
      expect(deps.cadastrarConta).toHaveBeenCalledWith(usuario, "Bradesco", "Conta");
      expect(await responder(texto("nova conta itaú"), usuario, deps)).toContain("já está");
      expect(deps.cadastrarConta).toHaveBeenCalledTimes(1);
    });

    it("cadastra caixinha como investimento", async () => {
      const { deps } = fakes();
      await responder(texto("nova caixinha Nubank Turbo"), usuario, deps);
      expect(deps.cadastrarConta).toHaveBeenCalledWith(usuario, "Nubank Turbo", "Investimento");
    });

    it("novo cartão com fechamento e vencimento", async () => {
      const { deps } = fakes();
      await responder(texto("novo cartão Itaú Click fecha 2 vence 9"), usuario, deps);
      expect(deps.definirCartao).toHaveBeenCalledWith(usuario, "Itaú Click", 2, 9);
    });

    it("remove conta e avisa quando não acha", async () => {
      const { deps } = fakes();
      expect(await responder(texto("remover conta inter"), usuario, deps)).toContain("Tirei *Inter*");
      expect(deps.removerConta).toHaveBeenCalledWith(usuario, "inter", "Conta");
      expect(await responder(texto("apagar cartão XP"), usuario, deps)).toContain("Não achei *XP*");
    });
  });

  it("desfazer apaga o último envio sem chamar a IA", async () => {
    const { deps } = fakes();
    expect(await responder(texto("Desfazer"), usuario, deps)).toContain("3 linhas");
    expect(deps.classificar).not.toHaveBeenCalled();
  });

  it("foto é baixada e enviada para a IA", async () => {
    const { deps } = fakes({ resposta: "nao_financeiro", pergunta: "", lancamentos: [] });
    await responder({ id: "w2", de: usuario.telefone, tipo: "imagem", mediaId: "m1", mime: "image/jpeg" }, usuario, deps);
    expect(deps.baixarMidia).toHaveBeenCalledWith("m1");
    expect(deps.classificar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "imagem", mime: "image/jpeg" }),
      { categorias, exemplos: [] },
      usuario,
      "2026-10-10",
    );
  });

  it("categoria inventada pela IA vira pergunta, sem gravar", async () => {
    const { deps, gravadas } = fakes({
      resposta: "lancamentos",
      pergunta: "",
      lancamentos: [
        { data: "2026-10-10", despesa: "Cripto", descricao: "btc", nome: "Binance", pago_com: "Pix", banco: "Itaú", valor: 100, natureza: "saida", parcelas: 1 },
      ],
    });
    expect(await responder(texto("comprei 100 de btc"), usuario, deps)).toContain('categoria "Cripto"');
    expect(gravadas).toHaveLength(0);
  });

  it("áudio recebe aviso educado", async () => {
    const { deps } = fakes();
    expect(await responder({ id: "w3", de: usuario.telefone, tipo: "audio", mediaId: "m" }, usuario, deps)).toContain("áudio");
  });
});
