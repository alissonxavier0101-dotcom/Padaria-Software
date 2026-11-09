export type StockUnit = 'kg' | 'g' | 'L' | 'ml' | 'un';
export type RecipeMeasureUnit = StockUnit | 'xicara' | 'colher_sopa' | 'colher_cha';

export interface RecipeUnitConversions {
  baseUnit?: 'g' | 'ml';
  xicara?: number;
  colher_sopa?: number;
  colher_cha?: number;
  un?: number;
}

export interface StockRecord {
  id: string;
  nome: string;
  unidade: StockUnit;
  quantidade: number;
  preco?: number;
  custoUnitario?: number;
  estoqueAtual?: number;
  estoqueMinimo?: number;
  conversoes?: RecipeUnitConversions;
}

export interface RecipeStockIngredient {
  insumoId?: string | null;
  sourceType?: 'insumo' | 'receita';
  receitaId?: string;
  quantidadeUsada: number;
  unidadeUsada: string;
  conversoes?: RecipeUnitConversions | null;
}

export interface RecipeStockRecord {
  id: string;
  nome: string;
  rendimento: number;
  unidadesVendaveis?: number;
  unidadesPerdidas?: number;
  rendimentoUnidade: string;
  itens: RecipeStockIngredient[];
}

export interface StockDeduction {
  id: string;
  nome: string;
  unidade: StockUnit;
  quantidadeAtual: number;
  quantidadeNecessaria: number;
}

export interface ShoppingListItem {
  id: string;
  nome: string;
  quantidadeNecessaria: number;
  unidade: StockUnit;
  quantidadeEmbalagem: number;
  precoEmbalagem: number;
  pacotesNecessarios: number;
  custoCompra: number;
  custoProporcional: number;
}

const stockUnitFactors: Record<StockUnit, { dimension: string; factor: number }> = {
  kg: { dimension: 'mass', factor: 1000 },
  g: { dimension: 'mass', factor: 1 },
  L: { dimension: 'volume', factor: 1000 },
  ml: { dimension: 'volume', factor: 1 },
  un: { dimension: 'count', factor: 1 }
};

function normalizeYieldUnit(unit: string): StockUnit {
  const value = unit.trim().toLocaleLowerCase('pt-BR');
  if (value === 'kg' || value.includes('quilo')) return 'kg';
  if (value === 'g' || value.includes('grama')) return 'g';
  if (value === 'l' || value === 'litro' || value === 'litros') return 'L';
  if (value === 'ml' || value.includes('mililitro')) return 'ml';
  return 'un';
}

function toBaseQuantity(
  quantity: number,
  unit: string,
  conversions?: RecipeUnitConversions | null
): { dimension: string; quantity: number } {
  const typedUnit = unit as RecipeMeasureUnit;
  if (typedUnit in stockUnitFactors) {
    if (typedUnit === 'un' && conversions?.un && conversions.un > 0) {
      return {
        dimension: conversions.baseUnit === 'ml' ? 'volume' : 'mass',
        quantity: quantity * conversions.un
      };
    }
    const factor = stockUnitFactors[typedUnit as StockUnit];
    return { dimension: factor.dimension, quantity: quantity * factor.factor };
  }

  const conversion = conversions?.[typedUnit as keyof RecipeUnitConversions];
  if (typeof conversion !== 'number' || conversion <= 0 || !conversions?.baseUnit) {
    throw new Error(`Cadastre a conversão para ${unit} antes de produzir.`);
  }
  return {
    dimension: conversions.baseUnit === 'ml' ? 'volume' : 'mass',
    quantity: quantity * conversion
  };
}

export function convertStockQuantity(
  quantity: number,
  from: string,
  to: StockUnit,
  conversions?: RecipeUnitConversions | null
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('A quantidade de insumo é inválida.');
  }
  const source = toBaseQuantity(quantity, from, conversions);
  const target = to === 'un' && conversions?.un && conversions.un > 0
    ? { dimension: conversions.baseUnit === 'ml' ? 'volume' : 'mass', factor: conversions.un }
    : stockUnitFactors[to];
  if (source.dimension !== target.dimension) {
    throw new Error(`Não é possível converter ${from} para ${to}.`);
  }
  return source.quantity / target.factor;
}

