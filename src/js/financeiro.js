import {
  cachedVendas,
  cachedCashflow,
  cachedReceitas,
  cachedFixedExpenses,
  isTestStockMode,
  firestoreDb,
  currentUser,
  TEST_SALES_KEY,
  LOCAL_DEMO_SALES_KEY,
  TEST_ORDERS_KEY,
  LOCAL_DEMO_ORDERS_KEY,
  TEST_CUSTOMERS_KEY,
  LOCAL_DEMO_CUSTOMERS_KEY,
  TEST_CASHFLOW_KEY,
  LOCAL_DEMO_CASHFLOW_KEY,
  TEST_FIXED_EXPENSES_KEY,
  LOCAL_DEMO_FIXED_EXPENSES_KEY
} from './state.js';
import { dom } from './dom.js';
import {
  showToast,
  escapeHtml,
  formatarMoeda
} from './helpers.js';
import {
  doc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function formatarDataModulo(data) {
  if (!data) return '—';
  const [ano, mes, dia] = String(data).split('-').map(Number);
  return ano && mes && dia ? new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR') : '—';
}

export function dataISOValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const parsed = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === data;
}

export function obterDataLocalAtual() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function obterChaveStorageModulo(tipo) {
  const chaves = {
    vendas: isTestStockMode ? TEST_SALES_KEY : LOCAL_DEMO_SALES_KEY,
    pedidos: isTestStockMode ? TEST_ORDERS_KEY : LOCAL_DEMO_ORDERS_KEY,
    clientes: isTestStockMode ? TEST_CUSTOMERS_KEY : LOCAL_DEMO_CUSTOMERS_KEY,
    fluxoCaixa: isTestStockMode ? TEST_CASHFLOW_KEY : LOCAL_DEMO_CASHFLOW_KEY,
    despesasFixas: isTestStockMode ? TEST_FIXED_EXPENSES_KEY : LOCAL_DEMO_FIXED_EXPENSES_KEY
  };
  return chaves[tipo];
}

export async function persistirNovoRegistro(colecao, tipo, registro, cache) {
  if (firestoreDb && !isTestStockMode) {
    return await addDoc(collection(firestoreDb, colecao), {
      ...registro,
      createdBy: currentUser?.uid || '',
      createdAt: serverTimestamp()
    });
  }
  const salvo = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...registro,
    createdBy: currentUser?.uid || '',
    createdAt: new Date().toISOString()
  };
  const registrosAtualizados = [salvo, ...cache];
  localStorage.setItem(obterChaveStorageModulo(tipo), JSON.stringify(registrosAtualizados));
  cache.unshift(salvo);
  return salvo;
}

export function obterCustosInsumosProduto(receita) {
  const rendimento = Math.max(Number(receita?.rendimento) || 1, 1);
  return (receita?.itens || []).map(item => ({
    nome: String(item.insumoNome || item.nome || 'Insumo'),
    custoUnitario: Math.max(Number(item.custoItem || 0) / rendimento, 0)
  })).filter(item => item.custoUnitario > 0);
}

export function obterMesSelecionadoFinanceiro() {
  return dom.financeMonth.value || obterDataLocalAtual().slice(0, 7);
}

export function obterVendasDoMes(mes) {
  return cachedVendas.filter(venda =>
    venda.status !== 'cancelado' && String(venda.data || '').startsWith(mes)
  );
}

export function obterMovimentacoesDoMes(mes) {
  return cachedCashflow.filter(movimento => String(movimento.data || '').startsWith(mes));
}

export function formatarNomeCategoriaFinanceira(categoria) {
  return ({
    venda: 'Venda registrada',
    outra_entrada: 'Outra entrada',
    despesa_variavel: 'Despesa operacional',
    despesa_fixa: 'Pagamento de despesa fixa',
    retirada: 'Retirada'
  })[categoria] || 'Movimentação';
}

