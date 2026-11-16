import {
  aplicarFiltros,
  carregarFiltroAba,
  criarFiltroPadrao,
  normalizarFiltro,
  ORDENACOES_LISTA,
  salvarFiltroAba
} from '../../utils/listFilters.ts';

const ROTULOS_ORDENACAO = {
  'nome-asc': 'Nome (A-Z)',
  'nome-desc': 'Nome (Z-A)',
  'data-asc': 'Data (mais antiga)',
  'data-desc': 'Data (mais recente)',
  'valor-asc': 'Valor (menor)',
  'valor-desc': 'Valor (maior)'
};

const PERIODOS_RAPIDOS = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7dias', rotulo: '7 dias' },
  { valor: 'mes', rotulo: 'Este mês' }
];

const ICONE_BUSCA =
  '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

function criarCampo(rotulo, controle) {
  const wrapper = document.createElement('label');
  wrapper.className = 'filtro-lista-campo';
  const texto = document.createElement('span');
  texto.textContent = rotulo;
  wrapper.append(texto, controle);
  return wrapper;
}

function formatarDataLocal(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function intervaloPeriodoRapido(valor) {
  const hoje = new Date();
  if (valor === 'hoje') {
    const dia = formatarDataLocal(hoje);
    return { dataInicio: dia, dataFim: dia };
  }
  if (valor === '7dias') {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 6);
    return { dataInicio: formatarDataLocal(inicio), dataFim: formatarDataLocal(hoje) };
  }
  if (valor === 'mes') {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { dataInicio: formatarDataLocal(inicio), dataFim: formatarDataLocal(fim) };
  }
  return { dataInicio: '', dataFim: '' };
}

/**
 * Componente reutilizável de filtro para listas.
 * Não altera nenhuma tela por conta própria: o host decide onde montar e o que
 * fazer com o resultado emitido em `onChange`.
 */
