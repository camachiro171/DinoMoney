import {
  carregarUsuarios,
  encontrarUsuario,
  encontrarUsuarioPorCodigo,
  normalizarTelefone,
  type Cartao,
  type Usuario,
} from "./config";
import { numeroBR } from "./metas";
import { aba, cliente } from "./planilha";

/**
 * Cadastro dos mentorados e das contas de cada um, guardado em planilhas:
 * - a planilha central (DINOMONEY_PLANILHA_CENTRAL) tem uma linha por mentorado na aba "Mentorados";
 * - a planilha de cada mentorado tem a aba "Minhas contas" com as contas e os cartões.
 * Sem planilha central, vale a lista antiga em DINOMONEY_USUARIOS.
 */

export const ABA_MENTORADOS = "Mentorados";
export const ABA_MINHAS_CONTAS = "Minhas contas";
export const CABECALHO_MENTORADOS = ["Nome", "Telefone", "Código de acesso", "Planilha (link ou ID)", "Ativo"];
export const CABECALHO_CONTAS = ["Nome", "Tipo", "Fechamento da fatura (dia)", "Vencimento da fatura (dia)", "Limite"];

export type TipoConta = "Conta" | "Cartão" | "Investimento";

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
const comparavel = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Aceita o link inteiro da planilha ou só o ID. */
export function idDaPlanilha(valor: string): string {
  return valor.match(/\/d\/([\w-]+)/)?.[1] ?? valor.trim();
}

/** Linhas da aba "Mentorados" viram usuários. Linhas incompletas ou com Ativo = "Não" ficam de fora. */
export function lerMentorados(linhas: unknown[][]): Usuario[] {
  const usuarios: Usuario[] = [];
  for (const l of linhas) {
    const [nome, telefone, codigo, planilha, ativo] = [0, 1, 2, 3, 4].map((i) => texto(l[i]));
    if (!nome || !planilha) continue;
    if (["nao", "não", "false", "n"].includes(ativo.toLowerCase())) continue;
    // Telefone escrito sem o 55 do Brasil, como "(11) 99999-8888", ganha o código do país.
    const soDigitos = telefone.replace(/\D/g, "");
    const digitos = normalizarTelefone(soDigitos.length === 10 || soDigitos.length === 11 ? `55${soDigitos}` : soDigitos);
    usuarios.push({
      nome,
      telefone: /^\d{10,15}$/.test(digitos) ? digitos : "",
      codigo: codigo.length >= 8 ? codigo : undefined,
      planilhaId: idDaPlanilha(planilha),
      abaFluxo: "Cashflow",
      abaCategorias: "",
      contas: [],
      cartoes: [],
    });
  }
  return usuarios;
}

/** Linhas da aba "Minhas contas" viram as contas e os cartões da pessoa. */
export function lerMinhasContas(linhas: unknown[][]): { contas: string[]; cartoes: Cartao[] } {
  const contas: string[] = [];
  const cartoes: Cartao[] = [];
  for (const l of linhas) {
    const nome = texto(l[0]);
    if (!nome) continue;
    const tipo = comparavel(texto(l[1]));
    if (tipo.startsWith("cart")) {
      const fechamento = Number(texto(l[2]));
      const vencimento = Number(texto(l[3]));
      const dia = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31;
      // Cartão sem os dias da fatura ainda é uma origem válida; só não dá para calcular o vencimento.
      const limite = Math.abs(numeroBR(l[4]));
      if (dia(fechamento) && dia(vencimento)) cartoes.push({ nome, fechamento, vencimento, ...(limite > 0 ? { limite } : {}) });
      else contas.push(nome);
    } else {
      contas.push(nome);
    }
  }
  return { contas, cartoes };
}

const CACHE_MS = 60_000;
let cache: { em: number; usuarios: Usuario[] } | undefined;

/** Todos os mentorados: da planilha central, se configurada; senão de DINOMONEY_USUARIOS. */
export async function listarUsuarios(): Promise<Usuario[]> {
  const central = process.env.DINOMONEY_PLANILHA_CENTRAL;
  if (!central) return carregarUsuarios();
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.usuarios;
  const res = await cliente().spreadsheets.values.get({
    spreadsheetId: idDaPlanilha(central),
    range: `${aba(ABA_MENTORADOS)}!A2:E`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const usuarios = lerMentorados((res.data.values ?? []) as unknown[][]);
  cache = { em: Date.now(), usuarios };
  return usuarios;
}

/**
 * Completa o usuário com o que está na planilha dele: contas e cartões da aba "Minhas contas"
 * e o nome da aba de categorias ("Categorias" ou, nas planilhas antigas, "Contas").
 * O que já veio preenchido de DINOMONEY_USUARIOS só é usado se a aba não existir ou estiver vazia.
 */
export async function prepararUsuario(usuario: Usuario): Promise<Usuario> {
  const sheets = cliente();
  const info = await sheets.spreadsheets.get({ spreadsheetId: usuario.planilhaId, fields: "sheets.properties.title" });
  const titulos = (info.data.sheets ?? []).map((s) => s.properties?.title ?? "");
  const abaCategorias =
    usuario.abaCategorias && titulos.includes(usuario.abaCategorias)
      ? usuario.abaCategorias
      : titulos.includes("Categorias")
        ? "Categorias"
        : "Contas";
  let { contas, cartoes } = usuario;
  if (titulos.includes(ABA_MINHAS_CONTAS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: usuario.planilhaId,
      range: `${aba(ABA_MINHAS_CONTAS)}!A2:E`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const lidas = lerMinhasContas((res.data.values ?? []) as unknown[][]);
    if (lidas.contas.length + lidas.cartoes.length > 0) ({ contas, cartoes } = lidas);
  }
  return { ...usuario, abaCategorias, contas, cartoes };
}

async function garantirAbaContas(usuario: Usuario): Promise<void> {
  const sheets = cliente();
  const info = await sheets.spreadsheets.get({ spreadsheetId: usuario.planilhaId, fields: "sheets.properties.title" });
  if (info.data.sheets?.some((s) => s.properties?.title === ABA_MINHAS_CONTAS)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: { requests: [{ addSheet: { properties: { title: ABA_MINHAS_CONTAS } } }] },
  });
  // Quem tinha as contas só em DINOMONEY_USUARIOS ganha a aba já preenchida.
  const atuais = [
    ...usuario.contas.map((c) => [c, "Conta", "", ""]),
    ...usuario.cartoes.map((c) => [c.nome, "Cartão", c.fechamento, c.vencimento, c.limite ?? ""]),
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_MINHAS_CONTAS)}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [CABECALHO_CONTAS, ...atuais] },
  });
}

