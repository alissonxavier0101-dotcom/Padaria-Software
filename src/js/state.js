export const DEFAULT_FIREBASE_CONFIG = {
        apiKey: "AIzaSyBCoNYJK6tz2T_NBUoLlK0wZ_1VXk5pk9M",
        authDomain: "padaria-sistema-6a6b4.firebaseapp.com",
        projectId: "padaria-sistema-6a6b4",
        storageBucket: "padaria-sistema-6a6b4.firebasestorage.app",
        messagingSenderId: "533035979944",
        appId: "1:533035979944:web:6cf527cfc1a604dc559e9d",
        measurementId: "G-8N97KKVB2X",
        firestoreDatabaseId: "(default)"
      };

export const LOCAL_CONFIG_KEY = 'paniscustos_firebase_config';
export const LOCAL_DEMO_ITEMS_KEY = 'paniscustos_demo_items';
export const LOCAL_DEMO_RECEITAS_KEY = 'paniscustos_demo_receitas';
export const LOCAL_DEMO_RECIPE_GROUPS_KEY = 'paniscustos_demo_recipe_groups';
export const LOCAL_DEMO_PRODUCOES_KEY = 'paniscustos_demo_producoes';
export const LOCAL_DEMO_SUPPLIERS_KEY = 'paniscustos_demo_suppliers';
export const LOCAL_DEMO_SALES_KEY = 'paniscustos_demo_sales';
export const LOCAL_DEMO_ORDERS_KEY = 'paniscustos_demo_orders';
export const LOCAL_DEMO_CUSTOMERS_KEY = 'paniscustos_demo_customers';
export const LOCAL_DEMO_CASHFLOW_KEY = 'paniscustos_demo_cashflow';
export const LOCAL_DEMO_FIXED_EXPENSES_KEY = 'paniscustos_demo_fixed_expenses';
export const TEST_ITEMS_KEY = 'paniscustos_test_items';
export const TEST_RECIPES_KEY = 'paniscustos_test_recipes';
export const TEST_RECIPE_GROUPS_KEY = 'paniscustos_test_recipe_groups';
export const TEST_PRODUCTIONS_KEY = 'paniscustos_test_productions';
export const TEST_SUPPLIERS_KEY = 'paniscustos_test_suppliers';
export const TEST_SALES_KEY = 'paniscustos_test_sales';
export const TEST_ORDERS_KEY = 'paniscustos_test_orders';
export const TEST_CUSTOMERS_KEY = 'paniscustos_test_customers';
export const TEST_CASHFLOW_KEY = 'paniscustos_test_cashflow';
export const TEST_FIXED_EXPENSES_KEY = 'paniscustos_test_fixed_expenses';

export let firebaseApp = null;
export let firebaseAuth = null;
export let firestoreDb = null;
export let redirectResultChecked = false;
export let unsubscribeSnapshot = null;
export let unsubscribeReceitasSnapshot = null;
export let unsubscribeRecipeGroupsSnapshot = null;
export let unsubscribeProducoesSnapshot = null;
export let unsubscribeFornecedoresSnapshot = null;
export let unsubscribeVendasSnapshot = null;
export let unsubscribePedidosSnapshot = null;
export let unsubscribeClientesSnapshot = null;
export let unsubscribeCashflowSnapshot = null;
export let unsubscribeFixedExpensesSnapshot = null;
export let isTestStockMode = false;
export let currentUser = null;
export let cachedInsumos = [];
export let cachedReceitas = [];
export let cachedRecipeGroups = [];
export let cachedProducoes = [];
export let cachedFornecedores = [];
export let cachedVendas = [];
export let cachedPedidos = [];
export let cachedClientes = [];
export let cachedCashflow = [];
export let cachedFixedExpenses = [];
export let pendingDeleteId = null;
export let pendingDeleteReceitaId = null;
export let pendingAddItemReceitaId = null;
export let editingInsumoId = null;
export let editingReceitaId = null;
export let stockFormUnit = 'kg';
export let pendingProductionRecipeId = null;
export let pendingEditProductionId = null;
export let pendingDeleteProductionId = null;
export let pendingEditSaleId = null;
export let editingFornecedorId = null;
export let activeGroupFilter = 'todos';
export let activeRecipeCategory = 'todos';
export let activeTab = 'insumos';
export let itensReceitaEmElaboracao = [];
export let gruposReceitaEmElaboracao = [];
export let grupoReceitaSelecionadoId = '';
export let itensGrupoModeloEmEdicao = [];
export let editingRecipeGroupId = null;
export let activeRecipePanel = 'recipes';
export let fotoReceitaDataUrl = null;
export const listasReceitaRecolhidas = new Set();

      // Insumos iniciais de exemplo para a padaria caseira (ingredientes + sacolas + formas)
