import { redirect } from "next/navigation";
import { usuarioLogado } from "@/lib/autenticacao";
import { prepararUsuario } from "@/lib/cadastro";
import { hojeEmSaoPaulo } from "@/lib/datas";
import { lerFluxo, lerInvestimentos, lerMetas } from "@/lib/metas";
import { montarPainel } from "@/lib/painel";
import { VerPainel } from "./ver-painel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Busca = { banco?: string; passado?: string; futuro?: string; mes?: string };

export default async function PaginaPainel({ searchParams }: { searchParams: Promise<Busca> }) {
  const logado = await usuarioLogado();
  if (!logado) redirect("/");
  const usuario = await prepararUsuario(logado);
  const [fluxo, metas, investimentos] = await Promise.all([lerFluxo(usuario), lerMetas(usuario), lerInvestimentos(usuario)]);
  const busca = await searchParams;
  const p = montarPainel(fluxo, usuario, metas, hojeEmSaoPaulo(), {
    banco: busca.banco,
    passado: Number(busca.passado) || undefined,
    futuro: Number(busca.futuro) || undefined,
    mes: busca.mes,
  });
  return <VerPainel nome={usuario.nome} p={p} investimentos={investimentos} />;
}
