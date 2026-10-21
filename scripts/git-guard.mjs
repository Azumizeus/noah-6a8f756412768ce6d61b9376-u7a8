#!/usr/bin/env node
// scripts/git-guard.mjs
// ═══════════════════════════════════════════════════════════════════
// GARDE-FOU anti-incident — écrit après la panne du 07/10/2026.
//
// Cette panne avait deux causes, toutes deux évitables par une machine :
//
//   1. Un push massif hors protocole. Le projet impose des « lots de
//      5 fichiers max » (CERVEAU PROJET, l.34). La règle existait, mais
//      rien ne l'appliquait — donc rien ne l'a arrêtée.
//
//   2. Une réécriture d'historique poussée sans prévenir les clones.
//      Le retrait de la clé privée a changé TOUS les SHA ; la copie de
//      Noah, restée sur l'ancien historique, s'est retrouvée « 193
//      commits à pousser / 198 à récupérer » alors qu'elle ne contenait
//      rien d'unique. Un merge dans cet état produit des centaines de
//      conflits et peut abîmer `main`.
//
// Usage :
//   node scripts/git-guard.mjs --range origin/main..HEAD   → évalue un envoi
//   node scripts/git-guard.mjs --rewrite                   → contrôle AVANT réécriture
//   node scripts/git-guard.mjs --install                   → pose le hook pre-push
//   node scripts/git-guard.mjs --hook                      → appelé par le hook
//
// Contournement volontaire, explicite et tracé dans le message de commit :
//   ALLOW_MASS_PUSH=1        pour un envoi légitime au-delà d'un lot
//   ALLOW_HISTORY_REWRITE=1  pour une réécriture d'historique assumée
// ═══════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { chmodSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

/** Taille maximale d'un lot, telle que documentée dans CERVEAU PROJET (l.34). */
export const LOT_MAX = 5;

/**
 * Décide si un envoi respecte le protocole. Fonction pure : testable sans git.
 * @param {string[]} files fichiers touchés par l'envoi
 * @param {{limit?: number, allowMass?: boolean}} [options]
 */
