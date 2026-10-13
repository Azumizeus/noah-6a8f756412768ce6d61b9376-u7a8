// src/pages/premium/projectCardMedia.ts
// ═══════════════════════════════════════════════════════════════════
// Logique PURE du bloc média des cartes projet premium (bannière + logo).
//
// ⚠️ Pourquoi ce fichier existe : l'onglet Pacts affichait ses cartes sans
// aucune bannière alors que Dashboard et Marketplace les affichaient — le
// bloc média était recopié dans les trois pages et avait divergé (voir le
// fix du 08/10 : « fix(premium): affiche les bannières projet en vue cartes
// de l'onglet Pacts »). Ces décisions (image ou repli, hauteur, dégradé,
// logo) sont isolées ici, sans JSX ni DOM, pour être testables par
// `node --test` (même approche que src/lib/profileForm.ts) et pour que le
// composant partagé PremiumProjectCard n'ait plus qu'à les consommer.
// ═══════════════════════════════════════════════════════════════════

/** Densité de la vue cartes (voir src/lib/listingView.ts). */
export type CardSize = 'large' | 'small';

export interface BannerResolution {
  /** URL d'image à afficher, ou null si on retombe sur la lettre de repli. */
  imageUrl: string | null;
  /** Lettre affichée au centre quand aucune bannière n'est disponible. */
  fallbackLetter: string;
}

/** Une URL « vide » (absente, null, ou seulement des espaces) ne compte pas. */
function usableUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.trim().length > 0 ? url : null;
}

/**
 * Décide quoi afficher dans la bannière d'une carte projet : l'image du
 * projet si elle existe, sinon la première lettre de son titre. C'est
 * exactement la branche que l'onglet Pacts avait perdue.
 */
export function resolveBanner(
  bannerUrl: string | null | undefined,
  title: string
): BannerResolution {
  const trimmed = title.trim();
  return {
    imageUrl: usableUrl(bannerUrl),
    fallbackLetter: (trimmed.charAt(0) || '?').toUpperCase(),
  };
}

/** Hauteur de la bannière (px) selon la densité de la vue. */
export function bannerHeight(size: CardSize): number {
  return size === 'small' ? 64 : 96;
}

/**
 * Dégradé de repli : teinte d'accent tant que le pact recrute, teinte de
 * succès une fois finalisé.
 *
 * ⚠️ Aucun hex ici, uniquement des tokens `--p-*` (chantier 4). Le dégradé
 * était écrit en dur (`#10081c…#3E2496`) : il ignorait donc la palette ET le
 * mode sombre, et restait violet même en thème Atelier (or) ou Solana
 * (émeraude). Les tokens suivent les deux axes gratuitement.
 *
 * Les teintes sont CLAIRES (`--p-*-soft`) et non les couleurs pleines : le
 * repli n'affiche pas seulement une lettre, il sert aussi de fond derrière
 * le logo. Un aplat saturé (`--p-accent` des palettes claires : #4c21c4)
 * rendrait la pastille de logo illisible. La couleur pleine n'arrive qu'en
 * fin de dégradé, mélangée — assez de matière pour être vu, pas assez pour
 * écraser ce qui se pose dessus.
 */
export function bannerFallbackGradient(isOpen: boolean): string {
  const soft = isOpen ? 'var(--p-accent-soft)' : 'var(--p-ok-soft)';
  const solid = isOpen ? 'var(--p-accent)' : 'var(--p-ok)';
  return `linear-gradient(120deg, var(--p-panel) 0%, ${soft} 55%, color-mix(in srgb, ${solid} 42%, ${soft}) 100%)`;
}

/**
 * Encre de la lettre de repli, quand il n'y a ni bannière ni logo.
 * Elle aussi dépend du statut : elle se pose sur le dégradé ci-dessus, dont
 * la teinte change. Un blanc fixe (l'ancienne valeur `rgba(255,255,255,.35)`)
 * disparaîtrait sur les palettes claires.
 */
export function bannerFallbackInk(isOpen: boolean): string {
  return isOpen ? 'var(--p-accent)' : 'var(--p-ok)';
}

/**
 * Style de l'image de bannière.
 *
 * ⚠️ Pourquoi l'image est ABSOLUE et non un enfant de grille dimensionné :
 * le conteneur est `display: grid; place-items: center` (pour centrer la
 * lettre de repli) et haut de 96 px. Un `<img width:100%; height:100%>` y
 * voyait sa hauteur résolue contre la PISTE de grille — elle-même calculée
 * d'après le contenu — et prenait donc sa hauteur d'après son ratio naturel :
 * une bannière carrée (1024×1024) débordait de 208 px et recouvrait le titre,
 * la description et les chiffres de la carte (constaté le 08/10). En sortant
 * l'image du flux de la grille, elle ne peut plus dicter la hauteur.
 */
export function bannerImageStyle(): {
  position: 'absolute';
  inset: number;
  width: string;
  height: string;
  objectFit: 'cover';
} {
  return { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
}

/** Logo du projet à superposer sur la bannière, ou null s'il n'y en a pas. */
export function resolveLogo(logoUrl: string | null | undefined): string | null {
  return usableUrl(logoUrl);
}
