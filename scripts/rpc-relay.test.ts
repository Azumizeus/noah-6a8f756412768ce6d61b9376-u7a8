// scripts/rpc-relay.test.ts
// ═══════════════════════════════════════════════════════════════════
// Le relais RPC, exercé POUR DE VRAI — pas relu, exécuté.
//
// `scripts/rpc-proxy.test.ts` vérifie des invariants de forme (l'URL, la
// préférence du client, la liste blanche). Ce fichier-ci va plus loin : il
// CHARGE la fonction Deno et lui envoie de vraies `Request`, avec `fetch`
// remplacé par un espion. C'est ce qui permet de prouver les trois choses
// qu'un simple test de source ne peut pas prouver :
//
//   1. ce qui n'est pas dans la liste blanche n'atteint JAMAIS le nœud
//      dédié (aucun `fetch` émis) ;
//   2. le corps de l'amont est renvoyé TEL QUEL (aucune réécriture) ;
//   3. la clé ne sort jamais de la fonction — ni dans le corps, ni dans un
//      en-tête, ni dans le journal.
//
// ── Comment on charge une fonction Deno sous Node ────────────────────
// La fonction ne touche à Deno que par trois choses : `Deno.serve`, pour
// s'enregistrer, `Deno.env.get`, pour lire son secret, et `fetch`, pour
// joindre l'amont. On fournit les trois AVANT de l'importer — les deux
// premières par un objet `Deno` de test, la troisième par un espion. Le
// module est ensuite importé dynamiquement (un import statique serait
// hissé avant la pose des doublures).
//
// Deux variantes sont chargées, avec et sans secret : ce sont deux
// instances distinctes du module (la chaîne de requête sur le spécifieur
// suffit à les distinguer), donc deux jeux de constantes. C'est ce qui
// permet de tester « secret oublié » et « secret présent » dans le même
// fichier, alors que le secret est lu une seule fois, à l'import.
// ═══════════════════════════════════════════════════════════════════
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

type Handler = (req: Request) => Promise<Response>;

/** Secret factice : la forme d'une clé, sans en être une. */
const CLE_FACTICE = 'cle_de_test_0123456789abcdef';
const AMONT_DEDIE = `https://exemple.invalid/?api-key=${CLE_FACTICE}`;
const AMONT_PUBLIC = 'https://api.devnet.solana.com';

/** Lu par la doublure de `Deno.env.get` — donc modifiable entre deux imports. */
let secretAmont: string | undefined;

/** Dernier handler enregistré par `Deno.serve`. */
let handlerCapture: Handler | null = null;

/** Appels reçus par l'espion `fetch`. */
let appels: { url: string; corps: string }[] = [];

/** Réponses de l'amont, dans l'ordre. Le dernier est rejoué s'il en manque. */
let reponsesAmont: (() => Response)[] = [];

type GlobalAvecDeno = { Deno: unknown; fetch: typeof fetch };
const global = globalThis as unknown as GlobalAvecDeno;

global.Deno = {
  serve: (h: Handler) => {
    handlerCapture = h;
  },
  env: {
    get: (nom: string) => (nom === 'RPC_UPSTREAM_URL' ? secretAmont : undefined),
  },
};

/** Appelée avant CHAQUE import : l'import capture le handler courant. */
function poserDoublures(): void {
  appels = [];
  reponsesAmont = [];
  global.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    appels.push({ url, corps: String(init?.body ?? '') });
    const suite = reponsesAmont[Math.min(appels.length - 1, reponsesAmont.length - 1)];
    if (!suite) throw new Error('espion fetch : aucune réponse programmée');
    return suite();
  }) as typeof fetch;
}

let relaisAvecSecret: Handler;
let relaisSansSecret: Handler;

before(async () => {
  poserDoublures();
  secretAmont = AMONT_DEDIE;
  handlerCapture = null;
  await import('../supabase/functions/rpc/index.ts');
  assert.ok(handlerCapture, 'Deno.serve() n’a pas été appelé au chargement');
  relaisAvecSecret = handlerCapture;

  poserDoublures();
  secretAmont = undefined;
  handlerCapture = null;
  await import('../supabase/functions/rpc/index.ts?sans-secret');
  assert.ok(handlerCapture, 'Deno.serve() n’a pas été appelé au chargement (sans secret)');
  relaisSansSecret = handlerCapture;
});

after(() => {
  delete (globalThis as { Deno?: unknown }).Deno;
});

/** Requête JSON-RPC telle que `@solana/web3.js` l'envoie. */
const ORIGINE_APP = 'https://buildpact-solana.vercel.app';

function requete(corps: unknown, method = 'POST', origine: string | null = ORIGINE_APP): Request {
  return new Request('https://exemple.supabase.co/functions/v1/rpc', {
    method,
    headers: { 'Content-Type': 'application/json', ...(origine ? { Origin: origine } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(corps) } : {}),
  });
}

const OK_AMONT = () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { v: 1 } }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

before(() => {
  reponsesAmont = [OK_AMONT];
});

// ─── 1. Rien d'autre que la liste blanche n'atteint le nœud ──────────