export function obterDespesasFixasAtivasNoMes(mes) {
  return cachedFixedExpenses.filter(despesa => {
    const criadoEm = despesa.createdAt?.toDate ? despesa.createdAt.toDate() : new Date(despesa.createdAt || '');
    if (Number.isNaN(criadoEm.getTime())) return mes >= obterDataLocalAtual().slice(0, 7);
    const mesInicial = `${criadoEm.getFullYear()}-${String(criadoEm.getMonth() + 1).padStart(2, '0')}`;
    return mes >= mesInicial;
  });
}

export function renderizarRankingFinanceiro(container, itens, formatarValor, chaveValor) {
  if (!itens.length) {
    container.innerHTML = '<div class="module-empty">Sem dados para este período.</div>';
    return;
  }
  const maximo = Math.max(...itens.map(item => Number(item[chaveValor]) || 0), 0);
  container.innerHTML = itens.map(item => {
    const valor = Math.max(Number(item[chaveValor]) || 0, 0);
    const largura = maximo > 0 ? Math.max(valor / maximo * 100, 2) : 0;
    return `<div class="finance-ranking-row">
      <span>${escapeHtml(item.nome)}</span><strong>${formatarValor(valor)}</strong>
      <div class="finance-ranking-track" aria-hidden="true"><div class="finance-ranking-bar" style="width:${largura.toFixed(1)}%"></div></div>
    </div>`;
  }).join('');
}

export function calcularResumoFinanceiro(mes) {
  const vendas = obterVendasDoMes(mes);
  const vendasPagas = vendas.filter(vendaEstaPaga);
  const movimentacoes = [
    ...obterMovimentacoesDoMes(mes),
    ...vendasPagas.map(venda => ({
      id: `venda-${venda.id}`,
      origem: 'venda',
      tipo: 'entrada',
      categoria: 'venda',
      descricao: `Venda: ${venda.produtoNome || 'Produto'}`,
      valor: Number(venda.valorTotal || 0),
      data: venda.data
    }))
  ].sort((left, right) => String(right.data || '').localeCompare(String(left.data || '')));
  const despesasFixasMes = obterDespesasFixasAtivasNoMes(mes);
  const fixasMensais = despesasFixasMes.reduce((soma, despesa) => soma + Number(despesa.valorMensal || 0), 0);
  const receitaTotal = vendasPagas.reduce((soma, venda) => soma + Number(venda.valorTotal || 0), 0);
  const custoProdutos = vendasPagas.reduce((soma, venda) => {
    const receita = cachedReceitas.find(item => item.id === venda.produtoId);
    const custoUnitario = Number(venda.custoUnitario ?? receita?.custoUnitario ?? 0);
    return soma + Math.max(custoUnitario, 0) * Number(venda.quantidade || 0);
  }, 0);
  const despesasOperacionais = movimentacoes
    .filter(movimento => movimento.tipo === 'saida' &&
      movimento.categoria !== 'despesa_fixa' &&
      movimento.categoria !== 'retirada')
    .reduce((soma, movimento) => soma + Number(movimento.valor || 0), 0);
  const entradasFluxo = movimentacoes
    .filter(movimento => movimento.tipo === 'entrada')
    .reduce((soma, movimento) => soma + Number(movimento.valor || 0), 0);
  const saidasFluxo = movimentacoes
    .filter(movimento => movimento.tipo === 'saida')
    .reduce((soma, movimento) => soma + Number(movimento.valor || 0), 0);
  const lucro = receitaTotal - custoProdutos - despesasOperacionais - fixasMensais;
  const margemReceitasCadastradas = cachedReceitas.reduce((total, receita) => {
    const preco = Number(receita.precoVendaPraticado ?? receita.precoVendaSugerido ?? 0);
    if (preco <= 0) return total;
    return {
      receita: total.receita + preco,
      contribuicao: total.contribuicao + preco - Math.max(Number(receita.custoUnitario || 0), 0)
    };
  }, { receita: 0, contribuicao: 0 });
  const margemContribuicao = receitaTotal > 0
    ? Math.max((receitaTotal - custoProdutos) / receitaTotal, 0)
    : margemReceitasCadastradas.receita > 0
      ? Math.max(margemReceitasCadastradas.contribuicao / margemReceitasCadastradas.receita, 0)
      : 0;
  const pontoEquilibrio = margemContribuicao > 0 ? fixasMensais / margemContribuicao : null;
  return {
    vendas,
    vendasPagas,
    movimentacoes,
    receitaTotal,
    custoProdutos,
    despesasOperacionais,
    fixasMensais,
    lucro,
    entradasFluxo,
    saidasFluxo,
    saldoFluxo: entradasFluxo - saidasFluxo,
    pontoEquilibrio
  };
}

