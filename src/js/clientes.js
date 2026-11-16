import {
  cachedClientes,
  cachedVendas,
  firestoreDb,
  isTestStockMode
} from './state.js';
import { dom } from './dom.js';
import {
  showToast,
  escapeHtml,
  formatarMoeda,
  exibirErrosFormulario,
  limparErrosFormulario,
  iniciarEnvio,
  obterBotaoSubmit
} from './helpers.js';
import { validarCliente, possuiErros } from '../utils/validation.ts';
import { persistirNovoRegistro, obterDataLocalAtual, obterStatusVenda, vendaEstaPaga, formatarDataModulo } from './financeiro.js';
import { atualizarSelectClientes } from './receitas.js';
import { criarFiltroLista } from './components/filtroLista.js';
import { aplicarMascaraTelefone, lerValorTelefone, configurarMemoriaCampos } from './formHelpers.js';

const OPCOES_FILTRO_CLIENTES = {
  nome: cliente => cliente.nome,
  camposBusca: cliente => [cliente.nome, cliente.telefone],
  categoria: () => 'cliente',
  data: () => '',
  valor: () => 0
};

let filtroClientes = null;
let inicializandoFiltroClientes = false;

function obterFiltroClientes() {
  if (filtroClientes) return filtroClientes;
  if (inicializandoFiltroClientes || !dom.customersFilters) return null;
  inicializandoFiltroClientes = true;
  filtroClientes = criarFiltroLista({
    container: dom.customersFilters,
    aba: 'clientes',
    opcoes: OPCOES_FILTRO_CLIENTES,
    itens: () => cachedClientes,
    onChange: resultado => {
      if (!inicializandoFiltroClientes) renderizarClientes(resultado);
    },
    placeholderBusca: 'Buscar por nome ou telefone...',
    chips: false,
    selects: [],
    faixaData: false,
    ordenacao: false,
    periodoRapido: false
  });
  inicializandoFiltroClientes = false;
  return filtroClientes;
}

export function renderizarClientes(resultadoPronto) {
  if (!dom.customersList) return;
  const componente = obterFiltroClientes();
  const resultado = resultadoPronto || (componente ? componente.sincronizar() : null);
  const clientes = resultado ? resultado.itens : cachedClientes;
  dom.customersCounter.textContent = `${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`;
  dom.tabBadgeClientes.textContent = String(cachedClientes.length);
  dom.customersEmpty.classList.toggle('hidden', clientes.length > 0);
  dom.customersList.innerHTML = clientes.map(cliente => {
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

export async function salvarCliente(event) {
  event.preventDefault();
  limparErrosFormulario(dom.formCliente);
  const nome = dom.customerName.value.trim();
  const telefone = lerValorTelefone(dom.customerPhone);
  const erros = validarCliente({
    nome: dom.customerName.value,
    telefone: lerValorTelefone(dom.customerPhone)
  });
  if (possuiErros(erros)) {
    exibirErrosFormulario(dom.formCliente, erros, {
      nome: dom.customerName,
      telefone: dom.customerPhone
    });
    return;
  }
  const liberar = iniciarEnvio(dom.formCliente);
  if (!liberar) return;
  const botao = obterBotaoSubmit(dom.formCliente);
  if (botao) botao.disabled = true;
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
  } finally {
    if (botao) botao.disabled = false;
    liberar();
  }
}

// Máscaras e memória de últimos valores (clientes)
aplicarMascaraTelefone(dom.customerPhone);
configurarMemoriaCampos(dom.formCliente, 'clientes');
