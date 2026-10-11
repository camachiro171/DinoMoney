import { after, NextResponse } from "next/server";
import { usuarioLogado } from "@/lib/autenticacao";
import { responder } from "@/lib/bot";
import { classificar } from "@/lib/classificador";
import { buscarContexto, desfazerUltimo, gravarNoFluxo, lerComprasNoCartao, lerResposta, registrarNoLog, salvarResposta } from "@/lib/planilha";
import { mensagemDoSite } from "@/lib/web";
import { cadastrarConta, definirCartao, removerConta, prepararUsuario } from "@/lib/cadastro";

export const runtime = "nodejs";
// Ler um extrato inteiro pode levar um tempo
export const maxDuration = 300;

const SESSAO_EXPIRADA = { resposta: "Sua sessão expirou. Entre de novo com seu código." };
const ID_VALIDO = /^[\w-]{8,64}$/;

/**
 * Recebe o envio e responde na hora que começou a ler. A leitura continua em segundo plano
 * e o navegador busca a resposta pelo GET, então a conexão não precisa ficar aberta.
 */
export async function POST(req: Request) {
  const usuario = await usuarioLogado();
  if (!usuario) return NextResponse.json(SESSAO_EXPIRADA, { status: 401 });

  const form = await req.formData();
  const texto = String(form.get("texto") ?? "");
  const id = String(form.get("id") ?? "");
  if (!ID_VALIDO.test(id)) return NextResponse.json({ resposta: "Envio inválido. Atualize a página e tente de novo." }, { status: 400 });
  const arquivo = form.get("arquivo");
  const enviado =
    arquivo instanceof File && arquivo.size > 0
      ? { nome: arquivo.name, mime: arquivo.type, base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64") }
      : undefined;
  if (!texto.trim() && !enviado) return NextResponse.json({ estado: "pronto", resposta: "Escreva o gasto ou anexe uma foto ou PDF." });

  const { msg, baixarMidia } = mensagemDoSite(id, usuario.telefone, texto, enviado);
  await salvarResposta(usuario, id, "lendo");
  after(async () => {
    let resposta: string;
    try {
      resposta = await responder(msg, await prepararUsuario(usuario), {
        buscarContexto,
        classificar,
        gravarNoFluxo,
        lerComprasNoCartao,
        cadastrarConta,
        definirCartao,
        removerConta,
        registrarNoLog,
        desfazerUltimo,
        baixarMidia,
      });
    } catch (erro) {
      console.error("Erro ao processar mensagem do site", msg.id, erro);
      resposta = "Tive um problema para lançar isso agora 😕 Tenta de novo daqui a pouco?";
    }
    await salvarResposta(usuario, id, "pronto", resposta.replace(/\*/g, ""));
  });
  return NextResponse.json({ estado: "lendo" });
}

export async function GET(req: Request) {
  const usuario = await usuarioLogado();
  if (!usuario) return NextResponse.json(SESSAO_EXPIRADA, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID_VALIDO.test(id)) return NextResponse.json({ estado: "pronto", resposta: "Envio não encontrado." }, { status: 400 });
  const r = await lerResposta(usuario, id);
  if (!r) return NextResponse.json({ estado: "pronto", resposta: "Não encontrei esse envio. Tente mandar de novo." });
  return NextResponse.json({ estado: r.estado, resposta: r.texto });
}
