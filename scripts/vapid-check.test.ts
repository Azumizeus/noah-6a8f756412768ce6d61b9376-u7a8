// scripts/vapid-check.test.ts
// ═══════════════════════════════════════════════════════════════════
// Tests de scripts/vapid-check.mjs.
//
// Deux niveaux, comme les autres garde-fous du dépôt :
//   1. les fonctions pures, sur des paires FABRIQUÉES à l'exécution — donc
//      aucune valeur de clé n'est écrite dans ce fichier ;
//   2. le contrôle qui compte vraiment : AUCUNE sortie du module ne doit
//      contenir la clé qu'on lui a donnée. C'est la règle qui protège les
//      logs et terminuax, et elle se teste comme le reste.
//
// Les paires de test sont générées par `createECDH` : aucun secret réel,
// aucune valeur littérale à scanner — et ça exerce exactement le même
// calcul que la vraie vérification (courbe P-256, base64url).
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  empreinte,
  masquer,
  derivePublique,
  paireCoherente,
  lireVarsEnv,
  refDepuisUrl,
  comparerEmpreintes,
  lirePaireLocale,
} from './vapid-check.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Fabrique une paire P-256 neuve, au format VAPID (base64url). */
function paireNeuve() {
  const e = createECDH('prime256v1');
  e.generateKeys();
  return {
    privee: e.getPrivateKey().toString('base64url'),
    publique: e.getPublicKey().toString('base64url'),
  };
}

// ─── 1. La géométrie de la courbe ─────────────────────────────────────

test('une paire neuve est cohérente, et sa publique se recalcule', () => {
  const p = paireNeuve();
  assert.equal(p.privee.length, 43, 'une privée P-256 fait 43 caractères base64url');
  assert.equal(p.publique.length, 87, 'une publique non compressée en fait 87');
  assert.equal(derivePublique(p.privee), p.publique);
  assert.equal(paireCoherente(p.privee, p.publique), true);
});

test('deux paires différentes ne sont pas cohérentes entre elles', () => {
  const a = paireNeuve();
  const b = paireNeuve();
  assert.equal(paireCoherente(a.privee, b.publique), false);
  assert.notEqual(derivePublique(a.privee), derivePublique(b.privee));
});

test('une valeur illisible ne fait pas planter, elle rend false', () => {
  assert.equal(derivePublique('pas-une-cle!!'), null);
  assert.equal(paireCoherente('pas-une-cle!!', 'non-plus'), false);
  assert.equal(paireCoherente(null, null), false);
});

// ─── 2. L'empreinte : comparable, et non réversible ───────────────────

test('l’empreinte est stable, courte, et différente de la valeur', () => {
  const e = empreinte('une-valeur-quelconque');
  assert.match(e, /^[0-9a-f]{12}$/);
  assert.equal(e, empreinte('une-valeur-quelconque'), 'déterministe');
  assert.notEqual(e, 'une-valeur-quelconque');
  assert.notEqual(empreinte('a'), empreinte('b'));
});

test('comparerEmpreintes aligne une empreinte courte sur un sha256 complet', () => {
  // C'est le cas réel : on calcule 12 caractères, Supabase en annonce 64.
  const valeur = 'valeur-annonee-par-le-serveur';
  const digestServeur = createHash('sha256').update(valeur).digest('hex');
  const c = comparerEmpreintes({ nom: 'VAPID_PRIVATE_KEY', locale: empreinte(valeur), distante: digestServeur });
  assert.equal(c.concorde, true);
});

test('une divergence est signalée', () => {
  const a = empreinte('paire-A');
  const b = empreinte('paire-B');
  assert.equal(comparerEmpreintes({ nom: 'x', locale: a, distante: b }).concorde, false);
  // Un secret absent côté serveur n'est pas une concordance.
  assert.equal(comparerEmpreintes({ nom: 'x', locale: a, distante: undefined }).concorde, false);
});

// ─── 3. LE test qui compte : aucune sortie ne divulgue la clé ─────────

test('aucune sortie du module ne contient la clé privée', () => {
  const p = paireNeuve();
  const sorties = [
    empreinte(p.privee),
    masquer(p.privee),
    derivePublique(p.privee) ?? '',
    masquer(p.publique),
  ];
  for (const s of sorties) {
    assert.ok(!s.includes(p.privee), `une sortie divulgue la clé : ${s}`);
  }
  // Le masquage garde la LONGUEUR (utile au diagnostic) mais pas le contenu.
  assert.ok(masquer(p.privee).includes('43 car.'));
  assert.equal(masquer(p.privee).includes(p.privee.slice(0, 8)), false, 'même un préfixe ne doit pas sortir');
});

// ─── 4. Lecture des fichiers d'environnement ──────────────────────────

test('lireVarsEnv lit guillemets, export, espaces et lignes vides', () => {
  const v = lireVarsEnv(
    [
      '# un commentaire',
      'VAPID_PRIVATE_KEY=abc',
      'export VAPID_PUBLIC_KEY="def"',
      "AUTRE='ghi'",
      '',
      'PAS_UNE_VARIABLE',
    ].join('\n')
  );
  assert.equal(v.VAPID_PRIVATE_KEY, 'abc');
  assert.equal(v.VAPID_PUBLIC_KEY, 'def');
  assert.equal(v.AUTRE, 'ghi');
  assert.equal(v.PAS_UNE_VARIABLE, undefined);
});

test('refDepuisUrl extrait la référence d’un projet Supabase', () => {
  assert.equal(refDepuisUrl('https://abcdefghijklmnopqrst.supabase.co'), 'abcdefghijklmnopqrst');
  assert.equal(refDepuisUrl('https://exemple.test'), null);
  assert.equal(refDepuisUrl(''), null);
});

// ─── 5. Sur les fichiers réels, s'ils existent ────────────────────────
// Ces fichiers sont hors dépôt (.env* est ignoré) : le contrôle se saute
// proprement sur une machine qui ne les a pas, plutôt que d'échouer.

test('si la paire locale existe, elle doit être cohérente', () => {
  const { privee, publique } = lirePaireLocale({
    fichierPrivee: join(racine, '.env.vapid'),
    fichierPublique: join(racine, '.env.local'),
  });
  if (!privee || !publique) return; // rien à vérifier sur cette machine

  assert.equal(
    paireCoherente(privee, publique),
    true,
    'la VAPID_PRIVATE_KEY locale ne dérive pas la VITE_VAPID_PUBLIC_KEY locale — ' +
      'l’une des deux a été remplacée sans l’autre'
  );
});
