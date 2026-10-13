// scripts/premium-card.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de non-divergence des cartes projet premium.
//
// Contexte : l'onglet Pacts affichait ses cartes SANS bannière pendant que
// Dashboard et Marketplace l'affichaient — le bloc média était recopié dans
// les trois pages et avait divergé (fix du 08/10). Deux niveaux de défense
// ici :
//
//   1. le comportement pur de la bannière (image ou lettre de repli, hauteur,
//      dégradé, logo) est testé avec du média SIMULÉ — c'est la logique que
//      Pacts avait perdue ;
//   2. les trois pages doivent passer par le composant PARTAGÉ
//      PremiumProjectCard, et aucune ne doit recoder le bloc bannière à la
//      main — c'est ce qui empêche la divergence de revenir.
//
// Le point 2 lit le source des pages (pas de DOM ici : le projet teste des
// modules purs avec `node --test`, voir profile-form.test.ts). Un rendu React
// réel demanderait jsdom + testing-library, volontairement hors périmètre.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  resolveBanner,
  bannerHeight,
  bannerFallbackGradient,
  bannerFallbackInk,
  bannerImageStyle,
  resolveLogo,
} from '../src/pages/premium/projectCardMedia.ts';

// ─── 1. Comportement du bloc média, avec du média simulé ────────────────

test('bannière : une URL de projet est rendue telle quelle', () => {
  const r = resolveBanner('https://exemple.test/project-media/abc/banner.png', 'Mon Projet');
  assert.equal(r.imageUrl, 'https://exemple.test/project-media/abc/banner.png');
});

test('bannière : sans média, on retombe sur la première lettre du titre (majuscule)', () => {
  assert.deepEqual(resolveBanner(null, 'seed vault'), {
    imageUrl: null,
    fallbackLetter: 'S',
  });
  assert.equal(resolveBanner(undefined, '  nexus  ').fallbackLetter, 'N');
});

test('bannière : une URL vide ou blanche ne compte pas comme une image', () => {
  assert.equal(resolveBanner('', 'BuildPact').imageUrl, null);
  assert.equal(resolveBanner('   ', 'BuildPact').imageUrl, null);
});

test('bannière : un titre vide ne casse pas la lettre de repli', () => {
  assert.equal(resolveBanner(null, '').fallbackLetter, '?');
});

test('bannière : la hauteur suit la densité de vue (grande 96, petite 64)', () => {
  assert.equal(bannerHeight('large'), 96);
  assert.equal(bannerHeight('small'), 64);
});

test('bannière : le dégradé de repli dépend du statut (accent ouvert, succès finalisé)', () => {
  assert.match(bannerFallbackGradient(true), /--p-accent/);
  assert.match(bannerFallbackGradient(false), /--p-ok/);
  assert.notEqual(bannerFallbackGradient(true), bannerFallbackGradient(false));
});

