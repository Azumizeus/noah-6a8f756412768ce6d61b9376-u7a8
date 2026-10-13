// scripts/git-guard.test.ts
// ═══════════════════════════════════════════════════════════════════
// Test du garde-fou anti-incident (scripts/git-guard.mjs).
//
// On teste la décision, pas git : evaluatePush est une fonction pure.
// Le point vérifié est celui qui a manqué le 07/10 — un envoi massif doit
// être REFUSÉ, et la limite doit rester celle du protocole écrit dans
// CERVEAU PROJET (l.34) : 5 fichiers max par lot.
//
// Lancement : npm test
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePush, evaluateRangeOutput, LOT_MAX } from './git-guard.mjs';

const files = (n: number) => Array.from({ length: n }, (_, i) => `src/fichier-${i}.ts`);

test('la limite par défaut est celle du protocole documenté', () => {
  assert.equal(LOT_MAX, 5);
});

test('un lot vide passe', () => {
  const v = evaluatePush([]);
  assert.equal(v.ok, true);
  assert.equal(v.count, 0);
});

test('un lot à la limite passe', () => {
  const v = evaluatePush(files(LOT_MAX));
  assert.equal(v.ok, true);
  assert.equal(v.count, LOT_MAX);
});

test('un lot juste au-dessus de la limite est refusé', () => {
  const v = evaluatePush(files(LOT_MAX + 1));
  assert.equal(v.ok, false);
  assert.equal(v.count, LOT_MAX + 1);
  assert.equal(v.limit, LOT_MAX);
});

test('un envoi massif est refusé — cas réel du 07/10/2026', () => {
  const v = evaluatePush(files(193));
  assert.equal(v.ok, false);
  assert.equal(v.count, 193);
  // La liste des fichiers est renvoyée pour que le message soit exploitable.
  assert.equal(v.files.length, 193);
});

test('les doublons ne comptent pas deux fois', () => {
  const v = evaluatePush(['a.ts', 'a.ts', 'b.ts', 'b.ts', 'a.ts']);
  assert.equal(v.count, 2);
  assert.equal(v.ok, true);
});

test('les entrées vides ou non textuelles sont ignorées', () => {
  // @ts-expect-error — on teste la robustesse face à une entrée inattendue
  const v = evaluatePush(['a.ts', '', null, undefined, 'b.ts']);
  assert.equal(v.count, 2);
  assert.equal(v.ok, true);
});

test('le contournement explicite autorise un envoi massif, et le signale', () => {
  const v = evaluatePush(files(50), { allowMass: true });
  assert.equal(v.ok, true);
  assert.equal(v.bypassed, true);
  assert.equal(v.count, 50);
});

test('une limite personnalisée est respectée', () => {
  assert.equal(evaluatePush(files(10), { limit: 10 }).ok, true);
  assert.equal(evaluatePush(files(11), { limit: 10 }).ok, false);
});

// ─────────────────────────────────────────────────────────────────────
// Cas « plage incalculable » — trouvé en testant le hook sur de vraies
// données le 07/10 : avec des SHA inconnus, `git diff` échoue, le script
// comptait 0 fichier et laissait passer l'envoi. Un garde-fou qui échoue
// OUVERT ne garde rien : ces tests verrouillent le comportement FERMÉ.
// ─────────────────────────────────────────────────────────────────────

test('une plage incalculable est REFUSÉE, pas lue comme vide', () => {
  const v = evaluateRangeOutput(null);
  assert.equal(v.ok, false);
  assert.equal(v.indeterminate, true);
  assert.equal(v.count, 0);
});

test('une plage incalculable ne se contourne qu\'explicitement', () => {
  const v = evaluateRangeOutput(null, { allowMass: true });
  assert.equal(v.ok, true);
  assert.equal(v.bypassed, true);
  assert.equal(v.indeterminate, true);
});

test('une plage réellement vide (aucun fichier) passe', () => {
  const v = evaluateRangeOutput('');
  assert.equal(v.ok, true);
  assert.equal(v.indeterminate, false);
  assert.equal(v.count, 0);
});

test('les lignes vides d\'une sortie git ne comptent pas comme des fichiers', () => {
  const v = evaluateRangeOutput('src/a.ts\n\nsrc/b.ts\n');
  assert.equal(v.ok, true);
  assert.equal(v.count, 2);
});

test('un envoi massif détecté via la sortie git est refusé', () => {
  const v = evaluateRangeOutput(files(57).join('\n'));
  assert.equal(v.ok, false);
  assert.equal(v.indeterminate, false);
  assert.equal(v.count, 57);
});

test('une sortie git à la limite exacte passe', () => {
  assert.equal(evaluateRangeOutput(files(LOT_MAX).join('\n')).ok, true);
  assert.equal(evaluateRangeOutput(files(LOT_MAX + 1).join('\n')).ok, false);
});
