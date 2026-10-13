// src/lib/listingView.ts
// ═══════════════════════════════════════════════════════════════════
// Choix d'affichage des listes de pacts : cartes étendues (grandes) ou
// compactes (petites, plus de colonnes).
//
// Persistance PAR PAGE (dashboard/marketplace/pacts/builders ont leurs
// habitudes différentes : un utilisateur peut vouloir de la condensé sur
// le marketplace et de l'étendu sur la fiche de gestion). Clé localStorage
// par périmètre — même pattern que density.ts, mais à portée page.
// ═══════════════════════════════════════════════════════════════════

export type ListingView = 'large' | 'small' | 'list' | 'table';

const keyFor = (scope: string) => `buildpact.view.${scope}`;

export function loadListingView(scope: string): ListingView {
  try {
    const v = localStorage.getItem(keyFor(scope));
    return v === 'small' || v === 'list' || v === 'table' ? v : 'large';
  } catch {
    return 'large';
  }
}

export function saveListingView(scope: string, view: ListingView): void {
  try {
    localStorage.setItem(keyFor(scope), view);
  } catch {
    // Stockage indisponible (navigation privée stricte) : le choix reste
    // valable le temps de la session, c'est acceptable.
  }
}
