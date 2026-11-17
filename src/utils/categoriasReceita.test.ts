import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIAS_RECEITA_PADRAO,
  gerarSlugCategoria,
  validarNomeCategoria,
  categoriaDuplicada,
  ordenarCategoriasReceita,
  prepararCategoriasReceita,
  resolverCategoriaReceita,
  contarReceitasPorCategoria,
  obterPrimeiraCategoria,
  planejarRealocacaoReceitas,
  type CategoriaReceita,
} from './categoriasReceita.ts';

test('gerarSlugCategoria normaliza acentos, caixa e caracteres especiais', () => {
  assert.equal(gerarSlugCategoria('Pães'), 'paes');
  assert.equal(gerarSlugCategoria('Doces & Bolos!'), 'doces-bolos');
  assert.equal(gerarSlugCategoria('  Salgados  '), 'salgados');
  assert.equal(gerarSlugCategoria('   '), '');
  assert.equal(gerarSlugCategoria(null), '');
});

test('validarNomeCategoria aceita 1 e 40 caracteres e rejeita fora do limite', () => {
  assert.equal(validarNomeCategoria('X').valido, true);
  assert.equal(validarNomeCategoria('A'.repeat(40)).valido, true);
  assert.equal(validarNomeCategoria('').valido, false);
  assert.equal(validarNomeCategoria('   ').valido, false);
  assert.equal(validarNomeCategoria(null).valido, false);
  assert.equal(validarNomeCategoria('A'.repeat(41)).valido, false);
  assert.equal(validarNomeCategoria('A'.repeat(41)).motivo?.includes('40'), true);
});

test('categoriaDuplicada ignora acento e caixa', () => {
  const base: CategoriaReceita[] = [...CATEGORIAS_RECEITA_PADRAO];
  assert.equal(categoriaDuplicada(base, 'paes'), true);
  assert.equal(categoriaDuplicada(base, 'PÃES'), true);
  assert.equal(categoriaDuplicada(base, 'Doces'), false);
  // renomear a própria categoria não conta como duplicata
  assert.equal(categoriaDuplicada(base, 'Pães', 'paes'), false);
  // slug colidindo também é duplicata
  assert.equal(categoriaDuplicada([...base, { id: 'x', nome: 'Pães ' }], 'paes'), true);
});

test('ordenarCategoriasReceita mantém padrões primeiro e alfabeto depois', () => {
  const lista: CategoriaReceita[] = [
    { id: 'z', nome: 'Zumbi' },
    { id: 'bolos', nome: 'Bolos' },
    { id: 'paes', nome: 'Pães' },
    { id: 'a', nome: 'Doces' },
  ];
  const ordenados = ordenarCategoriasReceita(lista);
  assert.equal(ordenados[0].id, 'paes');
  assert.equal(ordenados[1].id, 'bolos');
  assert.equal(ordenados[2].id, 'a');
  assert.equal(ordenados[3].id, 'z');
});

test('prepararCategoriasReceita remove duplicados por id', () => {
  const lista: CategoriaReceita[] = [
    { id: 'paes', nome: 'Pães' },
    { id: 'paes', nome: 'Pães Duplicado' },
    { id: 'bolos', nome: 'Bolos' },
  ];
  const preparados = prepararCategoriasReceita(lista);
  assert.equal(preparados.length, 2);
});

test('obterPrimeiraCategoria retorna null quando não há categorias', () => {
  assert.equal(obterPrimeiraCategoria([]), null);
  assert.equal(obterPrimeiraCategoria(CATEGORIAS_RECEITA_PADRAO)?.id, 'paes');
});

test('resolverCategoriaReceita mantém categoria válida e fallback na primeira', () => {
  const base: CategoriaReceita[] = [...CATEGORIAS_RECEITA_PADRAO];
  assert.equal(resolverCategoriaReceita({ categoria: 'bolos' }, base), 'bolos');
  assert.equal(resolverCategoriaReceita({ categoria: null }, base), 'paes');
  assert.equal(resolverCategoriaReceita({ categoria: undefined }, base), 'paes');
  assert.equal(resolverCategoriaReceita({ categoria: '' }, base), 'paes');
  assert.equal(resolverCategoriaReceita({ categoria: 'inexistente' }, base), 'paes');
  assert.equal(resolverCategoriaReceita(null, base), 'paes');
  assert.equal(resolverCategoriaReceita({ categoria: 'Pães' }, base), 'paes');
  assert.equal(resolverCategoriaReceita({ categoria: 'inexistente' }, []), null);
});

test('contarReceitasPorCategoria preserva as 19 receitas e fallback da primeira', () => {
  const receitas: Array<{ categoria?: string | null }> = [
    ...Array(8).fill(0).map(() => ({ categoria: 'paes' })),
    ...Array(4).fill(0).map(() => ({ categoria: 'bolos' })),
    ...Array(3).fill(0).map(() => ({ categoria: 'salgados' })),
    ...Array(3).fill(0).map(() => ({ categoria: 'outros' })),
    { categoria: null },
  ];
  assert.equal(receitas.length, 19);
  const contagens = contarReceitasPorCategoria(receitas, CATEGORIAS_RECEITA_PADRAO);
  assert.equal(contagens.todos, 19);
  assert.equal(contagens.paes, 9);
  assert.equal(contagens.bolos, 4);
  assert.equal(contagens.salgados, 3);
  assert.equal(contagens.outros, 3);
});

test('contarReceitasPorCategoria não perde totais quando categoria some', () => {
  const receitas: Array<{ categoria?: string | null }> = [
    { categoria: 'paes' },
    { categoria: 'bolos' },
    { categoria: 'removida' },
  ];
  const semPaoes = CATEGORIAS_RECEITA_PADRAO.filter((c) => c.id !== 'paes');
  const contagens = contarReceitasPorCategoria(receitas, semPaoes);
  assert.equal(contagens.todos, 3);
  assert.equal(contagens.bolos, 3);
  const soma = Object.values(contagens).reduce((a, b) => a + b, 0) - contagens.todos;
  assert.equal(soma, contagens.todos);
});

test('planejarRealocacaoReceitas conta e lista receitas a mover', () => {
  const receitas = [
    { id: 'r1', categoria: 'paes' },
    { id: 'r2', categoria: 'paes' },
    { id: 'r3', categoria: 'bolos' },
    { id: 'r4', categoria: null },
  ];
  const plano = planejarRealocacaoReceitas(receitas, CATEGORIAS_RECEITA_PADRAO, 'paes', 'bolos');
  assert.equal(plano.origemId, 'paes');
  assert.equal(plano.destinoId, 'bolos');
  assert.equal(plano.movidas, 3);
  assert.deepEqual(plano.ids, ['r1', 'r2', 'r4']);
});

test('planejarRealocacaoReceitas não planeja movimento para a mesma categoria', () => {
  const receitas = [{ id: 'r1', categoria: 'paes' }];
  const plano = planejarRealocacaoReceitas(receitas, CATEGORIAS_RECEITA_PADRAO, 'paes', 'paes');
  assert.equal(plano.movidas, 0);
  assert.deepEqual(plano.ids, []);
});

test('planejarRealocacaoReceitas trata categorias vazias sem quebrar', () => {
  const receitas = [{ id: 'r1', categoria: 'paes' }];
  const plano = planejarRealocacaoReceitas(receitas, [], 'paes', 'bolos');
  assert.equal(plano.movidas, 0);
});
