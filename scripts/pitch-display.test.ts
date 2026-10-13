// scripts/pitch-display.test.ts
// ═══════════════════════════════════════════════════════════════════
// Le champ `description` on-chain n'est pas une description : c'est un
// conteneur (voir lib/pitch.ts). Il porte, dans cet ordre :
//
//   "[<étape>] <pitch libre> | Rôles créateur : <rôles> | 💰 Seed founder : <n> SOL"
//
// Le programme on-chain n'a pas de champ structuré, d'où l'encodage — mais
// il ne doit JAMAIS atteindre l'écran. Constaté le 10/10/2026 sur les pacts
// de démonstration : la carte affichait « [🤝 Les deux] » parce que toutes
// les surfaces faisaient `parsed.pitch || pact.description`, un repli sur la
// chaîne brute dès que le pitch libre est vide.
//
// Deux niveaux de défense ici, comme premium-card.test.ts :
//   1. le comportement pur de displayPitch / displayPitchShort (la logique
//      que les six surfaces appellent désormais) ;
//   2. un garde-fou de source : le repli brut ne doit pas revenir, et chaque
//      surface doit passer par le parseur. C'est le bug qui se réintroduit
//      le plus facilement — il suffit de recopier une carte.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Import du module PUR, pas de `lib/pitch.ts` : ce dernier tire l'i18n
// (`./i18n/translations`, sans extension) que le resolver ESM de node ne
// sait pas suivre — c'est justement pourquoi le parseur a été isolé.
import { displayPitch, displayPitchShort, parsePitch, STAGE_CANONICAL } from '../src/lib/pitchParse.ts';

// Une description telle que CreatePactWizard.tsx l'écrit (ligne ~424).
const ENCODEE =
  `[${STAGE_CANONICAL.both}] Jeu mobile space shooter | Rôles créateur : 👑 Founder | 💰 Seed founder : 2 SOL`;

// ─── 1. Le pitch libre, et rien d'autre ────────────────────────────────

test('displayPitch rend le pitch libre, sans clé d\'étape ni marqueurs', () => {
  assert.equal(displayPitch(ENCODEE), 'Jeu mobile space shooter');
});

test('displayPitch : la clé d\'étape seule ne s\'affiche jamais (le cas vu en démo)', () => {
  for (const cle of Object.values(STAGE_CANONICAL)) {
    const rendu = displayPitch(`[${cle}]`);
    assert.equal(rendu, '');
    assert.ok(!rendu.includes('['), `« ${rendu} » ne doit pas montrer la clé d'étape`);
    assert.ok(!rendu.includes(cle), 'la clé canonique ne doit pas fuiter');
  }
});

test('displayPitch : clé d\'étape + marqueurs, sans pitch libre → chaîne vide', () => {
  assert.equal(displayPitch('[🤝 Les deux] | Rôles créateur : 👑 Founder'), '');
});

test('displayPitch : une description héritée, sans encodage, passe telle quelle', () => {
  assert.equal(displayPitch('Un pitch écrit avant le wizard actuel.'), 'Un pitch écrit avant le wizard actuel.');
  // Marqueur interne sans clé d'étape : le texte avant le marqueur reste du
  // texte libre, on ne le jette pas.
  assert.equal(displayPitch('Pitch libre | Rôles créateur : 👑 Founder'), 'Pitch libre');
});

test('displayPitch : une valeur absente ne fait pas planter l\'affichage', () => {
  assert.equal(displayPitch(''), '');
  assert.equal(displayPitch(null), '');
  assert.equal(displayPitch(undefined), '');
});

test('displayPitch ne rend jamais la chaîne encodée telle quelle', () => {
  assert.notEqual(displayPitch(ENCODEE), ENCODEE);
  assert.ok(!displayPitch(ENCODEE).includes('Rôles créateur'));
});

// ─── 2. Le cas raccourci, utilisé par les cartes ───────────────────────

test('displayPitchShort tronque avec une ellipse, jamais au-delà de la borne', () => {
  const long = 'a'.repeat(200);
  const court = displayPitchShort(`[🤝 Les deux] ${long}`, 130);
  assert.equal(court.length, 131); // 130 caractères + l'ellipse
  assert.ok(court.endsWith('…'));

  const sousBorne = displayPitchShort(`[🤝 Les deux] court`, 130);
  assert.equal(sousBorne, 'court');
  assert.ok(!sousBorne.endsWith('…'));
});

test('displayPitchShort : la borne s\'applique au pitch, pas à la chaîne encodée', () => {
  // 130 caractères de pitch : au bord, rien n'est coupé. Avec l'ancien
  // découpage sur la chaîne brute, la clé d'étape aurait mangé 13 caractères
  // du texte réel avant la troncature.
  const pile = 'b'.repeat(130);
  assert.equal(displayPitchShort(`[🤝 Les deux] ${pile}`, 130), pile);
});

// ─── 3. Garde-fou de source : le repli brut ne doit pas revenir ────────

const SURFACES = [
  'src/components/MarketplaceCard.tsx',
  'src/components/PactCard.tsx',
  'src/pages/premium/PremiumPact.tsx',
  'src/pages/premium/PremiumDashboard.tsx',
  'src/pages/premium/PremiumMarketplace.tsx',
  'src/pages/premium/PremiumPacts.tsx',
];

for (const chemin of SURFACES) {
  test(`${chemin} : passe par le parseur de pitch, jamais par la chaîne brute`, () => {
    const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
    assert.ok(
      /displayPitch|parsePitch/.test(src),
      'la surface doit importer displayPitch (ou parsePitch) depuis lib/pitch',
    );
    // Le repli exact qui a produit « [🤝 Les deux] » à l'écran.
    for (const repli of ['|| pact.description', '|| p.description', 'parsed.pitch ||']) {
      assert.ok(!src.includes(repli), `repli brut « ${repli} » de retour dans ${chemin}`);
    }
    // Une description affichée sans passer par le parseur : {...description}
    // est légitime (prop déjà nettoyée par l'appelant), mais pas l'accès
    // direct au champ on-chain dans du JSX.
    assert.ok(
      !/description\}>/.test(src) || !/\.description\}/.test(src),
      `accès direct à description on-chain dans ${chemin}`,
    );
  });
}

test('les surfaces qui reçoivent une description déjà nettoyée le documentent', () => {
  // PremiumProjectCard masque un pitch vide au lieu d'afficher un paragraphe
  // vide : c'est le pendant côté rendu de displayPitch.
  const card = readFileSync(new URL('../src/pages/premium/PremiumProjectCard.tsx', import.meta.url), 'utf8');
  assert.match(card, /description \? <p className="desc">/, 'la carte doit masquer une description vide');
});

test('parsePitch reste la seule source de vérité sur l\'encodage', () => {
  const parsed = parsePitch(ENCODEE);
  assert.equal(parsed.stage, 'both');
  assert.equal(parsed.pitch, 'Jeu mobile space shooter');
  assert.equal(parsed.rolesWanted, '👑 Founder');
  assert.equal(parsed.seedAmountSol, '2');
});
