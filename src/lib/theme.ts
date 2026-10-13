// src/lib/theme.ts
// ═══════════════════════════════════════════════════════════════════
// Système de thème d'accent — persistance + application au document.
//
// La LISTE des palettes ne vit plus ici : elle est dans
// ./theme/palettes.ts, module pur aligné sur la liste blanche de l'Edge
// Function `update-profile` (colonne builder_profiles.theme_palette).
// Ce fichier ne fait que traduire une palette en triade RGB et gérer le
// stockage local.
//
// ⚠️ Deux chemins coexistent : src/lib/theme.ts (ce fichier) et le dossier
// src/lib/theme/. TypeScript résout `./theme` vers le FICHIER, jamais vers
// le dossier (il n'y a pas de theme/index.ts, et il ne faut pas en créer :
// il rendrait l'import ambigu).
//
// ─── Comment ça marche techniquement ───
//
// On n'écrit jamais une couleur en dur côté composants : chaque thème pose
// des variables CSS en CANAUX RGB SÉPARÉS (`153 69 255`, pas `#9945FF`).
// Ce format est imposé par Tailwind : sa config déclare
// `rgb(var(--accent-violet-rgb) / <alpha-value>)`, ce qui permet à
// `bg-accent-violet/20` de continuer à fonctionner. Avec un hex ou un
// `rgb(...)` complet dans la variable, tous les modificateurs d'opacité
// du projet casseraient silencieusement — la classe serait ignorée et
// l'élément rendrait transparent, sans la moindre erreur de build.
//
// Les noms de variables gardent leurs intitulés d'origine
// (`--accent-violet-rgb` même quand la palette est corail) : les renommer
// aurait imposé de toucher chaque classe Tailwind du projet. Le nom est
// devenu un RÔLE, pas une couleur — violet = primaire, neon = argent,
// gold = mise en avant.
// ═══════════════════════════════════════════════════════════════════

import { ALL_PALETTES, PALETTES, PALETTE_LABEL_KEY, type Palette } from './theme/palettes';

export type { Palette } from './theme/palettes';
export {
  ALL_PALETTES,
  PALETTES,
  PALETTE_SWATCH,
  PALETTE_LABEL_KEY,
  isPalette,
} from './theme/palettes';

/** Alias historique : le reste du code parle encore de ThemeId. */
export type ThemeId = Palette;

/** Rôle « argent » — fund, distribute, claim. FIXE pour toutes les palettes :
 *  le vert signale un mouvement de SOL, c'est un repère appris. Le voir
 *  changer de teinte selon la palette casserait cette lecture. */
export const MONEY_RGB = '20 241 149';

export interface ThemeDef {
  id: Palette;
  /** Clé i18n du libellé — jamais de texte en dur, l'app est bilingue. */
  labelKey: string;
  /** Canaux RGB. Rôle primaire — navigation, bordures actives, CTA. */
  primary: string;
  /** Rôle « argent ». Identique partout, voir MONEY_RGB. */
  money: string;
  /** Rôle mise en avant — badges, chiffres clés. */
  highlight: string;
}

/** Doit rester synchronisé avec les blocs [data-theme] de index.css :
 *  ces valeurs ne servent qu'à peindre l'aperçu du sélecteur en JS, le
 *  rendu réel vient du CSS. Un écart entre les deux se verrait comme une
 *  pastille qui ne correspond pas au thème appliqué. */
const PRIMARY_RGB: Record<Palette, string> = {
  violet: '153 69 255', // #9945FF — palette Solana, défaut historique
  cyan: '34 211 238', // #22D3EE
  coral: '251 113 133', // #FB7185
  aurum: '232 184 75', // #E8B84B — or
  // Atelier garde l'accent violet ("accent conservé", voir index.css) : sa
  // distinction vient du canvas/ink ivoire/encre, pas d'une nouvelle teinte.
  atelier: '153 69 255',
  // Nova — 19/09, palette vive. Voir [data-theme='nova'] dans index.css.
  nova: '255 46 147',
  // Volta / Ember — 21/09, habillages validés (prototype v3). Synchronisé
  // avec les blocs [data-theme='volta'] / [data-theme='ember'] de index.css.
  volta: '16 185 129',
  ember: '255 207 90',
};

