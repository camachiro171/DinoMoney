import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { encontrarUsuarioTelegram, exigirEnv } from "@/lib/config";
import { processarMensagem } from "@/lib/processar";
import { baixarArquivoTelegram, configurarWebhook, enviarTextoTelegram, extrairMensagemTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 300;

function mesmoSegredo(a: string | null, b: string) {
  if (!a || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Abrir /api/telegram?configurar=SEGREDO no navegador liga o bot a este endereço. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const segredo = exigirEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!mesmoSegredo(url.searchParams.get("configurar"), segredo)) return new Response("Proibido", { status: 403 });
  const resposta = await configurarWebhook(`${url.origin}/api/telegram`, segredo);
  return new Response(resposta, { headers: { "Content-Type": "application/json" } });
}

export async function POST(req: Request) {
  if (!mesmoSegredo(req.headers.get("x-telegram-bot-api-secret-token"), exigirEnv("TELEGRAM_WEBHOOK_SECRET"))) {
    return new Response("Proibido", { status: 401 });
  }
  const msg = extrairMensagemTelegram(await req.json());
  if (msg) {
    after(async () => {
      const usuario = encontrarUsuarioTelegram(msg.de);
      if (!usuario) {
        await enviarTextoTelegram(
          msg.de,
          `Oi! Este Telegram ainda não está cadastrado no DinoMoney. Mande este código para seu mentor liberar o acesso: ${msg.de}`,
        );
        return;
      }
      await processarMensagem(msg, usuario, { enviar: enviarTextoTelegram, baixarMidia: baixarArquivoTelegram });
    });
  }
  return NextResponse.json({ ok: true });
}
