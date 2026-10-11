import Link from "next/link";
import type { Investimento } from "@/lib/metas";
import { OPCOES_MESES, type Barra, type Divida, type Filtro, type Painel, type Saldo } from "@/lib/painel";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const curto = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const comSemana = (d: string) => `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${diaMes(d)}`;
const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1].slice(0, 3)}/${mes.slice(2, 4)}`;
const nomeDoMes = (mes: string) => {
  const nome = MESES[Number(mes.slice(5, 7)) - 1];
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${mes.slice(0, 4)}`;
};
const porcento = (v: number) => `${Math.abs(Math.round(v * 100))}%`;

/** Link do painel trocando só uma parte do filtro. */
function linkCom(f: Filtro, muda: Partial<Filtro>): string {
  const novo = { ...f, ...muda };
  const q = new URLSearchParams();
  if (novo.banco) q.set("banco", novo.banco);
  q.set("passado", String(novo.passado));
  q.set("futuro", String(novo.futuro));
  if (novo.mes) q.set("mes", novo.mes);
  return `/painel?${q.toString()}#${muda.mes !== undefined ? "gastos" : "fluxo"}`;
}

/**
 * Cascata no tempo: cada barra é um dia ou uma semana e começa onde a anterior terminou.
 * A linha é o saldo; depois de "hoje" as barras ficam claras (previsão); abaixo de zero fica vermelho.
 */
