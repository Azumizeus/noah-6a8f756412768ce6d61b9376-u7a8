// scripts/rpc-proxy.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fous du RELAIS RPC (10/10/2026).
//
// Contexte. L'endpoint dédié portait sa clé dans l'URL, et toute
// variable `VITE_` part en clair dans le JavaScript livré : la clé était
// donc publiée à chaque visiteur de l'application. La migration vers une
// fonction Edge la remet côté serveur — mais une migration se DÉFAIT
// toute seule au premier refactor distrait. Ces tests tiennent les trois
// points qui, s'ils cassent, remettent la clé dans le bundle ou coupent
// l'application :
//
//   1. `construireUrlProxy()` est PURE et rend une chaîne VIDE sur une
//      entrée douteuse — c'est ce qui évite un `Connection` construit sur
//      `undefined/functions/v1/rpc` ;
//   2. `src/lib/constants.ts` préfère le RELAIS à l'endpoint direct, et
//      n'accepte les variables historiques qu'en repli ;
//   3. la fonction Edge valide ce qu'elle relaie (liste blanche) et lit
//      son amont dans un SECRET, jamais dans le dépôt.
//
// ── Pourquoi les valeurs de test sont ASSEMBLÉES ─────────────────────
// Même raison que dans scripts/rpc-mask.test.ts : ce fichier est scanné
// par scripts/secret-scan.test.ts comme les autres. Une fausse clé est
// indiscernable d'une vraie par sa forme, donc l'écrire en clair ferait
// échouer `npm test`. La concaténation à l'exécution exerce les règles
// sans jamais armer le détecteur.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { construireUrlProxy, CHEMIN_RELAIS } from '../src/lib/rpcProxy.ts';
import {
  METHODES_AUTORISEES,
  TAILLE_MAX_LOT,
  CODE_METHODE_INCONNUE,
  analyserCorps,
  reponseRefus,
} from '../supabase/functions/rpc/allowlist.ts';

/** Assemble une chaîne sans l'écrire en clair (voir l'en-tête). */
const F = (...morceaux: string[]): string => morceaux.join('');

const lire = (chemin: string): string =>
  readFileSync(new URL(chemin, import.meta.url), 'utf8');

/** Chemins relatifs (depuis scripts/) de tout le code LIVRÉ au navigateur.
 *  `git ls-files` et pas un parcours de dossier : un fichier non suivi est
 *  un fichier qui ne part pas en production, et le bruit des artefacts
 *  locaux (dist/, node_modules) ferait abandonner ce contrôle. */
function fichiersDeSrc(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
}

// ─── 1. Le constructeur d'URL du relais ──────────────────────────────

test('construireUrlProxy : le cas nominal et la barre oblique finale', () => {
  assert.equal(
    construireUrlProxy('https://exemple.supabase.co'),
    `https://exemple.supabase.co${CHEMIN_RELAIS}`
  );
  assert.equal(
    construireUrlProxy('https://exemple.supabase.co/'),
    `https://exemple.supabase.co${CHEMIN_RELAIS}`,
    'une barre oblique finale ne doit pas produire « //functions/v1/rpc »'
  );
  assert.equal(
    construireUrlProxy('  https://exemple.supabase.co///  '),
    `https://exemple.supabase.co${CHEMIN_RELAIS}`,
    'les espaces et les barres multiples viennent d’une variable d’env recopiée à la main'
  );
});

test('construireUrlProxy : toute entrée douteuse rend une chaîne VIDE', () => {
  // Le point de ce test : rendre '' permet le repli sur le devnet public.
  // Rendre quelque chose de bancal produirait un `Connection` qui échoue
  // plus tard, avec un message qui ne dit pas d'où il vient.
  for (const entree of [
    undefined,
    null,
    '',
    '   ',
    'exemple.supabase.co', // pas de schéma
    'ftp://exemple.supabase.co', // pas du http(s)
    'https://exemple supabase.co', // espace au milieu
    '/functions/v1/rpc', // chemin relatif
  ]) {
    assert.equal(
      construireUrlProxy(entree as string | null | undefined),
      '',
      `entrée acceptée à tort : ${String(entree)}`
    );
  }
});

