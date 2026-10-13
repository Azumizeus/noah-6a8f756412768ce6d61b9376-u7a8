import { PublicKey } from '@solana/web3.js';
import { masquerEndpoint } from './rpcMask';
import { construireUrlProxy } from './rpcProxy';
import { SUPABASE_PROJECT_URL } from './supabaseClient';

export const PROGRAM_ID = new PublicKey('9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ');

// ═══════════════════════════════════════════════════════════════════
// RPC — deux listes distinctes, LECTURE et ÉCRITURE
//
// Pourquoi séparer, alors qu'une seule liste suffisait avant :
//
// Helius refuse `getProgramAccounts` sur cette clé — erreur -32401,
// systématiquement (constaté en curl, en fetch direct, et depuis
// l'application : 100 % des essais, jamais une réussite). C'est un
// bridage côté fournisseur, pas un incident passager : un scan complet
// de programme est coûteux et couramment réservé aux plans supérieurs.
// Or `getProgramAccounts` est l'appel qui liste TOUS les pacts — donc
// la moitié de l'application ne pouvait pas charger.
//
// Le devnet public, lui, répond très bien à `getProgramAccounts`. En
// revanche il throttle (429) dès qu'on lui envoie un volume soutenu, et
// c'est un nœud partagé : moins fiable pour faire atterrir une
// transaction (blockhash périmé, propagation lente).
//
// ⚠️ ÉTAT RÉEL (corrigé le 08/10 — ce commentaire annonçait l'inverse) :
// les deux listes sont aujourd'hui IDENTIQUES, et dans le même ordre —
// nœud dédié d'abord, devnet public en repli. Le 20/09 la liste de LECTURE
// a justement été remise dans cet ordre (voir le commentaire au niveau de
// READ_RPC_ENDPOINTS : le devnet public était passé en 429 quasi permanent).
// La séparation LECTURE/ÉCRITURE reste donc utile comme STRUCTURE, pas comme
// différence de contenu : elle isole deux curseurs de rotation — un 429 en
// lecture ne doit pas déplacer l'endpoint d'écriture — et rend la
// re-divergence ponctuelle si un fournisseur se re-bride un jour.
//
// Ankr a été retiré : `rpc.ankr.com/solana_devnet` ne répond plus (il
// exige désormais une clé). Le laisser en position 2 revenait à faire
// perdre une rotation entière à chaque incident.
//
// ── RELAIS RPC — l'endpoint par DÉFAUT depuis le 10/10/2026 ──────────
// Toute variable `VITE_` est recopiée EN CLAIR dans le JavaScript livré
// aux visiteurs. L'endpoint du nœud dédié portait sa clé dans l'URL :
// elle était donc publiée à chaque visite, et changer la clé n'y
// changeait rien — la nouvelle repartait au déploiement suivant.
//
// Le nœud dédié n'est donc plus lu ici. C'est la fonction Edge
// `supabase/functions/rpc` qui le joint, avec un secret serveur ; le
// navigateur ne connaît que l'URL du relais, qui ne porte aucun secret.
// Le relais répond toujours quelque chose d'utile (nœud dédié si le
// secret existe, devnet public sinon) : un secret oublié dégrade la
// performance au lieu de casser l'application.
//
// ── Pourquoi il n'y a PLUS AUCUN repli sur les variables historiques ──
// `VITE_RPC_ENDPOINT` et `VITE_REACT_APP_SOLANA_RPC_URL` ne sont plus lus
// ici, et c'est délibéré : ce n'est pas une question de priorité.
//
// Vite remplace `import.meta.env.VITE_X` par sa valeur LITTÉRALE au moment
// du build. La chaîne — donc la clé — entre dans le fichier livré même si
// l'expression est le second opérande d'un `||`, même si le code ne
// l'évalue jamais, même si le bundle la garde « pour plus tard ».
// Mesuré le 10/10/2026 : avec un repli direct, `npm run build` produisait
// un `dist/assets/index-*.js` contenant `helius-rpc.com/?api-key=<clé>`
// en clair. La seule façon de ne pas publier une clé est de ne pas
// l'écrire dans le code qui la référence.
//
// Un override reste possible, mais il vient de l'utilisateur à
// l'exécution (CUSTOM_RPC ci-dessous, réglage « power user »), pas d'une
// variable recopiée au build.
// ═══════════════════════════════════════════════════════════════════
const RELAY_RPC = construireUrlProxy(SUPABASE_PROJECT_URL);

/** Le nœud dédié n'est atteint QUE par le relais. Voir ci-dessus. */
const DEDICATED_RPC = RELAY_RPC;

