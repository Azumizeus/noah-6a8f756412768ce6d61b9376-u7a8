// src/lib/rpcHealth.ts
// ═══════════════════════════════════════════════════════════════════
// SANTÉ DE L'ENDPOINT RPC PRINCIPAL — rendre visible une bascule qui ne
// l'était pas.
//
// ── Le problème, posé une fois ───────────────────────────────────────
// Depuis le 10/10/2026 l'endpoint par défaut n'est plus un nœud direct
// mais le RELAIS Edge (`/functions/v1/rpc`). Deux replis silencieux en
// découlent :
//
//   1. côté serveur, le relais sert le devnet public si le secret
//      `RPC_UPSTREAM_URL` est absent (délibéré : mieux vaut dégrader que
//      casser) ;
//   2. côté navigateur, `anchor.ts` tourne vers le devnet public dès que
//      le relais ne répond pas (404 si la fonction n'est pas déployée,
//      503 si le déploiement a raté, réseau coupé).
//
// Le second cas a été MESURÉ le 11/10/2026 : fonction non déployée → 404,
// 0 pact affiché, et l'écran ne disait rien. Toute la démonstration passait
// alors par un nœud partagé, throttlé, sans que personne ne le sache.
//
// ── Ce que fait ce module ───────────────────────────────────────────
// Une sonde JSON-RPC (`getVersion`, la méthode la moins chère et la seule
// dont le refus ne veut rien dire d'autre qu'un problème d'endpoint), puis
// un résumé de ce qu'il faut montrer :
//
//   sain            → rien à afficher
//   throttle        → dégradé (l'endpoint répond, il limite)
//   hors-service    → l'endpoint principal ne rend pas de JSON-RPC
//
// ── Pourquoi tout est PUR ici ───────────────────────────────────────
// Aucun DOM, aucun `import.meta.env`, aucun accès aux listes d'endpoints :
// `fetch` est INJECTÉ. C'est la même raison que rpcMask.ts et
// rpcProxy.ts — ce qui n'est pas testable hors navigateur finit par ne
// plus être testé du tout, et c'est précisément la classe de bug qu'on
// corrige (voir scripts/rpc-health.test.ts).
//
// ⚠️ Le résumé masque lui-même les URL (masquerEndpoint) : l'appelant lui
// donne les URL BRUTES et reçoit de quoi afficher. Un bandeau qui recevrait
// des URL brutes finirait par en publier une — la clé du nœud dédié vit
// dans `?api-key=`, et c'est exactement l'incident que rpcMask.ts existe
// pour empêcher.
// ═══════════════════════════════════════════════════════════════════
// ⚠️ Extension `.ts` EXPLICITE, comme profileForm.ts → profile.ts : le
// runner du projet (`node --test`) ne résout pas les imports sans extension.
// Sans ce détail, tout ce module cesserait d'être testable hors navigateur —
// or c'est justement la sonde qu'il faut pouvoir éprouver sans réseau.
import { masquerEndpoint } from './rpcMask.ts';

/**
 * Verdict d'une sonde. Volontairement fin : « il ne répond pas », « il
 * répond une erreur » et « il répond du HTML » demandent trois gestes
 * différents (déployer, changer de plan, corriger l'URL).
 */
export type VerdictSonde =
  | 'sain'
  | 'throttle'
  | 'methode-bridee'
  | 'endpoint-absent'
  | 'endpoint-en-panne'
  | 'pas-du-json'
  | 'erreur-rpc'
  | 'injoignable';

/** Ce que la sonde a observé, prêt à être affiché (« detail » est tronqué). */
export interface SondeRpc {
  verdict: VerdictSonde;
  /** Code HTTP observé ; `0` quand la requête n'a jamais abouti. */
  httpStatus: number;
  /** Extrait court du corps ou du message réseau. Jamais une URL brute. */
  detail: string;
}

/** Longueur maximale de `detail` : un bandeau, pas un dump de réponse. */
export const DETAIL_MAX = 160;

/** Délai au-delà duquel on considère l'endpoint injoignable. */
export const SONDE_TIMEOUT_MS = 4000;

/** Id JSON-RPC de la sonde — reconnaissable dans les journaux du relais. */
export const SONDE_ID = 'buildpact-sante';

function extrait(texte: string): string {
  const propre = texte.replace(/\s+/g, ' ').trim();
  return propre.length > DETAIL_MAX ? `${propre.slice(0, DETAIL_MAX)}…` : propre;
}

