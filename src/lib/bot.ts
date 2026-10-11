import type { TipoConta } from "./cadastro";
import { acharDespesa, gastosDoMes, type LinhaDoFluxo, type Meta } from "./metas";
import { acharPrevisto, ehPrevisto, marcarPrevisto, MESES_PROJETADOS, projetar, resumirPrevisao, type Recorrente } from "./previsao";
import { ehRenda } from "./categorias";
import type { Usuario } from "./config";
import type { ContextoPlanilha, Gravacao, LinhaExistente } from "./planilha";
import { RecusaDaIA, RespostaGrandeDemais, type Classificacao, type Entrada } from "./classificador";
import { hojeEmSaoPaulo, paraPlanilha } from "./datas";
import { saldosPorConta } from "./painel";
import { CategoriaDesconhecida, paraLinhas, resumir, tirarRepetidas, type LinhaFluxo } from "./lancamentos";
import type { MensagemRecebida } from "./whatsapp";

/** Tudo que o bot precisa do mundo lá fora; nos testes trocamos por versões falsas. */
export interface Dependencias {
  buscarContexto(u: Usuario): Promise<ContextoPlanilha>;
  classificar(e: Entrada, c: ContextoPlanilha, u: Usuario, hoje: string): Promise<Classificacao>;
  gravarNoFluxo(u: Usuario, linhas: LinhaFluxo[]): Promise<Gravacao>;
  lerComprasNoCartao(u: Usuario): Promise<LinhaExistente[]>;
  cadastrarConta(u: Usuario, nome: string, tipo: TipoConta): Promise<void>;
  definirCartao(u: Usuario, nome: string, fechamento: number, vencimento: number): Promise<string>;
  removerConta(u: Usuario, nome: string, tipo?: TipoConta): Promise<string | undefined>;
  definirLimite(u: Usuario, nome: string, limite: number): Promise<string | undefined>;
  lerMetas(u: Usuario): Promise<Meta[]>;
  definirMeta(u: Usuario, despesa: string, valor: number): Promise<boolean>;
  lerFluxo(u: Usuario): Promise<LinhaDoFluxo[]>;
  cadastrarRecorrente(u: Usuario, linha: LinhaFluxo, dia: number): Promise<void>;
  lerRecorrentes(u: Usuario): Promise<Recorrente[]>;
  removerRecorrente(u: Usuario, nome: string): Promise<string | undefined>;
  substituirPrevisto(u: Usuario, numeroLinha: number, linha: LinhaFluxo): Promise<void>;
  registrarNoLog(u: Usuario, mensagemId: string, gravacao: Gravacao, resumo: string): Promise<void>;
  desfazerUltimo(u: Usuario): Promise<number>;
  baixarMidia(mediaId: string): Promise<{ base64: string; mime: string }>;
  agora?: () => Date;
}

export const AJUDA = `Oi! Eu sou o DinoMoney 🦖
Me mande seus gastos e receitas que eu lanço na sua planilha:
• Texto: "café 6 reais no pix" ou "mercado 230 no Nubank em 2x"
• Foto do cupom, comprovante ou print do app do banco
• PDF do extrato ou da fatura do cartão

Comandos: *desfazer* apaga o último lançamento, *ajuda* mostra esta mensagem.
Metas: *meta mercado 800* define, *metas* mostra como está o mês.
Contas fixas: diga "aluguel 2.357 todo dia 7" que eu prevejo os próximos meses. *recorrentes* lista, *remover recorrente aluguel* tira.
*previsão* mostra o saldo esperado dos próximos meses.
Conferir saldo: *saldo Nubank 780,73* compara com o banco e lança a diferença (rendimento) com a data de hoje.
Suas contas: *minhas contas* mostra a lista, *nova conta Inter* cadastra, *novo cartão Nubank fecha 3 vence 10* cadastra um cartão, *limite Nubank 5000* guarda o limite dele e *remover conta Inter* tira da lista.
No site, o botão *Painel* mostra saldos, gastos do mês, a fatura que vem e o limite livre.`;

/** "Nubank fecha 3 vence 10", "Inter fecha dia 5 e vence dia 12". */
const COMANDO_CARTAO = /^(?:(?:novo|adicionar|cadastrar)\s+)?(?:o\s+)?(?:cart[aã]o\s+)?(.+?)\s+fecha\s+(?:no\s+)?(?:dia\s+)?(\d{1,2})\s*(?:,|e)?\s*vence\s+(?:no\s+)?(?:dia\s+)?(\d{1,2})\s*\.?$/i;

