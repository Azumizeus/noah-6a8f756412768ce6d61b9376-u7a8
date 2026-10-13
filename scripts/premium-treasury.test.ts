// scripts/premium-treasury.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de l'export Treasury premium (migration du 08/10/2026).
//
// Contexte : le seul morceau de trésorerie que le shell premium déléguait
// encore au legacy était l'export CSV/JSON — c'est ce qui faisait du lien
// « Historique ↗ » de PremiumNav une DÉPENDANCE (retirer /v1 aurait cassé
// l'export) et non un ornement. L'export est désormais natif ici.
//
// Deux règles, chacune pour un retour en arrière précis :
//
//   1. la page importe la lib PARTAGÉE `lib/exportTreasury` et câble les deux
//      boutons — si elle se remet à renvoyer l'utilisateur vers /v1, le
//      retrait du legacy redeviendrait bloquant sans que rien ne le dise ;
//   2. les libellés viennent de `t('treasury.export*')`, jamais d'un texte en
//      dur — un libellé figé resterait en français dans l'interface anglaise.
//
// Lecture du source (pas de DOM) : même parti pris que premium-card.test.ts et
// premium-settings.test.ts — le projet n'a pas de jsdom, et le risque visé est
// une dépendance réintroduite, pas un détail de rendu.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readPremium = (name: string): string =>
  readFileSync(new URL(`../src/pages/premium/${name}`, import.meta.url), 'utf8');

/** Source sans commentaires : l'en-tête de la page cite `/v1` et l'historique
 *  pour EXPLIQUER la migration ; un scan naïf y lirait une dépendance.
 *  Même strip que premium-settings.test.ts (limite assumée : pas de bloc
 *  `/* … *\/` écrit dans une chaîne — ce fichier n'en contient pas). */
const stripComments = (src: string): string =>
  src
    .replace(/^[ \t]*\{\s*\/\*[\s\S]*?\*\/\s*\}[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .split('\n')
    .filter((line) => !/^[ \t]*(\/\/|\*)/.test(line))
    .join('\n');

const code = (name: string): string => stripComments(readPremium(name));

// ─── 1. L'export est natif, pas délégué au legacy ─────────────────────

test('PremiumTreasury importe la lib d’export partagée', () => {
  const src = code('PremiumTreasury.tsx');
  assert.match(
    src,
    /import\s*\{[^}]*downloadTreasuryCsv[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/exportTreasury'/,
    'export CSV non importé depuis la lib partagée'
  );
  assert.match(src, /downloadTreasuryJson/, 'export JSON non branché');
});

test('PremiumTreasury câble les deux boutons d’export', () => {
  const src = code('PremiumTreasury.tsx');
  assert.match(src, /onClick=\{\(\) => downloadTreasuryCsv\(flows\)\}/, 'bouton CSV non cliquable');
  assert.match(
    src,
    /downloadTreasuryJson\(flows, \{ totalValueLockedSol, distributedRecentSol, pendingClaimsSol \}\)/,
    'le JSON doit exporter le résumé complet, pas seulement les flux'
  );
});

test('PremiumTreasury ne renvoie plus l’export vers /v1', () => {
  const src = code('PremiumTreasury.tsx');
  assert.doesNotMatch(src, /#\/v1\/treasury/, 'dépendance legacy réintroduite : l’export doit rester ici');
});

// ─── 2. Les libellés viennent des dictionnaires ───────────────────────

test('les libellés d’export viennent de t(), pas d’un texte en dur', () => {
  const src = code('PremiumTreasury.tsx');
  assert.match(src, /t\('treasury\.exportCsv'\)/, 'libellé CSV en dur ou clé renommée');
  assert.match(src, /t\('treasury\.exportJson'\)/, 'libellé JSON en dur ou clé renommée');
});

test('les clés treasury.export* existent en FR et EN', () => {
  for (const file of ['fr.ts', 'en.ts']) {
    const dict = readFileSync(new URL(`../src/lib/i18n/${file}`, import.meta.url), 'utf8');
    for (const key of ['exportCsv', 'exportJson']) {
      assert.match(dict, new RegExp(`\\b${key}:`), `${file} : clé ${key} absente`);
      // La valeur doit être une chaîne, pas un objet imbriqué : une entrée
      // mal formée affiche « treasury.exportCsv » à l'écran au lieu du libellé.
      const re = new RegExp(`\\b${key}:\\s*'([^']*)'`);
      const hit = re.exec(dict);
      assert.ok(hit && hit[1].trim().length > 0, `${file} : ${key} n’est pas une chaîne non vide`);
    }
  }
});
