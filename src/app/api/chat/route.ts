import { NextResponse } from "next/server";
import { usuarioLogado } from "@/lib/autenticacao";
import { responder } from "@/lib/bot";
import { classificar } from "@/lib/classificador";
import { buscarContexto, desfazerUltimo, gravarNoFluxo, registrarNoLog } from "@/lib/planilha";
import { mensagemDoSite } from "@/lib/web";

export const runtime = "nodejs";
// Ler um extrato inteiro pode levar um tempo
export const maxDuration = 300;

export async function POST(req: Request) {
  const usuario = await usuarioLogado();
  if (!usuario) return NextResponse.json({ resposta: "Sua sessão expirou. Entre de novo com seu código." }, { status: 401 });

  const form = await req.formData();
  const texto = String(form.get("texto") ?? "");
  const id = String(form.get("id") ?? crypto.randomUUID());
  const arquivo = form.get("arquivo");
  const enviado =
    arquivo instanceof File && arquivo.size > 0
      ? { nome: arquivo.name, mime: arquivo.type, base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64") }
      : undefined;
  if (!texto.trim() && !enviado) return NextResponse.json({ resposta: "Escreva o gasto ou anexe uma foto ou PDF." });

  const { msg, baixarMidia } = mensagemDoSite(id, usuario.telefone, texto, enviado);
  try {
    const resposta = await responder(msg, usuario, {
      buscarContexto,
      classificar,
      gravarNoFluxo,
      registrarNoLog,
      desfazerUltimo,
      baixarMidia,
    });
    return NextResponse.json({ resposta: resposta.replace(/\*/g, "") });
  } catch (erro) {
    console.error("Erro ao processar mensagem do site", msg.id, erro);
    return NextResponse.json({ resposta: "Tive um problema para lançar isso agora 😕 Tenta de novo daqui a pouco?" }, { status: 500 });
  }
}