export const DEMO_SEED_INSUMOS = [
        {
          id: 'demo-1',
          nome: 'Farinha de Trigo Especial Tipo 1',
          fornecedor: 'Moinho Santa Clara',
          quantidade: 5,
          unidade: 'kg',
          preco: 23.50,
          custoUnitario: 4.70,
          categoria: 'ingrediente',
          createdByName: 'Padeiro Carlos',
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo-2',
          nome: 'Fermento Biológico Seco Instantâneo',
          fornecedor: 'Atacadão de Alimentos',
          quantidade: 500,
          unidade: 'g',
          preco: 18.00,
          custoUnitario: 0.036,
          categoria: 'ingrediente',
          createdByName: 'Padeiro Carlos',
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo-3',
          nome: 'Sal Marinho Moído',
          fornecedor: 'Mercado Central',
          quantidade: 1,
          unidade: 'kg',
          preco: 4.50,
          custoUnitario: 4.50,
          categoria: 'ingrediente',
          createdByName: 'Padeira Marina',
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo-4',
          nome: 'Manteiga Extra sem Sal',
          fornecedor: 'Laticínios da Serra',
          quantidade: 500,
          unidade: 'g',
          preco: 26.90,
          custoUnitario: 0.0538,
          categoria: 'ingrediente',
          createdByName: 'Padeira Marina',
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo-5',
          nome: 'Forma Descartável Forneável Pão 500g',
          fornecedor: 'Distribuidora EmbalaSul',
          quantidade: 50,
          unidade: 'un',
          preco: 45.00,
          custoUnitario: 0.90,
          categoria: 'embalagem',
          createdByName: 'Padeiro Carlos',
          createdAt: new Date().toISOString()
        },
        {
          id: 'demo-6',
          nome: 'Sacola Kraft Especial para Pão Artesanal',
          fornecedor: 'Gráfica & Embalagens Kraft',
          quantidade: 100,
          unidade: 'un',
          preco: 45.00,
          custoUnitario: 0.45,
          categoria: 'embalagem',
          createdByName: 'Padeiro Carlos',
          createdAt: new Date().toISOString()
        }
      ];

      // Receita semente de demonstração
export const DEMO_SEED_RECEITAS = [
        {
          id: 'demo-rec-1',
          nome: 'Pão Caseiro Tradicional da Vovó',
          descricao: 'Assar a 200°C por 35 minutos com vapor até casca dourada e som oco',
          rendimento: 2,
          rendimentoUnidade: 'pães',
          itens: [
            {
              insumoId: 'demo-1',
              insumoNome: 'Farinha de Trigo Especial Tipo 1',
              categoria: 'ingrediente',
              quantidadeUsada: 1000,
              unidadeUsada: 'g',
              custoUnitarioBase: 4.70,
              unidadeBase: 'kg',
              custoItem: 4.70
            },
            {
              insumoId: 'demo-2',
              insumoNome: 'Fermento Biológico Seco Instantâneo',
              categoria: 'ingrediente',
              quantidadeUsada: 10,
              unidadeUsada: 'g',
              custoUnitarioBase: 0.036,
              unidadeBase: 'g',
              custoItem: 0.36
            },
            {
              insumoId: 'demo-3',
              insumoNome: 'Sal Marinho Moído',
              categoria: 'ingrediente',
              quantidadeUsada: 20,
              unidadeUsada: 'g',
              custoUnitarioBase: 4.50,
              unidadeBase: 'kg',
              custoItem: 0.09
            },
            {
              insumoId: 'demo-5',
              insumoNome: 'Forma Descartável Forneável Pão 500g',
              categoria: 'embalagem',
              quantidadeUsada: 2,
              unidadeUsada: 'un',
              custoUnitarioBase: 0.90,
              unidadeBase: 'un',
              custoItem: 1.80
            },
            {
              insumoId: 'demo-6',
              insumoNome: 'Sacola Kraft Especial para Pão Artesanal',
              categoria: 'embalagem',
              quantidadeUsada: 2,
              unidadeUsada: 'un',
              custoUnitarioBase: 0.45,
              unidadeBase: 'un',
              custoItem: 0.90
            }
          ],
          custoIngredientes: 5.15,
          custoEmbalagens: 2.70,
          custoTotal: 7.85,
          custoUnitario: 3.93,
          margemLucroDesejada: 100,
          precoVendaSugerido: 7.86,
          precoVendaPraticado: 9.00,
          lucroPorUnidade: 5.07,
          createdByName: 'Carlos (Padeiro 1)',
          createdAt: new Date().toISOString()
        }
      ];
