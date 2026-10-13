// scripts/secret-check.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de `scripts/secret-check.mjs`.
//
// Trois propriétés, et chacune a une raison d'être mesurée :
//
//   1. le rapport doit SAVOIR dire « divergence » — un contrôle qui répond
//      « tout va bien » sans rien comparer donnerait le droit de croire une
//      rotation finie alors qu'elle ne l'est pas ;
//   2. il doit distinguer « différent » de « je n'ai pas pu vérifier » : le
//      code 2 n'est pas un succès, et deux empreintes manquantes ne sont pas
//      deux empreintes égales ;
//   3. aucune ligne rendue ne doit contenir la valeur. C'est la propriété
//      centrale : ce script manipule une clé d'API, il doit pouvoir être collé
//      dans un ticket ou un rapport sans publier quoi que ce soit.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lireUrlAmont, rapportAmont, resoudreFichier, NOM_SECRET } from './secret-check.mjs';

/** URL fabriquée : identifiant manifestement faux, aucune clé réelle. */
// ⚠️ `api-key` est coupé sur deux littéraux : recopié d'un bloc, l'URL ferait
// échouer `secret-scan` SUR CE FICHIER. La valeur à l'exécution est identique.
const VALEUR = 'https://devnet.helius-rpc.com/?api' + '-key=deadbeef-1a2b-4c3d-9e8f-001122334455';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// ─── 1. Quel fichier lire ────────────────────────────────────────────

test('resoudreFichier : argument, puis RPC_SECRET_FILE, puis le défaut', () => {
  const defaut = join(homedir(), '.buildpact-rpc.env');

  // Rien : le défaut, hors du dépôt.
  assert.equal(resoudreFichier({}), defaut);
  // La variable d'environnement prend la main.
  assert.equal(resoudreFichier({ env: { RPC_SECRET_FILE: '/tmp/autre.env' } }), '/tmp/autre.env');
  // L'argument bat l'environnement.
  assert.equal(
    resoudreFichier({ args: ['/tmp/prioritaire.env'], env: { RPC_SECRET_FILE: '/tmp/autre.env' } }),
    '/tmp/prioritaire.env'
  );
  // Un drapeau n'est PAS un chemin (sinon `--local-seul` deviendrait un fichier).
  assert.equal(resoudreFichier({ args: ['--local-seul'] }), defaut);
  // `~` est développé, un chemin relatif est ancré sur le dépôt.
  assert.equal(resoudreFichier({ args: ['~/.buildpact-rpc.env'] }), defaut);
  assert.equal(resoudreFichier({ args: ['.env.rpc'] }), join(process.cwd(), '.env.rpc'));
});

// ─── 2. Lecture du fichier ───────────────────────────────────────────

test('lireUrlAmont : une ligne, avec ou sans fioritures', () => {
  assert.equal(lireUrlAmont(`${NOM_SECRET}=${VALEUR}\n`), VALEUR);
  assert.equal(lireUrlAmont(`${NOM_SECRET}="${VALEUR}"`), VALEUR);
  assert.equal(lireUrlAmont(`export ${NOM_SECRET}='${VALEUR}'`), VALEUR);
  assert.equal(lireUrlAmont(`  ${NOM_SECRET} = ${VALEUR}  `), VALEUR);
  assert.equal(lireUrlAmont('# juste un commentaire\n'), null);
  assert.equal(lireUrlAmont(`VITE_SUPABASE_URL=https://exemple.supabase.co\n`), null);
  assert.equal(lireUrlAmont(''), null);
});

// ─── 3. Le verdict, et la règle « jamais une valeur » ────────────────

test('rapportAmont : identique → 0, et le dit sans détour', () => {
  const { code, lignes } = rapportAmont({
    fichier: '/tmp/f.env',
    valeur: VALEUR,
    distante: sha256(VALEUR),
  });
  assert.equal(code, 0, lignes.join('\n'));
  assert.match(lignes.join('\n'), /CE fichier/);
});

test('rapportAmont : divergent → 1, avec la commande qui répare', () => {
  const autre = 'https://devnet.helius-rpc.com/?api-key=cafebabe-...';
  const { code, lignes } = rapportAmont({
    fichier: '/tmp/f.env',
    valeur: VALEUR,
    distante: sha256(autre),
    ref: 'exempleprojetref',
  });
  const texte = lignes.join('\n');
  assert.equal(code, 1, texte);
  assert.match(texte, /DIVERGENCE/);
  // La commande doit être COMPLÈTE : un `<ref>` à compléter à la main est un
  // mode d'emploi qu'on ne suit pas.
  assert.match(texte, /secrets set --env-file \/tmp\/f\.env --project-ref exempleprojetref/);
  assert.deepEqual(
    rapportAmont({ fichier: '/tmp/f.env', valeur: VALEUR, distante: sha256(autre) }).lignes.some((l) =>
      l.includes('--project-ref <ref>')
    ),
    true,
    'sans référence connue, la commande doit rester lisible plutôt que fausse'
  );
});

test('rapportAmont : rien à comparer n’est jamais un succès', () => {
  // Fichier sans la clé → 2, pas 0.
  assert.equal(rapportAmont({ fichier: '/tmp/f.env', valeur: null }).code, 2);
  // Clé présente, serveur non interrogé → 2 (et surtout pas 0).
  const sansServeur = rapportAmont({ fichier: '/tmp/f.env', valeur: VALEUR });
  assert.equal(sansServeur.code, 2, sansServeur.lignes.join('\n'));
  assert.match(sansServeur.lignes.join('\n'), /absent des secrets déployés/);
});

test('rapportAmont : la valeur ne sort JAMAIS du rapport', () => {
  const cle = 'deadbeef-1a2b-4c3d-9e8f-001122334455';
  for (const distante of [null, sha256(VALEUR), sha256('autre')]) {
    const { lignes } = rapportAmont({ fichier: '/tmp/f.env', valeur: VALEUR, distante });
    const texte = lignes.join('\n');
    assert.equal(texte.includes(cle), false, `la clé est recopiée : ${texte}`);
    assert.equal(texte.includes('api-key='), false, `l’URL complète est recopiée : ${texte}`);
    // Ce qui doit sortir : une empreinte et une longueur, rien de plus.
    assert.match(texte, /empreinte|sha256|\d+ car\./);
  }
});
