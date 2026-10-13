// src/lib/i18n/langStorage.ts
// ═══════════════════════════════════════════════════════════════════
// Lecture / écriture de la langue choisie. Un seul endroit : le contexte
// React ET les modules hors React (erreurs de transaction, libellés de
// stage…) lisaient chacun leur copie, et plusieurs d'entre elles
// retombaient sur le français dès que localStorage était vide — l'interface
// pouvait donc être en anglais pendant que les messages, eux, restaient
// en français.
//
// Un choix explicite (clé présente) gagne toujours sur la langue du
// navigateur. Rien ici ne réécrit la clé tout seul : c'est le contexte
// qui persiste, au moment du choix et au premier chargement.
// ═══════════════════════════════════════════════════════════════════
import type { Lang } from './types';

export const LANG_STORAGE_KEY = 'buildpact_lang';

export function readLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    /* navigation privée, stockage bloqué */
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }
  return 'en';
}

export function writeLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* non bloquant : le choix reste en mémoire pour cet onglet */
  }
}
