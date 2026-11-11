import { cachedInsumos, cachedReceitas, cachedFornecedores, editingInsumoId, stockFormUnit, isTestStockMode, firestoreDb, currentUser, activeGroupFilter, pendingDeleteId, LOCAL_DEMO_ITEMS_KEY, TEST_ITEMS_KEY, DEMO_SEED_INSUMOS } from './state.js';
import { dom } from './dom.js';
import { showToast, calcularCustoUnitario, escapeHtml, formatarMoeda, correspondeBusca } from './helpers.js';
import { initFirebase } from './firebaseAuth.js';
import { collection, onSnapshot, doc, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function obterEstoqueAtual(insumo) {
        return Number.isFinite(insumo?.estoqueAtual)
          ? Number(insumo.estoqueAtual)
          : Number(insumo?.quantidade) || 0;
      }

export function formatarQuantidadeEstoque(quantidade) {
        return Number(quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
      }

export function atualizarRotulosUnidadeEstoque() {
        const unidade = dom.selectUnidade.value || 'kg';
        dom.estoqueUnitCurrent.textContent = unidade;
        dom.estoqueUnitMinimum.textContent = unidade;
      }

export function handleStockUnitChange() {
        const nextUnit = dom.selectUnidade.value || 'kg';
        if (editingInsumoId && stockFormUnit !== nextUnit) {
          const item = cachedInsumos.find(insumo => insumo.id === editingInsumoId);
          try {
            const conversions = item?.conversoes;
            const convert = value => {
              const quantity = parseFloat(value);
              return Number.isFinite(quantity)
                ? convertStockQuantity(quantity, stockFormUnit, nextUnit, conversions)
                : value;
            };
            dom.inputQuantidade.value = convert(dom.inputQuantidade.value);
            dom.inputEstoqueAtual.value = convert(dom.inputEstoqueAtual.value);
            dom.inputEstoqueMinimo.value = convert(dom.inputEstoqueMinimo.value);
          } catch (error) {
            dom.selectUnidade.value = stockFormUnit;
            showToast(error.message || 'Não foi possível converter as quantidades para esta unidade.');
            return;
          }
        }
        stockFormUnit = nextUnit;
        atualizarRotulosUnidadeEstoque();
        atualizarPreviewCalculo();
      }

export function atualizarPreviewCalculo() {
        const preco = parseFloat(dom.inputPreco.value) || 0;
        const qtd = parseFloat(dom.inputQuantidade.value) || 0;
        const unidade = dom.selectUnidade.value || 'kg';

        if (preco > 0 && qtd > 0) {
          const custo = calcularCustoUnitario(preco, qtd);
          dom.previewUnitCost.textContent = formatarCustoComUnidade(custo, unidade);
          dom.previewRecipeCost.textContent = calcularEquivalenciaReceita(custo, unidade);
        } else {
          dom.previewUnitCost.textContent = `R$ 0,00 / ${unidade}`;
          dom.previewRecipeCost.textContent = 'Preencha quantidade e preço acima para ver o custo';
        }
      }

export function prepararNovoInsumo() {
        editingInsumoId = null;
        dom.formInsumo.reset();
        dom.selectCategoriaInsumo.value = 'ingrediente';
        dom.selectUnidade.value = 'kg';
        dom.inputGrupoComparacao.dataset.touched = 'false';
        stockFormUnit = 'kg';
        dom.inputEstoqueAtual.value = '';
        dom.inputEstoqueMinimo.value = '0';
        atualizarRotulosUnidadeEstoque();
        preencherConversoesDoFormulario(null);
        dom.formInsumoTitle.textContent = '🌾 Novo Insumo ou Embalagem';
        dom.btnSubmitInsumo.innerHTML = '<span>Salvar no Firestore</span>';
        dom.btnCancelEditInsumo.classList.add('hidden');
        atualizarPreviewCalculo();
      }

export function cancelarEdicaoInsumo() {
        prepararNovoInsumo();
      }

export function abrirEdicaoInsumo(id) {
        const insumo = cachedInsumos.find(item => item.id === id);
        if (!insumo) return;

        editingInsumoId = id;
        atualizarSelectFornecedores();
        dom.selectCategoriaInsumo.value = insumo.categoria || 'ingrediente';
        dom.inputNome.value = insumo.nome || '';
        dom.inputGrupoComparacao.value = insumo.grupoComparacao || insumo.nome || '';
        dom.inputGrupoComparacao.dataset.touched = 'true';
        dom.inputMarcaInsumo.value = insumo.marca || '';
        const supplier = obterFornecedorDoInsumo(insumo);
        const supplierOption = Array.from(dom.inputFornecedor.options).find(option =>
          option.getAttribute('data-supplier-id') === (supplier?.id || '') ||
          normalizeComparisonName(option.getAttribute('data-name') || '') === normalizeComparisonName(insumo.fornecedor || '')
        );
        dom.inputFornecedor.value = supplierOption?.value || '';
        dom.inputQuantidade.value = insumo.quantidade ?? '';
        dom.selectUnidade.value = insumo.unidade || 'kg';
        stockFormUnit = dom.selectUnidade.value;
        dom.inputEstoqueAtual.value = obterEstoqueAtual(insumo);
        dom.inputEstoqueMinimo.value = insumo.estoqueMinimo ?? 0;
        atualizarRotulosUnidadeEstoque();
        preencherConversoesDoFormulario(insumo.conversoes);
        dom.inputPreco.value = insumo.preco ?? '';
        dom.formInsumoTitle.textContent = '✏️ Editar Insumo ou Material';
        dom.btnSubmitInsumo.innerHTML = '<span>Salvar alterações</span>';
        dom.btnCancelEditInsumo.classList.remove('hidden');
        dom.formInsumo.classList.remove('hidden');
        dom.toggleFormText.textContent = 'Recolher Formulário';
        dom.toggleFormIcon.textContent = '▲';
        dom.btnToggleForm.setAttribute('aria-expanded', 'true');
        atualizarPreviewCalculo();
        dom.formInsumo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

export async function atualizarReceitasDoInsumo(insumo) {
        let falhas = 0;

        for (const receita of cachedReceitas) {
          if (!(receita.itens || []).some(item => item.insumoId === insumo.id)) continue;

          const itens = receita.itens.map(item => {
            if (item.insumoId !== insumo.id) return item;
            return {
              ...item,
              insumoNome: insumo.nome,
              categoria: insumo.categoria || 'ingrediente',
              custoUnitarioBase: insumo.custoUnitario,
              unidadeBase: insumo.unidade,
              conversoes: insumo.conversoes || null,
              custoItem: calcularCustoItemReceita(
                insumo.custoUnitario,
                insumo.unidade,
                item.quantidadeUsada,
                item.unidadeUsada,
                insumo.conversoes
              )
            };
          });
          const totais = calcularTotaisReceita(itens, receita.rendimento, obterCustosIndiretosDaReceita(receita));
          const lucro = calcularLucroEPrecificacao(
            totais.custoUnitario,
            receita.margemLucroDesejada,
            receita.precoVendaPraticado
          );
          const atualizacoes = {
            itens,
            ...totais,
            precoVendaSugerido: lucro.precoSugerido,
            lucroPorUnidade: lucro.lucroPorUnidade,
            updatedAt: isTestStockMode ? new Date().toISOString() : serverTimestamp()
          };

          try {
            if (firestoreDb && !isTestStockMode && !receita.id.startsWith('local-') && !receita.id.startsWith('demo-')) {
              await updateDoc(doc(firestoreDb, 'receitas', receita.id), atualizacoes);
            }
            Object.assign(receita, atualizacoes);
            if (isTestStockMode) salvarDadosReceitasLocais();
            falhas += await atualizarReceitasDependentes(receita.id);
          } catch (err) {
            falhas++;
            console.error(`Erro ao recalcular a receita ${receita.id}:`, err);
          }
        }

        renderizarReceitas();
        return falhas;
      }

export async function atualizarReceitasDependentes(receitaBaseId, visitadas = new Set()) {
        if (visitadas.has(receitaBaseId)) return 0;
        visitadas.add(receitaBaseId);
        const receitaBase = cachedReceitas.find(receita => receita.id === receitaBaseId);
        if (!receitaBase) return 0;

        let falhas = 0;
        const custoBase = obterCustoPorUnidadeReceita(receitaBase);
        const unidadeBase = normalizarUnidadeRendimento(receitaBase.rendimentoUnidade);

        for (const receita of cachedReceitas) {
          if (!(receita.itens || []).some(item => item.receitaId === receitaBaseId)) continue;
          const itens = receita.itens.map(item => item.receitaId === receitaBaseId
            ? {
                ...item,
                insumoNome: receitaBase.nome,
                custoUnitarioBase: custoBase,
                unidadeBase,
                custoItem: calcularCustoItemReceita(
                  custoBase,
                  unidadeBase,
                  item.quantidadeUsada,
                  item.unidadeUsada,
                  item.conversoes
                )
              }
            : item
          );
          const totais = calcularTotaisReceita(itens, receita.rendimento, obterCustosIndiretosDaReceita(receita));
          const lucro = calcularLucroEPrecificacao(
            totais.custoUnitario,
            receita.margemLucroDesejada,
            receita.precoVendaPraticado
          );
          const atualizacoes = {
            itens,
            ...totais,
            precoVendaSugerido: lucro.precoSugerido,
            lucroPorUnidade: lucro.lucroPorUnidade,
            updatedAt: isTestStockMode ? new Date().toISOString() : serverTimestamp()
          };

          try {
            if (firestoreDb && !isTestStockMode && !receita.id.startsWith('local-') && !receita.id.startsWith('demo-')) {
              await updateDoc(doc(firestoreDb, 'receitas', receita.id), atualizacoes);
            }
            Object.assign(receita, atualizacoes);
            if (isTestStockMode) salvarDadosReceitasLocais();
            falhas += await atualizarReceitasDependentes(receita.id, visitadas);
          } catch (err) {
            falhas++;
            console.error(`Erro ao atualizar dependência da receita ${receita.id}:`, err);
          }
        }

        return falhas;
      }

export async function handleFormSubmit(e) {
        e.preventDefault();

        const categoria = dom.selectCategoriaInsumo.value || 'ingrediente';
        const nome = dom.inputNome.value.trim();
        const fornecedorSelecionado = dom.inputFornecedor.selectedOptions[0];
        const fornecedor = fornecedorSelecionado?.getAttribute('data-name') || '';
        const fornecedorId = fornecedorSelecionado?.getAttribute('data-supplier-id') || '';
        const grupoComparacao = dom.inputGrupoComparacao.value.trim();
        const marca = dom.inputMarcaInsumo.value.trim();
        const quantidade = parseFloat(dom.inputQuantidade.value);
        const unidade = dom.selectUnidade.value;
        const preco = parseFloat(dom.inputPreco.value);
        const estoqueAtual = parseFloat(dom.inputEstoqueAtual.value);
        const estoqueMinimo = parseFloat(dom.inputEstoqueMinimo.value);
        const conversoes = obterConversoesDoFormulario();

        if (!nome || !fornecedor || !grupoComparacao || isNaN(quantidade) || quantidade <= 0 || isNaN(preco) || preco <= 0 ||
            !Number.isFinite(estoqueAtual) || estoqueAtual < 0 ||
            !Number.isFinite(estoqueMinimo) || estoqueMinimo < 0) {
          showToast('Preencha todos os campos com valores válidos. O estoque atual e o mínimo não podem ser negativos.');
          return;
        }

        const custoUnitario = calcularCustoUnitario(preco, quantidade);

        const novoInsumo = {
          nome,
          fornecedor,
          fornecedorId: fornecedorId || null,
          grupoComparacao,
          ...(marca ? { marca } : {}),
          quantidade,
          unidade,
          preco,
          custoUnitario,
          categoria,
          estoqueAtual,
          estoqueMinimo,
          ...(conversoes ? { conversoes } : {})
        };
        const insumoExistente = editingInsumoId
          ? cachedInsumos.find(item => item.id === editingInsumoId)
          : null;

        try {
          dom.btnSubmitInsumo.disabled = true;
          dom.btnSubmitInsumo.innerHTML = '<span class="loading-spinner"></span> Salvando...';

          if (!firestoreDb && !isTestStockMode) {
            initFirebase();
          }

          if (editingInsumoId) {
            const atualizacoes = { ...novoInsumo, updatedAt: serverTimestamp() };
            if (firestoreDb && !isTestStockMode && !editingInsumoId.startsWith('local-') && !editingInsumoId.startsWith('demo-')) {
              await updateDoc(doc(firestoreDb, 'insumos', editingInsumoId), atualizacoes);
            }
            const insumoAtualizado = { ...insumoExistente, ...novoInsumo, id: editingInsumoId };
            const index = cachedInsumos.findIndex(item => item.id === editingInsumoId);
            if (index >= 0) cachedInsumos[index] = insumoAtualizado;
            if (!firestoreDb || isTestStockMode || editingInsumoId.startsWith('local-') || editingInsumoId.startsWith('demo-')) {
              salvarDadosInsumosLocais();
            }
            renderizarInsumos();
            renderizarFornecedores();
            atualizarSelectsInsumosParaReceitas();
            const falhas = await atualizarReceitasDoInsumo(insumoAtualizado);
            showToast(falhas
              ? `Insumo atualizado; não foi possível recalcular ${falhas} receita(s).`
              : `"${nome}" atualizado com sucesso!`);
          } else {
            const novoInsumoComMetadados = {
              ...novoInsumo,
              createdBy: currentUser?.uid || 'anon',
              createdByName: currentUser?.displayName || 'Padeiro',
              createdAt: serverTimestamp()
            };
            if (firestoreDb && !isTestStockMode) {
              await addDoc(collection(firestoreDb, 'insumos'), novoInsumoComMetadados);
              showToast(`"${nome}" gravado no Firestore com sucesso!`);
            } else {
              cachedInsumos.unshift({
                id: `${isTestStockMode ? 'demo-test-' : 'local-'}${Date.now()}`,
                ...novoInsumoComMetadados,
                createdAt: new Date().toISOString()
              });
              salvarDadosInsumosLocais();
              renderizarInsumos();
              renderizarFornecedores();
              atualizarSelectsInsumosParaReceitas();
              showToast(`"${nome}" cadastrado localmente.`);
            }
          }

          prepararNovoInsumo();
          dom.inputNome.focus();
        } catch (err) {
          console.error('Erro ao salvar insumo:', err);
          const errMsg = err?.message || '';
          if (errMsg.includes('permission-denied') || errMsg.includes('insufficient permissions')) {
            abrirModalRegrasFirestore();
            showToast('Erro de permissão no Firestore! Libere as regras no Firebase Console.');
          } else {
            showToast('Erro ao salvar: ' + errMsg);
          }
        } finally {
          dom.btnSubmitInsumo.disabled = false;
          dom.btnSubmitInsumo.innerHTML = editingInsumoId
            ? '<span>Salvar alterações</span>'
            : '<span>Salvar no Firestore</span>';
        }
      }

export function abrirModalExcluir(id, nome) {
        pendingDeleteId = id;
        dom.modalDeleteItemName.textContent = `"${nome}"`;
        dom.deleteModal.classList.add('active');
      }

export function fecharModalExcluir() {
        pendingDeleteId = null;
        dom.deleteModal.classList.remove('active');
      }

export async function confirmarExclusao() {
        if (!pendingDeleteId) return;
        const idToDelete = pendingDeleteId;

        try {
          dom.btnConfirmDelete.disabled = true;
          dom.btnConfirmDelete.innerHTML = '<span class="loading-spinner"></span> Excluindo...';

          const itemLocal = idToDelete.startsWith('local-') || idToDelete.startsWith('demo-');
          if (firestoreDb && !isTestStockMode && !itemLocal) {
              await deleteDoc(doc(firestoreDb, 'insumos', idToDelete));
              showToast('Insumo excluído do Firestore!');
          } else {
            cachedInsumos = cachedInsumos.filter(item => item.id !== idToDelete);
            salvarDadosInsumosLocais();
            renderizarInsumos();
            showToast('Insumo removido!');
          }
          fecharModalExcluir();
        } catch (err) {
          console.error('Erro ao excluir:', err);
          showToast('Erro ao excluir: ' + (err.message || 'Tente novamente'));
        } finally {
          dom.btnConfirmDelete.disabled = false;
          dom.btnConfirmDelete.innerHTML = 'Excluir Insumo';
        }
      }

      // -------------------------------------------------------------
      // 7. RENDERIZAÇÃO DA LISTAGEM DE INSUMOS & FILTROS POR GRUPO
      // -------------------------------------------------------------
export function renderizarInsumos() {
        const querySearch = dom.inputSearch.value.trim();
        
        // Atualiza contadores dos grupos
        const countTodos = cachedInsumos.length;
        const countIngr = cachedInsumos.filter(i => (i.categoria || 'ingrediente') === 'ingrediente').length;
        const countEmb = cachedInsumos.filter(i => i.categoria === 'embalagem').length;
        const countOutro = cachedInsumos.filter(i => i.categoria === 'outro').length;

        dom.countGroupTodos.textContent = countTodos;
        dom.countGroupIngrediente.textContent = countIngr;
        dom.countGroupEmbalagem.textContent = countEmb;
        dom.countGroupOutro.textContent = countOutro;
        dom.tabBadgeInsumos.textContent = countTodos;
        const estoqueBaixo = cachedInsumos.filter(isBelowMinimum);
        if (estoqueBaixo.length) {
          dom.stockAlertBanner.innerHTML = `
            <strong>⚠️ ${estoqueBaixo.length} ${estoqueBaixo.length === 1 ? 'insumo precisa' : 'insumos precisam'} de reposição</strong>
            <span>${estoqueBaixo.slice(0, 4).map(item =>
              `${escapeHtml(item.nome)} (${formatarQuantidadeEstoque(obterEstoqueAtual(item))} ${escapeHtml(item.unidade)})`
            ).join(' · ')}${estoqueBaixo.length > 4 ? ` · e mais ${estoqueBaixo.length - 4}` : ''}</span>`;
          dom.stockAlertBanner.classList.remove('hidden');
        } else {
          dom.stockAlertBanner.classList.add('hidden');
          dom.stockAlertBanner.textContent = '';
        }

        // Filtragem por grupo e busca
        let filtrados = cachedInsumos;
        if (activeGroupFilter !== 'todos') {
          filtrados = filtrados.filter(item => (item.categoria || 'ingrediente') === activeGroupFilter);
        }

        if (querySearch) {
          filtrados = filtrados.filter(item => 
            correspondeBusca(querySearch, [item.nome, item.fornecedor])
          );
        }

        dom.statTotalItems.textContent = cachedInsumos.length;
        dom.itemsCounter.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'item' : 'itens'}`;

        if (cachedInsumos.length > 0) {
          const totalCusto = cachedInsumos.reduce((acc, curr) => acc + (curr.custoUnitario || 0), 0);
          const media = totalCusto / cachedInsumos.length;
          dom.statAvgUnit.textContent = formatarMoeda(media, 2);
        } else {
          dom.statAvgUnit.textContent = 'R$ 0,00';
        }

        if (filtrados.length === 0) {
          dom.insumosContainer.innerHTML = '';
          const possuiFiltros = Boolean(querySearch) || activeGroupFilter !== 'todos';
          dom.emptyTitle.textContent = possuiFiltros ? 'Nenhum resultado encontrado' : 'Nenhum insumo cadastrado';
          dom.emptyDesc.textContent = possuiFiltros
            ? 'Tente outro termo ou remova os filtros para ver seus insumos.'
            : 'Comece cadastrando suas farinhas, fermentos, sacolas e formas para calcular o custo das receitas.';
          dom.btnEmptyAdd.classList.toggle('hidden', possuiFiltros);
          dom.btnEmptyClearFilters.classList.toggle('hidden', !possuiFiltros);
          dom.emptyState.classList.remove('hidden');
          return;
        }

        dom.emptyState.classList.add('hidden');

        function obterIcone(nome, cat) {
          if (cat === 'embalagem') return '🛍️';
          if (cat === 'outro') return '📦';
          const n = (nome || '').toLowerCase();
          if (n.includes('farinha') || n.includes('centeio') || n.includes('trigo')) return '🌾';
          if (n.includes('fermento') || n.includes('levain')) return '🧪';
          if (n.includes('sal')) return '🧂';
          if (n.includes('manteiga') || n.includes('leite') || n.includes('queijo')) return '🧈';
          if (n.includes('sacola')) return '🛍️';
          if (n.includes('forma')) return '📦';
          return '🥖';
        }

        function obterBadgeCategoria(cat) {
          if (cat === 'embalagem') {
            return `<span class="badge-category badge-cat-embalagem">🛍️ Embalagem / Forma</span>`;
          }
          if (cat === 'outro') {
            return `<span class="badge-category badge-cat-outro">📦 Outro Insumo</span>`;
          }
          return `<span class="badge-category badge-cat-ingrediente">🌾 Ingrediente</span>`;
        }

        const html = filtrados.map(item => {
          const cat = item.categoria || 'ingrediente';
          const icone = obterIcone(item.nome, cat);
          const badgeCat = obterBadgeCategoria(cat);
          const precoFormatado = formatarMoeda(item.preco);
          const custoFormatado = formatarCustoComUnidade(item.custoUnitario, item.unidade);
          const equivalencia = calcularEquivalenciaReceita(item.custoUnitario, item.unidade);
          const estoqueAtual = obterEstoqueAtual(item);
          const estoqueMinimo = Number(item.estoqueMinimo) || 0;
          const estoqueBaixo = isBelowMinimum(item);
          const dataCriacao = item.createdAt 
            ? (new Date(item.createdAt?.toDate ? item.createdAt.toDate() : item.createdAt)).toLocaleDateString('pt-BR') 
            : 'Recente';

          return `
            <article class="insumo-card" data-id="${item.id}">
              <div class="insumo-top">
                <div class="insumo-header-main">
                  <div class="insumo-icon-box" aria-hidden="true">${icone}</div>
                  <div class="insumo-name-wrap">
                    ${badgeCat}
                    <h4 class="insumo-nome">${escapeHtml(item.nome)}</h4>
                    <span class="insumo-fornecedor">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      </svg>
                      ${escapeHtml(item.fornecedor)}
                    </span>
                  </div>
                </div>
                <div class="item-card-actions">
                  <button
                    type="button"
                    class="btn-edit-item"
                    data-edit-id="${item.id}"
                    aria-label="Editar insumo ${escapeHtml(item.nome)}"
                    title="Editar insumo"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="btn-delete-item"
                    data-delete-id="${item.id}"
                    data-delete-name="${escapeHtml(item.nome)}"
                    aria-label="Excluir insumo ${escapeHtml(item.nome)}"
                    title="Excluir insumo"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Valores da Embalagem -->
              <div class="insumo-values">
                <div class="value-item">
                  <span class="value-caption">Embalagem</span>
                  <span class="value-text">${item.quantidade} ${item.unidade}</span>
                </div>
                <div class="value-item">
                  <span class="value-caption">Preço Pago</span>
                  <span class="value-text">${precoFormatado}</span>
                </div>
              </div>

              <div class="stock-level-card ${estoqueBaixo ? 'stock-level-low' : ''}">
                <div class="stock-level-value">
                  <span class="value-caption">Estoque atual</span>
                  <strong>${formatarQuantidadeEstoque(estoqueAtual)} ${escapeHtml(item.unidade)}</strong>
                </div>
                <div class="stock-level-value">
                  <span class="value-caption">Mínimo</span>
                  <strong>${formatarQuantidadeEstoque(estoqueMinimo)} ${escapeHtml(item.unidade)}</strong>
                </div>
                <span class="stock-level-status">${estoqueBaixo ? '⚠ Repor' : '✓ Em dia'}</span>
              </div>

              <!-- DESTAQUE DO CUSTO UNITÁRIO CALCULADO AUTOMATICAMENTE -->
              <div class="insumo-unit-badge">
                <div>
                  <span class="unit-badge-label">Custo Unitário:</span>
                  <div class="unit-badge-recipe-sub">${equivalencia}</div>
                </div>
                <span class="unit-badge-price">${custoFormatado}</span>
              </div>

              <div class="insumo-footer">
                <span>Cadastrado por: <strong>${escapeHtml(item.createdByName || 'Padeiro')}</strong></span>
                <span>${dataCriacao}</span>
              </div>
            </article>
          `;
        }).join('');

        dom.insumosContainer.innerHTML = html;
      }

export function setGroupFilter(grupo) {
        activeGroupFilter = grupo;
        const pills = dom.categoryPillsContainer.querySelectorAll('.category-pill');
        pills.forEach(pill => {
          const active = pill.getAttribute('data-group-filter') === grupo;
          pill.classList.toggle('active', active);
          pill.setAttribute('aria-pressed', String(active));
        });
        renderizarInsumos();
      }

