import crypto from "node:crypto";

export const COOKIE_SESSAO = "dino_sessao";
export const DIAS_DE_SESSAO = 30;

function assinar(dados: string, segredo: string) {
  return crypto.createHmac("sha256", segredo).update(dados).digest("base64url");
}

/** Cria o valor do cookie de login: telefone da pessoa, validade e assinatura. */
export function criarSessao(telefone: string, segredo: string, agora = Date.now()): string {
  const dados = `${telefone}.${agora + DIAS_DE_SESSAO * 86_400_000}`;
  return `${dados}.${assinar(dados, segredo)}`;
}

/** Devolve o telefone de quem está logado, ou null se o cookie for inválido ou tiver vencido. */
export function lerSessao(token: string | undefined, segredo: string, agora = Date.now()): string | null {
  const partes = token?.split(".");
  if (partes?.length !== 3) return null;
  const [telefone, validade, assinatura] = partes;
  const esperada = assinar(`${telefone}.${validade}`, segredo);
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;
  if (!(Number(validade) > agora)) return null;
  return telefone;
}
