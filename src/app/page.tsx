import { usuarioLogado } from "@/lib/autenticacao";
import { Chat } from "./chat";
import { Entrar } from "./entrar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const usuario = await usuarioLogado();
  return usuario ? <Chat nome={usuario.nome} /> : <Entrar />;
}