function CascataNoTempo({ barras, hojeIndice }: { barras: Barra[]; hojeIndice: number }) {
  const W = 640;
  const H = 240;
  const topo = 14;
  const base = 26;
  const valores = [0, ...barras.flatMap((b) => [b.saldoInicial, b.saldoFinal])];
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const faixa = max - min || 1;
  const y = (v: number) => topo + ((max - v) / faixa) * (H - topo - base);
  const largura = W / Math.max(1, barras.length);
  const meses: { x: number; rotulo: string }[] = [];
  barras.forEach((b, i) => {
    const mes = b.inicio.slice(0, 7);
    if (i === 0 || barras[i - 1].inicio.slice(0, 7) !== mes) meses.push({ x: i * largura, rotulo: mesCurto(mes) });
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tempo" role="img" aria-label="Saldo ao longo do tempo">
      {min < 0 && <rect x={0} y={y(0)} width={W} height={H - base - y(0)} className="area-negativa" />}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="linha-zero" />
      {barras.map((b, i) => {
        const de = b.saldoInicial;
        const ate = b.saldoFinal;
        const sobe = ate >= de;
        return (
          <rect
            key={i}
            x={i * largura + largura * 0.12}
            y={y(Math.max(de, ate))}
            width={largura * 0.76}
            height={Math.max(1.5, Math.abs(y(de) - y(ate)))}
            rx={1.5}
            className={`${sobe ? "sobe" : "desce"}${b.futuro ? " previsto" : ""}`}
          >
            <title>{`${diaMes(b.inicio)}${b.fim !== b.inicio ? ` a ${diaMes(b.fim)}` : ""}: entrou ${reais(b.entrou)}, saiu ${reais(b.saiu)}, saldo ${reais(b.saldoFinal)}`}</title>
          </rect>
        );
      })}
      <polyline className="linha-saldo" points={barras.map((b, i) => `${(i + 1) * largura},${y(b.saldoFinal)}`).join(" ")} />
      {hojeIndice >= 0 && (
        <>
          <line x1={(hojeIndice + 1) * largura} x2={(hojeIndice + 1) * largura} y1={0} y2={H - base} className="linha-hoje" />
          <text x={(hojeIndice + 1) * largura + 4} y={11} className="texto-hoje">
            hoje
          </text>
        </>
      )}
      {meses.map((m) => (
        <text key={m.x} x={m.x + 2} y={H - 8} className="texto-eixo">
          {m.rotulo}
        </text>
      ))}
      <text x={W - 2} y={y(0) - 4} textAnchor="end" className="texto-zero">
        R$ 0
      </text>
    </svg>
  );
}

function Chips({ f, campo, rotulo }: { f: Filtro; campo: "passado" | "futuro"; rotulo: string }) {
  return (
    <div className="linha-filtro">
      <b>{rotulo}</b>
      {OPCOES_MESES.map((n) => (
        <Link key={n} href={linkCom(f, { [campo]: n })} className={`chip${f[campo] === n ? " on" : ""}`} scroll={false}>
          {n} {n === 1 ? "mês" : "meses"}
        </Link>
      ))}
    </div>
  );
}

function Compromissos({ titulo, total, itens, vazio }: { titulo: string; total: number; itens: Divida[]; vazio: string }) {
  return (
    <section className="bloco">
      <h2>{titulo}</h2>
      <p className="destaque negativo">{reais(total)}</p>
      {itens.length === 0 ? (
        <p className="vazio">{vazio}</p>
      ) : (
        <ul className="lista">
          {itens.map((d) => (
            <li key={d.nome}>
              <span>
                {d.nome}
                {d.parcelas > 1 && <small>faltam {d.parcelas} parcelas</small>}
                {d.parcelas === 1 && <small>falta 1 parcela</small>}
              </span>
              <span>{reais(d.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListaDeSaldos({ titulo, saldos }: { titulo?: string; saldos: Saldo[] }) {
  if (saldos.length === 0) return null;
  return (
    <>
      {titulo && (
        <h3 className="subtitulo">
          {titulo} <span>{reais(saldos.reduce((t, s) => t + s.valor, 0))}</span>
        </h3>
      )}
      <ul className="lista">
        {saldos.map((s) => (
          <li key={s.conta}>
            <span>{s.conta}</span>
            <span className={s.valor < 0 ? "negativo" : ""}>{reais(s.valor)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function VerPainel({ nome, p, investimentos }: { nome: string; p: Painel; investimentos?: Investimento[] }) {
  const f = p.filtro;
  const hojeIndice = p.barras.findIndex((b) => b.futuro) - 1;
  const guardados = p.saldos.filter((s) => s.guardado);
  const nasContas = p.saldos.filter((s) => !s.guardado);
  const totalInvestido = investimentos?.reduce((s, i) => s + i.valor, 0) ?? 0;
  const atrasadas = p.aPagar.filter((c) => c.atrasada);

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

      <nav className="filtros" id="fluxo">
        <div className="linha-filtro">
          <b>Banco</b>
          <Link href={linkCom(f, { banco: undefined })} className={`chip${!f.banco ? " on" : ""}`} scroll={false}>
            Todos
          </Link>
          {p.bancos.map((b) => (
            <Link key={b} href={linkCom(f, { banco: b })} className={`chip${f.banco === b ? " on" : ""}`} scroll={false}>
              {b}
            </Link>
          ))}
        </div>
        <Chips f={f} campo="passado" rotulo="Passado" />
        <Chips f={f} campo="futuro" rotulo="Futuro" />
      </nav>

      <section className="bloco">
        <h2>Fluxo de caixa no tempo ({p.porDia ? "por dia" : "por semana"})</h2>
        {p.alerta ? (
          <p className="alerta">
            ⚠️ No ritmo previsto, o saldo fica <b>negativo{p.alerta.negativoEm === p.hoje ? " hoje" : ` em ${diaMes(p.alerta.negativoEm!)}`}</b>. Menor saldo:{" "}
            <b>
              {reais(p.alerta.menor.valor)} em {diaMes(p.alerta.menor.data)}
            </b>
            .{p.alerta.voltaEm ? ` Volta ao positivo em ${diaMes(p.alerta.voltaEm)}.` : " Não volta ao positivo no período."}
          </p>
        ) : (
          <p className="tudo-certo">✅ O saldo não fica negativo nos próximos {f.futuro === 1 ? "30 dias" : `${f.futuro} meses`}.</p>
        )}
        <CascataNoTempo barras={p.barras} hojeIndice={hojeIndice} />
        <div className="legenda-grafico">
          <span>
            <i className="cor sobe" />
            entrou mais
          </span>
          <span>
            <i className="cor desce" />
            saiu mais
          </span>
          <span>
            <i className="cor sobe previsto" />
            previsto
          </span>
          <span>
            <i className="cor saldo" />
            saldo
          </span>
        </div>
      </section>

      <section className="bloco">
        <h2>Contas a pagar</h2>
        {atrasadas.length > 0 && (
          <p className="alerta">
            🔴 {atrasadas.length === 1 ? "1 conta atrasada" : `${atrasadas.length} contas atrasadas`}: {reais(atrasadas.reduce((s, c) => s + c.valor, 0))}
          </p>
        )}
        {p.aPagar.length === 0 ? (
          <p className="vazio">Nada vencendo nos próximos 7 dias.</p>
        ) : (
          <ul className="lista">
            {p.aPagar.map((c, i) => (
              <li key={i} className={c.atrasada ? "atrasada" : ""}>
                <span>
                  {c.descricao}
                  {c.atrasada && <span className="tag vermelha">atrasada</span>}
                  {c.recorrente && <span className="tag">recorrente</span>}
                  <small>
                    {comSemana(c.data)}
                    {c.banco ? ` · ${c.banco}` : ""}
                  </small>
                </span>
                <b className="negativo">{reais(c.valor)}</b>
              </li>
            ))}
            <li>
              <b>Total</b>
              <b className="negativo">{reais(p.totalAPagar)}</b>
            </li>
          </ul>
        )}
        <p className="vazio">
          Saldo hoje {reais(p.saldoHoje)}. Depois dessas contas sobra <b>{reais(p.saldoHoje - p.totalAPagar)}</b>.
        </p>
      </section>

      <div className="grade">
        <section className="bloco">
          <h2>Saldos de hoje</h2>
          <p className="destaque">{reais(p.saldoHoje)}</p>
          {guardados.length > 0 ? (
            <>
              <ListaDeSaldos titulo="Nas contas" saldos={nasContas} />
              <ListaDeSaldos titulo="Guardado em caixinhas e cofrinhos" saldos={guardados} />
              <p className="vazio">O guardado conta como dinheiro disponível, porque pode ser resgatado na hora.</p>
            </>
          ) : (
            <ListaDeSaldos saldos={p.saldos} />
          )}
        </section>

        <section className="bloco">
          <h2>Cartões</h2>
          {p.cartoes.length === 0 && <p className="vazio">Nenhum cartão cadastrado.</p>}
          {p.cartoes.map((c) => (
            <div key={c.nome} className="cartao-credito">
              <strong>💳 {c.nome}</strong>
              {c.proxima ? (
                <div className="pequeno">
                  Fatura de {diaMes(c.proxima.data)}: <b>{reais(c.proxima.restante)}</b>
                  {c.antecipado > 0 && (
                    <small>
                      {" "}
                      ({reais(c.proxima.valor)} − {reais(c.antecipado)} já pagos)
                    </small>
                  )}
                </div>
              ) : (
                <div className="pequeno">Sem fatura a vencer.</div>
              )}
              {c.limite ? (
                <>
                  <div className="barra">
                    <div className={`preenchido${c.emAberto > c.limite ? " estourou" : ""}`} style={{ width: `${Math.min(100, (c.emAberto / c.limite) * 100)}%` }} />
                  </div>
                  <div className="legenda">
                    <span>Usado {reais(c.emAberto)}</span>
                    <span className={c.disponivel! < 0 ? "negativo" : ""}>
                      Livre <b>{reais(c.disponivel!)}</b> de {reais(c.limite)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="vazio">
                  Para ver o limite livre, mande no chat: <i>limite {c.nome} 1000</i>.
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="bloco">
          <h2>Investimentos</h2>
          {investimentos === undefined ? (
            <p className="vazio">Sua planilha não tem a aba Investimentos.</p>
          ) : (
            <>
              <p className="destaque">{reais(totalInvestido)}</p>
              <ul className="lista">
                {investimentos.map((i) => (
                  <li key={i.nome}>
                    <span>
                      {i.nome}
                      {(i.banco || i.tipo) && <small>{[i.tipo, i.banco].filter(Boolean).join(" · ")}</small>}
                    </span>
                    <span className={i.valor < 0 ? "negativo" : ""}>{reais(i.valor)}</span>
                  </li>
                ))}
              </ul>
              <p className="vazio">
                Valor atualizado da aba Investimentos.
                {guardados.length > 0 ? " Caixinhas e cofrinhos aparecem também em Saldos de hoje." : " Não entra no saldo acima."}
              </p>
            </>
          )}
        </section>

        <Compromissos titulo="Dívidas" total={p.totalDividas} itens={p.dividas} vazio="Nenhum empréstimo, financiamento ou dívida a pagar." />
        <Compromissos
          titulo="Parcelamentos"
          total={p.totalParcelamentos}
          itens={p.parcelamentos}
          vazio="Nenhuma compra ou serviço parcelado a vencer."
        />
      </div>

      <section className="bloco" id="gastos">
        <div className="meses">
          <Link href={linkCom(f, { mes: p.gastos.mesAnterior })} scroll={false}>
            ‹ {mesCurto(p.gastos.mesAnterior)}
          </Link>
          <h2>Gastos de {nomeDoMes(p.gastos.mes).toLowerCase()}</h2>
          {p.gastos.mesSeguinte ? (
            <Link href={linkCom(f, { mes: p.gastos.mesSeguinte })} scroll={false}>
              {mesCurto(p.gastos.mesSeguinte)} ›
            </Link>
          ) : (
            <span />
          )}
        </div>
        {p.gastos.itens.length === 0 ? (
          <p className="vazio">Nenhum gasto neste mês nem no anterior.</p>
        ) : (
          <table className="comparacao">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>{mesCurto(p.gastos.mesAnterior)}</th>
                <th>{mesCurto(p.gastos.mes)}</th>
                <th>Variação</th>
              </tr>
            </thead>
            <tbody>
              {p.gastos.itens.map((g) => (
                <tr key={g.despesa}>
                  <td>
                    {g.despesa}
                    {g.meta && (
                      <small className={g.atual > g.meta ? "negativo" : ""}>
                        meta {reais(g.meta)}
                      </small>
                    )}
                  </td>
                  <td>{g.anterior ? curto(g.anterior) : "—"}</td>
                  <td>{g.atual ? curto(g.atual) : "—"}</td>
                  <td className={g.variacao === undefined ? "" : g.variacao > 0 ? "negativo" : "positivo"}>
                    {g.variacao === undefined ? "novo" : g.variacao === 0 ? "=" : `${g.variacao > 0 ? "▲" : "▼"} ${porcento(g.variacao)}`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{curto(p.gastos.totalAnterior)}</td>
                <td>{curto(p.gastos.totalAtual)}</td>
                <td className={p.gastos.totalAtual > p.gastos.totalAnterior ? "negativo" : "positivo"}>
                  {p.gastos.totalAnterior > 0
                    ? `${p.gastos.totalAtual > p.gastos.totalAnterior ? "▲" : "▼"} ${porcento((p.gastos.totalAtual - p.gastos.totalAnterior) / p.gastos.totalAnterior)}`
                    : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="vazio">O mês atual inclui o que ainda está previsto. Transferências entre contas e pagamento de fatura não contam como gasto.</p>
      </section>
    </div>
  );
}