/**
 * Classe une réponse HTTP + corps. FONCTION PURE — c'est ici que vit toute
 * la décision, pour qu'elle soit testable sans réseau.
 *
 * L'ordre des tests porte le sens : un relais non déployé rend un 404
 * (identifié comme tel, pas comme « 4xx »), un nœud saturé un 429 (qui doit
 * rester « throttle » et PAS devenir « hors-service », sinon un simple pic
 * de charge allumerait une alerte rouge), un nœud en panne un 5xx.
 */
export function classerReponse(httpStatus: number, corps: string): SondeRpc {
  if (httpStatus === 429) {
    return { verdict: 'throttle', httpStatus, detail: 'HTTP 429' };
  }
  if (httpStatus === 404 || httpStatus === 410) {
    // Cas mesuré : fonction Edge absente. Le chemin existe dans le dépôt,
    // mais Supabase répond « Requested function was not found ».
    return { verdict: 'endpoint-absent', httpStatus, detail: extrait(corps) || `HTTP ${httpStatus}` };
  }
  if (httpStatus >= 500) {
    return { verdict: 'endpoint-en-panne', httpStatus, detail: extrait(corps) || `HTTP ${httpStatus}` };
  }
  if (httpStatus !== 200) {
    // 401/403/405… : l'URL existe mais ne sert pas ce qu'on lui demande.
    // Les regrouper sous « hors-service » évite d'inventer un verdict par
    // code HTTP pour un cas qu'aucun de nos endpoints ne produit.
    return { verdict: 'endpoint-en-panne', httpStatus, detail: extrait(corps) || `HTTP ${httpStatus}` };
  }

  const texte = corps.trim();
  if (!texte) {
    return { verdict: 'pas-du-json', httpStatus, detail: 'corps vide' };
  }

  let charge: unknown;
  try {
    charge = JSON.parse(texte);
  } catch {
    // Un endpoint JSON-RPC qui rend du HTML : c'est une page (SPA, portail
    // d'erreur, mauvaise route) — pas un nœud.
    return { verdict: 'pas-du-json', httpStatus, detail: extrait(texte) };
  }

  if (typeof charge !== 'object' || charge === null || Array.isArray(charge)) {
    return { verdict: 'pas-du-json', httpStatus, detail: extrait(texte) };
  }

  const objet = charge as { result?: unknown; error?: { code?: unknown; message?: unknown } };
  if (objet.error !== undefined) {
    const code = objet.error?.code;
    const message =
      typeof objet.error?.message === 'string' ? objet.error.message : JSON.stringify(objet.error);
    if (code === -32401) {
      // Bridage de méthode côté fournisseur : l'endpoint vit, mais il refuse
      // des appels dont l'application a besoin (getProgramAccounts).
      return { verdict: 'methode-bridee', httpStatus, detail: extrait(message) };
    }
    return { verdict: 'erreur-rpc', httpStatus, detail: extrait(message) };
  }
  if ('result' in objet) {
    return { verdict: 'sain', httpStatus, detail: '' };
  }
  // Objet JSON valide mais ni `result` ni `error` : ce n'est pas une réponse
  // JSON-RPC. Le dire plutôt que de le compter comme un succès.
  return { verdict: 'pas-du-json', httpStatus, detail: extrait(texte) };
}

/**
 * Interroge un endpoint avec `getVersion`. Le `fetch` est INJECTÉ (défaut :
 * celui de l'environnement) — la fonction reste donc utilisable et testable
 * partout, y compris sous Node sans DOM.
 */
