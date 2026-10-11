import type { Dependencias } from "./bot";
import { cadastrarConta, definirCartao, definirLimite, removerConta } from "./cadastro";
import { classificar } from "./classificador";
import { definirMeta, lerFluxo, lerMetas } from "./metas";
import { buscarContexto, desfazerUltimo, gravarNoFluxo, lerComprasNoCartao, registrarNoLog } from "./planilha";
import { cadastrarRecorrente, lerRecorrentes, removerRecorrente, substituirPrevisto } from "./previsao";

/** As dependências de verdade do bot (planilha e IA). Cada canal só acrescenta como baixar a mídia. */
export const dependenciasPadrao: Omit<Dependencias, "baixarMidia"> = {
  buscarContexto,
  classificar,
  gravarNoFluxo,
  lerComprasNoCartao,
  cadastrarConta,
  definirCartao,
  removerConta,
  definirLimite,
  lerMetas,
  definirMeta,
  lerFluxo,
  cadastrarRecorrente,
  lerRecorrentes,
  removerRecorrente,
  substituirPrevisto,
  registrarNoLog,
  desfazerUltimo,
};