test('le relais refuse une méthode hors liste SANS contacter le nœud', async () => {
  // Le point qui compte : l'endpoint dédié n'est pas seulement « protégé »
  // — il n'est jamais appelé. Une méthode coûteuse refusée ne consomme
  // donc rien du quota du projet.
  reponsesAmont = [OK_AMONT];
  const reponse = await relaisAvecSecret(
    requete({ jsonrpc: '2.0', id: 7, method: 'getVoteAccounts' })
  );

  assert.equal(appels.length, 0, 'l’amont a été contacté pour une méthode refusée');
  assert.equal(reponse.status, 200, 'une erreur JSON-RPC se transporte en HTTP 200');
  const corps = await reponse.json();
  assert.equal(corps.error.code, -32601);
  assert.equal(corps.id, 7, 'l’id doit être repris, sinon le client attend son timeout');
});

test('le relais refuse un lot dont UNE requête est hors liste', async () => {
  reponsesAmont = [OK_AMONT];
  appels = [];
  const reponse = await relaisAvecSecret(
    requete([
      { jsonrpc: '2.0', id: 1, method: 'getAccountInfo' },
      { jsonrpc: '2.0', id: 2, method: 'getVoteAccounts' },
    ])
  );
  assert.equal(appels.length, 0, 'un lot partiellement refusé ne doit rien envoyer');
  assert.equal((await reponse.json()).error.code, -32601);
});

test('une méthode autorisée est bien relayée', async () => {
  reponsesAmont = [OK_AMONT];
  appels = [];
  const reponse = await relaisAvecSecret(
    requete({ jsonrpc: '2.0', id: 1, method: 'getProgramAccounts', params: [] })
  );
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, AMONT_DEDIE, 'l’amont dédié (clé comprise) doit être celui du secret');
  assert.match(appels[0].corps, /getProgramAccounts/);
  assert.equal(reponse.status, 200);
});

// ─── 2. Le corps est renvoyé TEL QUEL ────────────────────────────────

test('le corps de l’amont revient OCTET POUR OCTET', async () => {
  // On renvoie une forme que le relais NE DOIT PAS « améliorer » : si un
  // jour il se met à re-sérialiser, ce test tombe avant la production.
  const brut = '{"jsonrpc":"2.0","id":1,   "result":{"context":{"slot":1},"value":null}}';
  reponsesAmont = [() => new Response(brut, { status: 200 })];
  const reponse = await relaisAvecSecret(
    requete({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [] })
  );
  assert.equal(await reponse.text(), brut);
});

test('le relais annonce QUELLE cible a servi, jamais son URL', async () => {
  reponsesAmont = [OK_AMONT];
  const reponse = await relaisAvecSecret(
    requete({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
  );
  assert.equal(reponse.headers.get('x-buildpact-relais'), 'dedie');
  // L'origine du nœud dédié porte la clé : elle ne doit apparaître nulle part.
  const entetes = [...reponse.headers].flat().join(' ');
  assert.ok(!entetes.includes(CLE_FACTICE));
  assert.ok(!entetes.includes('exemple.invalid'));
});

// ─── 3. Le relais répond TOUJOURS ────────────────────────────────────

test('un 429 du nœud dédié ne remonte pas : on sert le devnet public', async () => {
  reponsesAmont = [
    () => new Response('{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"rate limited"}}', { status: 429 }),
    OK_AMONT,
  ];
  appels = [];
  const reponse = await relaisAvecSecret(
    requete({ jsonrpc: '2.0', id: 1, method: 'getProgramAccounts', params: [] })
  );
  assert.equal(appels.length, 2, 'deux cibles essayées : le dédié, puis le public');
  assert.equal(appels[0].url, AMONT_DEDIE);
  assert.equal(appels[1].url, AMONT_PUBLIC);
  assert.equal(reponse.status, 200, 'le client ne doit jamais voir le 429 du fournisseur');
  assert.equal(reponse.headers.get('x-buildpact-relais'), 'devnet-public');
});

test('SANS secret, le relais sert quand même le devnet public', async () => {
  // La propriété la plus importante du fichier : un secret oublié dégrade
  // la performance, il ne casse pas l'application — et le client n'a donc
  // aucun état « non configuré » à gérer.
  reponsesAmont = [OK_AMONT];
  appels = [];
  const reponse = await relaisSansSecret(
    requete({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [] })
  );
  assert.equal(reponse.status, 200);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, AMONT_PUBLIC);
  assert.equal(reponse.headers.get('x-buildpact-relais'), 'devnet-public');
});

test('si toutes les cibles échouent, le dernier code est propagé', async () => {
  // Ici le client DOIT voir l'échec : c'est ce qui déclenche sa rotation
  // vers un autre endpoint. Avaler l'erreur le laisserait croire au succès.
  reponsesAmont = [
    () => new Response('{"jsonrpc":"2.0","id":1,"error":{"code":-32603}}', { status: 503 }),
    () => new Response('{"jsonrpc":"2.0","id":1,"error":{"code":-32603}}', { status: 502 }),
  ];
  appels = [];
  const reponse = await relaisAvecSecret(
    requete({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
  );
  assert.equal(appels.length, 2);
  assert.equal(reponse.status, 502);
  assert.match(await reponse.text(), /-32603/);
});

test('un amont injoignable (réseau) fait tomber sur la cible suivante', async () => {
  reponsesAmont = [
    () => {
      throw new Error('ECONNREFUSED');
    },
    OK_AMONT,
  ];
  const reponse = await relaisAvecSecret(
    requete({ jsonrpc: '2.0', id: 1, method: 'getHealth' })
  );
  assert.equal(reponse.status, 200);
});

// ─── 4. Garde-fous de transport ──────────────────────────────────────

test('un corps trop volumineux est refusé avant lecture', async () => {
  reponsesAmont = [OK_AMONT];
  appels = [];
  const gros = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: ['x'.repeat(70 * 1024)],
  });
  const reponse = await relaisAvecSecret(
    new Request('https://exemple.supabase.co/functions/v1/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: gros,
    })
  );
  assert.equal(appels.length, 0);
  assert.equal(reponse.status, 413);
});