test('construireUrlProxy : le relais ne porte AUCUN secret', () => {
  // Si un jour quelqu'un « simplifie » en collant l'endpoint dédié ici,
  // la clé repartirait dans le bundle — c'est exactement la régression
  // que ce test doit attraper.
  const url = construireUrlProxy('https://exemple.supabase.co');
  assert.ok(url.endsWith(CHEMIN_RELAIS));
  assert.ok(!url.includes('?'), 'une URL de relais ne porte pas de requête');
  assert.ok(!url.includes('api-key'));
  assert.ok(!url.includes('api_key'));
});

// ─── 2. Le client préfère le relais ──────────────────────────────────

test('constants.ts : le relais est la SEULE source de l’endpoint', () => {
  const src = lire('../src/lib/constants.ts');
  assert.match(
    src,
    /const DEDICATED_RPC = RELAY_RPC;/,
    'constants.ts doit prendre le relais, sans alternative construite au build'
  );
  assert.match(
    src,
    /from '\.\/rpcProxy'/,
    'constants.ts doit construire l’URL du relais par construireUrlProxy()'
  );
});

test('AUCUN fichier de src ne lit une variable VITE_RPC_*', () => {
  // ⚠️ C'est LE test de cette migration, et il porte sur la CAUSE, pas sur
  // l'ordre d'un `||`. Vite remplace `import.meta.env.VITE_X` par sa valeur
  // LITTÉRALE au build : la clé entre dans le fichier livré même si
  // l'expression est le second opérande d'un `||` et n'est jamais évaluée.
  // Mesuré le 10/10/2026 — un repli direct produisait bel et bien
  // `helius-rpc.com/?api-key=<clé>` dans `dist/assets/index-*.js`.
  //
  // La règle qui en découle est binaire : pour qu'une clé ne soit pas
  // publiée, aucun code livré ne doit RÉFÉRENCER la variable qui la porte.
  // Un override reste possible — mais à l'exécution (CUSTOM_RPC), jamais
  // par une variable recopiée au build.
  const interdits = /import\.meta\.env\.(VITE_RPC_|VITE_REACT_APP_SOLANA_RPC_URL)/;
  const coupables = fichiersDeSrc().filter((f) => interdits.test(lire(`../${f}`)));
  assert.deepEqual(
    coupables,
    [],
    'ces fichiers référencent un endpoint RPC par variable d\u2019environnement — Vite y inscrira la clé en clair au build'
  );
});

test('l’artefact livré ne contient aucun endpoint porteur de clé', (t) => {
  // Contrôle au niveau de l'ARTEFACT : c'est le seul qui voie ce que le
  // navigateur reçoit réellement (les sources peuvent être propres et le
  // bundle sale, via un `.env.local` oublié).
  const assets = new URL('../dist/assets/', import.meta.url);
  if (!existsSync(assets)) {
    return t.skip('dist/ absent — `npm run build` avant de faire ce contrôle');
  }
  const js = readdirSync(assets).filter((f) => f.endsWith('.js'));
  assert.ok(js.length > 0, 'dist/assets existe mais ne contient aucun .js');
  for (const f of js) {
    const contenu = lire(`../dist/assets/${f}`);
    // On cherche une VALEUR, pas le mot : le champ « RPC personnalisé » des
    // Paramètres porte légitimement `?api-key=...` en guise d'exemple, et
    // c'est la seule occurrence tolérée. Un secret réel a des caractères
    // après le `=`.
    const fuite = contenu.match(/api-?key=[A-Za-z0-9_-]{8,}/g) ?? [];
    assert.deepEqual(
      fuite.slice(0, 3),
      [],
      `${f} contient un endpoint porteur de clé : la clé serait publiée avec le site`
    );
  }
});

