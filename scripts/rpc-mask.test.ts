// scripts/rpc-mask.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou : l'endpoint RPC ne s'affiche jamais entier.
//
// Contexte (09/10/2026). L'application utilise un endpoint dédié dont la
// clé voyage DANS l'URL (`?api-key=…`). Deux `console.warn` de rotation
// affichaient cette URL telle quelle — donc la clé dans la console du
// navigateur. Une clé journalisée est une clé publiée : la console est lue
// par le support, recopiée dans les captures d'écran et par toute extension
// un peu curieuse. Le remplacement prévu de la clé aurait été annulé au
// premier incident RPC journalisé.
//
// Deux niveaux, comme les autres garde-fous du dépôt :
//   1. `masquerEndpoint()` est PURE — on lui donne des URL fabriquées et on
//      vérifie qu'aucune ne ressort avec sa clé (donc que le contrôle saurait
//      échouer) ;
//   2. on relit la SOURCE de `src/lib/constants.ts` pour exiger que les deux
//      journaux de rotation passent bien par elle — un futur appel écrit à la
//      main échoue ici au lieu de fuir en silence.
//
// ── Pourquoi les valeurs de test sont ASSEMBLÉES ─────────────────────
// Même raison que dans scripts/secret-scan.test.ts, qui scanne CE fichier
// comme les autres fichiers suivis : une vraie clé n'a rien à faire dans un
// dépôt public, et même une fausse écrite en clair se ferait signaler par la
// règle « secret dans une URL » — correctement, puisqu'une fausse clé est
// indiscernable d'une vraie par sa forme. La concaténation à l'exécution
// exerce donc la règle sans jamais armer le détecteur.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  masquerEndpoint,
  ENDPOINT_ILLISIBLE,
  AUCUN_ENDPOINT,
} from '../src/lib/rpcMask.ts';

/** Assemble une chaîne sans l'écrire en clair (voir l'en-tête). */
const F = (...morceaux: string[]): string => morceaux.join('');

/** Valeur de forme-clé, manifestement factice. */
const CLE = F('0123456789', 'abcdef', 'GHIJKL', 'mnopqr');

// ─── 1. Le masquage retire ce qui peut porter une clé ────────────────

test('masque le paramètre api-key — la clé ne ressort nulle part', () => {
  const rendu = masquerEndpoint(F('https://devnet.helius-rpc.com/?api-key=', CLE));
  assert.equal(rendu, 'https://devnet.helius-rpc.com');
  assert.ok(!rendu.includes(CLE), 'la clé ne doit apparaître dans aucune sortie');
});

test('masque aussi un jeton placé dans le CHEMIN, pas seulement en paramètre', () => {
  // Cas QuickNode : `https://<nom>.quiknode.pro/<jeton>/`. Un masquage qui
  // ne traiterait que les paramètres laisserait passer exactement ce cas —
  // c'est lui qui justifie de ne garder que l'origine.
  const rendu = masquerEndpoint(F('https://exemple.quiknode.pro/', CLE, '/'));
  assert.equal(rendu, 'https://exemple.quiknode.pro');
  assert.ok(!rendu.includes(CLE));
});

test('retire les identifiants en clair de l’autorité', () => {
  const rendu = masquerEndpoint(F('https://alice:', CLE, '@rpc.exemple.test/v1'));
  assert.equal(rendu, 'https://rpc.exemple.test');
  assert.ok(!rendu.includes(CLE));
});

// ─── 2. Ce qui doit RESTER lisible (sinon le journal ne sert à rien) ─

test('un endpoint public reste lisible : le journal garde son utilité', () => {
  assert.equal(masquerEndpoint('https://api.devnet.solana.com'), 'https://api.devnet.solana.com');
  assert.equal(masquerEndpoint('https://api.devnet.solana.com/'), 'https://api.devnet.solana.com');
  assert.equal(masquerEndpoint('http://127.0.0.1:8899'), 'http://127.0.0.1:8899');
});

test('conserve le port — l’origine n’est pas seulement le nom d’hôte', () => {
  assert.equal(masquerEndpoint('http://127.0.0.1:8899/?custom=1'), 'http://127.0.0.1:8899');
});

// ─── 3. Le doute se tranche du côté qui ne divulgue pas ──────────────

test('ne recopie JAMAIS une entrée inanalysable', () => {
  // Une chaîne qui n'est pas une URL peut être n'importe quoi — y compris
  // une clé collée seule, sans hôte ni schéma. C'est précisément le cas où
  // rendre l'entrée « telle quelle pour aider au diagnostic » la publierait.
  const rendu = masquerEndpoint(CLE);
  assert.equal(rendu, ENDPOINT_ILLISIBLE);
  assert.ok(!rendu.includes(CLE));
  assert.equal(masquerEndpoint(''), AUCUN_ENDPOINT);
  assert.equal(masquerEndpoint('   '), AUCUN_ENDPOINT);
  assert.equal(masquerEndpoint(undefined), AUCUN_ENDPOINT);
  assert.equal(masquerEndpoint(null), AUCUN_ENDPOINT);
});

// ─── 4. La source ne doit pas court-circuiter le module ──────────────

test('le détecteur de journal brut SAIT échouer', () => {
  // Vérifié sur la ligne RÉELLE d'avant correction. Sans ce cas, le test
  // suivant passerait aussi le jour où il ne détecte plus rien.
  const ANCIEN = "  console.warn('[RPC:read] Rotation vers :', getReadRpcEndpoint());";
  assert.ok(!/masquerEndpoint\(/.test(ANCIEN), 'le détecteur ne détecte pas la fuite qu’il vise');
});

test('aucun console de constants.ts ne reçoit un endpoint brut', () => {
  const src = readFileSync(new URL('../src/lib/constants.ts', import.meta.url), 'utf8');
  const journaux = src
    .split('\n')
    .filter((l) => /console\.\w+\(/.test(l) && /RpcEndpoint/.test(l));

  assert.ok(
    journaux.length >= 2,
    `seulement ${journaux.length} journal(s) de rotation trouvé(s) — ` +
      'les deux rotations doivent rester visibles pour qu’on puisse vérifier leur masquage'
  );
  for (const ligne of journaux) {
    assert.match(
      ligne,
      /masquerEndpoint\(/,
      `journal non masqué dans constants.ts — il publierait la clé : ${ligne.trim()}`
    );
  }
});

test('le masquage reste PUR — rpcMask.ts n’importe rien', () => {
  // C'est ce qui permet à CE test de le charger hors navigateur (pas de
  // `import.meta.env`, pas de web3.js). Y ajouter un import le rendrait
  // intestable sans qu'on s'en aperçoive, et le garde-fou disparaîtrait
  // avec lui.
  const src = readFileSync(new URL('../src/lib/rpcMask.ts', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(src), false, 'rpcMask.ts doit rester sans dépendance');
});