const HIGHLIGHT_RGB: Record<Palette, string> = {
  violet: '255 215 0',
  cyan: '165 243 252',
  coral: '253 186 116',
  aurum: '230 214 178', // parchemin
  atelier: '255 215 0',
  nova: '212 255 61',
  volta: '255 207 90',
  ember: '255 138 76',
};

/** Construit sur ALL_PALETTES, PAS sur PALETTES. C'est le point qui rend
 *  la mise au placard de `coral` réellement non destructive : `getTheme()`
 *  cherche dans ce tableau, et ce qu'il n'y trouve pas retombe sur
 *  THEMES[0] (violet). Le dériver de la liste du menu ferait perdre sa
 *  palette à tout profil coral au prochain chargement — la validation par
 *  isPalette() n'y changerait rien, loadTheme() ne l'appelle jamais. */
export const THEMES: ThemeDef[] = ALL_PALETTES.map((id) => ({
  id,
  labelKey: PALETTE_LABEL_KEY[id],
  primary: PRIMARY_RGB[id],
  money: MONEY_RGB,
  highlight: HIGHLIGHT_RGB[id],
}));

/** Sous-ensemble proposé par les sélecteurs. THEMES sert à RÉSOUDRE une
 *  palette (5 entrées), celui-ci à en CHOISIR une (4). */
export const SELECTABLE_THEMES: ThemeDef[] = THEMES.filter((th) =>
  (PALETTES as string[]).includes(th.id)
);

export const DEFAULT_THEME: ThemeId = 'violet';

// ─── Mode clair/sombre ───────────────────────────────────────────────
// Axe INDÉPENDANT de la palette d'accent : une palette = quelle triade de
// couleurs d'accent, un mode = quel fond (canvas/ink). Les deux se
// combinent librement ([data-theme] + [data-mode] sur <html>).
export type Mode = 'dark' | 'light';
export const MODES: Mode[] = ['dark', 'light'];
export const DEFAULT_MODE: Mode = 'dark';

export function isMode(value: unknown): value is Mode {
  return value === 'dark' || value === 'light';
}

const MODE_GLOBAL_KEY = 'buildpact_mode';
const modeWalletKey = (wallet: string) => `buildpact_mode_${wallet}`;

