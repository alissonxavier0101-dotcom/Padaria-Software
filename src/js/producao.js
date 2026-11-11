import {
  cachedReceitas,
  cachedProducoes,
  cachedVendas,
  cachedClientes,
  cachedInsumos,
  currentUser,
  isTestStockMode,
  firestoreDb,
  setPendingProductionRecipeId,
  setPendingEditProductionId,
  setPendingDeleteProductionId,
  setCachedProducoes,
  setCachedVendas,
  setCachedInsumos,
  DEMO_SEED_INSUMOS,
  TEST_ITEMS_KEY,
  LOCAL_DEMO_ITEMS_KEY,
  TEST_PRODUCTIONS_KEY,
  LOCAL_DEMO_PRODUCOES_KEY,
  TEST_SALES_KEY,
  LOCAL_DEMO_SALES_KEY
} from './state.js';
import { dom } from './dom.js';
import { showToast, escapeHtml, formatarMoeda, dataISOValida, calcularTotaisReceita, obterCustosIndiretosDaReceita, calcularLucroEPrecificacao, calcularCustoItemReceita } from './helpers.js';
import { initFirebase, salvarDadosReceitasLocais, salvarDadosInsumosLocais, salvarDadosProducoesLocais } from './firebaseAuth.js';
import { renderizarInsumos, formatarQuantidadeEstoque, atualizarReceitasDependentes } from './insumos.js';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { calcularBaixaEstoque } from '../utils/inventory.ts';
import { calcularCustoRealProducao, calcularRestauracaoEstoqueProducao, calcularResultadoFinanceiroProducao } from '../utils/production.ts';
import {
  renderizarReceitas,
  atualizarSelectProdutos,
  atualizarSelectClientes,
  atualizarSelectsInsumosParaReceitas,
  criariaCicloReceita,
  obterGruposEItensReceita
} from './receitas.js';
import { obterChaveStorageModulo, renderizarFinanceiro } from './financeiro.js';
import { renderizarVendas } from './vendas.js';
import { renderizarClientes } from './clientes.js';

export function abrirModalProducao(receitaId) {
  const receita = cachedReceitas.find(item => item.id === receitaId);
  if (!receita) {
    showToast('A receita selecionada não foi encontrada.');
    return;
  }
  setPendingProductionRecipeId(receitaId);
  dom.productionTitle.textContent = `Produzir: ${receita.nome}`;
  dom.productionBatches.value = '1';
  dom.productionDate.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  atualizarSelectClientes();
  dom.productionCustomer.value = '';
  dom.productionPayment.value = 'nao_informado';
  renderizarPreviaProducao();
  dom.productionModal.classList.add('active');
  dom.productionBatches.focus();
}

export function fecharModalProducao() {
  setPendingProductionRecipeId(null);
  dom.productionModal.classList.remove('active');
  dom.productionPreview.textContent = '';
}

export function renderizarPreviaProducao() {
  const fornadas = Number(dom.productionBatches.value);
  if (!pendingProductionRecipeId || !Number.isInteger(fornadas) || fornadas < 1) {
    dom.productionPreview.innerHTML = '<span class="production-preview-error">Informe um número inteiro de fornadas maior que zero.</span>';
    return;
  }
  try {
    const receita = cachedReceitas.find(item => item.id === pendingProductionRecipeId);
    if (!receita) throw new Error('A receita selecionada não foi encontrada.');
    const baixas = calcularBaixaEstoque(pendingProductionRecipeId, cachedReceitas, cachedInsumos, fornadas);
    const quantidadeProduzida = Number(receita.rendimento) * fornadas;
    const custos = calcularCustoRealProducao(baixas, cachedInsumos, receita, fornadas, quantidadeProduzida);
    dom.productionPreview.innerHTML = `
      <strong>Consumo previsto para ${fornadas} ${fornadas === 1 ? 'fornada' : 'fornadas'}</strong>
      ${baixas.map(item => `<div><span>${escapeHtml(item.nome)}</span><strong>${formatarQuantidadeEstoque(item.quantidadeNecessaria)} ${escapeHtml(item.unidade)}</strong></div>`).join('')}
      <div><span>Produção estimada</span><strong>${formatarQuantidadeEstoque(quantidadeProduzida)} ${escapeHtml(receita.rendimentoUnidade || 'unidades')}</strong></div>
      <div><span>Custo dos insumos</span><strong>${formatarMoeda(custos.custoInsumos)}</strong></div>
      <div><span>Custos indiretos</span><strong>${formatarMoeda(custos.custoIndireto)}</strong></div>
      <div class="production-cost-total"><span>Custo real total</span><strong>${formatarMoeda(custos.custoReal)}</strong></div>
      <div><span>Custo real por unidade</span><strong>${formatarMoeda(custos.custoUnitarioReal)}</strong></div>`;
  } catch (error) {
    dom.productionPreview.innerHTML = `<span class="production-preview-error">${escapeHtml(error.message || 'Não foi possível calcular os insumos.')}</span>`;
  }
}