/** Acrescenta uma conta ou cartão novo na aba "Minhas contas". */
export async function cadastrarConta(usuario: Usuario, nome: string, tipo: TipoConta): Promise<void> {
  await garantirAbaContas(usuario);
  await cliente().spreadsheets.values.append({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_MINHAS_CONTAS)}!A:D`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[nome, tipo, "", ""]] },
  });
}

/** Grava o fechamento e o vencimento de um cartão, criando a linha se ele ainda não existir. */
export async function definirCartao(usuario: Usuario, nome: string, fechamento: number, vencimento: number): Promise<string> {
  await garantirAbaContas(usuario);
  const sheets = cliente();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_MINHAS_CONTAS)}!A2:A`,
  });
  const nomes = ((res.data.values ?? []) as unknown[][]).map((l) => texto(l[0]));
  const i = nomes.findIndex((n) => comparavel(n) === comparavel(nome));
  const linha = [i >= 0 ? nomes[i] : nome, "Cartão", fechamento, vencimento];
  if (i >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: usuario.planilhaId,
      range: `${aba(ABA_MINHAS_CONTAS)}!A${i + 2}:D${i + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [linha] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: usuario.planilhaId,
      range: `${aba(ABA_MINHAS_CONTAS)}!A:D`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [linha] },
    });
  }
  return linha[0] as string;
}

/**
 * Grava o limite de um cartão já cadastrado (coluna E da aba "Minhas contas").
 * Devolve o nome como está na planilha, ou undefined se o cartão não existe.
 */
export async function definirLimite(usuario: Usuario, nome: string, limite: number): Promise<string | undefined> {
  await garantirAbaContas(usuario);
  const sheets = cliente();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_MINHAS_CONTAS)}!A1:B`,
  });
  const linhas = (res.data.values ?? []) as unknown[][];
  const ehCartao = (l: unknown[]) => comparavel(texto(l[1])).startsWith("cart");
  const alvo = comparavel(nome);
  // Nome exato primeiro; senão, o único cartão cujo nome contém o que a pessoa escreveu ("limite nubank").
  let i = linhas.findIndex((l, k) => k > 0 && ehCartao(l) && comparavel(texto(l[0])) === alvo);
  if (i < 0) {
    const parecidos = linhas.map((l, k) => ({ l, k })).filter(({ l, k }) => k > 0 && ehCartao(l) && comparavel(texto(l[0])).includes(alvo));
    if (parecidos.length === 1) i = parecidos[0].k;
  }
  if (i < 1) return undefined;
  await sheets.spreadsheets.values.update({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_MINHAS_CONTAS)}!E1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Limite"]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_MINHAS_CONTAS)}!E${i + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: [[limite]] },
  });
  return texto(linhas[i][0]);
}

export async function encontrarUsuarioCadastrado(telefone: string): Promise<Usuario | undefined> {
  return encontrarUsuario(telefone, await listarUsuarios());
}

export async function encontrarUsuarioPeloCodigo(codigo: string): Promise<Usuario | undefined> {
  return encontrarUsuarioPorCodigo(codigo, await listarUsuarios());
}

/**
 * Apaga da aba "Minhas contas" a linha com esse nome (e desse tipo, se informado).
 * Devolve o nome como estava na planilha, ou undefined se não achou.
 */
export async function removerConta(usuario: Usuario, nome: string, tipo?: TipoConta): Promise<string | undefined> {
  const sheets = cliente();
  const info = await sheets.spreadsheets.get({ spreadsheetId: usuario.planilhaId, fields: "sheets.properties" });
  const sheetId = info.data.sheets?.find((s) => s.properties?.title === ABA_MINHAS_CONTAS)?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return undefined;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: usuario.planilhaId,
    range: `${aba(ABA_MINHAS_CONTAS)}!A2:B`,
  });
  const linhas = (res.data.values ?? []) as unknown[][];
  const i = linhas.findIndex(
    (l) =>
      comparavel(texto(l[0])) === comparavel(nome) &&
      (!tipo || comparavel(texto(l[1])).startsWith(comparavel(tipo).slice(0, 4))),
  );
  if (i < 0) return undefined;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: usuario.planilhaId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: i + 1, endIndex: i + 2 } } }],
    },
  });
  return texto(linhas[i][0]);
}
