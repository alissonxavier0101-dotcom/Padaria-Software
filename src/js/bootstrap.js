import { initFirebase } from './firebaseAuth.js';
import { renderizarGruposReceitaEmElaboracao, obterDataLocalAtual } from './receitas.js';
import { dom } from './dom.js';

// 12. INICIALIZAÇÃO AUTOMÁTICA NA CARGA DA PÁGINA
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
        const host = window.location.hostname || 'localhost';
        if (dom.labelCurrentDomain) dom.labelCurrentDomain.textContent = host;
        if (dom.inputUnauthDomain) dom.inputUnauthDomain.value = host;
        renderizarGruposReceitaEmElaboracao();
        dom.saleDate.value = obterDataLocalAtual();
        dom.financeMonth.value = obterDataLocalAtual().slice(0, 7);
        dom.financeTransactionDate.value = obterDataLocalAtual();

        initFirebase();
      });
