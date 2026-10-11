/**
 * Testa a leitura e a classificação da IA sem WhatsApp e sem planilha.
 *
 *   npm run simular -- "mercado 230 no nubank em 2x"
 *   npm run simular -- ./cupom.jpg "almoço"
 *   npm run simular -- ./extrato.pdf
 *
 * Precisa só de ANTHROPIC_API_KEY. Usa as categorias da planilha modelo (dados/categorias-modelo.json).
 */
import fs from "node:fs";
import path from "node:path";
import { classificar, type Entrada } from "../src/lib/classificador";
import type { Categoria } from "../src/lib/categorias";
import type { Usuario } from "../src/lib/config";
import { hojeEmSaoPaulo } from "../src/lib/datas";
import { paraLinhas, resumir } from "../src/lib/lancamentos";

const categorias: Categoria[] = JSON.parse(fs.readFileSync("dados/categorias-modelo.json", "utf8"));
const usuario: Usuario = {
  nome: "Teste",
  telefone: "5511999998888",
  planilhaId: "simulacao-sem-planilha",
  abaFluxo: "Cashflow",
  abaCategorias: "Contas",
  contas: ["Itaú", "Inter"],
  cartoes: [{ nome: "Nubank", fechamento: 3, vencimento: 10 }],
};

const MIMES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function lerEntrada(args: string[]): Entrada {
  const [primeiro, legenda] = args;
  if (primeiro && fs.existsSync(primeiro)) {
    const base64 = fs.readFileSync(primeiro).toString("base64");
    const ext = path.extname(primeiro).toLowerCase();
    if (ext === ".pdf") return { tipo: "pdf", base64, legenda };
    const mime = MIMES[ext];
    if (!mime) throw new Error(`Formato não suportado: ${ext}`);
    return { tipo: "imagem", base64, mime, legenda };
  }
  return { tipo: "texto", texto: args.join(" ") };
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Uso: npm run simular -- "café 6 reais no pix"');
  process.exit(1);
}
const hoje = hojeEmSaoPaulo();
const resultado = await classificar(lerEntrada(args), { categorias, exemplos: [] }, usuario, hoje);
console.log("IA entendeu:", JSON.stringify(resultado, null, 2));
if (resultado.lancamentos.length) {
  const linhas = resultado.lancamentos.map((l) => paraLinhas(l, categorias, usuario, hoje));
  console.log("\nLinhas na planilha:");
  console.table(linhas.flat().map(({ data, despesa, descricao, nome, pagoCom, banco, valor }) => ({ data, despesa, descricao, nome, pagoCom, banco, valor })));
  console.log("\nResposta no WhatsApp:\n" + resumir(resultado.lancamentos, linhas));
}
