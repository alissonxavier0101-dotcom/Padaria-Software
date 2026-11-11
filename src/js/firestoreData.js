import { isTestStockMode, firestoreDb, unsubscribeSnapshot, unsubscribeReceitasSnapshot, unsubscribeRecipeGroupsSnapshot, unsubscribeProducoesSnapshot, unsubscribeFornecedoresSnapshot, unsubscribeVendasSnapshot, unsubscribePedidosSnapshot, unsubscribeClientesSnapshot, unsubscribeCashflowSnapshot, unsubscribeFixedExpensesSnapshot, cachedInsumos, cachedReceitas, cachedRecipeGroups, cachedProducoes, cachedFornecedores, cachedVendas, cachedPedidos, cachedClientes, cachedCashflow, cachedFixedExpenses, LOCAL_CONFIG_KEY, LOCAL_DEMO_ITEMS_KEY, LOCAL_DEMO_RECEITAS_KEY, LOCAL_DEMO_RECIPE_GROUPS_KEY, LOCAL_DEMO_PRODUCOES_KEY, LOCAL_DEMO_SUPPLIERS_KEY, LOCAL_DEMO_SALES_KEY, LOCAL_DEMO_ORDERS_KEY, LOCAL_DEMO_CUSTOMERS_KEY, LOCAL_DEMO_CASHFLOW_KEY, LOCAL_DEMO_FIXED_EXPENSES_KEY } from './state.js';
import { dom } from './dom.js';
import { showToast, calcularCustoUnitario } from './helpers.js';
import { initFirebase, abrirModalRegrasFirestore } from './firebaseAuth.js';
import { renderizarInsumos } from './insumos.js';
import { renderizarReceitas, renderizarFinanceiro, renderizarGruposModeloReceita, renderizarProducoes, renderizarVendas, renderizarClientes, renderizarPedidos, atualizarSelectClientes, atualizarSelectsInsumosParaReceitas } from './receitas.js';
import { collection, onSnapshot, doc, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function iniciarListenerFirestore() {
        if (isTestStockMode) return;
        if (!firestoreDb) {
          initFirebase();
        }
        if (!firestoreDb) return;

        // Listener da coleção de Insumos
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }

        try {
          const insumosColl = collection(firestoreDb, 'insumos');
          unsubscribeSnapshot = onSnapshot(insumosColl, (snapshot) => {
            if (isTestStockMode) return;
            const itens = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              itens.push({
                id: docSnap.id,
                ...data,
                custoUnitario: data.custoUnitario !== undefined 
                  ? Number(data.custoUnitario) 
                  : calcularCustoUnitario(data.preco, data.quantidade),
                categoria: data.categoria || 'ingrediente'
              });
            });

            itens.sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
              return dateB - dateA;
            });

            cachedInsumos = itens;
            renderizarInsumos();
            atualizarSelectFornecedores();
            atualizarSelectsInsumosParaReceitas();
            renderizarFornecedores();
            if (dom.syncStatusLabel) {
              dom.syncStatusLabel.textContent = `Firestore: ${itens.length} insumos • ${cachedReceitas.length} receitas`;
            }
          }, (error) => {
            console.error('Erro no snapshot do Firestore:', error);
            const msg = error?.message || '';
            if (msg.includes('permission-denied') || msg.includes('insufficient permissions')) {
              abrirModalRegrasFirestore();
              showToast('Permissão pendente no Firestore: configure as regras de segurança.');
            }
          });
        } catch (err) {
          console.error('Falha ao conectar insumos no Firestore:', err);
        }

        // Listener da coleção de Receitas
        iniciarListenerFornecedores();
        iniciarListenerReceitas();
        iniciarListenerGruposReceita();
        iniciarListenerProducoes();
        iniciarListenerVendas();
        iniciarListenerPedidos();
        iniciarListenerClientes();
        iniciarListenerCashflow();
        iniciarListenerDespesasFixas();
      }

