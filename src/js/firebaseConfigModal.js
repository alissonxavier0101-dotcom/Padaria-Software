import { obterFirebaseConfig, salvarFirebaseConfig, initFirebase } from './firebaseAuth.js';
import { dom } from './dom.js';
import { showToast } from './helpers.js';

export function abrirModalConfig() {
        const cfg = obterFirebaseConfig() || {};
        dom.cfgApiKey.value = cfg.apiKey || '';
        dom.cfgAuthDomain.value = cfg.authDomain || '';
        dom.cfgProjectId.value = cfg.projectId || '';
        dom.cfgDbId.value = cfg.firestoreDatabaseId || '';
        dom.configModal.classList.add('active');
      }

export function fecharModalConfig() {
        dom.configModal.classList.remove('active');
      }

export function salvarConfigFirebaseModal() {
        const apiKey = dom.cfgApiKey.value.trim();
        const authDomain = dom.cfgAuthDomain.value.trim();
        const projectId = dom.cfgProjectId.value.trim();
        const dbId = dom.cfgDbId.value.trim();

        if (!apiKey || !projectId) {
          showToast('Preencha ao menos API Key e Project ID');
          return;
        }

        const config = {
          apiKey,
          authDomain: authDomain || `${projectId}.firebaseapp.com`,
          projectId,
          firestoreDatabaseId: dbId || '(default)'
        };

        salvarFirebaseConfig(config);
        fecharModalConfig();
        showToast('Configuração salva! Inicializando conexão...');
        initFirebase();
      }
