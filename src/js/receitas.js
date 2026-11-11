import {
  cachedReceitas,
  cachedRecipeGroups,
  cachedInsumos,
  cachedProducoes,
  cachedVendas,
  cachedClientes,
  editingReceitaId,
  editingFornecedorId,
  itensReceitaEmElaboracao,
  gruposReceitaEmElaboracao,
  grupoReceitaSelecionadoId,
  itensGrupoModeloEmEdicao,
  editingRecipeGroupId,
  fotoReceitaDataUrl,
  listasReceitaRecolhidas,
  currentUser,
  isTestStockMode,
  firestoreDb,
  DEMO_SEED_INSUMOS,
  activeRecipeCategory,
  activeRecipePanel,
  setActiveRecipePanel,
  setEditingReceitaId,
  setEditingRecipeGroupId,
  setFotoReceitaDataUrl,
  setGrupoReceitaSelecionadoId,
  setGruposReceitaEmElaboracao,
  setItensGrupoModeloEmEdicao,
  setItensReceitaEmElaboracao,
  TEST_RECIPE_GROUPS_KEY,
  LOCAL_DEMO_RECIPE_GROUPS_KEY,
  TEST_ITEMS_KEY,
  LOCAL_DEMO_ITEMS_KEY,
  setCachedReceitas,
  setCachedRecipeGroups,
  setCachedInsumos
} from './state.js';
import { dom } from './dom.js';
import {
  showToast,
  escapeHtml,
  formatarMoeda,
  calcularCustoUnitario,
  normalizarTextoBusca,
  correspondeBusca,
  formatarCustoComUnidade,
  calcularCustoItemReceita,
  calcularTotaisReceita,
  obterCustosIndiretosDoFormulario,
  obterCustosIndiretosDaReceita,
  calcularLucroEPrecificacao
} from './helpers.js';
import { initFirebase, salvarDadosReceitasLocais } from './firebaseAuth.js';
import { renderizarInsumos, formatarQuantidadeEstoque, atualizarReceitasDependentes } from './insumos.js';
import { atualizarSelectFornecedores, renderizarFornecedores, obterFornecedorDoInsumo } from './firestoreData.js';
import { calcularCustoUnitarioReceita } from '../utils/costCalculator.ts';
import { compareSupplierOffers, getSupplierOfferComparisonKey } from '../utils/supplierComparison.ts';
import { calcularListaComprasReceita } from '../utils/inventory.ts';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function normalizarUnidadeRendimento(unidade) {
  const valor = String(unidade || '').trim().toLowerCase();
  if (valor === 'kg' || valor.includes('quilo')) return 'kg';
  if (valor === 'g' || valor.includes('grama')) return 'g';
  if (valor === 'l' || valor === 'litro' || valor === 'litros') return 'L';
  if (valor === 'ml' || valor.includes('mililitro')) return 'ml';
  if (valor === 'xicara' || valor === 'xícara') return 'xicara';
  if (valor === 'colher_sopa') return 'colher_sopa';
  if (valor === 'colher_cha') return 'colher_cha';
  return 'un';
}

export function obterCustoPorUnidadeReceita(receita) {
  return calcularCustoUnitarioReceita(receita);
}

export function receitaAlcanca(receitaOrigemId, receitaAlvoId, visitadas = new Set()) {
  if (receitaOrigemId === receitaAlvoId) return true;
  if (visitadas.has(receitaOrigemId)) return false;
  visitadas.add(receitaOrigemId);
  const origem = cachedReceitas.find(receita => receita.id === receitaOrigemId);
  return (origem?.itens || []).some(item =>
    item.receitaId && receitaAlcanca(item.receitaId, receitaAlvoId, visitadas)
  );
}

export function criariaCicloReceita(receitaPaiId, receitaBaseId) {
  return Boolean(receitaPaiId && receitaAlcanca(receitaBaseId, receitaPaiId));
}

export function renderizarResultadosBuscaInsumosReceita() {
  const termo = normalizarTextoBusca(dom.receitaItemBusca.value.trim());
  const options = Array.from(dom.receitaItemInsumo.options)
    .filter(option => option.value)
    .filter(option => !termo || normalizarTextoBusca(option.textContent || '').includes(termo));

  if (options.length === 0) {
    dom.receitaItemResultados.innerHTML = '<div role="status" style="padding: 10px 12px; color: var(--text-muted); font-size: 13px;">Nenhum material encontrado.</div>';
  } else {
    dom.receitaItemResultados.innerHTML = options.map(option => {
      const group = option.parentElement?.tagName === 'OPTGROUP'
        ? option.parentElement.label
        : 'Material';
      return `<button type="button" role="option" aria-selected="false" data-recipe-material-value="${escapeHtml(option.value)}" style="display: block; width: 100%; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--border-color); background: #fff; color: var(--text-primary); text-align: left; cursor: pointer;">
        <span style="display: block; color: var(--text-muted); font-size: 10px;">${escapeHtml(group)}</span>
        <span style="font-size: 13px;">${escapeHtml(option.textContent || '')}</span>
      </button>`;
    }).join('');
  }

  const aberto = document.activeElement === dom.receitaItemBusca;
  dom.receitaItemResultados.classList.toggle('hidden', !aberto);
  dom.receitaItemBusca.setAttribute('aria-expanded', String(aberto));
}

export function atualizarSelectsInsumosParaReceitas() {
  renderizarGruposReceitaEmElaboracao();
  const insumosDisponiveis = cachedInsumos.length > 0 ? cachedInsumos : DEMO_SEED_INSUMOS;
  const receitasDisponiveis = cachedReceitas;
  const melhoresOfertas = new Set(
    compareSupplierOffers(insumosDisponiveis)
      .filter(group => group.offers.length > 1)
      .map(group => group.offers[0]?.offer.id)
      .filter(Boolean)
  );

  const grupos = {
    ingrediente: [],
    embalagem: [],
    outro: []
  };

  insumosDisponiveis.forEach(i => {
    const cat = i.categoria || 'ingrediente';
    grupos[cat] = grupos[cat] || [];
    grupos[cat].push(i);
  });

  let optionsHtml = '<option value="">Selecione a matéria-prima ou embalagem...</option>';

  const criarOpcaoInsumo = i => {
    const supplierName = obterFornecedorDoInsumo(i)?.nome || i.fornecedor || 'Fornecedor não informado';
    const description = `${i.nome}${i.marca ? ` · ${i.marca}` : ''} — ${supplierName}`;
    const cheapest = melhoresOfertas.has(i.id);
    const cost = formatarCustoComUnidade(i.custoUnitario, i.unidade);
    return `<option value="${i.id}" data-source-type="insumo" data-name="${escapeHtml(i.nome)}" data-cat="${escapeHtml(i.categoria || 'ingrediente')}" data-unit="${escapeHtml(i.unidade)}" data-cost="${i.custoUnitario}" data-conversions="${escapeHtml(JSON.stringify(i.conversoes || {}))}" data-offer-id="${escapeHtml(i.id)}" data-group-key="${escapeHtml(getSupplierOfferComparisonKey(i))}">${escapeHtml(description)} (${cost})${cheapest ? ' · ⭐ Menor custo equivalente' : ''}</option>`;
  };

  if (grupos.ingrediente.length > 0) {
    optionsHtml += '<optgroup label="🌾 Ingredientes">';
    grupos.ingrediente.forEach(i => {
      optionsHtml += criarOpcaoInsumo(i);
    });
    optionsHtml += '</optgroup>';
  }

  if (grupos.embalagem.length > 0) {
    optionsHtml += '<optgroup label="🛍️ Embalagens & Formas Descartáveis">';
    grupos.embalagem.forEach(i => {
      optionsHtml += criarOpcaoInsumo(i);
    });
    optionsHtml += '</optgroup>';
  }

  if (grupos.outro.length > 0) {
    optionsHtml += '<optgroup label="📦 Outros">';
    grupos.outro.forEach(i => {
      optionsHtml += criarOpcaoInsumo(i);
    });
    optionsHtml += '</optgroup>';
  }

  if (receitasDisponiveis.length > 0) {
    optionsHtml += '<optgroup label="🍞 Massas e receitas-base">';
    receitasDisponiveis.forEach(receita => {
      if (receita.id === editingReceitaId) return;
      const unidade = normalizarUnidadeRendimento(receita.rendimentoUnidade);
      const custo = obterCustoPorUnidadeReceita(receita);
      optionsHtml += `<option value="receita:${receita.id}" data-source-type="receita" data-name="${escapeHtml(receita.nome)}" data-recipe-id="${receita.id}" data-cat="ingrediente" data-unit="${unidade}" data-cost="${custo}" data-conversions="{}">${escapeHtml(receita.nome)} (${formatarCustoComUnidade(custo, unidade)})</option>`;
    });
    optionsHtml += '</optgroup>';
  }

  if (dom.receitaItemInsumo) {
    dom.receitaItemInsumo.innerHTML = optionsHtml;
  }
  if (dom.recipeGroupTemplateMaterial) {
    dom.recipeGroupTemplateMaterial.innerHTML = optionsHtml;
  }
  if (dom.selectModalAddInsumo) {
    dom.selectModalAddInsumo.innerHTML = optionsHtml;
  }
  if (dom.calcSelectInsumo) {
    dom.calcSelectInsumo.innerHTML = optionsHtml;
  }
  renderizarResultadosBuscaInsumosReceita();
  if (dom.recipeShoppingList && itensReceitaEmElaboracao.length > 0) {
    renderizarListaComprasReceita();
  }
}

export function atualizarPreviewItemReceita() {
  const insumoId = dom.receitaItemInsumo.value;
  const qtd = parseFloat(dom.receitaItemQuantidade.value) || 0;
  const unidadeUsada = dom.receitaItemUnidade.value;

  if (!insumoId || qtd <= 0) {
    dom.receitaItemCostPreview.textContent = 'R$ 0,00';
    return;
  }

  const selectedOption = dom.receitaItemInsumo.selectedOptions[0];
  const custoUnitario = parseFloat(selectedOption?.getAttribute('data-cost')) || 0;
  const unidadeBase = selectedOption?.getAttribute('data-unit') || 'kg';
  const conversoes = JSON.parse(selectedOption?.getAttribute('data-conversions') || '{}');

  const custoItem = calcularCustoItemReceita(custoUnitario, unidadeBase, qtd, unidadeUsada, conversoes);
  dom.receitaItemCostPreview.textContent = formatarMoeda(custoItem, 2);
}

