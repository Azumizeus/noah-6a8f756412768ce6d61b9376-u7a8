// scripts/deploy-check.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du contrôle de production (scripts/deploy-check.mjs) et des
// règles de lecture d'un bundle servi (scripts/secret-rules.mjs).
//
// Ce que ce fichier protège, et pourquoi il existe :
//
//   1. le contrôle de prod doit SAVOIR échouer sur une clé en clair — c'est
//      la seule chose qui manquait le 11/10/2026, quand la production servait
//      une clé Helius pendant que tous les contrôles du dépôt étaient verts ;
//   2. il ne doit PAS crier à tort. Calibré sur les 5 bundles réellement
//      servis, `analyser` (règles de texte) rendait 3 trouvailles pour 1
//      réelle : deux venaient d'expressions JS minifiées de `supabase-js`.
//      Un contrôle qui signale du bruit est un contrôle qu'on ignore — les
//      deux expressions mesurées sont donc des cas de test à part entière ;
//   3. aucune valeur ne doit JAMAIS ressortir : signaler un secret en le
//      recopiant, c'est le publier une deuxième fois.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetsDuHtml } from './deploy-check.mjs';
import { analyserBundle, empreinte } from './secret-rules.mjs';

/** 36 caractères, forme d'un identifiant d'API de fournisseur. Fabriqué :
 *  ce fichier est versionné, il ne recopie le début d'aucune clé réelle. */
const FAUSSE = 'deadbeef-1a2b-4c3d-9e8f-001122334455';

const urlAvecCle = (cle: string) => `VITE_RPC_URL=https://devnet.helius-rpc.com/?api-key=${cle}`;

const b64 = (objet: unknown) => Buffer.from(JSON.stringify(objet)).toString('base64url');
const fauxJwt = (role: string) =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase', ref: 'exemple' })}.${'s'.repeat(43)}`;

// ─── 1. Quels fichiers la page servie référence-t-elle ? ─────────────

test('assetsDuHtml : extrait, dédoublonne, ignore le reste', () => {
  const html = [
    '<script type="module" crossorigin src="/assets/index-D_0cBmr-.js"></script>',
    '<link rel="stylesheet" href="/assets/index-Bh7JFGNf.css">',
    '<link rel="modulepreload" href="/assets/react-vendor-CJ4Ul4Qi.js">',
    '<script type="module" crossorigin src="/assets/index-D_0cBmr-.js"></script>',
    '<img src="/assets/logo-abc123.png">',
  ].join('\n');

  assert.deepEqual(assetsDuHtml(html), [
    '/assets/index-D_0cBmr-.js',
    '/assets/react-vendor-CJ4Ul4Qi.js',
  ]);
  // Une page sans bundle ne doit pas faire planter le contrôle : elle le dit.
  assert.deepEqual(assetsDuHtml('<html></html>'), []);
});

// ─── 2. La détection qui manquait le 11/10/2026 ──────────────────────

test('la clé dans une URL est trouvée — et jamais recopiée', () => {
  const trouvees = analyserBundle(urlAvecCle(FAUSSE), 'prod/assets/index.js');

  assert.equal(trouvees.length, 1, `attendu 1 trouvaille : ${JSON.stringify(trouvees)}`);
  assert.match(trouvees[0], /api-key/);
  assert.match(trouvees[0], new RegExp(empreinte(FAUSSE)), 'la trouvaille doit porter l’empreinte');
  assert.equal(
    trouvees[0].includes(FAUSSE),
    false,
    'la valeur est recopiée dans le rapport : signaler un secret, c’est le publier'
  );
  assert.ok(!JSON.stringify(trouvees).includes(FAUSSE), 'aucune trouvaille ne doit contenir la valeur');
});

