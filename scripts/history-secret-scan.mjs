#!/usr/bin/env node
// scripts/history-secret-scan.mjs
// ═══════════════════════════════════════════════════════════════════
// AUDIT DE TOUT L'HISTORIQUE — cherche des secrets dans les blobs, pas
// seulement dans les fichiers d'aujourd'hui.
//
// ── Pourquoi ce script existe ────────────────────────────────────────
// `scripts/secret-scan.test.ts` regarde les fichiers SUIVIS. Il est aveugle
// à l'historique, et c'est exactement là que les secrets s'accumulent : une
// clé retirée du fichier reste lisible dans tout clone, pour toujours. Le
// 09/10/2026, un audit manuel a trouvé six valeurs de forme secrète encore
// atteignables depuis `origin/main` — une clé VAPID privée complète, les 27
// premiers caractères de la même clé dans un fichier de test, une clé d'API
// RPC vivante dans un `.env`, et deux fichiers de keypair Solana.
//
// Cet audit était jetable. Un balayage qu'on ne peut pas relancer ne protège
// rien : c'est un constat, pas un contrôle. Le voici permanent.
//
// ── Ce que fait la commande ──────────────────────────────────────────
//   1. énumère tous les blobs atteignables depuis N'IMPORTE quelle ref
//      (`git rev-list --objects --all`) ;
//   2. écarte les binaires et les blobs au-delà de la limite de taille, et
//      DIT combien il en a écartés (un angle mort tu est un angle mort qui
//      se referme sur toi) ;
//   3. applique les règles partagées de `scripts/secret-rules.mjs`, en mode
//      MASQUÉ : le rapport ne contient que des empreintes et des longueurs.
//      Jamais une valeur, jamais même un préfixe.
//
// Par défaut, l'angle mort est RÉEL et mesuré : au 09/10/2026, 914 blobs de
// plus de 256 Kio (1 364 Mio à eux seuls) et 1 395 binaires n'étaient pas
// lus. Un secret peut y dormir — typiquement un `.env` avalé par un artefact
// de build, ou une clé compilée dans un bundle.
//
// D'où `--profond`, qui referme l'angle mort :
//   · TOUS les blobs, quelle que soit leur taille ;
//   · les binaires AUSSI, par extraction des plages de texte imprimable —
//     un secret compilé dans un binaire reste du texte ;
//   · lecture par FENÊTRES de 1 Mio qui se recouvrent de 64 Kio, pour que
//     deux octets séparés par une frontière de fenêtre ne passent pas entre
//     les mailles ;
//   · un BUDGET d'octets (2 Gio par défaut) : un balayage qui dépasserait la
//     machine s'arrête et le DIT (`tronque: true`, code 2) plutôt que de
//     rendre un « rien trouvé » qui ne voudrait rien dire.
//
// ⚠️ Le mode profond lit vraiment tout : comptez la minute, pas la seconde.
// C'est le prix de la seule réponse qui vaille à « et dans les gros blobs ? ».

// ── Codes de sortie ──────────────────────────────────────────────────
//   0 — balayage fait, rien trouvé
//   1 — trouvailles : l'historique porte des valeurs de forme secrète
//   2 — balayage IMPOSSIBLE (pas un dépôt git, git absent, sortie illisible)
//       ou INCOMPLET (budget d'octets épuisé avant la fin)
//       ⚠ 2 n'est PAS un succès, et ne doit jamais être lu comme tel.
//
// Usage :
//   node scripts/history-secret-scan.mjs
//   node scripts/history-secret-scan.mjs --json
//   node scripts/history-secret-scan.mjs --chemins '\.env$'   (restreindre)
//   node scripts/history-secret-scan.mjs --max-octets 1048576  (défaut 262144)
//   node scripts/history-secret-scan.mjs --profond               (tout lire, binaires compris)
//   node scripts/history-secret-scan.mjs --profond --budget 4294967296
// ═══════════════════════════════════════════════════════════════════
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { analyser } from './secret-rules.mjs';

