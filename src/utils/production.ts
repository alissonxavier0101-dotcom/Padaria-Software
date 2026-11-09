import type { StockDeduction, StockRecord } from './inventory.ts';

export interface RecipeProductionCost {
  custoIndireto?: number;
}

export interface ProductionCost {
  custoInsumos: number;
  custoIndireto: number;
  custoReal: number;
  custoUnitarioReal: number;
}

export interface ProductionFinancialResult {
  faturamento: number;
  lucro: number;
  lucroPorFornada: number;
  lucroPorUnidade: number;
}

export interface ProductionStockConsumption {
  id: string;
  nome?: string;
  unidade?: string;
  quantidade: number;
}

export interface RestoredStock {
  id: string;
  nome: string;
  unidade: string;
  estoqueAtual: number;
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcularResultadoFinanceiroProducao(
  custoReal: number,
  quantidadeProduzida: number,
  precoVendaUnitario: number,
  fornadas: number
): ProductionFinancialResult {
  if (!Number.isFinite(custoReal) || custoReal < 0) {
    throw new Error('O custo real da produção é inválido.');
  }
  if (!Number.isFinite(quantidadeProduzida) || quantidadeProduzida <= 0) {
    throw new Error('A quantidade produzida deve ser maior que zero.');
  }
  if (!Number.isFinite(precoVendaUnitario) || precoVendaUnitario < 0) {
    throw new Error('O preço de venda deve ser maior ou igual a zero.');
  }
  if (!Number.isInteger(fornadas) || fornadas < 1) {
    throw new Error('Informe um número inteiro de fornadas maior que zero.');
  }

  const faturamento = roundToCents(quantidadeProduzida * precoVendaUnitario);
  const lucro = roundToCents(faturamento - custoReal);
  return {
    faturamento,
    lucro,
    lucroPorFornada: roundToCents(lucro / fornadas),
    lucroPorUnidade: roundToCents(lucro / quantidadeProduzida)
  };
}

export function calcularRestauracaoEstoqueProducao(
  consumptions: ProductionStockConsumption[],
  items: StockRecord[]
): RestoredStock[] {
  if (!Array.isArray(consumptions) || consumptions.length === 0) {
    throw new Error('Este registro não contém os insumos consumidos; não é possível restaurar o estoque com segurança.');
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const restoredById = new Map<string, RestoredStock>();
  for (const consumption of consumptions) {
    if (!consumption.id || !Number.isFinite(consumption.quantidade) || consumption.quantidade < 0) {
      throw new Error('O registro contém uma quantidade de insumo inválida; o estoque não foi alterado.');
    }

    const item = itemById.get(consumption.id);
    if (!item) {
      throw new Error(`O insumo "${consumption.nome || consumption.id}" não foi encontrado; o estoque não foi alterado.`);
    }
    if (consumption.unidade && consumption.unidade !== item.unidade) {
      throw new Error(`A unidade de "${item.nome}" mudou desde a produção; o estoque não foi alterado.`);
    }

    const estoqueAtual = item.estoqueAtual ?? item.quantidade;
    if (!Number.isFinite(estoqueAtual) || estoqueAtual < 0) {
      throw new Error(`O estoque atual de "${item.nome}" é inválido; o estoque não foi alterado.`);
    }

    const previous = restoredById.get(item.id);
    restoredById.set(item.id, {
      id: item.id,
      nome: item.nome,
      unidade: item.unidade,
      estoqueAtual: (previous?.estoqueAtual ?? estoqueAtual) + consumption.quantidade
    });
  }

  return [...restoredById.values()];
}

export function calcularCustoRealProducao(
  deductions: StockDeduction[],
  items: StockRecord[],
  recipe: RecipeProductionCost,
  batches: number,
  quantityProduced: number
): ProductionCost {
  if (!Number.isInteger(batches) || batches < 1) {
    throw new Error('Informe um número inteiro de fornadas maior que zero.');
  }
  if (!Number.isFinite(quantityProduced) || quantityProduced <= 0) {
    throw new Error('A quantidade produzida deve ser maior que zero.');
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const custoInsumos = deductions.reduce((total, deduction) => {
    const item = itemById.get(deduction.id);
    if (!item) throw new Error(`O insumo "${deduction.nome}" não foi encontrado no estoque.`);
    const custoUnitario = item.custoUnitario;
    if (typeof custoUnitario !== 'number' || !Number.isFinite(custoUnitario) || custoUnitario < 0) {
      throw new Error(`O custo unitário de "${item.nome}" é inválido.`);
    }
    if (!Number.isFinite(deduction.quantidadeNecessaria) || deduction.quantidadeNecessaria < 0) {
      throw new Error(`A quantidade consumida de "${item.nome}" é inválida.`);
    }
    return total + deduction.quantidadeNecessaria * custoUnitario;
  }, 0);

  const custoIndiretoPorFornada = Number(recipe.custoIndireto ?? 0);
  if (!Number.isFinite(custoIndiretoPorFornada) || custoIndiretoPorFornada < 0) {
    throw new Error('O custo indireto da receita é inválido.');
  }

  const custoInsumosArredondado = roundToCents(custoInsumos);
  const custoIndireto = roundToCents(custoIndiretoPorFornada * batches);
  const custoReal = roundToCents(custoInsumosArredondado + custoIndireto);

  return {
    custoInsumos: custoInsumosArredondado,
    custoIndireto,
    custoReal,
    custoUnitarioReal: roundToCents(custoReal / quantityProduced)
  };
}
