// scripts/deploy-fleet-check.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du balayage du parc (scripts/deploy-fleet-check.mjs).
//
// Ce que ce fichier protège, et pourquoi il existe :
//
//   1. la PAGINATION. `vercel ls` rend 20 déploiements par défaut. Un balayage
//      qui s'arrête à la première page se croit complet en n'ayant lu que 12 %
//      du parc (20 sur 166, mesuré le 11/10/2026) — c'est exactement le genre
//      de contrôle qui « valide » sans avoir regardé ;
//   2. le REGROUPEMENT. Deux déploiements qui servent le même nom de bundle
//      servent le même fichier au bit près. Regrouper est ce qui rend le
//      balayage praticable ; se tromper de clé de regroupement ferait porter à
//      un déploiement la trouvaille d'un autre ;
//   3. les TROIS ÉTATS d'un bundle, qui ne doivent jamais être confondus :
//      PROPRE (lu, rien trouvé), FUITE (lu, une valeur de forme secrète), et
//      ILLISIBLE (pas lu). Rendre « fuite » pour un bundle illisible ferait
//      sortir le contrôle en 3 — « une clé est servie » — sur une panne
//      réseau. Un contrôle qui crie au loup est un contrôle qu'on ignore ;
//   4. aucune valeur ne doit JAMAIS ressortir : les trouvailles sont celles de
//      `analyserBundle`, qui porte déjà empreinte + longueur, jamais la valeur.
//
// Aucun test ici ne touche le réseau : le fichier importé garde `main()`
// derrière une garde d'exécution directe.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grouperParBundle,
  lirePageDeDeploiements,
  verdictDuParc,
} from './deploy-fleet-check.mjs';
import { analyserBundle, empreinte } from './secret-rules.mjs';

/** 36 caractères, forme d'un identifiant d'API de fournisseur. Fabriqué :
 *  ce fichier est versionné et ne recopie le début d'aucune clé réelle. */
const FAUSSE = 'deadbeef-1a2b-4c3d-9e8f-001122334455';

/** La page telle que la rend `vercel ls --format json`. */
const pageJson = (urls: string[], suivant: number | null = null) =>
  JSON.stringify({
    deployments: urls.map((url) => ({ url, state: 'READY', target: 'production' })),
    pagination: suivant === null ? {} : { next: suivant },
  });

type Page = { url: string; statut: number; bundle: string | null };
type Resultat = { fuites: string[]; illisible: string | null };

/** Un bundle lu et propre. */
const propre = (): Resultat => ({ fuites: [], illisible: null });
/** Un bundle lu PORTANT une clé en clair — la trouvaille vient des règles du dépôt. */
const fuit = (): Resultat => ({
  fuites: analyserBundle(`k:"https://devnet.helius-rpc.com/?api-key=${FAUSSE}"`, 'bundle'),
  illisible: null,
});
/** Un bundle qu'on n'a pas réussi à lire. */
const illisible = (cause = 'HTTP 500'): Resultat => ({ fuites: [], illisible: cause });

// ─── 1. Lire une page de la CLI ─────────────────────────────────────

test('lirePageDeDeploiements : rend les URLs et le curseur de la page suivante', () => {
  const { urls, suivant } = lirePageDeDeploiements(
    pageJson(['aaa.vercel.app', 'bbb.vercel.app'], 1791584824575)
  );
  assert.deepEqual(urls, ['aaa.vercel.app', 'bbb.vercel.app']);
  assert.equal(suivant, 1791584824575);
});

test('lirePageDeDeploiements : la dernière page n’annonce pas de suite', () => {
  const { urls, suivant } = lirePageDeDeploiements(pageJson(['aaa.vercel.app']));
  assert.deepEqual(urls, ['aaa.vercel.app']);
  assert.equal(suivant, null, 'sans curseur, l’énumération doit s’arrêter — pas boucler');
});

test('lirePageDeDeploiements : une page vide ne fait pas planter le balayage', () => {
  assert.deepEqual(lirePageDeDeploiements('{}'), { urls: [], suivant: null });
});

// ─── 2. Regrouper par bundle ────────────────────────────────────────

test('grouperParBundle : un même bundle n’est lu qu’une fois, pour tous ceux qui le servent', () => {
  const pages: Page[] = [
    { url: 'a.vercel.app', statut: 200, bundle: '/assets/index-B77dM799.js' },
    { url: 'b.vercel.app', statut: 200, bundle: '/assets/index-B77dM799.js' },
    { url: 'c.vercel.app', statut: 200, bundle: '/assets/index-C3L4yYj9.js' },
    { url: 'd.vercel.app', statut: 200, bundle: null },
  ];
  const groupes = grouperParBundle(pages);

  assert.equal(groupes.size, 2, 'deux bundles distincts, pas quatre');
  assert.deepEqual(groupes.get('/assets/index-B77dM799.js'), ['a.vercel.app', 'b.vercel.app']);
  assert.deepEqual(groupes.get('/assets/index-C3L4yYj9.js'), ['c.vercel.app']);
});

test('grouperParBundle : une page sans bundle ne rejoint aucun groupe', () => {
  assert.equal(grouperParBundle([{ url: 'x.vercel.app', statut: 200, bundle: null }]).size, 0);
});

// ─── 3. La décision ─────────────────────────────────────────────────