test('anchor.ts : un relais injoignable fait TOURNER, en lecture comme en écriture', () => {
  // Sans cela, une fonction Edge absente (404) laissait les 3 tentatives
  // sur le même relais mort et l'application échouait sans avoir essayé
  // le devnet public, qui fonctionnait.
  const src = lire('../src/lib/anchor.ts');
  const appels = src.match(/isRelayUnavailableError\(e\)/g) ?? [];
  assert.ok(
    appels.length >= 2,
    `attendu au moins 2 emplois (lecture + écriture), ${appels.length} trouvé(s)`
  );
  assert.match(src, /^\s*isRelayUnavailableError,$/m, 'le prédicat doit être importé');
  assert.match(src, /from '\.\/constants'/);
});

// ─── 3. La fonction Edge refuse ce qu'elle ne sert pas ───────────────

test('le relais ne sert que des méthodes de la liste blanche', () => {
  for (const methode of ['getProgramAccounts', 'sendTransaction', 'getLatestBlockhash', 'getAccountInfo']) {
    assert.ok(METHODES_AUTORISEES.has(methode), `méthode nécessaire absente : ${methode}`);
  }
  assert.equal(
    METHODES_AUTORISEES.has('requestAirdrop'),
    false,
    'requestAirdrop distribue des SOL : à n’ouvrir qu’en connaissance de cause'
  );
  assert.equal(METHODES_AUTORISEES.has('getVoteAccounts'), false);
});

test('analyserCorps : accepte une requête, refuse le reste avec un code JSON-RPC', () => {
  const ok = analyserCorps({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [] });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.requetes.length, 1);
    assert.equal(ok.requetes[0].method, 'getAccountInfo');
  }

  const refus = analyserCorps({ jsonrpc: '2.0', id: 1, method: 'getVoteAccounts' });
  assert.equal(refus.ok, false);
  if (!refus.ok) {
    assert.equal(refus.code, CODE_METHODE_INCONNUE);
    assert.match(refus.message, /getVoteAccounts/);
  }
});

test('analyserCorps : un lot est refusé ENTIER si une requête est refusée', () => {
  // Servir la moitié d'un lot ferait croire au client que l'autre moitié
  // est passée : un `sendTransaction` silencieusement écarté est bien pire
  // qu'un lot refusé bruyamment.
  const verdict = analyserCorps([
    { jsonrpc: '2.0', id: 1, method: 'getAccountInfo' },
    { jsonrpc: '2.0', id: 2, method: 'getVoteAccounts' },
  ]);
  assert.equal(verdict.ok, false);
});

test('analyserCorps : les lots trop grands et les formes invalides sont refusés', () => {
  const trop = Array.from({ length: TAILLE_MAX_LOT + 1 }, (_, i) => ({
    jsonrpc: '2.0',
    id: i,
    method: 'getAccountInfo',
  }));
  assert.equal(analyserCorps(trop).ok, false);
  assert.equal(analyserCorps([]).ok, false);
  assert.equal(analyserCorps('texte').ok, false);
  assert.equal(analyserCorps(null).ok, false);
  assert.equal(analyserCorps({ jsonrpc: '2.0', id: 1 }).ok, false, 'method manquant');
  assert.equal(analyserCorps({ jsonrpc: '2.0', method: 'getAccountInfo' }).ok, false, 'id manquant');
  assert.equal(
    analyserCorps({ jsonrpc: '2.0', id: {}, method: 'getAccountInfo' }).ok,
    false,
    'id d’un type inattendu'
  );
});

test('reponseRefus : l’id est REPRIS quand il est lisible', () => {
  // C'est ce qui évite qu'un client JSON-RPC attende jusqu'au timeout une
  // réponse qu'il ne saurait pas rattacher à sa requête.
  const avec = JSON.parse(reponseRefus({ ok: false, code: -32601, message: 'x' }, { id: 42 }));
  assert.equal(avec.id, 42);
  assert.equal(avec.error.code, -32601);
  assert.equal(avec.jsonrpc, '2.0');

  const sansId = JSON.parse(reponseRefus({ ok: false, code: -32700, message: 'y' }, 'pas-un-objet'));
  assert.equal(sansId.id, null);
});

