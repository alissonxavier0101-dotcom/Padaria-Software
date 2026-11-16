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

  const selectOriginal = select.cloneNode(false);
  selectOriginal.id = ''; // evita ids duplicados

  const listaOpcoes = document.createElement('div');
  listaOpcoes.className = 'select-busca-lista';
  listaOpcoes.hidden = true;

  // popula opções originais
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
      selectOriginal.dispatchEvent(new Event('change', { bubbles: true }));
    });
    listaOpcoes.append(item);
  }

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

  wrapper.append(campoBusca, selectOriginal, listaOpcoes);
  select.replaceWith(wrapper);

  // mantém sincronização com o select original (visibilidade/valor)
  selectOriginal.addEventListener('change', () => {
    const selecionado = Array.from(selectOriginal.options).find(o => o.selected);
    if (selecionado) {
      campoBusca.value = selecionado.textContent;
      for (const item of listaOpcoes.children) {
        item.classList.toggle('selecionada', item.dataset.valor === selecionado.value);
      }
    }
  });

  select.dataset.selectBuscaAplicada = 'true';
  inputBuscaSelectAtual(campoBusca, selectOriginal);

  return { wrapper, campoBusca, select: selectOriginal, lista: listaOpcoes };
}

const selectsComBusca = new WeakMap();
function inputBuscaSelectAtual(campoBusca, selectOriginal) {
  selectsComBusca.set(campoBusca, selectOriginal);
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
  for (const input of inputs) {
    if (!input.id) continue;
    const chave = `${prefixo}:${input.id}`;
    restaurarValorCampo(input, chave);
    input.addEventListener('blur', () => lembrarValorCampo(input, chave), { once: false });
  }
}
