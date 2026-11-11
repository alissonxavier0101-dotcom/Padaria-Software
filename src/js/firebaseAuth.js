import { LOCAL_CONFIG_KEY, DEFAULT_FIREBASE_CONFIG, firebaseApp, firebaseAuth, firestoreDb, redirectResultChecked, isTestStockMode, currentUser, cachedInsumos, cachedReceitas, cachedRecipeGroups, cachedProducoes, cachedFornecedores, cachedVendas, cachedPedidos, cachedClientes, cachedCashflow, cachedFixedExpenses, unsubscribeSnapshot, unsubscribeReceitasSnapshot, unsubscribeRecipeGroupsSnapshot, unsubscribeProducoesSnapshot, unsubscribeFornecedoresSnapshot, unsubscribeVendasSnapshot, unsubscribePedidosSnapshot, unsubscribeClientesSnapshot, unsubscribeCashflowSnapshot, unsubscribeFixedExpensesSnapshot } from './state.js';
import { dom } from './dom.js';
import { showToast } from './helpers.js';
import { iniciarListenerFirestore } from './firestoreData.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword, GoogleAuthProvider, signOut, onAuthStateChanged, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function obterFirebaseConfig() {
        const saved = localStorage.getItem(LOCAL_CONFIG_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.apiKey && parsed.projectId && parsed.projectId === DEFAULT_FIREBASE_CONFIG.projectId) {
              return parsed;
            }
          } catch (e) {
            console.error('Erro ao ler config do Firebase', e);
          }
        }
        return DEFAULT_FIREBASE_CONFIG;
      }

export function salvarFirebaseConfig(cfg) {
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(cfg));
      }

export function initFirebase() {
        const cfg = obterFirebaseConfig();
        if (cfg && cfg.apiKey && cfg.projectId) {
          try {
            if (!firebaseApp) {
              firebaseApp = initializeApp(cfg);
            }
            if (!firebaseAuth) {
              firebaseAuth = getAuth(firebaseApp);
            }
            if (!firestoreDb) {
              firestoreDb = getFirestore(firebaseApp);
            }
            
            onAuthStateChanged(firebaseAuth, (user) => {
              if (user) {
                const authenticatedWithSupportedProvider = user.providerData.some(provider =>
                  provider.providerId === 'google.com' || provider.providerId === 'password'
                );
                if (!authenticatedWithSupportedProvider) {
                  onUserLoggedOut();
                  signOut(firebaseAuth).catch(error => {
                    console.error('Não foi possível encerrar uma sessão que não usa Google:', error);
                  });
                  showToast('Use uma conta Google ou usuário e senha cadastrados.');
                  return;
                }
                onUserLoggedIn({
                  uid: user.uid,
                  displayName: user.displayName || user.email?.split('@')[0] || 'Padeiro(a)',
                  email: user.email || '',
                  photoURL: user.photoURL || null
                });
                if (isTestStockMode) {
                  carregarDadosTeste();
                } else {
                  iniciarListenerFirestore();
                }
              } else {
                if (!currentUser) {
                  onUserLoggedOut();
                }
              }
            });

            if (!redirectResultChecked) {
              redirectResultChecked = true;
              getRedirectResult(firebaseAuth)
                .then(result => {
                  if (result?.user) showToast(`Bem-vindo(a), ${result.user.displayName || 'Padeiro'}!`);
                })
                .catch(tratarErroLoginGoogle);
            }

            dom.syncStatusLabel.textContent = 'Banco: padaria-sistema-6a6b4';
            dom.providerBadgeLabel.textContent = 'Firestore Conectado';
            return true;
          } catch (err) {
            console.warn('Não foi possível inicializar Firebase:', err);
          }
        }
        return false;
      }

      // -------------------------------------------------------------
      // 4. AUTENTICAÇÃO GOOGLE
      // -------------------------------------------------------------
