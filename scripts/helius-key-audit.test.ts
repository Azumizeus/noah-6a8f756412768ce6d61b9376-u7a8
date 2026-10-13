// scripts/helius-key-audit.test.ts
// ═══════════════════════════════════════════════════════════════════
// Tests de scripts/helius-key-audit.mjs.
//
// Ce script est le seul du dépôt qui affiche un FRAGMENT de secret (8
// caractères, en `--indice`), parce qu'il sert à corréler la clé trouvée
// avec ce qu'affiche le tableau de bord Helius — on ne peut pas révoquer une
// clé qu'on n'identifie pas. Tout ce qui l'entoure doit donc être verrouillé :
//
//   1. l'extraction ne retient QUE les lignes qui parlent d'Helius : sans ce
//      filtre, elle ramasserait toutes les clés d'API du voisinage ;
//   2. l'indice ne peut jamais devenir la valeur entière (une valeur plus
//      courte que l'indice n'en produit aucun) ;
//   3. l'expurgation retire la valeur, SON PRÉFIXE, et tout paramètre
//      `api-key=` d'une URL — c'est ce qui empêche une erreur réseau de
//      recracher la clé dans un journal ;
//   4. la sonde ne conclut « morte » que sur un refus explicite (401/403).
//      Une panne réseau doit rester NON CONCLUANTE.
//
// Les valeurs d'essai sont ASSEMBLÉES (`F`), comme partout ailleurs : ce
// fichier est lui-même scanné par le contrôle des fichiers suivis.
// ═══════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  candidatsHelius,
  chercherSurDisque,
  expurger,
  indice,
  sonderCle,
  TAILLE_INDICE,
} from './helius-key-audit.mjs';
import { empreinte } from './secret-rules.mjs';

const F = (...morceaux: string[]): string => morceaux.join('');

/** 36 caractères, forme d'un identifiant d'API Helius. Fabriqué — et
 *  volontairement SANS lien avec une clé réelle : ce fichier est versionné,
 *  il n'a aucune raison de recopier le début d'un vrai identifiant. */
const CLE = F('deadbeef', '-1a2b', '-4c3d', '-9e8f', '-001122334455');
/** Une autre clé, du même format, pour prouver que la comparaison est exacte. */
const AUTRE = F('feedface', '-1a2b', '-4c3d', '-9e8f', '-001122334455');

test('candidatsHelius retient la forme URL et la forme affectation', () => {
  const texte = [
    `VITE_RPC_URL=https://devnet.helius-rpc.com/?api-key=${CLE}`,
    `HELIUS_API_KEY=${AUTRE}`,
    '',
  ].join('\n');
  const trouvees = candidatsHelius(texte);
  assert.deepEqual(
    trouvees.map((t) => t.valeur).sort(),
    [CLE, AUTRE].sort(),
    `extraction : ${JSON.stringify(trouvees)}`
  );
  assert.equal(trouvees.find((t) => t.valeur === CLE)?.forme, 'paramètre d’URL');
  assert.equal(trouvees.find((t) => t.valeur === AUTRE)?.forme, 'affectation nommée');
});

test('candidatsHelius ne ramasse pas les clés des autres services', () => {
  // Le filtre est délibérément ÉTROIT : sans lui, le script proposerait de
  // révoquer des clés d'API qui n'ont rien à voir avec Helius.
  const texte = [
    `OPENAI_API_KEY=${CLE}`,
    `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com/?api-key=${CLE}`,
    `STRIPE_SECRET_KEY=${AUTRE}`,
  ].join('\n');
  assert.deepEqual(candidatsHelius(texte), []);
});

test('candidatsHelius déduplique une même valeur vue plusieurs fois', () => {
  const texte = [
    `HELIUS_API_KEY=${CLE}`,
    `HELIUS_URL=https://mainnet.helius-rpc.com/?api-key=${CLE}`,
  ].join('\n');
  assert.equal(candidatsHelius(texte).length, 1);
});

