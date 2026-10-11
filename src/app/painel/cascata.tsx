"use client";

import { useState } from "react";
import type { Barra } from "@/lib/painel";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/**
 * Cascata no tempo: cada barra é um dia ou uma semana e começa onde a anterior terminou.
 * A linha é o saldo; depois de "hoje" as barras ficam claras (previsão); abaixo de zero fica vermelho.
 * Os valores aparecem escritos (hoje, menor saldo e fim do período) e, ao tocar numa barra, o detalhe dela.
 */
export function CascataNoTempo({ barras, hojeIndice }: { barras: Barra[]; hojeIndice: number }) {
  const [escolhida, escolher] = useState<number | undefined>();
  const W = 640;
  const H = 260;
  const topo = 24;
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

  // Pontos com o valor do saldo escrito: hoje, o menor saldo e o último.
  const indiceMenor = barras.reduce((m, b, i) => (b.saldoFinal < barras[m].saldoFinal ? i : m), 0);
  // Sem escrever um valor em cima do outro: só entra se ficar longe dos já escolhidos.
  const rotulados: number[] = [];
  for (const i of [hojeIndice, indiceMenor, barras.length - 1]) {
    if (i >= 0 && i < barras.length && rotulados.every((j) => Math.abs(i - j) * largura > 110)) rotulados.push(i);
  }

  const mostrada = escolhida ?? (hojeIndice >= 0 ? hojeIndice : barras.length - 1);
  const b = barras[mostrada];

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="tempo" role="img" aria-label="Saldo ao longo do tempo">
        {min < 0 && <rect x={0} y={y(0)} width={W} height={H - base - y(0)} className="area-negativa" />}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="linha-zero" />
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
        {rotulados.map((i) => {
          const x = (i + 1) * largura;
          const direita = x > W - 150;
          return (
            <g key={`v${i}`}>
              <circle cx={x} cy={y(barras[i].saldoFinal)} r={3.5} className="ponto-saldo" />
              <text
                x={direita ? x - 6 : x + 6}
                y={y(barras[i].saldoFinal) + (barras[i].saldoFinal >= 0 ? -10 : 24)}
                textAnchor={direita ? "end" : "start"}
                className={`texto-valor${barras[i].saldoFinal < 0 ? " negativo" : ""}`}
              >
                {reais(barras[i].saldoFinal)}
              </text>
            </g>
          );
        })}
        {meses.map((m) => (
          <text key={m.x} x={m.x + 2} y={H - 8} className="texto-eixo">
            {m.rotulo}
          </text>
        ))}
        <text x={W - 2} y={y(0) - 4} textAnchor="end" className="texto-zero">
          R$ 0
        </text>
        {barras.map((_, i) => (
          <rect key={`t${i}`} x={i * largura} y={0} width={largura} height={H - base} className="toque" onClick={() => escolher(i)} />
        ))}
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