export function renderizarFinanceiro() {
  if (!dom.financeMonth) return;
  const mes = obterMesSelecionadoFinanceiro();
  const resumo = calcularResumoFinanceiro(mes);
  const dinheiro = valor => formatarMoeda(valor);
  dom.financeRevenue.textContent = dinheiro(resumo.receitaTotal);
  dom.financeCogs.textContent = dinheiro(resumo.custoProdutos);
  dom.financeOperatingExpenses.textContent = dinheiro(resumo.despesasOperacionais + resumo.fixasMensais);
  dom.financeNetProfit.textContent = dinheiro(resumo.lucro);
  dom.financeNetProfit.classList.toggle('finance-positive', resumo.lucro >= 0);
  dom.financeNetProfit.classList.toggle('finance-negative', resumo.lucro < 0);
  dom.financeCashBalance.textContent = dinheiro(resumo.saldoFluxo);
  dom.financeCashBalance.classList.toggle('finance-positive', resumo.saldoFluxo >= 0);
  dom.financeCashBalance.classList.toggle('finance-negative', resumo.saldoFluxo < 0);
  dom.financeBreakEven.textContent = resumo.pontoEquilibrio === null ? '—' : dinheiro(resumo.pontoEquilibrio);
  dom.financeBreakEvenProgress.textContent = resumo.pontoEquilibrio === null
    ? 'Cadastre produtos com preço e custo para estimar a margem de contribuição.'
    : resumo.receitaTotal === 0
      ? 'Estimativa baseada nos preços e custos dos produtos cadastrados.'
      : resumo.receitaTotal >= resumo.pontoEquilibrio
        ? 'Ponto de equilíbrio atingido neste mês.'
        : `Faltam ${dinheiro(resumo.pontoEquilibrio - resumo.receitaTotal)} em vendas para atingir o ponto de equilíbrio.`;

  const rentabilidade = new Map();
  const volume = new Map();
  const custosInsumos = new Map();
  resumo.vendasPagas.forEach(venda => {
    const quantidade = Number(venda.quantidade || 0);
    const receita = cachedReceitas.find(item => item.id === venda.produtoId);
    const custoUnitario = Number(venda.custoUnitario ?? receita?.custoUnitario ?? 0);
    const valorVenda = Number(venda.valorTotal || 0);
    const lucroProduto = valorVenda - custoUnitario * quantidade;
    const rentabilidadeAtual = rentabilidade.get(venda.produtoId) || { nome: venda.produtoNome || 'Produto', valor: 0 };
    rentabilidadeAtual.valor += lucroProduto;
    rentabilidade.set(venda.produtoId, rentabilidadeAtual);
    const insumosVenda = Array.isArray(venda.custosInsumos)
      ? venda.custosInsumos
      : obterCustosInsumosProduto(receita);
    insumosVenda.forEach(insumo => {
      const nome = String(insumo.nome || 'Insumo');
      custosInsumos.set(nome, (custosInsumos.get(nome) || 0) + Number(insumo.custoUnitario || 0) * quantidade);
    });
  });
  resumo.vendas.forEach(venda => {
    const quantidade = Number(venda.quantidade || 0);
    const volumeAtual = volume.get(venda.produtoId) || { nome: venda.produtoNome || 'Produto', quantidade: 0 };
    volumeAtual.quantidade += quantidade;
    volume.set(venda.produtoId, volumeAtual);
  });
  renderizarRankingFinanceiro(
    dom.financeTopProfitable,
    [...rentabilidade.values()].sort((a, b) => b.valor - a.valor).slice(0, 5),
    dinheiro,
    'valor'
  );
  renderizarRankingFinanceiro(
    dom.financeTopSelling,
    [...volume.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5),
    quantidade => `${quantidade.toLocaleString('pt-BR')} un.`,
    'quantidade'
  );
  renderizarRankingFinanceiro(
    dom.financeTopIngredients,
    [...custosInsumos].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 5),
    dinheiro,
    'valor'
  );

  dom.financeTransactionsTotal.textContent = `${resumo.movimentacoes.length} ${resumo.movimentacoes.length === 1 ? 'registro' : 'registros'}`;
  dom.financeTransactionsEmpty.classList.toggle('hidden', resumo.movimentacoes.length > 0);
  dom.financeTransactionsList.innerHTML = resumo.movimentacoes.map(movimento => `
    <article class="module-record-card">
      <div class="module-record-heading">
        <h3>${escapeHtml(movimento.descricao)}</h3>
        <strong class="${movimento.tipo === 'entrada' ? 'finance-positive' : 'finance-negative'}">${movimento.tipo === 'entrada' ? '+' : '−'} ${dinheiro(Number(movimento.valor || 0))}</strong>
      </div>
      <div class="module-record-meta"><span>${formatarNomeCategoriaFinanceira(movimento.categoria)}</span><span>${formatarDataModulo(movimento.data)}</span></div>
      ${movimento.origem === 'venda' ? '' : `<button type="button" class="btn-secondary" data-delete-cashflow="${escapeHtml(movimento.id)}" style="margin-top:10px;padding:8px 12px;font-size:12px">Excluir movimentação</button>`}
    </article>
  `).join('');
  dom.fixedExpensesEmpty.classList.toggle('hidden', cachedFixedExpenses.length > 0);
  dom.fixedExpensesList.innerHTML = cachedFixedExpenses.map(despesa => `
    <article class="module-record-card">
      <div class="module-record-heading">
        <h3>${escapeHtml(despesa.nome)}</h3><strong>${dinheiro(Number(despesa.valorMensal || 0))} / mês</strong>
      </div>
      <div class="module-record-meta"><span>Vencimento: dia ${Number(despesa.diaVencimento || 1)}</span>
        <button type="button" class="btn-secondary" data-delete-fixed-expense="${escapeHtml(despesa.id)}" style="padding:8px 12px;font-size:12px">Excluir</button>
      </div>
    </article>
  `).join('');
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

