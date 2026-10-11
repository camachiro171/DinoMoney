/** Uma linha da aba de categorias: Categoria > Tipo > Despesa. */
export interface Categoria {
  grupo: string; // Essencial, Necessária, Supérflua, Renda, Entre Contas...
  tipo: string; // Casa, Alimentação, Renda Principal...
  despesa: string; // Internet, Padaria, Salário/Pró-labore...
}

/** Converte as linhas cruas da aba "Contas" (A:C) em categorias, ignorando cabeçalho e linhas vazias. */
export function lerCategorias(linhas: string[][]): Categoria[] {
  const vistas = new Set<string>();
  const categorias: Categoria[] = [];
  for (const [grupo = "", tipo = "", despesa = ""] of linhas.slice(1)) {
    const c = { grupo: grupo.trim(), tipo: tipo.trim(), despesa: despesa.trim() };
    if (!c.grupo || !c.tipo || !c.despesa) continue;
    if (vistas.has(c.despesa)) continue;
    vistas.add(c.despesa);
    categorias.push(c);
  }
  return categorias;
}

export function ehRenda(c: Categoria): boolean {
  return c.grupo.toLowerCase().startsWith("renda");
}

export function ehEntreContas(c: Categoria): boolean {
  return c.grupo.toLowerCase().includes("entre contas");
}

/** Texto compacto com as categorias, agrupado, para o prompt da IA. */
export function descreverCategorias(categorias: Categoria[]): string {
  const porGrupo = new Map<string, Map<string, string[]>>();
  for (const c of categorias) {
    const tipos = porGrupo.get(c.grupo) ?? new Map<string, string[]>();
    tipos.set(c.tipo, [...(tipos.get(c.tipo) ?? []), c.despesa]);
    porGrupo.set(c.grupo, tipos);
  }
  const linhas: string[] = [];
  for (const [grupo, tipos] of porGrupo) {
    linhas.push(`${grupo}:`);
    for (const [tipo, despesas] of tipos) linhas.push(`  ${tipo}: ${despesas.join(" | ")}`);
  }
  return linhas.join("\n");
}

/** Valores do fluxo que não são categoria de verdade (saldo inicial, erro de fórmula, traço). */
const IGNORAR = new Set(["", "si", "#n/a", "-"]);

/**
 * Categorias que a pessoa já usa no fluxo de caixa (colunas TIPO e DESPESA) e que não estão na aba Contas.
 * Muita gente cria as próprias categorias direto no fluxo; o robô passa a usá-las também.
 * `linhas` são as colunas B:E do fluxo (TIPO, DESPESA, Descrição, NOME), com o cabeçalho.
 */
export function categoriasDoHistorico(linhas: string[][], jaConhecidas: Categoria[]): Categoria[] {
  const vistas = new Set(jaConhecidas.map((c) => c.despesa.trim().toLowerCase()));
  const novas: Categoria[] = [];
  for (const [tipo = "", despesa = ""] of linhas.slice(1)) {
    const t = tipo.trim();
    const d = despesa.trim();
    if (IGNORAR.has(t.toLowerCase()) || IGNORAR.has(d.toLowerCase())) continue;
    if (vistas.has(d.toLowerCase())) continue;
    vistas.add(d.toLowerCase());
    const grupo = t.toLowerCase().startsWith("renda") ? "Renda" : t.toLowerCase() === "entre contas" ? "Entre Contas" : "Outras (usadas no fluxo)";
    novas.push({ grupo, tipo: t, despesa: d });
  }
  return novas;
}

/** Exemplos recentes de como a pessoa classificou cada estabelecimento, para a IA seguir o mesmo padrão. */
export function exemplosDoHistorico(linhas: string[][], limite = 60): string[] {
  const porNome = new Map<string, string>();
  for (const [tipo = "", despesa = "", descricao = "", nome = ""] of linhas.slice(1)) {
    if (IGNORAR.has(despesa.trim().toLowerCase()) || IGNORAR.has(tipo.trim().toLowerCase())) continue;
    const chave = (nome.trim() || descricao.trim()).slice(0, 60);
    if (!chave || chave.toLowerCase() === "si") continue;
    porNome.delete(chave); // reinserir mantém o mais recente no fim
    porNome.set(chave, `${chave}${descricao.trim() && nome.trim() ? ` (${descricao.trim().slice(0, 40)})` : ""} → ${despesa.trim()}`);
  }
  return [...porNome.values()].slice(-limite);
}
