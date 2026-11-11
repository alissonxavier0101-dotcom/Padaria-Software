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
  obterStatusVenda,
  vendaEstaPaga,
  formatarDataModulo
} from './helpers.js';
import { persistirNovoRegistro, obterDataLocalAtual } from './financeiro.js';
import { atualizarSelectClientes } from './receitas.js';

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