test('verdictDuParc : une clé servie par UN SEUL déploiement suffit à condamner le parc', () => {
  // C'est LE cas du 11/10/2026 : la seconde clé ne vivait que dans un
  // déploiement du 18 septembre. Un balayage qui exigerait plusieurs
  // occurrences l'aurait laissée passer.
  const pages: Page[] = [
    { url: 'propre-1.vercel.app', statut: 200, bundle: '/assets/index-AAA.js' },
    { url: 'propre-2.vercel.app', statut: 200, bundle: '/assets/index-AAA.js' },
    { url: 'seul-porteur.vercel.app', statut: 200, bundle: '/assets/index-BBB.js' },
  ];
  const resultats = new Map<string, Resultat>([
    ['/assets/index-AAA.js', propre()],
    ['/assets/index-BBB.js', fuit()],
  ]);

  const verdict = verdictDuParc(pages, resultats);
  assert.equal(verdict.code, 3);
  assert.equal(verdict.fuites.length, 1);
  assert.equal(
    verdict.fuites[0].url,
    'seul-porteur.vercel.app',
    'le verdict doit nommer LE déploiement fautif, pas le parc en général'
  );
});

test('verdictDuParc : la trouvaille ne recopie jamais la valeur', () => {
  const pages: Page[] = [{ url: 'a.vercel.app', statut: 200, bundle: '/assets/index-BBB.js' }];
  const verdict = verdictDuParc(pages, new Map([['/assets/index-BBB.js', fuit()]]));

  const rendu = JSON.stringify(verdict);
  assert.equal(rendu.includes(FAUSSE), false, 'le verdict publierait le secret une deuxième fois');
  assert.ok(
    rendu.includes(empreinte(FAUSSE)),
    'l’empreinte doit rester, elle identifie sans divulguer'
  );
});

test('verdictDuParc : un bundle ILLISIBLE n’est pas une fuite — code 2, jamais 3', () => {
  // Le défaut corrigé : ranger « non lu » avec « trouvaille » faisait sortir le
  // contrôle en 3 (« une clé est servie ») sur une simple panne réseau.
  const pages: Page[] = [{ url: 'a.vercel.app', statut: 200, bundle: '/assets/index-BBB.js' }];
  const verdict = verdictDuParc(pages, new Map([['/assets/index-BBB.js', illisible('HTTP 503')]]));

  assert.equal(verdict.fuites.length, 0, 'une panne réseau n’est pas un secret exposé');
  assert.equal(verdict.code, 2, 'rien n’a été lu : impossible de conclure');
  assert.equal(verdict.illisibles.length, 1);
  assert.equal(verdict.illisibles[0].cause, 'HTTP 503');
  assert.equal(verdict.lues.length, 0, 'un bundle illisible ne compte pas comme lu');
});

test('verdictDuParc : un bundle absent des résultats est NON VÉRIFIÉ, jamais propre', () => {
  // Défense contre l'interruption : un balayage qui s'arrête au milieu ne doit
  // pas pouvoir produire un vert, sous prétexte qu'on n'a rien trouvé dans ce
  // qu'on n'a pas regardé.
  const pages: Page[] = [{ url: 'a.vercel.app', statut: 200, bundle: '/assets/index-BBB.js' }];
  const verdict = verdictDuParc(pages, new Map());

  assert.equal(verdict.code, 2);
  assert.equal(verdict.lues.length, 0);
  assert.equal(verdict.illisibles[0].cause, 'bundle non examiné');
});

test('verdictDuParc : un parc dont RIEN n’a pu être lu n’est pas un parc propre', () => {
  // Le piège que ce contrôle doit refuser : tout est injoignable, donc zéro
  // trouvaille, donc « vert » pour qui compte les fuites au lieu de compter
  // les lectures.
  const pages: Page[] = [
    { url: 'a.vercel.app', statut: 0, bundle: null },
    { url: 'b.vercel.app', statut: 404, bundle: null },
  ];
  const verdict = verdictDuParc(pages, new Map());

  assert.equal(verdict.code, 2, 'aucune mesure n’est pas un succès');
  assert.equal(verdict.fuites.length, 0);
  assert.equal(verdict.nonLues.length, 2, 'les adresses non lues doivent être comptées, pas tues');
});

test('verdictDuParc : un parc propre mais partiellement illisible reste vert, en le disant', () => {
  const pages: Page[] = [
    { url: 'a.vercel.app', statut: 200, bundle: '/assets/index-AAA.js' },
    { url: 'casse.vercel.app', statut: 500, bundle: null },
    { url: 'vide.vercel.app', statut: 200, bundle: null },
  ];
  const verdict = verdictDuParc(
    pages,
    new Map([['/assets/index-AAA.js', propre()]])
  );

  assert.equal(verdict.code, 0);
  assert.equal(verdict.lues.length, 1);
  assert.equal(verdict.nonLues.length, 1, 'l’adresse en erreur reste visible dans le rapport');
  assert.equal(
    verdict.sansBundle.length,
    1,
    'une page vide n’est pas une page propre : elle est comptée'
  );
});

test('verdictDuParc : une fuite l’emporte même si la majorité du parc est illisible', () => {
  const pages: Page[] = [
    { url: 'a.vercel.app', statut: 0, bundle: null },
    { url: 'b.vercel.app', statut: 200, bundle: '/assets/index-ILL.js' },
    { url: 'fautif.vercel.app', statut: 200, bundle: '/assets/index-BBB.js' },
  ];
  const resultats = new Map<string, Resultat>([
    ['/assets/index-ILL.js', illisible('HTTP 502')],
    ['/assets/index-BBB.js', fuit()],
  ]);

  const verdict = verdictDuParc(pages, resultats);
  assert.equal(
    verdict.code,
    3,
    'une clé exposée n’est pas une raison de douter : c’est une fuite'
  );
  assert.equal(verdict.fuites.length, 1);
  assert.equal(verdict.fuites[0].url, 'fautif.vercel.app');
});