test('un JSON illisible rend -32700, pas une exception', async () => {
  reponsesAmont = [OK_AMONT];
  appels = [];
  const reponse = await relaisAvecSecret(
    new Request('https://exemple.supabase.co/functions/v1/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ceci n’est pas du JSON',
    })
  );
  assert.equal(appels.length, 0);
  assert.equal(reponse.status, 400);
  assert.equal((await reponse.json()).error.code, -32700);
});

test('OPTIONS répond le pré-vol CORS, et un GET est refusé', async () => {
  const prevol = await relaisAvecSecret(requete(null, 'OPTIONS'));
  assert.equal(prevol.status, 200);
  // 15/10/2026 : plus de `*` — l'origine de l'app est répercutée, pas un joker.
  assert.equal(prevol.headers.get('access-control-allow-origin'), ORIGINE_APP);
  assert.match(prevol.headers.get('access-control-expose-headers') ?? '', /x-buildpact-relais/);

  // ⚠️ Régression du 12/10/2026, trouvée dans le NAVIGATEUR après un
  // déploiement réussi : `solana-client` manquait dans cette liste.
  // `@solana/web3.js` pose cet en-tête sur chacune de ses requêtes, le
  // pré-vol échouait donc côté navigateur (« TypeError: Failed to fetch »),
  // l'application classait le relais « injoignable » et tournait vers le
  // devnet public — pendant que `curl` et tous les scripts Node répondaient
  // 200. Le pré-vol doit autoriser TOUT ce que le client envoie : sinon le
  // relais est déployé pour rien, et aucun test côté Node ne le voit.
  const autorises = (prevol.headers.get('access-control-allow-headers') ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase());
  for (const enTete of ['content-type', 'apikey', 'authorization', 'x-client-info', 'solana-client']) {
    assert.ok(
      autorises.includes(enTete),
      `en-tête refusé au pré-vol : ${enTete} (autorisés : ${autorises.join(', ')})`
    );
  }

  const get = await relaisAvecSecret(requete(null, 'GET'));
  assert.equal(get.status, 405);
});

test('une réponse normale porte AUSSI les en-têtes CORS', async () => {
  // Le pré-vol seul ne suffit pas : si la réponse réelle n'expose pas
  // l'origine, le navigateur bloque la lecture du CORPS — le relais
  // répondrait 200 et l'application ne verrait rien.
  reponsesAmont = [OK_AMONT];
  const reponse = await relaisAvecSecret(requete({ jsonrpc: '2.0', id: 1, method: 'getVersion' }));
  assert.equal(reponse.status, 200);
  assert.equal(reponse.headers.get('access-control-allow-origin'), ORIGINE_APP);
  assert.equal(reponse.headers.get('x-buildpact-relais'), 'dedie');
});

test("CORS restreint : une origine étrangère ou absente ne reçoit AUCUN Allow-Origin", async () => {
  // 15/10/2026 — `*` laissait n'importe quel site lire le relais depuis le
  // navigateur d'un visiteur. Le joker ne doit jamais revenir.
  for (const origine of ['https://site-malveillant.example', 'http://localhost:9999', null]) {
    reponsesAmont = [OK_AMONT];
    const pre = await relaisAvecSecret(requete(null, 'OPTIONS', origine));
    assert.equal(pre.headers.get('access-control-allow-origin'), null, `pré-vol, origine ${origine}`);
    reponsesAmont = [OK_AMONT];
    const rep = await relaisAvecSecret(
      requete({ jsonrpc: '2.0', id: 1, method: 'getVersion' }, 'POST', origine)
    );
    assert.equal(rep.headers.get('access-control-allow-origin'), null, `réponse, origine ${origine}`);
    assert.notEqual(rep.headers.get('access-control-allow-origin'), '*');
  }
  // L'origine de dev local reste autorisée.
  const dev = await relaisAvecSecret(requete(null, 'OPTIONS', 'http://localhost:5173'));
  assert.equal(dev.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(dev.headers.get('vary'), 'Origin');
});
