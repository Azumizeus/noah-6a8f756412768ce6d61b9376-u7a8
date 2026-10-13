// scripts/build-guard.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du refus de publication (scripts/build-guard.mjs).
//
// Ce que ce fichier protège, et pourquoi il existe :
//
//   1. le garde-fou doit SAVOIR refuser. Il a été calibré sur le `dist/` réel
//      (18 fichiers lus, aucune trouvaille), donc un test qui ne vérifie que
//      le cas propre ne prouve rien : le cas sale est le seul qui compte ;
//   2. il ne doit PAS crier à tort. Un garde-fou qui refuse une publication
//      saine finit contourné — et un garde-fou contourné ne protège plus rien.
//      La frontière testée ici est celle des fichiers LISIBLES : ouvrir un
//      `.png` ou un `.woff2` en utf8 produirait du bruit, donc un faux
//      positif, donc un refus injustifié ;
//   3. aucune valeur ne doit ressortir : un refus se décrit par une empreinte
//      et une longueur, jamais par la valeur elle-même.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { estLisible, fichiersDuDossier, verdictsDesFichiers } from './build-guard.mjs';
import { analyser, empreinte } from './secret-rules.mjs';

/** 36 caractères, forme d'un identifiant d'API de fournisseur. Fabriqué :
 *  ce fichier est versionné et ne recopie le début d'aucune clé réelle. */
const FAUSSE = 'deadbeef-1a2b-4c3d-9e8f-001122334455';

// ─── 1. Ce qu'on sait lire ──────────────────────────────────────────

test('estLisible : le texte est lu, le binaire est écarté', () => {
  for (const f of [
    'assets/index-cbTt_dOj.js',
    'index.html',
    'assets/index-Cghm92aC.css',
    'assets/index-cbTt_dOj.js.map',
    'manifest.webmanifest',
    'logo.svg',
  ]) {
    assert.equal(estLisible(f), true, `${f} devrait être lisible`);
  }
  for (const f of ['logo.png', 'inter.woff2', 'favicon.ico', 'photo.jpg']) {
    assert.equal(
      estLisible(f),
      false,
      `${f} n’est pas du texte : l’ouvrir en utf8 produirait un faux positif`
    );
  }
});

// ─── 2. Parcours du dossier produit ─────────────────────────────────

test('fichiersDuDossier : descend dans les sous-dossiers, dans un ordre stable', () => {
  const racine = mkdtempSync(join(tmpdir(), 'garde-build-'));
  try {
    mkdirSync(join(racine, 'assets'));
    mkdirSync(join(racine, 'assets', 'deep'));
    writeFileSync(join(racine, 'index.html'), '<html></html>');
    writeFileSync(join(racine, 'assets', 'a.js'), 'const a=1;');
    writeFileSync(join(racine, 'assets', 'deep', 'b.css'), 'body{}');

    const trouves = fichiersDuDossier(racine).map((f) => f.slice(racine.length + 1));
    assert.deepEqual(trouves, ['assets/a.js', 'assets/deep/b.css', 'index.html']);

    // Deux appels doivent rendre le même ordre : un rapport qui change d'ordre
    // à chaque exécution rend les comparaisons impossibles.
    assert.deepEqual(fichiersDuDossier(racine), fichiersDuDossier(racine));
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
});

// ─── 3. Le verdict, cas propre et cas sale ──────────────────────────

test('verdictsDesFichiers : un dossier produit sain ne rend aucune trouvaille', () => {
  const { fuites, lus } = verdictsDesFichiers([
    { fichier: 'index.html', texte: '<html><body>BuildPact</body></html>' },
    { fichier: 'assets/index.js', texte: 'const url="https://api.devnet.solana.com";' },
  ]);
  assert.deepEqual(fuites, []);
  assert.equal(lus, 2);
});

test('verdictsDesFichiers : une clé dans l’artefact produit REFUSE la publication', () => {
  // Exactement la forme de l'incident : Vite inline la variable déclarée, et
  // la clé se retrouve dans le JavaScript produit.
  const { fuites } = verdictsDesFichiers([
    { fichier: 'assets/index.js', texte: `const e="https://devnet.helius-rpc.com/?api-key=${FAUSSE}";` },
  ]);
  assert.equal(fuites.length, 1, `attendu 1 refus : ${JSON.stringify(fuites)}`);
  assert.match(fuites[0], /assets\/index\.js/, 'le refus doit nommer le fichier fautif');
  assert.match(fuites[0], new RegExp(empreinte(FAUSSE)));
});

test('verdictsDesFichiers : le refus ne recopie jamais la valeur', () => {
  const { fuites } = verdictsDesFichiers([
    { fichier: 'assets/index.js', texte: `const e="https://devnet.helius-rpc.com/?api-key=${FAUSSE}";` },
  ]);
  const rendu = JSON.stringify(fuites);
  assert.equal(rendu.includes(FAUSSE), false, 'un refus qui recopie le secret le publie une 2e fois');
  assert.ok(rendu.includes(empreinte(FAUSSE)));
});

test('verdictsDesFichiers : un jeton Supabase service_role refuse, le anon non', () => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (role: string) =>
    `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase', ref: 'exemple' })}.${'s'.repeat(43)}`;

  assert.equal(
    verdictsDesFichiers([{ fichier: 'assets/index.js', texte: `const k="${jwt('service_role')}";` }]).fuites.length,
    1
  );
  // `anon` est public par conception : il part dans TOUT bundle d'une app
  // Supabase. Le refuser bloquerait chaque build — donc, à l'usage, ferait
  // désactiver le garde-fou.
  assert.deepEqual(
    verdictsDesFichiers([{ fichier: 'assets/index.js', texte: `const k="${jwt('anon')}";` }]).fuites,
    []
  );
});

