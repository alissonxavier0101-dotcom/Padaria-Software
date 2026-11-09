import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCustoUnitario,
  calcularCustoPorGramaOuMl,
  calcularCustoItemReceita,
  calcularTotaisReceita,
  calcularLucroEPrecificacao,
  formatarMoeda,
  formatarTextoCustoUnitario,
  ItemReceita
} from './costCalculator.ts';

test('calcularCustoUnitario divide corretamente preço por quantidade da embalagem', () => {
  const resultado = calcularCustoUnitario(25, 5);
  assert.equal(resultado, 5);

  const fermento = calcularCustoUnitario(18.5, 500);
  assert.equal(fermento, 0.037);

  const ovos = calcularCustoUnitario(14.4, 12);
  assert.equal(ovos, 1.2);
});

test('calcularCustoUnitario trata valores inválidos e divisão por zero com segurança', () => {
  assert.equal(calcularCustoUnitario(0, 10), 0);
  assert.equal(calcularCustoUnitario(10, 0), 0);
  assert.equal(calcularCustoUnitario(-5, 10), 0);
  assert.equal(calcularCustoUnitario(10, -2), 0);
  assert.equal(calcularCustoUnitario(NaN, 10), 0);
  assert.equal(calcularCustoUnitario(10, NaN), 0);
});

test('calcularCustoPorGramaOuMl divide por 1000 quando unidade for kg ou L', () => {
  assert.equal(calcularCustoPorGramaOuMl(6, 'kg'), 0.006);
  assert.equal(calcularCustoPorGramaOuMl(10, 'L'), 0.01);
  assert.equal(calcularCustoPorGramaOuMl(0.05, 'g'), 0.05);
  assert.equal(calcularCustoPorGramaOuMl(1.5, 'un'), 1.5);
});

test('calcularCustoItemReceita converte unidades corretamente entre insumo e receita', () => {
  // Insumo Farinha: R$ 4,70 por kg. Receita usa 500 g -> R$ 2,35
  const custoFarinha = calcularCustoItemReceita(4.70, 'kg', 500, 'g');
  assert.equal(custoFarinha, 2.35);

  // Insumo Fermento: R$ 0,036 por g. Receita usa 10 g -> R$ 0,36
  const custoFermento = calcularCustoItemReceita(0.036, 'g', 10, 'g');
  assert.equal(custoFermento, 0.36);

  // Insumo Sacola Kraft: R$ 0,45 por un. Receita usa 2 un -> R$ 0,90
  const custoSacola = calcularCustoItemReceita(0.45, 'un', 2, 'un');
  assert.equal(custoSacola, 0.90);

  // Insumo Leite: R$ 5,00 por L. Receita usa 250 ml -> R$ 1,25
  const custoLeite = calcularCustoItemReceita(5.00, 'L', 250, 'ml');
  assert.equal(custoLeite, 1.25);
});

test('calcularCustoItemReceita aplica fatores culinários específicos de cada insumo', () => {
  const conversoesFarinha = {
    baseUnit: 'g' as const,
    xicara: 120,
    colher_sopa: 15,
    colher_cha: 5
  };
  assert.equal(calcularCustoItemReceita(4.70, 'kg', 1, 'xicara', conversoesFarinha), 0.564);
  assert.equal(calcularCustoItemReceita(4.70, 'kg', 1, 'colher_sopa', conversoesFarinha), 0.0705);
  assert.equal(calcularCustoItemReceita(4.70, 'kg', 1, 'colher_cha', conversoesFarinha), 0.0235);

  const conversoesOvo = { baseUnit: 'g' as const, un: 50 };
  assert.equal(calcularCustoItemReceita(1.20, 'un', 1, 'un', conversoesOvo), 1.2);
  assert.equal(calcularCustoItemReceita(1.20, 'un', 25, 'g', conversoesOvo), 0.6);
  assert.equal(calcularCustoItemReceita(1.20, 'un', 1, 'xicara', conversoesOvo), 0);

  const conversoesLeite = { baseUnit: 'ml' as const, colher_sopa: 15 };
  assert.equal(calcularCustoItemReceita(5, 'L', 1, 'colher_sopa', conversoesLeite), 0.075);
});

