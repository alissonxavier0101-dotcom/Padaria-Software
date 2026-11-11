import { cachedReceitas, cachedRecipeGroups, cachedProducoes, cachedVendas, cachedPedidos, cachedClientes, cachedCashflow, cachedFixedExpenses, editingReceitaId, editingFornecedorId, pendingProductionRecipeId, pendingEditProductionId, pendingDeleteProductionId, pendingDeleteReceitaId, pendingAddItemReceitaId, pendingEditSaleId, activeGroupFilter, activeRecipeCategory, activeTab, itensReceitaEmElaboracao, gruposReceitaEmElaboracao, grupoReceitaSelecionadoId, itensGrupoModeloEmEdicao, editingRecipeGroupId, activeRecipePanel, fotoReceitaDataUrl, listasReceitaRecolhidas, currentUser, isTestStockMode, firestoreDb, DEMO_SEED_INSUMOS, setActiveRecipePanel, setActiveTab, setCachedProducoes, setCachedReceitas, setCachedRecipeGroups, setCachedVendas, setEditingReceitaId, setEditingRecipeGroupId, setFotoReceitaDataUrl, setGrupoReceitaSelecionadoId, setGruposReceitaEmElaboracao, setItensGrupoModeloEmEdicao, setItensReceitaEmElaboracao, setPendingAddItemReceitaId, setPendingDeleteProductionId, setPendingDeleteReceitaId, setPendingEditProductionId, setPendingEditSaleId, setPendingProductionRecipeId, cachedInsumos, TEST_RECIPE_GROUPS_KEY, LOCAL_DEMO_RECIPE_GROUPS_KEY, TEST_ITEMS_KEY, LOCAL_DEMO_ITEMS_KEY, TEST_PRODUCTIONS_KEY, LOCAL_DEMO_PRODUCOES_KEY, TEST_SALES_KEY, LOCAL_DEMO_SALES_KEY, TEST_ORDERS_KEY, LOCAL_DEMO_ORDERS_KEY, TEST_CUSTOMERS_KEY, LOCAL_DEMO_CUSTOMERS_KEY, TEST_CASHFLOW_KEY, LOCAL_DEMO_CASHFLOW_KEY, TEST_FIXED_EXPENSES_KEY, LOCAL_DEMO_FIXED_EXPENSES_KEY, setCachedInsumos } from './state.js';
import { dom } from './dom.js';
import { showToast, escapeHtml, formatarMoeda, calcularCustoUnitario, normalizarTextoBusca, correspondeBusca, formatarCustoComUnidade, calcularEquivalenciaReceita, calcularCustoItemReceita, calcularTotaisReceita, obterCustosIndiretosDoFormulario, obterCustosIndiretosDaReceita, calcularLucroEPrecificacao } from './helpers.js';
import { initFirebase, salvarDadosReceitasLocais, salvarDadosInsumosLocais, salvarDadosProducoesLocais } from './firebaseAuth.js';
import { renderizarInsumos, formatarQuantidadeEstoque, atualizarReceitasDependentes } from './insumos.js';
import { atualizarSelectFornecedores, renderizarFornecedores, obterFornecedorDoInsumo } from './firestoreData.js';
import { calcularCustoUnitarioReceita } from '../utils/costCalculator.ts';
import { compareSupplierOffers, getSupplierOfferComparisonKey } from '../utils/supplierComparison.ts';
import { calcularBaixaEstoque, calcularListaComprasReceita, convertStockQuantity, isBelowMinimum } from '../utils/inventory.ts';
import { calcularCustoRealProducao, calcularRestauracaoEstoqueProducao, calcularResultadoFinanceiroProducao } from '../utils/production.ts';
import { collection, onSnapshot, doc, addDoc, deleteDoc, updateDoc, runTransaction, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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

        // Monta as opções agrupadas por categoria
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

        // Limpa campos do item
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

        // Se o usuário ainda não digitou preço praticado, sugere o valor
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

      // -------------------------------------------------------------
      // 9. RENDERIZAÇÃO DA LISTAGEM DE RECEITAS EM TEMPO REAL
      // -------------------------------------------------------------
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

              <!-- Métricas Principais da Receita -->
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

              <!-- Discriminação: Ingredientes vs Embalagens descartáveis -->
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

              <!-- Lista de Ingredientes e Sacolas/Formas da Receita -->
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

              <!-- Simulador de Lucro Interativo no Próprio Card -->
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

      // Adicionar novo item a uma receita existente
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

export async function salvarNovoPrecoReceita(receitaId, novoPreco) {
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

export function renderizarClientes() {
        if (!dom.customersList) return;
        dom.customersCounter.textContent = `${cachedClientes.length} ${cachedClientes.length === 1 ? 'cliente' : 'clientes'}`;
        dom.tabBadgeClientes.textContent = String(cachedClientes.length);
        dom.customersEmpty.classList.toggle('hidden', cachedClientes.length > 0);
        dom.customersList.innerHTML = cachedClientes.map(cliente => {
          const compras = cachedVendas
            .filter(venda => venda.clienteId === cliente.id)
            .filter(venda => venda.status !== 'cancelado')
            .sort((left, right) => String(right.data || '').localeCompare(String(left.data || '')));
          const totalComprado = compras
            .filter(vendaEstaPaga)
            .reduce((soma, venda) => soma + Number(venda.valorTotal || 0), 0);
          const digitosTelefone = String(cliente.telefone || '').replace(/\D/g, '');
          const telefoneWhatsApp = digitosTelefone.length === 10 || digitosTelefone.length === 11
            ? `55${digitosTelefone}`
            : digitosTelefone;
          const linkWhatsApp = telefoneWhatsApp.length >= 12 && telefoneWhatsApp.length <= 13
            ? `https://wa.me/${telefoneWhatsApp}?text=${encodeURIComponent(`Olá, ${cliente.nome}! Aqui é da padaria.`)}`
            : '';
          return `
            <article class="customer-card">
              <div class="customer-card-heading">
                <h3>${escapeHtml(cliente.nome)}</h3>
                ${linkWhatsApp ? `<a class="btn-secondary" href="${linkWhatsApp}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
              </div>
              <p>Telefone: ${escapeHtml(cliente.telefone || '—')}</p>
              <p>${compras.length} ${compras.length === 1 ? 'compra' : 'compras'} · Total pago: ${formatarMoeda(totalComprado)}</p>
              ${compras.length ? `<div class="module-history"><h4>Histórico de compras</h4>
                ${compras.map(venda => {
                  const status = obterStatusVenda(venda.status);
                  return `<div class="module-history-item">${formatarDataModulo(venda.data)} · ${Number(venda.quantidade || 0)} × ${escapeHtml(venda.produtoNome || 'Produto')} — ${formatarMoeda(Number(venda.valorTotal || 0))} · ${escapeHtml(status.label)}</div>`;
                }).join('')}
              </div>` : ''}
            </article>
          `;
        }).join('');
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

export async function salvarCliente(event) {
        event.preventDefault();
        const nome = dom.customerName.value.trim();
        const telefone = dom.customerPhone.value.trim();
        const digitosTelefone = telefone.replace(/\D/g, '');
        if (!nome || digitosTelefone.length < 10) {
          showToast('Informe o nome e um telefone com DDD.');
          return;
        }
        try {
          await persistirNovoRegistro('clientes', 'clientes', { nome, telefone }, cachedClientes);
          if (!firestoreDb || isTestStockMode) {
            atualizarSelectClientes();
            renderizarClientes();
          }
          dom.formCliente.reset();
          showToast('Cliente cadastrado com sucesso.');
        } catch (error) {
          console.error('Erro ao cadastrar cliente:', error);
          showToast(`Não foi possível cadastrar o cliente: ${error.message || 'tente novamente.'}`);
        }
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

      // Alternar abas do aplicativo
export function switchTab(tab) {
        setActiveTab(tab);
        const tabs = [
          ['insumos', dom.tabNavInsumos, dom.viewInsumos],
          ['fornecedores', dom.tabNavFornecedores, dom.viewFornecedores],
          ['receitas', dom.tabNavReceitas, dom.viewReceitas],
          ['producoes', dom.tabNavProducoes, dom.viewProducoes],
          ['vendas', dom.tabNavVendas, dom.viewVendas],
          ['pedidos', dom.tabNavPedidos, dom.viewPedidos],
          ['clientes', dom.tabNavClientes, dom.viewClientes],
          ['financeiro', dom.tabNavFinanceiro, dom.viewFinanceiro]
        ];
        tabs.forEach(([name, button, view]) => {
          const isActive = name === tab;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-selected', String(isActive));
          view.classList.toggle('hidden', !isActive);
        });

        if (tab === 'insumos') {
          return;
        }
        if (tab === 'fornecedores') {
          atualizarSelectFornecedores();
          renderizarFornecedores();
        } else if (tab === 'receitas') {
          atualizarSelectsInsumosParaReceitas();
          renderizarReceitas();
          renderizarGruposModeloReceita();
        } else if (tab === 'producoes') {
          renderizarProducoes();
        } else if (tab === 'vendas') {
          atualizarSelectProdutos();
          atualizarSelectClientes();
          renderizarVendas();
        } else if (tab === 'pedidos') {
          atualizarSelectProdutos();
          atualizarSelectClientes();
          renderizarPedidos();
        } else if (tab === 'clientes') {
          renderizarClientes();
        } else if (tab === 'financeiro') {
          renderizarFinanceiro();
        }
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

