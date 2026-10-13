// src/lib/rpcMask.ts
// ═══════════════════════════════════════════════════════════════════
// RÉDUIRE un endpoint RPC à ce qui ne peut PAS porter de secret.
//
// Pourquoi ce module existe : les deux `console.warn` de rotation
// affichaient l'URL ENTIÈRE — donc `?api-key=<clé>` — dans la console du
// navigateur. Une clé journalisée est une clé publiée : la console est lue
// par le support, recopiée dans les captures d'écran et par toute
// extension un peu curieuse.
//
// ── La règle retenue, et pourquoi c'est la plus étroite ──
// On ne cherche pas « ce qui ressemble à un secret » : on ne garde QUE
// l'origine (`scheme://hôte[:port]`). Trois raisons, chacune tirée d'un
// fournisseur réel :
//
//   - une liste de paramètres à masquer est une liste qu'on oublie de
//     compléter (Helius écrit `api-key`, d'autres écrivent `apikey`, un
//     troisième `token`) ;
//   - QuickNode ne met pas la clé en paramètre mais dans le CHEMIN
//     (`https://<nom>.quiknode.pro/<jeton>/`) — un masquage paramètre par
//     paramètre laisse passer exactement ce cas ;
//   - un hôte, lui, n'en contient pas. Il reste affiché, ce qui préserve
//     l'utilité du message : on veut savoir VERS QUEL endpoint on a tourné,
//     pas avec quelle clé.
//
// En cas d'URL inanalysable, on ne rend JAMAIS l'entrée : une chaîne qui
// n'est pas une URL peut être n'importe quoi, y compris une clé collée
// seule. Le doute se tranche du côté qui ne divulgue pas.
// ═══════════════════════════════════════════════════════════════════

/** Rendu d'une chaîne qui n'est pas une URL exploitable. On ne la recopie
 *  pas : c'est justement le cas où l'entrée peut être une clé nue. */
export const ENDPOINT_ILLISIBLE = '(endpoint illisible)';

/** Rendu d'une absence d'endpoint — distinct d'une URL illisible, pour que
 *  le journal dise la vérité plutôt qu'un message passe-partout. */
export const AUCUN_ENDPOINT = '(aucun)';

/**
 * Réduit un endpoint à son origine. Fonction PURE : ni DOM, ni réseau, donc
 * testable directement (scripts/rpc-mask.test.ts).
 *
 * @param endpoint valeur à rendre affichable
 * @returns `scheme://hôte[:port]`, ou un libellé fixe si l'entrée n'est pas
 *          une URL — jamais l'entrée elle-même.
 */
export function masquerEndpoint(endpoint: unknown): string {
  if (typeof endpoint !== 'string' || endpoint.trim() === '') return AUCUN_ENDPOINT;
  try {
    // `origin` exclut les quatre endroits où un fournisseur peut loger une
    // clé : les identifiants (`user:pass@`), le chemin, la requête et le
    // fragment. Ce qui reste est un hôte, et un hôte ne porte pas de clé.
    return new URL(endpoint).origin;
  } catch {
    return ENDPOINT_ILLISIBLE;
  }
}

export default masquerEndpoint;
