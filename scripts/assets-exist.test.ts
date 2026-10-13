// scripts/assets-exist.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou : toute référence à un fichier local doit exister dans public/.
//
// Contexte (bug constaté dans la console du navigateur le 08/10) : le
// sélecteur de décor de fond proposait trois variantes « HD » pointant sur
// `/backgrounds/{nebula,grid,aurora}-hd.jpg`. Ces trois fichiers n'ont JAMAIS
// été committés — la console affichait donc trois « Failed to load resource:
// 404 » à chaque ouverture des réglages, et les vignettes restaient vides.
//
// Un 404 ne casse pas le build, ne casse pas les tests, et n'apparaît qu'en
// ouvrant la page concernée : c'est exactement le genre de défaut qu'aucun
// écran de contrôle ne montre. Ce test le transforme en échec explicite.
//
// Portée honnête : il vérifie les chaînes littérales d'extension de média
// (`'/x/y.png'`) trouvées dans src/. Il ne voit PAS un chemin construit
// dynamiquement (`url('/bg/' + name)`), ni un fichier servi par un autre hôte.
// Les chemins dynamiques sont donc écrits pour être repérables à l'œil
// (`${...}`), et le test signale les fichiers qui n'en contiennent aucun.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const srcDir = new URL('../src/', import.meta.url);
const publicDir = new URL('../public/', import.meta.url);

function sourceFiles(dir: URL): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    if (entry.isDirectory()) out.push(...sourceFiles(child));
    // Le CSS compte : c'est là que vivent les `url('/x.png')` d'arrière-plan
    // et les @font-face. Le bug d'origine, lui, venait du TSX.
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(child.pathname);
  }
  return out;
}

/** Références littérales à un média local. Le `/` initial est obligatoire
 *  (une URL absolue ou un chemin relatif n'est pas un asset de public/), et
 *  l'extension est limitée aux médias — sinon on ramasserait les imports de
 *  modules (`./lib/x.ts`) ou les routes (`/create`).
 *
 *  Le motif accepte le guillemet simple, double et l'accent grave des chaînes
 *  TS, ainsi que `url(...)` sans guillemets du CSS. */
const ASSET = /(?:['"`]|url\(\s*['"]?)(\/[A-Za-z0-9._/-]+\.(?:png|jpg|jpeg|svg|webp|gif|ico|mp3|wav|woff2|woff|ttf))['"`)]?/g;

test('chaque fichier local référencé existe dans public/', () => {
  const files = sourceFiles(srcDir);
  assert.ok(files.length > 50, `balayage suspect : ${files.length} fichier(s) source`);

  const references: Array<{ file: string; asset: string }> = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(ASSET)) references.push({ file, asset: m[1] });
  }

  assert.ok(references.length > 0, 'aucune référence de média trouvée : le motif ne matche plus rien');

  const manquants = references
    .filter(({ asset }) => !existsSync(new URL(`.${asset}`, publicDir)))
    .map(({ file, asset }) => `${asset}  ← ${file.replace(/.*\/src\//, 'src/')}`);

  assert.deepEqual(
    manquants,
    [],
    `référence(s) vers un fichier absent de public/ (404 en console) :\n  ${manquants.join('\n  ')}`
  );
});

test('public/ ne contient pas de dossier de médias vide', () => {
  // Un dossier déclaré mais vide signale une référence orpheline (ou une
  // suppression à moitié faite) — c'est le cas qui a produit le bug des fonds.
  const vides: string[] = [];
  for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = new URL(`${entry.name}/`, publicDir);
    const contenu = readdirSync(dir);
    if (contenu.length === 0) vides.push(entry.name);
  }
  assert.deepEqual(vides, [], `dossier(s) de public/ vide(s) : ${vides.join(', ')}`);
});

test('les fichiers de public/ ne sont pas énormes sans raison', () => {
  // Rappel : ce dépôt a déjà eu une panne de push à cause d'un fichier lourd.
  // 8 Mio est la limite au-delà de laquelle on préfère un CDN ou une version
  // compressée.
  const LIMITE = 8 * 1024 * 1024;
  const lourds: string[] = [];
  const parcourir = (dir: URL, prefixe = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const chemin = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
      if (entry.isDirectory()) parcourir(chemin, `${prefixe}${entry.name}/`);
      else if (statSync(chemin).size > LIMITE) lourds.push(`${prefixe}${entry.name}`);
    }
  };
  parcourir(publicDir);
  assert.deepEqual(lourds, [], `fichier(s) de plus de 8 Mio dans public/ : ${lourds.join(', ')}`);
});
