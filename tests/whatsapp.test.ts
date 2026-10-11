import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinaturaValida, extrairFalhas, extrairMensagens } from "@/lib/whatsapp";
import { encontrarUsuario, normalizarTelefone } from "@/lib/config";
import { usuario } from "./fixtures";

describe("assinatura da Meta", () => {
  const corpo = '{"a":1}';
  const assinatura = "sha256=" + crypto.createHmac("sha256", "segredo").update(corpo).digest("hex");
  it("aceita assinatura correta", () => expect(assinaturaValida(corpo, assinatura, "segredo")).toBe(true));
  it("recusa assinatura errada ou ausente", () => {
    expect(assinaturaValida(corpo, assinatura, "outro")).toBe(false);
    expect(assinaturaValida(corpo, null, "segredo")).toBe(false);
    expect(assinaturaValida(corpo, "sha256=abc", "segredo")).toBe(false);
  });
});

describe("extrairMensagens", () => {
  it("lê texto, imagem, PDF e áudio e ignora status", () => {
    const corpo = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "1", from: "5511999998888", type: "text", text: { body: "café 6" } },
                  { id: "2", from: "5511999998888", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "mercado" } },
                  { id: "3", from: "5511999998888", type: "document", document: { id: "m2", mime_type: "application/pdf" } },
                  { id: "4", from: "5511999998888", type: "audio", audio: { id: "m3" } },
                ],
              },
            },
            { value: { statuses: [{ id: "x", status: "read" }] } },
          ],
        },
      ],
    };
    expect(extrairMensagens(corpo).map((m) => m.tipo)).toEqual(["texto", "imagem", "documento", "audio"]);
  });
});

describe("telefone", () => {
  it("aceita número com ou sem o nono dígito", () => {
    expect(normalizarTelefone("551199998888")).toBe("5511999998888");
    expect(encontrarUsuario("551199998888", [usuario])?.nome).toBe("Maria");
    expect(encontrarUsuario("5521988887777", [usuario])).toBeUndefined();
  });
});

describe("extrairFalhas", () => {
  it("devolve só os status com falha, com o motivo", () => {
    const corpo = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.1", status: "sent", recipient_id: "5511999999999" },
                  {
                    id: "wamid.2",
                    status: "failed",
                    recipient_id: "551199999999",
                    errors: [{ code: 131030, title: "Recipient phone number not in allowed list", error_data: { details: "x" } }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(extrairFalhas(corpo)).toEqual([
      {
        para: "551199999999",
        mensagemId: "wamid.2",
        erros: [{ codigo: 131030, titulo: "Recipient phone number not in allowed list", detalhe: "x" }],
      },
    ]);
  });
});
