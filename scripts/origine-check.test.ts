// scripts/origine-check.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de `scripts/origine-check.mjs`.
//
// Ce que ce fichier protège, et pourquoi :
//
//   1. le contrôle doit SAVOIR refuser un envoi fait à la main. C'est la
//      seule chose qui manquait le 11/10/2026 : la production avait été
//      publiée par `vercel --prod`, et rien ne le voyait ;
//   2. il doit refuser ce cas MÊME QUAND LE COMMIT EST LE BON. Les deux
//      déploiements du 11/10 portaient `2cc9d23` — celui du dépôt. Un
//      contrôle qui compare d'abord les commits aurait dit « synchronisé »
//      sur une livraison non reproductible. Le test à `source: cli` +
//      `2cc9d23` est donc le cas central de ce fichier ;
//   3. il ne doit PAS crier à tort : un aperçu, un déploiement bloqué ou une
//      construction en cours ne servent pas la production et ne doivent pas
//      devenir le sujet du verdict ;
//   4. « je n'ai pas pu lire » (code 2) ne doit JAMAIS se confondre avec
//      « c'est bon » (code 0) ;
//   5. « publié à la main » (code 3) ne doit pas se confondre avec « en retard
//      sur le dépôt » (code 1). Une production en retard est normale ;
//      confondre les deux ferait crier au loup chaque matin, donc ignorer
//      les deux.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJET_PAR_DEFAUT,
  cheminsAuthCli,
  choisirProduction,
  identiteProjet,
  jetonVercel,
  verdictOrigine,
} from './origine-check.mjs';

/** Le vrai déploiement de production du 11/10/2026 : pubié à la main, bon commit. */
const PUBLIE_A_LA_MAIN = {
  target: 'production',
  readyState: 'READY',
  source: 'cli',
  created: 1791752180579,
  meta: { githubCommitSha: '2cc9d2308f88c97a0004ab795f79967bde30fdb3' },
};

const CONSTRUIT_PAR_GIT = {
  target: 'production',
  readyState: 'READY',
  source: 'git',
  created: 1791584824575,
  meta: {
    githubCommitSha: '2cc9d2308f88c97a0004ab795f79967bde30fdb3',
    githubCommitAuthorLogin: 'dunkcashcoins',
  },
};

// ─── 1. Le cas du 11/10 : le bon commit, mais publié à la main ───────

test('un envoi à la main est refusé MÊME quand le commit est celui du dépôt', () => {
  const v = verdictOrigine(PUBLIE_A_LA_MAIN, { shaAttendu: '2cc9d23' });

  assert.equal(v.code, 3, `attendu 3 (le cas grave) : ${JSON.stringify(v)}`);
  assert.match(v.titre, /publiée à la main/);
  // Le commit est bien celui attendu : c'est justement ce qui rend le cas
  // dangereux — un contrôle qui compare les commits se tairait ici.
  assert.equal(v.faits.find(([k]) => k === 'commit')?.[1], '2cc9d23');
  assert.ok(v.action && v.action.length > 0, 'un refus doit dire quoi faire');
});

test('un déploiement construit par Git est accepté', () => {
  const v = verdictOrigine(CONSTRUIT_PAR_GIT, { shaAttendu: '2cc9d23' });
  assert.equal(v.code, 0, JSON.stringify(v));
  assert.match(v.titre, /construite par Git/);
  assert.equal(v.action, null);
});

// ─── 2. Les refus voisins ───────────────────────────────────────────

test('un déploiement Git sans commit est refusé (provenance incomplète)', () => {
  const v = verdictOrigine({ target: 'production', readyState: 'READY', source: 'git', meta: {} });
  assert.equal(v.code, 3, JSON.stringify(v));
  assert.match(v.titre, /sans commit associé/);
});

test('un commit différent de celui attendu est refusé, et nommé', () => {
  const v = verdictOrigine(CONSTRUIT_PAR_GIT, { shaAttendu: 'df908f4' });
  assert.equal(v.code, 1, JSON.stringify(v));
  assert.match(v.titre, /2cc9d23 au lieu de df908f4/);
});

test('une source absente n’est pas prise pour Git', () => {
  const v = verdictOrigine({ target: 'production', readyState: 'READY', meta: { githubCommitSha: 'a'.repeat(40) } });
  assert.equal(v.code, 3, JSON.stringify(v));
  assert.match(v.titre, /inconnue/);
});

test('« en retard sur le dépôt » (code 1) n’est pas « publié à la main » (code 3)', () => {
  // Un push vient d'arriver, Vercel n'a pas encore reconstruit : c'est normal.
  const retard = verdictOrigine(CONSTRUIT_PAR_GIT, { shaAttendu: 'df908f4' });
  assert.equal(retard.code, 1, JSON.stringify(retard));
  // Une production publiée à la main : ce n'est pas un retard, c'est le cas qui
  // arrête le job — et il porte le code qui arrête.
  assert.equal(verdictOrigine(PUBLIE_A_LA_MAIN, { shaAttendu: '2cc9d23' }).code, 3);
});