export function loadMode(wallet?: string | null): Mode {
  try {
    const raw =
      (wallet ? localStorage.getItem(modeWalletKey(wallet)) : null) ??
      localStorage.getItem(MODE_GLOBAL_KEY);
    return isMode(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function saveMode(mode: Mode, wallet?: string | null): void {
  try {
    localStorage.setItem(MODE_GLOBAL_KEY, mode);
    if (wallet) localStorage.setItem(modeWalletKey(wallet), mode);
  } catch {
    /* voir saveTheme : échec non bloquant */
  }
}

/** `:root` EST le mode sombre (valeurs historiques) : pas d'attribut posé
 *  pour 'dark', comme pour la palette 'violet' — évite un data-mode="dark"
 *  superflu sur <html> et garde le mode sombre pixel-identique à avant. */
export function applyMode(mode: Mode): void {
  if (typeof document === 'undefined') return;
  if (mode === 'dark') {
    delete document.documentElement.dataset.mode;
  } else {
    document.documentElement.dataset.mode = mode;
  }
}

// ─── Fond de page ────────────────────────────────────────────────────
// Axe visuel INDÉPENDANT de la palette/mode : quel décor derrière le
// contenu (orbes actuelles, grille seule, uni, ou une des 2 variantes
// ajoutées à la demande : aurore / scanlines). Voir DashboardLayout.tsx
// pour le rendu de chaque valeur.
// 30/08 : 3 variantes "HD" avaient été ajoutées — des images à générer, pas
// du CSS procédural comme les 5 autres. ⚠️ **Retirées de la liste le 08/10 :**
// les trois fichiers (`public/backgrounds/{nebula,grid,aurora}-hd.jpg`) n'ont
// jamais été committés et n'existent nulle part sur le disque. Les proposer
// produisait trois requêtes en 404 à chaque ouverture des réglages, et des
// vignettes vides — un contrôle qui ne pouvait rien donner.
//
// Pour les remettre : déposer les 3 .jpg dans `public/backgrounds/`, les
// rajouter à BACKGROUND_STYLES, et rétablir leur cas dans MiniPreview
// (`components/BackgroundSwitch.tsx`). Le test `scripts/assets-exist.test.ts`
// refuse une référence à un fichier absent, donc la référence en dur ne peut
// pas revenir seule.
export type BackgroundStyle =
  | 'orbs'
  | 'grid'
  | 'solid'
  | 'aurora'
  | 'scanlines'
  | 'nebula_hd'
  | 'grid_hd'
  | 'aurora_hd';
export const BACKGROUND_STYLES: BackgroundStyle[] = [
  'orbs',
  'grid',
  'solid',
  'aurora',
  'scanlines',
];
export const DEFAULT_BACKGROUND: BackgroundStyle = 'orbs';

export function isBackgroundStyle(value: unknown): value is BackgroundStyle {
  return (BACKGROUND_STYLES as string[]).includes(value as string);
}

const BG_GLOBAL_KEY = 'buildpact_bg';
const bgWalletKey = (wallet: string) => `buildpact_bg_${wallet}`;

export function loadBackground(wallet?: string | null): BackgroundStyle {
  try {
    const raw =
      (wallet ? localStorage.getItem(bgWalletKey(wallet)) : null) ??
      localStorage.getItem(BG_GLOBAL_KEY);
    return isBackgroundStyle(raw) ? raw : DEFAULT_BACKGROUND;
  } catch {
    return DEFAULT_BACKGROUND;
  }
}

export function saveBackground(bg: BackgroundStyle, wallet?: string | null): void {
  try {
    localStorage.setItem(BG_GLOBAL_KEY, bg);
    if (wallet) localStorage.setItem(bgWalletKey(wallet), bg);
  } catch {
    /* stockage plein/refusé — non bloquant, comme saveTheme/saveMode */
  }
}

// ─── Aperçu grand format (logo/bannière) ───────────────────────────────
// Deux réglages indépendants : activer/désactiver complètement l'aperçu,
// et choisir son déclencheur. Consommés par ImageHoverPreview.tsx.
export type PreviewTrigger = 'hover' | 'click';
export const DEFAULT_PREVIEW_ENABLED = true;
export const DEFAULT_PREVIEW_TRIGGER: PreviewTrigger = 'hover';

const PREVIEW_ENABLED_KEY = 'buildpact_preview_enabled';
const PREVIEW_TRIGGER_KEY = 'buildpact_preview_trigger';

export function loadPreviewEnabled(): boolean {
  try {
    const raw = localStorage.getItem(PREVIEW_ENABLED_KEY);
    return raw === null ? DEFAULT_PREVIEW_ENABLED : raw === 'true';
  } catch {
    return DEFAULT_PREVIEW_ENABLED;
  }
}

export function savePreviewEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PREVIEW_ENABLED_KEY, String(enabled));
  } catch {
    /* non bloquant */
  }
}

export function loadPreviewTrigger(): PreviewTrigger {
  try {
    const raw = localStorage.getItem(PREVIEW_TRIGGER_KEY);
    return raw === 'click' ? 'click' : DEFAULT_PREVIEW_TRIGGER;
  } catch {
    return DEFAULT_PREVIEW_TRIGGER;
  }
}