export async function sonderEndpoint(
  url: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<SondeRpc> {
  const cible = typeof url === 'string' ? url.trim() : '';
  if (!cible) {
    return { verdict: 'endpoint-absent', httpStatus: 0, detail: 'aucun endpoint configuré' };
  }

  const requete = options?.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!requete) {
    return { verdict: 'injoignable', httpStatus: 0, detail: 'fetch indisponible dans cet environnement' };
  }

  const timeoutMs = options?.timeoutMs ?? SONDE_TIMEOUT_MS;
  const controleur = typeof AbortController === 'function' ? new AbortController() : null;
  const minuteur = controleur ? setTimeout(() => controleur.abort(), timeoutMs) : null;

  try {
    const reponse = await requete(cible, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: SONDE_ID, method: 'getVersion' }),
      ...(controleur ? { signal: controleur.signal } : {}),
    });
    const corps = await reponse.text();
    return classerReponse(reponse.status, corps);
  } catch (e) {
    // Réseau coupé, DNS, CORS, timeout : indiscernables depuis le
    // navigateur, et tous traités pareil — on ne peut pas joindre
    // l'endpoint. Le message d'erreur est conservé (il nomme souvent la
    // cause) mais tronqué.
    const message = e instanceof Error ? e.message : String(e);
    return { verdict: 'injoignable', httpStatus: 0, detail: extrait(message) };
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

// ═══════════════════════════════════════════════════════════════════
// RÉSUMÉ DESTINÉ À L'ÉCRAN
// ═══════════════════════════════════════════════════════════════════

/** Niveau grossier, seul consommé par l'affichage. */
export type NiveauSante = 'inconnu' | 'ok' | 'degrade' | 'hors-service';

/** Cause d'une rotation — structurellement identique à `RotationRpc` de
 *  constants.ts, volontairement redéclarée : ce module ne doit dépendre
 *  d'AUCUN autre module de l'app pour rester testable sous Node. */
export type MotifRotationResume = 'throttle' | 'methode-bridee' | 'relais-injoignable';

export interface RotationResume {
  liste: 'lecture' | 'ecriture';
  depuis: string;
  vers: string;
  motif: MotifRotationResume;
  a: number;
}

/** Entrée du résumé : URL BRUTES, horodatage, et rotation éventuelle. */
export interface EntreeSante {
  sonde: SondeRpc | null;
  primaire: string;
  actif: string;
  /** Prochain endpoint de la liste, celui qui prendra le relais si le
   *  principal échoue. Sert à dire À QUOI s'attendre AVANT la bascule
   *  (mesuré en dev : le bandeau annonçait « aucun repli disponible » alors
   *  que la liste en contenait un, simplement pas encore utilisé). */
  repli?: string;
  rotation?: RotationResume | null;
  verifieA?: number | null;
}

/**
 * Résumé affichable. Les endpoint sont MASQUÉS ici, une fois pour toutes :
 * aucun composant ne reçoit d'URL brute à rendre.
 */
export interface SanteRpc {
  niveau: NiveauSante;
  verdict: VerdictSonde | null;
  /** Origine de l'endpoint principal (`null` si aucun n'est configuré). */
  primaire: string | null;
  /** Origine de l'endpoint réellement utilisé pour les lectures. */
  actif: string | null;
  /** L'endpoint actif n'est pas le principal : une bascule a eu lieu. */
  surRepli: boolean;
  /** Repli disponible si la bascule n'a pas encore eu lieu (`null` si la
   *  liste ne contient qu'un endpoint). */
  repli: string | null;
  rotation: {
    liste: 'lecture' | 'ecriture';
    motif: MotifRotationResume;
    depuis: string | null;
    vers: string | null;
    a: number;
  } | null;
  verifieA: number | null;
}

/** Un verdict utilisable = l'endpoint a rendu une réponse JSON-RPC valide. */
export function estUtilisable(verdict: VerdictSonde): boolean {
  return verdict === 'sain';
}

export function niveauDepuisVerdict(verdict: VerdictSonde): NiveauSante {
  switch (verdict) {
    case 'sain':
      return 'ok';
    // Dégradé : l'endpoint répond, mais mal ou partiellement. À distinguer
    // d'un endpoint mort — on n'alerte pas de la même façon.
    case 'throttle':
    case 'methode-bridee':
    case 'erreur-rpc':
      return 'degrade';
    default:
      return 'hors-service';
  }
}

export function resumerSante(entree: EntreeSante): SanteRpc {
  const primaire = entree.primaire ? masquerEndpoint(entree.primaire) : null;
  const actif = entree.actif ? masquerEndpoint(entree.actif) : null;
  const rotation = entree.rotation
    ? {
        liste: entree.rotation.liste,
        motif: entree.rotation.motif,
        depuis: masquerEndpoint(entree.rotation.depuis),
        vers: masquerEndpoint(entree.rotation.vers),
        a: entree.rotation.a,
      }
    : null;

  return {
    niveau: entree.sonde ? niveauDepuisVerdict(entree.sonde.verdict) : 'inconnu',
    verdict: entree.sonde?.verdict ?? null,
    primaire,
    actif,
    // Comparaison sur les URL BRUTES : deux URL peuvent masquer la même
    // origine tout en étant différentes. Mais quand l'une des deux est
    // absente, on ne peut rien affirmer — d'où le `Boolean`.
    surRepli: Boolean(entree.primaire && entree.actif && entree.primaire !== entree.actif),
    repli: entree.repli ? masquerEndpoint(entree.repli) : null,
    rotation,
    verifieA: entree.verifieA ?? null,
  };
}

/**
 * Faut-il afficher le bandeau ?
 *
 * Trois cas seulement, et le choix est délibéré :
 *  - endpoint principal hors-service → oui, même sans rotation : l'app va
 *    échouer (ou a déjà échoué) et il faut le dire AVANT l'erreur ;
 *  - on tourne sur le repli → oui : la bascule est un événement, pas un
 *    détail interne ; sans ça elle reste invisible toute la session ;
 *  - « dégradé » seul (un 429 passager) → NON. Un bandeau qui s'allume à
 *    chaque pic de charge devient du bruit qu'on n'apprend plus à lire.
 *
 * ⚠️ Une rotation suffit à alerter AVANT même que la sonde ait rendu son
 * verdict (`niveau: 'inconnu'`). C'est volontaire : une bascule observée est
 * un fait, pas une hypothèse — attendre la sonde pour la signaler revient à
 * couvrir exactement la seconde où l'utilisateur voit l'app changer de
 * comportement. Ce qui n'alerte pas, c'est l'ABSENCE de mesure ET l'absence
 * de bascule.
 */
export function doitAlerter(sante: SanteRpc): boolean {
  if (sante.niveau === 'hors-service') return true;
  return sante.surRepli;
}

/** Ce que le bandeau doit écrire : clé i18n + paramètres + clés de cause. */
export interface MessageSante {
  cle: string;
  params: Record<string, string | number>;
  /** Clé i18n du verdict observé (`null` si aucune sonde n'a abouti). */
  verdictCle: string | null;
  /** Clé i18n du motif de rotation (`null` s'il n'y a pas eu rotation). */
  motifCle: string | null;
  /** `alerte` = fond rouge, `info` = fond neutre. */
  ton: 'alerte' | 'info';
}

export const VERDICT_KEYS: Record<VerdictSonde, string> = {
  sain: 'rpcHealth.verdictUp',
  throttle: 'rpcHealth.verdictThrottle',
  'methode-bridee': 'rpcHealth.verdictMethodBlocked',
  'endpoint-absent': 'rpcHealth.verdictMissing',
  'endpoint-en-panne': 'rpcHealth.verdictBroken',
  'pas-du-json': 'rpcHealth.verdictNotJson',
  'erreur-rpc': 'rpcHealth.verdictRpcError',
  injoignable: 'rpcHealth.verdictUnreachable',
};

export const MOTIF_KEYS: Record<MotifRotationResume, string> = {
  throttle: 'rpcHealth.motifThrottle',
  'methode-bridee': 'rpcHealth.motifMethodBlocked',
  'relais-injoignable': 'rpcHealth.motifRelayGone',
};

/**
 * Message à afficher, ou `null` si rien ne doit l'être.
 *
 * On choisit la formulation la plus utile, pas la plus exacte : quand le
 * principal est mort ET qu'on est sur le repli, dire « on tourne sur X »
 * (état actuel, actionnable) prime sur « Y est tombé » (cause, déjà
 * affichée en second plan).
 */
export function messageSante(sante: SanteRpc): MessageSante | null {
  if (!doitAlerter(sante)) return null;

  const verdictCle = sante.verdict ? VERDICT_KEYS[sante.verdict] : null;
  const motifCle = sante.rotation ? MOTIF_KEYS[sante.rotation.motif] : null;
  const base = {
    verdictCle,
    motifCle,
    params: {
      primaire: sante.primaire ?? '',
      actif: sante.actif ?? '',
      repli: sante.repli ?? '',
    },
  };

  if (sante.niveau === 'hors-service' && sante.surRepli) {
    return { ...base, cle: 'rpcHealth.alertFallback', ton: 'alerte' };
  }
  if (sante.niveau === 'hors-service') {
    // Sans bascule encore effectuée, on annonce ce qui va se passer et on
    // nomme le repli — s'il en existe un. Un message qui dit « aucun repli »
    // alors que la liste en contient un envoie l'utilisateur chercher une
    // panne qui n'existe pas.
    return {
      ...base,
      cle: sante.repli ? 'rpcHealth.alertDown' : 'rpcHealth.alertNoFallback',
      ton: 'alerte',
    };
  }
  // Principal vivant mais abandonné à l'exécution : information, pas panne.
  return { ...base, cle: 'rpcHealth.alertRotated', ton: 'info' };
}