test('l’indice ne peut jamais être la valeur entière', () => {
  assert.equal(indice(CLE), CLE.slice(0, TAILLE_INDICE));
  assert.equal(indice(CLE).length, 8);
  // Trop courte : aucun indice. Un « indice » aussi long que la valeur serait
  // la valeur.
  assert.equal(indice('deadbeef'), null);
  assert.equal(indice('court'), null);
  assert.equal(indice(undefined as unknown as string), null);
});

test('expurger retire la valeur, son préfixe, et le paramètre d’une URL', () => {
  const message = `échec sur https://mainnet.helius-rpc.com/?api-key=${CLE} (clé ${CLE}, préfixe ${CLE.slice(0, 8)})`;
  const propre = expurger(message, [CLE]);
  assert.equal(propre.includes(CLE), false, `la valeur survit : ${propre}`);
  assert.equal(propre.includes(CLE.slice(0, 8)), false, `le préfixe survit : ${propre}`);
  assert.match(propre, /api-key=\*\*\*/);
  // Un message sans valeur n'est pas abîmé pour autant.
  assert.equal(expurger('rien à expurger', [CLE]), 'rien à expurger');
});

test('chercherSurDisque compare la valeur ENTIÈRE, pas un préfixe', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'helius-chercher-'));
  try {
    mkdirSync(join(dossier, 'produit-a'));
    writeFileSync(join(dossier, 'produit-a', '.env'), `HELIUS_API_KEY=${CLE}\n`);
    writeFileSync(join(dossier, 'produit-b.env'), `HELIUS_API_KEY=${AUTRE}\n`);

    const trouves = chercherSurDisque(dossier, [{ valeur: CLE, empreinte: empreinte(CLE) }]);
    assert.equal(trouves.length, 1, `attendu 1 fichier, obtenu ${JSON.stringify(trouves)}`);
    assert.ok(trouves[0].chemin.endsWith('.env'));
    assert.equal(trouves[0].empreinte, empreinte(CLE));

    // L'autre clé, qui partage 8 caractères, ne doit PAS remonter.
    const pourAutre = chercherSurDisque(dossier, [{ valeur: AUTRE, empreinte: empreinte(AUTRE) }]);
    assert.equal(pourAutre.length, 1);
    assert.ok(pourAutre[0].chemin.includes('produit-b'));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('la sonde distingue « répond », « refusée » et « non concluant »', async () => {
  const reponse = (status: number, corps: string) => async () => ({
    status,
    text: async () => corps,
  });

  const vivante = await sonderCle(CLE, { fetchImpl: reponse(200, '{"jsonrpc":"2.0","result":"ok","id":1}') });
  assert.equal(vivante.vivante, true);
  assert.equal(vivante.http, 200);

  const refusee = await sonderCle(CLE, { fetchImpl: reponse(401, 'Unauthorized') });
  assert.equal(refusee.vivante, false);

  // 429 / 5xx : la clé n'est pas jugée. Un « non concluant » lu comme « morte »
  // ferait sauter la révocation au pire moment.
  const fatiguee = await sonderCle(CLE, { fetchImpl: reponse(429, 'Too Many Requests') });
  assert.equal(fatiguee.vivante, null);

  const enPanne = await sonderCle(CLE, {
    fetchImpl: async () => {
      throw new Error(`fetch failed for https://mainnet.helius-rpc.com/?api-key=${CLE}`);
    },
  });
  assert.equal(enPanne.vivante, null);
  assert.equal(enPanne.detail.includes(CLE), false, `l’erreur recrache la clé : ${enPanne.detail}`);
});

test('sans fetch disponible, la sonde ne prétend rien', async () => {
  // ⚠️ `null`, et surtout pas `undefined` : la valeur par défaut du paramètre
  // s'applique sur `undefined` — une première version de ce test lançait donc
  // un VRAI appel réseau (et, sur une fausse clé, obtenait un refus, ce qui
  // faisait échouer le test pour une raison sans rapport). Un test unitaire ne
  // doit pas sortir sur le réseau.
  const r = await sonderCle(CLE, { fetchImpl: null as unknown as typeof fetch });
  assert.equal(r.vivante, null);
  assert.equal(r.http, null);
  assert.match(r.detail, /fetch/);
});
