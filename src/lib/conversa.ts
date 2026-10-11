import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { descreverCategorias } from "./categorias";
import { montarLancamento } from "./classificador";
import type { Usuario } from "./config";
import type { Investimento, LinhaDoFluxo, Meta } from "./metas";
import { ehPrevista, type Painel } from "./painel";
import type { ContextoPlanilha } from "./planilha";

/** Uma fala da conversa guardada na planilha. */
export interface Turno {
  quem: "eu" | "dino";
  texto: string;
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ULTIMOS_LANCAMENTOS = 30;

/**
 * Resumo dos números da pessoa em texto, para a IA responder sem inventar nada.
 * É o mesmo cálculo do painel do site, então a conversa e o painel nunca discordam.
 */
export function retratoFinanceiro(p: Painel, fluxo: LinhaDoFluxo[], metas: Meta[], investimentos?: Investimento[]): string {
  const contas = p.saldos.filter((s) => !s.guardado);
  const reserva = p.saldos.filter((s) => s.guardado);
  const linhas: string[] = [`Hoje é ${p.hoje}.`];

  linhas.push(
    `Saldo nas contas: ${reais(contas.reduce((t, s) => t + s.valor, 0))}${contas.length ? ` (${contas.map((s) => `${s.conta} ${reais(s.valor)}`).join("; ")})` : ""}.`,
  );
  linhas.push(
    reserva.length
      ? `Reserva de gastos (cofrinhos e caixinhas, rendendo, resgate na hora): ${reais(reserva.reduce((t, s) => t + s.valor, 0))} (${reserva.map((s) => `${s.conta} ${reais(s.valor)}`).join("; ")}).`
      : "Reserva de gastos (cofrinhos e caixinhas): nenhuma cadastrada.",
  );
  linhas.push(`Dinheiro disponível hoje (contas + reserva): ${reais(p.saldoHoje)}.`);

  const longoPrazo = (investimentos ?? []).filter((i) => !/cofrinho|caixinha/i.test(i.tipo) && !p.saldos.some((s) => s.conta.toLowerCase() === i.nome.toLowerCase()));
  linhas.push(
    longoPrazo.length ? `Investimentos de longo prazo: ${longoPrazo.map((i) => `${i.nome} ${reais(i.valor)}`).join("; ")}.` : "Investimentos de longo prazo: nenhum.",
  );

  if (p.cartoes.length) {
    linhas.push("Cartões:");
    for (const c of p.cartoes) {
      const fatura = c.proxima ? `próxima fatura ${dia(c.proxima.data)} de ${reais(c.proxima.restante)}${c.antecipado > 0 ? ` (já pagou ${reais(c.antecipado)} antecipado)` : ""}` : "sem fatura a vencer";
      const limite = c.limite ? `limite ${reais(c.limite)}, usado ${reais(c.emAberto)}, livre ${reais(c.disponivel ?? 0)}` : "limite não informado";
      linhas.push(`- ${c.nome}: ${fatura}; ${limite}.`);
    }
  }

  if (p.aPagar.length) {
    linhas.push(`Contas a pagar nos próximos 7 dias e atrasadas (total ${reais(p.totalAPagar)}):`);
    for (const c of p.aPagar) linhas.push(`- ${dia(c.data)} ${c.descricao} (${c.banco}) ${reais(c.valor)}${c.atrasada ? " ATRASADA" : ""}`);
  } else {
    linhas.push("Contas a pagar nos próximos 7 dias: nenhuma.");
  }

  if (p.alerta) {
    linhas.push(
      `ALERTA: no ritmo previsto o saldo fica negativo${p.alerta.negativoEm ? ` em ${dia(p.alerta.negativoEm)}` : ""}; menor saldo ${reais(p.alerta.menor.valor)} em ${dia(p.alerta.menor.data)}.`,
    );
  } else {
    linhas.push("O saldo previsto não fica negativo no período do painel.");
  }

  if (p.dividas.length) linhas.push(`Dívidas (${reais(p.totalDividas)}): ${p.dividas.map((d) => `${d.nome} ${reais(d.valor)}`).join("; ")}.`);
  if (p.parcelamentos.length) {
    linhas.push(`Parcelamentos (${reais(p.totalParcelamentos)}): ${p.parcelamentos.map((d) => `${d.nome} ${reais(d.valor)} em ${d.parcelas} parcelas`).join("; ")}.`);
  }

  const g = p.gastos;
  linhas.push(`Gastos por categoria em ${g.mes} (total ${reais(g.totalAtual)}; mês anterior ${g.mesAnterior}: ${reais(g.totalAnterior)}):`);
  for (const i of g.itens.slice(0, 15)) {
    const variacao = i.variacao === undefined ? "" : ` (${i.variacao >= 0 ? "+" : "-"}${Math.abs(Math.round(i.variacao * 100))}% vs mês anterior)`;
    linhas.push(`- ${i.despesa}: ${reais(i.atual)}${variacao}${i.meta ? `, meta ${reais(i.meta)}` : ""}`);
  }
  const comMeta = metas.filter((m) => !g.itens.some((i) => i.despesa === m.despesa));
  if (comMeta.length) linhas.push(`Metas sem gasto no mês: ${comMeta.map((m) => `${m.despesa} ${reais(m.valor)}`).join("; ")}.`);

  const recentes = fluxo
    .filter((l) => !ehPrevista(l) && l.data <= p.hoje)
    .sort((a, b) => b.data.localeCompare(a.data) || b.linha - a.linha)
    .slice(0, ULTIMOS_LANCAMENTOS);
  linhas.push(`Últimos ${recentes.length} lançamentos (mais novos primeiro):`);
  for (const l of recentes) linhas.push(`- ${dia(l.data)} ${l.despesa} | ${l.descricao} | ${l.banco ?? ""} ${l.pagoCom ?? ""} | ${reais(l.valor)}`);
  return linhas.join("\n");
}

export function montarSistemaConversa({ categorias, exemplos }: ContextoPlanilha, usuario: Usuario, retrato: string): string {
  const cartoes = usuario.cartoes.length ? usuario.cartoes.map((c) => c.nome).join(", ") : "nenhum cadastrado";
  return `Você é o DinoMoney 🦖, o assistente financeiro de ${usuario.nome}, criado pela Fôlego. Você conversa com ${usuario.nome} pelo site ou pelo WhatsApp, em português do Brasil, de forma simples, amigável e curta (poucas linhas, sem tabelas). ${usuario.nome} pode ser leigo em finanças: explique sem jargão.

Você é também um educador financeiro. Incentive o hábito de deixar o dinheiro rendendo em cofrinho ou caixinha e usar só o necessário (a "reserva de gastos"), sem dar sermão.

O que você sabe sobre ${usuario.nome} agora (use SOMENTE estes números; se a resposta não estiver aqui, diga que não consegue ver isso, nunca invente):
${retrato}

Contas: ${usuario.contas.join(", ") || "nenhuma cadastrada"}. Cartões: ${cartoes}.

Categorias (Grupo > Tipo > Despesa) para quando for propor um lançamento. Use no campo "despesa" exatamente um dos itens:
${descreverCategorias(categorias)}

${exemplos.length ? `Como ${usuario.nome} costuma classificar (estabelecimento → despesa):\n${exemplos.join("\n")}\n\n` : ""}Regras:
- Responda a pergunta que foi feita. Se ela depender de uma conta, mostre a conta em uma linha.
- Você NUNCA grava nada sozinho. Se a pessoa relatou um gasto ou recebimento que ainda não está nos últimos lançamentos, preencha "lancamentos" com ele e, em "resposta", descreva o que vai lançar (valor, descrição, conta ou cartão, categoria) SEM pedir confirmação: o sistema pergunta "sim ou não" logo depois. Se a pessoa só comentou algo que já está nos lançamentos, não proponha de novo.
- Se faltar algo essencial para lançar (valor, qual conta ou cartão), pergunte em "resposta" e deixe "lancamentos" vazio.
- Se já houver uma proposta pendente na conversa e a pessoa corrigir algum detalhe, devolva a proposta inteira corrigida em "lancamentos".
- Para mexer em contas, cartões, limites, metas ou conferir saldo, existem comandos de uma linha: *limite Nubank 400*, *saldo Nubank 780,73*, *meta mercado 800*, *nova conta Inter*, *novo cartão Nubank fecha 3 vence 10*, *desfazer*, *previsão*, *metas*. Ensine o comando certo em vez de dizer que não dá.
- Valor sempre positivo em "valor"; "natureza" diz se saiu ou entrou. Compra no cartão de crédito: pago_com "Crédito", banco = nome do cartão. Sem data, use a de hoje; sem conta, pergunte se houver mais de uma.
- Você não decide investimentos nem dá recomendação de produto financeiro; ajude a pessoa a enxergar os próprios números.`;
}

export const SchemaConversa = (categorias: ContextoPlanilha["categorias"], usuario: Usuario) =>
  z.object({
    resposta: z.string().describe("O que dizer para a pessoa, em português simples e curto"),
    lancamentos: z.array(montarLancamento(categorias, usuario)).describe("Lançamentos a propor (só grava depois do sim); vazio se não houver"),
  });
export type RespostaDaConversa = z.infer<ReturnType<typeof SchemaConversa>>;

let clienteCache: Anthropic | undefined;
function cliente(): Anthropic {
  clienteCache ??= new Anthropic();
  return clienteCache;
}

/** A API quer a conversa começando pela pessoa e alternando; junta falas seguidas de quem fala igual. */
export function mensagensDaConversa(historico: Turno[], texto: string, hoje: string): Anthropic.MessageParam[] {
  const mensagens: Anthropic.MessageParam[] = [];
  const juntar = (role: "user" | "assistant", conteudo: string) => {
    const ultima = mensagens.at(-1);
    if (ultima && ultima.role === role) ultima.content = `${ultima.content}\n${conteudo}`;
    else mensagens.push({ role, content: conteudo });
  };
  for (const t of historico) {
    if (mensagens.length === 0 && t.quem === "dino") continue;
    juntar(t.quem === "eu" ? "user" : "assistant", t.texto);
  }
  juntar("user", `(Hoje é ${hoje}.)\n${texto}`);
  return mensagens;
}

export async function conversar(
  texto: string,
  historico: Turno[],
  contexto: ContextoPlanilha,
  usuario: Usuario,
  hoje: string,
  retrato: string,
): Promise<RespostaDaConversa> {
  const stream = cliente().messages.stream({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(SchemaConversa(contexto.categorias, usuario)) },
    system: montarSistemaConversa(contexto, usuario, retrato),
    messages: mensagensDaConversa(historico, texto, hoje),
  });
  const resposta = await stream.finalMessage();
  if (resposta.stop_reason === "refusal") return { resposta: "Não consegui responder isso. Pode perguntar de outro jeito?", lancamentos: [] };
  if (!resposta.parsed_output) throw new Error(`Resposta da conversa sem conteúdo válido (stop_reason=${resposta.stop_reason})`);
  return resposta.parsed_output;
}
