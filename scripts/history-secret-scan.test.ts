// scripts/history-secret-scan.test.ts
// ═══════════════════════════════════════════════════════════════════
// Tests de scripts/history-secret-scan.mjs — l'audit de tout l'historique.
//
// ── Ce que ces tests doivent prouver ─────────────────────────────────
// Pas « le script démarre ». Ceci : **un secret retiré du fichier de travail
// reste trouvable dans l'historique, et le rapport le dit sans le publier.**
// C'est la seule propriété qui justifie l'existence du script, et la seule
// qu'un test peut réellement tenir.
//
// La preuve est faite sur un DÉPÔT GIT FACTICE, créé dans un dossier
// temporaire : deux commits, le second retire le secret du fichier. Le
// scanner tourne sur ce dépôt par les mêmes fonctions que sur le vrai —
// l'énumération git réelle, la lecture réelle, les règles réelles. Un test
// qui réécrirait l'énumération ne prouverait rien.
//
// ── Aucune valeur en clair ──────────────────────────────────────────
// Les secrets factices sont ASSEMBLÉS à l'exécution (`F()`), comme dans
// `secret-scan.test.ts` : ce fichier est lui-même scanné par le contrôle des
// fichiers suivis, et un littéral de forme secrète le ferait échouer sur sa
// propre source. Les valeurs n'existent donc qu'en mémoire, et dans le
// dépôt factice — jamais sur disque dans ce dépôt-ci.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseFlux,
  analyserCibles,
  scannerHistorique,
  scannerHistoriqueProfond,
  analyserBlobProfond,
  decouperWindows,
  loterParTaille,
  runsImprimables,
  TAILLE_MAX,
} from './history-secret-scan.mjs';
import { empreinte } from './secret-rules.mjs';

/** Assemble une valeur sans jamais l'écrire en clair dans ce fichier. */
const F = (...morceaux: string[]): string => morceaux.join('');

// ─── Les valeurs factices du dépôt d'essai ───────────────────────────
// Formes calquées sur les vraies trouvailles du 09/10/2026 : une clé privée
// VAPID (43 car., minuscules + MAJUSCULES + chiffres) et une clé d'API dans
// une URL. Aucune ne vaut rien : elles sont fabriquées.
const NOM_PRIVE = F('VAPID', '_PRIVATE_KEY');
const CLE_PRIVEE = F('Zm9v', 'QmFy', 'QmF6', 'UXV4', 'MDEy', 'MzQ1', 'Njc4', 'OUFi', 'Q2RF', 'Zg');
const CLE_RPC = F('7f3a9c21', '4e8b', '4d1a', '9c5f', 'ab27d4e61893');

// Les deux valeurs du mode PROFOND, distinctes des précédentes : sans cela,
// un secret déjà trouvé par le balayage normal rendrait impossible la
// démonstration « le mode normal l'écarte, le mode profond le trouve ».
const CLE_GROS = F('Q2xH', 'cm9z', 'Qmxv', 'YjQ0', 'S2lv', 'MTIz', 'NDU2', 'Nzg5', 'QWJD', 'ZEVm');
const CLE_BINAIRE = F('YTJiM', '2M0R', 'lMmY', '3YzR', 'kNjE', '2MzQ', '1NjI', '3NDU', '2NTY', 'zNzE');

const DOC_FACTICE = F('| `', NOM_PRIVE, '` | `', CLE_PRIVEE, '` |');

