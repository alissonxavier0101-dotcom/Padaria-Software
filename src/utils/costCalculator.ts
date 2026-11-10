/**
 * Funções puras de cálculo de custos para padaria artesanal
 */

export type UnitType = 'kg' | 'g' | 'L' | 'ml' | 'un' | 'xicara' | 'colher_sopa' | 'colher_cha';
export type CategoriaInsumo = 'ingrediente' | 'embalagem' | 'outro';
export type CategoriaReceita = 'paes' | 'bolos' | 'salgados' | 'outros';

export interface RecipeUnitConversions {
  baseUnit: 'g' | 'ml';
  xicara?: number;
  colher_sopa?: number;
  colher_cha?: number;
  un?: number;
}

export interface RecipeIndirectCosts {
  custoEnergia?: number;
  custoAgua?: number;
  tempoPreparoMin?: number;
  valorHoraMaoDeObra?: number;
  unidadesPerdidas?: number;
}

export interface Insumo {
  id?: string;
  nome: string;
  fornecedor: string;
  fornecedorId?: string | null;
  grupoComparacao?: string;
  marca?: string;
  quantidade: number;
  unidade: UnitType;
  preco: number;
  custoUnitario?: number;
  categoria?: CategoriaInsumo;
  conversoes?: RecipeUnitConversions;
  createdAt?: unknown;
  createdBy?: string;
  createdByName?: string;
}

export interface ItemReceita {
  insumoId?: string | null;
  ofertaInsumoId?: string | null;
  sourceType?: 'insumo' | 'receita';
  receitaId?: string;
  insumoNome: string;
  categoria: CategoriaInsumo;
  quantidadeUsada: number;
  unidadeUsada: UnitType;
  custoUnitarioBase: number;
  unidadeBase: UnitType;
  conversoes?: RecipeUnitConversions | null;
  custoItem: number;
}

export interface Receita {
  id?: string;
  nome: string;
  categoria?: CategoriaReceita;
  descricao?: string;
  modoPreparo?: string;
  tempoPreparoMin?: number | null;
  tempoFornoMin?: number | null;
  temperaturaFornoC?: number | null;
  fotoDataUrl?: string | null;
  custoEnergia?: number;
  custoAgua?: number;
  valorHoraMaoDeObra?: number;
  unidadesPerdidas?: number;
  unidadesVendaveis?: number;
  custoMaoDeObra?: number;
  custoIndireto?: number;
  rendimento: number;
  rendimentoUnidade: string;
  itens: ItemReceita[];
  custoIngredientes: number;
  custoEmbalagens: number;
  custoTotal: number;
  custoUnitario: number;
  margemLucroDesejada: number; // Porcentagem (ex: 100 para 100%)
  precoVendaSugerido: number;
  precoVendaPraticado: number;
  lucroPorUnidade: number;
  margemRealPorcentagem: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  createdByName?: string;
}

/**
 * Calcula o custo unitário (Preço / Quantidade da Embalagem)
 * Retorna o valor por unidade base (ex: R$ por kg, por L, ou por un)
 */
export function calcularCustoUnitario(preco: number, quantidade: number): number {
  if (!quantidade || quantidade <= 0 || isNaN(quantidade)) {
    return 0;
  }
  if (!preco || preco < 0 || isNaN(preco)) {
    return 0;
  }
  const custo = preco / quantidade;
  return Math.round(custo * 10000) / 10000; // precisão de 4 casas decimais
}

/**
 * Converte o custo unitário para a menor unidade comum de receita (ex: kg -> g, L -> ml)
 */
export function calcularCustoPorGramaOuMl(custoUnitario: number, unidade: UnitType): number {
  if (unidade === 'kg' || unidade === 'L') {
    return custoUnitario / 1000;
  }
  return custoUnitario;
}

/**
 * Calcula o custo exato de um item de receita normalizando as unidades
 * (kg <-> g, L <-> ml, ou un <-> un)
 */
export function calcularCustoItemReceita(
  custoUnitarioInsumo: number,
  unidadeInsumo: UnitType,
  quantidadeUsada: number,
  unidadeUsada: UnitType,
  conversoes?: RecipeUnitConversions
): number {
  if (custoUnitarioInsumo <= 0 || quantidadeUsada <= 0 || isNaN(custoUnitarioInsumo) || isNaN(quantidadeUsada)) {
    return 0;
  }

  const dimensionFor = (unit: UnitType) => {
    if (unit === 'kg') return { dimension: 'mass', factor: 1000 };
    if (unit === 'g') return { dimension: 'mass', factor: 1 };
    if (unit === 'L') return { dimension: 'volume', factor: 1000 };
    if (unit === 'ml') return { dimension: 'volume', factor: 1 };
    if (unit === 'un') {
      if (conversoes?.un && conversoes.un > 0) {
        return { dimension: conversoes.baseUnit === 'ml' ? 'volume' : 'mass', factor: conversoes.un };
      }
      return { dimension: 'count', factor: 1 };
    }

    const factor = conversoes?.[unit];
    if (!factor || factor <= 0) return null;
    return { dimension: conversoes.baseUnit === 'ml' ? 'volume' : 'mass', factor };
  };

  const source = dimensionFor(unidadeInsumo);
  const target = dimensionFor(unidadeUsada);
  if (!source || !target || source.dimension !== target.dimension) return 0;

  const custoTotal = (custoUnitarioInsumo / source.factor) * target.factor * quantidadeUsada;
  return Math.round(custoTotal * 10000) / 10000;
}

