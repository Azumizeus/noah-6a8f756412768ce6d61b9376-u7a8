// src/lib/density.ts
// Densité d'affichage — persistée en localStorage, lue au montage.
//
// Pas dans ThemeContext volontairement : la densité ne pilote aucune
// variable CSS (contrairement à --glow-strength), les composants lisent
// juste la valeur pour choisir leurs paddings. Un module isolé évite de
// faire re-render tout l'arbre du contexte à chaque bascule.
export type Density = 'comfortable' | 'compact';

const KEY = 'buildpact_density';
export const DEFAULT_DENSITY: Density = 'comfortable';

/** Garde de type : une valeur venue de localStorage est `string | null`,
 *  et peut contenir n'importe quoi si la clé a été éditée à la main. */
export function isDensity(value: unknown): value is Density {
  return value === 'comfortable' || value === 'compact';
}

export function loadDensity(): Density {
  try {
    const raw = localStorage.getItem(KEY);
    return isDensity(raw) ? raw : DEFAULT_DENSITY;
  } catch {
    // localStorage jette en navigation privée Safari et en iframe
    // cross-origin : un réglage d'affichage ne doit jamais casser la page.
    return DEFAULT_DENSITY;
  }
}

export function saveDensity(d: Density): void {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* non bloquant */
  }
}
