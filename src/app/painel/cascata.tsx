"use client";

import { useState } from "react";
import type { Barra } from "@/lib/painel";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/** Marcas da escala: o zero e alguns valores redondos entre o menor e o maior saldo. */
function marcas(min: number, max: number): number[] {
  const faixa = max - min || 1;
  const bruto = faixa / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((x) => x >= bruto) ?? bruto;
  const lista: number[] = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) lista.push(Math.round(v * 100) / 100);
  return lista;
}

const escala = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/**
 * Cascata no tempo: cada barra é um dia ou uma semana e começa onde a anterior terminou.
 * A linha é o saldo; depois de "hoje" as barras ficam claras (previsão); abaixo de zero fica vermelho.
 * A escala de valores fica numa linha ao lado e, ao tocar numa barra, o detalhe dela aparece embaixo.
 */
export function CascataNoTempo({ barras, hojeIndice }: { barras: Barra[]; hojeIndice: number }) {
  const [escolhida, escolher] = useState<number | undefined>();
  const W = 640;
  const H = 260;
  const topo = 24;
  const base = 26;
  const esq = 76;
  const area = W - esq;
  const valores = [0, ...barras.flatMap((b) => [b.saldoInicial, b.saldoFinal])];
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const faixa = max - min || 1;
  const y = (v: number) => topo + ((max - v) / faixa) * (H - topo - base);
  const largura = area / Math.max(1, barras.length);
  const meses: { x: number; rotulo: string }[] = [];
  barras.forEach((b, i) => {
    const mes = b.inicio.slice(0, 7);
    if (i === 0 || barras[i - 1].inicio.slice(0, 7) !== mes) meses.push({ x: i * largura, rotulo: mesCurto(mes) });
  });

  const mostrada = escolhida ?? (hojeIndice >= 0 ? hojeIndice : barras.length - 1);
  const b = barras[mostrada];

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="tempo" role="img" aria-label="Saldo ao longo do tempo">
        {marcas(min, max).map((v) => (
          <g key={v}>
            <line x1={esq - 6} x2={W} y1={y(v)} y2={y(v)} className={v === 0 ? "linha-zero" : "linha-grade"} />
            <text x={esq - 10} y={y(v) + 6} textAnchor="end" className={`texto-escala${v < 0 ? " negativo" : ""}`}>
              {escala(v)}
            </text>
          </g>
        ))}
        <line x1={esq - 6} x2={esq - 6} y1={topo - 6} y2={H - base} className="eixo-valores" />
        <g transform={`translate(${esq} 0)`}>
          {min < 0 && <rect x={0} y={y(0)} width={area} height={H - base - y(0)} className="area-negativa" />}
          {barras.map((barra, i) => {
            const sobe = barra.saldoFinal >= barra.saldoInicial;
            return (
              <rect
                key={i}
                x={i * largura + largura * 0.12}
                y={y(Math.max(barra.saldoInicial, barra.saldoFinal))}
                width={largura * 0.76}
                height={Math.max(1.5, Math.abs(y(barra.saldoInicial) - y(barra.saldoFinal)))}
                rx={1.5}
                className={`${sobe ? "sobe" : "desce"}${barra.futuro ? " previsto" : ""}`}
              />
            );
          })}
          <polyline className="linha-saldo" points={barras.map((barra, i) => `${(i + 1) * largura},${y(barra.saldoFinal)}`).join(" ")} />
          {hojeIndice >= 0 && (
            <>
              <line x1={(hojeIndice + 1) * largura} x2={(hojeIndice + 1) * largura} y1={0} y2={H - base} className="linha-hoje" />
              <text x={(hojeIndice + 1) * largura + 4} y={11} className="texto-hoje">
                hoje
              </text>
            </>
          )}
          {mostrada >= 0 && <rect x={mostrada * largura} y={0} width={largura} height={H - base} className="coluna-escolhida" />}
          {meses.map((m) => (
            <text key={m.x} x={m.x + 2} y={H - 8} className="texto-eixo">
              {m.rotulo}
            </text>
          ))}
          {barras.map((_, i) => (
            <rect key={`t${i}`} x={i * largura} y={0} width={largura} height={H - base} className="toque" onClick={() => escolher(i)} />
          ))}
        </g>
      </svg>
      {b && (
        <p className="detalhe-barra">
          <b>
            {diaMes(b.inicio)}
            {b.fim !== b.inicio ? ` a ${diaMes(b.fim)}` : ""}
            {b.futuro ? " (previsto)" : ""}
          </b>
          : entrou {reais(b.entrou)}, saiu {reais(b.saiu)}, saldo <b>{reais(b.saldoFinal)}</b>
          {escolhida === undefined && <span className="dica-toque"> · toque numa barra para ver outro período</span>}
        </p>
      )}
    </>
  );
}