/** "saldo Nubank 780,73", "conferir saldo do PicPay 605.45", "saldo Inter é -20". */
const COMANDO_SALDO = /^(?:conferir\s+)?saldo\s+(?:d[oa]\s+|n[oa]\s+)?(.+?)\s+(?:[eé]\s+(?:de\s+)?|de\s+)?(?:r\$\s*)?(-?\s*\d[\d.]*(?:,\d{1,2})?)\s*(?:reais)?\.?$/i;

/** "limite Nubank 5000", "limite do cartão Inter de R$ 2.500,00". */
const COMANDO_LIMITE = /^limite\s+(?:do\s+)?(?:cart[aã]o\s+)?(.+?)\s+(?:de\s+|[eé]\s+)?(?:r\$\s*)?(\d[\d.]*(?:,\d{1,2})?)\s*(?:reais)?\.?$/i;

const COMANDO_META = /^meta(?:\s+de)?(?:\s+gasto)?(?:\s+(?:com|para|em))?\s+(.+?)\s+(?:de\s+)?(?:r\$\s*)?(\d[\d.]*(?:,\d{1,2})?)\s*(?:reais|por m[eê]s|no m[eê]s)?$/i;
const COMANDO_METAS = /^(?:minhas\s+)?metas\??$/i;
const COMANDO_PREVISAO = /^(?:previs[aã]o|proje[cç][aã]o|fluxo futuro)\??$/i;
const COMANDO_RECORRENTES = /^(?:minhas\s+)?(?:recorrentes|contas fixas|contas recorrentes)\??$/i;
const COMANDO_REMOVER_RECORRENTE = /^(?:remover|apagar|excluir|tirar|cancelar)\s+(?:a\s+|o\s+)?(?:recorrente|recorr[eê]ncia|conta fixa)\s+(.+)$/i;

const COMANDO_LISTAR = /^(?:minhas|meus|ver|listar)?\s*(?:contas|cart[oõ]es|contas e cart[oõ]es)\??$/i;
const COMANDO_NOVA = /^(?:nova|novo|adicionar|cadastrar|criar)\s+(?:a\s+|o\s+)?(conta|investimento|caixinha|cofrinho)\s+(.+)$/i;
const COMANDO_REMOVER = /^(?:remover|apagar|excluir|tirar|deletar)\s+(?:a\s+|o\s+)?(conta|cart[aã]o|investimento|caixinha|cofrinho)\s+(.+)$/i;

function tipoDaPalavra(palavra: string): TipoConta {
  const p = palavra.toLowerCase();
  if (p.startsWith("cart")) return "Cartão";
  if (p === "conta") return "Conta";
  return "Investimento";
}

const comparavel = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MimeImagem = (typeof IMAGENS)[number];

