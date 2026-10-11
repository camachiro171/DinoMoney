import { exigirEnv } from "./config";
import type { MensagemRecebida } from "./whatsapp";

const API = "https://api.telegram.org";

interface ArquivoTelegram {
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

interface MensagemTelegram {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: ArquivoTelegram[];
  document?: ArquivoTelegram;
  voice?: ArquivoTelegram;
  audio?: ArquivoTelegram;
}

/** Converte um update do Telegram no mesmo formato de mensagem que o WhatsApp usa. */
export function extrairMensagemTelegram(update: unknown): MensagemRecebida | null {
  const m = (update as { message?: MensagemTelegram })?.message;
  if (!m?.chat) return null;
  const base = { id: `tg:${m.chat.id}:${m.message_id}`, de: String(m.chat.id) };
  if (m.text !== undefined) return { ...base, tipo: "texto", texto: m.text };
  if (m.photo?.length) {
    // O Telegram manda a mesma foto em vários tamanhos; a última é a maior.
    return { ...base, tipo: "imagem", mediaId: m.photo[m.photo.length - 1].file_id, mime: "image/jpeg", legenda: m.caption };
  }
  if (m.document) {
    return {
      ...base,
      tipo: "documento",
      mediaId: m.document.file_id,
      mime: m.document.mime_type ?? "application/octet-stream",
      legenda: m.caption,
      arquivo: m.document.file_name,
    };
  }
  if (m.voice || m.audio) return { ...base, tipo: "audio", mediaId: (m.voice ?? m.audio)!.file_id };
  return { ...base, tipo: "outro" };
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

export function mimePeloCaminho(caminho: string): string {
  const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
  return MIME_POR_EXTENSAO[ext] ?? "application/octet-stream";
}

function urlBot(metodo: string) {
  return `${API}/bot${exigirEnv("TELEGRAM_BOT_TOKEN")}/${metodo}`;
}

/** Baixa uma foto ou arquivo enviado no Telegram e devolve em base64. */
export async function baixarArquivoTelegram(fileId: string): Promise<{ base64: string; mime: string }> {
  const info = await fetch(`${urlBot("getFile")}?file_id=${encodeURIComponent(fileId)}`);
  if (!info.ok) throw new Error(`Falha ao consultar arquivo do Telegram: ${info.status} ${await info.text()}`);
  const { result } = (await info.json()) as { result: { file_path: string } };
  const arquivo = await fetch(`${API}/file/bot${exigirEnv("TELEGRAM_BOT_TOKEN")}/${result.file_path}`);
  if (!arquivo.ok) throw new Error(`Falha ao baixar arquivo do Telegram: ${arquivo.status}`);
  return { base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"), mime: mimePeloCaminho(result.file_path) };
}

export async function enviarTextoTelegram(chatId: string, texto: string): Promise<void> {
  const res = await fetch(urlBot("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Os *negritos* são do WhatsApp; no Telegram sem formatação eles apareceriam como asteriscos.
    body: JSON.stringify({ chat_id: chatId, text: texto.replace(/\*/g, "").slice(0, 4000) }),
  });
  if (!res.ok) throw new Error(`Falha ao enviar mensagem no Telegram: ${res.status} ${await res.text()}`);
}

/** Diz ao Telegram para entregar as mensagens do bot neste endereço. */
export async function configurarWebhook(url: string, segredo: string): Promise<string> {
  const res = await fetch(urlBot("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: segredo, allowed_updates: ["message"] }),
  });
  return res.text();
}
