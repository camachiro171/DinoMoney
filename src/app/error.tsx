"use client";

/** Tela mostrada quando algo quebra no navegador: em vez da página branca, explica e deixa recomeçar. */
export default function Erro({ error }: { error: Error & { digest?: string } }) {
  function recomecar() {
    try {
      localStorage.removeItem("dino_pendente");
    } catch {
      // Sem armazenamento: só recarrega.
    }
    window.location.reload();
  }

  return (
    <main className="entrar">
      <h1>🦖 Ops!</h1>
      <p>Alguma coisa deu errado nesta tela. Toque em recomeçar; seus lançamentos já gravados continuam na planilha.</p>
      <button className="botao" onClick={recomecar}>
        Recomeçar
      </button>
      <p className="erro">Detalhe para o suporte: {error.message || error.digest || "sem detalhe"}</p>
    </main>
  );
}