// ─── 3. Ne pas crier à tort ─────────────────────────────────────────

test('aperçus, déploiements bloqués et constructions en cours ne sont pas la production', () => {
  const parc = [
    { target: 'preview', readyState: 'READY', created: 100, source: 'cli' },
    { target: 'production', readyState: 'BLOCKED', created: 200, source: 'git' },
    { target: 'production', readyState: 'BUILDING', created: 300, source: 'git' },
    { target: 'production', readyState: 'CANCELED', created: 400, source: 'git' },
    { target: 'production', readyState: 'READY', created: 500, source: 'cli' },
  ];
  assert.equal(choisirProduction(parc)?.created, 500);
  // Aucun déploiement servable → code 2, jamais 0 : on n'a rien lu.
  assert.equal(choisirProduction(parc.filter((d) => d.readyState !== 'READY')), null);
  assert.equal(verdictOrigine(null).code, 2);
});

test('le plus récent gagne, quelle que soit la place dans la liste', () => {
  const parc = [
    { target: 'production', readyState: 'READY', created: 900, source: 'git', id: 'neuf' },
    { target: 'production', readyState: 'READY', created: 100, source: 'git', id: 'vieux' },
  ];
  assert.equal(choisirProduction(parc)?.id, 'neuf');
  assert.equal(choisirProduction([]), null);
  assert.equal(choisirProduction(undefined), null);
});

// ─── 4. L'identité du projet ────────────────────────────────────────

test('l’environnement prime sur le fichier lié, qui prime sur le défaut', () => {
  const fichier = JSON.stringify({ projectId: 'prj_du_fichier', orgId: 'team_du_fichier' });

  assert.deepEqual(identiteProjet({ VERCEL_PROJECT_ID: 'prj_env', VERCEL_ORG_ID: 'team_env' }, fichier), {
    projectId: 'prj_env',
    orgId: 'team_env',
  });
  assert.deepEqual(identiteProjet({}, fichier), {
    projectId: 'prj_du_fichier',
    orgId: 'team_du_fichier',
  });
  // `.vercel/` est ignoré par git : en CI le fichier est absent. Le contrôle
  // doit quand même pouvoir viser le bon projet, sinon il ne tourne jamais.
  assert.deepEqual(identiteProjet({}, null), PROJET_PAR_DEFAUT);
  // Un fichier illisible ne doit pas faire échouer le contrôle.
  assert.deepEqual(identiteProjet({}, '{ ceci n’est pas du json'), PROJET_PAR_DEFAUT);
  // Une chaîne vide (variable non définie en CI) vaut « absente ».
  assert.deepEqual(identiteProjet({ VERCEL_PROJECT_ID: '   ', VERCEL_ORG_ID: '' }, null), PROJET_PAR_DEFAUT);
});

// ─── 5. Le jeton ─────────────────────────────────────────────────────

test('le jeton vient de l’environnement, sinon de l’authentification de la CLI', () => {
  const auth = JSON.stringify({ token: 'jeton-de-la-cli' });

  // L'environnement prime : c'est ce qui permet à la CI de viser le jeton du
  // dépôt sans dépendre de ce qui traîne sur la machine.
  assert.equal(jetonVercel({ VERCEL_TOKEN: 'jeton-env' }, auth), 'jeton-env');
  // Sans variable d'environnement — le cas d'une exécution locale planifiée —
  // le contrôle doit tourner quand même : `check:parc` le fait déjà, via la CLI.
  assert.equal(jetonVercel({}, auth), 'jeton-de-la-cli');

  // Aucun jeton où que ce soit → chaîne vide, donc code 2 (« non vérifié »).
  // Un jeton introuvable ne doit JAMAIS pouvoir produire un verdict vert.
  assert.equal(jetonVercel({}, null), '');
  assert.equal(jetonVercel({ VERCEL_TOKEN: '   ' }, null), '');
  assert.equal(jetonVercel({}, 'ceci n’est pas du json'), '');
  assert.equal(jetonVercel({}, JSON.stringify({ pasDeToken: 1 })), '');
  assert.equal(jetonVercel(undefined, JSON.stringify({ token: '  espace  ' })), 'espace');
});

test('les emplacements de l’authentification de la CLI sont ceux de macOS puis Linux', () => {
  const chemins = cheminsAuthCli('/Users/exemple');
  assert.equal(chemins.length, 2);
  assert.equal(chemins[0], '/Users/exemple/Library/Application Support/com.vercel.cli/auth.json');
  assert.equal(chemins[1], '/Users/exemple/.local/share/com.vercel.cli/auth.json');
  // Sans répertoire personnel, aucun chemin : on ne lit pas « /undefined/… ».
  assert.deepEqual(cheminsAuthCli(''), []);
});
