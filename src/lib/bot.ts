import type { Usuario } from "./config";
import type { ContextoPlanilha, Gravacao } from "./planilha";
import { RecusaDaIA, type Classificacao, type Entrada } from "./classificador";
import { hojeEmSaoPaulo } from "./datas";
import { CategoriaDesconhecida, paraLinhas, resumir, type LinhaFluxo } from "./lancamentos";
import type { MensagemRecebida } from "./whatsapp";

/** Tudo que o bot precisa do mundo lá fora; nos testes trocamos por versões falsas. */
export interface Dependencias {
  buscarContexto(u: Usuario): Promise<ContextoPlanilha>;
  classificar(e: Entrada, c: ContextoPlanilha, u: Usuario, hoje: string): Promise<Classificacao>;
  gravarNoFluxo(u: Usuario, linhas: LinhaFluxo[]): Promise<Gravacao>;
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

Comandos: *desfazer* apaga o último lançamento, *ajuda* mostra esta mensagem.`;

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
  const gravacao = await deps.gravarNoFluxo(usuario, linhas.flat());
  const texto = resumir(resultado.lancamentos, linhas);
  await deps.registrarNoLog(usuario, msg.id, gravacao, texto.split("\n")[1] ?? "");
  return texto;
}