export function iniciarListenerFornecedores() {
        if (!firestoreDb) return;
        if (unsubscribeFornecedoresSnapshot) {
          unsubscribeFornecedoresSnapshot();
          unsubscribeFornecedoresSnapshot = null;
        }

        try {
          unsubscribeFornecedoresSnapshot = onSnapshot(collection(firestoreDb, 'fornecedores'), (snapshot) => {
            if (isTestStockMode) return;
            cachedFornecedores = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedFornecedores.sort((left, right) => String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR'));
            atualizarSelectFornecedores();
            renderizarFornecedores();
          }, (error) => {
            console.error('Erro ao carregar fornecedores:', error);
            if (error?.code === 'permission-denied') {
              abrirModalRegrasFirestore();
              showToast('Publique as regras atualizadas do Firestore para usar o cadastro de fornecedores.');
            }
          });
        } catch (error) {
          console.error('Falha ao conectar fornecedores no Firestore:', error);
          showToast('Não foi possível carregar o cadastro de fornecedores.');
        }
      }

export function iniciarListenerReceitas() {
        if (!firestoreDb) return;
        if (unsubscribeReceitasSnapshot) {
          unsubscribeReceitasSnapshot();
          unsubscribeReceitasSnapshot = null;
        }

        try {
          const receitasColl = collection(firestoreDb, 'receitas');
          unsubscribeReceitasSnapshot = onSnapshot(receitasColl, (snapshot) => {
            if (isTestStockMode) return;
            const receitas = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              receitas.push({
                id: docSnap.id,
                ...data,
                itens: data.itens || []
              });
            });

            receitas.sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
              return dateB - dateA;
            });

            cachedReceitas = receitas;
            atualizarSelectsInsumosParaReceitas();
            atualizarSelectProdutos();
            renderizarReceitas();
            renderizarFinanceiro();
            if (dom.syncStatusLabel) {
              dom.syncStatusLabel.textContent = `Firestore: ${cachedInsumos.length} insumos • ${receitas.length} receitas`;
            }
          }, (error) => {
            console.error('Erro no snapshot de receitas:', error);
          });
        } catch (err) {
          console.error('Falha ao conectar receitas no Firestore:', err);
        }
      }