export function obterStatusVenda(status) {
  return ({
    pago: { label: 'Pago · pagamento realizado', css: 'status-paid' },
    aguardando_pagamento: { label: 'Aguardando pagamento', css: 'status-pending' },
    em_processo: { label: 'Em processo', css: 'status-pending' },
    pronto: { label: 'Pronto para retirada/entrega', css: 'status-pending' },
    entregue: { label: 'Entregue', css: 'status-pending' },
    cancelado: { label: 'Cancelado', css: 'status-cancelled' }
  })[status || 'pago'] || { label: 'Pago · pagamento realizado', css: 'status-paid' };
}

export function vendaEstaPaga(venda) {
  return (venda.status || 'pago') === 'pago';
}

export async function salvarMovimentacaoFinanceira(event) {
  event.preventDefault();
  const tipo = dom.financeTransactionType.value;
  const categoria = dom.financeTransactionCategory.value;
  const categoriasValidas = tipo === 'entrada'
    ? ['outra_entrada']
    : ['despesa_variavel', 'despesa_fixa', 'retirada'];
  const valor = Number(dom.financeTransactionAmount.value);
  const data = dom.financeTransactionDate.value;
  if (!categoriasValidas.includes(categoria) || !Number.isFinite(valor) || valor <= 0 || !data) {
    showToast('Informe tipo, categoria, valor e data válidos para a movimentação.');
    return;
  }
  const registro = {
    tipo,
    categoria,
    descricao: dom.financeTransactionDescription.value.trim(),
    valor: Math.round(valor * 100) / 100,
    data
  };
  try {
    await persistirNovoRegistro('movimentacoesFinanceiras', 'fluxoCaixa', registro, cachedCashflow);
    if (!firestoreDb || isTestStockMode) renderizarFinanceiro();
    dom.financeTransactionForm.reset();
    dom.financeTransactionType.value = 'entrada';
    atualizarCategoriasMovimentacao();
    dom.financeTransactionDate.value = obterDataLocalAtual();
    showToast('Movimentação registrada no fluxo de caixa.');
  } catch (error) {
    console.error('Erro ao registrar movimentação financeira:', error);
    showToast(`Não foi possível registrar a movimentação: ${error.message || 'tente novamente.'}`);
  }
}

