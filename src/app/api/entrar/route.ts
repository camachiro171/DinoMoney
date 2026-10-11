import { NextResponse } from "next/server";
import { encontrarUsuarioPorCodigo, exigirEnv } from "@/lib/config";
import { COOKIE_SESSAO, DIAS_DE_SESSAO, criarSessao } from "@/lib/sessao";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { codigo } = (await req.json().catch(() => ({}))) as { codigo?: string };
  const usuario = codigo ? encontrarUsuarioPorCodigo(codigo) : undefined;
  if (!usuario) {
    // Uma pequena espera deixa tentativas em sequência bem mais lentas.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ erro: "Código não encontrado. Confira com seu mentor." }, { status: 401 });
  }
  const res = NextResponse.json({ nome: usuario.nome });
  res.cookies.set(COOKIE_SESSAO, criarSessao(usuario.telefone, exigirEnv("DINOMONEY_SEGREDO_SESSAO")), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DIAS_DE_SESSAO * 86_400,
  });
  return res;
}
