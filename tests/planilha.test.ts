import { describe, expect, it } from "vitest";
import { proximaLinhaVazia } from "@/lib/planilha";

describe("proximaLinhaVazia", () => {
  it("pula linhas com data ou despesa e acha a primeira livre", () => {
    const colA = [["DATA"], ["01/01/2026"], [""], ["03/01/2026"]];
    const colC = [["DESPESA"], ["SI"], ["Salário/Pró-labore"], [""]];
    expect(proximaLinhaVazia(colA, colC)).toBe(5);
  });
  it("acha buraco no meio", () => {
    const colA = [["DATA"], ["01/01/2026"], [""], ["03/01/2026"]];
    const colC = [["DESPESA"], ["SI"], [""], ["Padaria"]];
    expect(proximaLinhaVazia(colA, colC)).toBe(3);
  });
  it("respeita o ponto de partida para gravar várias linhas", () => {
    const colA = [["DATA"], ["x"]];
    expect(proximaLinhaVazia(colA, [], 4)).toBe(4);
  });
});
