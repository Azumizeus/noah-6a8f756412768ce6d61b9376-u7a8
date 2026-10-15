// supabase/functions/rpc/index.ts
// ═══════════════════════════════════════════════════════════════════
// RELAIS RPC — la clé du nœud dédié ne quitte plus le serveur.
//
// ── Le problème, posé une fois ───────────────────────────────────────
// Toute variable qui commence par `VITE_` est recopiée en clair dans le
// JavaScript envoyé aux visiteurs. L'endpoint dédié vit donc dans le
// bundle public, clé comprise — et il y a des gens dont le métier est de
// lire les bundles publics. Changer la clé ne change rien : la nouvelle
// serait publiée au déploiement suivant.
//
// Cette fonction supprime la cause : le navigateur parle à
// `<projet>.supabase.co/functions/v1/rpc`, qui parle au nœud dédié avec
// la clé lue dans les secrets Supabase. Le JavaScript livré ne contient
// plus aucun endpoint porteur de secret.
//
// ── Ce qu'elle n'est PAS ────────────────────────────────────────────
// Ce n'est pas un relais ouvert. Un relais ouvert sur la clé du projet
// épuiserait le quota du nœud en quelques minutes, et le quota épuisé se
// voit exactement comme une panne. Trois freins, du plus fort au plus
// faible :
//   1. LISTE BLANCHE de méthodes (voir ./allowlist.ts) — ce que
//      l'application appelle, rien de plus ;
//   2. plafond de taille du corps (64 Kio) et de longueur de lot ;
//   3. compteur par IP, en mémoire de l'instance.
// Le troisième est *best-effort* : il ne survit pas à un redémarrage
// d'instance et se contourne en changeant d'IP ou d'en-tête
// `x-forwarded-for`. C'est un frein contre l'abus trivial, pas une
// preuve d'identité — exactement comme le quota de `translate`.
//
// ── Ce qu'il faut configurer ────────────────────────────────────────
// Un seul secret, dans Supabase → Edge Functions → Secrets :
//
//   RPC_UPSTREAM_URL = https://devnet.helius-rpc.com/?api-key=<clé>
//
// ⚠️ Le relais répond TOUJOURS quelque chose d'utile : sans ce secret,
// ou si le nœud dédié est en panne, il sert le devnet public. C'est le
// point le plus important de cette fonction — le frontend n'a plus à
// savoir si le relais est « prêt ». Un relais qui répond « non
// configuré » obligerait le client à gérer un troisième état, et ce
// troisième état serait celui qu'on découvre cassé en démo.
//
// ⚠️ Toujours déployer avec `--no-verify-jwt`, comme les dix autres
// fonctions du projet : un nœud RPC n'a aucun JWT à présenter, et la
// vérification JWT d'une fonction appelée par `@solana/web3.js` — qui ne
// sait poser aucun en-tête d'authentification — la rendrait inutilisable.
// ═══════════════════════════════════════════════════════════════════
import {
  TAILLE_MAX_CORPS,
  analyserCorps,
  reponseRefus,
  type Refus,
} from './allowlist.ts';

/** Nœud dédié, clé comprise. Absent : on sert le devnet public. */
const DEDIE = Deno.env.get('RPC_UPSTREAM_URL')?.trim() ?? '';

/** Nœud public : sans clé, partagé et parfois lent, mais toujours là. */
const DEVNET_PUBLIC = 'https://api.devnet.solana.com';

/**
 * Cibles essayées dans l'ordre. Jamais vide : c'est cette propriété qui
 * garantit qu'un secret oublié dégrade la performance au lieu de casser
 * l'application.
 */
const CIBLES: readonly string[] = [DEDIE, DEVNET_PUBLIC].filter(Boolean);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  // ⚠️ `solana-client` est OBLIGATOIRE, et son absence a coûté un incident :
  // `@solana/web3.js` pose cet en-tête sur CHACUNE de ses requêtes. Un nom
  // absent de cette liste fait échouer le PRÉ-VOL dans le navigateur, qui
  // rend « TypeError: Failed to fetch » — pas une erreur JSON-RPC, un échec
  // de transport. L'application le classe alors « relais injoignable » et
  // tourne vers le devnet public.
  //
  // Mesuré le 12/10/2026, relais déployé : `curl` et les scripts Node
  // répondaient 200, le NAVIGATEUR échouait.
  // `curl -H 'solana-client: js/1.98.2'` reproduit la panne à volonté, et
  // `npm run check:soumission` la vérifie désormais (sonde de pré-vol).
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info, solana-client',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Sans cela, le navigateur ne laisse pas lire l'en-tête de diagnostic.
  'Access-Control-Expose-Headers': 'x-buildpact-relais',
};

/** Plafond par IP, par minute. Une page normale consomme ~10-40 appels. */
const MAX_REQUETES_PAR_MINUTE = 900;

/**
 * Compteur en mémoire de l'instance. `expire` est stocké avec le compte
 * plutôt que de lancer un `setInterval` : une fonction Edge n'a pas de
 * boucle de fond garantie, et un nettoyage périodique disparaîtrait
 * silencieusement au premier redéploiement.
 */
const compteurs = new Map<string, { n: number; expire: number }>();

