import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Usuario } from "./config";
import { descreverCategorias, type Categoria } from "./categorias";
import type { ContextoPlanilha } from "./planilha";

export const FORMAS_PAGAMENTO = [
  "Pix",
  "Débito",
  "Crédito",
  "Dinheiro",
  "Boleto",
  "Débito automático",
  "Transferência",
  "Rendimento",
] as const;

/** O que chegou pelo WhatsApp, já baixado. */
export type Entrada =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; base64: string; mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; legenda?: string }
  | { tipo: "pdf"; base64: string; legenda?: string };

export function montarSchema(categorias: Categoria[], usuario: Usuario) {
  // O formato estruturado da API não força listas fechadas, então as opções vão na descrição
  // e conferimos a resposta depois (ver paraLinhas).
  const despesas = categorias.map((c) => c.despesa);
  const origens = [...usuario.contas, ...usuario.cartoes.map((c) => c.nome)];
  const Lancamento = z.object({
    data: z.string().describe("Data da compra ou do pagamento, no formato AAAA-MM-DD"),
    despesa: z.string().describe(`Item exato da lista de categorias: ${despesas.join(" | ")}`),
    descricao: z.string().describe("O que foi, em poucas palavras"),
    nome: z.string().describe("Estabelecimento ou pessoa (quem recebeu ou quem pagou)"),
    pago_com: z.string().describe(`Uma destas: ${FORMAS_PAGAMENTO.join(" | ")}`),
    banco: z.string().describe(`Conta ou cartão usado: ${origens.join(" | ")}, ou o nome de uma conta nova que a pessoa citou`),
    valor: z.number().describe("Valor total, sempre positivo, em reais"),
    natureza: z.string().describe('"saida" ou "entrada"'),
    parcelas: z.number().describe("Número de parcelas; 1 se à vista"),
    recorrente_dia: z
      .number()
      .optional()
      .describe("Dia do mês em que se repete, se a pessoa disse que é todo mês (aluguel, salário, assinatura); 0 ou vazio se não"),
  });
  return z.object({
    resposta: z.string().describe('"lancamentos", "pergunta" ou "nao_financeiro"'),
    pergunta: z.string().describe("Pergunta curta para a pessoa quando faltar algo essencial; vazio se não houver"),
    lancamentos: z.array(Lancamento),
  });
}

export type Classificacao = z.infer<ReturnType<typeof montarSchema>>;
export type LancamentoClassificado = Classificacao["lancamentos"][number];

