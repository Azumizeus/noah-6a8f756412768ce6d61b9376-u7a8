// src/lib/rpcProxy.ts
// ═══════════════════════════════════════════════════════════════════
// Construit l'URL du RELAIS RPC (Supabase Edge Function `rpc`).
//
// Pourquoi ce module séparé alors qu'une concaténation suffirait : la
// seule partie délicate est ce qu'on fait d'une valeur ABSENTE ou
// MALFORMÉE. Rendre une URL vide dans ce cas (et non une chaîne
// bancale) est ce qui permet à `constants.ts` de retomber proprement
// sur le devnet public au lieu d'appeler `undefined/functions/v1/rpc`.
//
// Fonction PURE : ni DOM, ni `import.meta.env`, ni dépendance. C'est ce
// qui la rend testable hors navigateur — même raison que `rpcMask.ts`.
// ═══════════════════════════════════════════════════════════════════

/** Chemin de la fonction Edge, tel que Supabase l'expose. */
export const CHEMIN_RELAIS = '/functions/v1/rpc';

/**
 * URL du relais à partir de l'URL du projet Supabase.
 *
 * @param base `https://<projet>.supabase.co` (ou toute configuration
 *             auto-hébergée équivalente). Toute autre valeur — `null`,
 *             `undefined`, chaîne vide, texte qui n'est pas une URL
 *             http(s) — rend une chaîne VIDE, jamais un chemin relatif :
 *             un `Connection` de web3.js construit sur une URL relative
 *             échouerait avec un message qui ne dit pas d'où il vient.
 */
export function construireUrlProxy(base: string | null | undefined): string {
  if (typeof base !== 'string') return '';
  const propre = base.trim().replace(/\/+$/, '');
  if (!propre) return '';
  try {
    const url = new URL(propre);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  } catch {
    return '';
  }
  return `${propre}${CHEMIN_RELAIS}`;
}

export default construireUrlProxy;