const PUBLIC_DEVNET = 'https://api.devnet.solana.com';

// ═══════════════════════════════════════════════════════════════════
// RPC PERSONNALISÉ — saisi par l'utilisateur (CustomRpcSettings)
//
// Quand il est défini, il passe en TÊTE des deux listes, sans en retirer
// les autres : c'est une préférence, pas un remplacement. La rotation
// (429 / méthode bridée) peut donc s'en échapper vers les endpoints du
// projet — sinon une URL périmée rendrait l'app inutilisable sans moyen
// de revenir en arrière autrement qu'en vidant le localStorage.
//
// ⚠️ Lu UNE SEULE FOIS au chargement du module, comme les autres
// endpoints : enregistrer une URL ne prend effet qu'au RECHARGEMENT de la
// page. C'est volontaire — les listes sont des `const` figées, et une
// lecture dynamique ferait diverger l'endpoint du ConnectionProvider
// (figé, lui) de celui des rotations. Conséquence visible dans
// CustomRpcSettings : après « Enregistrer », `getCustomRpc()` renvoie
// encore l'ancienne valeur jusqu'au reload.
// ═══════════════════════════════════════════════════════════════════
/** Clé localStorage du RPC personnalisé (réglage « power user »). */
const CUSTOM_RPC_KEY = 'buildpact_custom_rpc';

