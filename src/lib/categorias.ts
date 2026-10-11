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
