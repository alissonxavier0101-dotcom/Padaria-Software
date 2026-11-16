export type ValidationErrors = Record<string, string>;

export const FORMAS_PAGAMENTO = [
  'nao_informado',
  'pix',
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'transferencia'
] as const;

export const STATUS_VENDA = [
  'pago',
  'aguardando_pagamento',
  'em_processo',
  'pronto',
  'entregue',
  'cancelado'
] as const;

export const STATUS_PEDIDO = ['pendente', 'produzido', 'entregue', 'pago'] as const;

export const UNIDADES_INSUMO = ['kg', 'g', 'L', 'ml', 'un'] as const;

export const TIPOS_MOVIMENTACAO = ['entrada', 'saida'] as const;

export const CATEGORIAS_ENTRADA = ['outra_entrada'] as const;

export const CATEGORIAS_SAIDA = ['despesa_variavel', 'despesa_fixa', 'retirada'] as const;

export function paraTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim();
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

export function paraNumero(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (!texto) return Number.NaN;
    return Number(texto);
  }
  return Number.NaN;
}

export function contarDigitos(valor: unknown): number {
  return paraTexto(valor).replace(/\D/g, '').length;
}

export function telefoneValido(valor: unknown): boolean {
  const digitos = contarDigitos(valor);
  return digitos === 10 || digitos === 11;
}

export function validarTelefone(valor: unknown): string | null {
  if (paraTexto(valor).length > 30) return 'O telefone deve ter no máximo 30 caracteres.';
  if (!telefoneValido(valor)) return 'Informe um telefone com 10 ou 11 dígitos (com DDD).';
  return null;
}

export function validarTextoObrigatorio(
  valor: unknown,
  rotulo: string,
  maximo: number
): string | null {
  const texto = paraTexto(valor);
  if (!texto) return `Informe ${rotulo}.`;
  if (texto.length > maximo) return `O campo ${rotulo} deve ter no máximo ${maximo} caracteres.`;
  return null;
}

export function validarTextoTamanho(valor: unknown, rotulo: string, maximo: number): string | null {
  const texto = paraTexto(valor);
  if (texto.length > maximo) return `O campo ${rotulo} deve ter no máximo ${maximo} caracteres.`;
  return null;
}

export function validarQuantidadePositiva(
  valor: unknown,
  opcoes: { inteiro?: boolean; rotulo?: string } = {}
): string | null {
  const rotulo = opcoes.rotulo || 'quantidade';
  const numero = paraNumero(valor);
  if (!Number.isFinite(numero)) return `Informe uma ${rotulo} válida.`;
  if (numero <= 0) return `A ${rotulo} deve ser maior que zero.`;
  if (opcoes.inteiro && !Number.isInteger(numero)) return `A ${rotulo} deve ser um número inteiro.`;
  return null;
}

export function validarValorNaoNegativo(valor: unknown, rotulo = 'valor'): string | null {
  const numero = paraNumero(valor);
  if (!Number.isFinite(numero)) return `Informe um ${rotulo} válido.`;
  if (numero < 0) return `O ${rotulo} não pode ser negativo.`;
  return null;
}

export function validarValorPositivo(valor: unknown, rotulo = 'valor'): string | null {
  const numero = paraNumero(valor);
  if (!Number.isFinite(numero)) return `Informe um ${rotulo} válido.`;
  if (numero <= 0) return `O ${rotulo} deve ser maior que zero.`;
  return null;
}

export function validarInteiroNoIntervalo(
  valor: unknown,
  minimo: number,
  maximo: number,
  rotulo: string
): string | null {
  const numero = paraNumero(valor);
  if (!Number.isFinite(numero)) return `Informe ${rotulo}.`;
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    return `${rotulo} deve ser um número inteiro entre ${minimo} e ${maximo}.`;
  }
  return null;
}

