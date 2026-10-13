// src/lib/pitch.ts
// ═══════════════════════════════════════════════════════════════════
// Description on-chain : couche de LIBELLÉS. Le décodage lui-même vit dans
// `pitchParse.ts` (module pur) et est ré-exporté ici — tous les appelants
// continuent d'importer depuis `lib/pitch`, rien d'autre ne change.
//
// IMPORTANT i18n : la clé entre crochets ([<stage>]) DOIT rester une
// chaîne canonique fixe, indépendante de la langue de l'utilisateur qui
// crée le pact — sinon un pact créé en anglais ne matcherait plus
// STAGE_MAP et perdrait son badge de stage sur la Marketplace. Le libellé
// AFFICHÉ dans le wizard (bouton) peut être traduit ; celui écrit
// on-chain (STAGE_CANONICAL) ne doit jamais l'être. Voir CreatePactWizard.tsx.
// ═══════════════════════════════════════════════════════════════════
import { translate, type Lang } from './i18n/translations';
import type { PactStage } from './pitchParse';

export * from './pitchParse';

function currentLang(): Lang {
  try {
    const stored = localStorage.getItem('buildpact_lang');
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    /* non bloquant */
  }
  return 'fr';
}

/** Libellé du badge de stage affiché sur la Marketplace — traduit selon la langue courante. */
export function stageBadgeLabel(stage: Exclude<PactStage, null>): string {
  const key = stage === 'dev' ? 'marketplaceCard.badgeDev' : stage === 'invest' ? 'marketplaceCard.badgeInvest' : 'marketplaceCard.badgeBoth';
  return translate(currentLang(), key);
}
