// src/lib/theme/palettes.ts
// ═══════════════════════════════════════════════════════════════════
// Définit les palettes de couleur disponibles pour l'app. Module pur
// (aucun import React) volontairement séparé du contexte de thème pour
// que src/lib/profile.ts puisse importer le type Palette sans tirer tout
// le contexte React dans un simple fichier de types.
//
// ⚠️ --accent-neon (vert) N'EST JAMAIS réécrit par une palette (voir
// index.css) : il porte un sens fixe dans toute l'app — mouvement de fonds
// (fund/distribute/claim, voir .btn-neon dans index.css) — et changer sa
// teinte casserait ce repère visuel appris par l'utilisateur. Seuls les
// rôles "violet" (accent principal) et "gold" (accent secondaire) varient
// d'une palette à l'autre.
//
// ⚠️ Cette liste est DUPLIQUÉE dans supabase/functions/update-profile
// (const THEME_PALETTES). Une valeur absente de la liste côté serveur n'est
// pas rejetée : elle est écrasée en NULL, et l'appel répond quand même
// { ok: true }. Ajouter une palette ici SANS redéployer la fonction produit
// donc une perte silencieuse en base.
// ═══════════════════════════════════════════════════════════════════

export type Palette = 'violet' | 'cyan' | 'coral' | 'aurum' | 'atelier' | 'nova' | 'volta' | 'ember';

// 29/08 (soir) : + aurum (noir chaud + or) et atelier (ivoire + encre, seul
// mode clair distinctif du lot). Voir index.css pour les blocs [data-theme].
//
// ─── Deux listes, et il FAUT les deux ───────────────────────────────
//
// Retirer une palette du produit et la retirer des données sont deux
// choses différentes. `coral` n'est plus PROPOSÉE, mais un profil qui
// l'avait déjà choisie doit continuer de s'afficher en coral — sinon on ne
// retire pas une option, on change l'apparence de comptes existants sans
// qu'ils aient rien demandé.
//
// D'où la séparation ci-dessous. Une seule liste ne peut pas tenir les
// deux rôles : elle alimenterait à la fois le menu ET la validation.

/** Liste COMPLÈTE — toute palette qui a existé un jour. Sert à VALIDER une
 *  valeur déjà stockée (isPalette) et à construire THEMES, donc à résoudre
 *  `getTheme('coral')`. Ne jamais en retirer une entrée : ce serait casser
 *  rétroactivement les profils qui l'ont en base. On n'ajoute ici que des
 *  entrées, jamais on n'en enlève. */
export const ALL_PALETTES: Palette[] = ['violet', 'cyan', 'coral', 'aurum', 'atelier', 'nova', 'volta', 'ember'];

/** Liste SÉLECTIONNABLE — ce que les sélecteurs (ThemeSwitch via
 *  SELECTABLE_THEMES, ThemeModeGrid directement) proposent à un NOUVEAU
 *  choix. C'est ici, et uniquement ici, qu'on retire une palette du
 *  produit. */
// Marqueur de synchronisation miroir — 19/09, vérification prod/local.
// 19/09 (soir) : + nova (magenta électrique + lime) — palette vive demandée
// pour un profil "plus fun", cf. bloc [data-theme='nova'] dans index.css.
// ─── 3 habillages validés le 21/09 (prototype UI v3) ────
// Solana (violet, défaut) · Volta (émeraude) · Ember (ambre).
// Les habillages anterior (cyan/atelier/nova) restent VALIDES via
// ALL_PALETTES — un profil qui les a choisit les garde — mais ne sont
// plus proposés aux nouveaux choix (trop de choix proche = bruit).
export const PALETTES: Palette[] = ['violet', 'volta', 'ember'];

/** Validation d'une valeur venue du stockage ou du serveur — donc adossée
 *  à ALL_PALETTES, pas à la liste du menu. */
export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && (ALL_PALETTES as string[]).includes(value);
}

/** Couleur de prévisualisation (le rôle "violet", le plus utilisé dans l'UI)
 *  pour chaque palette — sert aux pastilles du sélecteur, en JS pur (pas de
 *  lecture de variable CSS nécessaire pour peindre un petit rond). */
export const PALETTE_SWATCH: Record<Palette, string> = {
  violet: '#9945FF',
  cyan: '#22D3EE',
  coral: '#FB7185',
  aurum: '#E8B84B',
  atelier: '#1A1814',
  nova: '#FF2E93',
  volta: '#10B981',
  ember: '#FFCF5A',
};

export const PALETTE_LABEL_KEY: Record<Palette, string> = {
  violet: 'theme.violet',
  cyan: 'theme.cyan',
  coral: 'theme.coral',
  aurum: 'theme.aurum',
  atelier: 'theme.atelier',
  nova: 'theme.nova',
  volta: 'theme.volta',
  ember: 'theme.ember',
};