export function evaluatePush(files, options = {}) {
  const limit = options.limit ?? LOT_MAX;
  const allowMass = options.allowMass ?? false;
  const unique = [...new Set((files || []).filter((f) => typeof f === 'string' && f.length > 0))];
  if (allowMass) {
    return { ok: true, bypassed: true, count: unique.length, limit, files: unique };
  }
  if (unique.length > limit) {
    return { ok: false, bypassed: false, count: unique.length, limit, files: unique };
  }
  return { ok: true, bypassed: false, count: unique.length, limit, files: unique };
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const gitSafe = (args) => {
  try {
    return git(args);
  } catch {
    return '';
  }
};
const ZERO = '0000000000000000000000000000000000000000';

/**
 * Sortie BRUTE de `git diff --name-only <plage>`, ou `null` si la plage est
 * incalculable (ref inconnue, objet absent, clone partiel).
 * La distinction est essentielle : confondre « incalculable » avec « aucun
 * fichier » laisserait passer un envoi massif. Ce garde-fou échoue FERMÉ.
 */
function filesInRange(range) {
  try {
    return git(['diff', '--name-only', range]);
  } catch {
    return null;
  }
}

/**
 * Décision à partir de la sortie brute de git. Fonction pure : testable.
 * `out === null` → verdict `indeterminate` (refusé, sauf contournement explicite).
 * @param {string|null} out
 * @param {{limit?: number, allowMass?: boolean}} [options]
 */
export function evaluateRangeOutput(out, options = {}) {
  const limit = options.limit ?? LOT_MAX;
  if (out === null || out === undefined) {
    const bypassed = options.allowMass ?? false;
    return { ok: bypassed, bypassed, indeterminate: true, count: 0, limit, files: [] };
  }
  const list = out.length > 0 ? out.split('\n').filter((l) => l.trim().length > 0) : [];
  return { ...evaluatePush(list, options), indeterminate: false };
}

function report(verdict) {
  if (verdict.indeterminate && verdict.bypassed) {
    console.log('⚠ Contourné volontairement (ALLOW_MASS_PUSH=1), mais la plage était');
    console.log('  incalculable : vérifie à la main ce que tu envoies.');
    return 0;
  }
  if (verdict.indeterminate) {
    console.error('✗ ENVOI BLOQUÉ : la plage de commits est incalculable.');
    console.error('');
    console.error('  Le garde-fou refuse d\'autoriser ce qu\'il ne peut pas mesurer');
    console.error('  (ref inconnue, objet absent, clone partiel) : il échoue FERMÉ.');
    console.error('');
    console.error('  Remède :   git fetch origin    puis relance le push.');
    console.error('  Si c\'est volontaire :');
    console.error('    ALLOW_MASS_PUSH=1 git push …');
    return 1;
  }
  if (verdict.ok && verdict.bypassed) {
    console.log(`✓ Garde-fou contourné volontairement (ALLOW_MASS_PUSH=1) : ${verdict.count} fichier(s).`);
    return 0;
  }
  if (verdict.ok) {
    console.log(`✓ Lot conforme : ${verdict.count} fichier(s) sur ${verdict.limit} autorisés.`);
    return 0;
  }
  console.error(`✗ ENVOI BLOQUÉ : ${verdict.count} fichiers, la limite est de ${verdict.limit}.`);
  console.error('');
  console.error('  Protocole du projet (CERVEAU PROJET, l.34) : découper en lots de');
  console.error(`  ${verdict.limit} fichiers max, et vérifier CHAQUE lot sur GitHub (commit visible`);
  console.error('  sur main, hash noté) avant d\'entamer le lot suivant.');
  console.error('');
  const sample = verdict.files.slice(0, 12);
  for (const f of sample) console.error(`    - ${f}`);
  if (verdict.files.length > sample.length) {
    console.error(`    … et ${verdict.files.length - sample.length} autre(s)`);
  }
  console.error('');
  console.error('  Si cet envoi est volontaire et légitime :');
  console.error('    ALLOW_MASS_PUSH=1 git push …');
  return 1;
}

function runRange(range) {
  const allowMass = process.env.ALLOW_MASS_PUSH === '1';
  return report(evaluateRangeOutput(filesInRange(range), { allowMass }));
}

function runHook() {
  const allowMass = process.env.ALLOW_MASS_PUSH === '1';
  const stdin = readFileSync(0, 'utf8');
  const lines = stdin.split('\n').filter((l) => l.trim().length > 0);
  let failed = 0;
  for (const line of lines) {
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || !remoteSha) {
      console.error('✗ ENVOI BLOQUÉ : ligne de hook illisible.');
      console.error(`  ${line}`);
      failed += 1;
      continue;
    }
    if (localSha === ZERO) continue; // suppression de branche : rien à envoyer
    let range = null;
    if (remoteSha === ZERO) {
      const base = gitSafe(['merge-base', localSha, 'origin/main']);
      range = base ? `${base}..${localSha}` : null;
    } else {
      range = `${remoteSha}..${localSha}`;
    }
    if (!range) {
      console.error('✗ ENVOI BLOQUÉ : base commune introuvable (branche hors origin/main).');
      console.error('  git fetch origin, puis relance le push.');
      failed += 1;
      continue;
    }
    if (report(evaluateRangeOutput(filesInRange(range), { allowMass })) !== 0) failed += 1;
  }
  return failed > 0 ? 1 : 0;
}

