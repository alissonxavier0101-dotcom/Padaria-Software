import {
  cachedVendas,
  cachedPedidos,
  cachedReceitas,
  cachedClientes,
  cachedProducoes,
  currentUser,
  isTestStockMode,
  firestoreDb,
  setPendingEditSaleId,
  setCachedVendas,
  setCachedPedidos,
  TEST_ORDERS_KEY,
  LOCAL_DEMO_ORDERS_KEY,
  TEST_SALES_KEY,
  LOCAL_DEMO_SALES_KEY
} from './state.js';
import { dom } from './dom.js';
import {
  showToast,
  escapeHtml,
  formatarMoeda,
  dataISOValida,
  formatarDataModulo
} from './helpers.js';
import {
  persistirNovoRegistro,
  obterChaveStorageModulo,
  obterDataLocalAtual,
  obterNomeFormaPagamento,
  obterStatusVenda,
  vendaEstaPaga,
  obterCustosInsumosProduto
} from './financeiro.js';
import {
  criarDadosVendaProducao,
  renderizarProducoes
} from './producao.js';
import {
  atualizarSelectProdutos,
  atualizarSelectClientes
} from './receitas.js';
import {
  salvarDadosProducoesLocais
} from './firebaseAuth.js';
import {
  doc,
  updateDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function renderizarVendas() {
  if (!dom.salesList) return;
  const total = cachedVendas
    .filter(vendaEstaPaga)
    .reduce((soma, venda) => soma + Number(venda.valorTotal || 0), 0);
  dom.salesTotalCount.textContent = String(cachedVendas.length);
  dom.salesTotalValue.textContent = formatarMoeda(total);
  dom.tabBadgeVendas.textContent = String(cachedVendas.length);
  dom.salesEmpty.classList.toggle('hidden', cachedVendas.length > 0);
  const vendas = [...cachedVendas].sort((left, right) =>
    String(right.data || '').localeCompare(String(left.data || ''))
  );
  dom.salesList.innerHTML = vendas.map(venda => {
    const status = obterStatusVenda(venda.status);
    return `
    <article class="module-record-card">
      <div class="module-record-heading">
        <h3>${escapeHtml(venda.produtoNome || 'Produto')}</h3>
        <strong>${formatarMoeda(Number(venda.valorTotal || 0))}</strong>
      </div>
      <p>${escapeHtml(venda.clienteNome || 'Cliente avulso')} · ${Number(venda.quantidade || 0)} un. · ${escapeHtml(obterNomeFormaPagamento(venda.formaPagamento))}</p>
      <div class="module-record-meta">
        <span>${formatarDataModulo(venda.data)} · ${formatarMoeda(Number(venda.valorUnitario || 0))} / un.</span>
        <span class="module-status ${status.css}">${escapeHtml(status.label)}</span>
      </div>
      <div class="module-record-meta">
        ${venda.origem === 'producao' ? '<span>Venda vinculada à produção</span>' : '<span></span>'}
        <button type="button" class="btn-secondary" data-edit-sale-id="${escapeHtml(venda.id)}">Editar venda</button>
      </div>
    </article>
  `}).join('');
}

export function renderizarPedidos() {
  if (!dom.ordersList) return;
  const statusLabels = { pendente: 'Pendente', produzido: 'Produzido', entregue: 'Entregue', pago: 'Pago' };
  dom.tabBadgePedidos.textContent = String(cachedPedidos.length);
  dom.ordersEmpty.classList.toggle('hidden', cachedPedidos.length > 0);
  dom.ordersList.innerHTML = cachedPedidos.map(pedido => `
    <article class="module-record-card">
      <div class="module-record-heading">
        <h3>${escapeHtml(pedido.produtoNome || 'Produto')} · ${Number(pedido.quantidade || 0)} un.</h3>
        <span class="module-status">${escapeHtml(statusLabels[pedido.status] || 'Pendente')}</span>
      </div>
      <p>Cliente: ${escapeHtml(pedido.clienteNome || '—')}</p>
      <div class="module-record-meta"><span>Entrega: ${formatarDataModulo(pedido.dataEntrega)}</span>
        <label for="order-status-${escapeHtml(pedido.id)}">Status
          <select id="order-status-${escapeHtml(pedido.id)}" data-order-status="${escapeHtml(pedido.id)}" aria-label="Status do pedido de ${escapeHtml(pedido.clienteNome || 'cliente')}">
            ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}"${pedido.status === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
      ${pedido.observacoes ? `<p>${escapeHtml(pedido.observacoes)}</p>` : ''}
    </article>
  `).join('');
}

export async function salvarVenda(event) {
  event.preventDefault();
  const produto = cachedReceitas.find(receita => receita.id === dom.saleProduct.value);
  const cliente = cachedClientes.find(item => item.id === dom.saleCustomer.value);
  const quantidade = Number(dom.saleQuantity.value);
  const valorUnitario = Number(dom.saleUnitPrice.value);
  const data = dom.saleDate.value;
  const status = dom.saleStatus.value;
  const paymentMethods = ['nao_informado', 'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia'];
  const saleStatuses = ['pago', 'aguardando_pagamento', 'em_processo', 'pronto', 'entregue', 'cancelado'];
  if (!produto || !Number.isInteger(quantidade) || quantidade < 1 || !Number.isFinite(valorUnitario) || valorUnitario < 0) {
    showToast('Selecione um produto e informe quantidade e valor válidos.');
    return;
  }
  if (!dataISOValida(data)) {
    showToast('Informe uma data válida para a venda.');
    dom.saleDate.focus();
    return;
  }
  if (dom.saleCustomer.value && !cliente) {
    showToast('O cliente selecionado não foi encontrado. Atualize a lista e tente novamente.');
    atualizarSelectClientes();
    return;
  }
  if (!paymentMethods.includes(dom.salePayment.value) || !saleStatuses.includes(status)) {
    showToast('Confira a forma de pagamento e o status da venda.');
    return;
  }
  const venda = {
    produtoId: produto.id,
    produtoNome: produto.nome,
    clienteId: cliente?.id || '',
    clienteNome: cliente?.nome || 'Cliente avulso',
    quantidade,
    valorUnitario,
    valorTotal: Math.round(quantidade * valorUnitario * 100) / 100,
    custoUnitario: Number(produto.custoUnitario || 0),
    custosInsumos: obterCustosInsumosProduto(produto),
    formaPagamento: dom.salePayment.value,
    data: dom.saleDate.value,
    status: dom.saleStatus.value
  };
  try {
    await persistirNovoRegistro('vendas', 'vendas', venda, cachedVendas);
    if (!firestoreDb || isTestStockMode) {
      renderizarVendas();
      renderizarClientes();
      renderizarFinanceiro();
    }
    dom.formVenda.reset();
    dom.saleQuantity.value = '1';
    dom.saleDate.value = obterDataLocalAtual();
    dom.salePayment.value = 'pix';
    dom.saleStatus.value = 'pago';
    atualizarSelectProdutos();
    atualizarSelectClientes();
    showToast('Venda registrada com sucesso.');
  } catch (error) {
    console.error('Erro ao registrar venda:', error);
    showToast(`Não foi possível registrar a venda: ${error.message || 'tente novamente.'}`);
  }
}

export function abrirEdicaoVenda(vendaId) {
  const venda = cachedVendas.find(item => item.id === vendaId);
  if (!venda) {
    showToast('A venda selecionada não foi encontrada.');
    return;
  }
  atualizarSelectProdutos();
  atualizarSelectClientes();
  if (!Array.from(dom.editSaleProduct.options).some(option => option.value === venda.produtoId)) {
    const option = document.createElement('option');
    option.value = venda.produtoId;
    option.textContent = venda.produtoNome || 'Produto não cadastrado';
    dom.editSaleProduct.append(option);
  }
  setPendingEditSaleId(vendaId);
  dom.editSaleProduct.value = venda.produtoId || '';
  dom.editSaleProduct.disabled = venda.origem === 'producao';
  dom.editSaleCustomer.value = venda.clienteId || '';
  dom.editSaleQuantity.value = Number(venda.quantidade) || '';
  dom.editSaleUnitPrice.value = Number(venda.valorUnitario) || 0;
  dom.editSalePayment.value = venda.formaPagamento || 'nao_informado';
  dom.editSaleDate.value = venda.data || '';
  dom.editSaleStatus.value = venda.status || 'pago';
  dom.editSaleDescription.textContent = venda.origem === 'producao'
    ? 'Esta venda está vinculada a uma produção. O produto não pode ser alterado; quantidade, preço, cliente, pagamento, data e status serão sincronizados com a produção.'
    : 'Atualize o produto, cliente, quantidade, valores, pagamento, data e status desta venda.';
  dom.editSaleModal.classList.add('active');
}

export function fecharEdicaoVenda() {
  setPendingEditSaleId(null);
  dom.editSaleProduct.disabled = false;
  dom.editSaleModal.classList.remove('active');
  dom.editSaleForm.reset();
}

export async function salvarEdicaoVenda(event) {
  event.preventDefault();
  const venda = cachedVendas.find(item => item.id === pendingEditSaleId);
  if (!venda) {
    showToast('A venda selecionada não foi encontrada.');
    fecharEdicaoVenda();
    return;
  }

  const isProduction = venda.origem === 'producao';
  const cachedProduction = isProduction
    ? cachedProducoes.find(item => item.id === venda.producaoId)
    : null;
  const selectedProductId = isProduction ? venda.produtoId : dom.editSaleProduct.value;
  const produtoAlterado = !isProduction && selectedProductId !== venda.produtoId;
  const produto = cachedReceitas.find(item => item.id === selectedProductId) ||
    (!produtoAlterado ? {
      id: venda.produtoId,
      nome: venda.produtoNome,
      custoUnitario: venda.custoUnitario
    } : null);
  const clienteId = dom.editSaleCustomer.value;
  const cliente = clienteId ? cachedClientes.find(item => item.id === clienteId) : null;
  const quantidade = Number(dom.editSaleQuantity.value);
  const valorUnitario = Number(dom.editSaleUnitPrice.value);
  const data = dom.editSaleDate.value;
  const status = dom.editSaleStatus.value;
  const formasPagamento = ['nao_informado', 'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia'];
  const statusValidos = ['pago', 'aguardando_pagamento', 'em_processo', 'pronto', 'entregue', 'cancelado'];

  if (!produto || !produto.id) {
    showToast(isProduction
      ? 'A receita vinculada a esta produção não está disponível. Atualize os dados e tente novamente.'
      : 'Selecione um produto válido para a venda.');
    return;
  }
  if (isProduction && !cachedProduction && (!firestoreDb || isTestStockMode || venda.id.startsWith('local-') || venda.id.startsWith('demo-'))) {
    showToast('A produção vinculada não está carregada neste dispositivo. Atualize os dados e tente novamente.');
    return;
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0 || (!isProduction && !Number.isInteger(quantidade))) {
    showToast(isProduction
      ? 'A quantidade deve ser maior que zero.'
      : 'A quantidade da venda deve ser um número inteiro maior que zero.');
    dom.editSaleQuantity.focus();
    return;
  }
  if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
    showToast('Informe um valor unitário válido, igual ou maior que zero.');
    dom.editSaleUnitPrice.focus();
    return;
  }
  if (!dataISOValida(data)) {
    showToast('Informe uma data válida para a venda.');
    dom.editSaleDate.focus();
    return;
  }
  if (clienteId && !cliente) {
    showToast('O cliente selecionado não foi encontrado. Atualize a lista e tente novamente.');
    atualizarSelectClientes();
    return;
  }
  if (!formasPagamento.includes(dom.editSalePayment.value) || !statusValidos.includes(status)) {
    showToast('Confira a forma de pagamento e o status da venda.');
    return;
  }

  const updatedAt = isTestStockMode ? new Date().toISOString() : serverTimestamp();
  const saleFields = {
    clienteId: cliente?.id || '',
    clienteNome: cliente?.nome || 'Cliente avulso',
    quantidade,
    valorUnitario: Math.round(valorUnitario * 100) / 100,
    valorTotal: Math.round(quantidade * valorUnitario * 100) / 100,
    formaPagamento: dom.editSalePayment.value,
    data,
    status,
    updatedAt
  };
  if (produtoAlterado) {
    saleFields.produtoId = produto.id;
    saleFields.produtoNome = produto.nome;
    saleFields.custoUnitario = Math.max(Number(produto.custoUnitario) || 0, 0);
    saleFields.custosInsumos = obterCustosInsumosProduto(produto);
  }

  const isLocal = venda.id.startsWith('local-') || venda.id.startsWith('demo-');
  const button = dom.btnSaveEditSale;
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    if (firestoreDb && !isTestStockMode && !isLocal) {
      const saleRef = doc(firestoreDb, 'vendas', venda.id);
      if (isProduction) {
        const productionRef = doc(firestoreDb, 'producoes', venda.producaoId);
        await runTransaction(firestoreDb, async transaction => {
          const saleSnapshot = await transaction.get(saleRef);
          const productionSnapshot = await transaction.get(productionRef);
          if (!saleSnapshot.exists() || !productionSnapshot.exists()) {
            throw new Error('A venda ou a produção vinculada não existe mais.');
          }
          const productionData = productionSnapshot.data();
          if (productionData.vendaId !== venda.id || saleSnapshot.data().producaoId !== venda.producaoId) {
            throw new Error('O vínculo entre a venda e a produção foi alterado. Atualize os dados e tente novamente.');
          }
          const productionFields = {
            data,
            quantidadeProduzida: quantidade,
            precoVendaUnitario: saleFields.valorUnitario,
            custoUnitarioReal: Math.round((Number(productionData.custoReal || 0) / quantidade) * 100) / 100,
            clienteId: saleFields.clienteId,
            clienteNome: saleFields.clienteNome,
            formaPagamento: saleFields.formaPagamento,
            status,
            updatedAt: serverTimestamp()
          };
          const productionUpdated = { ...productionData, ...productionFields, id: venda.producaoId };
          transaction.update(productionRef, productionFields);
          const saleUpdated = {
            ...criarDadosVendaProducao(productionUpdated, venda.producaoId),
            status,
            updatedAt: serverTimestamp()
          };
          saleUpdated.createdBy = saleSnapshot.data().createdBy || saleUpdated.createdBy;
          transaction.update(saleRef, {
            ...saleUpdated
          });
        });
      } else {
        await updateDoc(saleRef, { ...saleFields, updatedAt: serverTimestamp() });
      }
    }

    if (isProduction) {
      const producao = cachedProduction;
      if (producao) {
        Object.assign(producao, {
          data,
          quantidadeProduzida: quantidade,
          precoVendaUnitario: saleFields.valorUnitario,
          custoUnitarioReal: Math.round((Number(producao.custoReal || 0) / quantidade) * 100) / 100,
          clienteId: saleFields.clienteId,
          clienteNome: saleFields.clienteNome,
          formaPagamento: saleFields.formaPagamento,
          status,
          updatedAt: new Date().toISOString()
        });
      }
      const saleUpdated = producao
        ? {
            ...venda,
            ...criarDadosVendaProducao(producao, venda.producaoId),
            updatedAt: new Date().toISOString()
          }
        : {
            ...venda,
            ...saleFields,
            custoUnitario: Number(venda.custoUnitario || 0) * Number(venda.quantidade || 0) / quantidade,
            custosInsumos: (venda.custosInsumos || []).map(insumo => ({
              ...insumo,
              custoUnitario: Number(insumo.custoUnitario || 0) * Number(venda.quantidade || 0) / quantidade
            })),
            updatedAt: new Date().toISOString()
          };
      setCachedVendas(cachedVendas.map(item => item.id === venda.id ? saleUpdated : item));
    } else {
      setCachedVendas(cachedVendas.map(item => item.id === venda.id
        ? { ...item, ...saleFields, updatedAt: new Date().toISOString() }
        : item));
    }

    if (!firestoreDb || isTestStockMode || isLocal) {
      if (isProduction) salvarDadosProducoesLocais();
      localStorage.setItem(obterChaveStorageModulo('vendas'), JSON.stringify(cachedVendas));
    }
    renderizarProducoes();
    renderizarVendas();
    renderizarClientes();
    renderizarFinanceiro();
    fecharEdicaoVenda();
    showToast('Venda atualizada com sucesso.');
  } catch (error) {
    console.error('Erro ao editar venda:', error);
    showToast(`Não foi possível atualizar a venda: ${error.message || 'tente novamente.'}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar alterações';
  }
}

export async function salvarPedido(event) {
  event.preventDefault();
  const cliente = cachedClientes.find(item => item.id === dom.orderCustomer.value);
  const produto = cachedReceitas.find(item => item.id === dom.orderProduct.value);
  const quantidade = Number(dom.orderQuantity.value);
  const dataEntrega = dom.orderDeliveryDate.value;
  if (!cliente || !produto || !Number.isInteger(quantidade) || quantidade < 1 || !dataEntrega) {
    showToast('Informe cliente, produto, quantidade e data de entrega válidos.');
    return;
  }
  const pedido = {
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    produtoId: produto.id,
    produtoNome: produto.nome,
    quantidade,
    dataEntrega,
    status: dom.orderStatus.value,
    observacoes: dom.orderNotes.value.trim()
  };
  try {
    await persistirNovoRegistro('pedidos', 'pedidos', pedido, cachedPedidos);
    if (!firestoreDb || isTestStockMode) renderizarPedidos();
    dom.formPedido.reset();
    dom.orderQuantity.value = '1';
    dom.orderStatus.value = 'pendente';
    atualizarSelectProdutos();
    atualizarSelectClientes();
    showToast('Encomenda cadastrada com sucesso.');
  } catch (error) {
    console.error('Erro ao cadastrar encomenda:', error);
    showToast(`Não foi possível cadastrar a encomenda: ${error.message || 'tente novamente.'}`);
  }
}

export async function atualizarStatusPedido(pedidoId, status) {
  const pedido = cachedPedidos.find(item => item.id === pedidoId);
  if (!pedido || !['pendente', 'produzido', 'entregue', 'pago'].includes(status)) return;
  try {
    if (firestoreDb && !isTestStockMode && !pedidoId.startsWith('local-') && !pedidoId.startsWith('demo-')) {
      await updateDoc(doc(firestoreDb, 'pedidos', pedidoId), {
        status,
        updatedAt: serverTimestamp()
      });
    } else {
      const statusAnterior = pedido.status;
      pedido.status = status;
      try {
        localStorage.setItem(obterChaveStorageModulo('pedidos'), JSON.stringify(cachedPedidos));
      } catch (error) {
        pedido.status = statusAnterior;
        throw error;
      }
      renderizarPedidos();
    }
    showToast('Status da encomenda atualizado.');
  } catch (error) {
    console.error('Erro ao atualizar status da encomenda:', error);
    showToast(`Não foi possível atualizar o pedido: ${error.message || 'tente novamente.'}`);
    renderizarPedidos();
  }
}