test('un littéral entre guillemets sous un nom sensible est trouvé', () => {
  // ⚠️ `apiKey` est coupé sur deux littéraux : recopié d'un bloc, il ferait
  // échouer `secret-scan` SUR CE FICHIER (même convention que F() ailleurs).
  const trouvees = analyserBundle('const c={api' + 'Key:"abcdefghijklmnopqrstuvwx"};', 'prod/assets/index.js');
  assert.equal(trouvees.length, 1, JSON.stringify(trouvees));
  assert.match(trouvees[0], /apiKey/);
  assert.equal(trouvees[0].includes('abcdefghijklmnopqrstuvwx'), false);
});

test('un jeton Supabase service_role est trouvé, le jeton anon non', () => {
  const service = analyserBundle(`VITE_KEY="${fauxJwt('service_role')}"`, 'prod/assets/index.js');
  assert.equal(service.length, 1, `service_role doit être signalé : ${JSON.stringify(service)}`);
  assert.match(service[0], /service_role/);

  // Le jeton `anon` est PUBLIC par conception (il part dans le bundle, c'est
  // la RLS qui protège) : le signaler rendrait le contrôle inaudible.
  assert.deepEqual(analyserBundle(`VITE_SUPABASE_ANON_KEY="${fauxJwt('anon')}"`, 'prod/assets/index.js'), []);
});

// ─── 3. Les faux positifs, mesurés sur la production réelle ──────────

test('les expressions minifiées de supabase-js ne sont PAS des secrets', () => {
  // Extrait tel quel du bundle servi le 11/10/2026
  // (`/assets/index-D_0cBmr-.js`) : les règles de texte y voyaient deux
  // « secrets » de 28 et 25 caractères. Ce sont un accès à une propriété et
  // une référence de méthode.
  // ⚠️ Noms fragmentés pour `secret-scan` (voir ci-dessus) : la valeur à
  // l'exécution est l'extrait réel du bundle servi, au caractère près.
  const extrait = [
    'this.socket.access' + 'TokenValue&&(s.access_' + 'token=this.socket.access' + 'TokenValue)',
    'this.realtime=this._initRealtimeClient(Object.assign({headers:this.headers,access' + 'Token:this._get' + 'AccessToken.bind(this)},e))',
  ].join(';');

  assert.deepEqual(
    analyserBundle(extrait, 'prod/assets/index.js'),
    [],
    'un faux positif par bundle rend le contrôle inaudible — c’est la raison d’être d’analyserBundle'
  );
});

test('les gabarits et les valeurs courtes ne sont pas des secrets', () => {
  const benignes = [
    'placeholder:`https://devnet.helius-rpc.com/?api-key=...`',
    'url:"https://devnet.helius-rpc.com/?api-key=<ta_cle_devnet>"',
    'apiKey:"CHANGE_ME_DANS_LES_SECRETS"',
    'const access_token="court";',
    '',
  ].join('\n');

  assert.deepEqual(analyserBundle(benignes, 'prod/assets/index.js'), []);
});

// ─── 4. Le détecteur SAIT échouer (sinon il ne protège rien) ─────────

test('le détecteur SAIT échouer sur ce qu’il doit refuser', () => {
  // Une clé dans une URL, un littéral nommé, un bloc PEM : trois formes
  // structurelles, trois refus — et le contrôle de prod en fait un code de
  // sortie 3, jamais un avertissement.
  // ⚠️ Marqueurs PEM fragmentés pour `secret-scan` (voir ci-dessus).
  const pem = `-----BEGIN PRIVATE ` + `KEY-----\n${'A'.repeat(64)}\n-----END PRIVATE ` + `KEY-----`;
  assert.equal(analyserBundle(urlAvecCle(FAUSSE), 'x').length, 1);
  assert.equal(analyserBundle('service_' + 'role:"abcdefghijklmnopqrstuvwx"', 'x').length, 1);
  assert.equal(analyserBundle(pem, 'x').length, 1);
  assert.ok(analyserBundle('rien du tout', 'x').length === 0);
});
