#!/usr/bin/env node
// scripts/git-fat-report.mjs
// ═══════════════════════════════════════════════════════════════════
// Répond à une seule question : « qu'est-ce qui pèse dans l'historique
// Git, et est-ce que ça revient ? »
//
// Sans outil, on ne voit que « .git fait 477 Mo » et on ne sait pas quoi
// couper. Ici on classe les objets Git par catégorie de chemin, avec les
// octets RÉELLEMENT occupés sur disque (loose + pack), et on signale ceux
// qui sont encore atteignables depuis HEAD — donc encore déployables.
//
// Usage :  node scripts/git-fat-report.mjs
// Sortie : rapport lisible, exit 0 toujours (outil d'analyse, pas de CI).
// ═══════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const sh = (cmd, big = false) => {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: (big ? 512 : 64) * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return (e.stdout || '') + '';
  }
};

/** Classe un chemin de fichier dans une catégorie lisible. */
function categorize(path) {
  if (/(^|\/)target\//.test(path)) {
    // Le target/ de la RACINE est volontairement versionné (IDL + types).
    if (/^target\/(idl|types)\//.test(path)) return 'target/idl + target/types (VOLONTAIRE)';
    return 'artefacts de build **/target/ (à purger)';
  }
  if (path.includes('node_modules/')) return 'node_modules/';
  if (/(^|\/)dist\//.test(path) || /^dist\//.test(path)) return 'dist/';
  if (/\.(zip|bundle|tar|tgz|gz|7z)$/i.test(path)) return 'archives';
  if (/\.(png|jpe?g|gif|webp|mp4|mov|woff2?|ttf|otf|ico|pdf|wasm|so|rlib|dylib|o|bin)$/i.test(path)) {
    return 'binaires audiovisuels / bibliothèques';
  }
  return 'code et données';
}

const human = (b) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${(b / 1024).toFixed(0)} Ko`;

// ── 1. sha → chemin, pour tous les objets atteignables ────────────────
const objects = sh('git rev-list --objects --all', true).trim().split('\n');
const pathOfSha = new Map();
for (const line of objects) {
  const i = line.indexOf(' ');
  if (i > 0) pathOfSha.set(line.slice(0, i), line.slice(i + 1));
}

// ── 2. Octets sur disque par objet ────────────────────────────────────
// Les objets loose se mesurent directement ; le pack est agrégé via
// verify-pack. Après une réécriture d'historique, git laisse beaucoup
// d'objets loose — c'est là que le gras se cache.
const bytesOfSha = new Map();

for (const [sha] of pathOfSha) {
  const f = `.git/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
  if (existsSync(f)) bytesOfSha.set(sha, statSync(f).size);
}

let packBytes = 0;
for (const idx of sh('ls .git/objects/pack/*.idx').trim().split('\n').filter(Boolean)) {
  for (const line of sh(`git verify-pack -v "${idx}"`, true).split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length < 5) continue;
    const [sha, , , inPack] = p;
    const size = Number(inPack);
    if (!Number.isFinite(size)) continue;
    packBytes += size;
    if (!bytesOfSha.has(sha)) bytesOfSha.set(sha, size);
  }
}

// ── 3. Agrégation par catégorie ───────────────────────────────────────
const reachableFromHead = new Set(
  sh('git rev-list --objects HEAD').trim().split('\n').map((l) => l.split(' ')[0]),
);

const byCategory = new Map();
let total = 0;
let totalHead = 0;
for (const [sha, path] of pathOfSha) {
  const size = bytesOfSha.get(sha) || 0;
  const key = categorize(path);
  const entry = byCategory.get(key) || { size: 0, count: 0, head: 0 };
  entry.size += size;
  entry.count += 1;
  if (reachableFromHead.has(sha)) {
    entry.head += size;
    totalHead += size;
  }
  byCategory.set(key, entry);
  total += size;
}

const gitDir = sh('du -sh .git').trim().split(/\s+/)[0];

console.log('\n═══ Poids de l\'historique Git — BuildPact ═══');
console.log(`.git sur disque          : ${gitDir}`);
console.log(`Objets suivis (toutes réfs): ${human(total)} · dont atteignables depuis HEAD : ${human(totalHead)}`);
console.log(`Branches : ${sh('git for-each-ref --format="%(refname:short)" refs/heads').trim().split('\n').join(', ')}`);

console.log('\n── Par catégorie ──');
const rows = [...byCategory.entries()].sort((a, b) => b[1].size - a[1].size);
for (const [key, v] of rows) {
  const pct = total ? ((v.size / total) * 100).toFixed(1) : '0.0';
  console.log(`  ${key.padEnd(46)} ${human(v.size).padStart(10)}  ${pct.padStart(5)}%  (${v.count} objets)`);
}

console.log('\n── Les 10 plus gros objets ──');
const top = [...pathOfSha.entries()]
  .map(([sha, path]) => [bytesOfSha.get(sha) || 0, path])
  .sort((a, b) => b[0] - a[0])
  .slice(0, 10);
for (const [size, path] of top) console.log(`  ${human(size).padStart(9)}  ${path}`);

const purgeable = byCategory.get('artefacts de build **/target/ (à purger)');
if (purgeable && total) {
  const after = total - purgeable.size;
  console.log('\n── Verdict ──');
  console.log(`  Purger **/target/ retirerait ${human(purgeable.size)} (${((purgeable.size / total) * 100).toFixed(0)} % du dépôt).`);
  console.log(`  Estimation .git après purge : ~${human(after)} (avant recompression).`);
  console.log('  Script de purge : scripts/purge-target-from-history.sh');
  console.log('  Prévention      : .gitignore couvre déjà target/debug, target/release,');
  console.log('                    target/sbpf-solana-solana, programs/**/target/, target/deploy/.');
} else {
  console.log('\n✓ Rien de manifestement superflu dans l\'historique.');
}
console.log('');