/**
 * Consolida os custos de uma receita discriminando ingredientes e embalagens descartáveis
 */
export function calcularTotaisReceita(
  itens: ItemReceita[],
  rendimento = 1,
  custosIndiretos: RecipeIndirectCosts = {}
) {
  const rendimentoValido = rendimento > 0 ? rendimento : 1;

  let custoIngredientes = 0;
  let custoEmbalagens = 0;

  for (const item of itens) {
    const custo = Number(item.custoItem) || 0;
    if (item.categoria === 'embalagem') {
      custoEmbalagens += custo;
    } else {
      custoIngredientes += custo;
    }
  }

  const custoEnergia = Math.max(0, Number(custosIndiretos.custoEnergia) || 0);
  const custoAgua = Math.max(0, Number(custosIndiretos.custoAgua) || 0);
  const tempoPreparoMin = Math.max(0, Number(custosIndiretos.tempoPreparoMin) || 0);
  const valorHoraMaoDeObra = Math.max(0, Number(custosIndiretos.valorHoraMaoDeObra) || 0);
  const custoMaoDeObra = Math.round((tempoPreparoMin * valorHoraMaoDeObra / 60) * 100) / 100;
  const custoIndireto = Math.round((custoEnergia + custoAgua + custoMaoDeObra) * 100) / 100;
  const custoTotal = Math.round((custoIngredientes + custoEmbalagens + custoIndireto) * 100) / 100;
  const unidadesPerdidas = Math.max(0, Number(custosIndiretos.unidadesPerdidas) || 0);
  const unidadesVendaveis = Math.max(0, rendimentoValido - unidadesPerdidas);
  const custoUnitario = unidadesVendaveis > 0
    ? Math.round((custoTotal / unidadesVendaveis) * 100) / 100
    : 0;

  return {
    custoIngredientes: Math.round(custoIngredientes * 100) / 100,
    custoEmbalagens: Math.round(custoEmbalagens * 100) / 100,
    custoEnergia: Math.round(custoEnergia * 100) / 100,
    custoMaoDeObra,
    custoAgua: Math.round(custoAgua * 100) / 100,
    custoIndireto,
    custoTotal,
    unidadesVendaveis,
    custoUnitario
  };
}

export function calcularCustoUnitarioReceita(
  receita: Pick<Receita, 'custoUnitario' | 'custoTotal' | 'rendimento' | 'unidadesVendaveis' | 'unidadesPerdidas'>
): number {
  const custoUnitario = Number(receita.custoUnitario);
  if (Number.isFinite(custoUnitario) && custoUnitario > 0) return custoUnitario;

  const rendimento = Number(receita.rendimento);
  const perdas = Number(receita.unidadesPerdidas) || 0;
  const unidadesVendaveis = receita.unidadesVendaveis !== undefined && receita.unidadesVendaveis !== null
    ? Number(receita.unidadesVendaveis)
    : rendimento - perdas;
  const custoTotal = Number(receita.custoTotal);
  if (!Number.isFinite(unidadesVendaveis) || unidadesVendaveis <= 0 ||
      !Number.isFinite(custoTotal) || custoTotal < 0) {
    return 0;
  }
  return Math.round((custoTotal / unidadesVendaveis) * 100) / 100;
}

/**
 * Calcula preço sugerido, lucro e margem real da receita
 */
export function calcularLucroEPrecificacao(
  custoPorUnidade: number,
  margemDesejadaPorcentagem = 100,
  precoVendaPraticado?: number
) {
  const custo = Number(custoPorUnidade) || 0;
  const margem = Number(margemDesejadaPorcentagem) || 0;

  // Preço sugerido baseado em markup sobre custo
  const precoSugerido = Math.round(custo * (1 + margem / 100) * 100) / 100;

  // Preço efetivo (se o padeiro definiu um preço de venda real, usa ele)
  const precoFinal = precoVendaPraticado && precoVendaPraticado > 0 
    ? Math.round(precoVendaPraticado * 100) / 100 
    : precoSugerido;

  const lucroPorUnidade = Math.round((precoFinal - custo) * 100) / 100;
  const precoAbaixoDoMinimo = Boolean(
    precoVendaPraticado && precoVendaPraticado > 0 && precoFinal < precoSugerido
  );

  // Margem real sobre o custo
  const margemReal = custo > 0 ? Math.round(((precoFinal - custo) / custo) * 1000) / 10 : 0;

  return {
    precoSugerido,
    precoMinimo: precoSugerido,
    precoAbaixoDoMinimo,
    precoFinal,
    lucroPorUnidade,
    margemReal
  };
}

/**
 * Formata um número para moeda Real Brasileiro (R$)
 */
export function formatarMoeda(valor: number, casasDecimais = 2): string {
  if (isNaN(valor)) return 'R$ 0,00';
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  });
}

/**
 * Formata o texto descritivo do custo unitário
 */
export function formatarTextoCustoUnitario(custoUnitario: number, unidade: UnitType): string {
  const casas = custoUnitario < 1 && custoUnitario > 0 ? 4 : 2;
  const valorFormatado = formatarMoeda(custoUnitario, casas);
  return `${valorFormatado} / ${unidade}`;
}