export function iniciarListenerGruposReceita() {
        if (!firestoreDb) return;
        if (unsubscribeRecipeGroupsSnapshot) {
          unsubscribeRecipeGroupsSnapshot();
          unsubscribeRecipeGroupsSnapshot = null;
        }
        try {
          unsubscribeRecipeGroupsSnapshot = onSnapshot(collection(firestoreDb, 'gruposReceita'), snapshot => {
            if (isTestStockMode) return;
            cachedRecipeGroups = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedRecipeGroups.sort((left, right) => String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR'));
            renderizarGruposModeloReceita();
          }, error => {
            console.error('Erro ao carregar grupos de ingredientes:', error);
            if (error?.code === 'permission-denied') {
              abrirModalRegrasFirestore();
              showToast('Publique as regras atualizadas do Firestore para usar os grupos de ingredientes.');
            } else {
              showToast('Não foi possível carregar os grupos de ingredientes.');
            }
          });
        } catch (error) {
          console.error('Falha ao conectar o catálogo de grupos:', error);
          showToast('Não foi possível conectar o catálogo de grupos.');
        }
      }

export function iniciarListenerProducoes() {
        if (!firestoreDb) return;
        if (unsubscribeProducoesSnapshot) {
          unsubscribeProducoesSnapshot();
          unsubscribeProducoesSnapshot = null;
        }

        try {
          unsubscribeProducoesSnapshot = onSnapshot(collection(firestoreDb, 'producoes'), (snapshot) => {
            if (isTestStockMode) return;
            cachedProducoes = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedProducoes.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
            renderizarProducoes();
          }, (error) => {
            console.error('Erro no snapshot de produções:', error);
            if (error?.code === 'permission-denied') {
              showToast('Sem permissão para consultar o histórico de produção.');
            }
          });
        } catch (error) {
          console.error('Falha ao conectar o histórico de produção:', error);
          showToast('Não foi possível carregar o histórico de produção.');
        }
      }

export function iniciarListenerVendas() {
        if (!firestoreDb) return;
        if (unsubscribeVendasSnapshot) unsubscribeVendasSnapshot();
        try {
          unsubscribeVendasSnapshot = onSnapshot(collection(firestoreDb, 'vendas'), (snapshot) => {
            if (isTestStockMode) return;
            cachedVendas = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedVendas.sort((left, right) => String(right.data || '').localeCompare(String(left.data || '')));
            renderizarVendas();
            renderizarClientes();
            renderizarFinanceiro();
          }, (error) => {
            console.error('Erro ao carregar vendas:', error);
            if (error?.code === 'permission-denied') abrirModalRegrasFirestore();
            showToast('Não foi possível carregar as vendas. Verifique as regras do Firestore.');
          });
        } catch (error) {
          console.error('Falha ao conectar vendas no Firestore:', error);
          showToast('Não foi possível conectar o histórico de vendas.');
        }
      }

export function iniciarListenerPedidos() {
        if (!firestoreDb) return;
        if (unsubscribePedidosSnapshot) unsubscribePedidosSnapshot();
        try {
          unsubscribePedidosSnapshot = onSnapshot(collection(firestoreDb, 'pedidos'), (snapshot) => {
            if (isTestStockMode) return;
            cachedPedidos = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedPedidos.sort((left, right) => String(left.dataEntrega || '').localeCompare(String(right.dataEntrega || '')));
            renderizarPedidos();
          }, (error) => {
            console.error('Erro ao carregar encomendas:', error);
            if (error?.code === 'permission-denied') abrirModalRegrasFirestore();
            showToast('Não foi possível carregar as encomendas. Verifique as regras do Firestore.');
          });
        } catch (error) {
          console.error('Falha ao conectar encomendas no Firestore:', error);
          showToast('Não foi possível conectar o histórico de encomendas.');
        }
      }

export function iniciarListenerClientes() {
        if (!firestoreDb) return;
        if (unsubscribeClientesSnapshot) unsubscribeClientesSnapshot();
        try {
          unsubscribeClientesSnapshot = onSnapshot(collection(firestoreDb, 'clientes'), (snapshot) => {
            if (isTestStockMode) return;
            cachedClientes = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedClientes.sort((left, right) => String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR'));
            atualizarSelectClientes();
            renderizarClientes();
            renderizarVendas();
          }, (error) => {
            console.error('Erro ao carregar clientes:', error);
            if (error?.code === 'permission-denied') abrirModalRegrasFirestore();
            showToast('Não foi possível carregar os clientes. Verifique as regras do Firestore.');
          });
        } catch (error) {
          console.error('Falha ao conectar clientes no Firestore:', error);
          showToast('Não foi possível conectar o cadastro de clientes.');
        }
      }

export function iniciarListenerCashflow() {
        if (!firestoreDb) return;
        if (unsubscribeCashflowSnapshot) unsubscribeCashflowSnapshot();
        try {
          unsubscribeCashflowSnapshot = onSnapshot(collection(firestoreDb, 'movimentacoesFinanceiras'), (snapshot) => {
            if (isTestStockMode) return;
            cachedCashflow = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedCashflow.sort((left, right) => String(right.data || '').localeCompare(String(left.data || '')));
            renderizarFinanceiro();
          }, (error) => {
            console.error('Erro ao carregar o fluxo de caixa:', error);
            if (error?.code === 'permission-denied') abrirModalRegrasFirestore();
            showToast('Não foi possível carregar o fluxo de caixa. Verifique as regras do Firestore.');
          });
        } catch (error) {
          console.error('Falha ao conectar o fluxo de caixa no Firestore:', error);
          showToast('Não foi possível conectar o fluxo de caixa.');
        }
      }

export function iniciarListenerDespesasFixas() {
        if (!firestoreDb) return;
        if (unsubscribeFixedExpensesSnapshot) unsubscribeFixedExpensesSnapshot();
        try {
          unsubscribeFixedExpensesSnapshot = onSnapshot(collection(firestoreDb, 'despesasFixas'), (snapshot) => {
            if (isTestStockMode) return;
            cachedFixedExpenses = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            cachedFixedExpenses.sort((left, right) => String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR'));
            renderizarFinanceiro();
          }, (error) => {
            console.error('Erro ao carregar despesas fixas:', error);
            if (error?.code === 'permission-denied') abrirModalRegrasFirestore();
            showToast('Não foi possível carregar as despesas fixas. Verifique as regras do Firestore.');
          });
        } catch (error) {
          console.error('Falha ao conectar despesas fixas no Firestore:', error);
          showToast('Não foi possível conectar as despesas fixas.');
        }
      }

export function obterFornecedoresDisponiveis() {
        const fornecedores = [...cachedFornecedores];
        const nomesCadastrados = new Set(fornecedores.map(item => normalizeComparisonName(item.nome || '')));
        const nomesLegados = new Map();
        cachedInsumos.forEach(item => {
          const nome = String(item.fornecedor || '').trim();
          const chave = normalizeComparisonName(nome);
          const fornecedorVinculado = item.fornecedorId && fornecedores.some(supplier => supplier.id === item.fornecedorId);
          if (nome && chave && !fornecedorVinculado && !nomesCadastrados.has(chave) && !nomesLegados.has(chave)) {
            nomesLegados.set(chave, { id: `legacy:${encodeURIComponent(nome)}`, nome, legado: true });
          }
        });
        return [...fornecedores, ...nomesLegados.values()];
      }

export function obterFornecedorDoInsumo(insumo) {
        return cachedFornecedores.find(item => insumo.fornecedorId && item.id === insumo.fornecedorId) ||
          cachedFornecedores.find(item =>
            normalizeComparisonName(item.nome || '') === normalizeComparisonName(insumo.fornecedor || '')
          ) || null;
      }

export function atualizarSelectFornecedores() {
        if (!dom.inputFornecedor) return;
        const selecionado = dom.inputFornecedor.value;
        const fornecedores = obterFornecedoresDisponiveis();
        dom.inputFornecedor.innerHTML = '<option value="">Selecione um fornecedor...</option>' +
          fornecedores.map(fornecedor => {
            const id = String(fornecedor.id || '');
            const optionValue = fornecedor.legado ? id : `supplier:${id}`;
            const suffix = fornecedor.legado ? ' (cadastro antigo)' : '';
            return `<option value="${escapeHtml(optionValue)}" data-name="${escapeHtml(fornecedor.nome)}" data-supplier-id="${escapeHtml(fornecedor.legado ? '' : id)}">${escapeHtml(fornecedor.nome)}${suffix}</option>`;
          }).join('');
        if (fornecedores.some(item => item.id === selecionado)) {
          dom.inputFornecedor.value = selecionado;
        } else if (selecionado.startsWith('supplier:') || selecionado.startsWith('legacy:')) {
          dom.inputFornecedor.value = selecionado;
        }
      }

export function renderizarFornecedores() {
        if (!dom.suppliersContainer) return;
        const fornecedores = obterFornecedoresDisponiveis();
        dom.suppliersCounter.textContent = `${fornecedores.length} ${fornecedores.length === 1 ? 'fornecedor' : 'fornecedores'}`;
        dom.tabBadgeFornecedores.textContent = fornecedores.length;

        if (fornecedores.length === 0) {
          dom.suppliersContainer.innerHTML = '<p class="empty-desc">Nenhum fornecedor cadastrado. Cadastre um fornecedor para associar ofertas e registrar contatos.</p>';
        } else {
          dom.suppliersContainer.innerHTML = fornecedores.map(fornecedor => {
            if (fornecedor.legado) {
              return `<article class="insumo-card">
                <div class="insumo-top"><div class="insumo-name-wrap">
                  <h4 class="insumo-nome">${escapeHtml(fornecedor.nome)}</h4>
                  <span class="calc-detail">Encontrado nos insumos existentes. Cadastre a ficha para adicionar contato.</span>
                </div></div>
                <button class="btn-secondary" type="button" data-register-legacy-supplier="${escapeHtml(fornecedor.nome)}">Adicionar contato</button>
              </article>`;
            }
            return `<article class="insumo-card">
              <div class="insumo-top"><div class="insumo-name-wrap">
                <h4 class="insumo-nome">${escapeHtml(fornecedor.nome)}</h4>
                <span class="insumo-fornecedor">${escapeHtml(fornecedor.telefone || 'Sem telefone')}
                  ${fornecedor.email ? ` · ${escapeHtml(fornecedor.email)}` : ''}
                </span>
                ${fornecedor.observacoes ? `<span class="calc-detail">${escapeHtml(fornecedor.observacoes)}</span>` : ''}
              </div><button class="btn-secondary" type="button" data-edit-supplier-id="${escapeHtml(fornecedor.id)}">Editar</button></div>
            </article>`;
          }).join('');
        }

        renderizarComparativoIngredientes();
      }

export function renderizarComparativoIngredientes() {
        const groups = compareSupplierOffers(cachedInsumos);
        if (groups.length === 0) {
          dom.priceComparisonContainer.innerHTML = '<p class="empty-desc">Cadastre ofertas de insumos para comparar preços.</p>';
          return;
        }

        const query = normalizeComparisonName(dom.priceComparisonSearch.value);
        if (!query) {
          dom.priceComparisonContainer.innerHTML = '<p class="empty-desc">Digite o nome de um ingrediente para consultar o comparativo de preços.</p>';
          return;
        }

        const matchingGroups = groups.filter(group => normalizeComparisonName(group.nome).includes(query));
        if (matchingGroups.length === 0) {
          dom.priceComparisonContainer.innerHTML = '<p class="empty-desc">Nenhum comparativo encontrado para essa pesquisa.</p>';
          return;
        }

        dom.priceComparisonContainer.innerHTML = matchingGroups.map(group => `
          <section class="recipe-builder-box" style="margin-bottom: 12px;">
            <div class="section-heading">
              <div>
                <h4 class="section-title">${escapeHtml(group.nome)}</h4>
                <p class="section-subtitle">Comparação em R$ / ${escapeHtml(group.baseUnit)} · ${group.offers.length} ${group.offers.length === 1 ? 'oferta' : 'ofertas'}</p>
              </div>
              <strong>${formatarMoeda(group.offers[0].pricePerBaseUnit, 4)} / ${escapeHtml(group.baseUnit)}</strong>
            </div>
            ${group.offers.map((entry, index) => {
              const offer = entry.offer;
              const supplier = obterFornecedorDoInsumo(offer);
              return `<div class="insumo-values" style="margin-top: 8px; ${index === 0 ? 'border: 1px solid var(--wheat-accent);' : ''}">
                <div class="value-item">
                  <span class="value-caption">${index === 0 ? '⭐ Menor custo' : 'Oferta'}</span>
                  <span class="value-text">${escapeHtml(offer.nome)}${offer.marca ? ` · ${escapeHtml(offer.marca)}` : ''}</span>
                </div>
                <div class="value-item"><span class="value-caption">Fornecedor</span><span class="value-text">${escapeHtml(supplier?.nome || offer.fornecedor || 'Não informado')}</span></div>
                <div class="value-item"><span class="value-caption">Embalagem</span><span class="value-text">${formatarMoeda(offer.preco, 2)} / ${offer.quantidade} ${escapeHtml(offer.unidade)}</span></div>
                <div class="value-item"><span class="value-caption">Custo comparável</span><span class="value-text">${formatarMoeda(entry.pricePerBaseUnit, 4)} / ${escapeHtml(entry.baseUnit)}</span></div>
              </div>`;
            }).join('')}
          </section>
        `).join('');
      }

export function prepararNovoFornecedor(nome = '') {
        editingFornecedorId = null;
        dom.formFornecedor.reset();
        dom.inputNomeFornecedor.value = nome;
        dom.supplierFormTitle.textContent = '🏷️ Cadastrar fornecedor';
        dom.btnSubmitSupplier.textContent = 'Salvar fornecedor';
        dom.btnCancelEditSupplier.classList.add('hidden');
      }

export function abrirEdicaoFornecedor(id) {
        const fornecedor = cachedFornecedores.find(item => item.id === id);
        if (!fornecedor) return;
        editingFornecedorId = id;
        dom.inputNomeFornecedor.value = fornecedor.nome || '';
        dom.inputTelefoneFornecedor.value = fornecedor.telefone || '';
        dom.inputEmailFornecedor.value = fornecedor.email || '';
        dom.inputObservacaoFornecedor.value = fornecedor.observacoes || '';
        dom.supplierFormTitle.textContent = '✏️ Editar fornecedor';
        dom.btnSubmitSupplier.textContent = 'Salvar alterações';
        dom.btnCancelEditSupplier.classList.remove('hidden');
        dom.inputNomeFornecedor.focus();
      }

export async function handleFormFornecedorSubmit(event) {
        event.preventDefault();
        const nome = dom.inputNomeFornecedor.value.trim();
        const fornecedorExistente = cachedFornecedores.find(item =>
          normalizeComparisonName(item.nome || '') === normalizeComparisonName(nome) &&
          item.id !== editingFornecedorId
        );
        if (fornecedorExistente) {
          showToast('Já existe um fornecedor cadastrado com esse nome.');
          return;
        }

        const dadosFornecedor = {
          nome,
          telefone: dom.inputTelefoneFornecedor.value.trim(),
          email: dom.inputEmailFornecedor.value.trim(),
          observacoes: dom.inputObservacaoFornecedor.value.trim()
        };

        try {
          dom.btnSubmitSupplier.disabled = true;
          if (!firestoreDb && !isTestStockMode) initFirebase();
          if (editingFornecedorId) {
            const atualizacoes = { ...dadosFornecedor, updatedAt: isTestStockMode ? new Date().toISOString() : serverTimestamp() };
            const index = cachedFornecedores.findIndex(item => item.id === editingFornecedorId);
            if (firestoreDb && !isTestStockMode && !editingFornecedorId.startsWith('local-supplier-')) {
              await updateDoc(doc(firestoreDb, 'fornecedores', editingFornecedorId), atualizacoes);
            }
            if (index >= 0) cachedFornecedores[index] = { ...cachedFornecedores[index], ...dadosFornecedor };
            if (!firestoreDb || isTestStockMode || editingFornecedorId.startsWith('local-supplier-')) salvarDadosFornecedoresLocais();
            showToast(`Fornecedor "${nome}" atualizado.`);
          } else {
            const novoFornecedor = {
              ...dadosFornecedor,
              createdBy: currentUser?.uid || 'anon',
              createdByName: currentUser?.displayName || 'Padeiro',
              createdAt: isTestStockMode || !firestoreDb ? new Date().toISOString() : serverTimestamp()
            };
            if (firestoreDb && !isTestStockMode) {
              const reference = await addDoc(collection(firestoreDb, 'fornecedores'), novoFornecedor);
              cachedFornecedores.push({ id: reference.id, ...dadosFornecedor });
            } else {
              cachedFornecedores.push({ id: `local-supplier-${Date.now()}`, ...novoFornecedor });
              salvarDadosFornecedoresLocais();
            }
            showToast(`Fornecedor "${nome}" cadastrado.`);
          }
          prepararNovoFornecedor();
          atualizarSelectFornecedores();
          renderizarFornecedores();
        } catch (error) {
          console.error('Erro ao salvar fornecedor:', error);
          showToast(`Erro ao salvar fornecedor: ${error?.message || 'Tente novamente.'}`);
        } finally {
          dom.btnSubmitSupplier.disabled = false;
        }
      }

      // -------------------------------------------------------------
      // 6. CADASTRO DE INSUMOS & EMBALAGENS COM GRUPOS
      // -------------------------------------------------------------
