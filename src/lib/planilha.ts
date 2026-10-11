import { google, type sheets_v4 } from "googleapis";
import { exigirEnv, type Usuario } from "./config";
import { categoriasDoHistorico, exemplosDoHistorico, lerCategorias, type Categoria } from "./categorias";
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

export interface ContextoPlanilha {
  categorias: Categoria[];
  /** "Estabelecimento → Despesa" dos lançamentos recentes, para a IA seguir o padrão da pessoa. */
  exemplos: string[];
}

/** Categorias da aba Contas, mais as que a pessoa já usa no fluxo, e exemplos recentes de classificação. */
export async function buscarContexto(usuario: Usuario): Promise<ContextoPlanilha> {
  const res = await cliente().spreadsheets.values.batchGet({
    spreadsheetId: usuario.planilhaId,
    ranges: [`${aba(usuario.abaCategorias)}!A:C`, `${aba(usuario.abaFluxo)}!B1:E${LIMITE_LINHAS}`],
  });
  const [contas, fluxo] = (res.data.valueRanges ?? []).map((v) => (v.values ?? []) as string[][]);
  const daAba = lerCategorias(contas ?? []);
  return {
    categorias: [...daAba, ...categoriasDoHistorico(fluxo ?? [], daAba)],
    exemplos: exemplosDoHistorico(fluxo ?? []),
  };
}

/**
 * Linha logo abaixo do último lançamento (última linha com DATA ou DESPESA preenchida).
 * Linhas vazias no meio ou no topo são ignoradas, para o lançamento novo ir sempre para o fim.
 * As colunas TIPO (B) e CAIXA (I) podem ter fórmulas puxadas para baixo, então não contam.
 */
export function proximaLinhaVazia(colA: string[][], colC: string[][]): number {
  const total = Math.max(colA.length, colC.length);
  for (let i = total - 1; i >= 1; i--) {
    const a = colA[i]?.[0]?.toString().trim() ?? "";
    const c = colC[i]?.[0]?.toString().trim() ?? "";
    if (a || c) return i + 2;
  }
  return 2;
}

/**
 * O que gravar em TIPO (B) e CAIXA (I) de uma linha nova.
 * Se a planilha já tem fórmula ali (como na planilha modelo), não mexemos.
 * Se está vazio (planilhas em que a pessoa digita o TIPO), preenchemos o TIPO e a fórmula do saldo acumulado.
 */
export function complementos(n: number, tipo: string, atualB: string, atualI: string): { b?: string; i?: string } {
  const r: { b?: string; i?: string } = {};
  if (!atualB.trim()) r.b = tipo;
  if (!atualI.trim()) r.i = n <= 2 ? `=H${n}` : `=H${n}+I${n - 1}`;
  return r;
}

/**
 * Grava as linhas no fluxo de caixa, preenchendo DATA e as colunas C a H.
 * TIPO (B) e CAIXA (I) ficam com as fórmulas da planilha. Devolve os números das linhas usadas.
 */
export interface Gravacao {
  linhas: number[];
  /** true se o robô também preencheu TIPO e CAIXA (planilha sem fórmula nessas colunas). */
  extras: boolean;
}

export async function gravarNoFluxo(usuario: Usuario, linhas: LinhaFluxo[]): Promise<Gravacao> {
  const sheets = cliente();
  const range = (col: string) => `${aba(usuario.abaFluxo)}!${col}1:${col}${LIMITE_LINHAS}`;
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: usuario.planilhaId,
    ranges: [range("A"), range("C")],
  });
  const [colA, colC] = (res.data.valueRanges ?? []).map((v) => (v.values ?? []) as string[][]);
  const primeira = proximaLinhaVazia(colA ?? [], colC ?? []);
  const ultima = primeira + linhas.length - 1;

  // Fórmulas já existentes em TIPO e CAIXA nas linhas que vamos usar
  const atuais = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: usuario.planilhaId,
    ranges: [`${aba(usuario.abaFluxo)}!B${primeira}:B${ultima}`, `${aba(usuario.abaFluxo)}!I${primeira}:I${ultima}`],
    valueRenderOption: "FORMULA",
  });
  const [colB, colI] = (atuais.data.valueRanges ?? []).map((v) => (v.values ?? []) as string[][]);

  const usadas: number[] = [];
  let extras = false;
  const data: sheets_v4.Schema$ValueRange[] = [];
  linhas.forEach((linha, k) => {
    const n = primeira + k;
    usadas.push(n);
    data.push(
      { range: `${aba(usuario.abaFluxo)}!A${n}`, values: [[linha.data]] },
      {
        range: `${aba(usuario.abaFluxo)}!C${n}:H${n}`,
        values: [[linha.despesa, linha.descricao, linha.nome, linha.pagoCom, linha.banco, linha.valor]],
      },
    );
    const extra = complementos(n, linha.categoria.tipo, String(colB?.[k]?.[0] ?? ""), String(colI?.[k]?.[0] ?? ""));
    if (extra.b !== undefined || extra.i !== undefined) extras = true;
    if (extra.b !== undefined) data.push({ range: `${aba(usuario.abaFluxo)}!B${n}`, values: [[extra.b]] });
    if (extra.i !== undefined) data.push({ range: `${aba(usuario.abaFluxo)}!I${n}`, values: [[extra.i]] });
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
  return { linhas: usadas, extras };
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
    range: `${ABA_LOG}!A1:G1`,
    valueInputOption: "RAW",
    requestBody: { values: [["quando", "mensagem_id", "aba", "linhas", "resumo", "desfeito", "tipo_e_caixa"]] },
  });
}

interface RegistroLog {
  linhaLog: number;
  mensagemId: string;
  aba: string;
  linhas: number[];
  desfeito: boolean;
  extras: boolean;
}

async function lerLog(usuario: Usuario): Promise<RegistroLog[]> {
  await garantirAbaLog(usuario);
  const res = await cliente().spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${ABA_LOG}!A:G`,
  });
  return ((res.data.values ?? []) as string[][]).slice(1).map((l, i) => ({
    linhaLog: i + 2,
    mensagemId: l[1] ?? "",
    aba: l[2] ?? "",
    linhas: (l[3] ?? "").split(",").filter(Boolean).map(Number),
    desfeito: (l[5] ?? "") === "sim",
    extras: (l[6] ?? "") === "sim",
  }));
}

/** O WhatsApp pode reenviar a mesma mensagem; usamos o log para não lançar duas vezes. */
export async function jaProcessada(usuario: Usuario, mensagemId: string): Promise<boolean> {
  return (await lerLog(usuario)).some((r) => r.mensagemId === mensagemId);
}

export async function registrarNoLog(
  usuario: Usuario,
  mensagemId: string,
  gravacao: Gravacao,
  resumo: string,
): Promise<void> {
  await garantirAbaLog(usuario);
  await cliente().spreadsheets.values.append({
    spreadsheetId: usuario.planilhaId,
    range: `${ABA_LOG}!A:G`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [new Date().toISOString(), mensagemId, usuario.abaFluxo, gravacao.linhas.join(","), resumo, "", gravacao.extras ? "sim" : ""],
      ],
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
      // Só limpa TIPO e CAIXA se foi o robô que preencheu; senão são fórmulas da planilha.
      ranges: ultimo.linhas.flatMap((n) =>
        ultimo.extras ? [`${aba(ultimo.aba)}!A${n}:I${n}`] : [`${aba(ultimo.aba)}!A${n}`, `${aba(ultimo.aba)}!C${n}:H${n}`],
      ),
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