// ─── 4. La fonction lit son amont dans un SECRET ─────────────────────

test('la fonction rpc lit son amont dans les secrets, jamais dans le code', () => {
  const src = lire('../supabase/functions/rpc/index.ts');
  assert.match(
    src,
    /Deno\.env\.get\('RPC_UPSTREAM_URL'\)/,
    'l’endpoint dédié (clé comprise) doit venir d’un secret Supabase'
  );
  // Aucune URL de fournisseur en dur DANS LE CODE : la seule constante
  // autorisée est le devnet public, qui ne porte pas de clé — et c'est ce
  // repli qui garantit qu'un secret oublié dégrade au lieu de casser.
  //
  // Les lignes de commentaire sont retirées avant la recherche, et pas par
  // confort : l'en-tête du fichier donne l'exemple de secret à créer
  // (`…helius-rpc.com/?api-key=…`), et c'est justement la documentation
  // qu'on veut garder. Ce qui compte est qu'aucune ligne EXÉCUTÉE ne la
  // contienne.
  const code = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  const urls = code.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
  assert.deepEqual(
    urls.filter((u) => /helius|quiknode|alchemy|triton/i.test(u)),
    [],
    'aucun endpoint de fournisseur en dur dans le code exécuté'
  );
  assert.ok(
    urls.some((u) => u.includes('api.devnet.solana.com')),
    'le devnet public doit rester le repli interne du relais'
  );
});

test('le relais répond TOUJOURS — pas de sortie « non configuré »', () => {
  // Un relais qui répond 503 « non configuré » obligerait le client à gérer
  // un troisième état, et ce troisième état serait celui qu'on découvre
  // cassé en démonstration.
  const src = lire('../supabase/functions/rpc/index.ts');
  assert.equal(
    /RPC_UPSTREAM_URL absent/.test(src),
    false,
    'la fonction ne doit plus se déclarer « non configurée »'
  );
  assert.match(
    src,
    /const CIBLES: readonly string\[\] = \[DEDIE, DEVNET_PUBLIC\]/,
    'les cibles sont le nœud dédié PUIS le devnet public'
  );
});

test('le détecteur de régression SAIT échouer', () => {
  // Vérifié sur la forme RÉELLE d'avant migration : sans ce cas, les
  // contrôles ci-dessus pourraient passer le jour où ils ne regardent
  // plus rien.
  const ANCIEN = "const DEDICATED_RPC =\n  (import.meta.env.VITE_RPC_ENDPOINT as string) ||\n  '';";
  assert.equal(
    /const DEDICATED_RPC\s*=\s*RELAY_RPC\s*\|\|\s*DIRECT_RPC/.test(ANCIEN),
    false,
    'le détecteur ne détecte pas la régression qu’il vise'
  );
  const SANS_RELAIS = F('const U = ', 'https://exemple.supabase.co');
  assert.ok(!SANS_RELAIS.includes('api-key'));

  // Et la règle « aucune variable d'env RPC dans le code livré » doit, elle
  // aussi, savoir échouer : on l'exerce sur la ligne réelle d'avant.
  const interdits = /import\.meta\.env\.(VITE_RPC_|VITE_REACT_APP_SOLANA_RPC_URL)/;
  const AVANT = F('const DIRECT_RPC = (', 'import.meta.env.VITE_RPC_ENDPOINT', " as string) || '';");
  assert.ok(interdits.test(AVANT), 'la règle ne reconnaît pas la fuite qu’elle vise');

  // Et la règle sur l'artefact doit reconnaître une valeur, pas le mot :
  // l'exemple du champ « RPC personnalisé » (`?api-key=...`) doit passer.
  const VALEUR = /api-?key=[A-Za-z0-9_-]{8,}/;
  assert.ok(VALEUR.test(F('https://n/?api-key=', 'FAUSSE_CLE_de_test')));
  assert.equal(VALEUR.test('https://n/?api-key=...'), false, 'un exemple n’est pas une clé');
});
