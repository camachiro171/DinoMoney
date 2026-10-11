import type { Usuario } from "./config";
import { dataComparavel, type LinhaFluxo } from "./lancamentos";
import { numeroBR, type LinhaDoFluxo } from "./metas";
import { aba, cliente } from "./planilha";
import { paraPlanilha, type DataISO } from "./datas";

/**
 * Lançamentos previstos: ficam no próprio fluxo de caixa, com a descrição começando por "[previsto]".
 * Contas recorrentes (aluguel, salário, assinaturas) geram previstos para os próximos meses, e quando
 * o lançamento de verdade chega ele toma o lugar do previsto do mesmo mês.
 */

export const MARCA_PREVISTO = "[previsto] ";
export const MESES_PROJETADOS = 3;
export const ABA_RECORRENTES = "Recorrentes";
const CABECALHO_RECORRENTES = ["Descrição", "Despesa", "Nome", "Pago com", "Banco", "Valor", "Dia do mês"];

const comparavel = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export const ehPrevisto = (descricao: string) => descricao.trim().toLowerCase().startsWith(MARCA_PREVISTO.trim());
const semMarca = (descricao: string) => (ehPrevisto(descricao) ? descricao.trim().slice(MARCA_PREVISTO.trim().length).trim() : descricao);

function somarMeses(data: DataISO, meses: number, dia: number): DataISO {
  const [a, m] = data.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Marca como previsto o que ainda vai acontecer (data depois de hoje). */
export function marcarPrevisto(linha: LinhaFluxo, hoje: DataISO): LinhaFluxo {
  if (linha.dataISO <= hoje || ehPrevisto(linha.descricao)) return linha;
  return { ...linha, descricao: MARCA_PREVISTO + linha.descricao };
}

/** As próximas ocorrências de uma conta recorrente, depois da data do lançamento, até MESES_PROJETADOS à frente de hoje. */
export function projetar(linha: LinhaFluxo, dia: number, hoje: DataISO): LinhaFluxo[] {
  const limite = somarMeses(hoje, MESES_PROJETADOS, 31);
  const futuras: LinhaFluxo[] = [];
  for (let k = 1; k <= 24; k++) {
    const dataISO = somarMeses(linha.dataISO, k, dia);
    if (dataISO > limite) break;
    if (dataISO <= hoje) continue;
    futuras.push({ ...linha, dataISO, data: paraPlanilha(dataISO), descricao: MARCA_PREVISTO + semMarca(linha.descricao) });
  }
  return futuras;
}

/**
 * O previsto que um lançamento real substitui: mesmo mês, mesma despesa, mesmo sentido (entrada ou saída)
 * e valor parecido (até 30% de diferença). Contas de luz e água variam um pouco de um mês para outro.
 */
export function acharPrevisto(previstos: LinhaDoFluxo[], real: LinhaFluxo): LinhaDoFluxo | undefined {
  return previstos.find(
    (p) =>
      p.data.slice(0, 7) === real.dataISO.slice(0, 7) &&
      comparavel(p.despesa) === comparavel(real.despesa) &&
      Math.sign(p.valor) === Math.sign(real.valor) &&
      Math.abs(Math.abs(p.valor) - Math.abs(real.valor)) <= 0.3 * Math.abs(p.valor),
  );
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Texto do comando "previsão": saldo de hoje e, para este mês e os próximos, o que ainda entra e sai. */
export function resumirPrevisao(fluxo: LinhaDoFluxo[], hoje: DataISO): string {
  let saldo = fluxo.filter((l) => l.data <= hoje).reduce((s, l) => s + l.valor, 0);
  const linhas = [`📈 Previsão do seu caixa`, `Saldo hoje: *${reais(saldo)}*`, ""];
  for (let k = 0; k <= MESES_PROJETADOS; k++) {
    const mes = somarMeses(hoje, k, 1).slice(0, 7);
    const doMes = fluxo.filter((l) => l.data > hoje && l.data.startsWith(mes));
    const entra = doMes.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
    const sai = doMes.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0);
    saldo += entra - sai;
    const [a, m] = mes.split("-").map(Number);
    const nome = `${NOMES_MES[m - 1]}/${String(a).slice(2)}${k === 0 ? " (resto do mês)" : ""}`;
    linhas.push(`*${nome}*: entra ${reais(entra)}, sai ${reais(sai)} → saldo ${reais(saldo)}${saldo < 0 ? " ⚠️" : ""}`);
  }
  linhas.push("", "Conta só o que já está na planilha: parcelas, contas recorrentes e lançamentos com data futura.");
  return linhas.join("\n");
}

export interface Recorrente {
  descricao: string;
  despesa: string;
  valor: number;
  dia: number;
}

async function garantirAbaRecorrentes(usuario: Usuario): Promise<void> {
  const sheets = cliente();
  const info = await sheets.spreadsheets.get({ spreadsheetId: usuario.planilhaId, fields: "sheets.properties.title" });
  if (info.data.sheets?.some((s) => s.properties?.title === ABA_RECORRENTES)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: { requests: [{ addSheet: { properties: { title: ABA_RECORRENTES } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_RECORRENTES)}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [CABECALHO_RECORRENTES] },
  });
}

export async function cadastrarRecorrente(usuario: Usuario, linha: LinhaFluxo, dia: number): Promise<void> {
  await garantirAbaRecorrentes(usuario);
  await cliente().spreadsheets.values.append({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_RECORRENTES)}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[semMarca(linha.descricao), linha.despesa, linha.nome, linha.pagoCom, linha.banco, linha.valor, dia]] },
  });
}