export async function handleLoginGoogle(forceRedirect = false) {
        try {
          dom.loginGoogleText.innerHTML = '<span class="loading-spinner"></span> Conectando...';
          dom.btnLoginGoogle.disabled = true;
          dom.btnLoginGoogleRedirect.disabled = true;

          if (!firebaseAuth && !initFirebase()) {
            throw new Error('Não foi possível iniciar o Firebase. Verifique a configuração da conexão.');
          }

          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });

          if (forceRedirect) {
            await signInWithRedirect(firebaseAuth, provider);
            return;
          }

          let result;
          try {
            result = await signInWithPopup(firebaseAuth, provider);
          } catch (error) {
            const popupFallbackCodes = [
              'auth/popup-blocked',
              'auth/operation-not-supported-in-this-environment',
              'auth/cancelled-popup-request'
            ];
            if (popupFallbackCodes.includes(error?.code)) {
              showToast('O navegador bloqueou a janela de login. Permita pop-ups para este site ou tente “Continuar com Google”.');
              return;
            }
            throw error;
          }

          showToast(`Bem-vindo(a), ${result.user.displayName || 'Padeiro'}!`);
          iniciarListenerFirestore();
        } catch (error) {
          tratarErroLoginGoogle(error);
        } finally {
          dom.loginGoogleText.textContent = 'Entrar com Google';
          dom.btnLoginGoogle.disabled = false;
          dom.btnLoginGoogleRedirect.disabled = false;
        }
      }

export async function handleLoginWithPassword(event) {
        event.preventDefault();
        const identifier = dom.loginIdentifier.value.trim().toLowerCase();
        const password = dom.loginPassword.value;
        const email = identifier === 'robakery' ? 'robakery@adm.com' : identifier;

        if (!firebaseAuth && !initFirebase()) {
          showToast('Não foi possível iniciar o Firebase. Verifique a configuração da conexão.');
          return;
        }

        dom.btnLoginPassword.disabled = true;
        dom.btnLoginPassword.textContent = 'Conectando...';
        try {
          const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
          showToast(`Bem-vindo(a), ${result.user.displayName || result.user.email?.split('@')[0] || 'Padeiro'}!`);
        } catch (error) {
          console.error('Erro no login com usuário e senha:', error);
          if (error?.code === 'auth/invalid-credential' ||
              error?.code === 'auth/user-not-found' ||
              error?.code === 'auth/wrong-password') {
            showToast('Usuário/e-mail ou senha inválidos.');
          } else if (error?.code === 'auth/operation-not-allowed') {
            showToast('Ative o provedor E-mail/senha em Firebase > Authentication > Sign-in method.');
          } else if (error?.code === 'auth/invalid-email') {
            showToast('Informe um usuário ou e-mail válido.');
          } else if (error?.code === 'auth/network-request-failed') {
            showToast('Falha de rede ao conectar. Verifique sua conexão e tente novamente.');
          } else {
            showToast(`Não foi possível entrar${error?.code ? ` (${error.code})` : ''}. Tente novamente.`);
          }
        } finally {
          dom.btnLoginPassword.disabled = false;
          dom.btnLoginPassword.textContent = 'Entrar';
        }
      }

export function tratarErroLoginGoogle(error) {
        console.error('Erro no login com Google:', error);
        const errCode = error?.code || '';
        const errMsg = error?.message || '';

        if (errCode === 'auth/unauthorized-domain' || errMsg.includes('auth/unauthorized-domain') || errMsg.includes('unauthorized-domain')) {
          abrirModalDominioNaoAutorizado();
          showToast('Este domínio precisa ser autorizado no Firebase.');
        } else if (errCode === 'auth/popup-closed-by-user') {
          showToast('A janela de login foi fechada antes de concluir.');
        } else if (errCode === 'auth/operation-not-allowed') {
          abrirModalDominioNaoAutorizado();
          showToast('O login Google está desativado. Ative o provedor Google em Firebase > Authentication > Sign-in method.');
        } else if (errCode === 'auth/account-exists-with-different-credential') {
          showToast('Este e-mail já está cadastrado com outro método de login. Entre pelo método original ou peça ajuda ao administrador.');
        } else if (errCode === 'auth/network-request-failed') {
          showToast('Falha de rede ao conectar ao Google. Verifique sua conexão e tente novamente.');
        } else {
          showToast(`Não foi possível entrar com Google${errCode ? ` (${errCode})` : ''}: ${errMsg || 'tente novamente.'}`);
        }
      }

