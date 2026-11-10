import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSupplierOffers, getSupplierOfferComparisonKey } from './supplierComparison.ts';

test('compara embalagens de tamanhos e unidades diferentes pelo custo normalizado', () => {
  const offers = compareSupplierOffers([
    { id: 'flour-kg', nome: 'Farinha marca A', grupoComparacao: 'Farinha de trigo', unidade: 'kg', quantidade: 5, preco: 25 },
    { id: 'flour-g', nome: 'Farinha marca B', grupoComparacao: 'farinha de TRIGO', unidade: 'g', quantidade: 1000, preco: 4.8 },
    { id: 'salt', nome: 'Sal', grupoComparacao: 'Sal', unidade: 'kg', quantidade: 1, preco: 5 }
  ]);

  const flour = offers.find(group => group.nome === 'Farinha de trigo');
  assert.ok(flour);
  assert.equal(flour.baseUnit, 'g');
  assert.deepEqual(flour.offers.map(item => item.offer.id), ['flour-g', 'flour-kg']);
  assert.equal(flour.offers[0].pricePerBaseUnit, 0.0048);
});

test('não compara ingredientes de grupos ou dimensões diferentes', () => {
  const mass = { id: 'mass', nome: 'Óleo', grupoComparacao: 'Óleo', unidade: 'L' as const, quantidade: 1, preco: 10 };
  const count = { id: 'count', nome: 'Óleo', grupoComparacao: 'Óleo', unidade: 'un' as const, quantidade: 1, preco: 2 };
  const other = { id: 'other', nome: 'Azeite', grupoComparacao: 'Azeite', unidade: 'L' as const, quantidade: 1, preco: 12 };

  assert.notEqual(getSupplierOfferComparisonKey(mass), getSupplierOfferComparisonKey(count));
  assert.equal(compareSupplierOffers([mass, count, other]).length, 3);
});