export function isBelowMinimum(item: Pick<StockRecord, 'estoqueAtual' | 'estoqueMinimo' | 'quantidade'>): boolean {
  const available = item.estoqueAtual ?? item.quantidade;
  return available <= (item.estoqueMinimo ?? 0);
}

export function calcularBaixaEstoque(
  recipeId: string,
  recipes: RecipeStockRecord[],
  items: StockRecord[],
  batches: number
): StockDeduction[] {
  if (!Number.isInteger(batches) || batches < 1) {
    throw new Error('Informe um número inteiro de fornadas maior que zero.');
  }

  const requirements = new Map<string, number>();
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const itemById = new Map(items.map((item) => [item.id, item]));

  function collect(recipe: RecipeStockRecord, factor: number, ancestry: Set<string>) {
    if (ancestry.has(recipe.id)) {
      throw new Error(`A receita "${recipe.nome}" contém uma dependência circular.`);
    }
    if (!Array.isArray(recipe.itens) || recipe.itens.length === 0) {
      throw new Error(`A receita "${recipe.nome}" não contém insumos.`);
    }
    const path = new Set(ancestry).add(recipe.id);

    for (const ingredient of recipe.itens) {
      if (!Number.isFinite(ingredient.quantidadeUsada) || ingredient.quantidadeUsada <= 0) {
        throw new Error(`A receita "${recipe.nome}" contém uma quantidade de insumo inválida.`);
      }

      if (ingredient.sourceType === 'receita' || ingredient.receitaId) {
        const baseRecipeId = ingredient.receitaId;
        const baseRecipe = baseRecipeId ? recipeById.get(baseRecipeId) : undefined;
        if (!baseRecipe) throw new Error(`A receita-base "${baseRecipeId ?? ''}" não foi encontrada.`);
        const rendimentoVendavel = baseRecipe.unidadesVendaveis ?? (
          baseRecipe.rendimento - (Number(baseRecipe.unidadesPerdidas) || 0)
        );
        if (!Number.isFinite(rendimentoVendavel) || rendimentoVendavel <= 0) {
          throw new Error(`A receita-base "${baseRecipe.nome}" não tem rendimento vendável válido.`);
        }
        const amount = convertStockQuantity(
          ingredient.quantidadeUsada,
          ingredient.unidadeUsada,
          normalizeYieldUnit(baseRecipe.rendimentoUnidade),
          ingredient.conversoes
        );
        collect(baseRecipe, factor * amount / rendimentoVendavel, path);
        continue;
      }

      if (!ingredient.insumoId) throw new Error('Um item da receita não está vinculado a um insumo.');
      const item = itemById.get(ingredient.insumoId);
      if (!item) throw new Error(`O insumo "${ingredient.insumoId}" não foi encontrado no estoque.`);
      const amount = convertStockQuantity(
        ingredient.quantidadeUsada * factor,
        ingredient.unidadeUsada,
        item.unidade,
        ingredient.conversoes || item.conversoes
      );
      requirements.set(item.id, (requirements.get(item.id) ?? 0) + amount);
    }
  }

  const recipe = recipeById.get(recipeId);
  if (!recipe) throw new Error('A receita selecionada não foi encontrada.');
  collect(recipe, batches, new Set());

  return [...requirements].map(([id, quantity]) => {
    const item = itemById.get(id)!;
    const available = item.estoqueAtual ?? item.quantidade;
    if (!Number.isFinite(available) || available < 0) {
      throw new Error(`O estoque atual de "${item.nome}" é inválido.`);
    }
    if (quantity > available + Number.EPSILON * Math.max(1, available)) {
      throw new Error(
        `Estoque insuficiente de ${item.nome}: disponível ${available} ${item.unidade}, necessário ${quantity} ${item.unidade}.`
      );
    }
    return {
      id,
      nome: item.nome,
      unidade: item.unidade,
      quantidadeAtual: available,
      quantidadeNecessaria: quantity
    };
  });
}