export function criarFiltroLista(config) {
  const {
    container,
    aba,
    categorias = [],
    rotulosCategorias = {},
    placeholderBusca = 'Buscar...',
    rotuloTodas = 'Todas',
    opcoes,
    itens,
    onChange,
    storage,
    busca = true,
    chips,
    selects = [],
    periodoRapido = false,
    faixaData = true,
    ordenacao = true,
    rotuloLimpar = 'Limpar filtros'
  } = config || {};

  if (!container) throw new Error('criarFiltroLista: informe o container.');
  if (!aba) throw new Error('criarFiltroLista: informe a aba para persistir o filtro.');
  if (!opcoes) throw new Error('criarFiltroLista: informe as opcoes de filtro.');

  let filtro = carregarFiltroAba(aba, storage);

  const mostrarChips = chips === undefined ? categorias.length > 0 : Boolean(chips);
  const mostrarOrdenacao = ordenacao !== false;
  const listaOrdenacoes = Array.isArray(ordenacao) ? ordenacao : ORDENACOES_LISTA;
  const periodos = Array.isArray(periodoRapido) ? periodoRapido : PERIODOS_RAPIDOS;
  const mostrarPeriodoRapido = periodoRapido !== false && periodos.length > 0;

  const raiz = document.createElement('div');
  raiz.className = 'filtro-lista';

  let buscaInput = null;
  let limparBusca = null;
  if (busca) {
    const buscaBox = document.createElement('div');
    buscaBox.className = 'search-box';
    buscaBox.innerHTML = ICONE_BUSCA;

    buscaInput = document.createElement('input');
    buscaInput.type = 'search';
    buscaInput.className = 'search-input';
    buscaInput.placeholder = placeholderBusca;
    buscaInput.setAttribute('aria-label', placeholderBusca);
    buscaInput.value = filtro.busca;

    limparBusca = document.createElement('button');
    limparBusca.type = 'button';
    limparBusca.className = 'btn-clear-search';
    limparBusca.setAttribute('aria-label', 'Limpar busca');
    limparBusca.textContent = '✕';

    buscaBox.append(buscaInput, limparBusca);
    raiz.append(buscaBox);
  }

  let chipsBar = null;
  if (mostrarChips) {
    chipsBar = document.createElement('div');
    chipsBar.className = 'category-pills-bar';
    chipsBar.setAttribute('role', 'group');
    chipsBar.setAttribute('aria-label', 'Filtrar por categoria');
    raiz.append(chipsBar);
  }

  const controles = document.createElement('div');
  controles.className = 'filtro-lista-row';

  let grupoPeriodo = null;
  if (mostrarPeriodoRapido) {
    grupoPeriodo = document.createElement('div');
    grupoPeriodo.className = 'filtro-lista-periodo';
    grupoPeriodo.setAttribute('role', 'group');
    grupoPeriodo.setAttribute('aria-label', 'Período');
    for (const periodo of periodos) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'category-pill';
      botao.dataset.periodo = periodo.valor;
      botao.textContent = periodo.rotulo;
      grupoPeriodo.append(botao);
    }
    controles.append(criarCampo('Período', grupoPeriodo));
  }

  const selectsInfo = selects.map((cfg) => {
    const select = document.createElement('select');
    select.className = 'filtro-lista-select';
    const label = criarCampo(cfg.rotulo, select);
    controles.append(label);
    return { cfg, select };
  });

  let inputInicio = null;
  let inputFim = null;
  if (faixaData) {
    inputInicio = document.createElement('input');
    inputInicio.type = 'date';
    inputInicio.className = 'filtro-lista-date';
    inputFim = document.createElement('input');
    inputFim.type = 'date';
    inputFim.className = 'filtro-lista-date';
    controles.append(
      criarCampo('De', inputInicio),
      criarCampo('Até', inputFim)
    );
  }

  let selectOrdenacao = null;
  if (mostrarOrdenacao) {
    selectOrdenacao = document.createElement('select');
    selectOrdenacao.className = 'filtro-lista-select';
    for (const valor of listaOrdenacoes) {
      const opcao = document.createElement('option');
      opcao.value = valor;
      opcao.textContent = ROTULOS_ORDENACAO[valor] || valor;
      selectOrdenacao.append(opcao);
    }
    controles.append(criarCampo('Ordenar por', selectOrdenacao));
  }

  const limparFiltros = document.createElement('button');
  limparFiltros.type = 'button';
  limparFiltros.className = 'btn-secondary';
  limparFiltros.textContent = rotuloLimpar;
  controles.append(limparFiltros);

  raiz.append(controles);

  function rotuloCategoria(categoria) {
    return rotulosCategorias[categoria] || categoria;
  }

  function obterItens() {
    if (typeof itens === 'function') return itens();
    return Array.isArray(itens) ? itens : [];
  }

  function periodoAtivo() {
    if (!mostrarPeriodoRapido) return '';
    for (const periodo of periodos) {
      const intervalo = intervaloPeriodoRapido(periodo.valor);
      if (filtro.dataInicio === intervalo.dataInicio && filtro.dataFim === intervalo.dataFim) {
        return periodo.valor;
      }
    }
    return '';
  }

  function renderizarChips(contagens) {
    if (!chipsBar) return;
    chipsBar.replaceChildren();

    const opcoesChips = [
      { valor: '', rotulo: rotuloTodas, chave: 'todas' },
      ...categorias.map((categoria) => ({
        valor: categoria,
        rotulo: rotuloCategoria(categoria),
        chave: categoria
      }))
    ];

    for (const chip of opcoesChips) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'category-pill';
      botao.dataset.categoria = chip.valor;
      botao.textContent = `${chip.rotulo} (${contagens[chip.chave] ?? 0})`;
      const ativo = filtro.categoria === chip.valor;
      botao.classList.toggle('active', ativo);
      botao.setAttribute('aria-pressed', String(ativo));
      chipsBar.append(botao);
    }
  }

  function preencherSelect(info) {
    const { cfg, select } = info;
    const listaOpcoes = typeof cfg.opcoes === 'function' ? cfg.opcoes() : (cfg.opcoes || []);
    const valorAtual = filtro.extras[cfg.campo] || '';
    select.replaceChildren();

    const todos = document.createElement('option');
    todos.value = '';
    todos.textContent = cfg.rotuloTodos || 'Todos';
    select.append(todos);

    for (const opcao of listaOpcoes) {
      const elemento = document.createElement('option');
      elemento.value = String(opcao.valor);
      elemento.textContent = opcao.rotulo;
      select.append(elemento);
    }

    if (valorAtual && !listaOpcoes.some((opcao) => String(opcao.valor) === valorAtual)) {
      filtro.extras[cfg.campo] = '';
    }
    select.value = filtro.extras[cfg.campo] || '';
  }

  function atualizarPeriodoAtivo() {
    if (!grupoPeriodo) return;
    const ativo = periodoAtivo();
    grupoPeriodo.querySelectorAll('[data-periodo]').forEach((botao) => {
      const ativoBotao = botao.dataset.periodo === ativo;
      botao.classList.toggle('active', ativoBotao);
      botao.setAttribute('aria-pressed', String(ativoBotao));
    });
  }

  function sincronizarControles() {
    if (buscaInput) {
      buscaInput.value = filtro.busca;
      limparBusca.style.display = filtro.busca ? 'block' : 'none';
    }
    if (inputInicio) inputInicio.value = filtro.dataInicio;
    if (inputFim) inputFim.value = filtro.dataFim;
    if (selectOrdenacao) selectOrdenacao.value = filtro.ordenacao;
    selectsInfo.forEach(preencherSelect);
    atualizarPeriodoAtivo();
  }

  function emitir(notificar = true) {
    const resultado = aplicarFiltros(
      obterItens(),
      filtro,
      opcoes,
      categorias,
      { ordenar: mostrarOrdenacao }
    );
    renderizarChips(resultado.contagens);
    selectsInfo.forEach(preencherSelect);
    atualizarPeriodoAtivo();
    if (notificar && typeof onChange === 'function') onChange(resultado);
    return resultado;
  }

  function atualizar(parcial = {}) {
    const extras = parcial.extras
      ? { ...filtro.extras, ...parcial.extras }
      : filtro.extras;
    filtro = normalizarFiltro({ ...filtro, ...parcial, extras });
    salvarFiltroAba(aba, filtro, storage);
    sincronizarControles();
    return emitir(true);
  }

  if (buscaInput) {
    buscaInput.addEventListener('input', () => {
      atualizar({ busca: buscaInput.value });
    });

    limparBusca.addEventListener('click', () => {
      buscaInput.focus();
      atualizar({ busca: '' });
    });
  }

  if (chipsBar) {
    chipsBar.addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-categoria]');
      if (!botao) return;
      atualizar({ categoria: botao.dataset.categoria || '' });
    });
  }

  if (grupoPeriodo) {
    grupoPeriodo.addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-periodo]');
      if (!botao) return;
      if (botao.dataset.periodo === periodoAtivo()) {
        atualizar({ dataInicio: '', dataFim: '' });
      } else {
        atualizar(intervaloPeriodoRapido(botao.dataset.periodo));
      }
    });
  }

  selectsInfo.forEach(({ cfg, select }) => {
    select.addEventListener('change', () => {
      atualizar({ extras: { [cfg.campo]: select.value } });
    });
  });

  if (inputInicio) {
    inputInicio.addEventListener('change', () => {
      atualizar({ dataInicio: inputInicio.value });
    });
  }

  if (inputFim) {
    inputFim.addEventListener('change', () => {
      atualizar({ dataFim: inputFim.value });
    });
  }

  if (selectOrdenacao) {
    selectOrdenacao.addEventListener('change', () => {
      atualizar({ ordenacao: selectOrdenacao.value });
    });
  }

  limparFiltros.addEventListener('click', () => {
    filtro = criarFiltroPadrao();
    salvarFiltroAba(aba, filtro, storage);
    sincronizarControles();
    emitir(true);
  });

  container.append(raiz);
  sincronizarControles();
  emitir(false);

  return {
    elemento: raiz,
    obterFiltro: () => ({ ...filtro, extras: { ...filtro.extras } }),
    definirFiltro: (parcial) => atualizar(parcial || {}),
    atualizar: () => emitir(true),
    sincronizar: () => emitir(false),
    destruir: () => raiz.remove()
  };
}