export async function confirmarProducao() {
  const receitaId = pendingProductionRecipeId;
  const fornadas = Number(dom.productionBatches.value);
  if (!receitaId) return;

  const dataProducao = dom.productionDate.value;
  if (!dataISOValida(dataProducao)) {
    showToast('Informe uma data válida para a produção.');
    dom.productionDate.focus();
    return;
  }

  const clienteId = dom.productionCustomer.value;
  const cliente = clienteId ? cachedClientes.find(item => item.id === clienteId) : null;
  if (clienteId && !cliente) {
    showToast('O cliente selecionado não foi encontrado. Atualize a lista e tente novamente.');
    atualizarSelectClientes();
    return;
  }
  const formaPagamento = dom.productionPayment.value;
  if (!['nao_informado', 'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia'].includes(formaPagamento)) {
    showToast('Selecione uma forma de pagamento válida.');
    dom.productionPayment.focus();
    return;
  }

  const receita = cachedReceitas.find(item => item.id === receitaId);
  if (!receita) {
    showToast('A receita selecionada não foi encontrada.');
    return;
  }

  let baixas;
  let custos;
  try {
    baixas = calcularBaixaEstoque(receitaId, cachedReceitas, cachedInsumos, fornadas);
    custos = calcularCustoRealProducao(
      baixas,
      cachedInsumos,
      receita,
      fornadas,
      Number(receita.rendimento) * fornadas
    );
  } catch (error) {
    showToast(error.message || 'Não foi possível validar o estoque para esta produção.');
    renderizarPreviaProducao();
    return;
  }

  const receitaLocal = receitaId.startsWith('local-') || receitaId.startsWith('demo-');
  const idsLocais = baixas.filter(item => item.id.startsWith('local-') || item.id.startsWith('demo-'));
  const idsRemotos = baixas.filter(item => !item.id.startsWith('local-') && !item.id.startsWith('demo-'));
  if ((idsLocais.length && idsRemotos.length) ||
      (receitaLocal && idsRemotos.length) ||
      (!receitaLocal && idsLocais.length)) {
    showToast('A receita mistura insumos locais e sincronizados. Revise os cadastros antes de produzir.');
    return;
  }

  const button = dom.btnConfirmProduction;
  button.disabled = true;
  button.innerHTML = '<span class="loading-spinner"></span> Registrando...';

  try {
    if (firestoreDb && !isTestStockMode && !receitaLocal && idsRemotos.length === baixas.length) {
      const productionRef = doc(collection(firestoreDb, 'producoes'));
      const saleRef = doc(collection(firestoreDb, 'vendas'));
      await runTransaction(firestoreDb, async transaction => {
        const atualizacoes = [];
        const insumosLidos = new Map();
        const receitaSnapshot = await transaction.get(doc(firestoreDb, 'receitas', receitaId));
        if (!receitaSnapshot.exists()) {
          throw new Error('A receita não existe mais no Firestore.');
        }
        const receitaAtual = receitaSnapshot.data();
        if (
          receitaAtual.nome !== receita.nome ||
          Number(receitaAtual.rendimento) !== Number(receita.rendimento) ||
          receitaAtual.rendimentoUnidade !== receita.rendimentoUnidade ||
          Number(receitaAtual.custoIndireto || 0) !== Number(receita.custoIndireto || 0) ||
          JSON.stringify(normalizarParaComparacao(receitaAtual.itens || [])) !==
            JSON.stringify(normalizarParaComparacao(receita.itens || []))
        ) {
          throw new Error('A receita foi alterada durante o registro. Feche e abra a produção novamente.');
        }
        for (const baixa of baixas) {
          const ref = doc(firestoreDb, 'insumos', baixa.id);
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists()) {
            throw new Error(`O insumo "${baixa.nome}" não existe mais no Firestore.`);
          }
          const dados = snapshot.data();
          if (dados.unidade !== baixa.unidade) {
            throw new Error(`A unidade de ${baixa.nome} mudou. Atualize os dados e tente novamente.`);
          }
          const disponivel = Number.isFinite(dados.estoqueAtual)
            ? Number(dados.estoqueAtual)
            : Number(dados.quantidade) || 0;
          if (baixa.quantidadeNecessaria > disponivel + Number.EPSILON * Math.max(1, disponivel)) {
            throw new Error(`Estoque insuficiente de ${baixa.nome}: disponível ${formatarQuantidadeEstoque(disponivel)} ${baixa.unidade}, necessário ${formatarQuantidadeEstoque(baixa.quantidadeNecessaria)} ${baixa.unidade}.`);
          }
          insumosLidos.set(baixa.id, {
            ...cachedInsumos.find(item => item.id === baixa.id),
            ...dados,
            id: baixa.id
          });
          atualizacoes.push({
            ref,
            estoqueAtual: Math.max(0, disponivel - baixa.quantidadeNecessaria)
          });
        }

        const insumosParaCusto = cachedInsumos.map(item => insumosLidos.get(item.id) || item);
        const custoAtualizado = calcularCustoRealProducao(
          baixas,
          insumosParaCusto,
          receita,
          fornadas,
          Number(receita.rendimento) * fornadas
        );
        custos = custoAtualizado;
        const registro = criarRegistroProducao(
          receita,
          receitaId,
          fornadas,
          dataProducao,
          baixas,
          insumosParaCusto,
          custoAtualizado
        );
        Object.assign(registro, {
          clienteId: clienteId || '',
          clienteNome: cliente?.nome || 'Cliente avulso',
          formaPagamento,
          status: 'pago',
          vendaId: saleRef.id
        });
        atualizacoes.forEach(item => transaction.update(item.ref, {
          estoqueAtual: item.estoqueAtual,
          updatedAt: isTestStockMode ? new Date().toISOString() : serverTimestamp()
        }));
        transaction.set(productionRef, {
          ...registro,
          createdAt: serverTimestamp()
        });
        transaction.set(saleRef, {
          ...criarDadosVendaProducao(registro, productionRef.id),
          createdAt: serverTimestamp()
        });
      });
    } else {
      const atualizados = cachedInsumos.map(insumo => {
        const baixa = baixas.find(item => item.id === insumo.id);
        return baixa
          ? { ...insumo, estoqueAtual: Math.max(0, baixa.quantidadeAtual - baixa.quantidadeNecessaria) }
          : insumo;
      });
      const timestamp = Date.now();
      const registro = {
        id: `${isTestStockMode ? 'demo-prod-' : 'local-prod-'}${timestamp}`,
        ...criarRegistroProducao(receita, receitaId, fornadas, dataProducao, baixas, cachedInsumos, custos),
        clienteId: clienteId || '',
        clienteNome: cliente?.nome || 'Cliente avulso',
        formaPagamento,
        status: 'pago',
        vendaId: `local-venda-producao-${timestamp}`,
        createdAt: new Date().toISOString()
      };
      const venda = {
        id: registro.vendaId,
        ...criarDadosVendaProducao(registro),
        createdAt: registro.createdAt
      };
      const producoesAtualizadas = [registro, ...cachedProducoes];
      const vendasAtualizadas = [venda, ...cachedVendas];
      setCachedInsumos(atualizados);
      setCachedProducoes(producoesAtualizadas);
      setCachedVendas(vendasAtualizadas);
      salvarDadosInsumosLocais();
      salvarDadosProducoesLocais();
      localStorage.setItem(obterChaveStorageModulo('vendas'), JSON.stringify(cachedVendas));
      renderizarInsumos();
      renderizarProducoes();
      renderizarVendas();
      renderizarClientes();
      renderizarFinanceiro();
    }

    fecharModalProducao();
    showToast(`Produção de ${receita.nome} registrada como venda. Estoque baixado e custo real de ${formatarMoeda(custos.custoReal)} calculado.`);
  } catch (error) {
    console.error('Erro ao registrar produção e baixar insumos:', error);
    showToast(error.message || 'Não foi possível registrar a produção.');
  } finally {
    button.disabled = false;
    button.textContent = 'Confirmar produção';
  }
}

