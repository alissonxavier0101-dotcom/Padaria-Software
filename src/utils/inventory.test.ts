import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularBaixaEstoque,
  calcularListaComprasReceita,
  convertStockQuantity,
  isBelowMinimum,
  type RecipeStockRecord,
  type StockRecord
} from './inventory.ts';

const items: StockRecord[] = [
  { id: 'flour', nome: 'Farinha', unidade: 'kg', quantidade: 5, estoqueAtual: 5, estoqueMinimo: 1 },
  { id: 'milk', nome: 'Leite', unidade: 'ml', quantidade: 2000, estoqueAtual: 2000, estoqueMinimo: 500 },
  { id: 'yeast', nome: 'Fermento', unidade: 'un', quantidade: 10, estoqueAtual: 10, estoqueMinimo: 2 }
];

const recipes: RecipeStockRecord[] = [
  {
    id: 'bread',
    nome: 'Pão caseiro',
    rendimento: 2,
    rendimentoUnidade: 'pães',
    itens: [
      { insumoId: 'flour', quantidadeUsada: 500, unidadeUsada: 'g' },
      { insumoId: 'milk', quantidadeUsada: 250, unidadeUsada: 'ml' },
      { insumoId: 'yeast', quantidadeUsada: 1, unidadeUsada: 'un' }
    ]
  }
];

test('converte unidades compatíveis e usa conversões culinárias cadastradas', () => {
  assert.equal(convertStockQuantity(500, 'g', 'kg'), 0.5);
  assert.equal(convertStockQuantity(1.5, 'L', 'ml'), 1500);
  assert.equal(convertStockQuantity(2, 'xicara', 'g', { baseUnit: 'g', xicara: 120 }), 240);
  assert.equal(convertStockQuantity(50, 'g', 'un', { baseUnit: 'g', un: 50 }), 1);
  assert.throws(() => convertStockQuantity(1, 'kg', 'L'), /Não é possível converter/);
  assert.throws(() => convertStockQuantity(1, 'xicara', 'g'), /Cadastre a conversão/);
});

test('calcula a baixa de estoque pela quantidade de fornadas sem mutar o cadastro', () => {
  const deduction = calcularBaixaEstoque('bread', recipes, items, 2);
  assert.deepEqual(deduction.map(({ id, quantidadeNecessaria }) => [id, quantidadeNecessaria]), [
    ['flour', 1],
    ['milk', 500],
    ['yeast', 2]
  ]);
  assert.equal(items[0].estoqueAtual, 5);
});

test('expande receita-base para os insumos de estoque', () => {
  const nestedRecipes: RecipeStockRecord[] = [
    {
      ...recipes[0],
      rendimento: 2
    },
    {
      id: 'sandwich',
      nome: 'Pão recheado',
      rendimento: 1,
      rendimentoUnidade: 'un',
      itens: [{ sourceType: 'receita', receitaId: 'bread', quantidadeUsada: 2, unidadeUsada: 'un' }]
    }
  ];
  assert.equal(calcularBaixaEstoque('sandwich', nestedRecipes, items, 1)[0].quantidadeNecessaria, 0.5);
});

test('modula o consumo da receita-base pelo rendimento vendável após perdas', () => {
  const nestedRecipes: RecipeStockRecord[] = [
    {
      ...recipes[0],
      rendimento: 2,
      unidadesVendaveis: 1,
      unidadesPerdidas: 1
    },
    {
      id: 'sandwich',
      nome: 'Pão recheado',
      rendimento: 1,
      rendimentoUnidade: 'un',
      itens: [{ sourceType: 'receita', receitaId: 'bread', quantidadeUsada: 1, unidadeUsada: 'un' }]
    }
  ];
  assert.equal(calcularBaixaEstoque('sandwich', nestedRecipes, items, 1)[0].quantidadeNecessaria, 0.5);
});

test('consolida itens repetidos e calcula embalagens inteiras e custo proporcional', () => {
  const packageItems: StockRecord[] = [
    { id: 'flour', nome: 'Farinha', unidade: 'kg', quantidade: 1, preco: 8 },
    { id: 'milk', nome: 'Leite', unidade: 'ml', quantidade: 1000, preco: 5 }
  ];
  const shoppingList = calcularListaComprasReceita([
    { insumoId: 'flour', quantidadeUsada: 500, unidadeUsada: 'g' },
    { insumoId: 'flour', quantidadeUsada: 600, unidadeUsada: 'g' },
    { insumoId: 'milk', quantidadeUsada: 250, unidadeUsada: 'ml' }
  ], [], packageItems);

  assert.deepEqual(shoppingList.map(({ id, quantidadeNecessaria, pacotesNecessarios, custoCompra, custoProporcional }) => [
    id, quantidadeNecessaria, pacotesNecessarios, custoCompra, custoProporcional
  ]), [
    ['flour', 1.1, 2, 16, 8.8],
    ['milk', 250, 1, 5, 1.25]
  ]);
});

test('expande receita-base para calcular a quantidade real de pacotes', () => {
  const packageItems: StockRecord[] = [
    { id: 'flour', nome: 'Farinha', unidade: 'g', quantidade: 1000, preco: 12 }
  ];
  const nestedRecipes: RecipeStockRecord[] = [
    {
      id: 'dough',
      nome: 'Massa',
      rendimento: 4,
      rendimentoUnidade: 'pães',
      itens: [{ insumoId: 'flour', quantidadeUsada: 1200, unidadeUsada: 'g' }]
    },
    {
      id: 'bread',
      nome: 'Pão recheado',
      rendimento: 2,
      rendimentoUnidade: 'un',
      itens: [{ sourceType: 'receita', receitaId: 'dough', quantidadeUsada: 1, unidadeUsada: 'un' }]
    }
  ];

  const list = calcularListaComprasReceita(nestedRecipes[1].itens, nestedRecipes, packageItems);
  assert.equal(list[0].quantidadeNecessaria, 300);
  assert.equal(list[0].pacotesNecessarios, 1);
  assert.equal(list[0].custoProporcional, 3.6);
});

test('informa erro quando insumo, embalagem ou conversão não podem ser resolvidos', () => {
  assert.throws(() => calcularListaComprasReceita([
    { insumoId: 'missing', quantidadeUsada: 1, unidadeUsada: 'un' }
  ], [], items), /não foi encontrado/);
  assert.throws(() => calcularListaComprasReceita([
    { insumoId: 'flour', quantidadeUsada: 1, unidadeUsada: 'g' }
  ], [], [{ ...items[0], quantidade: 0 }]), /quantidade válida cadastrada/);
  assert.throws(() => calcularListaComprasReceita([
    { insumoId: 'flour', quantidadeUsada: 1, unidadeUsada: 'xicara' }
  ], [], items), /Cadastre a conversão/);
});

test('bloqueia a baixa inteira quando faltar algum insumo', () => {
  const lowItems = items.map((item) => item.id === 'flour' ? { ...item, estoqueAtual: 0.5 } : item);
  assert.throws(() => calcularBaixaEstoque('bread', recipes, lowItems, 2), /Estoque insuficiente de Farinha/);
  assert.equal(lowItems[0].estoqueAtual, 0.5);
});

test('valida fornadas e alerta no nível mínimo', () => {
  assert.throws(() => calcularBaixaEstoque('bread', recipes, items, 1.5), /número inteiro/);
  assert.equal(isBelowMinimum({ ...items[2], estoqueAtual: 2 }), true);
  assert.equal(isBelowMinimum(items[0]), false);
});