// ─── 4. La règle PARTAGÉE : une référence n'est pas une valeur ──────
// `secret-rules.mjs` sert à la fois au scan du dépôt, à celui de l'historique,
// au contrôle de production, au balayage du parc et à ce garde-fou de build.
// Le cas ci-dessous a rendu `npm test` rouge le 11/10/2026 sur du code sain :
// les tests vivent ici parce que la règle est le socle de ce garde-fou.

test('analyser : une référence d’environnement n’est pas un secret', () => {
  // Le faux positif, mot pour mot, tel qu’il a été mesuré : `AFFECTATION`
  // accepte le `.` (elle doit lire `foo.bar.baz`), donc un long chemin
  // d’environnement ressemblait à un secret. Le code appelant documente
  // d’ailleurs que la clé passe par un relais en production.
  assert.deepEqual(
    analyser(
      'const apiKey = import.meta.env.VITE_TOKENS_API_KEY as string | undefined;',
      'src/components/WalletPanel.tsx'
    ),
    [],
    'le NOM d’une variable n’est pas sa valeur — signaler la référence rend le contrôle rouge sur du code sain'
  );
  assert.deepEqual(analyser('if (process.env.SUPABASE_SERVICE_KEY) {', 'x.ts'), []);
});

test('analyser : une vraie valeur littérale reste signalée (la règle n’est pas affaiblie)', () => {
  // La contrepartie, et c’est elle qui compte : si exclure les références
  // faisait taire aussi les littéraux, on aurait remplacé un faux positif par
  // un faux négatif — bien pire, et silencieux.
  const trouvees = analyser(`const apiKey = "${FAUSSE}";`, 'config.ts');
  assert.equal(trouvees.length, 1, `attendu 1 trouvaille : ${JSON.stringify(trouvees)}`);
  assert.match(trouvees[0], /apiKey/);
  assert.equal(
    JSON.stringify(trouvees).includes(FAUSSE),
    false,
    'le mode par défaut masque déjà la valeur — un rapport qui la recopie la republie'
  );
});

test('verdictsDesFichiers : un dossier vide ne ressemble pas à un dossier sain', () => {
  // Le garde-fou décide sur `lus === 0` : c'est au script d'en faire un code 2.
  // Ce test fixe la valeur sur laquelle cette décision repose.
  const { fuites, lus } = verdictsDesFichiers([]);
  assert.deepEqual(fuites, []);
  assert.equal(lus, 0, 'aucun fichier lu doit rester visible, pas devenir un zéro silencieux');
});