export function calcularListaComprasReceita(
  recipeItems: RecipeStockIngredient[],
  recipes: RecipeStockRecord[],
  items: StockRecord[]
): ShoppingListItem[] {
  const requirements = new Map<string, number>();
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const itemById = new Map(items.map((item) => [item.id, item]));

  function collect(ingredients: RecipeStockIngredient[], factor: number, ancestry: Set<string>) {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      throw new Error('A receita não contém itens para a lista de compras.');
    }

    for (const ingredient of ingredients) {
      if (!Number.isFinite(ingredient.quantidadeUsada) || ingredient.quantidadeUsada <= 0) {
        throw new Error('A receita contém uma quantidade de item inválida para a lista de compras.');
      }

      if (ingredient.sourceType === 'receita' || ingredient.receitaId) {
        const baseRecipeId = ingredient.receitaId;
        const baseRecipe = baseRecipeId ? recipeById.get(baseRecipeId) : undefined;
        if (!baseRecipe) throw new Error(`A receita-base "${baseRecipeId ?? ''}" não foi encontrada.`);
        if (ancestry.has(baseRecipe.id)) {
          throw new Error(`A receita "${baseRecipe.nome}" contém uma dependência circular.`);
        }

        const rendimentoVendavel = baseRecipe.unidadesVendaveis ?? (
          baseRecipe.rendimento - (Number(baseRecipe.unidadesPerdidas) || 0)
        );
        if (!Number.isFinite(rendimentoVendavel) || rendimentoVendavel <= 0) {
          throw new Error(`A receita-base "${baseRecipe.nome}" não tem rendimento vendável válido.`);
        }

        const amount = convertStockQuantity(
          ingredient.quantidadeUsada,
          ingredient.unidadeUsada,
          normalizeYieldUnit(baseRecipe.rendimentoUnidade),
          ingredient.conversoes
        );
        collect(baseRecipe.itens, factor * amount / rendimentoVendavel, new Set(ancestry).add(baseRecipe.id));
        continue;
      }

      if (!ingredient.insumoId) throw new Error('Um item da receita não está vinculado a um insumo.');
      const item = itemById.get(ingredient.insumoId);
      if (!item) throw new Error(`O insumo "${ingredient.insumoId}" não foi encontrado no cadastro.`);
      const amount = convertStockQuantity(
        ingredient.quantidadeUsada * factor,
        ingredient.unidadeUsada,
        item.unidade,
        ingredient.conversoes || item.conversoes
      );
      requirements.set(item.id, (requirements.get(item.id) ?? 0) + amount);
    }
  }

  collect(recipeItems, 1, new Set());

  return [...requirements].map(([id, quantity]) => {
    const item = itemById.get(id);
    if (!item) throw new Error(`O insumo "${id}" não foi encontrado no cadastro.`);
    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      throw new Error(`A embalagem de "${item.nome}" precisa ter uma quantidade válida cadastrada.`);
    }

    const precoEmbalagem = typeof item.preco === 'number' && Number.isFinite(item.preco) && item.preco >= 0
      ? item.preco
      : Number(item.custoUnitario) * item.quantidade;
    if (!Number.isFinite(precoEmbalagem) || precoEmbalagem < 0) {
      throw new Error(`O preço de compra de "${item.nome}" não está cadastrado corretamente.`);
    }

    const proporcaoEmbalagem = quantity / item.quantidade;
    const pacotesNecessarios = Math.max(1, Math.ceil(proporcaoEmbalagem - 1e-9));
    return {
      id,
      nome: item.nome,
      quantidadeNecessaria: quantity,
      unidade: item.unidade,
      quantidadeEmbalagem: item.quantidade,
      precoEmbalagem,
      pacotesNecessarios,
      custoCompra: Math.round(precoEmbalagem * pacotesNecessarios * 100) / 100,
      custoProporcional: Math.round(proporcaoEmbalagem * precoEmbalagem * 100) / 100
    };
  });
}
