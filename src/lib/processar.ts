import { responder } from "./bot";
import { classificar } from "./classificador";
import type { Usuario } from "./config";
import { buscarContexto, desfazerUltimo, gravarNoFluxo, jaProcessada, registrarNoLog } from "./planilha";
import type { MensagemRecebida } from "./whatsapp";

/** O que muda de um canal (WhatsApp, Telegram) para outro. */
export interface Canal {
  enviar(para: string, texto: string): Promise<void>;
  baixarMidia(mediaId: string): Promise<{ base64: string; mime: string }>;
}

/** Lança a mensagem na planilha da pessoa e responde pelo mesmo canal. */
export async function processarMensagem(msg: MensagemRecebida, usuario: Usuario, canal: Canal) {
  if (await jaProcessada(usuario, msg.id)) return;
  try {
    const texto = await responder(msg, usuario, {
      buscarContexto,
      classificar,
      gravarNoFluxo,
      registrarNoLog,
      desfazerUltimo,
      baixarMidia: canal.baixarMidia,
    });
    await canal.enviar(msg.de, texto);
  } catch (erro) {
    console.error("Erro ao processar mensagem", msg.id, erro);
    await canal.enviar(msg.de, "Tive um problema para lançar isso agora 😕 Tenta de novo daqui a pouco?");
  }
}
