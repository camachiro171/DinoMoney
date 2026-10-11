import Link from "next/link";
import type { DegrauCascata, Painel } from "@/lib/painel";

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const curto = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const nomeDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1][0].toUpperCase()}${NOMES_MES[m - 1].slice(1)} de ${a}`;
};
const mesCurto = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1].slice(0, 3)}/${String(a).slice(2)}`;
};

/**
 * Gráfico em cascata deitado (cabe melhor no celular): cada barra começa onde a anterior terminou.
 * Início e fim do mês são barras inteiras, a partir do zero.
 */
function Cascata({ degraus }: { degraus: DegrauCascata[] }) {
  let corrente = 0;
  const barras = degraus.map((d) => {
    if (d.tipo === "inicio" || d.tipo === "fim") {
      corrente = d.valor;
      return { d, de: 0, ate: d.valor };
    }
    const de = corrente;
    corrente += d.tipo === "entrada" ? d.valor : -d.valor;
    return { d, de, ate: corrente };
  });
  const valores = barras.flatMap((b) => [b.de, b.ate]);
  const min = Math.min(0, ...valores);
  const faixa = Math.max(0, ...valores) - min || 1;
  const pct = (v: number) => ((v - min) / faixa) * 100;

  return (
    <div className="cascata" role="img" aria-label="Cascata do fluxo de caixa do mês">
      {barras.map((b, i) => {
        const sinal = b.d.tipo === "saida" ? "−" : b.d.tipo === "entrada" ? "+" : "";
        return (
          <div key={i} className={`degrau ${b.d.tipo}`}>
            <span className="rotulo" title={b.d.rotulo}>
              {b.d.rotulo}
            </span>
            <span className="trilho">
              {min < 0 && <span className="zero" style={{ left: `${pct(0)}%` }} />}
              <span
                className="pedaco"
                style={{ left: `${pct(Math.min(b.de, b.ate))}%`, width: `${Math.max(0.8, Math.abs(pct(b.de) - pct(b.ate)))}%` }}
              />
            </span>
            <span className="quanto">
              {sinal}
              {curto(b.d.valor)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function VerPainel({ nome, p }: { nome: string; p: Painel }) {
  const maiorGasto = Math.max(1, ...p.gastos.map((g) => Math.max(g.valor, g.meta ?? 0)));
  return (
    <div className="painel">
      <header className="topo">
        <div>
          <strong>🦖 Painel</strong> <span>{nome}</span>
        </div>
        <Link className="link" href="/">
          Voltar ao chat
        </Link>
      </header>

      <section className="bloco">
        <h2>Saldos de hoje</h2>
        <p className="destaque">{reais(p.saldoTotal)}</p>
        <ul className="lista">
          {p.saldos.map((s) => (
            <li key={s.conta}>
              <span>{s.conta}</span>
              <span className={s.valor < 0 ? "negativo" : ""}>{reais(s.valor)}</span>
            </li>
          ))}
        </ul>
        {p.saldos.length === 0 && <p className="vazio">Nenhum lançamento até hoje.</p>}
      </section>

      <section className="bloco">
        <h2>Cartões</h2>
        {p.cartoes.length === 0 && <p className="vazio">Nenhum cartão cadastrado.</p>}
        {p.cartoes.map((c) => (
          <div key={c.nome} className="cartao-credito">
            <div className="linha-titulo">
              <strong>💳 {c.nome}</strong>
              {c.faturas[0] ? (
                <span>
                  Próxima fatura ({mesCurto(c.faturas[0].mes)}): <b>{reais(c.faturas[0].valor)}</b>
                </span>
              ) : (
                <span>Sem fatura em aberto</span>
              )}
            </div>
            {c.limite ? (
              <>
                <div className="barra">
                  <div
                    className={`preenchido${c.emAberto > c.limite ? " estourou" : ""}`}
                    style={{ width: `${Math.min(100, (c.emAberto / c.limite) * 100)}%` }}
                  />
                </div>
                <div className="legenda">
                  <span>Usado {reais(c.emAberto)}</span>
                  <span className={c.disponivel! < 0 ? "negativo" : ""}>
                    Disponível <b>{reais(c.disponivel!)}</b> de {reais(c.limite)}
                  </span>
                </div>
              </>
            ) : (
              <p className="vazio">
                Em aberto {reais(c.emAberto)}. Para ver o limite livre, mande no chat: <i>limite {c.nome} 5000</i>.
              </p>
            )}
            {c.faturas.length > 1 && (
              <ul className="lista pequena">
                {c.faturas.map((f) => (
                  <li key={f.mes}>
                    <span>Fatura de {mesCurto(f.mes)}</span>
                    <span>{reais(f.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <nav className="meses">
        {p.mesAnterior ? <Link href={`/painel?mes=${p.mesAnterior}`}>‹ {mesCurto(p.mesAnterior)}</Link> : <span />}
        <strong>{nomeDoMes(p.mes)}</strong>
        {p.mesSeguinte ? <Link href={`/painel?mes=${p.mesSeguinte}`}>{mesCurto(p.mesSeguinte)} ›</Link> : <span />}
      </nav>

      <section className="bloco">
        <h2>Fluxo do mês</h2>
        <div className="resumo-mes">
          <span>
            Entrou <b className="positivo">{reais(p.entradasMes)}</b>
          </span>
          <span>
            Saiu <b className="negativo">{reais(p.saidasMes)}</b>
          </span>
        </div>
        <Cascata degraus={p.cascata} />
        {p.temPrevistosNoMes && <p className="vazio">Inclui o que ainda vai acontecer neste mês (previstos e faturas a vencer). Transferências entre suas contas não contam como entrada nem saída.</p>}
      </section>

      <section className="bloco">
        <h2>Como o dinheiro foi gasto</h2>
        {p.gastos.length === 0 && <p className="vazio">Nenhum gasto neste mês.</p>}
        <ul className="gastos">
          {p.gastos.map((g) => (
            <li key={g.despesa}>
              <div className="linha-titulo">
                <span>{g.despesa}</span>
                <span>
                  <b>{reais(g.valor)}</b>
                  {g.meta ? ` de ${reais(g.meta)}` : ""}
                </span>
              </div>
              <div className="barra fina">
                <div
                  className={`preenchido${g.meta && g.valor > g.meta ? " estourou" : ""}`}
                  style={{ width: `${(g.valor / maiorGasto) * 100}%` }}
                />
                {g.meta && <div className="marca-meta" style={{ left: `${(g.meta / maiorGasto) * 100}%` }} />}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