export function dataISOValida(valor: unknown): boolean {
  const data = paraTexto(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const parsed = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === data;
}

export function validarDataISO(valor: unknown, rotulo = 'data'): string | null {
  if (!dataISOValida(valor)) return `Informe uma ${rotulo} válida.`;
  return null;
}

export function validarDataNaoFutura(valor: unknown, hoje: string, rotulo = 'data'): string | null {
  const erroFormato = validarDataISO(valor, rotulo);
  if (erroFormato) return erroFormato;
  if (paraTexto(valor) > hoje) return `A ${rotulo} não pode ser futura.`;
  return null;
}

export function validarOpcao(
  valor: unknown,
  opcoes: readonly string[],
  rotulo: string
): string | null {
  if (!opcoes.includes(paraTexto(valor))) return `Selecione ${rotulo} válido.`;
  return null;
}

export function validarVenda(dados: {
  produtoId?: unknown;
  produtoNome?: unknown;
  clienteId?: unknown;
  clienteNome?: unknown;
  quantidade?: unknown;
  valorUnitario?: unknown;
  data?: unknown;
  formaPagamento?: unknown;
  status?: unknown;
}): ValidationErrors {
  const erros: ValidationErrors = {};

  if (!paraTexto(dados.produtoId)) erros.produto = 'Selecione um produto.';
  const erroProdutoNome = validarTextoTamanho(dados.produtoNome, 'nome do produto', 100);
  if (erroProdutoNome) erros.produto = erroProdutoNome;

  const erroClienteId = validarTextoTamanho(dados.clienteId, 'identificador do cliente', 128);
  if (erroClienteId) erros.cliente = erroClienteId;
  const erroClienteNome = validarTextoTamanho(dados.clienteNome, 'nome do cliente', 100);
  if (erroClienteNome) erros.cliente = erroClienteNome;

  const erroQuantidade = validarQuantidadePositiva(dados.quantidade);
  if (erroQuantidade) erros.quantidade = erroQuantidade;

  const erroValor = validarValorNaoNegativo(dados.valorUnitario, 'valor unitário');
  if (erroValor) erros.valorUnitario = erroValor;

  const erroData = validarDataISO(dados.data);
  if (erroData) erros.data = erroData;

  const erroForma = validarOpcao(dados.formaPagamento, FORMAS_PAGAMENTO, 'uma forma de pagamento');
  if (erroForma) erros.formaPagamento = erroForma;

  const erroStatus = validarOpcao(dados.status, STATUS_VENDA, 'um status de venda');
  if (erroStatus) erros.status = erroStatus;

  return erros;
}

export function validarEdicaoVenda(
  dados: {
    quantidade?: unknown;
    valorUnitario?: unknown;
    data?: unknown;
    formaPagamento?: unknown;
    status?: unknown;
  },
  opcoes: { producao?: boolean } = {}
): ValidationErrors {
  const erros: ValidationErrors = {};

  const erroQuantidade = validarQuantidadePositiva(dados.quantidade, {
    inteiro: !opcoes.producao,
    rotulo: 'quantidade da venda'
  });
  if (erroQuantidade) erros.quantidade = erroQuantidade;

  const erroValor = validarValorNaoNegativo(dados.valorUnitario, 'valor unitário');
  if (erroValor) erros.valorUnitario = erroValor;

  const erroData = validarDataISO(dados.data, 'data da venda');
  if (erroData) erros.data = erroData;

  const erroForma = validarOpcao(dados.formaPagamento, FORMAS_PAGAMENTO, 'uma forma de pagamento');
  if (erroForma) erros.formaPagamento = erroForma;

  const erroStatus = validarOpcao(dados.status, STATUS_VENDA, 'um status de venda');
  if (erroStatus) erros.status = erroStatus;

  return erros;
}

export function validarPedido(dados: {
  clienteId?: unknown;
  clienteNome?: unknown;
  produtoId?: unknown;
  produtoNome?: unknown;
  quantidade?: unknown;
  dataEntrega?: unknown;
  status?: unknown;
  observacoes?: unknown;
}): ValidationErrors {
  const erros: ValidationErrors = {};

  if (!paraTexto(dados.clienteId)) erros.cliente = 'Selecione um cliente.';
  const erroClienteNome = validarTextoObrigatorio(dados.clienteNome, 'o nome do cliente', 100);
  if (erroClienteNome) erros.cliente = erroClienteNome;

  if (!paraTexto(dados.produtoId)) erros.produto = 'Selecione um produto.';
  const erroProdutoNome = validarTextoObrigatorio(dados.produtoNome, 'o nome do produto', 100);
  if (erroProdutoNome) erros.produto = erroProdutoNome;

  const erroQuantidade = validarQuantidadePositiva(dados.quantidade, {
    inteiro: true,
    rotulo: 'quantidade'
  });
  if (erroQuantidade) erros.quantidade = erroQuantidade;

  const erroData = validarDataISO(dados.dataEntrega, 'data de entrega');
  if (erroData) erros.dataEntrega = erroData;

  const erroStatus = validarOpcao(dados.status, STATUS_PEDIDO, 'um status de pedido');
  if (erroStatus) erros.status = erroStatus;

  const erroObservacoes = validarTextoTamanho(dados.observacoes, 'observações', 300);
  if (erroObservacoes) erros.observacoes = erroObservacoes;

  return erros;
}

export function validarCliente(dados: { nome?: unknown; telefone?: unknown }): ValidationErrors {
  const erros: ValidationErrors = {};

  const erroNome = validarTextoObrigatorio(dados.nome, 'o nome do cliente', 100);
  if (erroNome) erros.nome = erroNome;

  const erroTelefone = validarTelefone(dados.telefone);
  if (erroTelefone) erros.telefone = erroTelefone;

  return erros;
}

export function validarInsumo(dados: {
  nome?: unknown;
  fornecedor?: unknown;
  grupoComparacao?: unknown;
  marca?: unknown;
  quantidade?: unknown;
  unidade?: unknown;
  preco?: unknown;
  estoqueAtual?: unknown;
  estoqueMinimo?: unknown;
}): ValidationErrors {
  const erros: ValidationErrors = {};

  const erroNome = validarTextoObrigatorio(dados.nome, 'o nome do insumo', 100);
  if (erroNome) erros.nome = erroNome;

  const erroFornecedor = validarTextoObrigatorio(dados.fornecedor, 'o fornecedor', 100);
  if (erroFornecedor) erros.fornecedor = erroFornecedor;

  const erroGrupo = validarTextoObrigatorio(dados.grupoComparacao, 'o grupo de comparação', 100);
  if (erroGrupo) erros.grupoComparacao = erroGrupo;

  const erroMarca = validarTextoTamanho(dados.marca, 'marca', 100);
  if (erroMarca) erros.marca = erroMarca;

  const erroQuantidade = validarQuantidadePositiva(dados.quantidade);
  if (erroQuantidade) erros.quantidade = erroQuantidade;

  const erroUnidade = validarOpcao(dados.unidade, UNIDADES_INSUMO, 'uma unidade de compra');
  if (erroUnidade) erros.unidade = erroUnidade;

  const erroPreco = validarValorNaoNegativo(dados.preco, 'preço');
  if (erroPreco) erros.preco = erroPreco;

  const erroEstoqueAtual = validarValorNaoNegativo(dados.estoqueAtual, 'estoque atual');
  if (erroEstoqueAtual) erros.estoqueAtual = erroEstoqueAtual;

  const erroEstoqueMinimo = validarValorNaoNegativo(dados.estoqueMinimo, 'estoque mínimo');
  if (erroEstoqueMinimo) erros.estoqueMinimo = erroEstoqueMinimo;

  return erros;
}

export function validarProducao(
  dados: {
    data?: unknown;
    quantidade?: unknown;
    clienteId?: unknown;
    clienteNome?: unknown;
    formaPagamento?: unknown;
  },
  hoje: string
): ValidationErrors {
  const erros: ValidationErrors = {};

  const erroData = validarDataNaoFutura(dados.data, hoje, 'data da produção');
  if (erroData) erros.data = erroData;

  const erroQuantidade = validarQuantidadePositiva(dados.quantidade, {
    inteiro: true,
    rotulo: 'quantidade de fornadas'
  });
  if (erroQuantidade) erros.quantidade = erroQuantidade;

  const erroClienteId = validarTextoTamanho(dados.clienteId, 'identificador do cliente', 128);
  if (erroClienteId) erros.cliente = erroClienteId;
  const erroClienteNome = validarTextoTamanho(dados.clienteNome, 'nome do cliente', 100);
  if (erroClienteNome) erros.cliente = erroClienteNome;

  const erroForma = validarOpcao(dados.formaPagamento, FORMAS_PAGAMENTO, 'uma forma de pagamento');
  if (erroForma) erros.formaPagamento = erroForma;

  return erros;
}

export function validarEdicaoProducao(
  dados: { data?: unknown; quantidadeProduzida?: unknown; precoVendaUnitario?: unknown },
  hoje: string
): ValidationErrors {
  const erros: ValidationErrors = {};

  const erroData = validarDataNaoFutura(dados.data, hoje, 'data da produção');
  if (erroData) erros.data = erroData;

  const erroQuantidade = validarQuantidadePositiva(dados.quantidadeProduzida, {
    rotulo: 'quantidade produzida'
  });
  if (erroQuantidade) erros.quantidade = erroQuantidade;

  const erroPreco = validarValorNaoNegativo(dados.precoVendaUnitario, 'preço de venda');
  if (erroPreco) erros.preco = erroPreco;

  return erros;
}

export function validarMovimentacaoFinanceira(dados: {
  tipo?: unknown;
  categoria?: unknown;
  descricao?: unknown;
  valor?: unknown;
  data?: unknown;
}): ValidationErrors {
  const erros: ValidationErrors = {};
  const tipo = paraTexto(dados.tipo);

  if (!TIPOS_MOVIMENTACAO.includes(tipo as (typeof TIPOS_MOVIMENTACAO)[number])) {
    erros.tipo = 'Selecione um tipo de movimentação válido.';
  }

  const categorias: readonly string[] = tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  if (!categorias.includes(paraTexto(dados.categoria))) {
    erros.categoria = 'Selecione uma categoria compatível com o tipo.';
  }

  const erroDescricao = validarTextoObrigatorio(dados.descricao, 'uma descrição', 120);
  if (erroDescricao) erros.descricao = erroDescricao;

  const erroValor = validarValorPositivo(dados.valor);
  if (erroValor) erros.valor = erroValor;

  const erroData = validarDataISO(dados.data);
  if (erroData) erros.data = erroData;

  return erros;
}

export function validarDespesaFixa(dados: {
  nome?: unknown;
  valorMensal?: unknown;
  diaVencimento?: unknown;
}): ValidationErrors {
  const erros: ValidationErrors = {};

  const erroNome = validarTextoObrigatorio(dados.nome, 'a descrição da despesa', 100);
  if (erroNome) erros.nome = erroNome;

  const erroValor = validarValorPositivo(dados.valorMensal, 'valor mensal');
  if (erroValor) erros.valorMensal = erroValor;

  const erroDia = validarInteiroNoIntervalo(dados.diaVencimento, 1, 31, 'dia do vencimento');
  if (erroDia) erros.diaVencimento = erroDia;

  return erros;
}

export function possuiErros(erros: ValidationErrors): boolean {
  return Object.keys(erros).length > 0;
}

export function obterDataHojeISO(base: Date = new Date()): string {
  return new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
