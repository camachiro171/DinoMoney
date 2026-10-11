"use client";

import { useState } from "react";

export function Entrar() {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const res = await fetch("/api/entrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo }),
    });
    if (res.ok) {
      window.location.reload();
      return;
    }
    const corpo = (await res.json().catch(() => ({}))) as { erro?: string };
    setErro(corpo.erro ?? "Não consegui entrar agora. Tente de novo.");
    setEnviando(false);
  }

  return (
    <main className="entrar">
      <h1>🦖 DinoMoney</h1>
      <p>Seu fluxo de caixa organizado pela Fôlego. Entre com o código que seu mentor te passou.</p>
      <form onSubmit={entrar}>
        <input
          className="campo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Seu código de acesso"
          autoComplete="current-password"
          type="password"
          required
        />
        <button className="botao" disabled={enviando || !codigo.trim()}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
        {erro && <span className="erro">{erro}</span>}
      </form>
    </main>
  );
}
