// src/lib/appearance.ts
// ═══════════════════════════════════════════════════════════════════
// Paramètre Apparence — la source de vérité pour le shell premium.
// Une seule clé localStorage partagée : labo #/v2 et app finale lisent
// le même choix.
//
// DEUX axes indépendants, tous deux sur <html> :
//   data-appearance       → la palette/ambiance (ivory/atelier/nordic/solana)
//   data-appearance-mode  → clair ou sombre pour CE shell
//
// ⚠️ Pourquoi un axe de mode SÉPARÉ du legacy (data-mode de lib/theme.ts) :
// le shell premium est CLAIR par défaut, alors que le legacy est SOMBRE par
// défaut (applyMode('dark') supprime carrément l'attribut data-mode). Réutiliser
// data-mode ferait donc basculer les pages premium en sombre pour tout le monde,
// sans qu'aucun utilisateur ne l'ait demandé. Les deux systèmes restent
// cloisonnés : le premium ne lit ni n'écrit data-mode.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useState } from 'react';

export type AppearanceId = 'ivory' | 'atelier' | 'nordic' | 'solana';

export const APPEARANCE_IDS: AppearanceId[] = ['ivory', 'atelier', 'nordic', 'solana'];

/** `swatch` : dégradé de la pastille de choix dans PremiumNav. */
export const APPEARANCE_META: Record<AppearanceId, { label: string; desc: string; swatch: string }> = {
  ivory: {
    label: 'Ivory Ledger',
    desc: 'Violet profond, tech premium — continuité Solana',
    swatch: 'linear-gradient(135deg,#f7f6f3,#c9bffa)',
  },
  atelier: {
    label: 'Atelier Porcelaine',
    desc: 'Papier crème, laiton, serif — contrat notarié 2.0',
    swatch: 'linear-gradient(135deg,#fbf8f2,#d9b960)',
  },
  nordic: {
    label: 'Nordic Frost',
    desc: 'Blanc glacé + aqua unique — data-first, zéro bruit',
    swatch: 'linear-gradient(135deg,#f4f6f8,#8fd4f2)',
  },
  solana: {
    label: 'Solana Mint',
    desc: 'Vert émeraude Solana — frais, on-chain, très lisible',
    swatch: 'linear-gradient(135deg,#f1f8f4,#0e9f6e)',
  },
};

const KEY = 'buildpact.appearance';

export function loadAppearance(): AppearanceId {
  try {
    const v = localStorage.getItem(KEY);
    if (APPEARANCE_META[v as AppearanceId]) return v as AppearanceId;
  } catch {
    /* stockage indisponible */
  }
  return 'ivory';
}

export function saveAppearance(id: AppearanceId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* mode privé : choix de session */
  }
}

/** Attribut appliqué au <html> : les tokens CSS y réagissent. */
export function applyAppearanceToDom(id: AppearanceId): void {
  document.documentElement.setAttribute('data-appearance', id);
}

// ─── Axe clair / sombre du shell premium ──────────────────────────────

export type AppearanceMode = 'light' | 'dark';

const MODE_KEY = 'buildpact.appearance.mode';

/** Clair par défaut : c'est l'ambiance historique du shell premium. */
export function loadAppearanceMode(): AppearanceMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* stockage indisponible */
  }
  return 'light';
}

export function saveAppearanceMode(mode: AppearanceMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* mode privé : choix de session */
  }
}

/** Attribut appliqué au <html> : les tokens premium sombres y réagissent. */
export function applyAppearanceModeToDom(mode: AppearanceMode): void {
  document.documentElement.setAttribute('data-appearance-mode', mode);
}

export function useAppearanceMode(): [AppearanceMode, (m: AppearanceMode) => void] {
  const [mode, setModeState] = useState<AppearanceMode>(() => loadAppearanceMode());
  const setMode = useCallback((m: AppearanceMode) => {
    setModeState(m);
    saveAppearanceMode(m);
    applyAppearanceModeToDom(m);
  }, []);
  return [mode, setMode];
}

export function useAppearance(): [AppearanceId, (id: AppearanceId) => void] {
  const [appearance, setAppearance] = useState<AppearanceId>(() => loadAppearance());
  const setAppearance2 = useCallback((id: AppearanceId) => {
    setAppearance(id);
    saveAppearance(id);
    applyAppearanceToDom(id);
  }, []);
  return [appearance, setAppearance2];
}