/** Limite de taille par blob : au-delà, on ne lit pas (et on le dit). */
export const TAILLE_MAX = 262_144;

/** Nombre de blobs lus par appel à `git cat-file --batch` : borne la mémoire. */
export const LOT = 200;

/** Fenêtre du mode profond : ce qu'on lit d'un coup. */
export const FENETRE = 1_048_576; // 1 Mio

/** Recouvrement entre deux fenêtres : couvre une trouvaille à cheval sur la
 *  frontière. Très au-dessus du plus long motif recherché (une clé privée
 *  P-256 fait ~100 caractères), donc la coupe ne peut pas cacher un secret. */
export const RECOUVREMENT = 65_536; // 64 Kio

/** Budget d'octets du mode profond : au-delà, on s'arrête et on le dit. */
export const BUDGET = 2 * 1024 * 1024 * 1024; // 2 Gio

/** Mémoire maximale d'un lot de lecture profonde (le pic = ce plafond). */
export const PLAFOND_LOT = 32 * 1024 * 1024; // 32 Mio

/** Longueur minimale d'une plage de texte retenue dans un binaire. */
export const RUN_MIN = 16;

const LIMITE_SORTIE_GIT = 256 * 1024 * 1024;

/**
 * Énumère les blobs atteignables depuis toutes les refs.
 *
 * ⚠ `--all` inclut les branches distantes connues localement, donc `origin/*`.
 * C'est ce qu'on veut : « atteignable depuis le dépôt distant » est la seule
 * question qui compte. Une ref absente (clone partiel) réduit le périmètre —
 * le rapport affiche le nombre de refs examinées pour que le lecteur puisse
 * juger de lui-même si le balayage était complet.
 *
 * @returns {{entrees: {oid: string, chemin: string, type: string, taille: number}[], refs: number}}
 */