/** Exécute git dans un dossier, sans dépendre de la config de la machine. */
function git(cwd: string, args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'user.email=test@exemple.test', '-c', 'user.name=Test', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

/**
 * `git grep` dans l'arbre de travail, réduit à un code de sortie : 0 = motif
 * présent, 1 = absent. Un dépôt factice sans cette distinction ne prouverait
 * pas que le secret a bien été RETIRÉ.
 */
function grepArbre(cwd: string, motif: string): number {
  try {
    execFileSync('git', ['grep', '-q', '-F', motif], { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
}

/**
 * Dépôt factice : le secret est committé, PUIS retiré du fichier de travail.
 * C'est exactement la situation réelle — la valeur n'est plus dans l'arbre,
 * mais elle est dans l'historique.
 */
function depotAvecSecretEnfoui(): string {
  const dossier = mkdtempSync(join(tmpdir(), 'history-scan-'));
  git(dossier, ['init', '-q', '-b', 'main']);

  writeFileSync(
    join(dossier, '.env'),
    [F('VITE_RPC_URL=https://devnet.exemple.test/?api-key=', CLE_RPC), F(NOM_PRIVE, '=', CLE_PRIVEE), ''].join('\n')
  );
  writeFileSync(join(dossier, 'DOC.md'), ['# Doc', '', DOC_FACTICE, ''].join('\n'));
  git(dossier, ['add', '-A']);
  git(dossier, ['commit', '-q', '-m', 'version qui contient le secret']);

  // Retrait : le fichier reste, la valeur disparaît de l'arbre de travail.
  writeFileSync(join(dossier, '.env'), 'VITE_RPC_URL=https://devnet.exemple.test/\n');
  writeFileSync(join(dossier, 'DOC.md'), ['# Doc', '', '| `', NOM_PRIVE, '` | retirée |', ''].join('\n'));
  git(dossier, ['commit', '-q', '-am', 'retrait du secret du fichier de travail']);

  return dossier;
}

// ─── 1. Le format de `git cat-file --batch` ───────────────────────────

test('parseFlux découpe entêtes et contenus', () => {
  const flux = Buffer.concat([
    Buffer.from('a'.repeat(40) + ' blob 5\nhello\n'),
    Buffer.from('b'.repeat(40) + ' blob 11\nbonjour !!!\n'),
  ]);
  const objets = parseFlux(flux as Buffer);
  assert.equal(objets.length, 2);
  assert.equal(objets[0].oid, 'a'.repeat(40));
  assert.equal(objets[0].contenu.toString('utf8'), 'hello');
  assert.equal(objets[1].contenu.toString('utf8'), 'bonjour !!!');
});

test('parseFlux s’arrête proprement sur un objet manquant', () => {
  // `cat-file` répond `<oid> missing` : pas de taille, donc pas de contenu.
  // S'arrêter est le bon comportement — continuer décalerait la lecture et
  // attribuerait le contenu d'un blob à un autre.
  const objets = parseFlux(Buffer.from('c'.repeat(40) + ' missing\n'));
  assert.deepEqual(objets, []);
});

// ─── 2. Ce que le balayage écarte, et qu'il assume ────────────────────

test('analyserCibles compte séparément les blobs écartés', () => {
  const texte = F(NOM_PRIVE, '=', CLE_PRIVEE);
  const entrees = [
    { oid: 'a'.repeat(40), chemin: 'gros.txt', type: 'blob', taille: 999_999 },
    { oid: 'b'.repeat(40), chemin: 'image.png', type: 'blob', taille: 10 },
    { oid: 'c'.repeat(40), chemin: '.env', type: 'blob', taille: 10 },
    { oid: 'd'.repeat(40), chemin: 'arbre', type: 'tree', taille: 10 },
  ];
  const contenus: Record<string, Buffer> = {
    ['b'.repeat(40)]: Buffer.from([0x89, 0x50, 0x00, 0x4e]),
    ['c'.repeat(40)]: Buffer.from(texte),
  };

  const r = analyserCibles({ entrees, lire: (oid) => contenus[oid], maxOctets: 1000 });
  assert.equal(r.examines, 1, 'un seul blob textuel lisible');
  assert.equal(r.ignores.gros, 1);
  assert.equal(r.ignores.binaires, 1);
  assert.equal(r.trouvailles.length, 1, 'le .env est la seule trouvaille');
});

// ─── 3. LE test qui compte : un secret enfoui est retrouvé, masqué ────

test('un secret retiré du fichier de travail est retrouvé dans l’historique', async () => {
  const dossier = depotAvecSecretEnfoui();
  try {
    // Prémisse : la valeur n'est PLUS dans l'arbre de travail. Sans cette
    // vérification, le test passerait pour la mauvaise raison (un scanner
    // des fichiers présents au lieu d'un scanner d'historique).
    assert.equal(grepArbre(dossier, CLE_PRIVEE), 1, 'la clé ne doit plus être dans l’arbre de travail');
    assert.equal(grepArbre(dossier, CLE_RPC), 1, 'la clé RPC ne doit plus être dans l’arbre de travail');

    const rapport = await scannerHistorique({ cwd: dossier });

    // Les trois formes présentes dans le dépôt d'essai doivent être vues :
    // l'affectation `.env`, la cellule de tableau Markdown, et l'URL.
    const attendues = [empreinte(CLE_PRIVEE), empreinte(CLE_RPC)];
    const texte = rapport.trouvailles.join('\n');
    for (const e of attendues) {
      assert.ok(texte.includes(e), `empreinte ${e} absente du rapport :\n${texte}`);
    }
    assert.ok(rapport.trouvailles.some((t) => /valeur longue/.test(t)), 'la forme « cellule » n’est pas couverte');
    assert.ok(rapport.trouvailles.some((t) => /api-key/.test(t)), 'la forme « URL » n’est pas couverte');

    // Et le rapport ne doit contenir AUCUNE valeur — ni entière, ni tronquée.
    for (const trouvee of rapport.trouvailles) {
      assert.equal(trouvee.includes(CLE_PRIVEE), false, `le rapport publie la clé : ${trouvee}`);
      assert.equal(trouvee.includes(CLE_PRIVEE.slice(0, 8)), false, `le rapport publie un préfixe : ${trouvee}`);
      assert.equal(trouvee.includes(CLE_RPC), false, `le rapport publie la clé RPC : ${trouvee}`);
      assert.equal(trouvee.includes(CLE_RPC.slice(0, 8)), false, `le rapport publie un préfixe RPC : ${trouvee}`);
    }

    // Le rapport situe la trouvaille : sans chemin, il n'est pas exploitable.
    assert.ok(texte.includes('.env'), 'le chemin du blob fautif doit apparaître');
    assert.ok(rapport.examines >= 2, `blobs lus : ${rapport.examines}`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

// ─── 4. Le mode profond : l'angle mort de la limite de taille ─────────

test('decouperWindows avance toujours et recouvre ce qu’il faut', () => {
  const w = decouperWindows(2500, { fenetre: 1000, recouvrement: 200 });
  assert.equal(w[0].debut, 0);
  assert.equal(w[w.length - 1].fin, 2500);
  for (let i = 1; i < w.length; i += 1) {
    assert.equal(w[i].debut, w[i - 1].fin - 200, 'le recouvrement doit valoir exactement la marge annoncée');
  }
  // Recouvrement plus grand que la fenêtre : le pas ne peut pas devenir nul
  // (boucle infinie), il est borné à 1 octet.
  const serre = decouperWindows(10, { fenetre: 100, recouvrement: 500 });
  assert.equal(serre[serre.length - 1].fin, 10);
  assert.ok(serre.every((f) => f.fin > f.debut));
  assert.deepEqual(decouperWindows(0), []);
});

test('loterParTaille borne la mémoire sans perdre un seul blob', () => {
  const entrees = [5, 5, 5, 5, 5].map((taille, i) => ({ oid: `o${i}`, chemin: `f${i}`, type: 'blob', taille }));
  const lots = loterParTaille(entrees, 12);
  assert.deepEqual(lots.map((l) => l.length), [2, 2, 1]);
  assert.equal(lots.flat().length, 5, 'aucun blob ne doit être laissé de côté');

  // Un blob plus gros que le plafond forme son propre lot : il est lu, pas
  // écarté. C'est exactement ce que le mode normal ne faisait pas.
  const enorme = { oid: 'x', chemin: 'gros.bin', type: 'blob', taille: 999 };
  assert.deepEqual(loterParTaille([enorme], 12).map((l) => l.length), [1]);
});

test('runsImprimables extrait le texte d’un binaire, pas ses octets bruts', () => {
  // ⚠️ La valeur de la plage est ASSEMBLÉE (F) comme les autres, et pas
  // seulement par principe : écrite d'un seul tenant, elle a réellement fait
  // échouer le contrôle des fichiers suivis (« valeur littérale » sur la
  // ligne), à la première écriture de ce test. Le garde-fou a attrapé son
  // propre test — c'est le comportement voulu.
  const ligne = F('VAPID_PRIVATE', '_KEY=', 'abcdef', '0123456789', 'ABCDEF');
  const runs = runsImprimables(`\u0000\u0001${ligne}\u0000\u0002court`);
  assert.equal(runs.length, 1, `plages : ${JSON.stringify(runs)}`);
  assert.equal(runs[0], ligne, 'la plage doit être le texte, sans les octets qui l’encadrent');
  assert.ok(!runs[0].includes('court'), 'une plage trop courte ne doit pas être retenue');
  assert.deepEqual(runsImprimables('\u0000\u0001\u0002'), [], 'un binaire sans texte ne produit aucune plage');
});

test('un secret au-delà de la limite de taille : écarté en normal, trouvé en profond', () => {
  const octets = Buffer.concat([
    Buffer.alloc(400_000, 0x41), // 400 Kio de remplissage : au-dessus de la limite
    Buffer.from(`\n${F(NOM_PRIVE, '=', CLE_GROS)}\n`),
  ]);
  const entrees = [{ oid: 'a'.repeat(40), chemin: 'gros.env', type: 'blob', taille: octets.length }];

  // Prémisse : le balayage normal ne lit PAS ce blob (c'est l'angle mort).
  const normal = analyserCibles({ entrees, lire: () => octets, maxOctets: TAILLE_MAX });
  assert.equal(normal.examines, 0);
  assert.equal(normal.ignores.gros, 1);

  // Le mode profond le lit et le trouve.
  const profond = analyserBlobProfond({ octets, etiquette: 'gros.env (aaaaaaa)' });
  assert.ok(profond.trouvailles.join('\n').includes(empreinte(CLE_GROS)), 'le secret du gros blob n’est pas vu');
  assert.equal(profond.tronque, false);
  assert.ok(profond.octetsLus > 400_000);
});

test('la frontière entre deux fenêtres ne cache pas une trouvaille', () => {
  const ligne = Buffer.from(`\n${F(NOM_PRIVE, '=', CLE_GROS)}\n`);
  const octets = Buffer.concat([Buffer.alloc(100, 0x78), ligne, Buffer.alloc(300, 0x79)]);

  // Sans recouvrement, la ligne est coupée en deux : ni l'une ni l'autre
  // moitié ne porte « nom = valeur » en entier. C'est le faux négatif que le
  // recouvrement existe pour empêcher — et le test le MESURE, il ne le
  // suppose pas.
  const sans = analyserBlobProfond({ octets, etiquette: 'coupe.env', fenetre: 110, recouvrement: 0 });
  assert.equal(sans.trouvailles.length, 0, 'prémisse fausse : la coupe ne suffit plus à cacher la ligne');

  const avec = analyserBlobProfond({ octets, etiquette: 'coupe.env', fenetre: 110, recouvrement: 64 });
  assert.ok(avec.trouvailles.join('\n').includes(empreinte(CLE_GROS)), 'le recouvrement ne couvre pas la frontière');
});

test('dans un binaire, les symboles ne sont pas pris pour des secrets', () => {
  // Mesure réelle du 09/10/2026, sur l'historique de ce dépôt : le mode
  // profond a rendu 843 trouvailles, dont 831 venaient de la règle SOUPLE
  // (« jeton long près d'un mot sensible ») appliquée aux `.rcgu.o` de
  // `target/` — des symboles mangled de Rust et des chaînes DWARF. Un rapport
  // qui crie 98 % de bruit est un rapport qu'on n'ouvre plus.
  const symbole = F('AAAAbCdEf', '0123456789', 'abcdefABCDEF', '0123456789', 'abcdefghij');
  const artefact = Buffer.concat([
    Buffer.alloc(16, 0x00),
    Buffer.from(`\nsecret_zone ${symbole} secret_bytes credencial\n`),
    Buffer.alloc(16, 0x00),
  ]);
  assert.deepEqual(
    analyserBlobProfond({ octets: artefact, etiquette: 'objet.rcgu.o (ggggggg)' }).trouvailles,
    [],
    'un symbole de compilation est pris pour un secret'
  );

  // Mais le binaire reste fouillé : une affectation réelle y est toujours vue.
  const avec = Buffer.concat([artefact, Buffer.from(`\n${F(NOM_PRIVE, '=', CLE_BINAIRE)}\n`)]);
  assert.ok(
    analyserBlobProfond({ octets: avec, etiquette: 'objet.rcgu.o (ggggggg)' })
      .trouvailles.join('\n')
      .includes(empreinte(CLE_BINAIRE)),
    'le binaire n’est plus fouillé du tout : on a coupé le signal avec le bruit'
  );
});

test('un binaire qui porte un secret est fouillé ; un binaire propre ne crie pas', () => {
  const entete = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x00]);
  const avecSecret = Buffer.concat([
    entete,
    Buffer.from(`\n${F(NOM_PRIVE, '=', CLE_BINAIRE)}\n`),
    Buffer.alloc(64, 0x00),
  ]);
  const trouve = analyserBlobProfond({ octets: avecSecret, etiquette: 'binaire.bin (bbbbbbb)' });
  assert.ok(
    trouve.trouvailles.join('\n').includes(empreinte(CLE_BINAIRE)),
    `secret compilé non vu : ${JSON.stringify(trouve.trouvailles)}`
  );

  const propre = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.alloc(4096, 0x80),
    Buffer.from('IHDR chunk IDAT IEND aucune valeur ici'),
  ]);
  assert.deepEqual(
    analyserBlobProfond({ octets: propre, etiquette: 'image.png (ddddddd)' }).trouvailles,
    [],
    'faux positif sur un binaire sans secret'
  );
});

/**
 * Dépôt factice du mode profond : le secret n'existe QUE dans un blob que le
 * balayage normal refuse de lire — un fichier de 400 Kio et un binaire.
 */
function depotAvecSecretsInvisibles(): string {
  const dossier = mkdtempSync(join(tmpdir(), 'history-scan-profond-'));
  git(dossier, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dossier, 'gros.env'), 'A'.repeat(400_000) + F('\n', NOM_PRIVE, '=', CLE_GROS, '\n'));
  writeFileSync(
    join(dossier, 'artefact.bin'),
    Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), Buffer.from(F('\n', NOM_PRIVE, '=', CLE_BINAIRE, '\n')), Buffer.alloc(32, 0)])
  );
  git(dossier, ['add', '-A']);
  git(dossier, ['commit', '-q', '-m', 'artefacts de build']);
  return dossier;
}

