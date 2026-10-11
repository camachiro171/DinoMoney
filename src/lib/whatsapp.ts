import crypto from "node:crypto";
import { exigirEnv } from "./config";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Confere a assinatura X-Hub-Signature-256 para garantir que a requisição veio da Meta. */
export function assinaturaValida(corpo: string, assinatura: string | null, segredo: string): boolean {
  if (!assinatura?.startsWith("sha256=")) return false;
  const esperada = crypto.createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");
  const recebida = assinatura.slice("sha256=".length);
  if (recebida.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recebida, "hex"), Buffer.from(esperada, "hex"));
}

export type MensagemRecebida =
  | { id: string; de: string; tipo: "texto"; texto: string }
  | { id: string; de: string; tipo: "imagem"; mediaId: string; mime: string; legenda?: string }
  | { id: string; de: string; tipo: "documento"; mediaId: string; mime: string; legenda?: string; arquivo?: string }
  | { id: string; de: string; tipo: "audio"; mediaId: string }
  | { id: string; de: string; tipo: "outro" };

interface WebhookMensagem {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; caption?: string; filename?: string };
  audio?: { id: string };
}

/** Extrai as mensagens de um corpo de webhook do WhatsApp Cloud API (ignora status de entrega). */
export function extrairMensagens(corpo: unknown): MensagemRecebida[] {
  const mensagens: MensagemRecebida[] = [];
  const entries = (corpo as { entry?: { changes?: { value?: { messages?: WebhookMensagem[] } }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        const base = { id: m.id, de: m.from };
        if (m.type === "text" && m.text) mensagens.push({ ...base, tipo: "texto", texto: m.text.body });
        else if (m.type === "image" && m.image)
          mensagens.push({ ...base, tipo: "imagem", mediaId: m.image.id, mime: m.image.mime_type, legenda: m.image.caption });
        else if (m.type === "document" && m.document)
          mensagens.push({
            ...base,
            tipo: "documento",
            mediaId: m.document.id,
            mime: m.document.mime_type,
            legenda: m.document.caption,
            arquivo: m.document.filename,
          });
        else if (m.type === "audio" && m.audio) mensagens.push({ ...base, tipo: "audio", mediaId: m.audio.id });
        else mensagens.push({ ...base, tipo: "outro" });
      }
    }
  }
  return mensagens;
}

function cabecalhos() {
  return { Authorization: `Bearer ${exigirEnv("WHATSAPP_TOKEN")}` };
}

/** Baixa uma foto ou arquivo enviado pela pessoa e devolve em base64. */
export async function baixarMidia(mediaId: string): Promise<{ base64: string; mime: string }> {
  const info = await fetch(`${GRAPH}/${mediaId}`, { headers: cabecalhos() });
  if (!info.ok) throw new Error(`Falha ao consultar mídia ${mediaId}: ${info.status}`);
  const { url, mime_type } = (await info.json()) as { url: string; mime_type: string };
  const arquivo = await fetch(url, { headers: cabecalhos() });
  if (!arquivo.ok) throw new Error(`Falha ao baixar mídia ${mediaId}: ${arquivo.status}`);
  return { base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"), mime: mime_type };
}

export async function enviarTexto(para: string, texto: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${exigirEnv("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { ...cabecalhos(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(0, 4000) } }),
  });
  if (!res.ok) throw new Error(`Falha ao enviar mensagem: ${res.status} ${await res.text()}`);
}
