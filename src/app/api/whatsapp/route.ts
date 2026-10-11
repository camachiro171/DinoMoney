import { after, NextResponse } from "next/server";
import { responder } from "@/lib/bot";
import { classificar } from "@/lib/classificador";
import { cadastrarConta, definirCartao, encontrarUsuarioCadastrado, prepararUsuario } from "@/lib/cadastro";
import { exigirEnv } from "@/lib/config";
import { buscarContexto, desfazerUltimo, gravarNoFluxo, lerComprasNoCartao, jaProcessada, registrarNoLog } from "@/lib/planilha";
import { assinaturaValida, baixarMidia, enviarTexto, extrairFalhas, extrairMensagens, type MensagemRecebida } from "@/lib/whatsapp";

export const runtime = "nodejs";
// Ler um extrato inteiro pode levar um tempo
export const maxDuration = 300;

/** A Meta chama este GET uma vez para confirmar o webhook. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const ok =
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === exigirEnv("WHATSAPP_VERIFY_TOKEN");
  return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("Proibido", { status: 403 });
}

async function processar(msg: MensagemRecebida) {
  const cadastrado = await encontrarUsuarioCadastrado(msg.de);
  if (!cadastrado) {
    await enviarTexto(msg.de, "Oi! Este número ainda não está cadastrado no DinoMoney. Fale com seu mentor para liberar o acesso.");
    return;
  }
  if (await jaProcessada(cadastrado, msg.id)) return;
  try {
    const usuario = await prepararUsuario(cadastrado);
    const texto = await responder(msg, usuario, {
      buscarContexto,
      classificar,
      gravarNoFluxo,
      lerComprasNoCartao,
      cadastrarConta,
      definirCartao,
      registrarNoLog,
      desfazerUltimo,
      baixarMidia,
    });
    await enviarTexto(msg.de, texto);
  } catch (erro) {
    console.error("Erro ao processar mensagem", msg.id, erro);
    await enviarTexto(msg.de, "Tive um problema para lançar isso agora 😕 Tenta de novo daqui a pouco?");
  }
}

export async function POST(req: Request) {
  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), exigirEnv("WHATSAPP_APP_SECRET"))) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  const dados = JSON.parse(corpo);
  for (const falha of extrairFalhas(dados)) {
    console.error("A Meta não conseguiu entregar a resposta para", falha.para, JSON.stringify(falha.erros));
  }
  const mensagens = extrairMensagens(dados);
  // Respondemos 200 na hora (senão a Meta reenvia) e processamos logo em seguida.
  after(async () => {
    for (const msg of mensagens) await processar(msg);
  });
  return NextResponse.json({ ok: true });
}