export async function lerRecorrentes(usuario: Usuario): Promise<Recorrente[]> {
  try {
    const res = await cliente().spreadsheets.values.get({
      spreadsheetId: usuario.planilhaId,
      range: `${aba(ABA_RECORRENTES)}!A2:G`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return ((res.data.values ?? []) as unknown[][])
      .map((l) => ({ descricao: String(l[0] ?? "").trim(), despesa: String(l[1] ?? "").trim(), valor: numeroBR(l[5]), dia: Number(l[6]) }))
      .filter((r) => r.descricao || r.despesa);
  } catch {
    return []; // planilha sem a aba Recorrentes
  }
}

/**
 * Tira uma conta recorrente (pela descrição ou pela despesa) e apaga os previstos dela no fluxo.
 * Devolve a descrição removida, ou undefined se não achou.
 */
export async function removerRecorrente(usuario: Usuario, nome: string): Promise<string | undefined> {
  const sheets = cliente();
  const info = await sheets.spreadsheets.get({ spreadsheetId: usuario.planilhaId, fields: "sheets.properties" });
  const sheetId = info.data.sheets?.find((s) => s.properties?.title === ABA_RECORRENTES)?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return undefined;
  const recorrentes = await lerRecorrentes(usuario);
  const alvo = comparavel(nome);
  const i = recorrentes.findIndex((r) => comparavel(r.descricao).includes(alvo) || comparavel(r.despesa) === alvo);
  if (i < 0) return undefined;
  const r = recorrentes[i];
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: i + 1, endIndex: i + 2 } } }] },
  });
  // Limpa os previstos dessa conta que ainda estão no fluxo.
  const fluxo = await sheets.spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(usuario.abaFluxo)}!A2:H5000`,
  });
  const ranges = ((fluxo.data.values ?? []) as unknown[][]).flatMap((l, k) => {
    const descricao = String(l[3] ?? "");
    const ok = ehPrevisto(descricao) && comparavel(semMarca(descricao)) === comparavel(r.descricao) && comparavel(String(l[2] ?? "")) === comparavel(r.despesa);
    return ok ? [`${aba(usuario.abaFluxo)}!A${k + 2}`, `${aba(usuario.abaFluxo)}!C${k + 2}:H${k + 2}`] : [];
  });
  if (ranges.length) await sheets.spreadsheets.values.batchClear({ spreadsheetId: usuario.planilhaId, requestBody: { ranges } });
  return r.descricao;
}

/** Escreve um lançamento real por cima de um previsto (colunas A e C a H). */
export async function substituirPrevisto(usuario: Usuario, numeroLinha: number, linha: LinhaFluxo): Promise<void> {
  await cliente().spreadsheets.values.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${aba(usuario.abaFluxo)}!A${numeroLinha}`, values: [[linha.data]] },
        {
          range: `${aba(usuario.abaFluxo)}!C${numeroLinha}:H${numeroLinha}`,
          values: [[linha.despesa, linha.descricao, linha.nome, linha.pagoCom, linha.banco, linha.valor]],
        },
      ],
    },
  });
}

export { dataComparavel };
