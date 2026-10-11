import type { Cartao } from "./config";

/** Datas trafegam como "AAAA-MM-DD" para não sofrer com fuso horário. */
export type DataISO = string;

export function hojeEmSaoPaulo(agora = new Date()): DataISO {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

function partes(data: DataISO): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`Data inválida: ${data}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Monta uma data limitando o dia ao último dia do mês (ex.: dia 31 em fevereiro vira 28/29). */
function montar(ano: number, mes: number, dia: number): DataISO {
  while (mes > 12) {
    mes -= 12;
    ano += 1;
  }
  const d = Math.min(dia, diasNoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function dataValida(data: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && d >= 1 && d <= diasNoMes(a, mes);
}

export function paraPlanilha(data: DataISO): string {
  const [a, m, d] = partes(data);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

/**
 * Data em que a compra no cartão sai do caixa: o vencimento da fatura em que ela cai.
 * Compra feita no dia do fechamento ou depois já entra na fatura seguinte.
 * `parcela` começa em 1; cada parcela seguinte vence um mês depois.
 */
export function vencimentoDaParcela(compra: DataISO, cartao: Cartao, parcela = 1): DataISO {
  const [ano, mes, dia] = partes(compra);
  // Mês em que a fatura dessa compra fecha
  const mesFechamento = dia >= cartao.fechamento ? mes + 1 : mes;
  // Se o vencimento é num dia menor ou igual ao fechamento, ele cai no mês seguinte ao fechamento
  let mesVencimento = cartao.vencimento > cartao.fechamento ? mesFechamento : mesFechamento + 1;
  mesVencimento += parcela - 1;
  return montar(ano, mesVencimento, cartao.vencimento);
}

/** Data da n-ésima parcela de algo pago fora do cartão (boleto, carnê, pix parcelado): mesmo dia, meses seguintes. */
export function dataDaParcelaMensal(primeira: DataISO, parcela: number): DataISO {
  const [ano, mes, dia] = partes(primeira);
  return montar(ano, mes + parcela - 1, dia);
}