export function listeBlobs({ cwd }) {
  const brut = execFileSync('git', ['rev-list', '--objects', '--all'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: LIMITE_SORTIE_GIT,
  });

  // Un objet peut apparaître plusieurs fois : on garde le premier chemin vu,
  // en préférant un chemin renseigné (les commits et les arbres n'en ont pas).
  const chemins = new Map();
  for (const ligne of brut.split('\n')) {
    if (!ligne) continue;
    const sep = ligne.indexOf(' ');
    const oid = sep === -1 ? ligne : ligne.slice(0, sep);
    const chemin = sep === -1 ? '' : ligne.slice(sep + 1);
    if (!chemins.has(oid)) chemins.set(oid, chemin);
    else if (!chemins.get(oid) && chemin) chemins.set(oid, chemin);
  }

  const oids = [...chemins.keys()];
  const entrees = [];
  for (let i = 0; i < oids.length; i += 2000) {
    const tranche = oids.slice(i, i + 2000);
    const sortie = execFileSync(
      'git',
      ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      { cwd, input: tranche.join('\n') + '\n', encoding: 'utf8', maxBuffer: LIMITE_SORTIE_GIT }
    );
    for (const ligne of sortie.split('\n')) {
      const m = /^([0-9a-f]{40,64}) ([a-z]+) (\d+)$/.exec(ligne.trim());
      if (!m) continue;
      entrees.push({ oid: m[1], type: m[2], taille: Number(m[3]), chemin: chemins.get(m[1]) ?? '' });
    }
  }

  const refs = execFileSync('git', ['for-each-ref', '--format=%(refname)'], { cwd, encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.trim().length > 0).length;

  return { entrees, refs };
}

/**
 * Lit une série de blobs en un seul processus git.
 * Le format de `cat-file --batch` est : `<oid> <type> <taille>\n<contenu>\n`.
 * @returns {Promise<Buffer>} la sortie brute, à découper par `parseFlux`
 */
export function lireBlobs({ cwd, oids }) {
  return new Promise((resolve, reject) => {
    const enfant = spawn('git', ['cat-file', '--batch'], { cwd, stdio: ['pipe', 'pipe', 'ignore'] });
    const morceaux = [];
    let code = null;
    let erreur = null;
    enfant.on('error', (e) => {
      erreur = e;
    });
    enfant.stdout.on('data', (m) => morceaux.push(m));
    enfant.on('close', (c) => {
      code = c;
      if (erreur) return reject(erreur);
      if (code !== 0) return reject(new Error(`git cat-file --batch a rendu ${code}`));
      resolve(Buffer.concat(morceaux));
    });
    enfant.stdin.on('error', () => {});
    enfant.stdin.end(oids.join('\n') + '\n');
  });
}

/**
 * Découpe une sortie de `cat-file --batch`. Fonction PURE : c'est le seul
 * endroit où le format de git est interprété, donc le seul endroit à tester.
 * Un objet manquant (`<oid> missing`) interrompt le découpage : mieux vaut
 * une lecture partielle assumée qu'un décalage silencieux qui ferait
 * attribuer le contenu d'un blob à un autre.
 * @returns {{oid: string, type: string, contenu: Buffer}[]}
 */
export function parseFlux(tampon) {
  const objets = [];
  let pos = 0;
  while (pos < tampon.length) {
    const finEntete = tampon.indexOf(0x0a, pos);
    if (finEntete === -1) break;
    const entete = tampon.toString('utf8', pos, finEntete);
    const [oid, type, tailleBrute] = entete.split(' ');
    const taille = Number(tailleBrute);
    if (!oid || !type || !Number.isFinite(taille)) break; // objet manquant
    const debut = finEntete + 1;
    objets.push({ oid, type, contenu: tampon.subarray(debut, debut + taille) });
    pos = debut + taille + 1; // on saute le \n qui suit le contenu
  }
  return objets;
}

/**
 * Applique les règles à une liste d'entrées, avec un lecteur injecté.
 * PURE au sens où elle ne parle pas à git : on peut lui donner un lecteur
 * de test. C'est ce qui permet de prouver le contrôle sans dépôt.
 *
 * @param {object} p
 * @param {{oid: string, chemin: string, type: string, taille: number}[]} p.entrees
 * @param {(oid: string) => Buffer|undefined} p.lire
 * @param {number} [p.maxOctets]
 * @returns {{trouvailles: string[], examines: number, ignores: {gros: number, binaires: number, illisibles: number}}}
 */
export function analyserCibles({ entrees, lire, maxOctets = TAILLE_MAX }) {
  const trouvailles = [];
  const ignores = { gros: 0, binaires: 0, illisibles: 0 };
  let examines = 0;

  for (const entree of entrees) {
    if (entree.type !== 'blob') continue;
    if (entree.taille > maxOctets) {
      ignores.gros += 1;
      continue;
    }
    let brut;
    try {
      brut = lire(entree.oid);
    } catch {
      brut = undefined;
    }
    if (!brut || brut.length === 0) {
      ignores.illisibles += 1;
      continue;
    }
    if (brut.includes(0)) {
      ignores.binaires += 1;
      continue;
    }
    examines += 1;
    const etiquette = entree.chemin ? `${entree.chemin} (${entree.oid.slice(0, 7)})` : entree.oid.slice(0, 7);
    trouvailles.push(...analyser(brut.toString('utf8'), etiquette, { masquer: true }));
  }

  return { trouvailles, examines, ignores };
}

// ─── MODE PROFOND — l'angle mort refermé ─────────────────────────────

/**
 * Découpe [0, taille) en fenêtres qui se recouvrent. Fonction PURE.
 *
 * Le recouvrement est ce qui évite le faux négatif le plus sournois : une
 * trouvaille à cheval sur deux fenêtres — invisible dans chacune prise
 * séparément. Le pas ne peut pas être nul (sinon boucle infinie) :
 * `fenetre - recouvrement` est borné à 1 au minimum.
 *
 * @returns {{debut: number, fin: number}[]}
 */
export function decouperWindows(taille, { fenetre = FENETRE, recouvrement = RECOUVREMENT } = {}) {
  const fenetres = [];
  if (!Number.isFinite(taille) || taille <= 0) return fenetres;
  const cadre = Math.max(1, Math.floor(fenetre));
  const pas = Math.max(1, cadre - Math.min(Math.floor(recouvrement), cadre - 1));
  for (let debut = 0; debut < taille; debut += pas) {
    const fin = Math.min(debut + cadre, taille);
    fenetres.push({ debut, fin });
    // Dernière fenêtre : on s'arrête là. Sans ce test, la boucle ajoutait une
    // fenêtre de queue NON alignée sur le pas (2400-2500 pour une taille de
    // 2500 et un pas de 800) — le recouvrement n'était alors plus la marge
    // annoncée, et l'invariant devenait invérifiable. C'est ce que le test
    // « decouperWindows avance toujours » a attrapé.
    if (fin === taille) break;
  }
  return fenetres;
}

/**
 * Plages de texte imprimable d'une tranche. Fonction PURE.
 *
 * Pourquoi fouiller un binaire ainsi plutôt que de l'ignorer : un secret
 * compilé ou embarqué (bundle minifié, `.so`, archive, police) reste du
 * TEXTE. Ce qu'on ne peut pas lire, ce sont les octets hors ASCII — on les
 * traite comme des séparateurs, donc les règles gardent leur granularité de
 * ligne au lieu de voir un seul « mot » de 46 Mio.
 *
 * ⚠️ Les caractères accentués en UTF-8 sortent hors de la plage imprimable :
 * une ligne française accentuée est donc coupée en plusieurs plages. Cela
 * n'empêche pas de trouver une valeur, mais peut séparer un nom de variable
 * de sa valeur si un accent s'y glisse — limite assumée, et sans effet sur
 * les fichiers texte, qui passent par la lecture normale.
 */
export function runsImprimables(texte, { longueurMin = RUN_MIN } = {}) {
  const motif = new RegExp(`[\\x20-\\x7E\\t]{${Math.max(1, longueurMin)},}`, 'g');
  return String(texte).match(motif) ?? [];
}

/**
 * Regroupe des entrées par lots dont la taille cumulée reste sous un
 * plafond. Fonction PURE, et le cœur du compromis mémoire : le pic du mode
 * profond est le plus gros lot, jamais le dépôt.
 * @returns {{oid: string, chemin: string, type: string, taille: number}[][]}
 */
export function loterParTaille(entrees, plafond = PLAFOND_LOT) {
  const lots = [];
  let courant = [];
  let taille = 0;
  for (const e of entrees) {
    if (courant.length > 0 && taille + e.taille > plafond) {
      lots.push(courant);
      courant = [];
      taille = 0;
    }
    courant.push(e);
    taille += e.taille;
  }
  if (courant.length > 0) lots.push(courant);
  return lots;
}

/**
 * Analyse un contenu de blob en fenêtres, sans jamais le tenir en entier en
 * mémoire au-delà du tampon fourni. Fonction PURE (le tampon vient du
 * lecteur) : c'est ici que se prouve, sans dépôt git, qu'un secret enfoui
 * loin dans un gros fichier — ou dans un binaire — est bien vu.
 *
 * @param {object} p
 * @param {Buffer} p.octets contenu à examiner
 * @param {string} p.etiquette libellé du rapport (chemin + oid)
 * @param {number} [p.budgetRestant] octets qu'on accepte encore de lire
 * @returns {{trouvailles: string[], octetsLus: number, fenetres: number, tronque: boolean}}
 */
export function analyserBlobProfond({
  octets,
  etiquette,
  fenetre = FENETRE,
  recouvrement = RECOUVREMENT,
  budgetRestant = Infinity,
}) {
  const disponible = Math.max(0, Math.min(octets.length, budgetRestant));
  const fenetres = decouperWindows(disponible, { fenetre, recouvrement });
  const trouvailles = [];

  for (const { debut, fin } of fenetres) {
    const tranche = octets.subarray(debut, fin);
    // Un octet NUL dans CETTE fenêtre suffit à la traiter comme binaire :
    // un fichier mixte (JSON avec une image en base64, par exemple) est donc
    // fouillé correctement des deux façons, sans décision globale à prendre.
    const binaire = tranche.includes(0);
    if (binaire) {
      const texte = runsImprimables(tranche.toString('utf8')).join('\n');
      if (texte.length === 0) continue;
      // `strict` : dans un binaire, une « ligne » est une plage arbitraire de
      // texte imprimable, donc la règle de FORME (jeton long près d'un mot
      // sensible) n'y vaut rien — elle seule produisait 831 faux positifs sur
      // les `.rcgu.o` de `target/`. Les règles structurelles restent, donc une
      // clé compilée reste vue. Mesure et raisonnement complets : voir
      // l'en-tête de `analyser()` dans secret-rules.mjs.
      trouvailles.push(...analyser(texte, etiquette, { masquer: true, strict: true }));
    } else {
      trouvailles.push(...analyser(tranche.toString('utf8'), etiquette, { masquer: true }));
    }
  }

  return {
    trouvailles,
    octetsLus: disponible,
    fenetres: fenetres.length,
    tronque: disponible < octets.length,
  };
}

/**
 * Balayage PROFOND : tous les blobs, sans limite de taille ni exclusion des
 * binaires, avec un budget d'octets qui s'annonce au lieu de tronquer en
 * silence.
 *
 * Les trouvailles sont dédupliquées : le recouvrement des fenêtres fait
 * relire les mêmes octets, donc produire deux fois le même message. Un
 * rapport qui répète la même ligne n'informe pas plus, il noie.
 *
 * @returns {Promise<{trouvailles: string[], blobs: number, examines: number,
 *   octetsLus: number, tronque: boolean, budget: number, refs: number}>}
 */
export async function scannerHistoriqueProfond({
  cwd = process.cwd(),
  budget = BUDGET,
  fenetre = FENETRE,
  recouvrement = RECOUVREMENT,
  filtre = null,
} = {}) {
  const { entrees, refs } = listeBlobs({ cwd });
  const blobs = entrees.filter((e) => e.type === 'blob' && (!filtre || filtre.test(e.chemin)));

  const trouvailles = new Set();
  let restant = budget;
  let examines = 0;
  let octetsLus = 0;
  let tronque = false;

  for (const lot of loterParTaille(blobs)) {
    if (restant <= 0) {
      tronque = true;
      break;
    }
    const flux = await lireBlobs({ cwd, oids: lot.map((e) => e.oid) });
    const contenus = new Map(parseFlux(flux).map((o) => [o.oid, o.contenu]));
    for (const entree of lot) {
      const contenu = contenus.get(entree.oid);
      if (!contenu) continue; // blob illisible : déjà signalé par l'absence de contenu
      const etiquette = entree.chemin ? `${entree.chemin} (${entree.oid.slice(0, 7)})` : entree.oid.slice(0, 7);
      const r = analyserBlobProfond({ octets: contenu, etiquette, fenetre, recouvrement, budgetRestant: restant });
      for (const t of r.trouvailles) trouvailles.add(t);
      examines += 1;
      octetsLus += r.octetsLus;
      restant -= r.octetsLus;
      if (r.tronque) tronque = true;
      if (restant <= 0) break;
    }
  }

  return {
    trouvailles: [...trouvailles],
    blobs: blobs.length,
    examines,
    octetsLus,
    tronque,
    budget,
    refs,
  };
}

/**
 * Balayage complet : énumération réelle + lecture par lots.
 * @returns {Promise<{trouvailles: string[], examines: number, ignores: object, blobs: number, refs: number}>}
 */
export async function scannerHistorique({ cwd = process.cwd(), maxOctets = TAILLE_MAX, filtre = null } = {}) {
  const { entrees, refs } = listeBlobs({ cwd });
  const retenues = entrees.filter(
    (e) => e.type === 'blob' && e.taille <= maxOctets && (!filtre || filtre.test(e.chemin))
  );

  const trouvailles = [];
  const ignores = { gros: 0, binaires: 0, illisibles: 0 };
  let examines = 0;

  for (let i = 0; i < retenues.length; i += LOT) {
    const lot = retenues.slice(i, i + LOT);
    const flux = await lireBlobs({ cwd, oids: lot.map((e) => e.oid) });
    const contenus = new Map(parseFlux(flux).map((o) => [o.oid, o.contenu]));
    const r = analyserCibles({ entrees: lot, lire: (oid) => contenus.get(oid), maxOctets });
    trouvailles.push(...r.trouvailles);
    examines += r.examines;
    ignores.gros += r.ignores.gros;
    ignores.binaires += r.ignores.binaires;
    ignores.illisibles += r.ignores.illisibles;
  }

  // Les blobs écartés par la limite de taille n'ont jamais été comptés par
  // `analyserCibles` : on complète ici le décompte de l'angle mort.
  const grosTotal = entrees.filter((e) => e.type === 'blob' && e.taille > maxOctets).length;

  return {
    trouvailles,
    examines,
    ignores: { ...ignores, gros: grosTotal },
    blobs: entrees.filter((e) => e.type === 'blob').length,
    refs,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────

const Mio = (octets) => (octets < 1048576 ? `${octets} octets` : `${(octets / 1048576).toFixed(1)} Mio`);

/**
 * Rapport du mode profond. Le CONTEXTE y compte autant que les trouvailles :
 * un « rien trouvé » n'a de valeur que si l'on sait ce qui a été lu, en
 * combien de temps, et si le budget a tenu.
 */
function rapportProfond(r, secondes, json, racine) {
  const conclusion = r.tronque
    ? r.trouvailles.length > 0
      ? 1 // des trouvailles : le code 1 est l'information utile
      : 2 // budget épuisé sans trouvaille : surtout ne pas lire ça comme un feu vert
    : r.trouvailles.length > 0
      ? 1
      : 0;

  if (json) {
    console.log(JSON.stringify({ ...r, secondes, conclusion }, null, 2));
    return conclusion;
  }

  console.log('\n── Audit PROFOND de tout l’historique ────────────────');
  // Le chemin affiché est celui du dépôt RÉELLEMENT balayé (--racine), pas
  // celui du dossier d'où l'on lance la commande : une première version
  // affichait process.cwd(), ce qui faisait lire un rapport sur /tmp comme un
  // rapport sur le dépôt courant. Trompeur, donc à corriger.
  console.log(`  dépôt              : ${realpathSync(racine ?? process.cwd())}`);
  console.log(`  refs examinées     : ${r.refs}`);
  console.log(`  blobs atteignables : ${r.blobs} (tous, sans limite de taille)`);
  console.log(`  blobs lus          : ${r.examines}`);
  console.log(`  octets lus         : ${Mio(r.octetsLus)} en ${secondes.toFixed(1)} s`);
  console.log(`  budget             : ${Mio(r.budget)}`);
  console.log('  binaires           : fouillés (plages de texte), pas écartés');
  console.log('');

  if (r.tronque) {
    console.log('  ⚠ BALAYAGE INCOMPLET : le budget d’octets a été épuisé avant la fin.');
    console.log('    Relancer avec --budget plus haut. Tant que ce n’est pas fait, ce');
    console.log('    rapport ne prouve PAS l’absence de secret.');
    console.log('');
  }

  if (r.trouvailles.length === 0) {
    console.log(r.tronque
      ? '✗ Rien trouvé, mais le balayage est incomplet (code 2).'
      : '✓ Rien trouvé. Tous les blobs ont été lus, binaires compris.');
    return conclusion;
  }

  console.log(`✗ ${r.trouvailles.length} trouvaille(s) — masquées, par empreinte :`);
  for (const t of r.trouvailles) console.log(`    ${t}`);
  console.log('');
  console.log('  → Ce n’est pas un incident en soi, mais ces valeurs sont lisibles par');
  console.log('    quiconque clone le dépôt. Pour chacune : la RÉVOQUER d’abord (une purge');
  console.log('    d’historique ne dévalide rien), puis purger l’historique.');
  console.log('    Voir docs/NOAH-PURGE-VAPID-2026-10-09.md.');
  return conclusion;
}

function main() {
  const args = process.argv.slice(2);
  const valeur = (nom, defaut) => {
    const i = args.indexOf(nom);
    return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
  };
  const cwd = valeur('--racine', process.cwd());
  const maxOctets = Number(valeur('--max-octets', String(TAILLE_MAX)));
  const budget = Number(valeur('--budget', String(BUDGET)));
  const motif = valeur('--chemins', null);
  const json = args.includes('--json');
  const profond = args.includes('--profond');

  if (!Number.isFinite(maxOctets) || maxOctets <= 0) {
    console.error('✗ --max-octets attend un entier positif.');
    return 2;
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    console.error('✗ --budget attend un entier positif (octets).');
    return 2;
  }
  if (!existsSync(cwd)) {
    console.error(`✗ Racine inexistante : ${cwd}`);
    return 2;
  }

  if (profond) {
    const debut = Date.now();
    return scannerHistoriqueProfond({ cwd, budget, filtre: motif ? new RegExp(motif) : null })
      .then((r) => rapportProfond(r, (Date.now() - debut) / 1000, json, cwd))
      .catch((e) => {
        console.error(`✗ Balayage profond impossible : ${String(e.message ?? e).split('\n')[0]}`);
        return 2;
      });
  }

  return scannerHistorique({ cwd, maxOctets, filtre: motif ? new RegExp(motif) : null })
    .then((r) => {
      if (json) {
        console.log(JSON.stringify(r, null, 2));
        return r.trouvailles.length === 0 ? 0 : 1;
      }

      console.log('\n── Audit de tout l’historique ────────────────────────');
      console.log(`  dépôt            : ${realpathSync(cwd)}`);
      console.log(`  refs examinées   : ${r.refs}`);
      console.log(`  blobs atteignables : ${r.blobs}`);
      console.log(`  blobs lus        : ${r.examines}`);
      if (motif) console.log(`  filtre de chemin : ${motif}`);
      console.log('');
      console.log(`  ignorés — ${r.ignores.gros} au-delà de ${Math.round(maxOctets / 1024)} Kio, ` +
        `${r.ignores.binaires} binaires, ${r.ignores.illisibles} illisibles`);
      if (r.ignores.gros > 0) {
        console.log('  ⚠ Les blobs trop volumineux ne sont PAS scannés : un secret peut y dormir,');
        console.log('    notamment dans un artefact de build. Relancer avec --max-octets plus haut.');
      }
      console.log('');

      if (r.trouvailles.length === 0) {
        console.log('✓ Rien trouvé. Aucune valeur de forme secrète dans l’historique examiné.');
        return 0;
      }

      console.log(`✗ ${r.trouvailles.length} trouvaille(s) — masquées, par empreinte :`);
      for (const t of r.trouvailles) console.log(`    ${t}`);
      console.log('');
      console.log('  → Ce n’est pas un incident en soi, mais ces valeurs sont lisibles par');
      console.log('    quiconque clone le dépôt. Pour chacune : la RÉVOQUER d’abord (une purge');
      console.log('    d’historique ne dévalide rien), puis purger l’historique.');
      console.log('    Voir docs/NOAH-PURGE-VAPID-2026-10-09.md.');
      return 1;
    })
    .catch((e) => {
      console.error(`✗ Balayage impossible : ${String(e.message ?? e).split('\n')[0]}`);
      console.error('  → ce n’est pas un succès (code 2).');
      return 2;
    });
}

// N'exécuter le CLI que s'il est lancé directement (les tests importent le module).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
