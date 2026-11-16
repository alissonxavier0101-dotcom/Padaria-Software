/**
 * Helpers de entradas de formulário mais inteligentes:
 * - máscara de moeda (R$ 0,00) em tempo real
 * - máscara de telefone ((11) 99999-9999)
 * - busca dentro de <select>
 * - memória dos últimos valores preenchidos por campo (localStorage)
 */

const CURRENCY_STORAGE_KEY = 'padaria:ultimosValores:moeda';
const PHONE_STORAGE_KEY = 'padaria:ultimosValores:telefone';
const LAST_VALUES_STORAGE_KEY = 'padaria:ultimosValores:campos';

function lerStorage(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

function gravarStorage(chave, dados) {
  try {
    localStorage.setItem(chave, JSON.stringify(dados));
  } catch {
    // storage privado/cota: ignora silenciosamente
  }
}

/* ------------------------------------------------------------------ */
/*  Máscara de moeda                                                  */
/* ------------------------------------------------------------------ */

export function mascaraMoeda(valor) {
  const soNumeros = String(valor ?? '').replace(/\D/g, '');
  if (!soNumeros) return '';
  const centavos = Number(soNumeros) / 100;
  return centavos.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function desmascaraMoeda(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Aplica máscara de moeda a um input. O valor visível fica formatado
 * (ex: "R$ 12,34") e o valor numérico puro é mantido em
 * data-valor-bruto para leitura pelo código de negócio.
 */
export function aplicarMascaraMoeda(input) {
  if (!input || input.dataset.moedaAplicada === 'true') return input;

  input.dataset.moedaAplicada = 'true';
  input.type = 'text';
  input.inputMode = 'decimal';

  function lerBruto() {
    return input.dataset.valorBruto || '';
  }

  function escreverVisivel(bruto) {
    input.value = mascaraMoeda(bruto);
  }

  function escreverBruto(bruto) {
    input.dataset.valorBruto = bruto;
  }

  function sincronizar() {
    const bruto = desmascaraMoeda(input.value);
    escreverBruto(bruto);
    escreverVisivel(bruto);
  }

  input.addEventListener('input', () => {
    const posicao = input.selectionStart;
    const tamanhoAntes = input.value.length;
    sincronizar();
    const tamanhoDepois = input.value.length;
    const deslocamento = tamanhoDepois - tamanhoAntes;
    input.setSelectionRange(
      Math.min(Math.max(posicao + deslocamento, 0), tamanhoDepois),
      Math.min(Math.max(posicao + deslocamento, 0), tamanhoDepois)
    );
  });

  // inicializa com o valor bruto já existente, se houver
  const brutoAtual = lerBruto();
  if (brutoAtual) {
    escreverVisivel(brutoAtual);
  }

  // limpa máscara quando o formulário é resetado
  const form = input.form;
  if (form) {
    form.addEventListener('reset', () => {
      escreverBruto('');
      escreverVisivel('');
    }, { once: false });
  }

  // expõe o valor numérico puro para consumo externo
  Object.defineProperty(input, 'valorNumerico', {
    get() {
      return Number(lerBruto() || 0);
    },
    set(v) {
      escreverBruto(String(Math.round(Number(v || 0) * 100) / 100));
      escreverVisivel(lerBruto());
    },
    configurable: true
  });

  return input;
}

/**
 * Lê o valor numérico puro de um input com máscara de moeda, ou tenta
 * parsear direto se não houver máscara.
 */
export function lerValorMoeda(input) {
  if (!input) return 0;
  if (input.dataset.moedaAplicada === 'true') return input.valorNumerico;
  return Number(input.value) || 0;
}

/* ------------------------------------------------------------------ */
/*  Máscara de telefone                                               */
/* ------------------------------------------------------------------ */

export function mascaraTelefone(valor) {
  const soNumeros = String(valor ?? '').replace(/\D/g, '');
  if (!soNumeros) return '';

  const ddd = soNumeros.slice(0, 2);
  const resto = soNumeros.slice(2);

  if (!ddd) return '';
  if (resto.length <= 5) return `(${ddd}) ${resto}`;
  if (resto.length <= 8) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
}

export function desmascaraTelefone(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

export function aplicarMascaraTelefone(input) {
  if (!input || input.dataset.telefoneAplicado === 'true') return input;

  input.dataset.telefoneAplicado = 'true';
  input.type = 'tel';
  input.inputMode = 'tel';

  function sincronizar() {
    const bruto = desmascaraTelefone(input.value);
    input.dataset.telefoneBruto = bruto;
    input.value = mascaraTelefone(bruto);
  }

  input.addEventListener('input', () => {
    const posicao = input.selectionStart;
    const tamanhoAntes = input.value.length;
    sincronizar();
    const tamanhoDepois = input.value.length;
    const deslocamento = tamanhoDepois - tamanhoAntes;
    input.setSelectionRange(
      Math.min(Math.max(posicao + deslocamento, 0), tamanhoDepois),
      Math.min(Math.max(posicao + deslocamento, 0), tamanhoDepois)
    );
  });

  const brutoAtual = input.dataset.telefoneBruto || '';
  if (brutoAtual) {
    input.value = mascaraTelefone(brutoAtual);
  }

  const formTel = input.form;
  if (formTel) {
    formTel.addEventListener('reset', () => {
      input.dataset.telefoneBruto = '';
      input.value = '';
    }, { once: false });
  }

  Object.defineProperty(input, 'valorTelefone', {
    get() {
      return input.dataset.telefoneBruto || '';
    },
    set(v) {
      const bruto = desmascaraTelefone(v);
      input.dataset.telefoneBruto = bruto;
      input.value = mascaraTelefone(bruto);
    },
    configurable: true
  });

  return input;
}

export function lerValorTelefone(input) {
  if (!input) return '';
  if (input.dataset.telefoneAplicado === 'true') return input.valorTelefone;
  return desmascaraTelefone(input.value);
}

/* ------------------------------------------------------------------ */
/*  Busca dentro de <select>                                          */
/* ------------------------------------------------------------------ */

export function aplicarBuscaSelect(select, { placeholder = 'Buscar...' } = {}) {
  if (!select || select.dataset.selectBuscaAplicada === 'true') return select;

  const wrapper = document.createElement('div');
  wrapper.className = 'select-com-busca';

  const campoBusca = document.createElement('input');
  campoBusca.type = 'text';
  campoBusca.placeholder = placeholder;
  campoBusca.className = 'select-busca-input';
  campoBusca.autocomplete = 'off';
  campoBusca.spellcheck = false;

  // Mantem o select original no DOM (escondido) para que innerHTML/value
  // continuem funcionando quando modificado por atualizarSelectProdutos/Clientes.
  select.style.display = 'none';
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  const listaOpcoes = document.createElement('div');
  listaOpcoes.className = 'select-busca-lista';
  listaOpcoes.hidden = true;

  function montarLista() {
    listaOpcoes.replaceChildren();
    for (const opcao of Array.from(select.options)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'select-busca-opcao';
      item.dataset.valor = opcao.value;
      item.textContent = opcao.textContent;
      if (opcao.selected) item.classList.add('selecionada');
      item.addEventListener('click', () => {
        select.value = opcao.value;
        campoBusca.value = opcao.textContent;
        listaOpcoes.hidden = true;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      listaOpcoes.append(item);
    }
    return listaOpcoes;
  }

  montarLista();

  campoBusca.addEventListener('input', () => {
    const termo = normalizarTextoBuscaLocal(campoBusca.value);
    for (const item of listaOpcoes.children) {
      const corresponde = !termo
        || normalizarTextoBuscaLocal(item.textContent).includes(termo);
      item.hidden = !corresponde;
    }
    listaOpcoes.hidden = !campoBusca.value;
  });

  campoBusca.addEventListener('focus', () => {
    listaOpcoes.hidden = !campoBusca.value;
  });

  campoBusca.addEventListener('click', (evento) => {
    evento.stopPropagation();
    listaOpcoes.hidden = !campoBusca.value;
  });

  document.addEventListener('click', () => {
    listaOpcoes.hidden = true;
  });

  // Re-sincroniza selecao quando o select original muda por programas externos
  select.addEventListener('change', () => {
    campoBusca.value = select.selectedOptions[0]?.textContent || '';
    for (const item of listaOpcoes.children) {
      item.classList.toggle('selecionada', item.dataset.valor === select.value);
    }
  });

  wrapper.append(campoBusca, select, listaOpcoes);
  select.parentNode?.replaceChild(wrapper, select) || select.after(wrapper);

  function refresh() {
    montarLista();
    campoBusca.value = select.selectedOptions[0]?.textContent || '';
    for (const item of listaOpcoes.children) {
      item.classList.toggle('selecionada', item.dataset.valor === select.value);
    }
  }

  select.dataset.selectBuscaAplicada = 'true';
  selectRefreshMap.set(select, refresh);

  return { wrapper, campoBusca, select, lista: listaOpcoes, refresh };
}

const selectsComBusca = new WeakMap();
const selectRefreshMap = new WeakMap();

function inputBuscaSelectAtual(campoBusca, selectOriginal) {
  selectsComBusca.set(campoBusca, selectOriginal);
}

/**
 * Reconstrói a lista visual de um select com busca a partir das opções
 * atuais do select original. Deve ser chamado após atualizarSelectProdutos/
 * atualizarSelectClientes (ou qualquer outra rotina que mude select.innerHTML).
 */
export function refreshBuscaSelect(select) {
  if (!select || !select.dataset.selectBuscaAplicada) return;
  const refresh = selectRefreshMap.get(select);
  if (refresh) refresh();
}

function normalizarTextoBuscaLocal(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Memória dos últimos valores                                       */
/* ------------------------------------------------------------------ */

export function lembrarValorCampo(input, chave) {
  if (!input || !chave) return;
  const valores = lerStorage(LAST_VALUES_STORAGE_KEY);
  valores[chave] = input.value;
  gravarStorage(LAST_VALUES_STORAGE_KEY, valores);
}

export function restaurarValorCampo(input, chave) {
  if (!input || !chave) return;
  const valores = lerStorage(LAST_VALUES_STORAGE_KEY);
  const salvo = valores[chave];
  if (salvo !== undefined) {
    input.value = salvo;
    if (input.dataset.moedaAplicada === 'true') {
      input.dataset.valorBruto = desmascaraMoeda(salvo);
    }
    if (input.dataset.telefoneAplicado === 'true') {
      input.dataset.telefoneBruto = desmascaraTelefone(salvo);
    }
  }
}

export function configurarMemoriaCampos(form, prefixo) {
  if (!form || !prefixo) return;
  const inputs = form.querySelectorAll('input, select, textarea');
  const selecionacoesDiferidas = [];
  for (const input of inputs) {
    if (!input.id) continue;

    // Nunca memoriza/restaura data, quantidade ou status:
    // a data deve vir preenchida com hoje, a quantidade com o padrao e o
    // status deve ser escolhido a cada venda.
    if (input.type === 'date' || input.type === 'number') continue;
    if (input.tagName === 'SELECT' && /status/i.test(input.id || input.name || '')) continue;

    const chave = `${prefixo}:${input.id}`;

    // Selects dependem de opcoes preenchidas assincronamente (Firestore),
    // entao diferimos a restauracao para depois de preencher as opcoes.
    if (input.tagName === 'SELECT') {
      selecionacoesDiferidas.push({ input, chave });
      continue;
    }

    restaurarValorCampo(input, chave);
    input.addEventListener('blur', () => lembrarValorCampo(input, chave), { once: false });
  }
  return selecionacoesDiferidas;
}

/**
 * Restaura o valor salvo em selects que foram diferidos por
 * configurarMemoriaCampos. Deve ser chamado apos preencher as opcoes
 * dos selects (ex.: apos atualizarSelectProdutos/Clientes). Restaura
 * apenas se o campo ainda estiver vazio.
 */
export function restaurarSelecoesDiferidas(selecionacoesDiferidas) {
  if (!selecionacoesDiferidas) return;
  for (const { input, chave } of selecionacoesDiferidas) {
    if (input.value) continue; // ja tem valor, nao sobrescreve
    restaurarValorCampo(input, chave);
    input.addEventListener('change', () => lembrarValorCampo(input, chave), { once: false });
  }
}