// Chantier 4 : le repli était écrit en dur (`#10081c…#3E2496`) et ignorait
// donc les 4 palettes ET le mode sombre. Le contrôle porte sur la CAUSE —
// aucune couleur littérale, uniquement des tokens du shell premium.
test('bannière : le dégradé de repli ne contient aucune couleur en dur', () => {
  for (const isOpen of [true, false]) {
    const g = bannerFallbackGradient(isOpen);
    assert.doesNotMatch(g, /#[0-9a-fA-F]{3,8}/, `couleur littérale dans le dégradé : ${g}`);
    const tokens = [...g.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    assert.ok(tokens.length >= 3, `dégradé sans token de thème : ${g}`);
    assert.deepEqual(
      tokens.filter((tk) => !tk.startsWith('--p-')),
      [],
      `token hors charte premium dans le dégradé : ${tokens.join(', ')}`
    );
  }
});

test('bannière : la lettre de repli prend l’encre du statut, pas un blanc fixe', () => {
  assert.equal(bannerFallbackInk(true), 'var(--p-accent)');
  assert.equal(bannerFallbackInk(false), 'var(--p-ok)');
  assert.doesNotMatch(bannerFallbackInk(true), /rgba?\(|#/, 'encre en dur : illisible sur les palettes claires');
});

// Bug du 08/10 : une bannière CARRÉE (1024×1024) débordait de sa boîte de
// 96 px et recouvrait le titre, la description et les chiffres de la carte.
// Cause : l'image participait à la grille et sa hauteur en pourcentage était
// résolue contre la piste — elle-même calculée d'après le contenu. L'image
// doit donc être HORS FLUX.
test('bannière : l’image ne peut pas dicter la hauteur du bandeau', () => {
  const style = bannerImageStyle();
  assert.equal(style.position, 'absolute', 'une image dans le flux déborde une bannière carrée');
  assert.equal(style.inset, 0, 'l’image doit être ancrée sur les 4 bords du bandeau');
  assert.equal(style.objectFit, 'cover');
});

test('le composant borne le bandeau et sort l’image du flux', () => {
  const src = readPremium('PremiumProjectCard.tsx');
  assert.match(src, /overflow: 'hidden'/, 'sans découpe, une image haute déborde sur le corps de la carte');
  assert.match(src, /bannerImageStyle\(\)/, 'le style de l’image doit venir du module testé');
  assert.match(src, /bannerFallbackInk\(isOpen\)/, 'l’encre du repli doit suivre le statut et le thème');
});

test('logo : rendu seulement pour une URL exploitable', () => {
  assert.equal(resolveLogo('https://exemple.test/logo.png'), 'https://exemple.test/logo.png');
  assert.equal(resolveLogo(null), null);
  assert.equal(resolveLogo(''), null);
});

// ─── 2. Non-divergence : les pages passent par la carte partagée ────────

const PREMIUM_PAGES = [
  'PremiumDashboard.tsx',
  'PremiumMarketplace.tsx',
  'PremiumPacts.tsx',
] as const;

const readPremium = (name: string): string =>
  readFileSync(new URL(`../src/pages/premium/${name}`, import.meta.url), 'utf8');

test('le composant partagé rend bien la bannière ET le logo résolus', () => {
  const src = readPremium('PremiumProjectCard.tsx');
  assert.match(src, /resolveBanner/, 'doit déléguer à resolveBanner (un seul endroit décide)');
  assert.match(src, /banner\.imageUrl/, 'doit rendre l’image de bannière');
  assert.match(src, /banner\.fallbackLetter/, 'doit rendre la lettre de repli');
  assert.match(src, /resolveLogo/, 'doit gérer le logo');
});

// Chantier 4 : le dégradé de repli était écrit en dur dans TROIS endroits
// (la carte partagée, la fiche pact, le bandeau de profil) et avait déjà
// divergé une fois. Ce contrôle balaie TOUTES les pages premium — pas
// seulement celles listées ci-dessus — pour qu'une quatrième copie ne
// repasse pas inaperçue.
test('aucune page premium ne peint un dégradé de bannière en dur', () => {
  const pages = readdirSync(new URL('../src/pages/premium/', import.meta.url)).filter((f) => f.endsWith('.tsx'));
  assert.ok(pages.length >= 10, `balayage suspect : ${pages.length} page(s)`);
  const coupables = pages.filter((f) => /10081c|0d2b23|14533a|3E2496/i.test(readPremium(f)));
  assert.deepEqual(
    coupables,
    [],
    `dégradé de bannière recopié (hex de l’ancien thème sombre) : ${coupables.join(', ')} — passer par bannerFallbackGradient()`
  );
});

// Le bandeau du profil et celui de la fiche pact ne sont pas des cartes : ils
// ne peuvent pas passer par PremiumProjectCard. Ils doivent au moins réutiliser
// les décisions du module partagé au lieu de les réécrire.
test('fiche pact et profil réutilisent les résolveurs du module partagé', () => {
  for (const page of ['PremiumPact.tsx', 'PremiumProfil.tsx']) {
    const src = readPremium(page);
    assert.match(src, /from '\.\/projectCardMedia'/, `${page} : import du module de média manquant`);
    assert.match(src, /bannerImageStyle\(\)/, `${page} : le style de l’image doit venir du module`);
    assert.match(src, /overflow: 'hidden'/, `${page} : sans découpe, une bannière carrée recouvre le contenu`);
  }
});

for (const page of PREMIUM_PAGES) {
  test(`${page} utilise la carte partagée PremiumProjectCard`, () => {
    const src = readPremium(page);
    assert.match(src, /import PremiumProjectCard from '\.\/PremiumProjectCard'/, 'import manquant');
    assert.match(src, /<PremiumProjectCard/, 'la vue cartes doit passer par le composant partagé');
    assert.match(src, /bannerUrl=/, 'la bannière doit être transmise au composant');
  });

  test(`${page} ne recode pas le bloc bannière à la main`, () => {
    const src = readPremium(page);
    assert.doesNotMatch(
      src,
      /linear-gradient\(120deg,#10081c/,
      'bloc bannière maison détecté : passer par PremiumProjectCard pour éviter la divergence'
    );
    // Le choix du dégradé reste dans le module partagé : une page qui
    // l'appellerait elle-même se remettrait à peindre sa propre bannière.
    assert.doesNotMatch(
      src,
      /bannerFallbackGradient\(/,
      'la page ne doit pas peindre le repli elle-même — PremiumProjectCard s’en charge'
    );
  });
}