export function montarSistema({ categorias, exemplos }: ContextoPlanilha, usuario: Usuario): string {
  const cartoes = usuario.cartoes.length
    ? usuario.cartoes.map((c) => `${c.nome} (fecha dia ${c.fechamento}, vence dia ${c.vencimento})`).join("; ")
    : "nenhum cadastrado";
  return `Você é o DinoMoney, assistente que lança gastos e receitas no fluxo de caixa pessoal de ${usuario.nome}.
A pessoa manda pelo WhatsApp um texto, uma foto de cupom ou comprovante, um print do app do banco ou o PDF de um extrato ou fatura.
Sua tarefa é extrair cada lançamento e classificá-lo numa das categorias abaixo.

Categorias (Grupo > Tipo > Despesa). Use no campo "despesa" exatamente um dos itens:
${descreverCategorias(categorias)}

${exemplos.length ? `Como ${usuario.nome} costuma classificar (estabelecimento → despesa). Siga esse padrão quando o estabelecimento ou o tipo de gasto se repetir:\n${exemplos.join("\n")}\n\n` : ""}Contas de ${usuario.nome}: ${usuario.contas.join(", ") || "nenhuma cadastrada"}.
Cartões de crédito: ${cartoes}.

Regras:
- Um extrato ou fatura pode ter muitos lançamentos: devolva todos, um por linha, e ignore saldos, totais e o próprio pagamento da fatura.
- "valor" é sempre positivo; "natureza" diz se o dinheiro saiu ou entrou. Estornos e devoluções são "entrada" na mesma categoria do gasto original.
- Transferência entre contas da própria pessoa, aplicação em cofrinho ou investimento e resgate não são gasto nem renda: use a categoria de transferência entre contas se existir; se não existir, pergunte. Quando as duas contas forem conhecidas, devolva dois lançamentos: a saída na conta de origem e a entrada na conta de destino, com o mesmo valor.
- Rendimento de caixinha, cofrinho, poupança ou CDB (extrato ou print do app mostrando "rendimento", "rendeu", "juros"): natureza "entrada", pago_com "Rendimento", banco = onde o dinheiro está, despesa de renda passiva (rendimento/juros).
- Compra no cartão de crédito: pago_com "Crédito" e banco = nome do cartão. Se a pessoa disser "em 3x", parcelas = 3, com valor = total da compra.
- Descrições de extrato como "PAY PANIF", "PIX QRS UBER" ou "PAY OXXO": deduza o estabelecimento (panificadora, Uber, OXXO) e use-o em "nome".
- Se a pessoa citar um banco, conta ou cartão que não está na lista, use em "banco" o nome que ela disse (ele será cadastrado). Não troque por outra conta da lista.
- Sem data informada, use a data de hoje. Sem conta informada, use a primeira conta da lista. Sem forma de pagamento, use Pix.
- Se faltar o valor, ou se não der para saber se foi gasto ou recebimento, responda "pergunta" com uma pergunta curta e lancamentos vazio.
- Se a mensagem não tiver nada de financeiro (um "oi", por exemplo), responda "nao_financeiro".
- Conta que se repete todo mês ("aluguel 2.357 todo dia 7", "salário cai dia 5", "Netflix todo mês"): preencha recorrente_dia com o dia. Em "data", use a data em que aconteceu; se a pessoa só está avisando de uma conta fixa que ainda vai vencer, use a próxima data de vencimento.
- Na dúvida entre categorias parecidas, escolha a mais específica.`;
}

let clienteCache: Anthropic | undefined;
function cliente(): Anthropic {
  clienteCache ??= new Anthropic();
  return clienteCache;
}

export class RecusaDaIA extends Error {}
export class RespostaGrandeDemais extends Error {}

export async function classificar(
  entrada: Entrada,
  contexto: ContextoPlanilha,
  usuario: Usuario,
  hoje: string,
): Promise<Classificacao> {
  const conteudo: Anthropic.ContentBlockParam[] = [];
  let texto: string;
  if (entrada.tipo === "texto") {
    texto = entrada.texto;
  } else if (entrada.tipo === "imagem") {
    conteudo.push({ type: "image", source: { type: "base64", media_type: entrada.mime, data: entrada.base64 } });
    texto = entrada.legenda || "(imagem enviada sem legenda)";
  } else {
    conteudo.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: entrada.base64 } });
    texto = entrada.legenda || "(PDF enviado sem legenda)";
  }
  conteudo.push({ type: "text", text: `Hoje é ${hoje}.\nMensagem: ${texto}` });

  // Extratos longos geram respostas grandes: o streaming permite um limite de saída alto sem estourar o tempo da requisição.
  const stream = cliente().messages.stream({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 64000,
    // Classificar é uma tarefa simples; esforço baixo deixa a resposta mais rápida.
    output_config: { effort: "low", format: zodOutputFormat(montarSchema(contexto.categorias, usuario)) },
    cache_control: { type: "ephemeral" },
    system: montarSistema(contexto, usuario),
    messages: [{ role: "user", content: conteudo }],
  });

  let resposta;
  try {
    resposta = await stream.finalMessage();
  } catch (erro) {
    // Resposta cortada no limite chega como JSON incompleto e falha na leitura.
    if (stream.currentMessage?.stop_reason === "max_tokens") throw new RespostaGrandeDemais("Resposta da IA passou do limite de tamanho");
    throw erro;
  }

  if (resposta.stop_reason === "refusal") throw new RecusaDaIA("A IA recusou a mensagem");
  if (resposta.stop_reason === "max_tokens") throw new RespostaGrandeDemais("Resposta da IA passou do limite de tamanho");
  if (!resposta.parsed_output) throw new Error(`Resposta da IA sem conteúdo válido (stop_reason=${resposta.stop_reason})`);
  return resposta.parsed_output;
}