async function paraEntrada(msg: MensagemRecebida, deps: Dependencias): Promise<Entrada | string> {
  switch (msg.tipo) {
    case "texto":
      return { tipo: "texto", texto: msg.texto };
    case "imagem": {
      const { base64, mime } = await deps.baixarMidia(msg.mediaId);
      const tipo = mime.split(";")[0] as MimeImagem;
      if (!IMAGENS.includes(tipo)) return "Não consegui abrir essa imagem. Pode mandar como foto (JPG ou PNG)?";
      return { tipo: "imagem", base64, mime: tipo, legenda: msg.legenda };
    }
    case "documento": {
      if (msg.mime.startsWith("image/")) {
        return paraEntrada({ id: msg.id, de: msg.de, tipo: "imagem", mediaId: msg.mediaId, mime: msg.mime, legenda: msg.legenda }, deps);
      }
      if (msg.mime !== "application/pdf") return "Por enquanto eu leio só PDF, fotos e prints. Pode mandar nesse formato?";
      const { base64 } = await deps.baixarMidia(msg.mediaId);
      return { tipo: "pdf", base64, legenda: msg.legenda };
    }
    case "audio":
      return "Ainda não entendo áudio 🙈 Pode mandar por texto, foto ou print?";
    default:
      return "Não entendi esse tipo de mensagem. Me mande um texto, uma foto, um print ou o PDF do extrato.";
  }
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");

async function ehRecorrente(previsto: LinhaDoFluxo, usuario: Usuario, deps: Dependencias): Promise<boolean> {
  const descricao = previsto.descricao.replace(/^\[previsto\]\s*/i, "");
  return (await deps.lerRecorrentes(usuario)).some(
    (r) => comparavel(r.descricao) === comparavel(descricao) && comparavel(r.despesa) === comparavel(previsto.despesa),
  );
}

function barraDeMeta(gasto: number, meta: number): string {
  const pct = Math.round((gasto / meta) * 100);
  return `${reais(gasto)} de ${reais(meta)} (${pct}%)${pct > 100 ? " ⚠️ passou da meta" : pct >= 80 ? " ⚠️ perto da meta" : ""}`;
}

function listarMetas(metas: Meta[], fluxo: LinhaDoFluxo[], hoje: string): string {
  if (metas.length === 0) return "Você ainda não tem metas. Mande, por exemplo, *meta mercado 800* para definir quanto quer gastar por mês.";
  const gastos = gastosDoMes(fluxo.filter((l) => !ehPrevisto(l.descricao)), hoje.slice(0, 7));
  return [
    "🎯 Suas metas este mês:",
    ...metas.map((m) => `• ${m.despesa}: ${barraDeMeta(Math.max(0, gastos.get(comparavel(m.despesa)) ?? 0), m.valor)}`),
  ].join("\n");
}

async function definirMeta(pedido: string, valorTexto: string, usuario: Usuario, deps: Dependencias): Promise<string> {
  const valor = Number(valorTexto.replace(/\./g, "").replace(",", "."));
  if (!(valor > 0)) return "Não entendi o valor. Exemplo: *meta mercado 800*.";
  const { categorias } = await deps.buscarContexto(usuario);
  const despesas = categorias.filter((c) => !ehRenda(c)).map((c) => c.despesa);
  const achada = acharDespesa(despesas, pedido);
  if (Array.isArray(achada)) return `Qual delas? ${achada.map((d) => `*${d}*`).join(", ")}. Mande de novo com o nome exato, por exemplo *meta ${achada[0]} ${valorTexto}*.`;
  if (!achada) return `Não achei a categoria "${pedido}". As metas usam os nomes da aba Categorias, como *Supermercado* ou *Lanches*.`;
  if (!(await deps.definirMeta(usuario, achada, valor))) {
    return `A categoria *${achada}* não está na aba Categorias da sua planilha, então não consigo guardar a meta dela.`;
  }
  return `🎯 Meta de *${achada}*: ${reais(valor)} por mês. Vou te avisando conforme os gastos chegarem.`;
}

/** Depois de lançar, mostra como ficaram as metas das despesas que receberam gasto neste mês. */
async function avisarMetas(linhas: LinhaFluxo[], usuario: Usuario, deps: Dependencias, hoje: string): Promise<string> {
  const mes = hoje.slice(0, 7);
  const tocadas = new Set(linhas.filter((l) => l.valor < 0 && l.dataISO.startsWith(mes) && !ehPrevisto(l.descricao)).map((l) => comparavel(l.despesa)));
  if (tocadas.size === 0) return "";
  const metas = (await deps.lerMetas(usuario)).filter((m) => tocadas.has(comparavel(m.despesa)));
  if (metas.length === 0) return "";
  const gastos = gastosDoMes((await deps.lerFluxo(usuario)).filter((l) => !ehPrevisto(l.descricao)), mes);
  return metas.map((m) => `🎯 ${m.despesa}: ${barraDeMeta(Math.max(0, gastos.get(comparavel(m.despesa)) ?? 0), m.valor)}`).join("\n");
}

function listarRecorrentes(recorrentes: Recorrente[]): string {
  if (recorrentes.length === 0) {
    return 'Você ainda não tem contas fixas. Mande, por exemplo, "aluguel 2.357 todo dia 7 no Itaú" que eu cadastro e prevejo os próximos meses.';
  }
  return [
    "🔁 Suas contas fixas:",
    ...recorrentes.map((r) => `• ${r.descricao || r.despesa}: ${r.valor > 0 ? "+" : "-"}${reais(Math.abs(r.valor))} todo dia ${r.dia}`),
    "",
    "Para tirar uma: *remover recorrente aluguel*.",
  ].join("\n");
}

function listarContas(usuario: Usuario): string {
  const linhas = [
    ...usuario.contas.map((c) => `• ${c}`),
    ...usuario.cartoes.map(
      (c) => `• 💳 ${c.nome} (fecha dia ${c.fechamento}, vence dia ${c.vencimento}${c.limite ? `, limite ${reais(c.limite)}` : ""})`,
    ),
  ];
  if (linhas.length === 0) return "Você ainda não tem contas cadastradas. Mande, por exemplo, *nova conta Nubank*.";
  return [
    "Suas contas e cartões:",
    ...linhas,
    "",
    "Para mudar: *nova conta Inter*, *novo cartão Nubank fecha 3 vence 10*, *limite Nubank 5000* ou *remover conta Inter*.",
  ].join("\n");
}

/** "1.234,56", "780.73" ou "-20" viram número. */
function valorDigitado(texto: string): number {
  const t = texto.replace(/\s/g, "");
  const decimalComPonto = !t.includes(",") && /\.\d{1,2}$/.test(t);
  return Number(decimalComPonto ? t : t.replace(/\./g, "").replace(",", "."));
}

/**
 * Confere o saldo de uma conta com o do banco: a diferença entra no fluxo com a data de hoje,
 * como rendimento (se o banco tem mais) ou como diferença a investigar (se tem menos).
 */
async function conferirSaldo(
  nomeConta: string,
  valorTexto: string,
  mensagemId: string,
  usuario: Usuario,
  deps: Dependencias,
  hoje: string,
): Promise<string> {
  const noBanco = valorDigitado(valorTexto);
  if (!Number.isFinite(noBanco)) return "Não entendi o valor. Exemplo: *saldo Nubank 780,73*.";
  const contas = usuario.contas;
  const alvo = comparavel(nomeConta);
  const conta =
    contas.find((c) => comparavel(c) === alvo) ??
    (contas.filter((c) => comparavel(c).includes(alvo)).length === 1 ? contas.find((c) => comparavel(c).includes(alvo)) : undefined);
  if (!conta) {
    return `Não achei a conta "${nomeConta}". Suas contas: ${contas.map((c) => `*${c}*`).join(", ") || "nenhuma"}. Exemplo: *saldo ${contas[0] ?? "Nubank"} 780,73*.`;
  }
  const naPlanilha = saldosPorConta(await deps.lerFluxo(usuario), hoje).find((s) => comparavel(s.conta) === comparavel(conta))?.valor ?? 0;
  const diferenca = Math.round((noBanco - naPlanilha) * 100) / 100;
  if (Math.abs(diferenca) < 0.01) return `✅ Saldo do *${conta}* bate com a planilha: ${reais(noBanco)}.`;

  const { categorias } = await deps.buscarContexto(usuario);
  const achar = (teste: RegExp, renda: boolean) =>
    categorias.find((c) => ehRenda(c) === renda && teste.test(comparavel(`${c.tipo} ${c.despesa}`)));
  const categoria =
    diferenca > 0
      ? (achar(/rendimento|juros|dividendo/, true) ?? achar(/passiva/, true) ?? categorias.find(ehRenda))
      : (achar(/outros custos financeiros/, false) ?? achar(/custos? financeiros?|tarifa/, false) ?? categorias.find((c) => !ehRenda(c)));
  if (!categoria) return "Não achei uma categoria para lançar a diferença. Confira a aba Categorias da planilha.";

  const linha: LinhaFluxo = {
    data: paraPlanilha(hoje),
    dataISO: hoje,
    despesa: categoria.despesa,
    descricao: diferenca > 0 ? "Rendimento (conferência de saldo)" : "Diferença na conferência de saldo",
    nome: conta,
    pagoCom: "Débito",
    banco: conta,
    valor: diferenca,
    categoria,
  };
  const gravacao = await deps.gravarNoFluxo(usuario, [linha]);
  const texto = [
    `🏦 Conferi o *${conta}*: banco ${reais(noBanco)}, planilha ${reais(naPlanilha)}.`,
    diferenca > 0
      ? `Lancei ${reais(diferenca)} de rendimento hoje (${categoria.despesa}).`
      : `Lancei ${reais(-diferenca)} como diferença hoje (${categoria.despesa}). Se for um gasto esquecido, mande *desfazer* e lance o gasto certo.`,
    "Agora o saldo bate.",
  ].join("\n");
  await deps.registrarNoLog(usuario, mensagemId, gravacao, texto.split("\n")[1]);
  return texto;
}

/** Conta ou cartão que apareceu no lançamento e ainda não estava em "Minhas contas": cadastra. */
async function cadastrarNovas(linhas: LinhaFluxo[], usuario: Usuario, deps: Dependencias) {
  const conhecidas = new Set([...usuario.contas, ...usuario.cartoes.map((c) => c.nome)].map(comparavel));
  const novas: { nome: string; tipo: TipoConta }[] = [];
  for (const l of linhas) {
    const chave = comparavel(l.banco);
    if (!chave || conhecidas.has(chave)) continue;
    conhecidas.add(chave);
    const tipo: TipoConta = linhas.some((x) => comparavel(x.banco) === chave && x.pagoCom === "Crédito") ? "Cartão" : "Conta";
    await deps.cadastrarConta(usuario, l.banco, tipo);
    novas.push({ nome: l.banco, tipo });
  }
  return novas;
}

function avisoDeNovas(novas: { nome: string; tipo: TipoConta }[]): string {
  return novas
    .map((n) =>
      n.tipo === "Cartão"
        ? `🆕 Cadastrei o cartão *${n.nome}* nas suas contas. Essas compras entraram na data da compra; para eu lançar no vencimento da fatura, me diga: *${n.nome} fecha 5 vence 12* (com os dias certos).`
        : `🆕 Cadastrei a conta *${n.nome}* nas suas contas.`,
    )
    .join("\n");
}

const MAX_REPETIDAS_NO_AVISO = 5;

function avisoDeRepetidas(puladas: LinhaFluxo[]): string {
  const itens = puladas.slice(0, MAX_REPETIDAS_NO_AVISO).map((l) => `• ${reais(Math.abs(l.valor))}${l.nome ? ` em ${l.nome}` : ""} (${l.banco})`);
  const resto = puladas.length - itens.length;
  if (resto > 0) itens.push(`…e mais ${resto}.`);
  const titulo = puladas.length === 1 ? "🔁 Pulei 1 compra que já estava na planilha:" : `🔁 Pulei ${puladas.length} compras que já estavam na planilha:`;
  return [titulo, ...itens].join("\n");
}

/** Processa uma mensagem e devolve o texto a responder no WhatsApp. */
export async function responder(msg: MensagemRecebida, usuario: Usuario, deps: Dependencias): Promise<string> {
  if (msg.tipo === "texto") {
    const comando = msg.texto.trim().toLowerCase();
    if (["ajuda", "oi", "olá", "ola", "menu", "/start"].includes(comando)) return AJUDA;
    if (["desfazer", "desfaz", "apagar", "cancelar"].includes(comando)) {
      const n = await deps.desfazerUltimo(usuario);
      return n === 0
        ? "Não encontrei nenhum lançamento meu para desfazer."
        : `↩️ Pronto, apaguei ${n === 1 ? "o último lançamento" : `as ${n} linhas do último envio`}.`;
    }
    const pedido = msg.texto.trim();
    const hojeCmd = hojeEmSaoPaulo(deps.agora?.());
    if (COMANDO_PREVISAO.test(pedido)) return resumirPrevisao(await deps.lerFluxo(usuario), hojeCmd);
    if (COMANDO_METAS.test(pedido)) return listarMetas(await deps.lerMetas(usuario), await deps.lerFluxo(usuario), hojeCmd);
    const meta = pedido.match(COMANDO_META);
    if (meta) return definirMeta(meta[1], meta[2], usuario, deps);
    if (COMANDO_RECORRENTES.test(pedido)) return listarRecorrentes(await deps.lerRecorrentes(usuario));
    const tirarRecorrente = pedido.match(COMANDO_REMOVER_RECORRENTE);
    if (tirarRecorrente) {
      const removida = await deps.removerRecorrente(usuario, tirarRecorrente[1].trim());
      return removida
        ? `🗑️ Tirei *${removida}* das contas recorrentes e apaguei os previstos dela.`
        : `Não achei "${tirarRecorrente[1].trim()}" nas contas recorrentes. Mande *recorrentes* para ver a lista.`;
    }
    const conferir = pedido.match(COMANDO_SALDO);
    if (conferir) return conferirSaldo(conferir[1].trim(), conferir[2], msg.id, usuario, deps, hojeCmd);
    const limite = pedido.match(COMANDO_LIMITE);
    if (limite) {
      const valor = Number(limite[2].replace(/\./g, "").replace(",", "."));
      if (!(valor > 0)) return "Não entendi o valor. Exemplo: *limite Nubank 5000*.";
      const nome = await deps.definirLimite(usuario, limite[1].trim(), valor);
      return nome
        ? `💳 Pronto! Limite do *${nome}*: ${reais(valor)}. O painel do site mostra quanto ainda está livre.`
        : `Não achei o cartão "${limite[1].trim()}". Cadastre antes com *novo cartão ${limite[1].trim()} fecha 3 vence 10* (trocando pelos dias da sua fatura).`;
    }
    if (COMANDO_LISTAR.test(pedido)) return listarContas(usuario);
    const nova = pedido.match(COMANDO_NOVA);
    if (nova) {
      const nome = nova[2].trim();
      const tipo = tipoDaPalavra(nova[1]);
      if ([...usuario.contas, ...usuario.cartoes.map((c) => c.nome)].some((c) => comparavel(c) === comparavel(nome))) {
        return `*${nome}* já está nas suas contas. Mande *minhas contas* para ver a lista.`;
      }
      await deps.cadastrarConta(usuario, nome, tipo);
      return `🆕 Pronto! Cadastrei ${tipo === "Investimento" ? "o investimento" : "a conta"} *${nome}*.`;
    }
    const remover = pedido.match(COMANDO_REMOVER);
    if (remover) {
      const nome = remover[2].trim();
      const removida = await deps.removerConta(usuario, nome, tipoDaPalavra(remover[1]));
      return removida
        ? `🗑️ Tirei *${removida}* das suas contas. Os lançamentos que já estão na planilha continuam lá.`
        : `Não achei *${nome}* nas suas contas. Mande *minhas contas* para ver a lista.`;
    }
    const cartao = pedido.match(COMANDO_CARTAO);
    if (cartao) {
      const [fechamento, vencimento] = [Number(cartao[2]), Number(cartao[3])];
      if (fechamento < 1 || fechamento > 31 || vencimento < 1 || vencimento > 31) {
        return "Os dias precisam estar entre 1 e 31. Exemplo: *Nubank fecha 3 vence 10*.";
      }
      const nome = await deps.definirCartao(usuario, cartao[1].trim(), fechamento, vencimento);
      return `💳 Pronto! Cartão *${nome}*: fecha dia ${fechamento}, vence dia ${vencimento}. As próximas compras nele entram no vencimento da fatura.`;
    }
  }

  const entrada = await paraEntrada(msg, deps);
  if (typeof entrada === "string") return entrada;

  const hoje = hojeEmSaoPaulo(deps.agora?.());
  const contexto = await deps.buscarContexto(usuario);
  const { categorias } = contexto;
  if (categorias.length === 0) return "Não encontrei as categorias na sua planilha (aba de contas). Fale com seu mentor.";

  let resultado: Classificacao;
  try {
    resultado = await deps.classificar(entrada, contexto, usuario, hoje);
  } catch (erro) {
    if (erro instanceof RecusaDaIA) return "Não consegui processar essa mensagem. Pode escrever de outro jeito?";
    if (erro instanceof RespostaGrandeDemais) {
      return "Esse arquivo tem lançamentos demais para ler de uma vez. Pode mandar em partes menores (por exemplo, uma página ou um mês por vez)?";
    }
    throw erro;
  }

  if (resultado.resposta === "nao_financeiro" && resultado.lancamentos.length === 0) return AJUDA;
  if (resultado.resposta === "pergunta" || resultado.lancamentos.length === 0) {
    return resultado.pergunta || "Não achei nenhum valor nessa mensagem. Quanto foi e em que você gastou?";
  }

  let linhas: LinhaFluxo[][];
  try {
    linhas = resultado.lancamentos.map((l) => paraLinhas(l, categorias, usuario, hoje));
  } catch (erro) {
    if (erro instanceof CategoriaDesconhecida) {
      return `Não achei a categoria "${erro.message}" na sua planilha. Pode me dizer em qual categoria entra?`;
    }
    throw erro;
  }

  // Fatura ou print do cartão: o que a pessoa já mandou antes (por foto, por exemplo) não entra de novo.
  // Texto digitado fica de fora, porque duas compras iguais no mesmo dia podem ser de verdade.
  let lancamentos = resultado.lancamentos;
  let puladas: LinhaFluxo[] = [];
  if (entrada.tipo !== "texto" && linhas.flat().some((l) => l.pagoCom === "Crédito")) {
    const filtrado = tirarRepetidas(linhas, await deps.lerComprasNoCartao(usuario));
    puladas = filtrado.puladas;
    lancamentos = lancamentos.filter((_, i) => filtrado.linhas[i].length > 0);
    linhas = filtrado.linhas.filter((ls) => ls.length > 0);
  }
  if (linhas.length === 0) {
    return puladas.length === 1
      ? "Essa compra já estava na sua planilha, então não lancei de novo."
      : `Essas ${puladas.length} compras já estavam na sua planilha, então não lancei de novo.`;
  }

  // Contas recorrentes geram os previstos dos próximos meses; gasto único com data futura vira previsto.
  const recorrentes: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = lancamentos[i];
    const dia = Math.round(l.recorrente_dia ?? 0);
    const [primeira] = linhas[i];
    if (dia >= 1 && dia <= 31 && linhas[i].length === 1 && primeira.pagoCom !== "Crédito") {
      linhas[i] = [marcarPrevisto(primeira, hoje), ...projetar(primeira, dia, hoje)];
      await deps.cadastrarRecorrente(usuario, primeira, dia);
      recorrentes.push(`🔁 *${primeira.descricao}* ficou como conta fixa todo dia ${dia}. Já deixei previsto até ${MESES_PROJETADOS} meses à frente.`);
    } else if (linhas[i].length === 1 && primeira.pagoCom !== "Crédito") {
      linhas[i] = [marcarPrevisto(primeira, hoje)];
    }
  }

  // Lançamento real que corresponde a um previsto do mesmo mês toma o lugar dele, em vez de duplicar.
  const fluxo = await deps.lerFluxo(usuario);
  const previstos = fluxo.filter((p) => ehPrevisto(p.descricao));
  const substituidas: number[] = [];
  const paraGravar: LinhaFluxo[] = [];
  for (const linha of linhas.flat()) {
    const previsto = !ehPrevisto(linha.descricao) ? acharPrevisto(previstos, linha) : undefined;
    if (previsto) {
      await deps.substituirPrevisto(usuario, previsto.linha, linha);
      substituidas.push(previsto.linha);
      previstos.splice(previstos.indexOf(previsto), 1);
      // Mantém a conta fixa prevista até o mesmo horizonte: entra mais um mês no fim.
      const mesmos = previstos.filter((p) => p.despesa === previsto.despesa && p.descricao === previsto.descricao);
      const ultimo = [previsto, ...mesmos].map((p) => p.data).sort().at(-1)!;
      const dia = Number(previsto.data.slice(8, 10));
      const [proximo] = projetar({ ...linha, dataISO: ultimo, descricao: previsto.descricao }, dia, ultimo).slice(0, 1);
      if (proximo && (await ehRecorrente(previsto, usuario, deps))) paraGravar.push({ ...proximo, valor: previsto.valor });
    } else {
      paraGravar.push(linha);
    }
  }

  const novas = await cadastrarNovas(linhas.flat(), usuario, deps);
  const gravacao = paraGravar.length > 0 ? await deps.gravarNoFluxo(usuario, paraGravar) : { linhas: [], extras: false };
  gravacao.linhas = [...substituidas, ...gravacao.linhas];
  let texto = resumir(lancamentos, linhas);
  if (substituidas.length > 0) {
    texto += `\n\n✔️ ${substituidas.length === 1 ? "Esse lançamento substituiu o previsto" : `${substituidas.length} lançamentos substituíram os previstos`} do mês.`;
  }
  if (recorrentes.length > 0) texto += `\n\n${recorrentes.join("\n")}`;
  const avisoMetas = await avisarMetas(linhas.flat(), usuario, deps, hoje);
  if (avisoMetas) texto += `\n\n${avisoMetas}`;
  if (puladas.length > 0) texto += `\n\n${avisoDeRepetidas(puladas)}`;
  if (novas.length > 0) texto += `\n\n${avisoDeNovas(novas)}`;
  await deps.registrarNoLog(usuario, msg.id, gravacao, texto.split("\n")[1] ?? "");
  return texto;
}