export function criarGrupoReceita(nome = 'Ingredientes') {
  return {
    id: `grupo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome
  };
}

export function obterGruposEItensReceita(receita) {
  const grupos = [];
  const ids = new Set();
  (Array.isArray(receita.gruposIngredientes) ? receita.gruposIngredientes : []).forEach(grupo => {
    const id = String(grupo?.id || '');
    const nome = String(grupo?.nome || '').trim().slice(0, 60);
    if (!id || !nome || ids.has(id)) return;
    ids.add(id);
    grupos.push({ id, nome });
  });

  const itens = Array.isArray(receita.itens) ? receita.itens : [];
  itens.forEach(item => {
    const id = String(item.grupoId || '');
    if (!id || ids.has(id)) return;
    const nome = String(item.grupoNome || '').trim().slice(0, 60);
    if (!nome) return;
    ids.add(id);
    grupos.push({ id, nome });
  });

  return {
    grupos,
    itens: itens.map(item => ({
      ...item,
      grupoId: ids.has(String(item.grupoId || '')) ? String(item.grupoId) : null
    }))
  };
}

export function salvarGruposReceitaLocais() {
  const key = isTestStockMode ? TEST_RECIPE_GROUPS_KEY : LOCAL_DEMO_RECIPE_GROUPS_KEY;
  localStorage.setItem(key, JSON.stringify(cachedRecipeGroups));
}

export function prepararNovoGrupoModelo() {
  setEditingRecipeGroupId(null);
  setItensGrupoModeloEmEdicao([]);
  dom.recipeGroupTemplateForm.reset();
  dom.recipeGroupTemplateUnit.value = 'g';
  dom.recipeGroupTemplateFormTitle.textContent = 'Cadastrar grupo de ingredientes';
  dom.btnSaveRecipeGroupTemplate.textContent = 'Salvar grupo';
  dom.btnCancelRecipeGroupTemplate.classList.add('hidden');
  renderizarItensGrupoModelo();
}

export function renderizarItensGrupoModelo() {
  if (!itensGrupoModeloEmEdicao.length) {
    dom.recipeGroupTemplateItems.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px;">Nenhum material no grupo.</td></tr>';
    return;
  }
  dom.recipeGroupTemplateItems.innerHTML = itensGrupoModeloEmEdicao.map((item, index) => `
    <tr>
      <td><strong>${escapeHtml(item.insumoNome)}</strong></td>
      <td>${item.sourceType === 'receita' ? 'Receita-base' : item.categoria === 'embalagem' ? 'Embalagem' : 'Insumo'}</td>
      <td>${formatarQuantidadeEstoque(item.quantidadeUsada)} ${escapeHtml(item.unidadeUsada)}</td>
      <td>${formatarMoeda(item.custoItem, 2)}</td>
      <td><button type="button" class="btn-remove-draft-item" data-remove-recipe-group-template-item="${index}" aria-label="Remover ${escapeHtml(item.insumoNome)}">✕</button></td>
    </tr>
  `).join('');
}

export function adicionarItemGrupoModelo() {
  const select = dom.recipeGroupTemplateMaterial;
  const option = select.selectedOptions[0];
  const materialValue = select.value;
  const quantidade = Number(dom.recipeGroupTemplateQuantity.value);
  const unidadeUsada = dom.recipeGroupTemplateUnit.value;
  if (!materialValue || !option) {
    showToast('Selecione um insumo, embalagem ou material.');
    select.focus();
    return;
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    showToast('Informe uma quantidade maior que zero.');
    dom.recipeGroupTemplateQuantity.focus();
    return;
  }

  const sourceType = option.getAttribute('data-source-type') || 'insumo';
  const receitaId = option.getAttribute('data-recipe-id') || null;
  const insumoId = sourceType === 'insumo' ? materialValue : null;
  const custoUnitarioBase = Number(option.getAttribute('data-cost')) || 0;
  const unidadeBase = option.getAttribute('data-unit') || 'kg';
  let conversoes = {};
  try {
    conversoes = JSON.parse(option.getAttribute('data-conversions') || '{}');
  } catch (error) {
    console.error('Conversões inválidas no material do grupo:', error);
    showToast('Não foi possível ler as conversões deste material.');
    return;
  }
  itensGrupoModeloEmEdicao.push({
    insumoId,
    ofertaInsumoId: option.getAttribute('data-offer-id') || insumoId,
    sourceType,
    ...(receitaId ? { receitaId } : {}),
    insumoNome: option.getAttribute('data-name') || option.textContent.trim(),
    categoria: option.getAttribute('data-cat') || 'ingrediente',
    quantidadeUsada: quantidade,
    unidadeUsada,
    custoUnitarioBase,
    unidadeBase,
    conversoes,
    custoItem: calcularCustoItemReceita(custoUnitarioBase, unidadeBase, quantidade, unidadeUsada, conversoes)
  });
  dom.recipeGroupTemplateMaterial.value = '';
  dom.recipeGroupTemplateQuantity.value = '';
  renderizarItensGrupoModelo();
}

export function renderizarGruposModeloReceita() {
  const grupos = [...cachedRecipeGroups].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  dom.recipeGroupsCounter.textContent = `${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}`;
  dom.recipeGroupTemplatesEmpty.classList.toggle('hidden', grupos.length > 0);
  dom.recipeGroupTemplatesList.innerHTML = grupos.map(grupo => {
    const itens = Array.isArray(grupo.itens) ? grupo.itens : [];
    const custoTotal = itens.reduce((total, item) => total + (Number(item.custoItem) || 0), 0);
    return `
      <article class="insumo-card">
        <div class="recipe-group-template-card">
          <div class="recipe-group-template-card-info">
            <h3 class="insumo-nome">${escapeHtml(grupo.nome)}</h3>
            ${grupo.descricao ? `<p class="insumo-fornecedor">${escapeHtml(grupo.descricao)}</p>` : ''}
            <span class="calc-detail">${itens.length} ${itens.length === 1 ? 'material' : 'materiais'} · Custo de referência ${formatarMoeda(custoTotal, 2)}</span>
            <div class="recipe-template-materials">${itens.map(item => `<span>${escapeHtml(item.insumoNome)} — ${formatarQuantidadeEstoque(item.quantidadeUsada)} ${escapeHtml(item.unidadeUsada)}</span>`).join('')}</div>
          </div>
          <div class="recipe-group-template-card-actions">
            <button type="button" class="btn-secondary" data-edit-recipe-group-template="${escapeHtml(grupo.id)}">Editar</button>
            <button type="button" class="btn-remove-draft-item" data-delete-recipe-group-template="${escapeHtml(grupo.id)}" aria-label="Excluir grupo ${escapeHtml(grupo.nome)}">Excluir</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
  renderizarGruposReceitaEmElaboracao();
  atualizarSelectsInsumosParaReceitas();
}

export function editarGrupoModeloReceita(grupoId) {
  const grupo = cachedRecipeGroups.find(item => item.id === grupoId);
  if (!grupo) return;
  setEditingRecipeGroupId(grupoId);
  dom.recipeGroupTemplateName.value = grupo.nome || '';
  dom.recipeGroupTemplateDescription.value = grupo.descricao || '';
  setItensGrupoModeloEmEdicao(Array.isArray(grupo.itens) ? grupo.itens.map(item => ({ ...item })) : []);
  dom.recipeGroupTemplateFormTitle.textContent = `Editar grupo: ${grupo.nome}`;
  dom.btnSaveRecipeGroupTemplate.textContent = 'Salvar alterações';
  dom.btnCancelRecipeGroupTemplate.classList.remove('hidden');
  renderizarItensGrupoModelo();
  dom.recipeGroupTemplateForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  dom.recipeGroupTemplateName.focus();
}

export async function salvarGrupoModeloReceita(event) {
  event.preventDefault();
  const nome = dom.recipeGroupTemplateName.value.trim();
  const descricao = dom.recipeGroupTemplateDescription.value.trim();
  const quantidadeMateriais = itensGrupoModeloEmEdicao.length;
  if (!nome || nome.length > 60 || descricao.length > 200) {
    showToast('Informe um nome de até 60 caracteres e descrição de até 200 caracteres.');
    return;
  }
  if (!itensGrupoModeloEmEdicao.length) {
    showToast('Adicione ao menos um material ao grupo antes de salvar.');
    dom.recipeGroupTemplateMaterial.focus();
    return;
  }
  const nomeDuplicado = cachedRecipeGroups.some(grupo =>
    grupo.id !== editingRecipeGroupId && normalizarTextoBusca(grupo.nome) === normalizarTextoBusca(nome)
  );

  const payload = {
    nome,
    descricao,
    itens: itensGrupoModeloEmEdicao.map(item => ({ ...item })),
    updatedAt: isTestStockMode ? new Date().toISOString() : serverTimestamp()
  };
  try {
    dom.btnSaveRecipeGroupTemplate.disabled = true;
    if (editingRecipeGroupId) {
      const grupo = cachedRecipeGroups.find(item => item.id === editingRecipeGroupId);
      if (!grupo) throw new Error('O grupo que você está editando não foi encontrado.');
      if (firestoreDb && !isTestStockMode && !editingRecipeGroupId.startsWith('local-') && !editingRecipeGroupId.startsWith('demo-')) {
        await updateDoc(doc(firestoreDb, 'gruposReceita', editingRecipeGroupId), payload);
      }
      Object.assign(grupo, payload, { updatedAt: new Date().toISOString() });
    } else {
      const novoGrupo = {
        ...payload,
        createdBy: currentUser?.uid || 'local',
        createdAt: new Date().toISOString()
      };
      if (firestoreDb && !isTestStockMode) {
        const document = await addDoc(collection(firestoreDb, 'gruposReceita'), {
          ...payload,
          createdBy: currentUser?.uid || 'anon',
          createdAt: serverTimestamp()
        });
        cachedRecipeGroups.unshift({ ...novoGrupo, id: document.id });
      } else {
        cachedRecipeGroups.unshift({
          ...novoGrupo,
          id: `${isTestStockMode ? 'demo-' : 'local-'}grupo-${Date.now()}`
        });
      }
    }
    if (!firestoreDb || isTestStockMode || cachedRecipeGroups.some(grupo => grupo.id.startsWith('local-') || grupo.id.startsWith('demo-'))) {
      salvarGruposReceitaLocais();
    }
    prepararNovoGrupoModelo();
    renderizarGruposModeloReceita();
    showToast(nomeDuplicado
      ? `Aviso: já existe outro grupo chamado "${nome}". O grupo foi salvo com ${quantidadeMateriais} ${quantidadeMateriais === 1 ? 'material' : 'materiais'}.`
      : `Grupo "${nome}" salvo com ${quantidadeMateriais} ${quantidadeMateriais === 1 ? 'material' : 'materiais'}.`);
  } catch (error) {
    console.error('Erro ao salvar grupo de ingredientes:', error);
    showToast(`Não foi possível salvar o grupo: ${error.message || 'tente novamente.'}`);
  } finally {
    dom.btnSaveRecipeGroupTemplate.disabled = false;
  }
}

export async function excluirGrupoModeloReceita(grupoId) {
  const grupo = cachedRecipeGroups.find(item => item.id === grupoId);
  if (!grupo || !window.confirm(`Excluir o grupo "${grupo.nome}" do catálogo? As receitas já criadas não serão alteradas.`)) return;
  try {
    if (firestoreDb && !isTestStockMode && !grupoId.startsWith('local-') && !grupoId.startsWith('demo-')) {
      await deleteDoc(doc(firestoreDb, 'gruposReceita', grupoId));
    }
    setCachedRecipeGroups(cachedRecipeGroups.filter(item => item.id !== grupoId));
    if (!firestoreDb || isTestStockMode || grupoId.startsWith('local-') || grupoId.startsWith('demo-')) salvarGruposReceitaLocais();
    if (editingRecipeGroupId === grupoId) prepararNovoGrupoModelo();
    renderizarGruposModeloReceita();
    showToast(`Grupo "${grupo.nome}" excluído do catálogo.`);
  } catch (error) {
    console.error('Erro ao excluir grupo de ingredientes:', error);
    showToast(`Não foi possível excluir o grupo: ${error.message || 'tente novamente.'}`);
  }
}

export function atualizarModoOrganizacaoGrupoReceita(modo) {
  const modoSelecionado = modo || dom.recipeGroupModeInputs.find(input => input.checked)?.value || 'standalone';
  dom.recipeGroupModeInputs.forEach(input => {
    input.checked = input.value === modoSelecionado;
  });
  dom.recipeGroupExistingPanel.classList.toggle('hidden', modoSelecionado !== 'existing');
  dom.recipeGroupNewPanel.classList.toggle('hidden', modoSelecionado !== 'new');
  if (modoSelecionado === 'standalone') setGrupoReceitaSelecionadoId('');
}

export function adicionarGrupoReceita(nomeInformado = dom.inputNovoGrupoReceita.value.trim()) {
  const nome = nomeInformado.trim();
  if (!nome) {
    showToast('Informe um nome para o grupo.');
    dom.inputNovoGrupoReceita.focus();
    return;
  }
  if (nome.length > 60) {
    showToast('O nome do grupo deve ter no máximo 60 caracteres.');
    return;
  }
  if (gruposReceitaEmElaboracao.length >= 30) {
    showToast('Cada receita pode ter no máximo 30 grupos.');
    return;
  }
  const grupoDuplicado = gruposReceitaEmElaboracao.some(grupo =>
    normalizarTextoBusca(grupo.nome) === normalizarTextoBusca(nome)
  );
  const grupo = criarGrupoReceita(nome);
  gruposReceitaEmElaboracao.push(grupo);
  setGrupoReceitaSelecionadoId(grupo.id);
  atualizarModoOrganizacaoGrupoReceita('new');
  dom.inputNovoGrupoReceita.value = '';
  dom.selectGrupoCatalogoReceita.value = '';
  renderizarGruposReceitaEmElaboracao();
  renderizarItensReceitaEmElaboracao();
  dom.receitaItemGrupo.focus();
  showToast(grupoDuplicado
    ? `Aviso: já existe um grupo "${nome}" nesta receita. Um segundo grupo foi criado.`
    : `Grupo "${nome}" criado. Os ingredientes avulsos foram mantidos.`);
}

export function usarGrupoCatalogoNaReceita() {
  const modelo = cachedRecipeGroups.find(grupo => grupo.id === dom.selectGrupoCatalogoReceita.value);
  if (!modelo) {
    showToast('Escolha um grupo reutilizável.');
    dom.selectGrupoCatalogoReceita.focus();
    return;
  }
  if ((modelo.itens || []).some(item =>
    item.sourceType === 'receita' && criariaCicloReceita(editingReceitaId, item.receitaId)
  )) {
    showToast('Este grupo contém uma receita-base que criaria uma dependência circular.');
    return;
  }
  const nome = String(modelo.nome || '').trim();
  if (!nome || gruposReceitaEmElaboracao.length >= 30) {
    showToast(!nome ? 'O grupo cadastrado tem um nome inválido.' : 'Cada receita pode ter no máximo 30 grupos.');
    return;
  }
  const grupoDuplicado = gruposReceitaEmElaboracao.some(grupo =>
    normalizarTextoBusca(grupo.nome) === normalizarTextoBusca(nome)
  );
  const grupo = criarGrupoReceita(nome);
  gruposReceitaEmElaboracao.push(grupo);
  const itensCopiados = copiarItensGrupoModeloParaReceita(modelo, grupo.id);
  itensReceitaEmElaboracao.push(...itensCopiados);
  setGrupoReceitaSelecionadoId(grupo.id);
  atualizarModoOrganizacaoGrupoReceita('existing');
  dom.selectGrupoCatalogoReceita.value = '';
  renderizarItensReceitaEmElaboracao();
  showToast(grupoDuplicado
    ? `Aviso: grupo "${nome}" duplicado nesta receita; ${itensCopiados.length} materiais copiados.`
    : `Grupo "${nome}" aplicado com ${itensCopiados.length} ${itensCopiados.length === 1 ? 'material' : 'materiais'}.`);
}

export function atualizarNomeGrupoReceita(grupoId, nomeOriginal) {
  const grupo = gruposReceitaEmElaboracao.find(item => item.id === grupoId);
  const nome = nomeOriginal.trim();
  if (!grupo) return;
  if (!nome || nome.length > 60) {
    showToast('O nome do grupo deve ter entre 1 e 60 caracteres.');
    renderizarGruposReceitaEmElaboracao();
    return;
  }
  const duplicado = gruposReceitaEmElaboracao.some(item =>
    item.id !== grupoId && normalizarTextoBusca(item.nome) === normalizarTextoBusca(nome)
  );
  grupo.nome = nome;
  renderizarGruposReceitaEmElaboracao();
  renderizarItensReceitaEmElaboracao();
  if (duplicado) showToast(`Aviso: há mais de um grupo com o nome "${nome}" nesta receita.`);
}

export function removerGrupoReceita(grupoId) {
  const grupo = gruposReceitaEmElaboracao.find(item => item.id === grupoId);
  if (!grupo) return;
  if (itensReceitaEmElaboracao.some(item => item.grupoId === grupoId)) {
    showToast('Mova os ingredientes deste grupo para outro grupo antes de removê-lo.');
    return;
  }
  setGruposReceitaEmElaboracao(gruposReceitaEmElaboracao.filter(item => item.id !== grupoId));
  if (grupoReceitaSelecionadoId === grupoId) setGrupoReceitaSelecionadoId('');
  renderizarGruposReceitaEmElaboracao();
}

export function selecionarGrupoReceita(grupoId) {
  const grupo = gruposReceitaEmElaboracao.find(item => item.id === grupoId);
  if (!grupo) return;
  setGrupoReceitaSelecionadoId(grupo.id);
  atualizarModoOrganizacaoGrupoReceita('existing');
  renderizarGruposReceitaEmElaboracao();
  dom.receitaItemGrupo.focus();
  showToast(`Os próximos ingredientes serão adicionados ao grupo "${grupo.nome}".`);
}

export function copiarItensGrupoModeloParaReceita(modelo, grupoId) {
  return (Array.isArray(modelo.itens) ? modelo.itens : []).map(item => {
    const itemCopiado = { ...item, grupoId };
    if (item.sourceType === 'receita' && item.receitaId) {
      const receitaBase = cachedReceitas.find(receita => receita.id === item.receitaId);
      if (receitaBase) {
        itemCopiado.custoUnitarioBase = obterCustoPorUnidadeReceita(receitaBase);
        itemCopiado.unidadeBase = normalizarUnidadeRendimento(receitaBase.rendimentoUnidade);
        itemCopiado.insumoNome = receitaBase.nome;
      }
    } else {
      const insumo = cachedInsumos.find(material =>
        material.id === (item.ofertaInsumoId || item.insumoId) || material.id === item.insumoId
      );
      if (insumo) {
        itemCopiado.custoUnitarioBase = Number(insumo.custoUnitario) || calcularCustoUnitario(insumo.preco, insumo.quantidade);
        itemCopiado.unidadeBase = insumo.unidade || itemCopiado.unidadeBase;
        itemCopiado.conversoes = insumo.conversoes || itemCopiado.conversoes || {};
        itemCopiado.insumoNome = insumo.nome;
        itemCopiado.categoria = insumo.categoria || itemCopiado.categoria;
      }
    }
    itemCopiado.custoItem = calcularCustoItemReceita(
      itemCopiado.custoUnitarioBase,
      itemCopiado.unidadeBase,
      itemCopiado.quantidadeUsada,
      itemCopiado.unidadeUsada,
      itemCopiado.conversoes || {}
    );
    return itemCopiado;
  });
}

export function moverItemParaGrupo(index, grupoId) {
  const item = itensReceitaEmElaboracao[index];
  if (!item || (grupoId && !gruposReceitaEmElaboracao.some(grupo => grupo.id === grupoId))) return;
  item.grupoId = grupoId || null;
  setGrupoReceitaSelecionadoId(grupoId || '');
  atualizarModoOrganizacaoGrupoReceita(grupoId ? 'existing' : 'standalone');
  renderizarItensReceitaEmElaboracao();
}

export function renderizarGruposReceitaEmElaboracao() {
  atualizarModoOrganizacaoGrupoReceita();
  if (!gruposReceitaEmElaboracao.some(grupo => grupo.id === grupoReceitaSelecionadoId)) {
    setGrupoReceitaSelecionadoId('');
  }

  dom.receitaItemGrupo.innerHTML = [
    '<option value="">Avulso (sem grupo)</option>',
    ...gruposReceitaEmElaboracao.map(grupo =>
      `<option value="${escapeHtml(grupo.id)}">${escapeHtml(grupo.nome)}</option>`
    )
  ].join('');
  dom.receitaItemGrupo.value = grupoReceitaSelecionadoId;
  const gruposDisponiveis = cachedRecipeGroups;
  dom.selectGrupoCatalogoReceita.innerHTML = [
    '<option value="">Selecione um grupo cadastrado...</option>',
    ...gruposDisponiveis.map(grupo => `<option value="${escapeHtml(grupo.id)}">${escapeHtml(grupo.nome)}${grupo.itens?.length ? ` · ${grupo.itens.length} materiais` : ' · sem materiais'}</option>`)
  ].join('');
  dom.btnUsarGrupoReceita.disabled = gruposDisponiveis.length === 0 || gruposReceitaEmElaboracao.length >= 30;
  dom.btnAddGrupoReceita.disabled = gruposReceitaEmElaboracao.length >= 30;
  dom.recipeGroupsList.innerHTML = gruposReceitaEmElaboracao.map(grupo => {
    const itens = itensReceitaEmElaboracao.filter(item => item.grupoId === grupo.id);
    const custo = itens.reduce((total, item) => total + (Number(item.custoItem) || 0), 0);
    const destinoAtivo = grupo.id === grupoReceitaSelecionadoId;
    return `
      <div class="recipe-group-row">
        <input type="text" maxlength="60" value="${escapeHtml(grupo.nome)}" aria-label="Nome do grupo ${escapeHtml(grupo.nome)}" data-recipe-group-name="${escapeHtml(grupo.id)}" />
        <span class="recipe-group-summary">${itens.length} ${itens.length === 1 ? 'item' : 'itens'} · ${formatarMoeda(custo, 2)}</span>
        <div class="recipe-group-actions">
          <button type="button" class="btn-secondary" data-select-recipe-group="${escapeHtml(grupo.id)}"${destinoAtivo ? ' disabled' : ''}>${destinoAtivo ? 'Destino selecionado' : 'Usar para próximos itens'}</button>
        </div>
        <button type="button" class="btn-remove-draft-item" data-remove-recipe-group="${escapeHtml(grupo.id)}" aria-label="Remover grupo ${escapeHtml(grupo.nome)}" title="Remover grupo">✕</button>
      </div>
    `;
  }).join('');
}

export function adicionarItemReceitaEmElaboracao() {
  const insumoId = dom.receitaItemInsumo.value;
  const qtd = parseFloat(dom.receitaItemQuantidade.value);
  const unidadeUsada = dom.receitaItemUnidade.value;

  if (!insumoId) {
    showToast('Escolha um insumo ou embalagem para adicionar.');
    return;
  }
  if (isNaN(qtd) || qtd <= 0) {
    showToast('Informe uma quantidade válida maior que zero.');
    dom.receitaItemQuantidade.focus();
    return;
  }

  const selectedOption = dom.receitaItemInsumo.selectedOptions[0];
  const grupoId = dom.receitaItemGrupo.value;
  if (grupoId && !gruposReceitaEmElaboracao.some(grupo => grupo.id === grupoId)) {
    showToast('Selecione um grupo válido para o ingrediente.');
    dom.receitaItemGrupo.focus();
    return;
  }
  const sourceType = selectedOption?.getAttribute('data-source-type') || 'insumo';
  const receitaId = selectedOption?.getAttribute('data-recipe-id') || null;
  if (sourceType === 'receita' && criariaCicloReceita(editingReceitaId, receitaId)) {
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

  itensReceitaEmElaboracao.push({
    insumoId: sourceType === 'insumo' ? insumoId : null,
    ofertaInsumoId: sourceType === 'insumo' ? ofertaInsumoId : null,
    sourceType,
    ...(receitaId ? { receitaId } : {}),
    grupoId: grupoId || null,
    insumoNome,
    categoria,
    quantidadeUsada: qtd,
    unidadeUsada,
    custoUnitarioBase,
    unidadeBase,
    conversoes,
    custoItem
  });

  dom.receitaItemQuantidade.value = '';
  dom.receitaItemCostPreview.textContent = 'R$ 0,00';

  renderizarItensReceitaEmElaboracao();
  showToast(`Item "${insumoNome}" incluído na receita!`);
}

export function removerItemReceitaEmElaboracao(index) {
  itensReceitaEmElaboracao.splice(index, 1);
  renderizarItensReceitaEmElaboracao();
}

export function renderizarItensReceitaEmElaboracao() {
  renderizarGruposReceitaEmElaboracao();
  if (itensReceitaEmElaboracao.length === 0) {
    dom.tbodyDraftReceitaItens.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 12px;">
          Nenhum ingrediente ou embalagem adicionado ainda.
        </td>
      </tr>
    `;
  } else {
    dom.tbodyDraftReceitaItens.innerHTML = itensReceitaEmElaboracao.map((item, idx) => {
      const group = gruposReceitaEmElaboracao.find(grupo => grupo.id === item.grupoId);
      const badge = item.sourceType === 'receita'
        ? '<span class="badge-category badge-cat-outro">🍞 Receita-base</span>'
        : item.categoria === 'embalagem'
        ? '<span class="badge-category badge-cat-embalagem">🛍️ Emb.</span>' 
        : '<span class="badge-category badge-cat-ingrediente">🌾 Ingr.</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(item.insumoNome)}</strong></td>
          <td>
            <select data-recipe-item-group="${idx}" aria-label="Grupo do ingrediente ${escapeHtml(item.insumoNome)}">
              <option value=""${group ? '' : ' selected'}>Avulso</option>
              ${gruposReceitaEmElaboracao.map(grupo =>
                `<option value="${escapeHtml(grupo.id)}"${grupo.id === group?.id ? ' selected' : ''}>${escapeHtml(grupo.nome)}</option>`
              ).join('')}
            </select>
          </td>
          <td>${badge}</td>
          <td>${item.quantidadeUsada} ${item.unidadeUsada}</td>
          <td><strong>${formatarMoeda(item.custoItem, 2)}</strong></td>
          <td>
            <button type="button" class="btn-remove-draft-item" data-remove-index="${idx}" title="Remover item">✕</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderizarListaComprasReceita();
  atualizarTotaisReceitaEmElaboracao();
}

export function renderizarListaComprasReceita() {
  if (itensReceitaEmElaboracao.length === 0) {
    dom.recipeShoppingList.innerHTML = '<p class="shopping-list-empty">Adicione ingredientes para calcular os pacotes necessários.</p>';
    return;
  }

  const insumosDisponiveis = cachedInsumos.length > 0 ? cachedInsumos : DEMO_SEED_INSUMOS;
  const receitasDisponiveis = cachedReceitas;
  dom.recipeShoppingList.innerHTML = gerarHtmlListaComprasReceita(
    itensReceitaEmElaboracao,
    receitasDisponiveis,
    insumosDisponiveis
  );
}

export function gerarHtmlListaComprasReceita(itens, receitas, insumos) {
  if (itens.length === 0) {
    return '<p class="shopping-list-empty">Adicione ingredientes para calcular os pacotes necessários.</p>';
  }

  try {
    const lista = calcularListaComprasReceita(
      itens.map(item => ({
        insumoId: item.insumoId,
        sourceType: item.sourceType,
        receitaId: item.receitaId,
        quantidadeUsada: item.quantidadeUsada,
        unidadeUsada: item.unidadeUsada,
        conversoes: item.conversoes
      })),
      receitas,
      insumos
    );
    return lista.map(item => `
      <article class="shopping-list-item">
        <span class="shopping-list-item-name">${escapeHtml(item.nome)}</span>
        <span class="shopping-list-item-quantity">Usado: ${Number(item.quantidadeNecessaria).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${escapeHtml(item.unidade)}</span>
        <span class="shopping-list-item-detail">
          Embalagem original: ${Number(item.quantidadeEmbalagem).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${escapeHtml(item.unidade)}
          • ${formatarMoeda(item.precoEmbalagem, 2)} cada
        </span>
        <span class="shopping-list-item-total">
          Comprar: ${item.pacotesNecessarios} ${item.pacotesNecessarios === 1 ? 'pacote' : 'pacotes'}
          • ${formatarMoeda(item.custoCompra, 2)}
          <span style="font-weight: 500; color: var(--text-secondary);">
            (custo proporcional usado: ${formatarMoeda(item.custoProporcional, 2)})
          </span>
        </span>
      </article>
    `).join('');
  } catch (error) {
    console.error('Não foi possível calcular a lista de compras da receita:', error);
    return `<p class="shopping-list-error">${escapeHtml(error.message || 'Não foi possível calcular a lista. Confira os insumos e suas unidades.')}</p>`;
  }
}

export function atualizarTotaisReceitaEmElaboracao() {
  const rendimento = parseFloat(dom.inputReceitaRendimento.value) || 1;
  const unRendimento = dom.inputReceitaRendimentoUn.value || 'pães';

  const totais = calcularTotaisReceita(
    itensReceitaEmElaboracao,
    rendimento,
    obterCustosIndiretosDoFormulario()
  );

  dom.bannerCustoIngredientes.textContent = formatarMoeda(totais.custoIngredientes, 2);
  dom.bannerCustoEmbalagens.textContent = formatarMoeda(totais.custoEmbalagens, 2);
  dom.bannerCustoEnergia.textContent = formatarMoeda(totais.custoEnergia, 2);
  dom.bannerCustoMaoDeObra.textContent = formatarMoeda(totais.custoMaoDeObra, 2);
  dom.bannerCustoAgua.textContent = formatarMoeda(totais.custoAgua, 2);
  dom.bannerUnidadesVendaveis.textContent = totais.unidadesVendaveis;
  dom.bannerCustoTotal.textContent = formatarMoeda(totais.custoTotal, 2);
  dom.bannerCustoUnitario.textContent = `${formatarMoeda(totais.custoUnitario, 2)} / ${unRendimento} vendável`;

  atualizarCalculadoraLucroReceita(totais.custoUnitario, totais.unidadesVendaveis);
}

export function atualizarCalculadoraLucroReceita(custoUnitario, rendimento = 1) {
  const margem = parseFloat(dom.inputMargemLucro.value) || 100;
  const precoPraticadoInput = parseFloat(dom.inputPrecoPraticado.value);

  dom.badgeProfitPreview.textContent = `Margem: ${margem}%`;

  const calculo = calcularLucroEPrecificacao(custoUnitario, margem, precoPraticadoInput);

  dom.textPrecoSugerido.textContent = formatarMoeda(calculo.precoSugerido, 2);
  dom.recipePriceWarning.textContent = calculo.precoAbaixoDoMinimo
    ? `Atenção: o preço praticado está abaixo do mínimo recomendado de ${formatarMoeda(calculo.precoMinimo, 2)} para a margem de ${margem}%.`
    : '';
  dom.recipePriceWarning.classList.toggle('hidden', !calculo.precoAbaixoDoMinimo);

  if (!dom.inputPrecoPraticado.value || parseFloat(dom.inputPrecoPraticado.value) <= 0) {
    dom.inputPrecoPraticado.value = calculo.precoSugerido.toFixed(2);
  }

  const precoFinal = parseFloat(dom.inputPrecoPraticado.value) || calculo.precoSugerido;
  const lucroUn = Math.round((precoFinal - custoUnitario) * 100) / 100;
  const lucroLote = Math.round((lucroUn * rendimento) * 100) / 100;

  dom.textLucroLiquidoUn.textContent = formatarMoeda(lucroUn, 2);
  dom.textLucroTotalLote.textContent = formatarMoeda(lucroLote, 2);
}

export function atualizarPreviewFotoReceita(dataUrl) {
  setFotoReceitaDataUrl(dataUrl || null);
  if (fotoReceitaDataUrl) {
    dom.previewFotoReceita.src = fotoReceitaDataUrl;
    dom.previewFotoReceita.classList.remove('hidden');
    dom.btnRemoverFotoReceita.classList.remove('hidden');
  } else {
    dom.previewFotoReceita.removeAttribute('src');
    dom.previewFotoReceita.classList.add('hidden');
    dom.btnRemoverFotoReceita.classList.add('hidden');
    dom.inputFotoReceita.value = '';
  }
}

export function compactarFotoReceita(file) {
  if (!file || !file.type.startsWith('image/')) {
    return Promise.reject(new Error('Selecione um arquivo de imagem válido.'));
  }

  if (file.size > 20 * 1024 * 1024) {
    return Promise.reject(new Error('A imagem original deve ter até 20 MB.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        let scale = Math.min(1, 1280 / Math.max(image.width, image.height));
        let width = Math.max(1, Math.round(image.width * scale));
        let height = Math.max(1, Math.round(image.height * scale));

        for (let attempt = 0; attempt < 20; attempt++) {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Não foi possível processar a imagem.'));
            return;
          }
          context.drawImage(image, 0, 0, width, height);
          const quality = Math.max(0.42, 0.84 - (attempt % 5) * 0.1);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          if (dataUrl.length <= 450 * 1024) {
            resolve(dataUrl);
            return;
          }
          if (attempt % 5 === 4) {
            width = Math.max(1, Math.round(width * 0.8));
            height = Math.max(1, Math.round(height * 0.8));
          }
        }
        reject(new Error('Não foi possível reduzir a foto para o limite de armazenamento.'));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function prepararNovaReceita() {
  setEditingReceitaId(null);
  setItensReceitaEmElaboracao([]);
  setGruposReceitaEmElaboracao([]);
  setGrupoReceitaSelecionadoId('');
  dom.formReceita.reset();
  dom.recipeCostDetails.open = false;
  dom.recipeTechDetails.open = false;
  dom.selectCategoriaReceita.value = 'paes';
  atualizarPreviewFotoReceita(null);
  dom.formReceitaTitle.textContent = '📖 Nova Receita com Custos e Lucro';
  dom.btnSubmitReceita.innerHTML = '<span>Salvar Receita no Firestore</span>';
  dom.btnCancelEditReceita.classList.add('hidden');
  dom.formReceita.classList.add('hidden');
  dom.toggleFormReceitaIcon.textContent = '➕';
  dom.toggleFormReceitaText.textContent = 'Criar Nova Receita';
  dom.btnToggleFormReceita.setAttribute('aria-expanded', 'false');
  renderizarGruposReceitaEmElaboracao();
  renderizarItensReceitaEmElaboracao();
}

export function abrirEdicaoReceita(id) {
  const receita = cachedReceitas.find(item => item.id === id);
  if (!receita) return;

  setEditingReceitaId(id);
  dom.inputReceitaNome.value = receita.nome || '';
  dom.selectCategoriaReceita.value = receita.categoria || 'paes';
  dom.inputReceitaRendimento.value = receita.rendimento || 1;
  dom.inputReceitaRendimentoUn.value = receita.rendimentoUnidade || 'pães';
  dom.inputReceitaDescricao.value = receita.descricao || '';
  dom.inputModoPreparo.value = receita.modoPreparo || '';
  dom.inputTempoPreparo.value = receita.tempoPreparoMin ?? '';
  dom.inputCustoEnergia.value = receita.custoEnergia ?? '';
  dom.inputValorHora.value = receita.valorHoraMaoDeObra ?? '';
  dom.inputCustoAgua.value = receita.custoAgua ?? '';
  dom.inputUnidadesPerdidas.value = receita.unidadesPerdidas ?? 0;
  dom.inputTempoForno.value = receita.tempoFornoMin ?? '';
  dom.inputTemperaturaForno.value = receita.temperaturaFornoC ?? '';
  atualizarPreviewFotoReceita(receita.fotoDataUrl);
  dom.inputMargemLucro.value = receita.margemLucroDesejada ?? 100;
  dom.inputPrecoPraticado.value = receita.precoVendaPraticado ?? '';
  dom.recipeCostDetails.open = Boolean(
    Number(receita.custoEnergia) || Number(receita.valorHoraMaoDeObra) ||
    Number(receita.custoAgua) || Number(receita.unidadesPerdidas)
  );
  dom.recipeTechDetails.open = Boolean(
    receita.descricao || receita.modoPreparo || receita.tempoPreparoMin != null ||
    receita.tempoFornoMin != null || receita.temperaturaFornoC != null || receita.fotoDataUrl
  );
  const gruposEItens = obterGruposEItensReceita(receita);
  setGruposReceitaEmElaboracao(gruposEItens.grupos);
  setItensReceitaEmElaboracao(gruposEItens.itens);
  setGrupoReceitaSelecionadoId('');
  dom.formReceitaTitle.textContent = '✏️ Editar Receita';
  dom.btnSubmitReceita.innerHTML = '<span>Salvar alterações</span>';
  dom.btnCancelEditReceita.classList.remove('hidden');
  dom.formReceita.classList.remove('hidden');
  dom.toggleFormReceitaIcon.textContent = '▲';
  dom.toggleFormReceitaText.textContent = 'Recolher Formulário';
  dom.btnToggleFormReceita.setAttribute('aria-expanded', 'true');
  atualizarSelectsInsumosParaReceitas();
  renderizarGruposReceitaEmElaboracao();
  renderizarItensReceitaEmElaboracao();
  dom.formReceita.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function duplicarReceita(id) {
  const receita = cachedReceitas.find(item => item.id === id);
  if (!receita) return;

  setEditingReceitaId(null);
  dom.inputReceitaNome.value = `${receita.nome} (cópia)`;
  dom.selectCategoriaReceita.value = receita.categoria || 'paes';
  dom.inputReceitaRendimento.value = receita.rendimento || 1;
  dom.inputReceitaRendimentoUn.value = receita.rendimentoUnidade || 'pães';
  dom.inputReceitaDescricao.value = receita.descricao || '';
  dom.inputModoPreparo.value = receita.modoPreparo || '';
  dom.inputTempoPreparo.value = receita.tempoPreparoMin ?? '';
  dom.inputCustoEnergia.value = receita.custoEnergia ?? '';
  dom.inputValorHora.value = receita.valorHoraMaoDeObra ?? '';
  dom.inputCustoAgua.value = receita.custoAgua ?? '';
  dom.inputUnidadesPerdidas.value = receita.unidadesPerdidas ?? 0;
  dom.inputTempoForno.value = receita.tempoFornoMin ?? '';
  dom.inputTemperaturaForno.value = receita.temperaturaFornoC ?? '';
  atualizarPreviewFotoReceita(receita.fotoDataUrl);
  dom.inputMargemLucro.value = receita.margemLucroDesejada ?? 100;
  dom.inputPrecoPraticado.value = '';
  dom.recipeCostDetails.open = Boolean(
    Number(receita.custoEnergia) || Number(receita.valorHoraMaoDeObra) ||
    Number(receita.custoAgua) || Number(receita.unidadesPerdidas)
  );
  dom.recipeTechDetails.open = Boolean(
    receita.descricao || receita.modoPreparo || receita.tempoPreparoMin != null ||
    receita.tempoFornoMin != null || receita.temperaturaFornoC != null || receita.fotoDataUrl
  );
  const gruposEItens = obterGruposEItensReceita(receita);
  setGruposReceitaEmElaboracao(gruposEItens.grupos.map(grupo => ({ ...grupo })));
  setItensReceitaEmElaboracao(gruposEItens.itens);
  setGrupoReceitaSelecionadoId('');
  dom.formReceitaTitle.textContent = `📖 Variação de ${receita.nome}`;
  dom.btnSubmitReceita.innerHTML = '<span>Salvar nova receita</span>';
  dom.btnCancelEditReceita.classList.remove('hidden');
  dom.formReceita.classList.remove('hidden');
  dom.toggleFormReceitaIcon.textContent = '▲';
  dom.toggleFormReceitaText.textContent = 'Recolher Formulário';
  dom.btnToggleFormReceita.setAttribute('aria-expanded', 'true');
  atualizarSelectsInsumosParaReceitas();
  renderizarGruposReceitaEmElaboracao();
  renderizarItensReceitaEmElaboracao();
  dom.formReceita.scrollIntoView({ behavior: 'smooth', block: 'start' });
  dom.inputReceitaNome.focus();
  dom.inputReceitaNome.select();
}

export async function handleFormReceitaSubmit(e) {
  e.preventDefault();

  const nome = dom.inputReceitaNome.value.trim();
  const categoria = dom.selectCategoriaReceita.value || 'paes';
  const rendimento = parseFloat(dom.inputReceitaRendimento.value);
  const rendimentoUnidade = dom.inputReceitaRendimentoUn.value.trim() || 'pães';
  const descricao = dom.inputReceitaDescricao.value.trim();
  const modoPreparo = dom.inputModoPreparo.value.trim();
  const optionalNumber = input => input.value === '' ? null : Number(input.value);
  const tempoPreparoMin = optionalNumber(dom.inputTempoPreparo);
  const tempoFornoMin = optionalNumber(dom.inputTempoForno);
  const temperaturaFornoC = optionalNumber(dom.inputTemperaturaForno);
  const margemLucroDesejada = parseFloat(dom.inputMargemLucro.value) || 100;
  const precoVendaPraticado = parseFloat(dom.inputPrecoPraticado.value);

  if (!nome || isNaN(rendimento) || rendimento <= 0) {
    showToast('Preencha o nome da receita e rendimento válido.');
    return;
  }

  if (itensReceitaEmElaboracao.length === 0) {
    showToast('Adicione pelo menos um ingrediente ou embalagem à receita.');
    dom.receitaItemInsumo.focus();
    return;
  }
  const custosIndiretos = obterCustosIndiretosDoFormulario();
  if (custosIndiretos.unidadesPerdidas >= rendimento) {
    showToast('As perdas devem ser menores que o rendimento da fornada.');
    dom.inputUnidadesPerdidas.focus();
    return;
  }

  const totais = calcularTotaisReceita(itensReceitaEmElaboracao, rendimento, custosIndiretos);
  const lucroCalc = calcularLucroEPrecificacao(totais.custoUnitario, margemLucroDesejada, precoVendaPraticado);
  const avisoPreco = lucroCalc.precoAbaixoDoMinimo
    ? ` Atenção: preço abaixo do mínimo de ${formatarMoeda(lucroCalc.precoMinimo, 2)}.`
    : '';

  const novaReceita = {
    nome,
    categoria,
    rendimento,
    rendimentoUnidade,
    descricao,
    modoPreparo,
    tempoPreparoMin,
    tempoFornoMin,
    temperaturaFornoC,
    fotoDataUrl: fotoReceitaDataUrl,
    itens: itensReceitaEmElaboracao,
    gruposIngredientes: gruposReceitaEmElaboracao.map(grupo => ({ ...grupo })),
    custoIngredientes: totais.custoIngredientes,
    custoEmbalagens: totais.custoEmbalagens,
    custoTotal: totais.custoTotal,
    custoUnitario: totais.custoUnitario,
    custoEnergia: totais.custoEnergia,
    custoMaoDeObra: totais.custoMaoDeObra,
    custoAgua: totais.custoAgua,
    custoIndireto: totais.custoIndireto,
    valorHoraMaoDeObra: custosIndiretos.valorHoraMaoDeObra,
    unidadesPerdidas: custosIndiretos.unidadesPerdidas,
    unidadesVendaveis: totais.unidadesVendaveis,
    margemLucroDesejada,
    precoVendaSugerido: lucroCalc.precoSugerido,
    precoVendaPraticado: lucroCalc.precoFinal,
    lucroPorUnidade: lucroCalc.lucroPorUnidade
  };
  const receitaExistente = editingReceitaId
    ? cachedReceitas.find(item => item.id === editingReceitaId)
    : null;

  try {
    dom.btnSubmitReceita.disabled = true;
    dom.btnSubmitReceita.innerHTML = '<span class="loading-spinner"></span> Salvando Receita...';

    if (!firestoreDb && !isTestStockMode) initFirebase();

    if (editingReceitaId) {
      const receitaIdAtualizada = editingReceitaId;
      const atualizacoes = { ...novaReceita, updatedAt: serverTimestamp() };
      if (firestoreDb && !isTestStockMode && !receitaIdAtualizada.startsWith('local-') && !receitaIdAtualizada.startsWith('demo-')) {
        await updateDoc(doc(firestoreDb, 'receitas', receitaIdAtualizada), atualizacoes);
      }
      Object.assign(receitaExistente, novaReceita);
      if (!firestoreDb || isTestStockMode || receitaIdAtualizada.startsWith('local-') || receitaIdAtualizada.startsWith('demo-')) {
        salvarDadosReceitasLocais();
      }
      renderizarReceitas();
      atualizarSelectProdutos();
      const falhas = await atualizarReceitasDependentes(receitaIdAtualizada);
      showToast(falhas
        ? `Receita atualizada; houve falha ao recalcular ${falhas} dependência(s).`
        : `Receita "${nome}" atualizada com sucesso!${avisoPreco}`);
    } else {
      const receitaComMetadados = {
        ...novaReceita,
        createdBy: currentUser?.uid || 'anon',
        createdByName: currentUser?.displayName || 'Padeiro',
        createdAt: serverTimestamp(),
        updatedAt: isTestStockMode ? new Date().toISOString() : serverTimestamp()
      };
      if (firestoreDb && !isTestStockMode) {
        await addDoc(collection(firestoreDb, 'receitas'), receitaComMetadados);
        showToast(`Receita "${nome}" gravada no Firestore com sucesso!${avisoPreco}`);
      } else {
        cachedReceitas.unshift({
          id: `${isTestStockMode ? 'demo-rec-test-' : 'local-rec-'}${Date.now()}`,
          ...receitaComMetadados,
          createdAt: new Date().toISOString()
        });
        salvarDadosReceitasLocais();
        renderizarReceitas();
        atualizarSelectProdutos();
        showToast(`Receita "${nome}" salva localmente.${avisoPreco}`);
      }
    }

    prepararNovaReceita();
  } catch (err) {
    console.error('Erro ao salvar receita:', err);
    showToast('Erro ao salvar receita: ' + (err.message || 'Tente novamente'));
  } finally {
    dom.btnSubmitReceita.disabled = false;
    dom.btnSubmitReceita.innerHTML = editingReceitaId
      ? '<span>Salvar alterações</span>'
      : '<span>Salvar Receita no Firestore</span>';
  }
}

export function renderizarReceitas() {
  const querySearch = dom.inputSearchReceitas.value.trim();

  const receitasDisponiveis = cachedReceitas;
  const contagensCategoria = receitasDisponiveis.reduce((contagens, receita) => {
    const categoria = receita.categoria || 'paes';
    contagens[categoria] = (contagens[categoria] || 0) + 1;
    return contagens;
  }, { todos: receitasDisponiveis.length });
  dom.countRecipeTodos.textContent = contagensCategoria.todos;
  dom.countRecipePaes.textContent = contagensCategoria.paes || 0;
  dom.countRecipeBolos.textContent = contagensCategoria.bolos || 0;
  dom.countRecipeSalgados.textContent = contagensCategoria.salgados || 0;
  dom.countRecipeOutros.textContent = contagensCategoria.outros || 0;

  let filtradas = receitasDisponiveis;
  if (activeRecipeCategory !== 'todos') {
    filtradas = filtradas.filter(receita => (receita.categoria || 'paes') === activeRecipeCategory);
  }
  if (querySearch) {
    filtradas = filtradas.filter(receita =>
      correspondeBusca(querySearch, [
        receita.nome,
        receita.descricao,
        receita.modoPreparo,
        receita.categoria,
        ...(receita.gruposIngredientes || []).map(grupo => grupo.nome),
        ...(receita.itens || []).map(item => item.insumoNome)
      ])
    );
  }

  dom.statTotalReceitas.textContent = receitasDisponiveis.length;
  dom.receitasCounter.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'receita' : 'receitas'}`;
  dom.tabBadgeReceitas.textContent = receitasDisponiveis.length;

  if (receitasDisponiveis.length > 0) {
    const totalCustoUnitario = receitasDisponiveis.reduce((acc, r) => acc + (r.custoUnitario || 0), 0);
    const media = totalCustoUnitario / receitasDisponiveis.length;
    dom.statAvgReceitaCost.textContent = formatarMoeda(media, 2);
  } else {
    dom.statAvgReceitaCost.textContent = 'R$ 0,00';
  }

  if (filtradas.length === 0) {
    dom.receitasContainer.innerHTML = '';
    const possuiFiltros = Boolean(querySearch) || activeRecipeCategory !== 'todos';
    dom.emptyTitleReceitas.textContent = possuiFiltros ? 'Nenhuma receita encontrada' : 'Nenhuma receita cadastrada';
    dom.emptyDescReceitas.textContent = possuiFiltros
      ? 'Tente outro termo ou escolha outra categoria para ver suas receitas.'
      : 'Crie receitas personalizadas combinando seus ingredientes e sacolas/formas para calcular custos e margem de lucro.';
    dom.btnEmptyAddReceita.classList.toggle('hidden', possuiFiltros);
    dom.btnEmptyClearFiltersReceitas.classList.toggle('hidden', !possuiFiltros);
    dom.emptyStateReceitas.classList.remove('hidden');
    return;
  }

  dom.emptyStateReceitas.classList.add('hidden');

  const html = filtradas.map(rec => {
    const rendimentoTexto = `Rende ${rec.rendimento} ${rec.rendimentoUnidade || 'pães'}`;
    const categoriaNome = ({ paes: 'Pães', bolos: 'Bolos', salgados: 'Salgados', outros: 'Outros' })[rec.categoria || 'paes'] || 'Pães';
    const gruposEItens = obterGruposEItensReceita(rec);
    const gruposIngredientes = gruposEItens.grupos;
    const itens = gruposEItens.itens;
    const countIngredientes = itens.filter(i => (i.categoria || 'ingrediente') === 'ingrediente').length;
    const countEmbalagens = itens.filter(i => i.categoria === 'embalagem').length;

    const lucroUn = (rec.precoVendaPraticado || 0) - (rec.custoUnitario || 0);
    const unidadesVendaveis = rec.unidadesVendaveis ?? Math.max(0, rec.rendimento - (rec.unidadesPerdidas || 0));
    const custoEnergia = Number(rec.custoEnergia) || 0;
    const custoMaoDeObra = Number(rec.custoMaoDeObra) || 0;
    const custoAgua = Number(rec.custoAgua) || 0;
    const margemDesejada = Number(rec.margemLucroDesejada) || 100;
    const precoMinimo = Number(rec.precoVendaSugerido) || calcularLucroEPrecificacao(rec.custoUnitario, margemDesejada).precoSugerido;
    const precoAbaixoDoMinimo = Number(rec.precoVendaPraticado) > 0 && Number(rec.precoVendaPraticado) < precoMinimo;
    const margemPercentual = rec.custoUnitario > 0
      ? Math.round((lucroUn / rec.custoUnitario) * 100)
      : 0;
    const technicalFacts = [];
    if (rec.tempoPreparoMin !== null && rec.tempoPreparoMin !== undefined) technicalFacts.push(`Preparo: ${rec.tempoPreparoMin} min`);
    if (rec.tempoFornoMin !== null && rec.tempoFornoMin !== undefined) technicalFacts.push(`Forno: ${rec.tempoFornoMin} min`);
    if (rec.temperaturaFornoC !== null && rec.temperaturaFornoC !== undefined) technicalFacts.push(`${rec.temperaturaFornoC} °C`);
    const technicalSheet = technicalFacts.length || rec.modoPreparo
      ? `<div class="recipe-technical-sheet">
          ${technicalFacts.length ? `<div class="recipe-technical-facts">${technicalFacts.map(escapeHtml).join('<span aria-hidden="true">·</span>')}</div>` : ''}
          ${rec.modoPreparo ? `<div class="recipe-preparation"><strong>Modo de preparo:</strong><br>${escapeHtml(rec.modoPreparo)}</div>` : ''}
        </div>`
      : '';
    const recipePhoto = rec.fotoDataUrl
      ? `<img class="recipe-card-photo" src="${escapeHtml(rec.fotoDataUrl)}" alt="${escapeHtml(rec.nome)}" loading="lazy">`
      : '';
    const insumosParaListaCompras = cachedInsumos.length > 0
      ? cachedInsumos
      : [];
    const listaComprasHtml = itens.length > 0
      ? gerarHtmlListaComprasReceita(itens, receitasDisponiveis, insumosParaListaCompras)
      : '<p class="shopping-list-empty">Esta receita ainda não tem itens para listar.</p>';
    const ingredientesRecolhidos = listasReceitaRecolhidas.has(`ingredientes:${rec.id}`);
    const comprasRecolhidas = listasReceitaRecolhidas.has(`compras:${rec.id}`);

    const renderizarLinhasItens = itensDoGrupo => itensDoGrupo.map(it => {
      const isRecipe = it.sourceType === 'receita' || Boolean(it.receitaId);
      const isEmb = it.categoria === 'embalagem';
      const iconTag = isRecipe ? '🍞' : isEmb ? '🛍️' : '🌾';
      const detail = isRecipe
        ? `Receita-base • ${it.quantidadeUsada} ${it.unidadeUsada}`
        : `${it.quantidadeUsada} ${it.unidadeUsada}`;
      return `
        <div class="receita-item-row">
          <div class="receita-item-info">
            <span>${iconTag}</span>
            <span><strong>${escapeHtml(it.insumoNome)}</strong> (${detail})</span>
          </div>
          <span class="receita-item-cost">${formatarMoeda(it.custoItem, 2)}</span>
        </div>
      `;
    }).join('');

    const itensHtml = gruposIngredientes.map(grupo => {
      const itensGrupo = itens.filter(item => item.grupoId === grupo.id);
      if (itensGrupo.length === 0) return '';
      const custoGrupo = itensGrupo.reduce((total, item) => total + (Number(item.custoItem) || 0), 0);
      return `
        <section class="recipe-ingredient-group">
          <div class="recipe-group-heading">
            <span>${escapeHtml(grupo.nome)} · ${itensGrupo.length} ${itensGrupo.length === 1 ? 'item' : 'itens'}</span>
            <span>${formatarMoeda(custoGrupo, 2)}</span>
          </div>
          ${renderizarLinhasItens(itensGrupo)}
        </section>
      `;
    }).join('');
    const itensAvulsos = itens.filter(item => !gruposIngredientes.some(grupo => grupo.id === item.grupoId));
    const custoAvulsos = itensAvulsos.reduce((total, item) => total + (Number(item.custoItem) || 0), 0);
    const itensAvulsosHtml = itensAvulsos.length
      ? `<section class="recipe-ingredient-group">
          <div class="recipe-group-heading">
            <span>Ingredientes avulsos · ${itensAvulsos.length} ${itensAvulsos.length === 1 ? 'item' : 'itens'}</span>
            <span>${formatarMoeda(custoAvulsos, 2)}</span>
          </div>
          ${renderizarLinhasItens(itensAvulsos)}
        </section>`
      : '';
    const itensHtmlCompleto = itensAvulsosHtml + itensHtml;

    return `
      <article class="receita-card" data-receita-id="${rec.id}">
        <div class="receita-header">
          <div class="receita-title-wrap">
            <span class="receita-rendimento-badge">🥖 ${rendimentoTexto}</span>
            <span class="receita-category-badge">${categoriaNome}</span>
            <h3 class="receita-nome">${escapeHtml(rec.nome)}</h3>
            ${rec.descricao ? `<span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(rec.descricao)}</span>` : ''}
          </div>
          <div class="item-card-actions">
            <button
              type="button"
              class="btn-edit-item"
              data-duplicate-receita-id="${rec.id}"
              aria-label="Duplicar receita ${escapeHtml(rec.nome)}"
              title="Duplicar para criar variação"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="8" y="8" width="13" height="13" rx="2"></rect>
                <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path>
              </svg>
            </button>
            <button
              type="button"
              class="btn-edit-item"
              data-edit-receita-id="${rec.id}"
              aria-label="Editar receita ${escapeHtml(rec.nome)}"
              title="Editar receita"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>
              </svg>
            </button>
            <button
              type="button"
              class="btn-delete-item"
              data-delete-receita-id="${rec.id}"
              data-delete-receita-name="${escapeHtml(rec.nome)}"
              title="Excluir Receita"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        ${recipePhoto}
        ${technicalSheet}
        <div class="receita-metrics-grid">
          <div class="receita-metric-box">
            <span class="receita-metric-lbl">Custo / Un.</span>
            <span class="receita-metric-val">${formatarMoeda(rec.custoUnitario, 2)}</span>
          </div>
          <div class="receita-metric-box">
            <span class="receita-metric-lbl">Preço Venda</span>
            <span class="receita-metric-val">${formatarMoeda(rec.precoVendaPraticado, 2)}</span>
          </div>
          <div class="receita-metric-box">
            <span class="receita-metric-lbl">Lucro Unitário</span>
            <span class="receita-metric-val profit">+${formatarMoeda(lucroUn, 2)} <small style="font-size:10px;">(${margemPercentual}%)</small></span>
          </div>
        </div>
        ${precoAbaixoDoMinimo
          ? `<div class="price-warning price-warning-card" role="status">⚠ Preço praticado de ${formatarMoeda(rec.precoVendaPraticado, 2)} abaixo do mínimo de ${formatarMoeda(precoMinimo, 2)} para a margem de ${margemDesejada}%.</div>`
          : ''}
        <div class="cost-split-row">
          <div class="cost-split-tag">
            <span>🌾 ${countIngredientes} Ingr:</span>
            <strong>${formatarMoeda(rec.custoIngredientes || 0, 2)}</strong>
          </div>
          <div class="cost-split-tag">
            <span>🛍️ ${countEmbalagens} Emb:</span>
            <strong>${formatarMoeda(rec.custoEmbalagens || 0, 2)}</strong>
          </div>
          <div class="cost-split-tag">
            <span>Total:</span>
            <strong style="color: var(--wheat-deep);">${formatarMoeda(rec.custoTotal, 2)}</strong>
          </div>
        </div>
        <div class="cost-split-row" style="flex-wrap: wrap; gap: 8px;">
          <div class="cost-split-tag"><span>🔥 Energia:</span><strong>${formatarMoeda(custoEnergia, 2)}</strong></div>
          <div class="cost-split-tag"><span>👩‍🍳 Mão de obra:</span><strong>${formatarMoeda(custoMaoDeObra, 2)}</strong></div>
          <div class="cost-split-tag"><span>💧 Água:</span><strong>${formatarMoeda(custoAgua, 2)}</strong></div>
          <div class="cost-split-tag"><span>Vendáveis:</span><strong>${unidadesVendaveis} ${escapeHtml(rec.rendimentoUnidade || 'unidades')}</strong></div>
        </div>
        <div class="receita-items-preview">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">
              Itens da Receita (${itens.length}):
            </strong>
            <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px;">
              <button
                type="button"
                class="btn-secondary"
                data-recipe-list-toggle="ingredientes"
                data-recipe-id="${escapeHtml(rec.id)}"
                aria-controls="recipe-ingredients-${escapeHtml(rec.id)}"
                aria-expanded="${!ingredientesRecolhidos}"
                style="padding: 4px 8px; font-size: 11px; font-weight: 700;"
              >
                ${ingredientesRecolhidos ? '＋ Maximizar' : '− Minimizar'}
              </button>
              <button
                type="button"
                class="btn-secondary"
                data-add-item-rec-id="${rec.id}"
                data-add-item-rec-name="${escapeHtml(rec.nome)}"
                style="padding: 4px 8px; font-size: 11px; font-weight: 700;"
              >
                ➕ Adicionar Novo Item
              </button>
            </div>
          </div>
          <div
            id="recipe-ingredients-${escapeHtml(rec.id)}"
            class="${ingredientesRecolhidos ? 'hidden' : ''}"
            data-recipe-list-content="ingredientes"
            data-recipe-id="${escapeHtml(rec.id)}"
            ${ingredientesRecolhidos ? 'hidden' : ''}
          >${itensHtmlCompleto}</div>
        </div>
        <section class="shopping-list-panel recipe-card-shopping-list" aria-label="Lista de compras de ${escapeHtml(rec.nome)}">
          <div class="shopping-list-heading" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div style="min-width: 0;">
              <h3>🛒 Lista de compras</h3>
              <p>Pacotes para uma receita, com preços do cadastro. Não desconta o estoque atual.</p>
            </div>
            <button
              type="button"
              class="btn-secondary"
              data-recipe-list-toggle="compras"
              data-recipe-id="${escapeHtml(rec.id)}"
              aria-controls="recipe-shopping-${escapeHtml(rec.id)}"
              aria-expanded="${!comprasRecolhidas}"
              style="padding: 4px 8px; font-size: 11px; font-weight: 700; flex-shrink: 0;"
            >
              ${comprasRecolhidas ? '＋ Maximizar' : '− Minimizar'}
            </button>
          </div>
          <div
            id="recipe-shopping-${escapeHtml(rec.id)}"
            class="shopping-list-items${comprasRecolhidas ? ' hidden' : ''}"
            data-recipe-list-content="compras"
            data-recipe-id="${escapeHtml(rec.id)}"
            ${comprasRecolhidas ? 'hidden' : ''}
          >
            ${listaComprasHtml}
          </div>
        </section>
        <div class="production-action-row">
          <button type="button" class="btn-primary" data-produce-receita-id="${escapeHtml(rec.id)}">
            🍞 Registrar produção e baixar insumos
          </button>
        </div>
        <div class="card-profit-simulator">
          <div class="profit-sim-header">
            <span class="profit-sim-title">⚡ Calculadora Rápida de Precificação</span>
            <span class="profit-sim-badge">Lucro Fornada: ${formatarMoeda(lucroUn * unidadesVendaveis, 2)}</span>
          </div>
          <div class="profit-sim-controls">
            <div class="profit-input-wrap">
              <span style="font-size: 12px; font-weight: 700; color: #065F46; margin-right: 4px;">R$</span>
              <input
                type="number"
                step="0.50"
                min="0.10"
                value="${(rec.precoVendaPraticado || 0).toFixed(2)}"
                data-input-price-id="${rec.id}"
                aria-label="Preço de venda praticado"
              />
            </div>
            <button
              type="button"
              class="btn-save-price"
              data-btn-save-price-id="${rec.id}"
            >
              💾 Salvar Preço
            </button>
          </div>
        </div>
        <div class="insumo-footer">
          <span>Criada por: <strong>${escapeHtml(rec.createdByName || 'Padeiro')}</strong></span>
          <span>${rec.createdAt ? (new Date(rec.createdAt?.toDate ? rec.createdAt.toDate() : rec.createdAt)).toLocaleDateString('pt-BR') : 'Hoje'}</span>
        </div>
      </article>
    `;
  }).join('');

  dom.receitasContainer.innerHTML = html;
}

export function salvarNovoPrecoReceita(receitaId, novoPreco) {
  const receita = cachedReceitas.find(r => r.id === receitaId);
  if (!receita) return;

  const precoValido = parseFloat(novoPreco);
  if (isNaN(precoValido) || precoValido <= 0) {
    showToast('Preço inválido.');
    return;
  }

  const lucroCalc = calcularLucroEPrecificacao(receita.custoUnitario, receita.margemLucroDesejada, precoValido);
  const aviso = lucroCalc.precoAbaixoDoMinimo
    ? `Preço salvo, mas abaixo do mínimo recomendado de ${formatarMoeda(lucroCalc.precoMinimo, 2)}.`
    : `Preço de "${receita.nome}" atualizado para ${formatarMoeda(precoValido, 2)}!`;

  try {
    if (firestoreDb && !isTestStockMode && !receitaId.startsWith('local-') && !receitaId.startsWith('demo-')) {
      await updateDoc(doc(firestoreDb, 'receitas', receitaId), {
        precoVendaPraticado: precoValido,
        lucroPorUnidade: lucroCalc.lucroPorUnidade,
        updatedAt: serverTimestamp()
      });
      showToast(aviso);
    } else {
      receita.precoVendaPraticado = precoValido;
      receita.lucroPorUnidade = lucroCalc.lucroPorUnidade;
      salvarDadosReceitasLocais();
      renderizarReceitas();
      showToast(aviso);
    }
  } catch (err) {
    console.error('Erro ao atualizar preço:', err);
    showToast('Erro ao salvar preço: ' + err.message);
  }
}

export function abrirModalExcluirReceita(id, nome) {
  setPendingDeleteReceitaId(id);
  dom.modalDeleteReceitaName.textContent = `"${nome}"`;
  dom.deleteReceitaModal.classList.add('active');
}

export function fecharModalExcluirReceita() {
  setPendingDeleteReceitaId(null);
  dom.deleteReceitaModal.classList.remove('active');
}

export async function confirmarExclusaoReceita() {
  if (!pendingDeleteReceitaId) return;
  const idToDelete = pendingDeleteReceitaId;

  try {
    dom.btnConfirmDeleteReceita.disabled = true;
    dom.btnConfirmDeleteReceita.innerHTML = '<span class="loading-spinner"></span> Excluindo...';

    if (firestoreDb && !isTestStockMode && !idToDelete.startsWith('local-') && !idToDelete.startsWith('demo-')) {
      await deleteDoc(doc(firestoreDb, 'receitas', idToDelete));
      showToast('Receita excluída do Firestore!');
    } else {
      setCachedReceitas(cachedReceitas.filter(r => r.id !== idToDelete));
      salvarDadosReceitasLocais();
      renderizarReceitas();
      atualizarSelectProdutos();
      showToast('Receita removida!');
    }
    fecharModalExcluirReceita();
  } catch (err) {
    console.error('Erro ao excluir receita:', err);
    showToast('Erro ao excluir receita: ' + (err.message || 'Tente novamente'));
  } finally {
    dom.btnConfirmDeleteReceita.disabled = false;
    dom.btnConfirmDeleteReceita.innerHTML = 'Excluir Receita';
  }
}

export function atualizarSelectProdutos() {
  const selects = [dom.saleProduct, dom.orderProduct, dom.editSaleProduct];
  selects.forEach(select => {
    const selecionado = select.value;
    select.innerHTML = '<option value="">Selecione um produto...</option>' +
      cachedReceitas.map(receita => {
        const preco = Number(receita.precoVendaPraticado ?? receita.precoVendaSugerido ?? 0);
        return `<option value="${escapeHtml(receita.id)}" data-price="${Number.isFinite(preco) ? preco : 0}">${escapeHtml(receita.nome)}</option>`;
      }).join('');
    if (cachedReceitas.some(receita => receita.id === selecionado)) select.value = selecionado;
  });
  if (dom.saleProduct.value) atualizarPrecoVendaProduto();
}

export function atualizarSelectClientes() {
  const selects = [
    [dom.saleCustomer, '<option value="">Cliente avulso</option>'],
    [dom.editSaleCustomer, '<option value="">Cliente avulso</option>'],
    [dom.orderCustomer, '<option value="">Selecione um cliente...</option>'],
    [dom.productionCustomer, '<option value="">Venda avulsa / teste</option>'],
    [dom.editProductionCustomer, '<option value="">Venda avulsa / teste</option>']
  ];
  selects.forEach(([select, placeholder]) => {
    const selecionado = select.value;
    select.innerHTML = placeholder + cachedClientes.map(cliente =>
      `<option value="${escapeHtml(cliente.id)}">${escapeHtml(cliente.nome)}</option>`
    ).join('');
    if (cachedClientes.some(cliente => cliente.id === selecionado)) select.value = selecionado;
  });
}

export function atualizarPrecoVendaProduto() {
  const selectedOption = dom.saleProduct.selectedOptions[0];
  const preco = Number(selectedOption?.dataset.price || 0);
  dom.saleUnitPrice.value = preco.toFixed(2);
}

export function switchRecipePanel(panel) {
  setActiveRecipePanel(panel === 'groups' ? 'groups' : 'recipes');
  const showingGroups = activeRecipePanel === 'groups';
  dom.tabRecipeList.classList.toggle('active', !showingGroups);
  dom.tabRecipeList.setAttribute('aria-selected', String(!showingGroups));
  dom.tabRecipeGroups.classList.toggle('active', showingGroups);
  dom.tabRecipeGroups.setAttribute('aria-selected', String(showingGroups));
  dom.recipeListPanel.classList.toggle('hidden', showingGroups);
  dom.recipeGroupsPanel.classList.toggle('hidden', !showingGroups);
  if (showingGroups) {
    atualizarSelectsInsumosParaReceitas();
    renderizarGruposModeloReceita();
  }
}
