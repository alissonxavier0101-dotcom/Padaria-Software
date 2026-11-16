import { correspondeBusca, normalizarTextoBusca } from './search.ts';

export type OrdenacaoLista =
  | 'nome-asc'
  | 'nome-desc'
  | 'data-asc'
  | 'data-desc'
  | 'valor-asc'
  | 'valor-desc';

export const ORDENACOES_LISTA: OrdenacaoLista[] = [
  'nome-asc',
  'nome-desc',
  'data-asc',
  'data-desc',
  'valor-asc',
  'valor-desc'
];

export const CATEGORIA_TODAS = 'todas';

export interface FiltroLista {
  busca: string;
  categoria: string;
  ordenacao: OrdenacaoLista;
  dataInicio: string;
  dataFim: string;
  extras: Record<string, string>;
}

export interface OpcoesFiltro<T> {
  nome: (item: T) => string | null | undefined;
  camposBusca: (item: T) => Array<string | null | undefined>;
  categoria: (item: T) => string | null | undefined;
  data: (item: T) => string | null | undefined;
  valor: (item: T) => number | null | undefined;
  extras?: (item: T) => Record<string, string | null | undefined> | undefined;
}

export function normalizarExtras(valor: unknown): Record<string, string> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const extras: Record<string, string> = {};
  for (const [chave, bruto] of Object.entries(valor as Record<string, unknown>)) {
    if (bruto === null || bruto === undefined) continue;
    extras[chave] = String(bruto);
  }
  return extras;
}

export function criarFiltroPadrao(): FiltroLista {
  return {
    busca: '',
    categoria: '',
    ordenacao: 'nome-asc',
    dataInicio: '',
    dataFim: '',
    extras: {}
  };
}

export function normalizarFiltro(entrada: Partial<FiltroLista> | null | undefined): FiltroLista {
  const padrao = criarFiltroPadrao();
  if (!entrada || typeof entrada !== 'object') return padrao;
  return {
    busca: typeof entrada.busca === 'string' ? entrada.busca : padrao.busca,
    categoria: typeof entrada.categoria === 'string' ? entrada.categoria : padrao.categoria,
    ordenacao: ORDENACOES_LISTA.includes(entrada.ordenacao as OrdenacaoLista)
      ? (entrada.ordenacao as OrdenacaoLista)
      : padrao.ordenacao,
    dataInicio: typeof entrada.dataInicio === 'string' ? entrada.dataInicio : padrao.dataInicio,
    dataFim: typeof entrada.dataFim === 'string' ? entrada.dataFim : padrao.dataFim,
    extras: normalizarExtras(entrada.extras)
  };
}

export function extrairDataISO(valor: unknown): string {
  const texto = String(valor ?? '').trim();
  const encontrada = /^(\d{4}-\d{2}-\d{2})/.exec(texto);
  return encontrada ? encontrada[1] : '';
}

export function dentroDaFaixaDeData(valor: unknown, inicio: string, fim: string): boolean {
  const data = extrairDataISO(valor);
  const de = extrairDataISO(inicio);
  const ate = extrairDataISO(fim);
  if (!de && !ate) return true;
  if (!data) return false;
  const limiteInferior = de && ate ? (de <= ate ? de : ate) : de;
  const limiteSuperior = de && ate ? (de <= ate ? ate : de) : ate;
  if (limiteInferior && data < limiteInferior) return false;
  if (limiteSuperior && data > limiteSuperior) return false;
  return true;
}

export function filtrarLista<T>(
  itens: readonly T[],
  filtro: FiltroLista,
  opcoes: OpcoesFiltro<T>
): T[] {
  return itens.filter((item) => {
    if (!correspondeBusca(filtro.busca, opcoes.camposBusca(item))) return false;
    if (filtro.categoria && opcoes.categoria(item) !== filtro.categoria) return false;
    if (!dentroDaFaixaDeData(opcoes.data(item), filtro.dataInicio, filtro.dataFim)) return false;
    if (opcoes.extras) {
      const atributos = opcoes.extras(item) || {};
      for (const [campo, valor] of Object.entries(filtro.extras)) {
        if (!valor) continue;
        if (String(atributos[campo] ?? '') !== valor) return false;
      }
    }
    return true;
  });
}