test('calcularTotaisReceita separa custos de ingredientes e embalagens descartáveis', () => {
  const itens: ItemReceita[] = [
    {
      insumoId: '1',
      insumoNome: 'Farinha Especial',
      categoria: 'ingrediente',
      quantidadeUsada: 1000,
      unidadeUsada: 'g',
      custoUnitarioBase: 4.70,
      unidadeBase: 'kg',
      custoItem: 4.70
    },
    {
      insumoId: '2',
      insumoNome: 'Fermento Seco',
      categoria: 'ingrediente',
      quantidadeUsada: 10,
      unidadeUsada: 'g',
      custoUnitarioBase: 0.036,
      unidadeBase: 'g',
      custoItem: 0.36
    },
    {
      insumoId: '3',
      insumoNome: 'Forma Descartável Forneável',
      categoria: 'embalagem',
      quantidadeUsada: 2,
      unidadeUsada: 'un',
      custoUnitarioBase: 1.10,
      unidadeBase: 'un',
      custoItem: 2.20
    },
    {
      insumoId: '4',
      insumoNome: 'Sacola Kraft com Visor',
      categoria: 'embalagem',
      quantidadeUsada: 2,
      unidadeUsada: 'un',
      custoUnitarioBase: 0.50,
      unidadeBase: 'un',
      custoItem: 1.00
    }
  ];

  // Rendimento de 2 pães
  const totais = calcularTotaisReceita(itens, 2);

  // Ingredientes: 4.70 + 0.36 = 5.06
  assert.equal(totais.custoIngredientes, 5.06);
  // Embalagens: 2.20 + 1.00 = 3.20
  assert.equal(totais.custoEmbalagens, 3.20);
  // Custo total: 5.06 + 3.20 = 8.26
  assert.equal(totais.custoTotal, 8.26);
  // Custo por pão: 8.26 / 2 = 4.13
  assert.equal(totais.custoUnitario, 4.13);
});

test('calcularTotaisReceita inclui custos indiretos e calcula unidades vendáveis', () => {
  const itens: ItemReceita[] = [
    {
      insumoId: 'farinha',
      insumoNome: 'Farinha',
      categoria: 'ingrediente',
      quantidadeUsada: 1,
      unidadeUsada: 'kg',
      custoUnitarioBase: 30,
      unidadeBase: 'kg',
      custoItem: 30
    },
    {
      insumoId: 'sacola',
      insumoNome: 'Sacola',
      categoria: 'embalagem',
      quantidadeUsada: 1,
      unidadeUsada: 'un',
      custoUnitarioBase: 5,
      unidadeBase: 'un',
      custoItem: 5
    }
  ];

  const totais = calcularTotaisReceita(itens, 10, {
    custoEnergia: 8,
    custoAgua: 2,
    tempoPreparoMin: 45,
    valorHoraMaoDeObra: 20,
    unidadesPerdidas: 2
  });

  assert.equal(totais.custoMaoDeObra, 15);
  assert.equal(totais.custoIndireto, 25);
  assert.equal(totais.custoTotal, 60);
  assert.equal(totais.unidadesVendaveis, 8);
  assert.equal(totais.custoUnitario, 7.5);
});

test('calcularTotaisReceita não divide por rendimento vendável zero', () => {
  const totais = calcularTotaisReceita([], 3, { unidadesPerdidas: 3 });
  assert.equal(totais.unidadesVendaveis, 0);
  assert.equal(totais.custoUnitario, 0);
});

test('calcularLucroEPrecificacao projeta preço sugerido e margem real', () => {
  const custoUnitario = 4.13;
  // Margem desejada de 100% => Preço sugerido: R$ 8,26
  const resultado100 = calcularLucroEPrecificacao(custoUnitario, 100);
  assert.equal(resultado100.precoSugerido, 8.26);
  assert.equal(resultado100.precoMinimo, 8.26);
  assert.equal(resultado100.precoAbaixoDoMinimo, false);
  assert.equal(resultado100.lucroPorUnidade, 4.13);
  assert.equal(resultado100.margemReal, 100);

  // Preço de venda praticado definido pelo padeiro: R$ 10,00
  const resultadoPraticado = calcularLucroEPrecificacao(custoUnitario, 100, 10.00);
  assert.equal(resultadoPraticado.precoFinal, 10.00);
  assert.equal(resultadoPraticado.lucroPorUnidade, 5.87); // 10.00 - 4.13
  assert.equal(resultadoPraticado.precoAbaixoDoMinimo, false);
  assert.ok(resultadoPraticado.margemReal > 140);

  const abaixoDoMinimo = calcularLucroEPrecificacao(4.13, 100, 5);
  assert.equal(abaixoDoMinimo.precoAbaixoDoMinimo, true);

  const noMinimo = calcularLucroEPrecificacao(100, 60, 160);
  assert.equal(noMinimo.precoAbaixoDoMinimo, false);
});

test('formatarMoeda gera string em Real Brasileiro (BRL)', () => {
  const formatado = formatarMoeda(25.5);
  assert.ok(formatado.includes('25,50'));
  assert.ok(formatado.includes('R$'));
});

