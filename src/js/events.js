import { handleLoginGoogle, handleLoginWithPassword, handleLogout, alterarModoEstoque, copiarDominio, carregarDadosLocais, pararListenersFirestore, abrirModalDominioNaoAutorizado, fecharModalDominioNaoAutorizado, abrirModalRegrasFirestore, fecharModalRegrasFirestore } from './firebaseAuth.js';
import { abrirEdicaoFornecedor, prepararNovoFornecedor, abrirEdicaoInsumo, handleFormFornecedorSubmit, obterFornecedoresDisponiveis } from './firestoreData.js';
import { renderizarInsumos, abrirEdicaoInsumo, prepararNovoInsumo, cancelarEdicaoInsumo, handleFormSubmit, confirmarExclusao, handleStockUnitChange, setGroupFilter } from './insumos.js';
import { switchTab, switchRecipePanel, renderizarReceitas, renderizarResultadosBuscaInsumosReceita, renderizarGruposReceitaEmElaboracao, renderizarItensGrupoModelo, adicionarGrupoReceita, atualizarModoOrganizacaoGrupoReceita, atualizarNomeGrupoReceita, removerGrupoReceita, selecionarGrupoReceita, copiarItensGrupoModeloParaReceita, moverItemParaGrupo, adicionarItemReceitaEmElaboracao, removerItemReceitaEmElaboracao, renderizarItensReceitaEmElaboracao, atualizarPreviewItemReceita, atualizarTotaisReceitaEmElaboracao, atualizarCalculadoraLucroReceita, atualizarPreviewFotoReceita, compactarFotoReceita, prepararNovaReceita, abrirEdicaoReceita, duplicarReceita, handleFormReceitaSubmit, abrirModalProducao, fecharModalProducao, renderizarPreviaProducao, confirmarProducao, abrirEdicaoProducao, fecharEdicaoProducao, atualizarPreviaEdicaoProducao, salvarEdicaoProducao, abrirExclusaoProducao, fecharExclusaoProducao, confirmarExclusaoProducao, abrirModalAddItemReceita, fecharModalAddItemReceita, atualizarPreviewModalAddItem, confirmarModalAddItemReceita, salvarNovoPrecoReceita, atualizarSelectProdutos, atualizarSelectClientes, atualizarPrecoVendaProduto, abrirEdicaoVenda, fecharEdicaoVenda, salvarEdicaoVenda, salvarVenda, salvarPedido, salvarCliente, salvarMovimentacaoFinanceira, salvarDespesaFixa, excluirRegistroFinanceiro, atualizarStatusPedido } from './receitas.js';
import { abrirModalConfig, fecharModalConfig, salvarConfigFirebaseModal } from './firebaseConfigModal.js';
import { showToast } from './helpers.js';
import { dom } from './dom.js';