export function abrirModalDominioNaoAutorizado() {
        const host = window.location.hostname || 'localhost';
        if (dom.inputUnauthDomain) dom.inputUnauthDomain.value = host;
        if (dom.unauthorizedDomainModal) dom.unauthorizedDomainModal.classList.add('active');
      }

export function fecharModalDominioNaoAutorizado() {
        if (dom.unauthorizedDomainModal) dom.unauthorizedDomainModal.classList.remove('active');
      }

export function abrirModalRegrasFirestore() {
        if (dom.firestoreRulesModal) dom.firestoreRulesModal.classList.add('active');
      }

export function fecharModalRegrasFirestore() {
        if (dom.firestoreRulesModal) dom.firestoreRulesModal.classList.remove('active');
      }

export async function copiarDominio(btnElement) {
        const host = window.location.hostname || 'localhost';
        try {
          await navigator.clipboard.writeText(host);
          showToast(`Domínio "${host}" copiado para a área de transferência!`);
          if (btnElement) {
            const originalText = btnElement.textContent;
            btnElement.textContent = '✅ Copiado!';
            setTimeout(() => { btnElement.textContent = originalText; }, 2500);
          }
        } catch (e) {
          showToast(`Domínio: ${host}`);
        }
      }

export async function handleLogout() {
        pararListenersFirestore();

        if (firebaseAuth) {
          try {
            await signOut(firebaseAuth);
          } catch (e) {
            console.error('Erro ao sair:', e);
          }
        }
        onUserLoggedOut();
        showToast('Você saiu da sua conta.');
      }

export function onUserLoggedIn(user) {
        currentUser = user;
        dom.authScreen.classList.add('hidden');
        dom.appPanel.classList.remove('hidden');
        atualizarIndicadorModoEstoque();

        dom.headerUserName.textContent = user.displayName || 'Padeiro Artesanal';
        if (user.photoURL) {
          dom.headerUserPhoto.src = user.photoURL;
          dom.headerUserPhoto.classList.remove('hidden');
          dom.headerUserAvatarInitials.classList.add('hidden');
        } else {
          const initials = (user.displayName || 'Padeiro')
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'P';
          dom.headerUserAvatarInitials.textContent = initials;
          dom.headerUserAvatarInitials.classList.remove('hidden');
          dom.headerUserPhoto.classList.add('hidden');
        }
      }

export function onUserLoggedOut() {
        currentUser = null;
        isTestStockMode = false;
        cachedInsumos = [];
        cachedReceitas = [];
        cachedRecipeGroups = [];
        cachedProducoes = [];
        cachedFornecedores = [];
        cachedVendas = [];
        cachedPedidos = [];
        cachedClientes = [];
        cachedCashflow = [];
        cachedFixedExpenses = [];
        atualizarIndicadorModoEstoque();
        renderizarProducoes();
        renderizarFornecedores();
        renderizarGruposModeloReceita();
        renderizarVendas();
        renderizarPedidos();
        renderizarClientes();
        renderizarFinanceiro();
        dom.appPanel.classList.add('hidden');
        dom.authScreen.classList.remove('hidden');
      }

