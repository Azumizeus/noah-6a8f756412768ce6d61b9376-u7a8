// supabase/functions/rpc/allowlist.ts
// ═══════════════════════════════════════════════════════════════════
// Logique PURE du relais RPC : aucune API Deno, aucun `fetch`, aucun
// `import.meta.env`. Ce fichier est importé DEUX FOIS — par la fonction
// (`index.ts`, sous Deno) et par le garde-fou du dépôt
// (`scripts/rpc-proxy.test.ts`, sous Node). Ce qui n'est pas testable
// hors navigateur finit par ne plus être testé du tout : la validation
// vit donc ici, pas dans le handler.
// ═══════════════════════════════════════════════════════════════════

/**
 * Plafond du corps accepté. Un JSON-RPC Solana légitime pèse quelques
 * centaines d'octets (`getProgramAccounts` avec filtres compris) ; une
 * transaction sérialisée signée tient en ~1,3 Kio au pire. 64 Kio laisse
 * donc une marge confortable tout en fermant la porte à un `sendTransaction`
 * ou un lot géant envoyé pour consommer le quota du nœud dédié.
 */
export const TAILLE_MAX_CORPS = 64 * 1024;

/** Nombre maximum de requêtes dans un lot JSON-RPC. */
export const TAILLE_MAX_LOT = 20;

/**
 * Méthodes servies. Volontairement une LISTE BLANCHE et pas une liste
 * noire : un relais qui accepte tout ce qui n'est pas explicitement
 * interdit est un relais ouvert, et les méthodes JSON-RPC de Solana
 * s'ajoutent au fil des versions du nœud. Ce qui n'est pas ici renvoie
 * une erreur JSON-RPC claire côté client, au lieu de partir consommer
 * la clé du projet.
 *
 * Couvre ce que `@solana/web3.js` et Anchor appellent réellement :
 *   - lecture de comptes : getAccountInfo, getMultipleAccounts,
 *     getProgramAccounts (c'est LUI qui liste les pacts), getBalance,
 *     getTokenAccountBalance, getTokenAccountsByOwner, getSupply…
 *   - construction de transaction : getLatestBlockhash, isBlockhashValid,
 *     getMinimumBalanceForRentExemption, getFeeForMessage, simulateTransaction
 *   - envoi et suivi : sendTransaction, getSignatureStatuses,
 *     getSignaturesForAddress, getTransaction, getBlockHeight, getSlot
 *   - diagnostic : getVersion, getHealth, getGenesisHash, getEpochInfo
 */
export const METHODES_AUTORISEES: ReadonlySet<string> = new Set([
  // ── Comptes et soldes ─────────────────────────────────────────────
  'getAccountInfo',
  'getMultipleAccounts',
  'getProgramAccounts',
  'getBalance',
  'getMinimumBalanceForRentExemption',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTokenAccountsByDelegate',
  'getTokenSupply',
  'getSupply',
  'getLargestAccounts',
  // ── Blocs, slots, temps ───────────────────────────────────────────
  'getLatestBlockhash',
  'getRecentBlockhash',
  'isBlockhashValid',
  'getBlockHeight',
  'getSlot',
  'getEpochInfo',
  'getBlockTime',
  'getBlock',
  'getFirstAvailableBlock',
  'getLeaderSchedule',
  'getTransactionCount',
  // ── Transactions ──────────────────────────────────────────────────
  'getFeeForMessage',
  'simulateTransaction',
  'sendTransaction',
  'getSignatureStatuses',
  'getSignaturesForAddress',
  'getTransaction',
  'getFeeCalculatorForBlockhash',
  // ── Diagnostic ────────────────────────────────────────────────────
  'getVersion',
  'getHealth',
  'getGenesisHash',
  'getIdentity',
  'getClusterNodes',
  'getInflationRate',
]);

/** Une requête JSON-RPC unitaire telle qu'on la relaie. */
export interface RequeteJsonRpc {
  jsonrpc: string;
  id: string | number | null;
  method: string;
  params?: unknown;
}

