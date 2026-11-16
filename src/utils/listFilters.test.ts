import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarFiltros,
  carregarFiltroAba,
  contarPorCategoria,
  criarFiltroPadrao,
  dentroDaFaixaDeData,
  filtrarLista,
  ordenarLista,
  salvarFiltroAba,
  type FiltroLista,
  type OpcoesFiltro
} from './listFilters.ts';

interface ItemTeste {
  id: string;
  nome: string;
  fornecedor?: string;
  categoria: string;
  data?: string;
  valor: number;
}

const itens: ItemTeste[] = [
  { id: '1', nome: 'Farinha de trigo', fornecedor: 'Moinho Sul', categoria: 'seco', data: '2026-01-10', valor: 25.5 },
  { id: '2', nome: 'Leite integral', fornecedor: 'Laticínios Boa', categoria: 'frio', data: '2026-02-05', valor: 4.8 },
  { id: '3', nome: 'Fermento biológico', fornecedor: 'Moinho Sul', categoria: 'seco', data: '2026-01-25', valor: 12 },
  { id: '4', nome: 'Queijo mussarela', fornecedor: 'Laticínios Boa', categoria: 'frio', valor: 38.9 },
  { id: '5', nome: 'Embalagem pão', categoria: 'embalagem', data: '2026-03-01', valor: 0.35 }
];

const opcoes: OpcoesFiltro<ItemTeste> = {
  nome: (item) => item.nome,
  camposBusca: (item) => [item.nome, item.fornecedor],
  categoria: (item) => item.categoria,
  data: (item) => item.data,
  valor: (item) => item.valor
};

function filtro(parcial: Partial<FiltroLista> = {}): FiltroLista {
  return { ...criarFiltroPadrao(), ...parcial };
}

function ids(lista: ItemTeste[]): string[] {
  return lista.map((item) => item.id);
}

class MemoryStorage implements Storage {
  private dados = new Map<string, string>();

  get length(): number {
    return this.dados.size;
  }

  clear(): void {
    this.dados.clear();
  }

  getItem(chave: string): string | null {
    return this.dados.has(chave) ? this.dados.get(chave)! : null;
  }

  key(indice: number): string | null {
    return [...this.dados.keys()][indice] ?? null;
  }

  removeItem(chave: string): void {
    this.dados.delete(chave);
  }

  setItem(chave: string, valor: string): void {
    this.dados.set(chave, String(valor));
  }
}

test('busca por texto ignora acentos, caixa e aceita múltiplos termos', () => {
  assert.deepEqual(ids(filtrarLista(itens, filtro({ busca: 'FARINHA trigo' }), opcoes)), ['1']);
  assert.deepEqual(ids(filtrarLista(itens, filtro({ busca: 'LATICINIOS' }), opcoes)), ['2', '4']);
  assert.deepEqual(ids(filtrarLista(itens, filtro({ busca: 'moinho sul' }), opcoes)), ['1', '3']);
  assert.deepEqual(ids(filtrarLista(itens, filtro({ busca: '   ' }), opcoes)), ['1', '2', '3', '4', '5']);
});

test('filtra por categoria e por faixa de data inclusiva', () => {
  assert.deepEqual(ids(filtrarLista(itens, filtro({ categoria: 'frio' }), opcoes)), ['2', '4']);
  assert.deepEqual(
    ids(filtrarLista(itens, filtro({ dataInicio: '2026-01-10', dataFim: '2026-01-25' }), opcoes)),
    ['1', '3']
  );
  assert.deepEqual(
    ids(filtrarLista(itens, filtro({ dataInicio: '2026-02-01' }), opcoes)),
    ['2', '5']
  );
  assert.deepEqual(
    ids(filtrarLista(itens, filtro({ dataFim: '2026-01-20' }), opcoes)),
    ['1']
  );
});

test('normaliza faixa invertida e descarta itens sem data quando há filtro', () => {
  assert.deepEqual(
    ids(filtrarLista(itens, filtro({ dataInicio: '2026-02-10', dataFim: '2026-01-01' }), opcoes)),
    ['1', '2', '3']
  );
  assert.equal(dentroDaFaixaDeData(undefined, '2026-01-01', '2026-12-31'), false);
  assert.equal(dentroDaFaixaDeData('2026-05-10T12:00:00Z', '2026-05-10', '2026-05-10'), true);
});

test('ordena por nome em ordem crescente e decrescente sem mutar a lista', () => {
  const original = [...itens];
  assert.deepEqual(ids(ordenarLista(itens, 'nome-asc', opcoes)), ['5', '1', '3', '2', '4']);
  assert.deepEqual(ids(ordenarLista(itens, 'nome-desc', opcoes)), ['4', '2', '3', '1', '5']);
  assert.deepEqual(itens, original);
});

test('ordena por data mantendo itens sem data ao final', () => {
  assert.deepEqual(ids(ordenarLista(itens, 'data-asc', opcoes)), ['1', '3', '2', '5', '4']);
  assert.deepEqual(ids(ordenarLista(itens, 'data-desc', opcoes)), ['5', '2', '3', '1', '4']);
});

