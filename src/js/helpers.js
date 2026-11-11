import { calcularCustoItemReceita as calcularCustoItemReceitaValidado, calcularTotaisReceita as calcularTotaisReceitaValidado } from '../utils/costCalculator.ts';
import { dom } from './dom.js';
export function calcularCustoUnitario(preco, quantidade) {
        const p = parseFloat(preco);
        const q = parseFloat(quantidade);
        if (!q || q <= 0 || isNaN(q) || isNaN(p) || p < 0) return 0;
        return Math.round((p / q) * 10000) / 10000;
      }

export function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

export function normalizarTextoBusca(valor) {
        return String(valor ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLocaleLowerCase('pt-BR');
      }

export function correspondeBusca(consulta, campos) {
        const termos = normalizarTextoBusca(consulta).trim().split(/\s+/).filter(Boolean);
        if (termos.length === 0) return true;
        const texto = normalizarTextoBusca(campos.filter(Boolean).join(' '));
        return termos.every(termo => texto.includes(termo));
      }

export function formatarMoeda(valor, casas = 2) {
        if (isNaN(valor) || valor === null || valor === undefined) return 'R$ 0,00';
        return Number(valor).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          minimumFractionDigits: casas,
          maximumFractionDigits: casas,
        });
      }

export function formatarCustoComUnidade(custo, unidade) {
        const casas = custo < 1 && custo > 0 ? 4 : 2;
        return `${formatarMoeda(custo, casas)} / ${unidade}`;
      }

export function calcularEquivalenciaReceita(custo, unidade) {
        if (unidade === 'kg') {
          const porGrama = custo / 1000;
          return `Equivalente: ${formatarMoeda(porGrama, 4)} por grama (g)`;
        }
        if (unidade === 'L') {
          const porMl = custo / 1000;
          return `Equivalente: ${formatarMoeda(porMl, 4)} por ml`;
        }
        if (unidade === 'g') {
          const porKg = custo * 1000;
          return `Equivalente: ${formatarMoeda(porKg, 2)} por kg`;
        }
        if (unidade === 'ml') {
          const porLitro = custo * 1000;
          return `Equivalente: ${formatarMoeda(porLitro, 2)} por Litro`;
        }
        return `Preço por unidade (sacola, forma descartável, etc.)`;
      }

export function calcularCustoItemReceita(custoUnitarioInsumo, unidadeInsumo, quantidadeUsada, unidadeUsada, conversoes) {
        return calcularCustoItemReceitaValidado(
          Number(custoUnitarioInsumo),
          unidadeInsumo,
          Number(quantidadeUsada),
          unidadeUsada,
          conversoes
        );
      }

export function obterConversoesDoFormulario() {
        const conversoes = { baseUnit: dom.conversionBaseUnit.value || 'g' };
        const campos = [
          ['xicara', dom.conversionXicara],
          ['colher_sopa', dom.conversionColherSopa],
          ['colher_cha', dom.conversionColherCha],
          ['un', dom.conversionUn]
        ];
        for (const [unidade, campo] of campos) {
          const fator = Number(campo.value);
          if (fator > 0) conversoes[unidade] = fator;
        }
        return Object.keys(conversoes).length > 1 ? conversoes : null;
      }

export function preencherConversoesDoFormulario(conversoes) {
        dom.conversionBaseUnit.value = conversoes?.baseUnit || 'g';
        dom.conversionXicara.value = conversoes?.xicara || '';
        dom.conversionColherSopa.value = conversoes?.colher_sopa || '';
        dom.conversionColherCha.value = conversoes?.colher_cha || '';
        dom.conversionUn.value = conversoes?.un || '';
      }

export function calcularTotaisReceita(itens, rendimento = 1, custosIndiretos = {}) {
        return calcularTotaisReceitaValidado(itens, rendimento, custosIndiretos);
      }

export function obterCustosIndiretosDoFormulario() {
        return {
          custoEnergia: Number(dom.inputCustoEnergia.value) || 0,
          custoAgua: Number(dom.inputCustoAgua.value) || 0,
          tempoPreparoMin: Number(dom.inputTempoPreparo.value) || 0,
          valorHoraMaoDeObra: Number(dom.inputValorHora.value) || 0,
          unidadesPerdidas: Number(dom.inputUnidadesPerdidas.value) || 0
        };
      }

export function obterCustosIndiretosDaReceita(receita) {
        return {
          custoEnergia: receita.custoEnergia || 0,
          custoAgua: receita.custoAgua || 0,
          tempoPreparoMin: receita.tempoPreparoMin || 0,
          valorHoraMaoDeObra: receita.valorHoraMaoDeObra || 0,
          unidadesPerdidas: receita.unidadesPerdidas || 0
        };
      }

export function calcularLucroEPrecificacao(custoPorUnidade, margemDesejadaPorcentagem = 100, precoVendaPraticado = null) {
        const custo = Number(custoPorUnidade) || 0;
        const margem = Number(margemDesejadaPorcentagem) || 0;

        const precoSugerido = Math.round(custo * (1 + margem / 100) * 100) / 100;
        const precoFinal = precoVendaPraticado && Number(precoVendaPraticado) > 0 
          ? Math.round(Number(precoVendaPraticado) * 100) / 100 
          : precoSugerido;

        const lucroPorUnidade = Math.round((precoFinal - custo) * 100) / 100;
        const margemReal = custo > 0 ? Math.round(((precoFinal - custo) / custo) * 1000) / 10 : 0;

        return {
          precoSugerido,
          precoMinimo: precoSugerido,
          precoAbaixoDoMinimo: Boolean(precoVendaPraticado && precoVendaPraticado > 0 && precoFinal < precoSugerido),
          precoFinal,
          lucroPorUnidade,
          margemReal
        };
      }

export function showToast(msg) {
        dom.toastMessage.textContent = msg;
        dom.toast.classList.add('visible');
        setTimeout(() => dom.toast.classList.remove('visible'), 3200);
      }