function depasseQuota(ip: string): boolean {
  const maintenant = Date.now();
  const c = compteurs.get(ip);
  if (!c || c.expire <= maintenant) {
    // Purge opportuniste : sans elle, la table grandit avec le nombre
    // d'IP vues depuis le démarrage de l'instance.
    if (compteurs.size > 5000) compteurs.clear();
    compteurs.set(ip, { n: 1, expire: maintenant + 60_000 });
    return false;
  }
  c.n += 1;
  return c.n > MAX_REQUETES_PAR_MINUTE;
}

/** Origine seule d'une URL — jamais l'entrée, qui peut porter la clé. */
function origine(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '(endpoint illisible)';
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Erreur JSON-RPC (corps) — voir le commentaire de `Refus` : le corps
 *  porte le code, l'HTTP ne sert qu'au transport. */
function erreurJsonRpc(refus: Refus, corps: unknown, httpStatus = 200): Response {
  return new Response(reponseRefus(refus, corps), {
    status: httpStatus,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ─────────────────────────────────────────────────────────────────────
// CORS restreint (15/10/2026). `*` laissait n'importe quel site appeler
// cette fonction depuis le navigateur d'un visiteur. Désormais seule une
// origine de la liste est répercutée ; les autres reçoivent une réponse
// SANS en-tête Access-Control-Allow-Origin (le navigateur la bloque).
// Surcharge possible sans redéployer le code :
//   supabase secrets set ALLOWED_ORIGINS="https://a.example,https://b.example"
// Les appels hors navigateur (curl, serveur) ne sont pas concernés : le
// CORS protège le navigateur, pas l'API — l'auth reste la signature.
// ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  'https://buildpact-solana.vercel.app,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get('Origin');
  const headers = new Headers(res.headers);
  headers.set('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.delete('Access-Control-Allow-Origin');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Taille du corps ──────────────────────────────────────────────
  // On vérifie l'en-tête quand il est présent, ET la longueur réelle une
  // fois lu : un en-tête peut mentir, ou manquer (transfert en morceaux).
  const annonce = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(annonce) && annonce > TAILLE_MAX_CORPS) {
    return erreurJsonRpc(
      { ok: false, code: -32600, message: `corps trop volumineux (maximum ${TAILLE_MAX_CORPS} octets)` },
      null,
      413
    );
  }

  const texte = await req.text();
  if (texte.length > TAILLE_MAX_CORPS) {
    return erreurJsonRpc(
      { ok: false, code: -32600, message: `corps trop volumineux (maximum ${TAILLE_MAX_CORPS} octets)` },
      null,
      413
    );
  }

  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return erreurJsonRpc(
      { ok: false, code: -32700, message: 'JSON illisible' },
      null,
      400
    );
  }

  // ── Quota par IP (best-effort, voir l'en-tête du fichier) ────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnue';
  if (depasseQuota(ip)) {
    // 429 en HTTP ET dans le corps : le corps parle à web3.js (qui
    // tournera vers un autre endpoint), l'HTTP parle au support et aux
    // journaux, qui ne lisent pas les corps.
    return erreurJsonRpc(
      { ok: false, code: -32005, message: 'Quota du relais RPC dépassé pour cette IP — réessaie dans une minute.' },
      corps,
      429
    );
  }

  // ── Liste blanche ────────────────────────────────────────────────
  const verdict = analyserCorps(corps);
  if (!verdict.ok) return erreurJsonRpc(verdict, corps);

  // ── Relais ───────────────────────────────────────────────────────
  // Le corps est renvoyé TEL QUEL : réécrire la réponse (normaliser les
  // `context`, retrier les clés) ferait diverger le relais du nœud, et
  // c'est le genre d'écart qui ne se voit qu'en production.
  //
  // On essaie les cibles dans l'ordre et on s'arrête à la première qui
  // répond. « Répond » veut dire : HTTP 2xx. Un 429 ou un 5xx du nœud
  // dédié n'est PAS une réponse exploitable pour le client — le renvoyer
  // tel quel ferait tourner sa rotation vers le devnet public de toute
  // façon, mais en perdant un aller-retour et en laissant croire que le
  // relais est en panne.
  let derniereErreur: { statut: number; contenu: string } | null = null;

  for (const cible of CIBLES) {
    let amont: Response;
    try {
      amont = await fetch(cible, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: texte,
      });
    } catch (e) {
      console.warn('[rpc] amont injoignable :', origine(cible), e instanceof Error ? e.message : e);
      continue;
    }

    const contenu = await amont.text();
    if (amont.ok) {
      // En-tête de diagnostic : il dit QUELLE cible a servi. Le nom du
      // nœud dédié n'est jamais exposé (son origine peut porter la clé).
      return new Response(contenu, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Buildpact-Relais': cible === DEDIE ? 'dedie' : 'devnet-public',
        },
      });
    }

    console.warn('[rpc] amont', amont.status, 'depuis', origine(cible));
    derniereErreur = { statut: amont.status, contenu };
  }

  // Toutes les cibles ont échoué. Le corps du dernier essai est un
  // JSON-RPC valide : le renvoyer permet au client de lire le vrai code
  // (`-32401`, `-32005`…) plutôt qu'un message générique inventé ici.
  if (derniereErreur) {
    return new Response(derniereErreur.contenu, {
      status: derniereErreur.statut,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return erreurJsonRpc(
    { ok: false, code: -32603, message: 'Aucun nœud RPC joignable depuis le relais.' },
    corps,
    502
  );
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
