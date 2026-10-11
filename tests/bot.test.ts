import { describe, expect, it, vi } from "vitest";
import { responder, type Dependencias } from "@/lib/bot";
import { RespostaGrandeDemais, type Classificacao } from "@/lib/classificador";
import type { LinhaFluxo } from "@/lib/lancamentos";
import { categorias, usuario } from "./fixtures";

function fakes(classificacao?: Classificacao) {
  const gravadas: LinhaFluxo[] = [];
  const deps: Dependencias = {
    buscarContexto: vi.fn(async () => ({ categorias, exemplos: [] })),
    classificar: vi.fn(async () => classificacao!),
    gravarNoFluxo: vi.fn(async (_u: unknown, linhas: LinhaFluxo[]) => {
      gravadas.push(...linhas);
      return { linhas: linhas.map((_, i) => 10 + i), extras: false };
    }),
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