function runRewriteCheck() {
  const allow = process.env.ALLOW_HISTORY_REWRITE === '1';
  const branch = gitSafe(['branch', '--show-current']) || '(inconnue)';
  const head = gitSafe(['rev-parse', '--short=7', 'HEAD']);
  const dirty = gitSafe(['status', '--porcelain', '--untracked-files=no']);

  console.log('══ Contrôle AVANT réécriture d\'historique ══');
  console.log(`  branche          : ${branch}`);
  console.log(`  HEAD             : ${head}`);
  console.log(`  arbre suivi      : ${dirty.length === 0 ? 'propre' : 'SALE — commite ou stash d\'abord'}`);

  if (dirty.length > 0) {
    console.error('\n✗ Réécriture refusée : git-filter-repo ne réécrit pas un arbre sale.');
    return 1;
  }

  console.log('');
  console.log('  ⚠ Une réécriture change TOUS les SHA. DEUX CAS À NE PAS CONFONDRE :');
  console.log('    1. tout clone existant (app Noah, autres machines) ne peut plus');
  console.log('       faire de fast-forward : il verra des centaines de commits dans');
  console.log('       les deux sens, et un merge produirait des conflits en masse ;');
  console.log('    2. après une réécriture ACCIDENTELLE, on débloque un clone en');
  console.log('       re-rattachant l\'ancien sommet au nouveau par un merge `-s ours`');
  console.log('       (arbre identique à l\'octet) — c\'est ce qui a débloqué Noah le');
  console.log('       07/10.');
  console.log('       ⚠ CE GESTE EST INTERDIT APRÈS UNE PURGE DE SECRET. Rattacher');
  console.log('       rend de nouveau ATTEIGNABLES les commits qu\'on vient de nettoyer :');
  console.log('       la purge est alors annulée, et le secret reste clonable. Le dépôt');
  console.log('       en porte la trace — 2953751 (« rattache l\'ancien historique (avant');
  console.log('       retrait de la cle) ») a exactement remis en jeu les commits qui');
  console.log('       portent la clé VAPID. Après une purge, un clone en retard se remet');
  console.log('       à niveau par un CLONE NEUF, jamais par un rattachement :');
  console.log('       voir docs/NOAH-PURGE-VAPID-2026-10-09.md § 4 et § 5.');
  console.log('    3. l\'ORDRE est non négociable :');
  console.log('         purge → (cas accidentel seulement : re-rattachement) → synchro.');
  console.log('       Faire la purge APRÈS la synchro reproduit exactement la panne.');

  if (!allow) {
    console.error('\n✗ Réécriture refusée sans accord explicite. Si tu assumes :');
    console.error('    ALLOW_HISTORY_REWRITE=1 bash scripts/purge-…-from-history.sh');
    return 1;
  }
  console.log('\n✓ Réécriture autorisée explicitement (ALLOW_HISTORY_REWRITE=1).');
  return 0;
}

function installHook() {
  // 21/10 (audit supply-chain, SC-04) : le hook existait mais n'était pas
  // installé — un envoi de masse passait. Et il n'était pas VERSIONNÉ : un
  // clone ne l'avait donc jamais. On pose désormais `core.hooksPath` vers un
  // dossier versionné (.githooks/) : le hook voyage avec le dépôt, et il
  // reste lisible par un juge.
  const versioned = '.githooks/pre-push';
  const root = git(['rev-parse', '--show-toplevel']);
  const versionedPath = root ? `${root}/${versioned}` : versioned;
  if (existsSync(versionedPath)) {
    git(['config', 'core.hooksPath', '.githooks']);
    chmodSync(versionedPath, 0o755);
    console.log(`✓ Hook posé : ${versionedPath} (core.hooksPath=.githooks)`);
  } else {
    // Repli : dépôt sans le hook versionné (branche ancienne) — on écrit
    // alors le hook dans .git/hooks comme avant.
    const hookPath = git(['rev-parse', '--git-path', 'hooks/pre-push']);
    const script = '#!/usr/bin/env bash\n' +
      '# Posé par scripts/git-guard.mjs --install (anti-incident du 07/10/2026).\n' +
      'exec node "$(git rev-parse --show-toplevel)/scripts/git-guard.mjs" --hook\n';
    writeFileSync(hookPath, script, 'utf8');
    chmodSync(hookPath, 0o755);
    console.log(`✓ Hook posé : ${hookPath}`);
  }
  console.log('  Tout push de plus de ' + LOT_MAX + ' fichiers sera refusé.');
  console.log('  Contournement volontaire : ALLOW_MASS_PUSH=1 git push …');
  return 0;
}

function main() {
  const arg = process.argv[2];
  if (arg === '--install') return installHook();
  if (arg === '--rewrite') return runRewriteCheck();
  if (arg === '--hook') return runHook();
  if (arg === '--range') {
    const range = process.argv[3];
    if (!range) {
      console.error('usage : node scripts/git-guard.mjs --range origin/main..HEAD');
      return 2;
    }
    return runRange(range);
  }
  console.error('usage : --range <plage> | --rewrite | --hook | --install');
  return 2;
}

const entry = process.argv[1] ?? '';
const isDirectRun = entry.endsWith('git-guard.mjs');
if (isDirectRun && existsSync(entry)) {
  process.exit(main());
}