export function criarRegistroProducao(receita, receitaId, fornadas, data, baixas, insumos, custos) {
  const insumosPorId = new Map(insumos.map(item => [item.id, item]));
  return {
    receitaId,
    receitaNome: receita.nome,
    quantidade: fornadas,
    data,
    quantidadeProduzida: Number(receita.rendimento) * fornadas,
    unidadeProduzida: receita.rendimentoUnidade || 'unidades',
    precoVendaUnitario: Number(receita.precoVendaPraticado) || 0,
    custoInsumos: custos.custoInsumos,
    custoIndireto: custos.custoIndireto,
    custoReal: custos.custoReal,
    custoUnitarioReal: custos.custoUnitarioReal,
    insumos: baixas.map(baixa => {
      const item = insumosPorId.get(baixa.id);
      return {
        id: baixa.id,
        nome: baixa.nome,
        quantidade: baixa.quantidadeNecessaria,
        unidade: baixa.unidade,
        custoUnitario: item.custoUnitario,
        custo: Math.round(baixa.quantidadeNecessaria * item.custoUnitario * 100) / 100
      };
    }),
    createdBy: currentUser?.uid || 'anon',
    createdByName: currentUser?.displayName || 'Padeiro'
  };
}

export function criarDadosVendaProducao(producao, producaoId = producao.id) {
  const quantidade = Number(producao.quantidadeProduzida) || 0;
  const custoUnitario = quantidade > 0
    ? Number(producao.custoReal || 0) / quantidade
    : 0;
  return {
    produtoId: producao.receitaId,
    produtoNome: producao.receitaNome,
    clienteId: producao.clienteId || '',
    clienteNome: producao.clienteNome || 'Cliente avulso',
    quantidade,
    valorUnitario: Number(producao.precoVendaUnitario) || 0,
    valorTotal: Math.round(quantidade * (Number(producao.precoVendaUnitario) || 0) * 100) / 100,
    formaPagamento: producao.formaPagamento || 'nao_informado',
    data: producao.data,
    status: producao.status || 'pago',
    custoUnitario,
    custosInsumos: (producao.insumos || []).map(insumo => ({
      nome: insumo.nome,
      custoUnitario: quantidade > 0 ? Number(insumo.custo || 0) / quantidade : 0
    })),
    origem: 'producao',
    producaoId,
    createdBy: producao.createdBy || currentUser?.uid || 'anon'
  };
}

