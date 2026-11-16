import test from 'node:test';
import assert from 'node:assert/strict';
import { ultimaFormaPagamentoDoCliente } from './formaPagamentoCliente.ts';

const vendas = [
  { clienteId: 'c1', formaPagamento: 'pix', status: 'pago' },
  { clienteId: 'c1', formaPagamento: 'dinheiro', status: 'cancelado' },
  { clienteId: 'c1', formaPagamento: 'cartao_credito', status: 'pago' },
  { clienteId: 'c2', formaPagamento: 'nao_informado', status: 'pago' },
  { clienteId: 'c2', formaPagamento: 'transferencia', status: 'cancelado' },
  { clienteId: 'c3', formaPagamento: 'dinheiro', status: 'pago' }
];

test('cliente sem vendas retorna undefined', () => {
  assert.equal(ultimaFormaPagamentoDoCliente('c99', vendas), undefined);
});

test('cliente null ou undefined retorna undefined', () => {
  assert.equal(ultimaFormaPagamentoDoCliente(null, vendas), undefined);
  assert.equal(ultimaFormaPagamentoDoCliente(undefined, vendas), undefined);
});

test('cliente com apenas vendas canceladas e nao_informado retorna undefined', () => {
  assert.equal(ultimaFormaPagamentoDoCliente('c2', vendas), undefined);
});

test('retorna a ultima forma de pagamento nao cancelada do cliente', () => {
  // c1 tem pix (pago), dinheiro (cancelado), cartao_credito (pago) -> ultima eh cartao_credito
  assert.equal(ultimaFormaPagamentoDoCliente('c1', vendas), 'cartao_credito');
});

test('ignora vendas canceladas na contagem', () => {
  const vendasClienteCancelado = [
    { clienteId: 'c3', formaPagamento: 'dinheiro', status: 'cancelado' }
  ];
  assert.equal(ultimaFormaPagamentoDoCliente('c3', vendasClienteCancelado), undefined);
});

test('cliente com apenas uma venda valida retorna essa forma', () => {
  assert.equal(ultimaFormaPagamentoDoCliente('c3', vendas), 'dinheiro');
});
