import { describe, expect, it } from "vitest";
import { mensagensDaConversa, montarSistemaConversa, retratoFinanceiro } from "@/lib/conversa";
import type { LinhaDoFluxo } from "@/lib/metas";
import { montarPainel } from "@/lib/painel";
import { categorias, usuario } from "./fixtures";

let n = 2;
const l = (data: string, valor: number, despesa: string, banco: string, pagoCom = "Pix", descricao = despesa): LinhaDoFluxo => ({
  linha: n++,
  data,
  valor,
  despesa,
  descricao,
  banco,
  pagoCom,
  tipo: valor > 0 ? "Renda Principal" : "Gastos Pessoais",
});

const HOJE = "2026-10-11";
const fluxo: LinhaDoFluxo[] = [
  l("2026-10-01", 3000, "Salário", "Itaú"),
  l("2026-10-02", -1000, "Transferencia entre contas", "Itaú", "Pix", "Saída Itaú > Cofrinho"),
  l("2026-10-02", 1000, "Transferencia entre contas", "Cofrinho Itaú", "Pix", "Entrada Itaú > Cofrinho"),
  l("2026-10-07", -230, "Supermercado", "Itaú", "Pix", "Mercado do bairro"),
  l("2026-10-20", -80, "Internet", "Itaú", "Previsão", "[previsto] Internet"),
];
const contas = { contas: ["Itaú", "Cofrinho Itaú"], cartoes: [], guardados: ["Cofrinho Itaú"] };

describe("retratoFinanceiro", () => {
  const painel = montarPainel(fluxo, contas, [{ despesa: "Supermercado", valor: 800 }], HOJE);
  const retrato = retratoFinanceiro(painel, fluxo, [{ despesa: "Supermercado", valor: 800 }], []);

  it("separa o saldo das contas da reserva de gastos e soma o disponível", () => {
    expect(retrato).toContain("Saldo nas contas: R$ 1.770,00");
    expect(retrato).toContain("Reserva de gastos");
    expect(retrato).toContain("R$ 1.000,00");
    expect(retrato).toContain("Dinheiro disponível hoje (contas + reserva): R$ 2.770,00");
  });

  it("traz gastos do mês, últimos lançamentos reais e deixa de fora os previstos", () => {
    expect(retrato).toContain("Supermercado: R$ 230,00");
    expect(retrato).toContain("meta R$ 800,00");
    expect(retrato).toContain("Mercado do bairro");
    expect(retrato).not.toContain("[previsto] Internet |");
  });
});

describe("mensagensDaConversa", () => {
  it("começa pela pessoa, alterna e junta falas seguidas", () => {
    const m = mensagensDaConversa(
      [
        { quem: "dino", texto: "Oi!" },
        { quem: "eu", texto: "oi" },
        { quem: "eu", texto: "tudo bem?" },
        { quem: "dino", texto: "Tudo!" },
      ],
      "quanto gastei?",
      HOJE,
    );
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m[0].content).toBe("oi\ntudo bem?");
    expect(m[2].content).toContain("quanto gastei?");
    expect(m[2].content).toContain(HOJE);
  });
});

describe("montarSistemaConversa", () => {
  it("leva o retrato, as categorias e os comandos que o Dino pode ensinar", () => {
    const s = montarSistemaConversa({ categorias, exemplos: [] }, usuario, "RETRATO-AQUI");
    expect(s).toContain("RETRATO-AQUI");
    expect(s).toContain("Supermercado");
    expect(s).toContain("limite Nubank 400");
    expect(s).toContain("NUNCA grava nada sozinho");
  });
});