export function carregarDadosLocais() {
        try {
          const savedItems = localStorage.getItem(LOCAL_DEMO_ITEMS_KEY);
          const savedRecipes = localStorage.getItem(LOCAL_DEMO_RECEITAS_KEY);
          const savedRecipeGroups = localStorage.getItem(LOCAL_DEMO_RECIPE_GROUPS_KEY);
          const savedProductions = localStorage.getItem(LOCAL_DEMO_PRODUCOES_KEY);
          const savedSuppliers = localStorage.getItem(LOCAL_DEMO_SUPPLIERS_KEY);
          const savedSales = localStorage.getItem(LOCAL_DEMO_SALES_KEY);
          const savedOrders = localStorage.getItem(LOCAL_DEMO_ORDERS_KEY);
          const savedCustomers = localStorage.getItem(LOCAL_DEMO_CUSTOMERS_KEY);
          const savedCashflow = localStorage.getItem(LOCAL_DEMO_CASHFLOW_KEY);
          const savedFixedExpenses = localStorage.getItem(LOCAL_DEMO_FIXED_EXPENSES_KEY);
          cachedInsumos = savedItems ? JSON.parse(savedItems) : [...DEMO_SEED_INSUMOS];
          cachedReceitas = savedRecipes ? JSON.parse(savedRecipes) : [];
          cachedRecipeGroups = savedRecipeGroups ? JSON.parse(savedRecipeGroups) : [];
          cachedProducoes = savedProductions ? JSON.parse(savedProductions) : [];
          cachedFornecedores = savedSuppliers ? JSON.parse(savedSuppliers) : [];
          cachedVendas = savedSales ? JSON.parse(savedSales) : [];
          cachedPedidos = savedOrders ? JSON.parse(savedOrders) : [];
          cachedClientes = savedCustomers ? JSON.parse(savedCustomers) : [];
          cachedCashflow = savedCashflow ? JSON.parse(savedCashflow) : [];
          cachedFixedExpenses = savedFixedExpenses ? JSON.parse(savedFixedExpenses) : [];
          renderizarInsumos();
          atualizarSelectFornecedores();
          atualizarSelectsInsumosParaReceitas();
          renderizarGruposModeloReceita();
          renderizarFornecedores();
          renderizarReceitas();
          renderizarProducoes();
          atualizarSelectProdutos();
          atualizarSelectClientes();
          renderizarVendas();
          renderizarPedidos();
          renderizarClientes();
          renderizarFinanceiro();
        } catch (error) {
          console.error('Erro ao carregar dados locais da padaria:', error);
          showToast('Não foi possível carregar o estoque salvo neste dispositivo.');
        }
      }

export function pararListenersFirestore() {
        [
          unsubscribeSnapshot,
          unsubscribeReceitasSnapshot,
          unsubscribeRecipeGroupsSnapshot,
          unsubscribeProducoesSnapshot,
          unsubscribeFornecedoresSnapshot,
          unsubscribeVendasSnapshot,
          unsubscribePedidosSnapshot,
          unsubscribeClientesSnapshot,
          unsubscribeCashflowSnapshot,
          unsubscribeFixedExpensesSnapshot
        ].forEach(unsubscribe => {
          if (unsubscribe) unsubscribe();
        });
        unsubscribeSnapshot = null;
        unsubscribeReceitasSnapshot = null;
        unsubscribeRecipeGroupsSnapshot = null;
        unsubscribeProducoesSnapshot = null;
        unsubscribeFornecedoresSnapshot = null;
        unsubscribeVendasSnapshot = null;
        unsubscribePedidosSnapshot = null;
        unsubscribeClientesSnapshot = null;
        unsubscribeCashflowSnapshot = null;
        unsubscribeFixedExpensesSnapshot = null;
      }

export function carregarDadosTeste() {
        try {
          const savedItems = localStorage.getItem(TEST_ITEMS_KEY);
          const savedRecipes = localStorage.getItem(TEST_RECIPES_KEY);
          const savedRecipeGroups = localStorage.getItem(TEST_RECIPE_GROUPS_KEY);
          const savedProductions = localStorage.getItem(TEST_PRODUCTIONS_KEY);
          const savedSuppliers = localStorage.getItem(TEST_SUPPLIERS_KEY);
          const savedSales = localStorage.getItem(TEST_SALES_KEY);
          const savedOrders = localStorage.getItem(TEST_ORDERS_KEY);
          const savedCustomers = localStorage.getItem(TEST_CUSTOMERS_KEY);
          const savedCashflow = localStorage.getItem(TEST_CASHFLOW_KEY);
          const savedFixedExpenses = localStorage.getItem(TEST_FIXED_EXPENSES_KEY);
          cachedInsumos = savedItems ? JSON.parse(savedItems) : JSON.parse(JSON.stringify(DEMO_SEED_INSUMOS));
          cachedReceitas = savedRecipes ? JSON.parse(savedRecipes) : JSON.parse(JSON.stringify(DEMO_SEED_RECEITAS));
          cachedRecipeGroups = savedRecipeGroups ? JSON.parse(savedRecipeGroups) : [];
          cachedProducoes = savedProductions ? JSON.parse(savedProductions) : [];
          cachedFornecedores = savedSuppliers ? JSON.parse(savedSuppliers) : [];
          cachedVendas = savedSales ? JSON.parse(savedSales) : [];
          cachedPedidos = savedOrders ? JSON.parse(savedOrders) : [];
          cachedClientes = savedCustomers ? JSON.parse(savedCustomers) : [];
          cachedCashflow = savedCashflow ? JSON.parse(savedCashflow) : [];
          cachedFixedExpenses = savedFixedExpenses ? JSON.parse(savedFixedExpenses) : [];
          renderizarInsumos();
          atualizarSelectFornecedores();
          atualizarSelectsInsumosParaReceitas();
          renderizarGruposModeloReceita();
          renderizarFornecedores();
          renderizarReceitas();
          renderizarProducoes();
          atualizarSelectProdutos();
          atualizarSelectClientes();
          renderizarVendas();
          renderizarPedidos();
          renderizarClientes();
          renderizarFinanceiro();
          atualizarIndicadorModoEstoque();
        } catch (error) {
          console.error('Erro ao carregar os dados de teste:', error);
          showToast('Não foi possível carregar o estoque de testes salvo neste dispositivo.');
        }
      }

