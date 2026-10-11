import { cookies } from "next/headers";
import { encontrarUsuario, exigirEnv, type Usuario } from "./config";
import { COOKIE_SESSAO, lerSessao } from "./sessao";

/** Quem está logado no site, pelo cookie de sessão. */
export async function usuarioLogado(): Promise<Usuario | undefined> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const telefone = lerSessao(token, exigirEnv("DINOMONEY_SEGREDO_SESSAO"));
  return telefone ? encontrarUsuario(telefone) : undefined;
}