// 11. REGISTRO DE EVENTOS E INTERATIVIDADE
// -------------------------------------------------------------
// Login e Sessão
dom.btnLoginGoogle.addEventListener('click', handleLoginGoogle);
      dom.btnLoginGoogleRedirect.addEventListener('click', () => handleLoginGoogle(true));
      dom.formLoginPassword.addEventListener('submit', handleLoginWithPassword);
      dom.btnLogout.addEventListener('click', handleLogout);
      dom.btnStockModeReal.addEventListener('click', () => alterarModoEstoque(false));
      dom.btnStockModeTest.addEventListener('click', () => alterarModoEstoque(true));

      // Navegação por abas
      dom.tabNavInsumos.addEventListener('click', () => switchTab('insumos'));
      dom.tabNavFornecedores.addEventListener('click', () => switchTab('fornecedores'));
      dom.tabNavReceitas.addEventListener('click', () => switchTab('receitas'));
      dom.tabRecipeList.addEventListener('click', () => switchRecipePanel('recipes'));
      dom.tabRecipeGroups.addEventListener('click', () => switchRecipePanel('groups'));
      dom.recipeGroupTemplateForm.addEventListener('submit', salvarGrupoModeloReceita);
      dom.btnAddRecipeGroupTemplateItem.addEventListener('click', adicionarItemGrupoModelo);
      dom.btnCancelRecipeGroupTemplate.addEventListener('click', prepararNovoGrupoModelo);
      dom.recipeGroupTemplateMaterial.addEventListener('change', () => {
        const selected = dom.recipeGroupTemplateMaterial.selectedOptions[0];
        const unit = selected?.getAttribute('data-unit');
        const conversions = JSON.parse(selected?.getAttribute('data-conversions') || '{}');
        if (unit === 'kg' || unit === 'g') dom.recipeGroupTemplateUnit.value = 'g';
        else if (unit === 'L' || unit === 'ml') dom.recipeGroupTemplateUnit.value = 'ml';
        else if (unit === 'un') dom.recipeGroupTemplateUnit.value = conversions.baseUnit || 'un';
        else if (['xicara', 'colher_sopa', 'colher_cha'].includes(unit)) {
          dom.recipeGroupTemplateUnit.value = conversions.baseUnit || unit;
        }
      });
      dom.recipeGroupTemplateItems.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-recipe-group-template-item]');
        if (!button) return;
        itensGrupoModeloEmEdicao.splice(Number(button.getAttribute('data-remove-recipe-group-template-item')), 1);
        renderizarItensGrupoModelo();
      });
      dom.recipeGroupTemplatesList.addEventListener('click', event => {
        const editButton = event.target.closest('[data-edit-recipe-group-template]');
        if (editButton) {
          editarGrupoModeloReceita(editButton.getAttribute('data-edit-recipe-group-template'));
          return;
        }
        const deleteButton = event.target.closest('[data-delete-recipe-group-template]');
        if (deleteButton) excluirGrupoModeloReceita(deleteButton.getAttribute('data-delete-recipe-group-template'));
      });
      dom.tabNavProducoes.addEventListener('click', () => switchTab('producoes'));
      dom.tabNavVendas.addEventListener('click', () => switchTab('vendas'));
      dom.tabNavPedidos.addEventListener('click', () => switchTab('pedidos'));
      dom.tabNavClientes.addEventListener('click', () => switchTab('clientes'));
      dom.tabNavFinanceiro.addEventListener('click', () => switchTab('financeiro'));
      dom.btnProducoesVerReceitas.addEventListener('click', () => switchTab('receitas'));
      dom.formVenda.addEventListener('submit', salvarVenda);
      dom.salesList.addEventListener('click', event => {
        const button = event.target.closest('[data-edit-sale-id]');
        if (button) abrirEdicaoVenda(button.getAttribute('data-edit-sale-id'));
      });
      dom.editSaleForm.addEventListener('submit', salvarEdicaoVenda);
      dom.btnCancelEditSale.addEventListener('click', fecharEdicaoVenda);
      dom.editSaleProduct.addEventListener('change', () => {
        const receita = cachedReceitas.find(item => item.id === dom.editSaleProduct.value);
        if (receita) dom.editSaleUnitPrice.value = Number(receita.precoVendaPraticado ?? receita.precoVendaSugerido ?? 0).toFixed(2);
      });
      dom.editSaleModal.addEventListener('click', event => {
        if (event.target === dom.editSaleModal) fecharEdicaoVenda();
      });
      dom.formPedido.addEventListener('submit', salvarPedido);
      dom.formCliente.addEventListener('submit', salvarCliente);
      dom.saleProduct.addEventListener('change', atualizarPrecoVendaProduto);
      dom.ordersList.addEventListener('change', (event) => {
        const select = event.target.closest('[data-order-status]');
        if (select) atualizarStatusPedido(select.getAttribute('data-order-status'), select.value);
      });
      dom.financeTransactionForm.addEventListener('submit', salvarMovimentacaoFinanceira);
      dom.fixedExpenseForm.addEventListener('submit', salvarDespesaFixa);
      dom.financeTransactionType.addEventListener('change', atualizarCategoriasMovimentacao);
      dom.financeMonth.addEventListener('change', renderizarFinanceiro);
      dom.financeTransactionsList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-delete-cashflow]');
        if (button) excluirRegistroFinanceiro('fluxoCaixa', button.getAttribute('data-delete-cashflow'));
      });
      dom.fixedExpensesList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-delete-fixed-expense]');
        if (button) excluirRegistroFinanceiro('despesasFixas', button.getAttribute('data-delete-fixed-expense'));
      });

      // Filtro de insumos por grupo
      dom.categoryPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('[data-group-filter]');
        if (pill) {
          const group = pill.getAttribute('data-group-filter');
          setGroupFilter(group);
        }
      });

      // Modais de Ajuda e Domínio
      if (dom.btnHelpDomain) dom.btnHelpDomain.addEventListener('click', abrirModalDominioNaoAutorizado);
      if (dom.btnCopyQuickDomain) dom.btnCopyQuickDomain.addEventListener('click', () => copiarDominio(dom.btnCopyQuickDomain));
      if (dom.btnCopyUnauthDomain) dom.btnCopyUnauthDomain.addEventListener('click', () => copiarDominio(dom.btnCopyUnauthDomain));
      if (dom.btnCloseUnauthModal) dom.btnCloseUnauthModal.addEventListener('click', fecharModalDominioNaoAutorizado);

      // Regras Firestore modal
      if (dom.btnCloseRulesModal) dom.btnCloseRulesModal.addEventListener('click', fecharModalRegrasFirestore);

      // Configuração modal
      dom.btnOpenConfig.addEventListener('click', abrirModalConfig);
      dom.btnCancelConfig.addEventListener('click', fecharModalConfig);
      dom.btnSaveConfig.addEventListener('click', salvarConfigFirebaseModal);

      // Formulário de Insumos: toggle e inputs
      dom.btnToggleForm.addEventListener('click', () => {
        const isHidden = dom.formInsumo.classList.contains('hidden');
        if (isHidden) {
          dom.formInsumo.classList.remove('hidden');
          dom.toggleFormText.textContent = 'Recolher Formulário';
          dom.toggleFormIcon.textContent = '▲';
          dom.btnToggleForm.setAttribute('aria-expanded', 'true');
          dom.inputNome.focus();
        } else {
          dom.formInsumo.classList.add('hidden');
          dom.toggleFormText.textContent = 'Cadastrar Novo Insumo ou Embalagem';
          dom.toggleFormIcon.textContent = '➕';
          dom.btnToggleForm.setAttribute('aria-expanded', 'false');
        }
      });

      dom.btnEmptyAdd.addEventListener('click', () => {
        dom.formInsumo.classList.remove('hidden');
        dom.toggleFormText.textContent = 'Recolher Formulário';
        dom.toggleFormIcon.textContent = '▲';
        dom.btnToggleForm.setAttribute('aria-expanded', 'true');
        dom.inputNome.focus();
        dom.formInsumo.scrollIntoView({ behavior: 'smooth' });
      });

      dom.btnManageSuppliers.addEventListener('click', () => switchTab('fornecedores'));
      dom.formFornecedor.addEventListener('submit', handleFormFornecedorSubmit);
      dom.btnCancelEditSupplier.addEventListener('click', () => prepararNovoFornecedor());
      dom.priceComparisonSearch.addEventListener('input', renderizarComparativoIngredientes);
      dom.suppliersContainer.addEventListener('click', event => {
        const editButton = event.target.closest('[data-edit-supplier-id]');
        if (editButton) {
          abrirEdicaoFornecedor(editButton.getAttribute('data-edit-supplier-id'));
          return;
        }
        const registerButton = event.target.closest('[data-register-legacy-supplier]');
        if (registerButton) {
          prepararNovoFornecedor(registerButton.getAttribute('data-register-legacy-supplier') || '');
          dom.inputTelefoneFornecedor.focus();
        }
      });

      dom.inputNome.addEventListener('input', () => {
        if (dom.inputGrupoComparacao.dataset.touched !== 'true') {
          dom.inputGrupoComparacao.value = dom.inputNome.value;
        }
      });
      dom.inputGrupoComparacao.addEventListener('input', () => {
        dom.inputGrupoComparacao.dataset.touched = 'true';
      });

      dom.btnEmptyClearFilters.addEventListener('click', () => {
        dom.inputSearch.value = '';
        dom.btnClearSearch.style.display = 'none';
        setGroupFilter('todos');
        dom.inputSearch.focus();
      });

      // Auto-selecionar unidade padrão ao mudar a categoria de insumo
      dom.selectCategoriaInsumo.addEventListener('change', () => {
        if (dom.selectCategoriaInsumo.value === 'embalagem') {
          dom.selectUnidade.value = 'un';
        } else if (dom.selectCategoriaInsumo.value === 'ingrediente') {
          dom.selectUnidade.value = 'kg';
        }
        handleStockUnitChange();
      });

      dom.inputPreco.addEventListener('input', atualizarPreviewCalculo);
      dom.inputQuantidade.addEventListener('input', atualizarPreviewCalculo);
      dom.selectUnidade.addEventListener('change', handleStockUnitChange);
      dom.formInsumo.addEventListener('submit', handleFormSubmit);
      dom.btnCancelEditInsumo.addEventListener('click', cancelarEdicaoInsumo);

      // Deleção de insumos
      dom.insumosContainer.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('[data-edit-id]');
        if (btnEdit) {
          abrirEdicaoInsumo(btnEdit.getAttribute('data-edit-id'));
          return;
        }
        const btnDelete = e.target.closest('[data-delete-id]');
        if (btnDelete) {
          const id = btnDelete.getAttribute('data-delete-id');
          const name = btnDelete.getAttribute('data-delete-name');
          abrirModalExcluir(id, name);
        }
      });

      dom.btnCancelDelete.addEventListener('click', fecharModalExcluir);
      dom.btnConfirmDelete.addEventListener('click', confirmarExclusao);

      // Busca de insumos
      dom.inputSearch.addEventListener('input', () => {
        dom.btnClearSearch.style.display = dom.inputSearch.value.trim().length > 0 ? 'block' : 'none';
        renderizarInsumos();
      });

      dom.btnClearSearch.addEventListener('click', () => {
        dom.inputSearch.value = '';
        dom.btnClearSearch.style.display = 'none';
        renderizarInsumos();
        dom.inputSearch.focus();
      });

      // Formulário de Receitas: toggle
      dom.btnToggleFormReceita.addEventListener('click', () => {
        const isHidden = dom.formReceita.classList.contains('hidden');
        if (isHidden) {
          dom.formReceita.classList.remove('hidden');
          dom.toggleFormReceitaText.textContent = 'Recolher Formulário';
          dom.toggleFormReceitaIcon.textContent = '▲';
          dom.btnToggleFormReceita.setAttribute('aria-expanded', 'true');
          dom.inputReceitaNome.focus();
        } else {
          dom.formReceita.classList.add('hidden');
          dom.toggleFormReceitaText.textContent = 'Criar Nova Receita';
          dom.toggleFormReceitaIcon.textContent = '➕';
          dom.btnToggleFormReceita.setAttribute('aria-expanded', 'false');
        }
      });

      dom.btnEmptyAddReceita.addEventListener('click', () => {
        dom.formReceita.classList.remove('hidden');
        dom.toggleFormReceitaText.textContent = 'Recolher Formulário';
        dom.toggleFormReceitaIcon.textContent = '▲';
        dom.btnToggleFormReceita.setAttribute('aria-expanded', 'true');
        dom.inputReceitaNome.focus();
        dom.formReceita.scrollIntoView({ behavior: 'smooth' });
      });

      dom.btnEmptyClearFiltersReceitas.addEventListener('click', () => {
        dom.inputSearchReceitas.value = '';
        dom.btnClearSearchReceitas.style.display = 'none';
        activeRecipeCategory = 'todos';
        dom.recipeCategoryPills.querySelectorAll('[data-recipe-category]').forEach(button => {
          const active = button.getAttribute('data-recipe-category') === 'todos';
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        renderizarReceitas();
        dom.inputSearchReceitas.focus();
      });

      // Construtor de Itens de Receita
      dom.receitaItemInsumo.addEventListener('change', () => {
        const selected = dom.receitaItemInsumo.selectedOptions[0];
        dom.receitaItemBusca.value = selected?.value ? selected.textContent.trim() : '';
        dom.receitaItemResultados.classList.add('hidden');
        dom.receitaItemBusca.setAttribute('aria-expanded', 'false');
        const unit = selected?.getAttribute('data-unit');
        const conversions = JSON.parse(selected?.getAttribute('data-conversions') || '{}');
        if (unit === 'kg' || unit === 'g') {
          dom.receitaItemUnidade.value = 'g';
        } else if (unit === 'L' || unit === 'ml') {
          dom.receitaItemUnidade.value = 'ml';
        } else if (unit === 'un') {
          dom.receitaItemUnidade.value = conversions.baseUnit || 'un';
        } else if (['xicara', 'colher_sopa', 'colher_cha'].includes(unit)) {
          dom.receitaItemUnidade.value = conversions.baseUnit || unit;
        }
        atualizarPreviewItemReceita();
      });

      dom.receitaItemBusca.addEventListener('focus', () => {
        if (dom.receitaItemInsumo.value) dom.receitaItemBusca.value = '';
        renderizarResultadosBuscaInsumosReceita();
      });
      dom.receitaItemBusca.addEventListener('input', () => {
        if (dom.receitaItemInsumo.value) {
          dom.receitaItemInsumo.value = '';
          atualizarPreviewItemReceita();
        }
        renderizarResultadosBuscaInsumosReceita();
      });
      dom.receitaItemBusca.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          const firstResult = dom.receitaItemResultados.querySelector('[data-recipe-material-value]');
          if (firstResult) {
            event.preventDefault();
            firstResult.focus();
          }
        } else if (event.key === 'Escape') {
          dom.receitaItemResultados.classList.add('hidden');
          dom.receitaItemBusca.setAttribute('aria-expanded', 'false');
        } else if (event.key === 'Enter') {
          const firstResult = dom.receitaItemResultados.querySelector('[data-recipe-material-value]');
          if (firstResult) {
            event.preventDefault();
            firstResult.click();
          }
        }
      });
      dom.receitaItemResultados.addEventListener('click', event => {
        const result = event.target.closest('[data-recipe-material-value]');
        if (!result) return;
        dom.receitaItemInsumo.value = result.getAttribute('data-recipe-material-value');
        dom.receitaItemInsumo.dispatchEvent(new Event('change', { bubbles: true }));
      });

      dom.receitaItemQuantidade.addEventListener('input', atualizarPreviewItemReceita);
      dom.receitaItemUnidade.addEventListener('change', atualizarPreviewItemReceita);
      dom.recipeGroupModeInputs.forEach(input => {
        input.addEventListener('change', () => {
          atualizarModoOrganizacaoGrupoReceita(input.value);
          renderizarGruposReceitaEmElaboracao();
        });
      });
      dom.receitaItemGrupo.addEventListener('change', () => {
        grupoReceitaSelecionadoId = dom.receitaItemGrupo.value;
        atualizarModoOrganizacaoGrupoReceita(grupoReceitaSelecionadoId ? 'existing' : 'standalone');
      });
      dom.btnAddGrupoReceita.addEventListener('click', adicionarGrupoReceita);
      dom.btnUsarGrupoReceita.addEventListener('click', usarGrupoCatalogoNaReceita);
      dom.inputNovoGrupoReceita.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          adicionarGrupoReceita();
        }
      });
      dom.recipeGroupsList.addEventListener('change', event => {
        const input = event.target.closest('[data-recipe-group-name]');
        if (input) atualizarNomeGrupoReceita(input.getAttribute('data-recipe-group-name'), input.value);
      });
      dom.recipeGroupsList.addEventListener('keydown', event => {
        const input = event.target.closest('[data-recipe-group-name]');
        if (input && event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        }
      });
      dom.recipeGroupsList.addEventListener('click', event => {
        const selectButton = event.target.closest('[data-select-recipe-group]');
        if (selectButton) {
          selecionarGrupoReceita(selectButton.getAttribute('data-select-recipe-group'));
          return;
        }
        const removeButton = event.target.closest('[data-remove-recipe-group]');
        if (removeButton) removerGrupoReceita(removeButton.getAttribute('data-remove-recipe-group'));
      });
      dom.btnAddItemToReceita.addEventListener('click', adicionarItemReceitaEmElaboracao);

      // Delegação para remover item temporário da receita
      dom.tbodyDraftReceitaItens.addEventListener('click', (e) => {
        const btnRemove = e.target.closest('[data-remove-index]');
        if (btnRemove) {
          const index = parseInt(btnRemove.getAttribute('data-remove-index'), 10);
          removerItemReceitaEmElaboracao(index);
        }
      });
      dom.tbodyDraftReceitaItens.addEventListener('change', event => {
        const select = event.target.closest('[data-recipe-item-group]');
        if (select) moverItemParaGrupo(Number(select.getAttribute('data-recipe-item-group')), select.value);
      });

      // Rendimento e margem mudando os cálculos da receita em tempo real
      dom.inputReceitaRendimento.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputReceitaRendimentoUn.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputTempoPreparo.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputCustoEnergia.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputValorHora.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputCustoAgua.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputUnidadesPerdidas.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputMargemLucro.addEventListener('input', atualizarTotaisReceitaEmElaboracao);
      dom.inputPrecoPraticado.addEventListener('input', atualizarTotaisReceitaEmElaboracao);

      // Presets rápidos de margem de lucro (50%, 80%, 100%, 150%, 200%)
      document.querySelectorAll('.btn-profit-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          const margin = btn.getAttribute('data-margin');
          dom.inputMargemLucro.value = margin;
          document.querySelectorAll('.btn-profit-preset').forEach(b => {
            b.style.background = '';
            b.style.fontWeight = '700';
          });
          btn.style.background = '#FEF3C7';
          btn.style.fontWeight = '800';
          atualizarTotaisReceitaEmElaboracao();
        });
      });

      dom.inputFotoReceita.addEventListener('change', async () => {
        const file = dom.inputFotoReceita.files?.[0];
        if (!file) return;
        const submitLabel = dom.btnSubmitReceita.innerHTML;
        dom.btnSubmitReceita.disabled = true;
        dom.btnSubmitReceita.innerHTML = '<span class="loading-spinner"></span> Preparando foto...';
        try {
          atualizarPreviewFotoReceita(await compactarFotoReceita(file));
        } catch (err) {
          dom.inputFotoReceita.value = '';
          showToast(err.message || 'Não foi possível usar esta imagem.');
        } finally {
          dom.btnSubmitReceita.disabled = false;
          dom.btnSubmitReceita.innerHTML = submitLabel;
        }
      });
      dom.btnRemoverFotoReceita.addEventListener('click', () => atualizarPreviewFotoReceita(null));
      dom.formReceita.addEventListener('submit', handleFormReceitaSubmit);
      dom.btnCancelEditReceita.addEventListener('click', prepararNovaReceita);

      // Delegação de eventos no container de receitas
      dom.receitasContainer.addEventListener('click', (e) => {
        const listToggle = e.target.closest('[data-recipe-list-toggle]');
        if (listToggle) {
          const listType = listToggle.getAttribute('data-recipe-list-toggle');
          const recipeId = listToggle.getAttribute('data-recipe-id');
          const listKey = `${listType}:${recipeId}`;
          if (listasReceitaRecolhidas.has(listKey)) {
            listasReceitaRecolhidas.delete(listKey);
          } else {
            listasReceitaRecolhidas.add(listKey);
          }
          renderizarReceitas();
          return;
        }

        const btnProduce = e.target.closest('[data-produce-receita-id]');
        if (btnProduce) {
          abrirModalProducao(btnProduce.getAttribute('data-produce-receita-id'));
          return;
        }
        const btnDuplicateRec = e.target.closest('[data-duplicate-receita-id]');
        if (btnDuplicateRec) {
          duplicarReceita(btnDuplicateRec.getAttribute('data-duplicate-receita-id'));
          return;
        }
        const btnEditRec = e.target.closest('[data-edit-receita-id]');
        if (btnEditRec) {
          abrirEdicaoReceita(btnEditRec.getAttribute('data-edit-receita-id'));
          return;
        }

        // Excluir receita
        const btnDeleteRec = e.target.closest('[data-delete-receita-id]');
        if (btnDeleteRec) {
          const id = btnDeleteRec.getAttribute('data-delete-receita-id');
          const name = btnDeleteRec.getAttribute('data-delete-receita-name');
          abrirModalExcluirReceita(id, name);
          return;
        }

        // Adicionar novo item a receita existente
        const btnAddItem = e.target.closest('[data-add-item-rec-id]');
        if (btnAddItem) {
          const id = btnAddItem.getAttribute('data-add-item-rec-id');
          const name = btnAddItem.getAttribute('data-add-item-rec-name');
          abrirModalAddItemReceita(id, name);
          return;
        }

        // Salvar preço praticado no card
        const btnSavePrice = e.target.closest('[data-btn-save-price-id]');
        if (btnSavePrice) {
          const id = btnSavePrice.getAttribute('data-btn-save-price-id');
          const inputPrice = document.querySelector(`[data-input-price-id="${id}"]`);
          if (inputPrice) {
            salvarNovoPrecoReceita(id, inputPrice.value);
          }
          return;
        }
      });

      dom.recipeCategoryPills.addEventListener('click', (e) => {
        const pill = e.target.closest('[data-recipe-category]');
        if (!pill) return;
        activeRecipeCategory = pill.getAttribute('data-recipe-category') || 'todos';
        dom.recipeCategoryPills.querySelectorAll('[data-recipe-category]').forEach(button => {
          const active = button === pill;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        renderizarReceitas();
      });

      // Modais de receitas
      dom.btnCancelProduction.addEventListener('click', fecharModalProducao);
      dom.btnConfirmProduction.addEventListener('click', confirmarProducao);
      dom.productionBatches.addEventListener('input', renderizarPreviaProducao);
      dom.productionModal.addEventListener('click', event => {
        if (event.target === dom.productionModal) fecharModalProducao();
      });
      dom.producoesContainer.addEventListener('click', event => {
        const button = event.target.closest('[data-edit-production-id]');
        if (button) abrirEdicaoProducao(button.getAttribute('data-edit-production-id'));
        const deleteButton = event.target.closest('[data-delete-production-id]');
        if (deleteButton) abrirExclusaoProducao(deleteButton.getAttribute('data-delete-production-id'));
      });
      dom.btnCancelEditProduction.addEventListener('click', fecharEdicaoProducao);
      dom.btnSaveEditProduction.addEventListener('click', salvarEdicaoProducao);
      dom.btnCancelDeleteProduction.addEventListener('click', fecharExclusaoProducao);
      dom.btnConfirmDeleteProduction.addEventListener('click', confirmarExclusaoProducao);
      dom.editProductionDate.addEventListener('input', atualizarPreviaEdicaoProducao);
      dom.editProductionQuantity.addEventListener('input', atualizarPreviaEdicaoProducao);
      dom.editProductionSalePrice.addEventListener('input', atualizarPreviaEdicaoProducao);
      dom.editProductionModal.addEventListener('click', event => {
        if (event.target === dom.editProductionModal) fecharEdicaoProducao();
      });
      dom.deleteProductionModal.addEventListener('click', event => {
        if (event.target === dom.deleteProductionModal) fecharExclusaoProducao();
      });

      dom.selectModalAddInsumo.addEventListener('change', () => {
        const selected = dom.selectModalAddInsumo.selectedOptions[0];
        const unit = selected?.getAttribute('data-unit');
        const conversions = JSON.parse(selected?.getAttribute('data-conversions') || '{}');
        if (unit === 'kg' || unit === 'g') {
          dom.selectModalAddUn.value = 'g';
        } else if (unit === 'L' || unit === 'ml') {
          dom.selectModalAddUn.value = 'ml';
        } else if (unit === 'un') {
          dom.selectModalAddUn.value = conversions.baseUnit || 'un';
        } else if (['xicara', 'colher_sopa', 'colher_cha'].includes(unit)) {
          dom.selectModalAddUn.value = conversions.baseUnit || unit;
        }
        atualizarPreviewModalAddItem();
      });

      dom.inputModalAddQtd.addEventListener('input', atualizarPreviewModalAddItem);
      dom.selectModalAddUn.addEventListener('change', atualizarPreviewModalAddItem);
      dom.btnCancelModalAddItem.addEventListener('click', fecharModalAddItemReceita);
      dom.btnConfirmModalAddItem.addEventListener('click', confirmarModalAddItemReceita);

      dom.btnCancelDeleteReceita.addEventListener('click', fecharModalExcluirReceita);
      dom.btnConfirmDeleteReceita.addEventListener('click', confirmarExclusaoReceita);

      // Busca de receitas
      dom.inputSearchReceitas.addEventListener('input', () => {
        dom.btnClearSearchReceitas.style.display = dom.inputSearchReceitas.value.trim().length > 0 ? 'block' : 'none';
        renderizarReceitas();
      });

      dom.btnClearSearchReceitas.addEventListener('click', () => {
        dom.inputSearchReceitas.value = '';
        dom.btnClearSearchReceitas.style.display = 'none';
        renderizarReceitas();
        dom.inputSearchReceitas.focus();
      });