/**
 * Traduction d'un refus en réponse JSON-RPC. Utiliser l'en-tête HTTP
 * serait un piège : `@solana/web3.js` regarde le code d'erreur DANS le
 * corps (`error.code`) pour décider de tourner vers un autre endpoint.
 * Un refus en 500 HTTP passerait pour une panne du nœud et déclencherait
 * une rotation, ce qui masquerait la vraie cause pendant des heures.
 */
export interface Refus {
  ok: false;
  code: number;
  message: string;
}

export type Verdict =
  | { ok: true; requetes: RequeteJsonRpc[] }
  | Refus;

/** Code JSON-RPC standard « méthode non trouvée ». */
export const CODE_METHODE_INCONNUE = -32601;

/** Code JSON-RPC standard « requête invalide ». */
export const CODE_REQUETE_INVALIDE = -32600;

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Valide UNE requête : forme, puis méthode autorisée.
 *
 * On exige `method` en chaîne et `id` présent (chaîne, nombre, ou `null`
 * pour une notification). Un `id` manquant donnerait une réponse que le
 * client ne saurait pas rattacher à sa requête — il resterait bloqué en
 * attente jusqu'au timeout, ce qui se diagnostique très mal.
 */
function validerUne(v: unknown): RequeteJsonRpc | Refus {
  if (!estObjet(v)) {
    return { ok: false, code: CODE_REQUETE_INVALIDE, message: 'requête JSON-RPC invalide (objet attendu)' };
  }
  const methode = v.method;
  if (typeof methode !== 'string' || methode === '') {
    return { ok: false, code: CODE_REQUETE_INVALIDE, message: 'champ « method » manquant ou non textuel' };
  }
  if (!METHODES_AUTORISEES.has(methode)) {
    return { ok: false, code: CODE_METHODE_INCONNUE, message: `méthode non autorisée par le relais : ${methode}` };
  }
  if (!('id' in v)) {
    return { ok: false, code: CODE_REQUETE_INVALIDE, message: 'champ « id » manquant' };
  }
  const id = v.id;
  if (!(typeof id === 'string' || typeof id === 'number' || id === null)) {
    return { ok: false, code: CODE_REQUETE_INVALIDE, message: 'champ « id » de type inattendu' };
  }
  return {
    ok: true,
    requetes: [
      {
        jsonrpc: typeof v.jsonrpc === 'string' ? v.jsonrpc : '2.0',
        id,
        method: methode,
        ...(v.params === undefined ? {} : { params: v.params }),
      },
    ],
  };
}

/**
 * Valide le corps entier : une requête seule, ou un lot.
 *
 * Un lot est refusé ENTIER dès qu'une de ses requêtes l'est. Servir la
 * moitié d'un lot ferait croire au client que l'autre moitié est passée :
 * un `sendTransaction` silencieusement écarté est bien pire qu'un lot
 * refusé bruyamment.
 */
export function analyserCorps(corps: unknown): Verdict {
  if (Array.isArray(corps)) {
    if (corps.length === 0) {
      return { ok: false, code: CODE_REQUETE_INVALIDE, message: 'lot JSON-RPC vide' };
    }
    if (corps.length > TAILLE_MAX_LOT) {
      return {
        ok: false,
        code: CODE_REQUETE_INVALIDE,
        message: `lot trop grand (${corps.length} requêtes, maximum ${TAILLE_MAX_LOT})`,
      };
    }
    const requetes: RequeteJsonRpc[] = [];
    for (const element of corps) {
      const verdict = validerUne(element);
      if (!verdict.ok) return verdict;
      requetes.push(verdict.requetes[0]);
    }
    return { ok: true, requetes };
  }
  return validerUne(corps);
}

/**
 * Réponse JSON-RPC d'erreur pour un refus. `id` est repris quand il est
 * lisible dans le corps, `null` sinon — la spécification l'autorise et
 * c'est ce qui permet au client de ne pas attendre indéfiniment.
 */
export function reponseRefus(refus: Refus, corps: unknown): string {
  const id =
    estObjet(corps) && (typeof corps.id === 'string' || typeof corps.id === 'number' || corps.id === null)
      ? corps.id
      : null;
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code: refus.code, message: refus.message },
  });
}