export function normalizarParaComparacao(valor) {
  if (Array.isArray(valor)) return valor.map(normalizarParaComparacao);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.keys(valor).sort().map(chave => [chave, normalizarParaComparacao(valor[chave])])
    );
  }
  return valor;
}

export function renderizarProducoes() {
  const producoes = [...cachedProducoes].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  dom.tabBadgeProducoes.textContent = String(producoes.length);
  dom.producoesCounter.textContent = `${producoes.length} ${producoes.length === 1 ? 'registro' : 'registros'}`;
  dom.emptyStateProducoes.classList.toggle('hidden', producoes.length > 0);
  dom.producoesContainer.classList.toggle('hidden', producoes.length === 0);

  dom.producoesContainer.innerHTML = producoes.map(producao => {
    const date = new Date(`${producao.data}T00:00:00`);
    const dateLabel = Number.isNaN(date.getTime())
      ? escapeHtml(producao.data || 'Data não informada')
      : date.toLocaleDateString('pt-BR');
    const quantidade = Number(producao.quantidade) || 0;
    const quantidadeProduzida = Number(producao.quantidadeProduzida) || 0;
    const receita = cachedReceitas.find(item => item.id === producao.receitaId);
    const precoVendaUnitario = Number(producao.precoVendaUnitario ?? receita?.precoVendaPraticado) || 0;
    const custoReal = Number(producao.custoReal) || 0;
    const resultado = quantidadeProduzida > 0 && quantidade > 0
      ? calcularResultadoFinanceiroProducao(custoReal, quantidadeProduzida, precoVendaUnitario, quantidade)
      : null;
    return `
      <article class="production-record">
        <div>
          <div class="production-record-name">${escapeHtml(producao.receitaNome || 'Receita')}</div>
          <div class="production-record-meta">
            ${dateLabel} · ${quantidade} ${quantidade === 1 ? 'fornada' : 'fornadas'}
            · ${formatarQuantidadeEstoque(quantidadeProduzida)} ${escapeHtml(producao.unidadeProduzida || 'unidades')}
          </div>
          <div class="production-record-meta">
            Insumos: ${formatarMoeda(Number(producao.custoInsumos) || 0)}
            · Indiretos: ${formatarMoeda(Number(producao.custoIndireto) || 0)}
          </div>
          ${resultado ? `
            <div class="production-record-meta">Faturamento: ${formatarMoeda(resultado.faturamento)}</div>
            <div class="production-record-profit ${resultado.lucro < 0 ? 'loss' : ''}">
              Lucro: ${formatarMoeda(resultado.lucro)}
              · ${formatarMoeda(resultado.lucroPorFornada)} por fornada
            </div>
          ` : ''}
          <div class="production-record-meta">
            Cliente: ${escapeHtml(producao.clienteNome || 'Cliente avulso')}
            · ${escapeHtml(obterNomeFormaPagamento(producao.formaPagamento || 'nao_informado'))}
          </div>
          <div class="production-record-actions">
            <button type="button" class="btn-secondary production-record-edit" data-edit-production-id="${escapeHtml(producao.id)}">
              ✏️ Editar produção
            </button>
            <button type="button" class="btn-secondary production-record-delete" data-delete-production-id="${escapeHtml(producao.id)}">
              🗑️ Excluir
            </button>
          </div>
        </div>
        <div class="production-record-cost">
          ${formatarMoeda(Number(producao.custoReal) || 0)}
          <small>${formatarMoeda(Number(producao.custoUnitarioReal) || 0)} / unidade</small>
        </div>
      </article>
    `;
  }).join('');
}

export function obterNomeFormaPagamento(forma) {
  return ({
    nao_informado: 'Pagamento não informado',
    pix: 'Pix',
    dinheiro: 'Dinheiro',
    cartao_credito: 'Cartão de crédito',
    cartao_debito: 'Cartão de débito',
    transferencia: 'Transferência'
  })[forma] || forma;
}

export function abrirEdicaoProducao(producaoId) {
  const producao = cachedProducoes.find(item => item.id === producaoId);
  if (!producao) {
    showToast('O registro de produção não foi encontrado.');
    return;
  }
  const receita = cachedReceitas.find(item => item.id === producao.receitaId);
  setPendingEditProductionId(producaoId);
  dom.editProductionTitle.textContent = `Editar produção: ${producao.receitaNome || 'Receita'}`;
  dom.editProductionDate.value = producao.data || '';
  dom.editProductionQuantity.value = Number(producao.quantidadeProduzida) || '';
  dom.editProductionSalePrice.value = Number(
    producao.precoVendaUnitario ?? receita?.precoVendaPraticado ?? 0
  ).toFixed(2);
  atualizarSelectClientes();
  dom.editProductionCustomer.value = producao.clienteId || '';
  dom.editProductionPayment.value = producao.formaPagamento || 'nao_informado';
  atualizarPreviaEdicaoProducao();
  dom.editProductionModal.classList.add('active');
  dom.editProductionDate.focus();
}

