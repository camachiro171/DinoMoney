import { describe, expect, it } from "vitest";
import { encontrarUsuarioTelegram } from "@/lib/config";
import { extrairMensagemTelegram, mimePeloCaminho } from "@/lib/telegram";
import { usuario } from "./fixtures";

const update = (message: object) => ({ update_id: 1, message: { message_id: 7, chat: { id: 4242 }, ...message } });

describe("extrairMensagemTelegram", () => {
  it("lê texto", () => {
    expect(extrairMensagemTelegram(update({ text: "café 6 no pix" }))).toEqual({
      id: "tg:4242:7",
      de: "4242",
      tipo: "texto",
      texto: "café 6 no pix",
    });
  });

  it("pega a maior versão da foto, com a legenda", () => {
    const msg = extrairMensagemTelegram(update({ photo: [{ file_id: "pequena" }, { file_id: "grande" }], caption: "mercado" }));
    expect(msg).toMatchObject({ tipo: "imagem", mediaId: "grande", mime: "image/jpeg", legenda: "mercado" });
  });

  it("lê PDF enviado como arquivo", () => {
    const msg = extrairMensagemTelegram(update({ document: { file_id: "f1", mime_type: "application/pdf", file_name: "fatura.pdf" } }));
    expect(msg).toMatchObject({ tipo: "documento", mediaId: "f1", mime: "application/pdf", arquivo: "fatura.pdf" });
  });

  it("áudio vira tipo audio e update sem mensagem é ignorado", () => {
    expect(extrairMensagemTelegram(update({ voice: { file_id: "v1" } }))).toMatchObject({ tipo: "audio", mediaId: "v1" });
    expect(extrairMensagemTelegram({ update_id: 2, edited_message: {} })).toBeNull();
  });
});

describe("mimePeloCaminho", () => {
  it("descobre o tipo pela extensão", () => {
    expect(mimePeloCaminho("photos/file_1.jpg")).toBe("image/jpeg");
    expect(mimePeloCaminho("documents/fatura.PDF")).toBe("application/pdf");
    expect(mimePeloCaminho("x/sem-extensao")).toBe("application/octet-stream");
  });
});

describe("encontrarUsuarioTelegram", () => {
  it("acha pelo código do chat", () => {
    const usuarios = [{ ...usuario, telegram: "4242" }];
    expect(encontrarUsuarioTelegram("4242", usuarios)?.nome).toBe(usuario.nome);
    expect(encontrarUsuarioTelegram("999", usuarios)).toBeUndefined();
  });
});
