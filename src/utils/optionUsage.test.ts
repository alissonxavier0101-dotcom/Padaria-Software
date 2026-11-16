import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarOpcoesPorUso } from './optionUsage.ts';

const opcoes = [
  { valor: 'p1', rotulo: 'Pão Francês' },
  { valor: 'p2', rotulo: 'Bolo de Chocolate' },
  { valor: 'p3', rotulo: 'Croissant' },
  { valor: 'p4', rotulo: 'Torta de Limão' }
];

// Ordem alfabética dos rótulos: Bolo(p2) < Croissant(p3) < Pão(p1) < Torta(p4)
const ordemAlfabetica = ['p2', 'p3', 'p1', 'p4'];

test('historico vazio devolve todas em ordem alfabetica sem mais usados', () => {
  const resultado = ordenarOpcoesPorUso(opcoes, []);
  assert.deepEqual(resultado.map((o) => o.valor), ordemAlfabetica);
  assert.ok(resultado.every((o) => !o.ehMaisUsado));
  assert.ok(resultado.every((o) => o.usos === 0));
});

test('empate na contagem desempata em ordem alfabetica', () => {
  const resultado = ordenarOpcoesPorUso(opcoes, [
    { produtoId: 'p1', status: 'pago' },
    { produtoId: 'p3', status: 'pago' }
  ]);
  // p3 (Croissant) antes de p1 (Pão) pelo desempate alfabetico; depois p2, p4
  assert.deepEqual(resultado.map((o) => o.valor), ['p3', 'p1', 'p2', 'p4']);
  assert.ok(resultado[0].ehMaisUsado);
  assert.ok(resultado[1].ehMaisUsado);
  assert.ok(!resultado[2].ehMaisUsado);
});

test('venda cancelada nao conta na contagem', () => {
  const resultado = ordenarOpcoesPorUso(opcoes, [
    { produtoId: 'p1', status: 'cancelado' },
    { produtoId: 'p1', status: 'cancelado' },
    { produtoId: 'p2', status: 'pago' }
  ]);
  assert.equal(resultado.find((o) => o.valor === 'p1')?.usos, 0);
  assert.equal(resultado.find((o) => o.valor === 'p2')?.usos, 1);
  assert.deepEqual(resultado.map((o) => o.valor), ['p2', 'p3', 'p1', 'p4']);
});

test('produto sem historico fica no final em ordem alfabetica e nao eh mais usado', () => {
  const resultado = ordenarOpcoesPorUso(opcoes, [
    { produtoId: 'p4', status: 'pago' },
    { produtoId: 'p4', status: 'pago' },
    { produtoId: 'p2', status: 'pago' }
  ]);
  // p4 (2 usos) e p2 (1 uso) sao os mais usados; p3 e p1 (0) ficam depois, alfabetico
  assert.deepEqual(resultado.map((o) => o.valor), ['p4', 'p2', 'p3', 'p1']);
  assert.ok(resultado[0].ehMaisUsado);
  assert.ok(resultado[1].ehMaisUsado);
  assert.ok(!resultado[2].ehMaisUsado);
  assert.ok(!resultado[3].ehMaisUsado);
});

test('marca apenas os tres mais usados com uso positivo', () => {
  const resultado = ordenarOpcoesPorUso(opcoes, [
    { produtoId: 'p1', status: 'pago' },
    { produtoId: 'p1', status: 'pago' },
    { produtoId: 'p2', status: 'pago' },
    { produtoId: 'p3', status: 'pago' },
    { produtoId: 'p4', status: 'pago' }
  ]);
  assert.equal(resultado[0].valor, 'p1');
  assert.equal(resultado[0].usos, 2);
  assert.ok(resultado[0].ehMaisUsado);
  assert.ok(resultado[1].ehMaisUsado);
  assert.ok(resultado[2].ehMaisUsado);
  assert.ok(resultado.every((o, i) => i < 3 ? o.ehMaisUsado : !o.ehMaisUsado));
});

test('usa clienteId quando informado obterChave', () => {
  const clientes = [
    { valor: 'c1', rotulo: 'Ana' },
    { valor: 'c2', rotulo: 'Bruno' }
  ];
  const resultado = ordenarOpcoesPorUso(clientes, [
    { clienteId: 'c1', status: 'pago' },
    { clienteId: 'c1', status: 'pago' },
    { clienteId: 'c2', status: 'cancelado' }
  ], (registro) => registro['clienteId'] as string | undefined);
  assert.deepEqual(resultado.map((o) => o.valor), ['c1', 'c2']);
  assert.equal(resultado.find((o) => o.valor === 'c1')?.usos, 2);
  assert.equal(resultado.find((o) => o.valor === 'c2')?.usos, 0);
});
