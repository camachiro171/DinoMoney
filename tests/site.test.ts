import { describe, expect, it } from "vitest";
import { encontrarUsuarioPorCodigo } from "@/lib/config";
import { criarSessao, lerSessao } from "@/lib/sessao";
import { mensagemDoSite } from "@/lib/web";
import { usuario } from "./fixtures";

describe("sessão do site", () => {
  const segredo = "segredo-de-teste";
  const agora = Date.UTC(2026, 9, 11);

  it("lê de volta o telefone de uma sessão válida", () => {
    expect(lerSessao(criarSessao("5511999998888", segredo, agora), segredo, agora + 1000)).toBe("5511999998888");
  });

  it("recusa sessão adulterada, com outro segredo ou vencida", () => {
    const token = criarSessao("5511999998888", segredo, agora);
    expect(lerSessao(token.replace("5511999998888", "5511000000000"), segredo, agora)).toBeNull();
    expect(lerSessao(token, "outro-segredo", agora)).toBeNull();
    expect(lerSessao(token, segredo, agora + 31 * 86_400_000)).toBeNull();
    expect(lerSessao(undefined, segredo, agora)).toBeNull();
    expect(lerSessao("lixo", segredo, agora)).toBeNull();
  });
});

describe("encontrarUsuarioPorCodigo", () => {
  const usuarios = [{ ...usuario, codigo: "dino-maria-2026" }, { ...usuario, nome: "Sem código" }];

  it("acha pelo código, ignorando espaços nas pontas", () => {
    expect(encontrarUsuarioPorCodigo(" dino-maria-2026 ", usuarios)?.nome).toBe(usuario.nome);
  });

  it("não acha código errado, curto ou vazio", () => {
    expect(encontrarUsuarioPorCodigo("dino-maria-2025", usuarios)).toBeUndefined();
    expect(encontrarUsuarioPorCodigo("", usuarios)).toBeUndefined();
    expect(encontrarUsuarioPorCodigo("curto", usuarios)).toBeUndefined();
  });
});

describe("mensagemDoSite", () => {
  it("texto puro vira mensagem de texto", () => {
    expect(mensagemDoSite("1", "55", "café 6 no pix").msg).toEqual({ id: "web:1", de: "55", tipo: "texto", texto: "café 6 no pix" });
  });

  it("foto vira imagem com o comentário como legenda, e o arquivo é entregue sem baixar nada", async () => {
    const { msg, baixarMidia } = mensagemDoSite("2", "55", "mercado", { nome: "c.jpg", mime: "image/jpeg", base64: "AAA" });
    expect(msg).toMatchObject({ tipo: "imagem", mime: "image/jpeg", legenda: "mercado" });
    expect(await baixarMidia()).toEqual({ base64: "AAA", mime: "image/jpeg" });
  });

  it("PDF vira documento", () => {
    const { msg } = mensagemDoSite("3", "55", "", { nome: "fatura.pdf", mime: "application/pdf", base64: "BBB" });
    expect(msg).toMatchObject({ tipo: "documento", mime: "application/pdf", arquivo: "fatura.pdf" });
    expect((msg as { legenda?: string }).legenda).toBeUndefined();
  });
});
