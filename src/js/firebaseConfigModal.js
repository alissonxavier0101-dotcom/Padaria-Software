import { obterFirebaseConfig } from './firebaseAuth.js';
import { dom } from './dom.js';

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
