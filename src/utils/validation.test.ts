import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dataISOValida,
  possuiErros,
  validarCliente,
  validarDataNaoFutura,
  validarDespesaFixa,
  validarEdicaoProducao,
  validarEdicaoVenda,
  validarInsumo,
  validarMovimentacaoFinanceira,
  validarPedido,
  validarProducao,
  validarQuantidadePositiva,
  validarTelefone,
  validarVenda,
  validarValorNaoNegativo,
  validarValorPositivo
} from './validation.ts';

const hoje = '2026-11-16';

test('quantidade deve ser maior que zero', () => {
  assert.match(validarQuantidadePositiva(0) || '', /maior que zero/);
  assert.match(validarQuantidadePositiva(-1) || '', /maior que zero/);
  assert.match(validarQuantidadePositiva('') || '', /válida/);
  assert.equal(validarQuantidadePositiva(1), null);
  assert.equal(validarQuantidadePositiva('2.5'), null);
});

test('quantidade inteira é exigida quando a regra do Firestore pede', () => {
  assert.match(validarQuantidadePositiva(1.5, { inteiro: true }) || '', /inteiro/);
  assert.equal(validarQuantidadePositiva(2, { inteiro: true }), null);
  assert.match(validarProducao({ data: hoje, quantidade: 0 }, hoje).quantidade || '', /maior que zero/);
  assert.match(validarProducao({ data: hoje, quantidade: 1.5 }, hoje).quantidade || '', /inteiro/);
});

test('valor não pode ser negativo', () => {
  assert.match(validarValorNaoNegativo(-0.01, 'valor unitário') || '', /não pode ser negativo/);
  assert.match(validarValorNaoNegativo('', 'valor unitário') || '', /válido/);
  assert.equal(validarValorNaoNegativo(0, 'valor unitário'), null);
  assert.equal(validarValorNaoNegativo(12.5, 'valor unitário'), null);
});

test('valor positivo é exigido em movimentações e despesas fixas', () => {
  assert.match(validarValorPositivo(0) || '', /maior que zero/);
  assert.match(validarValorPositivo(-5) || '', /maior que zero/);
  assert.equal(validarValorPositivo(0.01), null);
});

test('telefone deve ter 10 ou 11 dígitos', () => {
  assert.equal(validarTelefone('(11) 99999-9999'), null);
  assert.equal(validarTelefone('1133334444'), null);
  assert.match(validarTelefone('119999999') || '', /10 ou 11 dígitos/);
  assert.match(validarTelefone('119999999999') || '', /10 ou 11 dígitos/);
  assert.match(validarTelefone('abc') || '', /10 ou 11 dígitos/);
  assert.match(validarTelefone('(11) 99999-9999 ramal 123456789') || '', /máximo 30/);
});

test('data deve ser ISO válida e não futura quando for produção', () => {
  assert.equal(dataISOValida('2026-11-16'), true);
  assert.equal(dataISOValida('2026-02-30'), false);
  assert.equal(dataISOValida('16/11/2026'), false);
  assert.equal(validarDataNaoFutura('2026-11-16', hoje), null);
  assert.equal(validarDataNaoFutura('2026-11-15', hoje), null);
  assert.match(validarDataNaoFutura('2026-11-17', hoje) || '', /não pode ser futura/);
  assert.match(validarDataNaoFutura('', hoje) || '', /válida/);
});

test('validação de venda espelha as regras do Firestore', () => {
  const valida = {
    produtoId: 'receita-1',
    produtoNome: 'Pão francês',
    clienteId: '',
    clienteNome: 'Cliente avulso',
    quantidade: '2',
    valorUnitario: '0',
    data: hoje,
    formaPagamento: 'pix',
    status: 'pago'
  };
  assert.equal(possuiErros(validarVenda(valida)), false);
  assert.equal(validarVenda({ ...valida, valorUnitario: 0 }).valorUnitario, undefined);

  const erros = validarVenda({
    ...valida,
    produtoId: '',
    quantidade: '0',
    valorUnitario: '-1',
    data: '2026-13-01',
    formaPagamento: 'boleto',
    status: 'desconhecido'
  });
  assert.ok(erros.produto);
  assert.ok(erros.quantidade);
  assert.ok(erros.valorUnitario);
  assert.ok(erros.data);
  assert.ok(erros.formaPagamento);
  assert.ok(erros.status);
});

test('validação de edição de venda aceita quantidade fracionada apenas em produção', () => {
  const base = {
    quantidade: '1.5',
    valorUnitario: '8',
    data: hoje,
    formaPagamento: 'dinheiro',
    status: 'pago'
  };
  assert.ok(validarEdicaoVenda(base).quantidade);
  assert.equal(validarEdicaoVenda(base, { producao: true }).quantidade, undefined);
  assert.ok(validarEdicaoVenda({ ...base, valorUnitario: '-2' }).valorUnitario);
});

