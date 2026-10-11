import type { Usuario } from "./config";
import { lerFluxo } from "./metas";
import { previsoesDeFatura } from "./painel";
import { atualizarValores } from "./previsao";
import { hojeEmSaoPaulo } from "./datas";

/**
 * Mantém os "Pagamento do cartão" previstos da planilha com a fatura de verdade (compras no crédito do vencimento,
 * menos o que já foi pago). Falhar aqui nunca deve atrapalhar o lançamento ou o painel.
 */
export async function sincronizarFaturas(usuario: Usuario, fluxo?: Awaited<ReturnType<typeof lerFluxo>>): Promise<void> {
  try {
    const linhas = fluxo ?? (await lerFluxo(usuario));
    await atualizarValores(usuario, previsoesDeFatura(linhas, hojeEmSaoPaulo(), usuario));
  } catch (erro) {
    console.error("Não consegui atualizar a fatura prevista", erro);
  }
}
