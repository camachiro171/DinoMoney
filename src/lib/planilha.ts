import { google, type sheets_v4 } from "googleapis";
import { exigirEnv, type Usuario } from "./config";
import { lerCategorias, type Categoria } from "./categorias";
import type { LinhaFluxo } from "./lancamentos";

const ABA_LOG = "DinoMoney_log";
/** Até onde procuramos a próxima linha vazia do fluxo. */
const LIMITE_LINHAS = 5000;

let clienteCache: sheets_v4.Sheets | undefined;

function cliente(): sheets_v4.Sheets {
  if (!clienteCache) {
    const credenciais = JSON.parse(exigirEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
    const auth = new google.auth.GoogleAuth({
      credentials: credenciais,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    clienteCache = google.sheets({ version: "v4", auth });
  }
  return clienteCache;
}

function aba(nome: string): string {
  return `'${nome.replace(/'/g, "''")}'`;
}

export async function buscarCategorias(usuario: Usuario): Promise<Categoria[]> {
  const res = await cliente().spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(usuario.abaCategorias)}!A:C`,
  });
  return lerCategorias((res.data.values ?? []) as string[][]);
}

/**
 * Primeira linha (número da planilha, 1 = cabeçalho) sem DATA e sem DESPESA.
 * As colunas TIPO (B) e CAIXA (I) são fórmulas já puxadas para baixo, então não contam.
 */
export function proximaLinhaVazia(colA: string[][], colC: string[][], aPartirDe = 2): number {
  const total = Math.max(colA.length, colC.length);
  for (let i = aPartirDe - 1; i < total; i++) {
    const a = colA[i]?.[0]?.toString().trim() ?? "";
    const c = colC[i]?.[0]?.toString().trim() ?? "";
    if (!a && !c) return i + 1;
  }
  return Math.max(total + 1, aPartirDe);
}

/**
 * Grava as linhas no fluxo de caixa, preenchendo DATA e as colunas C a H.
 * TIPO (B) e CAIXA (I) ficam com as fórmulas da planilha. Devolve os números das linhas usadas.
 */
export async function gravarNoFluxo(usuario: Usuario, linhas: LinhaFluxo[]): Promise<number[]> {
  const sheets = cliente();
  const range = (col: string) => `${aba(usuario.abaFluxo)}!${col}1:${col}${LIMITE_LINHAS}`;
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: usuario.planilhaId,
    ranges: [range("A"), range("C")],
  });
  const [colA, colC] = (res.data.valueRanges ?? []).map((v) => (v.values ?? []) as string[][]);

  const usadas: number[] = [];
  const data: sheets_v4.Schema$ValueRange[] = [];
  let proxima = 2;
  for (const linha of linhas) {
    const n = proximaLinhaVazia(colA ?? [], colC ?? [], proxima);
    usadas.push(n);
    proxima = n + 1;
    data.push(
      { range: `${aba(usuario.abaFluxo)}!A${n}`, values: [[linha.data]] },
      {
        range: `${aba(usuario.abaFluxo)}!C${n}:H${n}`,
        values: [[linha.despesa, linha.descricao, linha.nome, linha.pagoCom, linha.banco, linha.valor]],
      },
    );
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
  return usadas;
}

async function garantirAbaLog(usuario: Usuario): Promise<void> {
  const sheets = cliente();
  const info = await sheets.spreadsheets.get({
    spreadsheetId: usuario.planilhaId,
    fields: "sheets.properties.title",
  });
  if (info.data.sheets?.some((s) => s.properties?.title === ABA_LOG)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: { requests: [{ addSheet: { properties: { title: ABA_LOG, hidden: true } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: usuario.planilhaId,
    range: `${ABA_LOG}!A1:F1`,
    valueInputOption: "RAW",
    requestBody: { values: [["quando", "mensagem_id", "aba", "linhas", "resumo", "desfeito"]] },
  });
}

interface RegistroLog {
  linhaLog: number;
  mensagemId: string;
  aba: string;
  linhas: number[];
  desfeito: boolean;
}

async function lerLog(usuario: Usuario): Promise<RegistroLog[]> {
  await garantirAbaLog(usuario);
  const res = await cliente().spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${ABA_LOG}!A:F`,
  });
  return ((res.data.values ?? []) as string[][]).slice(1).map((l, i) => ({
    linhaLog: i + 2,
    mensagemId: l[1] ?? "",
    aba: l[2] ?? "",
    linhas: (l[3] ?? "").split(",").filter(Boolean).map(Number),
    desfeito: (l[5] ?? "") === "sim",
  }));
}

/** O WhatsApp pode reenviar a mesma mensagem; usamos o log para não lançar duas vezes. */
export async function jaProcessada(usuario: Usuario, mensagemId: string): Promise<boolean> {
  return (await lerLog(usuario)).some((r) => r.mensagemId === mensagemId);
}

export async function registrarNoLog(
  usuario: Usuario,
  mensagemId: string,
  linhas: number[],
  resumo: string,
): Promise<void> {
  await garantirAbaLog(usuario);
  await cliente().spreadsheets.values.append({
    spreadsheetId: usuario.planilhaId,
    range: `${ABA_LOG}!A:F`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[new Date().toISOString(), mensagemId, usuario.abaFluxo, linhas.join(","), resumo, ""]],
    },
  });
}

/** Apaga o último lote lançado pelo DinoMoney. Devolve quantas linhas foram limpas. */
export async function desfazerUltimo(usuario: Usuario): Promise<number> {
  const registros = (await lerLog(usuario)).filter((r) => !r.desfeito && r.linhas.length > 0);
  const ultimo = registros.at(-1);
  if (!ultimo) return 0;
  const sheets = cliente();
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: usuario.planilhaId,
    requestBody: {
      ranges: ultimo.linhas.flatMap((n) => [`${aba(ultimo.aba)}!A${n}`, `${aba(ultimo.aba)}!C${n}:H${n}`]),
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: usuario.planilhaId,
    range: `${ABA_LOG}!F${ultimo.linhaLog}`,
    valueInputOption: "RAW",
    requestBody: { values: [["sim"]] },
  });
  return ultimo.linhas.length;
}