export function ordenarLista<T>(
  itens: readonly T[],
  ordenacao: OrdenacaoLista,
  opcoes: OpcoesFiltro<T>
): T[] {
  const copia = [...itens];
  const [campo, direcao] = ordenacao.split('-') as [
    'nome' | 'data' | 'valor',
    'asc' | 'desc'
  ];

  copia.sort((a, b) => {
    let resultado = 0;

    if (campo === 'nome') {
      resultado = normalizarTextoBusca(opcoes.nome(a)).localeCompare(
        normalizarTextoBusca(opcoes.nome(b)),
        'pt-BR'
      );
    } else if (campo === 'data') {
      const dataA = extrairDataISO(opcoes.data(a));
      const dataB = extrairDataISO(opcoes.data(b));
      if (!dataA && !dataB) return 0;
      if (!dataA) return 1;
      if (!dataB) return -1;
      resultado = dataA < dataB ? -1 : dataA > dataB ? 1 : 0;
    } else {
      resultado = (Number(opcoes.valor(a)) || 0) - (Number(opcoes.valor(b)) || 0);
    }

    return direcao === 'desc' ? -resultado : resultado;
  });

  return copia;
}

export function contarPorCategoria<T>(
  itens: readonly T[],
  categorias: readonly string[],
  obterCategoria: (item: T) => string | null | undefined
): Record<string, number> {
  const contagens: Record<string, number> = { [CATEGORIA_TODAS]: itens.length };
  for (const categoria of categorias) contagens[categoria] = 0;
  for (const item of itens) {
    const categoria = obterCategoria(item);
    if (categoria === null || categoria === undefined) continue;
    const chave = String(categoria);
    contagens[chave] = (contagens[chave] ?? 0) + 1;
  }
  return contagens;
}

export interface ResultadoFiltro<T> {
  filtro: FiltroLista;
  itens: T[];
  contagens: Record<string, number>;
}

export interface ConfiguracaoAplicacao {
  ordenar?: boolean;
}

export function aplicarFiltros<T>(
  itens: readonly T[],
  filtro: FiltroLista,
  opcoes: OpcoesFiltro<T>,
  categorias: readonly string[] = [],
  configuracao: ConfiguracaoAplicacao = {}
): ResultadoFiltro<T> {
  const filtrados = filtrarLista(itens, filtro, opcoes);
  const baseParaContagem = filtrarLista(itens, { ...filtro, categoria: '' }, opcoes);
  return {
    filtro,
    itens: configuracao.ordenar === false
      ? filtrados
      : ordenarLista(filtrados, filtro.ordenacao, opcoes),
    contagens: contarPorCategoria(baseParaContagem, categorias, opcoes.categoria)
  };
}

const PREFIXO_STORAGE = 'padaria:filtroLista:';

export function chaveFiltroAba(aba: string): string {
  return `${PREFIXO_STORAGE}${aba}`;
}

function obterArmazenamento(armazenamento?: Storage): Storage | undefined {
  if (armazenamento) return armazenamento;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function carregarFiltroAba(aba: string, armazenamento?: Storage): FiltroLista {
  try {
    const storage = obterArmazenamento(armazenamento);
    if (!storage) return criarFiltroPadrao();
    const bruto = storage.getItem(chaveFiltroAba(aba));
    if (!bruto) return criarFiltroPadrao();
    return normalizarFiltro(JSON.parse(bruto) as Partial<FiltroLista>);
  } catch {
    return criarFiltroPadrao();
  }
}

export function salvarFiltroAba(
  aba: string,
  filtro: FiltroLista,
  armazenamento?: Storage
): void {
  try {
    const storage = obterArmazenamento(armazenamento);
    if (!storage) return;
    storage.setItem(chaveFiltroAba(aba), JSON.stringify(normalizarFiltro(filtro)));
  } catch {
    // Falha de storage (modo privado, cota etc.) nunca deve quebrar a tela.
  }
}
