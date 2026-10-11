import { describe, expect, it, vi } from "vitest";
import { responder, type Dependencias } from "@/lib/bot";
import { RespostaGrandeDemais, type Classificacao } from "@/lib/classificador";
import type { LinhaFluxo } from "@/lib/lancamentos";
import type { LinhaExistente } from "@/lib/planilha";
import type { LinhaDoFluxo, Meta } from "@/lib/metas";
import { categorias, usuario } from "./fixtures";

function fakes(classificacao?: Classificacao, existentes: LinhaExistente[] = [], extras: { fluxo?: LinhaDoFluxo[]; metas?: Meta[] } = {}) {
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
    definirLimite: vi.fn(async (_u: unknown, nome: string) => (nome.toLowerCase().includes("nubank") ? "Nubank Cartão" : undefined)),
    lerMetas: vi.fn(async () => extras.metas ?? []),
    definirMeta: vi.fn(async () => true),
    lerFluxo: vi.fn(async () => extras.fluxo ?? []),
    cadastrarRecorrente: vi.fn(async () => {}),
    lerRecorrentes: vi.fn(async () => []),
    removerRecorrente: vi.fn(async () => undefined),
    substituirPrevisto: vi.fn(async () => {}),
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

  it("comando de limite grava o limite do cartão sem chamar a IA", async () => {
    const { deps } = fakes();
    const r = await responder(texto("limite do cartão nubank de R$ 5.000,00"), usuario, deps);
    expect(deps.definirLimite).toHaveBeenCalledWith(usuario, "nubank", 5000);
    expect(deps.classificar).not.toHaveBeenCalled();
    expect(r).toContain("Limite do *Nubank Cartão*");
    const nao = await responder(texto("limite Inter 2000"), usuario, deps);
    expect(nao).toContain("Não achei o cartão");
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

  describe("metas, recorrentes e previsão", () => {
    const gasto = (valor: number, extra: Partial<Classificacao["lancamentos"][number]> = {}): Classificacao => ({
      resposta: "lancamentos",
      pergunta: "",
      lancamentos: [
        { data: "2026-10-10", despesa: "Supermercado", descricao: "compras", nome: "Extra", pago_com: "Pix", banco: "Itaú", valor, natureza: "saida", parcelas: 1, ...extra },
      ],
    });

    it("define meta achando a categoria por parte do nome", async () => {
      const { deps } = fakes();
      const r = await responder(texto("meta mercado 800"), usuario, deps);
      expect(deps.definirMeta).toHaveBeenCalledWith(usuario, "Supermercado", 800);
      expect(r).toContain("R$ 800,00 por mês");
    });

    it("avisa como está a meta depois de um gasto", async () => {
      const fluxo = [{ linha: 5, data: "2026-10-02", despesa: "Supermercado", descricao: "feira", valor: -600 }];
      const { deps } = fakes(gasto(100), [], { fluxo, metas: [{ despesa: "Supermercado", valor: 800 }] });
      const r = await responder(texto("mercado 100"), usuario, deps);
      expect(r).toContain("🎯 Supermercado: R$ 600,00 de R$ 800,00");
    });

    it("conta recorrente vira previstos nos próximos meses", async () => {
      const { deps, gravadas } = fakes(gasto(2357, { despesa: "Internet", descricao: "aluguel", recorrente_dia: 7, data: "2026-10-07" }));
      const r = await responder(texto("aluguel 2357 todo dia 7"), usuario, deps);
      expect(gravadas.map((g) => g.data)).toEqual(["07/10/2026", "07/11/2026", "07/12/2026", "07/01/2027"]);
      expect(gravadas[0].descricao).toBe("aluguel");
      expect(gravadas[1].descricao).toBe("[previsto] aluguel");
      expect(deps.cadastrarRecorrente).toHaveBeenCalledTimes(1);
      expect(r).toContain("conta fixa todo dia 7");
    });

    it("lançamento real substitui o previsto do mesmo mês", async () => {
      const fluxo = [{ linha: 40, data: "2026-10-07", despesa: "Supermercado", descricao: "[previsto] compras", valor: -500 }];
      const { deps, gravadas } = fakes(gasto(480), [], { fluxo });
      const r = await responder(texto("mercado 480"), usuario, deps);
      expect(deps.substituirPrevisto).toHaveBeenCalledWith(usuario, 40, expect.objectContaining({ valor: -480 }));
      expect(gravadas).toHaveLength(0);
      expect(r).toContain("substituiu o previsto");
    });

    it("previsão soma o que ainda entra e sai", async () => {
      const fluxo = [
        { linha: 2, data: "2026-10-01", despesa: "SI", descricao: "saldo", valor: 1000 },
        { linha: 3, data: "2026-10-20", despesa: "Internet", descricao: "[previsto] net", valor: -100 },
        { linha: 4, data: "2026-11-05", despesa: "Salário/Pró-labore", descricao: "[previsto] salário", valor: 3000 },
      ];
      const { deps } = fakes(undefined, [], { fluxo });
      const r = await responder(texto("previsão"), usuario, deps);
      expect(r).toContain("Saldo hoje: *R$ 1.000,00*");
      expect(r).toContain("out/26 (resto do mês)*: entra R$ 0,00, sai R$ 100,00 → saldo R$ 900,00");
      expect(r).toContain("nov/26*: entra R$ 3.000,00, sai R$ 0,00 → saldo R$ 3.900,00");
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