function readCustomRpc(): string {
  try {
    return localStorage.getItem(CUSTOM_RPC_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

const CUSTOM_RPC = readCustomRpc();

/** Valeur actuellement enregistrée (pour pré-remplir le champ de réglage). */
export function getCustomRpc(): string {
  return CUSTOM_RPC;
}

/** Enregistre un RPC personnalisé. Ne prend effet qu'après rechargement. */
export function setCustomRpc(url: string): void {
  try {
    const trimmed = url.trim();
    if (trimmed) localStorage.setItem(CUSTOM_RPC_KEY, trimmed);
    else localStorage.removeItem(CUSTOM_RPC_KEY);
  } catch {
    /* localStorage indisponible — non bloquant */
  }
}

// `new Set(...)` et pas un simple spread : si l'utilisateur saisit
// exactement l'URL du devnet public ou du nœud dédié, elle apparaîtrait
// deux fois dans la liste — la rotation tournerait alors sur le même
// endpoint et perdrait un cran à chaque incident.

/** Lectures (scan de programme, soldes, historique) — nœud dédié d'abord.
 *
 *  ⚠️ Ordre rechangé le 20/09 : le devnet public était en tête (à cause du
 *  -32401 Helius sur getProgramAccounts), mais il est passé en 429 quasi
 *  permanent — même getVersion était refusé. Helius, lui, répond à nouveau
 *  à getProgramAccounts en base64 (vérifié en curl le 20/09 : les pacts
 *  reviennent). Il reprend la tête de la liste ; le devnet public reste en
 *  repli si Helius redevient bridé sur cette méthode. */
export const READ_RPC_ENDPOINTS: string[] = Array.from(
  new Set([CUSTOM_RPC, DEDICATED_RPC, PUBLIC_DEVNET].filter(Boolean))
) as string[];

/** Écritures (envoi + confirmation de transactions) — nœud dédié d'abord. */
export const WRITE_RPC_ENDPOINTS: string[] = Array.from(
  new Set([CUSTOM_RPC, DEDICATED_RPC, PUBLIC_DEVNET].filter(Boolean))
) as string[];

/**
 * Endpoint par défaut du ConnectionProvider. C'est une connexion de LECTURE :
 * tout ce qui passe par `useConnection()` interroge la chaîne (soldes, comptes,
 * historique). Les transactions, elles, ne l'utilisent pas — `buildAndSend()`
 * crée sa propre connexion sur la liste d'écriture.
 */
export const RPC_ENDPOINT = READ_RPC_ENDPOINTS[0];

/** Conservé pour compatibilité : la liste historique = celle d'écriture. */
export const RPC_ENDPOINTS = WRITE_RPC_ENDPOINTS;

// Deux curseurs indépendants : une rotation déclenchée par un 429 en lecture
// ne doit pas déplacer l'endpoint d'écriture (et inversement), sinon un
// incident sur une liste dégrade l'autre sans raison.
let readIndex = 0;
let writeIndex = 0;

// ═══════════════════════════════════════════════════════════════════
// JOURNAL DES ROTATIONS — pourquoi une rotation doit être OBSERVABLE
//
// Jusqu'au 11/10/2026 une rotation n'existait que sous forme d'un
// `console.warn` : le code tournait, la liste changeait, et l'interface
// continuait d'afficher les données du repli sans jamais dire qu'elle
// avait basculé. Le cas mesuré en démo : l'endpoint PRINCIPAL (le relais
// Edge) répond 404, tout passe sur le devnet public — plus lent, partagé,
// throttlé — et rien à l'écran ne l'indique. Un incident silencieux se
// diagnostique à l'œil nu, en pleine démonstration.
//
// On enregistre donc la DERNIÈRE rotation, que le bandeau de santé
// (components/RpcHealthBanner.tsx) lit et affiche. Trois choix à connaître :
//   - une seule rotation mémorisée, pas un historique : l'écran doit dire
//     où l'on tourne MAINTENANT, pas reconstituer une chronologie ;
//   - le motif fait partie de l'enregistrement : « relais injoignable » et
//     « nœud saturé » demandent des gestes différents (déployer la fonction
//     contre attendre) ;
//   - les URL brutes restent INTERNES. Le journal porte bien les URL
//     complètes, parce que comparer deux endpoints demande de les comparer
//     entiers — mais tout affichage passe par `masquerEndpoint()`.
// ═══════════════════════════════════════════════════════════════════

/** Cause d'une rotation, telle que diagnostiquée par l'appelant.
 *
 *  `anchor.ts` est le seul à savoir POURQUOI il tourne : 429 (throttle),
 *  -32401 (méthode bridée) ou transport mort (404/503 du relais, réseau
 *  coupé). Déduire le motif ici, à partir de la seule erreur, obligerait à
 *  réimporter les prédicats qui sont déjà appliqués là-bas. */
export type MotifRotation = 'throttle' | 'methode-bridee' | 'relais-injoignable';

export interface RotationRpc {
  /** Liste concernée : un 429 en lecture ne déplace pas les écritures. */
  liste: 'lecture' | 'ecriture';
  /** Endpoint quitté (URL complète — usage interne uniquement). */
  depuis: string;
  /** Endpoint adopté (URL complète — usage interne uniquement). */
  vers: string;
  motif: MotifRotation;
  /** Horodatage `Date.now()` de la bascule. */
  a: number;
}

let derniereRotation: RotationRpc | null = null;
const abonnesRotation = new Set<(r: RotationRpc) => void>();

/** Dernière rotation observée dans cette session (`null` avant la première). */
export function getDerniereRotation(): RotationRpc | null {
  return derniereRotation;
}

/**
 * S'abonner aux rotations. Rend une fonction de désabonnement.
 *
 * Pourquoi un abonnement et pas un simple état React : la rotation est
 * décidée dans du code non-React (`anchor.ts`, en pleine boucle de retry).
 * Sans notification, aucun composant déjà monté ne se re-rendrait au moment
 * de la bascule — le bandeau n'apparaîtrait qu'au rechargement suivant,
 * c'est-à-dire jamais pendant la démonstration.
 */
export function subscribeRotationsRpc(fn: (r: RotationRpc) => void): () => void {
  abonnesRotation.add(fn);
  return () => {
    abonnesRotation.delete(fn);
  };
}

function enregistrerRotation(rotation: RotationRpc): void {
  derniereRotation = rotation;
  for (const fn of abonnesRotation) {
    try {
      fn(rotation);
    } catch {
      // Un abonné qui jette (composant démonté en plein rendu, port fermé)
      // ne doit jamais interrompre la rotation : c'est une observation, pas
      // une étape du chemin critique. On l'isole plutôt que de le propager.
    }
  }
}

/** Réinitialise le journal — exposé pour les tests, pas utilisé par l'app. */
export function oublierRotations(): void {
  derniereRotation = null;
}

export function getReadRpcEndpoint(): string {
  return READ_RPC_ENDPOINTS[readIndex % READ_RPC_ENDPOINTS.length];
}

export function rotateReadRpc(motif: MotifRotation = 'throttle'): string {
  const depuis = getReadRpcEndpoint();
  readIndex = (readIndex + 1) % READ_RPC_ENDPOINTS.length;
  const vers = getReadRpcEndpoint();
  // ⚠️ `masquerEndpoint` et jamais l'URL brute (09/10/2026) : la liste
  // contient l'endpoint dédié, clé comprise dans `?api-key=`. Le journal
  // doit dire VERS QUEL hôte on a tourné — il n'a aucun besoin de la clé,
  // et une clé affichée dans la console est une clé publiée.
  // La valeur journalisée est relue par le GETTER (et non la variable `vers`)
  // pour que l'appel au getter reste visible dans la ligne : le garde-fou de
  // scripts/rpc-mask.test.ts vérifie que chaque journal de rotation passe par
  // `masquerEndpoint(get…RpcEndpoint())`, et il ne peut le faire que si les
  // deux apparaissent ensemble.
  console.warn('[RPC:read] Rotation vers :', masquerEndpoint(getReadRpcEndpoint()), `(${motif})`);
  enregistrerRotation({ liste: 'lecture', depuis, vers, motif, a: Date.now() });
  return vers;
}

/** Endpoint d'écriture courant (nom historique, conservé pour anchor.ts). */
export function getRpcEndpoint(): string {
  return WRITE_RPC_ENDPOINTS[writeIndex % WRITE_RPC_ENDPOINTS.length];
}

export function rotateRpc(motif: MotifRotation = 'throttle'): string {
  const depuis = getRpcEndpoint();
  writeIndex = (writeIndex + 1) % WRITE_RPC_ENDPOINTS.length;
  const vers = getRpcEndpoint();
  // Même règle que rotateReadRpc() ci-dessus : l'hôte suffit, la clé jamais.
  // Même règle de relecture que rotateReadRpc() ci-dessus, pour la même
  // raison : le garde-fou doit pouvoir vérifier le masquage sur la ligne.
  console.warn('[RPC:write] Rotation vers :', masquerEndpoint(getRpcEndpoint()), `(${motif})`);
  enregistrerRotation({ liste: 'ecriture', depuis, vers, motif, a: Date.now() });
  return vers;
}

/** Lit un message d'erreur sans passer par `any` (tout peut être throw en JS). */
function errorText(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(e);
}

export function isRateLimitError(e: unknown): boolean {
  const msg = errorText(e);
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('Too Many Requests') ||
    msg.includes('-32005') // limite de nœud (web3.js remonte parfois ce code)
  );
}

/**
 * Méthode refusée par le fournisseur (Helius : -32401 sur getProgramAccounts).
 * À distinguer d'un 429 : un throttle se résorbe, un bridage de méthode jamais.
 * Réessayer sur le même endpoint est donc du temps perdu — il faut tourner.
 */
export function isMethodNotAllowedError(e: unknown): boolean {
  const msg = errorText(e);
  return (
    msg.includes('-32401') ||
    msg.includes('not allowed') ||
    msg.includes('is disabled') ||
    msg.includes('Method not found')
  );
}

/**
 * RELAIS injoignable ou mal déployé, plus généralement échec de TRANSPORT
 * (aucun code JSON-RPC dans le corps).
 *
 * Pourquoi ce cas mérite son propre prédicat depuis le 10/10/2026 : le
 * relais a ajouté un saut réseau qui n'existait pas. Une fonction Edge non
 * déployée rend un 404, un déploiement raté un 503, et un réseau coupé un
 * « failed to fetch ». Aucun de ces trois cas n'est un 429 ni un bridage
 * de méthode : sans ce prédicat, les trois tentatives repartaient sur le
 * MÊME relais mort, et l'application échouait sans jamais essayer le
 * devnet public — un endpoint parfaitement fonctionnel, juste après.
 *
 * Tourner immédiatement est donc le bon réflexe, et il n'y a pas de
 * backoff à appliquer : un relais absent ne « se résorbe » pas en 250 ms.
 */
export function isRelayUnavailableError(e: unknown): boolean {
  const msg = errorText(e);
  return (
    msg.includes('Relais RPC') ||
    msg.includes('relais RPC') ||
    msg.includes('Failed to fetch') ||
    msg.includes('failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ERR_NETWORK') ||
    msg.includes('Service Unavailable') ||
    msg.includes('Function not found') ||
    msg.includes('functions/v1/rpc') ||
    // Codes HTTP de transport. Volontairement en fin de liste et sur des
    // motifs précis : un « 404 » nu se rencontre aussi dans des messages
    // sans rapport, et faire tourner pour rien coûte un aller-retour.
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('404 Not Found') ||
    msg.includes('404: Not Found')
  );
}

/** Backoff progressif entre deux tentatives (250ms → 500 → 1000 → 2000, plafonné). */
export function backoffDelayMs(attempt: number): number {
  return Math.min(250 * 2 ** Math.max(0, attempt - 1), 4000);
}

export const MAX_MEMBERS = 8;
export const TOTAL_BPS = 10_000;

export const PROJECT_SEED = 'project';
export const VAULT_SEED = 'vault';