test('validação de pedido exige cliente, produto, inteiro e data válida', () => {
  const valido = {
    clienteId: 'cliente-1',
    clienteNome: 'Maria',
    produtoId: 'receita-1',
    produtoNome: 'Bolo',
    quantidade: '2',
    dataEntrega: '2026-12-24',
    status: 'pendente',
    observacoes: ''
  };
  assert.equal(possuiErros(validarPedido(valido)), false);

  const erros = validarPedido({
    clienteId: '',
    clienteNome: '',
    produtoId: '',
    produtoNome: '',
    quantidade: '1.5',
    dataEntrega: '',
    status: 'perdido',
    observacoes: 'x'.repeat(301)
  });
  assert.ok(erros.cliente);
  assert.ok(erros.produto);
  assert.ok(erros.quantidade);
  assert.ok(erros.dataEntrega);
  assert.ok(erros.status);
  assert.ok(erros.observacoes);
});

test('validação de cliente exige nome e telefone com DDD', () => {
  assert.equal(possuiErros(validarCliente({ nome: 'Ana', telefone: '(11) 98888-7777' })), false);

  const erros = validarCliente({ nome: 'x'.repeat(101), telefone: '1234' });
  assert.ok(erros.nome);
  assert.ok(erros.telefone);
});

test('validação de insumo aplica as mesmas regras numéricas do Firestore', () => {
  const valido = {
    nome: 'Farinha',
    fornecedor: 'Mercado',
    grupoComparacao: 'Farinha de trigo',
    marca: '',
    quantidade: '5',
    unidade: 'kg',
    preco: '0',
    estoqueAtual: '0',
    estoqueMinimo: '0'
  };
  assert.equal(possuiErros(validarInsumo(valido)), false);

  const erros = validarInsumo({
    ...valido,
    nome: '',
    fornecedor: '',
    grupoComparacao: '',
    quantidade: '0',
    unidade: 'litro',
    preco: '-1',
    estoqueAtual: '-1',
    estoqueMinimo: '-1'
  });
  assert.ok(erros.nome);
  assert.ok(erros.fornecedor);
  assert.ok(erros.grupoComparacao);
  assert.ok(erros.quantidade);
  assert.ok(erros.unidade);
  assert.ok(erros.preco);
  assert.ok(erros.estoqueAtual);
  assert.ok(erros.estoqueMinimo);
});

test('validação de produção bloqueia data futura e fornadas inválidas', () => {
  assert.equal(possuiErros(validarProducao({
    data: '2026-11-15',
    quantidade: '2',
    clienteId: '',
    clienteNome: 'Cliente avulso',
    formaPagamento: 'nao_informado'
  }, hoje)), false);

  const erros = validarProducao({
    data: '2026-11-17',
    quantidade: '0',
    clienteId: '',
    clienteNome: '',
    formaPagamento: 'bitcoin'
  }, hoje);
  assert.match(erros.data, /não pode ser futura/);
  assert.ok(erros.quantidade);
  assert.ok(erros.formaPagamento);
});

test('validação de edição de produção bloqueia data futura, quantidade e preço inválidos', () => {
  const erros = validarEdicaoProducao({
    data: '2026-11-17',
    quantidadeProduzida: '0',
    precoVendaUnitario: '-1'
  }, hoje);
  assert.ok(erros.data);
  assert.ok(erros.quantidade);
  assert.ok(erros.preco);
});

test('validação financeira exige categoria compatível e valor positivo', () => {
  assert.equal(possuiErros(validarMovimentacaoFinanceira({
    tipo: 'saida',
    categoria: 'despesa_variavel',
    descricao: 'Compra de embalagens',
    valor: '10',
    data: hoje
  })), false);

  const erros = validarMovimentacaoFinanceira({
    tipo: 'entrada',
    categoria: 'despesa_fixa',
    descricao: '',
    valor: '0',
    data: ''
  });
  assert.ok(erros.categoria);
  assert.ok(erros.descricao);
  assert.ok(erros.valor);
  assert.ok(erros.data);
});

test('validação de despesa fixa exige nome, valor positivo e dia entre 1 e 31', () => {
  assert.equal(possuiErros(validarDespesaFixa({
    nome: 'Aluguel',
    valorMensal: '1000',
    diaVencimento: '10'
  })), false);

  const erros = validarDespesaFixa({
    nome: '',
    valorMensal: '0',
    diaVencimento: '32'
  });
  assert.ok(erros.nome);
  assert.ok(erros.valorMensal);
  assert.ok(erros.diaVencimento);
});