export async function salvarDespesaFixa(event) {
  event.preventDefault();
  const nome = dom.fixedExpenseName.value.trim();
  const valorMensal = Number(dom.fixedExpenseAmount.value);
  const diaVencimento = Number(dom.fixedExpenseDueDay.value || 1);
  if (!nome || !Number.isFinite(valorMensal) || valorMensal <= 0 ||
      !Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
    showToast('Informe descrição, valor mensal e dia de vencimento válidos.');
    return;
  }
  try {
    await persistirNovoRegistro('despesasFixas', 'despesasFixas', {
      nome,
      valorMensal: Math.round(valorMensal * 100) / 100,
      diaVencimento
    }, cachedFixedExpenses);
    if (!firestoreDb || isTestStockMode) renderizarFinanceiro();
    dom.fixedExpenseForm.reset();
    dom.fixedExpenseDueDay.value = '10';
    showToast('Despesa fixa cadastrada.');
  } catch (error) {
    console.error('Erro ao cadastrar despesa fixa:', error);
    showToast(`Não foi possível cadastrar a despesa fixa: ${error.message || 'tente novamente.'}`);
  }
}

export function atualizarCategoriasMovimentacao() {
  const saida = dom.financeTransactionType.value === 'saida';
  const categoriaSelecionada = dom.financeTransactionCategory.value;
  dom.financeTransactionCategory.innerHTML = saida
    ? '<option value="despesa_variavel">Despesa operacional</option><option value="despesa_fixa">Pagamento de despesa fixa</option><option value="retirada">Retirada</option>'
    : '<option value="outra_entrada">Outra entrada</option>';
  const categoriasValidas = saida
    ? ['despesa_variavel', 'despesa_fixa', 'retirada']
    : ['outra_entrada'];
  dom.financeTransactionCategory.value = categoriasValidas.includes(categoriaSelecionada)
    ? categoriaSelecionada
    : categoriasValidas[0];
}

export async function excluirRegistroFinanceiro(tipo, id) {
  const configuracoes = {
    fluxoCaixa: { collection: 'movimentacoesFinanceiras', cache: cachedCashflow },
    despesasFixas: { collection: 'despesasFixas', cache: cachedFixedExpenses }
  };
  const configuracao = configuracoes[tipo];
  if (!configuracao || !id || !configuracao.cache.some(item => item.id === id)) return;
  if (!window.confirm('Deseja excluir este registro financeiro?')) return;
  try {
    if (firestoreDb && !isTestStockMode && !id.startsWith('local-') && !id.startsWith('demo-')) {
      await deleteDoc(doc(firestoreDb, configuracao.collection, id));
    } else {
      const atualizados = configuracao.cache.filter(item => item.id !== id);
      localStorage.setItem(obterChaveStorageModulo(tipo), JSON.stringify(atualizados));
      configuracao.cache.splice(0, configuracao.cache.length, ...atualizados);
      renderizarFinanceiro();
    }
    showToast('Registro financeiro excluído.');
  } catch (error) {
    console.error('Erro ao excluir registro financeiro:', error);
    showToast(`Não foi possível excluir o registro: ${error.message || 'tente novamente.'}`);
  }
}
