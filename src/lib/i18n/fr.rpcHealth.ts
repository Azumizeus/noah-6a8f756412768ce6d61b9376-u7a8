// src/lib/i18n/fr.rpcHealth.ts
// Namespace `rpcHealth` — bandeau de santé de l'endpoint RPC principal.
// Voir lib/rpcHealth.ts pour la logique, components/RpcHealthBanner.tsx pour
// le rendu. Les clés `verdict*` et `motif*` sont référencées par
// VERDICT_KEYS / MOTIF_KEYS : renommer une clé ici casse le bandeau, c'est
// pourquoi scripts/rpc-health.test.ts vérifie que les deux dictionnaires les
// portent tous.
import type { Dict } from './types';

export const frRpcHealth: Dict = {
  // Bandeau
  title: 'Endpoint RPC principal indisponible',
  titleDegraded: 'Endpoint RPC principal en service dégradé',
  alertFallback:
    "L'application tourne sur le repli — {{actif}} — au lieu de l'endpoint prévu ({{primaire}}). Les lectures peuvent être plus lentes ou limitées.",
  alertDown:
    "L'endpoint prévu ({{primaire}}) ne répond pas. Les lectures basculeront sur le repli — {{repli}} — au prochain appel, ce qui peut être plus lent ou limité.",
  alertNoFallback:
    "L'endpoint prévu ({{primaire}}) ne répond pas et la liste n'a aucun autre endpoint. Les données on-chain ne se chargeront pas.",
  alertRotated:
    "Une rotation a eu lieu en cours de session : les lectures passent par {{actif}} au lieu de {{primaire}}.",
  reason: 'Cause : {{reason}}',
  checkedAt: 'Vérifié à {{time}}',
  retry: 'Revérifier',
  checking: 'Vérification…',
  settings: 'Configurer un RPC',
  hide: 'Masquer pour cette session',

  // Verdicts de la sonde
  verdictUp: 'endpoint joignable',
  verdictThrottle: 'nœud saturé (429) — il limite le débit',
  verdictMethodBlocked: 'méthode refusée par le fournisseur (-32401)',
  verdictMissing: "l'URL ne sert aucune fonction JSON-RPC (404) — relais non déployé ?",
  verdictBroken: 'endpoint en erreur (réponse 5xx ou refus)',
  verdictNotJson: "la réponse n'est pas du JSON-RPC (page HTML ou mauvaise URL)",
  verdictRpcError: 'erreur JSON-RPC renvoyée par le nœud',
  verdictUnreachable: 'endpoint injoignable (réseau, DNS, CORS ou délai dépassé)',

  // Motifs de rotation (vus par constants.ts)
  motifThrottle: 'nœud saturé (429)',
  motifMethodBlocked: 'méthode refusée par le fournisseur',
  motifRelayGone: 'relais injoignable (404/503 ou réseau coupé)',
};
