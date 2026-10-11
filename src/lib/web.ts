import type { MensagemRecebida } from "./whatsapp";

export interface ArquivoEnviado {
  nome: string;
  mime: string;
  base64: string;
}

/** Monta, a partir do que a pessoa mandou no site, a mesma mensagem que viria do WhatsApp. */
export function mensagemDoSite(
  id: string,
  telefone: string,
  texto: string,
  arquivo?: ArquivoEnviado,
): { msg: MensagemRecebida; baixarMidia: () => Promise<{ base64: string; mime: string }> } {
  const base = { id: `web:${id}`, de: telefone };
  const baixarMidia = async () => {
    if (!arquivo) throw new Error("Mensagem sem arquivo");
    return { base64: arquivo.base64, mime: arquivo.mime };
  };
  const legenda = texto.trim() || undefined;
  if (!arquivo) return { msg: { ...base, tipo: "texto", texto }, baixarMidia };
  if (arquivo.mime.startsWith("image/")) {
    return { msg: { ...base, tipo: "imagem", mediaId: "site", mime: arquivo.mime, legenda }, baixarMidia };
  }
  return {
    msg: { ...base, tipo: "documento", mediaId: "site", mime: arquivo.mime, legenda, arquivo: arquivo.nome },
    baixarMidia,
  };
}
