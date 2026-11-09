import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCustoRealProducao,
  calcularRestauracaoEstoqueProducao,
  calcularResultadoFinanceiroProducao
} from './production.ts';
import type { StockDeduction, StockRecord } from './inventory.ts';

const items: StockRecord[] = [
  { id: 'flour', nome: 'Farinha', unidade: 'kg', quantidade: 5, custoUnitario: 4 },
  { id: 'yeast', nome: 'Fermento', unidade: 'g', quantidade: 500, custoUnitario: 0.02 }
];

const deductions: StockDeduction[] = [
  { id: 'flour', nome: 'Farinha', unidade: 'kg', quantidadeAtual: 5, quantidadeNecessaria: 0.5 },
  { id: 'yeast', nome: 'Fermento', unidade: 'g', quantidadeAtual: 500, quantidadeNecessaria: 100 }
];

test('calcula o custo real com preços atuais do estoque e custos indiretos por fornada', () => {
  assert.deepEqual(calcularCustoRealProducao(deductions, items, { custoIndireto: 3 }, 2, 8), {
    custoInsumos: 4,
    custoIndireto: 6,
    custoReal: 10,
    custoUnitarioReal: 1.25
  });
});

test('rejeita quantidade, custo ou insumo inválidos ao calcular a produção', () => {
  assert.throws(() => calcularCustoRealProducao(deductions, items, {}, 1.5, 4), /número inteiro/);
  assert.throws(() => calcularCustoRealProducao(deductions, items, {}, 1, 0), /quantidade produzida/);
  assert.throws(
    () => calcularCustoRealProducao(deductions, [{ ...items[0], custoUnitario: -1 }, items[1]], {}, 1, 4),
    /custo unitário de "Farinha" é inválido/
  );
  assert.throws(() => calcularCustoRealProducao(deductions, [], {}, 1, 4), /não foi encontrado no estoque/);
});

test('calcula faturamento e lucro total, por fornada e por unidade', () => {
  assert.deepEqual(calcularResultadoFinanceiroProducao(40, 10, 8, 2), {
    faturamento: 80,
    lucro: 40,
    lucroPorFornada: 20,
    lucroPorUnidade: 4
  });
  assert.equal(calcularResultadoFinanceiroProducao(40, 10, 3, 2).lucro, -10);
  assert.throws(() => calcularResultadoFinanceiroProducao(40, 0, 8, 2), /quantidade produzida/);
});

test('calcula a devolução dos insumos consumidos ao estoque atual', () => {
  assert.deepEqual(calcularRestauracaoEstoqueProducao([
    { id: 'flour', nome: 'Farinha', unidade: 'kg', quantidade: 0.5 },
    { id: 'yeast', nome: 'Fermento', unidade: 'g', quantidade: 100 }
  ], [
    { ...items[0], estoqueAtual: 2 },
    { ...items[1], estoqueAtual: 300 }
  ]), [
    { id: 'flour', nome: 'Farinha', unidade: 'kg', estoqueAtual: 2.5 },
    { id: 'yeast', nome: 'Fermento', unidade: 'g', estoqueAtual: 400 }
  ]);
});

test('não restaura estoque sem consumo válido, insumo ou unidade compatível', () => {
  assert.throws(() => calcularRestauracaoEstoqueProducao([], items), /não contém os insumos consumidos/);
  assert.throws(
    () => calcularRestauracaoEstoqueProducao([{ id: 'missing', quantidade: 1 }], items),
    /não foi encontrado/
  );
  assert.throws(
    () => calcularRestauracaoEstoqueProducao([{ id: 'flour', unidade: 'g', quantidade: 1 }], items),
    /unidade.*mudou/
  );
});