export function fecharEdicaoProducao() {
  setPendingEditProductionId(null);
  dom.editProductionModal.classList.remove('active');
  dom.editProductionPreview.textContent = '';
}

export function atualizarPreviaEdicaoProducao() {
  const producao = cachedProducoes.find(item => item.id === pendingEditProductionId);
  if (!producao) return;
  const quantidadeProduzida = Number(dom.editProductionQuantity.value);
  const precoVendaUnitario = Number(dom.editProductionSalePrice.value);
  try {
    const resultado = calcularResultadoFinanceiroProducao(
      Number(producao.custoReal) || 0,
      quantidadeProduzida,
      precoVendaUnitario,
      Number(producao.quantidade)
    );
    dom.editProductionPreview.innerHTML = `
      <div><span>Custo real</span><strong>${formatarMoeda(Number(producao.custoReal) || 0)}</strong></div>
      <div><span>Faturamento previsto</span><strong>${formatarMoeda(resultado.faturamento)}</strong></div>
      <div class="production-cost-total"><span>Lucro previsto</span><strong>${formatarMoeda(resultado.lucro)}</strong></div>
      <div><span>Lucro por fornada (${Number(producao.quantidade)})</span><strong>${formatarMoeda(resultado.lucroPorFornada)}</strong></div>`;
  } catch (error) {
    dom.editProductionPreview.innerHTML = `<span class="production-preview-error">${escapeHtml(error.message || 'Informe os dados para calcular o lucro.')}</span>`;
  }
}