test('le mode profond trouve, dans un vrai dépôt, ce que le mode normal écarte', async () => {
  const dossier = depotAvecSecretsInvisibles();
  try {
    // Prémisse : le balayage normal ne voit RIEN — ni le gros fichier, ni le
    // binaire. Sans cette mesure, le test suivant ne prouverait pas que le
    // mode profond apporte quelque chose.
    const normal = await scannerHistorique({ cwd: dossier });
    assert.deepEqual(normal.trouvailles, [], 'le mode normal voit déjà un secret : la démonstration tombe');
    assert.equal(normal.ignores.gros, 1);
    assert.equal(normal.ignores.binaires, 1);

    const profond = await scannerHistoriqueProfond({ cwd: dossier });
    assert.equal(profond.tronque, false);
    assert.ok(profond.examines >= 2, `blobs lus : ${profond.examines}`);
    const texte = profond.trouvailles.join('\n');
    assert.ok(texte.includes(empreinte(CLE_GROS)), `gros blob non fouillé :\n${texte}`);
    assert.ok(texte.includes(empreinte(CLE_BINAIRE)), `binaire non fouillé :\n${texte}`);
    // Le rapport situe la trouvaille, et ne publie jamais la valeur.
    assert.ok(texte.includes('gros.env'), 'le chemin du gros blob doit apparaître');
    assert.ok(texte.includes('artefact.bin'), 'le chemin du binaire doit apparaître');
    for (const t of profond.trouvailles) {
      assert.equal(t.includes(CLE_GROS), false, `le rapport publie la clé : ${t}`);
      assert.equal(t.includes(CLE_BINAIRE), false, `le rapport publie la clé : ${t}`);
    }
    // Le recouvrement relit des octets : la même trouvaille ne doit pas être
    // annoncée deux fois.
    assert.equal(new Set(profond.trouvailles).size, profond.trouvailles.length, 'trouvailles dupliquées');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

/**
 * Dépôt factice du test de budget : UN SEUL blob, le secret à la fin.
 *
 * ⚠️ Pourquoi un dépôt dédié : `git rev-list` n'ordonne pas ses sorties, et
 * le budget s'épuise donc sur le premier blob venu. Avec deux blobs dont un
 * petit, l'ordre décidait du résultat et le test passait ou échouait selon
 * l'arrangement du pack. Un test qui dépend de l'ordre de git n'est pas un
 * test.
 */
function depotGrosFichierSeul(): string {
  const dossier = mkdtempSync(join(tmpdir(), 'history-scan-budget-'));
  git(dossier, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dossier, 'gros.env'), 'A'.repeat(400_000) + F('\n', NOM_PRIVE, '=', CLE_GROS, '\n'));
  git(dossier, ['add', '-A']);
  git(dossier, ['commit', '-q', '-m', 'un seul gros fichier']);
  return dossier;
}

test('un budget épuisé est annoncé par le CLI, jamais maquillé en feu vert', async () => {
  const dossier = depotGrosFichierSeul();
  try {
    const r = await scannerHistoriqueProfond({ cwd: dossier, budget: 1000 });
    assert.equal(r.tronque, true, 'un budget insuffisant doit être reconnu comme tel');
    assert.deepEqual(r.trouvailles, [], 'le secret est au-delà des 1 000 premiers octets');

    // Et l'INTERFACE le dit : c'est le code de sortie que lit un script, pas
    // le rapport. Un « rien trouvé » incomplet qui sortirait en 0 serait le
    // pire des mensonges — un feu vert qui n'a rien vérifié.
    //
    // ⚠️ Le `try` n'entoure QUE le lancement du CLI. Une première version
    // englobait aussi les assertions ci-dessus : un échec là-haut était
    // avalé par ce `catch` et rapporté ici comme un « code de sortie
    // inattendu » — le message pointait le mauvais endroit. Un `try` autour
    // d'assertions finit toujours par mentir sur la cause.
    let statut: number | undefined;
    let sortie = '';
    try {
      execFileSync(
        process.execPath,
        [join(import.meta.dirname, 'history-secret-scan.mjs'), '--profond', '--budget', '1000', '--racine', dossier],
        { encoding: 'utf8' }
      );
      statut = 0;
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      statut = err.status;
      sortie = String(err.stdout ?? '');
    }

    assert.equal(statut, 2, `code de sortie attendu 2, obtenu ${statut}`);
    assert.match(sortie, /INCOMPLET/, 'le rapport doit dire que le balayage est incomplet');
    assert.match(sortie, /budget/i, 'le rapport doit mentionner le budget');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('un historique sans secret ne rend rien — le contrôle ne crie pas toujours', async () => {
  // Sans ce cas, un scanner qui renverrait « trouvé » en toutes circonstances
  // passerait le test précédent sans rien détecter.
  const dossier = mkdtempSync(join(tmpdir(), 'history-scan-vide-'));
  try {
    git(dossier, ['init', '-q', '-b', 'main']);
    writeFileSync(join(dossier, 'README.md'), '# Rien à signaler\n\nAucune valeur ici.\n');
    git(dossier, ['add', '-A']);
    git(dossier, ['commit', '-q', '-m', 'documentation seulement']);

    const rapport = await scannerHistorique({ cwd: dossier });
    assert.deepEqual(rapport.trouvailles, [], 'faux positif sur un dépôt propre');
    assert.ok(rapport.examines >= 1, 'le README doit avoir été lu');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