test('ordena por valor numérico crescente e decrescente', () => {
  assert.deepEqual(ids(ordenarLista(itens, 'valor-asc', opcoes)), ['5', '2', '3', '1', '4']);
  assert.deepEqual(ids(ordenarLista(itens, 'valor-desc', opcoes)), ['4', '1', '3', '2', '5']);
});

test('conta categorias dinamicamente a partir da lista já filtrada', () => {  const base = filtrarLista(itens, filtro({ busca: 'moinho' }), opcoes);
  assert.deepEqual(contarPorCategoria(base, ['seco', 'frio', 'embalagem'], opcoes.categoria), {
    todas: 2,
    seco: 2,
    frio: 0,
    embalagem: 0
  });
  assert.equal(contarPorCategoria(itens, ['seco', 'frio', 'embalagem'], opcoes.categoria).todas, 5);
});

test('aplicarFiltros combina busca, categoria, ordem e contagem sem categoria', () => {
  const resultado = aplicarFiltros(
    itens,
    filtro({ categoria: 'seco', ordenacao: 'valor-desc' }),
    opcoes,
    ['seco', 'frio', 'embalagem']
  );
  assert.deepEqual(ids(resultado.itens), ['1', '3']);
  assert.deepEqual(resultado.contagens, { todas: 5, seco: 2, frio: 2, embalagem: 1 });
});

test('filtra por critérios extras como status, forma de pagamento e cliente', () => {
  interface VendaTeste {
    id: string;
    nome: string;
    data: string;
    valor: number;
    status: string;
    forma: string;
    cliente: string;
  }

  const vendas: VendaTeste[] = [
    { id: 'v1', nome: 'Pão', data: '2026-01-02', valor: 10, status: 'pago', forma: 'pix', cliente: 'c1' },
    { id: 'v2', nome: 'Bolo', data: '2026-01-03', valor: 30, status: 'pago', forma: 'dinheiro', cliente: 'c2' },
    { id: 'v3', nome: 'Torta', data: '2026-01-04', valor: 20, status: 'aguardando_pagamento', forma: 'pix', cliente: 'c1' }
  ];

  const opcoesVenda: OpcoesFiltro<VendaTeste> = {
    nome: (venda) => venda.nome,
    camposBusca: (venda) => [venda.nome],
    categoria: () => 'venda',
    data: (venda) => venda.data,
    valor: (venda) => venda.valor,
    extras: (venda) => ({ status: venda.status, forma: venda.forma, cliente: venda.cliente })
  };

  const filtrar = (extras: Record<string, string>) =>
    filtrarLista(vendas, filtro({ extras }), opcoesVenda).map((venda) => venda.id);

  assert.deepEqual(filtrar({ status: 'pago' }), ['v1', 'v2']);
  assert.deepEqual(filtrar({ status: 'pago', forma: 'pix' }), ['v1']);
  assert.deepEqual(filtrar({ forma: 'pix', cliente: 'c1' }), ['v1', 'v3']);
  assert.deepEqual(filtrar({ status: '' }), ['v1', 'v2', 'v3']);
});

test('aplicarFiltros preserva a ordem original quando a ordenação está desativada', () => {
  const resultado = aplicarFiltros(itens, filtro(), opcoes, [], { ordenar: false });
  assert.deepEqual(ids(resultado.itens), ['1', '2', '3', '4', '5']);
});

test('salva e carrega o filtro por aba sem misturar estados', () => {
  const storage = new MemoryStorage();
  const filtroVendas = filtro({
    busca: 'pão',
    categoria: 'seco',
    ordenacao: 'data-desc',
    dataInicio: '2026-01-01',
    dataFim: '2026-01-31'
  });
  const filtroInsumos = filtro({ busca: 'farinha', ordenacao: 'valor-asc' });

  salvarFiltroAba('vendas', filtroVendas, storage);
  salvarFiltroAba('insumos', filtroInsumos, storage);

  assert.deepEqual(carregarFiltroAba('vendas', storage), filtroVendas);
  assert.deepEqual(carregarFiltroAba('insumos', storage), filtroInsumos);
  assert.deepEqual(carregarFiltroAba('clientes', storage), criarFiltroPadrao());
});

test('carregarFiltroAba tolera JSON inválido, dados fora do formato e storage quebrado', () => {
  const storage = new MemoryStorage();
  storage.setItem('padaria:filtroLista:vendas', '{json inválido');
  assert.deepEqual(carregarFiltroAba('vendas', storage), criarFiltroPadrao());

  storage.setItem(
    'padaria:filtroLista:pedidos',
    JSON.stringify({ busca: 42, categoria: 'frio', ordenacao: 'desconhecida', dataInicio: null })
  );
  assert.deepEqual(carregarFiltroAba('pedidos', storage), filtro({ categoria: 'frio' }));

  const storageQuebrado = {
    getItem() {
      throw new Error('sem acesso');
    },
    setItem() {
      throw new Error('sem acesso');
    }
  } as unknown as Storage;

  assert.deepEqual(carregarFiltroAba('vendas', storageQuebrado), criarFiltroPadrao());
  assert.doesNotThrow(() => salvarFiltroAba('vendas', filtro({ busca: 'x' }), storageQuebrado));
});
