"use client";

import { useEffect, useRef, useState } from "react";

interface Mensagem {
  de: "eu" | "dino";
  texto: string;
  anexo?: string;
  esperando?: boolean;
}

// A Vercel recusa envios acima de ~4,5 MB, então fotos são reduzidas antes de subir.
const LIMITE_BYTES = 4 * 1024 * 1024;
const LADO_MAXIMO = 1800;

async function prepararArquivo(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/gif") return arquivo;
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  if (escala === 1 && arquivo.size < LIMITE_BYTES / 2) return arquivo;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext("2d")!.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), "image/jpeg", 0.85));
  return new File([blob], arquivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

const PENDENTE = "dino_pendente";
const INTERVALO_MS = 3000;
const ESPERA_MAXIMA_MS = 6 * 60 * 1000;

function guardarPendente(id: string | null) {
  try {
    if (id) localStorage.setItem(PENDENTE, id);
    else localStorage.removeItem(PENDENTE);
  } catch {
    // Sem armazenamento (aba anônima): só não dá para retomar depois de recarregar a página.
  }
}

function lerPendente(): string | null {
  try {
    return localStorage.getItem(PENDENTE);
  } catch {
    return null;
  }
}

/** Busca a resposta de um envio até ela ficar pronta. Quedas de conexão no meio só fazem tentar de novo. */
async function aguardarResposta(id: string): Promise<string> {
  const inicio = Date.now();
  while (Date.now() - inicio < ESPERA_MAXIMA_MS) {
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
    try {
      const res = await fetch(`/api/chat?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.reload();
        return "";
      }
      const corpo = (await res.json()) as { estado?: string; resposta?: string };
      if (corpo.estado === "pronto") return corpo.resposta ?? "";
    } catch {
      // Sem internet por um instante (ou o celular pausou a página); tenta de novo.
    }
  }
  return "Está demorando mais que o normal. Confira na planilha daqui a pouco; se não aparecer, mande de novo.";
}

export function Chat({ nome }: { nome: string }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      de: "dino",
      texto: `Oi, ${nome}! Me mande o que você gastou ou recebeu e eu lanço na sua planilha.\n\nPode ser um texto como "mercado 230 no Nubank em 2x", a foto do cupom, o print do app do banco ou o PDF da fatura.`,
    },
  ]);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);

  useEffect(() => fim.current?.scrollIntoView({ behavior: "smooth" }), [mensagens]);

  // Se a página foi fechada no meio de uma leitura, retoma de onde parou.
  useEffect(() => {
    const id = lerPendente();
    if (!id) return;
    setEnviando(true);
    setMensagens((m) => [...m, { de: "dino", texto: "Ainda estou lendo o seu último envio...", esperando: true }]);
    aguardarResposta(id).then((resposta) => {
      guardarPendente(null);
      setMensagens((m) => [...m.slice(0, -1), { de: "dino", texto: resposta }]);
      setEnviando(false);
    });
  }, []);

  async function enviar(conteudo: string, anexo: File | null) {
    if (enviando || (!conteudo.trim() && !anexo)) return;
    setEnviando(true);
    setTexto("");
    setArquivo(null);
    if (seletor.current) seletor.current.value = "";
    setMensagens((m) => [
      ...m,
      { de: "eu", texto: conteudo, anexo: anexo?.name },
      { de: "dino", texto: anexo ? "Lendo o arquivo..." : "Lançando...", esperando: true },
    ]);

    let resposta: string;
    try {
      const pronto = anexo ? await prepararArquivo(anexo) : null;
      if (pronto && pronto.size > LIMITE_BYTES) {
        resposta = "Esse arquivo é grande demais para mim (máximo 4 MB). Se for PDF, tente mandar só as páginas dos lançamentos.";
      } else {
        const id = crypto.randomUUID();
        const form = new FormData();
        form.set("id", id);
        form.set("texto", conteudo);
        if (pronto) form.set("arquivo", pronto);
        const res = await fetch("/api/chat", { method: "POST", body: form });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (res.status === 413) {
          resposta = "Esse arquivo é grande demais para mim (máximo 4 MB). Se for PDF, tente mandar só as páginas dos lançamentos.";
        } else {
          const corpo = (await res.json().catch(() => ({}))) as { estado?: string; resposta?: string };
          if (corpo.estado === "lendo") {
            guardarPendente(id);
            resposta = await aguardarResposta(id);
            guardarPendente(null);
          } else {
            resposta = corpo.resposta ?? `Não consegui responder agora (erro ${res.status}). Tente de novo.`;
          }
        }
      }
    } catch (erro) {
      const detalhe = erro instanceof Error ? ` (${erro.message})` : "";
      resposta = `Não consegui enviar. Confira sua internet e tente de novo.${detalhe}`;
    }
    setMensagens((m) => [...m.slice(0, -1), { de: "dino", texto: resposta }]);
    setEnviando(false);
  }

  async function sair() {
    await fetch("/api/sair", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="chat">
      <header className="topo">
        <div>
          <strong>🦖 DinoMoney</strong> <span>by Fôlego</span>
        </div>
        <div>
          <button className="link" onClick={() => enviar("desfazer", null)} disabled={enviando}>
            Desfazer último
          </button>
          <button className="link" onClick={sair}>
            Sair
          </button>
        </div>
      </header>

      <div className="mensagens">
        {mensagens.map((m, i) => (
          <div key={i} className={`balao ${m.de}${m.esperando ? " esperando" : ""}`}>
            {m.anexo && <div className="anexo">📎 {m.anexo}</div>}
            {m.texto}
          </div>
        ))}
        <div ref={fim} />
      </div>

      <footer className="rodape">
        {arquivo && (
          <div className="selecionado">
            <span>📎 {arquivo.name}</span>
            <button className="link" onClick={() => setArquivo(null)}>
              Remover
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto, arquivo);
          }}
        >
          <input
            ref={seletor}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="clipe" onClick={() => seletor.current?.click()} aria-label="Anexar foto ou PDF">
            📎
          </button>
          <textarea
            className="campo"
            rows={1}
            value={texto}
            placeholder={arquivo ? "Comentário (opcional)" : "Ex.: café 6 reais no pix"}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(texto, arquivo);
              }
            }}
          />
          <button className="botao" disabled={enviando || (!texto.trim() && !arquivo)}>
            Enviar
          </button>
        </form>
      </footer>
    </div>
  );
}
