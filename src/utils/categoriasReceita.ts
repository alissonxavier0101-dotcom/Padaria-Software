import { normalizarTextoBusca } from './search.ts';

export interface CategoriaReceita {
  id: string;
  nome: string;
  padrao?: boolean;
  createdAt?: unknown;
  createdBy?: string;
}

export const LIMITE_NOME_CATEGORIA_MIN = 1;
export const LIMITE_NOME_CATEGORIA_MAX = 40;

export const CATEGORIAS_RECEITA_PADRAO: ReadonlyArray<CategoriaReceita> = [
  { id: 'paes', nome: 'Pães', padrao: true },
  { id: 'bolos', nome: 'Bolos', padrao: true },
  { id: 'salgados', nome: 'Salgados', padrao: true },
  { id: 'outros', nome: 'Outros', padrao: true },
];

export const ORDEM_CATEGORIAS_PADRAO: ReadonlyArray<string> = [
  'paes', 'bolos', 'salgados', 'outros',
];

export function normalizarNomeCategoria(nome: unknown): string {
  return normalizarTextoBusca(nome).trim().replace(/\s+/g, ' ');
}

export function gerarSlugCategoria(nome: unknown): string {
  return normalizarNomeCategoria(nome)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validarNomeCategoria(nome: unknown): { valido: boolean; motivo?: string } {
  const limpo = normalizarNomeCategoria(nome);
  if (limpo.length < LIMITE_NOME_CATEGORIA_MIN) {
    return { valido: false, motivo: 'Informe o nome da categoria.' };
  }
  if (limpo.length > LIMITE_NOME_CATEGORIA_MAX) {
    return {
      valido: false,
      motivo: `O nome deve ter no máximo ${LIMITE_NOME_CATEGORIA_MAX} caracteres.`,
    };
  }
  if (!gerarSlugCategoria(limpo)) {
    return { valido: false, motivo: 'O nome da categoria é inválido.' };
  }
  return { valido: true };
}

export function categoriaDuplicada(
  categorias: CategoriaReceita[],
  nome: string,
  idAtual: string | null = null
): boolean {
  const alvo = normalizarNomeCategoria(nome);
  const alvoSlug = gerarSlugCategoria(nome);
  return categorias.some((cat) => {
    if (idAtual && cat.id === idAtual) return false;
    return (
      normalizarNomeCategoria(cat.nome) === alvo ||
      gerarSlugCategoria(cat.nome) === alvoSlug
    );
  });
}

export function ordenarCategoriasReceita(categorias: CategoriaReceita[]): CategoriaReceita[] {
  return [...categorias].sort((a, b) => {
    const ra = ORDEM_CATEGORIAS_PADRAO.indexOf(a.id);
    const rb = ORDEM_CATEGORIAS_PADRAO.indexOf(b.id);
    if (ra !== -1 || rb !== -1) {
      if (ra === -1) return 1;
      if (rb === -1) return -1;
      return ra - rb;
    }
    return a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id);
  });
}

export function deduplicarCategoriasReceita(categorias: CategoriaReceita[]): CategoriaReceita[] {
  const vistos = new Set<string>();
  return categorias.filter((cat) => {
    const chave = cat.id || normalizarNomeCategoria(cat.nome);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export function prepararCategoriasReceita(categorias: CategoriaReceita[]): CategoriaReceita[] {
  return ordenarCategoriasReceita(deduplicarCategoriasReceita(categorias));
}

export function obterPrimeiraCategoria(categorias: ReadonlyArray<CategoriaReceita>): CategoriaReceita | null {
  const ordenadas = prepararCategoriasReceita([...categorias]);
  return ordenadas.length > 0 ? ordenadas[0] : null;
}

export function resolverCategoriaReceita(
  receita: { categoria?: string | null } | null | undefined,
  categorias: ReadonlyArray<CategoriaReceita>
): string | null {
  const primeira = obterPrimeiraCategoria(categorias);
  if (!primeira) return null;
  const id = receita?.categoria ?? null;
  if (!id) return primeira.id;
  const encontrada = categorias.find((cat) => cat.id === id);
  if (encontrada) return encontrada.id;
  const normalizado = normalizarNomeCategoria(id);
  const slug = gerarSlugCategoria(id);
  const porNome = categorias.find(
    (cat) =>
      normalizarNomeCategoria(cat.nome) === normalizado ||
      gerarSlugCategoria(cat.nome) === slug
  );
  return porNome ? porNome.id : primeira.id;
}

export function obterNomeCategoria(
  categorias: ReadonlyArray<CategoriaReceita>,
  id: string | null | undefined
): string {
  const cat = categorias.find((c) => c.id === id);
  return cat ? cat.nome : id ?? '';
}

export function contarReceitasPorCategoria(
  receitas: Array<{ categoria?: string | null }>,
  categorias: ReadonlyArray<CategoriaReceita>
): Record<string, number> {
  const ordenadas = prepararCategoriasReceita([...categorias]);
  const contagens: Record<string, number> = { todos: receitas.length };
  for (const cat of ordenadas) contagens[cat.id] = 0;
  for (const receita of receitas) {
    const id = resolverCategoriaReceita(receita, ordenadas);
    if (id) contagens[id] = (contagens[id] || 0) + 1;
  }
  return contagens;
}

export function planejarRealocacaoReceitas(
  receitas: Array<{ id: string; categoria?: string | null }>,
  categorias: ReadonlyArray<CategoriaReceita>,
  origemId: string,
  destinoId: string
) {
  const ordenadas = prepararCategoriasReceita([...categorias]);
  const plano = { origemId, destinoId, movidas: 0, ids: [] as string[] };
  if (origemId === destinoId) return plano;
  for (const receita of receitas) {
    if (resolverCategoriaReceita(receita, ordenadas) === origemId) {
      plano.movidas++;
      plano.ids.push(receita.id);
    }
  }
  return plano;
}