export function salvarDadosInsumosLocais() {
        localStorage.setItem(isTestStockMode ? TEST_ITEMS_KEY : LOCAL_DEMO_ITEMS_KEY, JSON.stringify(cachedInsumos));
      }

export function salvarDadosReceitasLocais() {
        localStorage.setItem(isTestStockMode ? TEST_RECIPES_KEY : LOCAL_DEMO_RECEITAS_KEY, JSON.stringify(cachedReceitas));
      }

export function salvarDadosProducoesLocais() {
        localStorage.setItem(isTestStockMode ? TEST_PRODUCTIONS_KEY : LOCAL_DEMO_PRODUCOES_KEY, JSON.stringify(cachedProducoes));
      }

export function salvarDadosFornecedoresLocais() {
        localStorage.setItem(isTestStockMode ? TEST_SUPPLIERS_KEY : LOCAL_DEMO_SUPPLIERS_KEY, JSON.stringify(cachedFornecedores));
      }

export function atualizarIndicadorModoEstoque() {
        const test = isTestStockMode;
        dom.btnStockModeTest.setAttribute('aria-pressed', String(test));
        dom.btnStockModeReal.setAttribute('aria-pressed', String(!test));
        dom.stockModeDescription.textContent = test
          ? 'Dados de teste isolados neste dispositivo; não altera o estoque real.'
          : firestoreDb
            ? 'Dados sincronizados da padaria.'
            : 'Modo local: dados reais salvos neste dispositivo.';
        if (test) {
          dom.syncStatusLabel.textContent = 'Modo de testes isolado';
          dom.providerBadgeLabel.textContent = 'Dados de teste';
        } else if (!firestoreDb) {
          dom.syncStatusLabel.textContent = 'Dados salvos neste dispositivo';
          dom.providerBadgeLabel.textContent = 'Modo local';
        } else {
          dom.syncStatusLabel.textContent = 'Firestore em Tempo Real';
          dom.providerBadgeLabel.textContent = 'Firestore Conectado';
        }
      }

export function alterarModoEstoque(test) {
        if (test === isTestStockMode) return;
        pararListenersFirestore();
        isTestStockMode = test;
        if (test) {
          carregarDadosTeste();
          showToast('Modo de testes ativado. O estoque real permanece protegido.');
        } else if (firestoreDb && currentUser) {
          cachedInsumos = [];
          cachedReceitas = [];
          cachedRecipeGroups = [];
          cachedProducoes = [];
          cachedFornecedores = [];
          cachedVendas = [];
          cachedPedidos = [];
          cachedClientes = [];
          cachedCashflow = [];
          cachedFixedExpenses = [];
          renderizarInsumos();
          renderizarFornecedores();
          renderizarReceitas();
          renderizarGruposModeloReceita();
          renderizarProducoes();
          atualizarSelectProdutos();
          atualizarSelectClientes();
          renderizarVendas();
          renderizarPedidos();
          renderizarClientes();
          renderizarFinanceiro();
          iniciarListenerFirestore();
          atualizarIndicadorModoEstoque();
          showToast('Modo real ativado. Carregando dados sincronizados.');
        } else {
          carregarDadosLocais();
          atualizarIndicadorModoEstoque();
          showToast('Modo real local ativado.');
        }
      }

