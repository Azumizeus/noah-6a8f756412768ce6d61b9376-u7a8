// src/lib/usdDisplay.ts
// Affichage de la contre-valeur USD à côté des montants en SOL.
//
// Stocké en '1' / '0' plutôt qu'en JSON booléen : `localStorage` ne
// contient que des chaînes, et `=== '1'` évite un JSON.parse qui jetterait
// sur une valeur corrompue. Absence de clé = désactivé (choix par défaut :
// BuildPact raisonne en SOL, l'USD est une aide, pas la référence).
const KEY = 'buildpact_show_usd';

export function loadShowUsd(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveShowUsd(v: boolean): void {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* non bloquant */
  }
}