export async function salvarEdicaoProducao() {
  const producao = cachedProducoes.find(item => item.id === pendingEditProductionId);
  if (!producao) {
    showToast('O registro de produção não foi encontrado.');
    fecharEdicaoProducao();
    return;
  }

  const data = dom.editProductionDate.value;
  const quantidadeProduzida = Number(dom.editProductionQuantity.value);
  const precoVendaUnitario = Number(dom.editProductionSalePrice.value);
  if (!dataISOValida(data)) {
    showToast('Informe uma data válida para a produção.');
    dom.editProductionDate.focus();
    return;
  }
  if (!Number.isFinite(quantidadeProduzida) || quantidadeProduzida <= 0) {
    showToast('A quantidade produzida deve ser maior que zero.');
    dom.editProductionQuantity.focus();
    return;
  }
  if (!Number.isFinite(precoVendaUnitario) || precoVendaUnitario < 0) {
    showToast('Informe um preço de venda válido, igual ou maior que zero.');
    dom.editProductionSalePrice.focus();
    return;
  }

  const clienteId = dom.editProductionCustomer.value;
  const cliente = clienteId ? cachedClientes.find(item => item.id === clienteId) : null;
  if (clienteId && !cliente) {
    showToast('O cliente selecionado não foi encontrado. Atualize a lista e tente novamente.');
    atualizarSelectClientes();
    return;
  }
  const formaPagamento = dom.editProductionPayment.value;
  if (!['nao_informado', 'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia'].includes(formaPagamento)) {
    showToast('Selecione uma forma de pagamento válida.');
    dom.editProductionPayment.focus();
    return;
  }

  const vendaExistente = cachedVendas.find(venda =>
    venda.id === producao.vendaId || venda.producaoId === producao.id
  );
  const vendaId = producao.vendaId || vendaExistente?.id ||
    `local-venda-producao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const atualizacoes = {
    data,
    quantidadeProduzida,
    precoVendaUnitario: Math.round(precoVendaUnitario * 100) / 100,
    custoUnitarioReal: Math.round((Number(producao.custoReal) / quantidadeProduzida) * 100) / 100,
    clienteId: clienteId || '',
    clienteNome: cliente?.nome || 'Cliente avulso',
    formaPagamento,
    status: vendaExistente?.status || producao.status || 'pago',
    vendaId,
    updatedAt: isTestStockMode ? new Date().toISOString() : serverTimestamp()
  };
  const isLocal = producao.id.startsWith('local-') || producao.id.startsWith('demo-');
  const button = dom.btnSaveEditProduction;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    if (firestoreDb && !isTestStockMode && !isLocal) {
      const productionRef = doc(firestoreDb, 'producoes', producao.id);
      const saleRef = doc(firestoreDb, 'vendas', vendaId);
      await runTransaction(firestoreDb, async transaction => {
        const productionSnapshot = await transaction.get(productionRef);
        const saleSnapshot = await transaction.get(saleRef);
        if (!productionSnapshot.exists()) {
          throw new Error('Este registro já foi removido.');
        }
        if (saleSnapshot.exists() && (
          saleSnapshot.data().origem !== 'producao' ||
          saleSnapshot.data().producaoId !== producao.id
        )) {
          throw new Error('A venda vinculada não pertence a esta produção e não pode ser atualizada.');
        }
        const registroAtual = productionSnapshot.data();
        const producaoAtualizada = {
          ...registroAtual,
          ...atualizacoes,
          id: producao.id
        };
        const vendaAtualizada = criarDadosVendaProducao(producaoAtualizada, producao.id);
        transaction.update(productionRef, atualizacoes);
        if (saleSnapshot.exists()) {
          vendaAtualizada.createdBy = saleSnapshot.data().createdBy || vendaAtualizada.createdBy;
          transaction.update(saleRef, {
            ...vendaAtualizada,
            updatedAt: serverTimestamp()
          });
        } else {
          transaction.set(saleRef, {
            ...vendaAtualizada,
            createdAt: serverTimestamp()
          });
        }
      });
      Object.assign(producao, atualizacoes, { updatedAt: new Date().toISOString() });
      const updatedSale = {
        id: vendaId,
        ...criarDadosVendaProducao(producao, producao.id),
        ...(vendaExistente?.createdAt ? { createdAt: vendaExistente.createdAt } : {}),
        updatedAt: new Date().toISOString()
      };
      setCachedVendas([updatedSale, ...cachedVendas.filter(venda => venda.id !== vendaId)]);
      renderizarProducoes();
      renderizarVendas();
      renderizarClientes();
      renderizarFinanceiro();
    } else {
      Object.assign(producao, atualizacoes);
      const vendaAtualizada = {
        id: vendaId,
        ...criarDadosVendaProducao(producao, producao.id),
        ...(vendaExistente?.createdAt ? { createdAt: vendaExistente.createdAt } : {}),
        updatedAt: new Date().toISOString()
      };
      setCachedVendas([vendaAtualizada, ...cachedVendas.filter(venda => venda.id !== vendaId)]);
      salvarDadosProducoesLocais();
      localStorage.setItem(obterChaveStorageModulo('vendas'), JSON.stringify(cachedVendas));
      renderizarProducoes();
      renderizarVendas();
      renderizarClientes();
      renderizarFinanceiro();
    }
    const resultado = calcularResultadoFinanceiroProducao(
      Number(producao.custoReal) || 0,
      quantidadeProduzida,
      atualizacoes.precoVendaUnitario,
      Number(producao.quantidade)
    );
    fecharEdicaoProducao();
    showToast(`Produção atualizada. Lucro: ${formatarMoeda(resultado.lucro)} (${formatarMoeda(resultado.lucroPorFornada)} por fornada).`);
  } catch (error) {
    console.error('Erro ao editar produção:', error);
    showToast(error.message || 'Não foi possível salvar as alterações da produção.');
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar alterações';
  }
}

export function abrirExclusaoProducao(producaoId) {
  const producao = cachedProducoes.find(item => item.id === producaoId);
  if (!producao) {
    showToast('O registro de produção não foi encontrado.');
    return;
  }

  setPendingDeleteProductionId(producaoId);
  const podeRestaurarEstoque = Array.isArray(producao.insumos) && producao.insumos.length > 0;
  dom.deleteProductionDescription.textContent = podeRestaurarEstoque
    ? `A produção de ${producao.receitaNome || 'Receita'} e sua venda vinculada serão removidas, e os insumos consumidos serão devolvidos ao estoque. Esta ação não pode ser desfeita.`
    : 'Este registro antigo não contém os detalhes dos insumos consumidos. Para evitar alterar o estoque incorretamente, ele não pode ser excluído por aqui.';
  dom.btnConfirmDeleteProduction.disabled = !podeRestaurarEstoque;
  dom.deleteProductionModal.classList.add('active');
}

export function fecharExclusaoProducao() {
  setPendingDeleteProductionId(null);
  dom.deleteProductionModal.classList.remove('active');
  dom.btnConfirmDeleteProduction.disabled = false;
  dom.btnConfirmDeleteProduction.textContent = 'Excluir produção';
}

export async function confirmarExclusaoProducao() {
  if (!pendingDeleteProductionId) return;
  const productionId = pendingDeleteProductionId;
  const producao = cachedProducoes.find(item => item.id === productionId);
  if (!producao) {
    showToast('O registro de produção não foi encontrado.');
    fecharExclusaoProducao();
    return;
  }

  const button = dom.btnConfirmDeleteProduction;
  button.disabled = true;
  button.innerHTML = '<span class="loading-spinner"></span> Excluindo e devolvendo insumos...';
  try {
    const isLocal = productionId.startsWith('local-') || productionId.startsWith('demo-');
    if (firestoreDb && !isTestStockMode && !isLocal) {
      const productionRef = doc(firestoreDb, 'producoes', productionId);
      await runTransaction(firestoreDb, async transaction => {
        const productionSnapshot = await transaction.get(productionRef);
        if (!productionSnapshot.exists()) {
          throw new Error('Este registro já foi removido.');
        }
        const registroAtual = productionSnapshot.data();
        const saleRef = registroAtual.vendaId
          ? doc(firestoreDb, 'vendas', registroAtual.vendaId)
          : null;
        const saleSnapshot = saleRef ? await transaction.get(saleRef) : null;
        const consumptions = registroAtual.insumos;
        if (!Array.isArray(consumptions) || consumptions.length === 0) {
          throw new Error('Este registro não contém os insumos consumidos; não é possível restaurar o estoque com segurança.');
        }

        const stockSnapshots = new Map();
        for (const consumption of consumptions) {
          if (!consumption.id) {
            throw new Error('O registro contém um insumo sem identificação; o estoque não foi alterado.');
          }
          if (!stockSnapshots.has(consumption.id)) {
            const stockRef = doc(firestoreDb, 'insumos', consumption.id);
            const stockSnapshot = await transaction.get(stockRef);
            if (!stockSnapshot.exists()) {
              throw new Error(`O insumo "${consumption.nome || consumption.id}" não foi encontrado; o estoque não foi alterado.`);
            }
            stockSnapshots.set(consumption.id, { ref: stockRef, data: stockSnapshot.data() });
          }
        }

        const stockRecords = [...stockSnapshots].map(([id, snapshot]) => ({
          id,
          ...snapshot.data
        }));
        const restored = calcularRestauracaoEstoqueProducao(consumptions, stockRecords);
        restored.forEach(item => {
          const stockSnapshot = stockSnapshots.get(item.id);
          transaction.update(stockSnapshot.ref, {
            estoqueAtual: item.estoqueAtual,
            updatedAt: serverTimestamp()
          });
        });
        transaction.delete(productionRef);
        if (saleSnapshot?.exists() && saleSnapshot.data().producaoId === productionId) {
          transaction.delete(saleRef);
        }
      });
    } else {
      const restored = calcularRestauracaoEstoqueProducao(producao.insumos, cachedInsumos);
      const stockById = new Map(restored.map(item => [item.id, item]));
      const updatedItems = cachedInsumos.map(item => {
        const restoredItem = stockById.get(item.id);
        return restoredItem ? { ...item, estoqueAtual: restoredItem.estoqueAtual } : item;
      });
      const updatedProductions = cachedProducoes.filter(item => item.id !== productionId);
      const updatedSales = cachedVendas.filter(item =>
        item.producaoId !== productionId &&
        !(item.id === producao.vendaId && item.origem === 'producao')
      );
      localStorage.setItem(
        isTestStockMode ? TEST_ITEMS_KEY : LOCAL_DEMO_ITEMS_KEY,
        JSON.stringify(updatedItems)
      );
      localStorage.setItem(
        isTestStockMode ? TEST_PRODUCTIONS_KEY : LOCAL_DEMO_PRODUCOES_KEY,
        JSON.stringify(updatedProductions)
      );
      localStorage.setItem(
        isTestStockMode ? TEST_SALES_KEY : LOCAL_DEMO_SALES_KEY,
        JSON.stringify(updatedSales)
      );
      setCachedInsumos(updatedItems);
      setCachedProducoes(updatedProductions);
      setCachedVendas(updatedSales);
      renderizarInsumos();
      renderizarProducoes();
      renderizarVendas();
      renderizarClientes();
      renderizarFinanceiro();
    }

    if (firestoreDb && !isTestStockMode && !isLocal) {
      setCachedProducoes(cachedProducoes.filter(item => item.id !== productionId));
      setCachedVendas(cachedVendas.filter(item =>
        item.producaoId !== productionId &&
        !(item.id === producao.vendaId && item.origem === 'producao')
      ));
      renderizarProducoes();
      renderizarVendas();
      renderizarClientes();
      renderizarFinanceiro();
    }
    fecharExclusaoProducao();
    showToast('Produção excluída e insumos devolvidos ao estoque.');
  } catch (error) {
    console.error('Erro ao excluir produção e restaurar estoque:', error);
    showToast(error.message || 'Não foi possível excluir a produção.');
  } finally {
    if (pendingDeleteProductionId) {
      button.disabled = false;
      button.textContent = 'Excluir produção';
    }
  }
}

export function abrirModalAddItemReceita(receitaId, nomeReceita) {
  setPendingAddItemReceitaId(receitaId);
  dom.modalAddItemReceitaName.textContent = `"${nomeReceita}"`;
  dom.inputModalAddQtd.value = '';
  dom.modalAddCostPreview.textContent = 'R$ 0,00';
  dom.modalAddItemReceita.classList.add('active');
  atualizarSelectsInsumosParaReceitas();
}

export function fecharModalAddItemReceita() {
  setPendingAddItemReceitaId(null);
  dom.modalAddItemReceita.classList.remove('active');
}

export function atualizarPreviewModalAddItem() {
  const insumoId = dom.selectModalAddInsumo.value;
  const qtd = parseFloat(dom.inputModalAddQtd.value) || 0;
  const unidadeUsada = dom.selectModalAddUn.value;

  if (!insumoId || qtd <= 0) {
    dom.modalAddCostPreview.textContent = 'R$ 0,00';
    return;
  }

  const selectedOption = dom.selectModalAddInsumo.selectedOptions[0];
  const custoUnitario = parseFloat(selectedOption?.getAttribute('data-cost')) || 0;
  const unidadeBase = selectedOption?.getAttribute('data-unit') || 'kg';
  const conversoes = JSON.parse(selectedOption?.getAttribute('data-conversions') || '{}');

  const custo = calcularCustoItemReceita(custoUnitario, unidadeBase, qtd, unidadeUsada, conversoes);
  dom.modalAddCostPreview.textContent = formatarMoeda(custo, 2);
}

export async function confirmarModalAddItemReceita() {
  if (!pendingAddItemReceitaId) return;
  const receitaId = pendingAddItemReceitaId;

  const insumoId = dom.selectModalAddInsumo.value;
  const qtd = parseFloat(dom.inputModalAddQtd.value);
  const unidadeUsada = dom.selectModalAddUn.value;

  if (!insumoId) {
    showToast('Escolha um insumo ou embalagem.');
    return;
  }
  if (isNaN(qtd) || qtd <= 0) {
    showToast('Informe uma quantidade válida.');
    dom.inputModalAddQtd.focus();
    return;
  }

  const selectedOption = dom.selectModalAddInsumo.selectedOptions[0];
  const sourceType = selectedOption?.getAttribute('data-source-type') || 'insumo';
  const receitaBaseId = selectedOption?.getAttribute('data-recipe-id') || null;
  if (sourceType === 'receita' && criariaCicloReceita(receitaId, receitaBaseId)) {
    showToast('Essa receita-base criaria uma dependência circular.');
    return;
  }
  const insumoNome = selectedOption?.getAttribute('data-name') || 'Insumo';
  const categoria = selectedOption?.getAttribute('data-cat') || 'ingrediente';
  const custoUnitarioBase = parseFloat(selectedOption?.getAttribute('data-cost')) || 0;
  const unidadeBase = selectedOption?.getAttribute('data-unit') || 'kg';
  const conversoes = JSON.parse(selectedOption?.getAttribute('data-conversions') || '{}');
  const ofertaInsumoId = selectedOption?.getAttribute('data-offer-id') || insumoId;

  const custoItem = calcularCustoItemReceita(custoUnitarioBase, unidadeBase, qtd, unidadeUsada, conversoes);

  const receitaAlvo = cachedReceitas.find(r => r.id === receitaId);
  if (!receitaAlvo) {
    showToast('Receita não encontrada.');
    fecharModalAddItemReceita();
    return;
  }

  const gruposEItens = obterGruposEItensReceita(receitaAlvo);
  const novosItens = [...(receitaAlvo.itens || []), {
    insumoId: sourceType === 'insumo' ? insumoId : null,
    ofertaInsumoId: sourceType === 'insumo' ? ofertaInsumoId : null,
    sourceType,
    ...(receitaBaseId ? { receitaId: receitaBaseId } : {}),
    grupoId: null,
    insumoNome,
    categoria,
    quantidadeUsada: qtd,
    unidadeUsada,
    custoUnitarioBase,
    unidadeBase,
    conversoes,
    custoItem
  }];

  const totais = calcularTotaisReceita(
    novosItens,
    receitaAlvo.rendimento,
    obterCustosIndiretosDaReceita(receitaAlvo)
  );
  const lucroCalc = calcularLucroEPrecificacao(totais.custoUnitario, receitaAlvo.margemLucroDesejada, receitaAlvo.precoVendaPraticado);

  const atualizacoes = {
    itens: novosItens,
    gruposIngredientes: gruposEItens.grupos,
    ...totais,
    precoVendaSugerido: lucroCalc.precoSugerido,
    lucroPorUnidade: lucroCalc.lucroPorUnidade,
    updatedAt: serverTimestamp()
  };

  try {
    dom.btnConfirmModalAddItem.disabled = true;
    dom.btnConfirmModalAddItem.innerHTML = '<span class="loading-spinner"></span> Gravando...';

    if (firestoreDb && !isTestStockMode && !receitaId.startsWith('local-') && !receitaId.startsWith('demo-')) {
      await updateDoc(doc(firestoreDb, 'receitas', receitaId), atualizacoes);
      showToast(`Item "${insumoNome}" gravado na receita!`);
    } else {
      showToast(`Item adicionado à receita!`);
    }

    Object.assign(receitaAlvo, atualizacoes);
    if (!firestoreDb || isTestStockMode || receitaId.startsWith('local-') || receitaId.startsWith('demo-')) {
      salvarDadosReceitasLocais();
    }
    renderizarReceitas();
    await atualizarReceitasDependentes(receitaId);

    fecharModalAddItemReceita();
  } catch (err) {
    console.error('Erro ao adicionar item na receita:', err);
    showToast('Erro ao atualizar receita: ' + (err.message || 'Tente novamente'));
  } finally {
    dom.btnConfirmModalAddItem.disabled = false;
    dom.btnConfirmModalAddItem.innerHTML = 'Gravar na Receita';
  }
}
