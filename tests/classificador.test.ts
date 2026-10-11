import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { montarSchema, montarSistema } from "@/lib/classificador";
import { categorias, usuario } from "./fixtures";

describe("classificador", () => {
  it("o schema lista as categorias da planilha e as contas e cartões", () => {
    const schema = montarSchema(categorias, usuario);
    const item = schema.shape.lancamentos.element;
    expect(item.shape.despesa.description).toContain("Padaria | Supermercado");
    expect(item.shape.banco.description).toContain("Itaú | Inter | Nubank");
    // O formato gerado para a API precisa ser um JSON Schema serializável
    expect(() => JSON.stringify(zodOutputFormat(schema))).not.toThrow();
  });
  it("o prompt traz categorias, contas e cartões", () => {
    const s = montarSistema(categorias, usuario);
    expect(s).toContain("Alimentação: Padaria | Supermercado");
    expect(s).toContain("Nubank (fecha dia 3, vence dia 10)");
  });
});
