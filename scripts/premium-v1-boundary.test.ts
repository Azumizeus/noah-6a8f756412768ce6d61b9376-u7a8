// scripts/premium-v1-boundary.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou : une page premium ne renvoie pas l'utilisateur vers /v1.
//
// Contexte : /v1 est l'ancien habillage, conservé comme porte de débogage le
// temps de migrer ses fonctions vers le premium. Le risque n'est pas sa
// coexistence, c'est la DÉRIVE : une page premium qui délègue discrètement une
// fonction au legacy rend cette fonction non-migrable (on ne peut plus retirer
// /v1 sans la casser), et personne ne le voit — ça ressemble à un lien.
//
// Le chantier de migration suit une règle simple : on migre la fonction, puis
// on retire le lien. Ce test est ce qui empêche un lien de réapparaître après
// coup en passant pour un ornement.
//
// ── La liste blanche est VIDE, et c'est le but ───────────────────────
// Elle a longtemps contenu une entrée : `PremiumProfil` renvoyait vers
// `#/v1/profile` pour deux fonctions qui n'existaient que là — l'avatar par
// FICHIER et l'export PDF. Tant que cette entrée existait, /v1 n'était pas
// retirable : le retirer aurait retiré ces deux fonctions.
//
// Les deux ont été migrées (upload signé via `uploadProfileAvatar`, export
// via `window.print()` et PRINT_STYLE), la gamification et le panneau wallet
// aussi — /v1 n'a donc plus aucun appelant premium. La table reste, vide :
// c'est elle qui oblige à justifier un lien si quelqu'un en réintroduit un,
// et le test « la liste blanche ne cite pas de page disparue » la tient à
// jour. Une entrée réintroduite ici ne serait plus une exception taiseuse,
// elle serait une décision écrite.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DOSSIER = new URL('../src/pages/premium/', import.meta.url);

/** Liens vers /v1 assumés, page par page. `raison` sert au message d'échec
 *  quand l'entrée devient caduque. */
const LIENS_ASSUMES: Record<string, { cible: string; raison: string }> = {};

/** Source sans commentaires : l'en-tête de plusieurs pages cite `/v1` pour
 *  EXPLIQUER la migration ; un scan naïf y lirait une dépendance. */
const stripComments = (src: string): string =>
  src
    .replace(/^[ \t]*\{\s*\/\*[\s\S]*?\*\/\s*\}[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .split('\n')
    .filter((line) => !/^[ \t]*(\/\/|\*)/.test(line))
    .join('\n');

/** Cibles `#/v1…` réellement écrites dans le source (hors commentaires).
 *  Fonction pure : testable sur une entrée fabriquée. */
export function liensV1(src: string): string[] {
  const code = stripComments(src);
  return [...new Set([...code.matchAll(/['"`](#\/v1[A-Za-z0-9/_-]*)['"`]/g)].map((m) => m[1]))];
}

const lire = (nom: string): string => readFileSync(new URL(nom, DOSSIER), 'utf8');

const pagesPremium = (): string[] =>
  readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.tsx'))
    .sort();

// ─── 1. Le détecteur fonctionne (entrées fabriquées) ─────────────────

test('détecte un lien vers /v1, ignore une simple mention en commentaire', () => {
  assert.deepEqual(liensV1('<a href="#/v1/treasury">Historique</a>'), ['#/v1/treasury']);
  assert.deepEqual(
    liensV1('// la page historique reste sous /v1/treasury\nconst x = 1;'),
    [],
    'une mention en commentaire ne doit pas être prise pour un lien'
  );
  assert.deepEqual(
    liensV1("const p = '#/v1/profile';"),
    ['#/v1/profile'],
    'un lien construit dans une constante doit être vu'
  );
});

// ─── 2. Le dossier premium ne délègue pas au legacy ──────────────────

test('aucune page premium ne renvoie vers /v1 hors liens déclarés', () => {
  const pages = pagesPremium();
  assert.ok(pages.length >= 10, `balayage suspect : ${pages.length} page(s)`);

  const coupables: string[] = [];
  for (const page of pages) {
    const autorise = LIENS_ASSUMES[page]?.cible;
    for (const cible of liensV1(lire(page))) {
      if (cible !== autorise) coupables.push(`${page} → ${cible}`);
    }
  }

  assert.deepEqual(
    coupables,
    [],
    `page(s) premium déléguant une fonction au legacy : ${coupables.join(', ')} — ` +
      'migrer la fonction dans le premium plutôt que de renvoyer vers /v1 ' +
      '(ou déclarer le lien dans LIENS_ASSUMES avec sa raison)'
  );
});

/**
 * Les fonctions du legacy doivent avoir été MIGRÉES, pas seulement
 * débranchées. Le portail /v1 ne servait plus qu'à deux choses ; si l'une
 * d'elles disparaissait du profil premium sans être remplacée, ce test le
 * dirait au lieu de laisser un utilisateur découvrir qu'il ne peut plus
 * changer sa photo.
 */
test('le profil premium reprend les fonctions qui dépendaient du portail /v1', () => {
  const src = lire('PremiumProfil.tsx');
  assert.match(src, /uploadProfileAvatar/, 'l’avatar par fichier ne vit plus ici : plus aucun écran ne le propose');
  assert.match(src, /window\.print\(\)/, 'l’export PDF a disparu avec le portail /v1');
  // Sur le code SANS commentaires : l'en-tête de la page cite le portail
  // `/v1/profile` pour raconter pourquoi il a disparu, et un scan naïf y
  // lirait un lien réintroduit. Même détourage que le balayage ci-dessus.
  assert.doesNotMatch(stripComments(src), /#\/v1\/profile/, 'le portail /v1 est revenu dans le profil');
  // `legacyPortal` ne doit plus exister d'aucun côté : une clé orpheline dans
  // les deux dictionnaires est exactement l'ombre que laisse un lien retiré.
  for (const file of ['fr.ts', 'en.ts']) {
    const dict = readFileSync(new URL(`../src/lib/i18n/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(dict, /legacyPortal/, `${file} : clé legacyPortal orpheline`);
  }
});

test('aucune page premium ne renvoie vers /v1, liste blanche comprise', () => {
  // Redondant avec le balayage ci-dessus quand la liste est vide — mais pas
  // le jour où elle ne l'est plus : ce test-là échouera, forçant à écrire
  // pourquoi un lien revient. C'est la différence entre une exception
  // déclarée et une exception oubliée.
  assert.deepEqual(
    Object.keys(LIENS_ASSUMES),
    [],
    'une page premium dépend de nouveau de /v1 : migrer la fonction, ou documenter ici pourquoi elle ne peut pas l’être'
  );
});

test('la liste blanche ne cite pas de page disparue', () => {
  const pages = new Set(pagesPremium());
  const fantomes = Object.keys(LIENS_ASSUMES).filter((f) => !pages.has(f));
  assert.deepEqual(fantomes, [], `LIENS_ASSUMES cite une page qui n’existe plus : ${fantomes.join(', ')}`);
});