export function savePreviewTrigger(trigger: PreviewTrigger): void {
  try {
    localStorage.setItem(PREVIEW_TRIGGER_KEY, trigger);
  } catch {
    /* non bloquant */
  }
}

// ─── Intensité des halos/glow ───────────────────────────────────────
// Variable CSS continue (pas data-attribute) : consommée via calc() dans
// les box-shadow existants (index.css .btn-primary/.btn-neon/.card-lift,
// et les glows inline de XpBar/MarketplaceCard/VaultShareGauge) — voir
// leur commentaire "glow-strength" respectif. 3 crans proposés en UI
// (0 / 0.5 / 1) mais la variable accepte n'importe quelle valeur 0-1.
export type GlowStrength = 0 | 0.5 | 1;
export const DEFAULT_GLOW_STRENGTH: GlowStrength = 1;

const GLOW_KEY = 'buildpact_glow_strength';

export function loadGlowStrength(): GlowStrength {
  try {
    const raw = localStorage.getItem(GLOW_KEY);
    if (raw === '0' || raw === '0.5' || raw === '1') return Number(raw) as GlowStrength;
    return DEFAULT_GLOW_STRENGTH;
  } catch {
    return DEFAULT_GLOW_STRENGTH;
  }
}

export function saveGlowStrength(v: GlowStrength): void {
  try {
    localStorage.setItem(GLOW_KEY, String(v));
  } catch {
    /* non bloquant */
  }
}

export function applyGlowStrength(v: GlowStrength): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--glow-strength', String(v));
}

export function getTheme(id: string | null | undefined): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// ─── Persistance ───────────────────────────────────────────────────
// Deux clés : une par wallet, une globale de repli.
//
// Le repli n'est pas un détail : le thème doit s'appliquer AVANT que le
// wallet ne soit connecté (la landing s'affiche sans wallet). Sans clé
// globale, chaque visite démarrerait sur le thème par défaut puis
// basculerait à la connexion — un flash de couleur à chaque chargement.

const GLOBAL_KEY = 'buildpact_theme';
const walletKey = (wallet: string) => `buildpact_theme_${wallet}`;

export function loadTheme(wallet?: string | null): ThemeId {
  try {
    const raw =
      (wallet ? localStorage.getItem(walletKey(wallet)) : null) ??
      localStorage.getItem(GLOBAL_KEY);
    return getTheme(raw).id;
  } catch {
    // localStorage peut lever (mode privé strict, quota, iframe sandboxée).
    // Un thème n'est pas une donnée critique : on retombe silencieusement.
    return DEFAULT_THEME;
  }
}

export function saveTheme(id: ThemeId, wallet?: string | null): void {
  try {
    localStorage.setItem(GLOBAL_KEY, id);
    if (wallet) localStorage.setItem(walletKey(wallet), id);
  } catch {
    /* voir loadTheme : échec non bloquant */
  }
}

/**
 * Applique le thème au document.
 *
 * On pose un attribut `data-theme` sur <html> et c'est CSS qui fait le
 * reste (`[data-theme='cyan'] { --accent-violet-rgb: ... }`). Écrire les
 * variables en JS via `style.setProperty` marcherait aussi, mais couperait
 * la possibilité de définir des règles dérivées en CSS pur — et surtout
 * empêcherait d'appliquer le thème avant l'hydratation de React.
 */
export function applyTheme(id: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', id);
}

// ─── Synchronisation distante ──────────────────────────────────────
// La colonne `builder_profiles.theme_palette` existe déjà côté serveur et
// l'Edge Function `update-profile` la valide contre une liste blanche —
// d'où l'alignement de ce fichier sur ces identifiants.
//
// ⚠️ Une valeur hors liste n'est PAS rejetée par la fonction : elle est
// écrasée en NULL et la réponse reste { ok: true }. Ajouter une palette
// ici sans redéployer update-profile perdrait donc le choix en base sans
// aucune erreur visible.
