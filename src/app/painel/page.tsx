import { redirect } from "next/navigation";
import { usuarioLogado } from "@/lib/autenticacao";
import { prepararUsuario } from "@/lib/cadastro";
import { hojeEmSaoPaulo } from "@/lib/datas";
import { lerFluxo, lerMetas } from "@/lib/metas";
import { montarPainel } from "@/lib/painel";
import { VerPainel } from "./ver-painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PaginaPainel({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const logado = await usuarioLogado();
  if (!logado) redirect("/");
  const usuario = await prepararUsuario(logado);
  const [fluxo, metas] = await Promise.all([lerFluxo(usuario), lerMetas(usuario)]);
  const { mes } = await searchParams;
  return <VerPainel nome={usuario.nome} p={montarPainel(fluxo, usuario, metas, hojeEmSaoPaulo(), mes)} />;
}
