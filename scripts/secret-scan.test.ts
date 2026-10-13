// scripts/secret-scan.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou : plus jamais de secret en clair dans un fichier SUIVI.
//
// Contexte : la paire VAPID a été recopiée en clair dans un document de
// référence, qui est parti sur GitHub (08/10/2026). Elle a dû être
// régénérée. Ce contrôle existe pour que la prochaine clé collée quelque
// part fasse échouer `npm test` au lieu d'attendre une relecture humaine.
//
// Ce qui est scanné : les fichiers SUIVIS par git (`git ls-files`), pas le
// disque — un `.env.local` ou un dossier ignoré n'a rien à faire ici, et un
// contrôle qui crierait sur des fichiers légitimes serait désactivé au bout
// de trois jours.
//
// ── La finesse qui compte : toutes les clés ne sont pas des secrets ──
// La clé Supabase `anon` est PUBLIQUE par conception (elle part dans le
// navigateur) : la signaler serait un faux positif. La clé `service_role`
// du même projet, elle, donne un accès total. Les deux ont exactement la
// même forme (`eyJ…`). Le seul moyen de les distinguer est de DÉCODER le
// jeton et de lire sa revendication `role` — c'est ce que fait la règle 2.
//
// ── Pourquoi les fausses clés sont ASSEMBLÉES ────────────────────────
// ⚠️ Les valeurs de test ci-dessous ne sont jamais écrites en clair : elles
// sont concaténées à l'exécution. Deux raisons, dans cet ordre :
//   1. un test qui planterait un secret RÉEL dans le dépôt pour vérifier
//      qu'on n'y met pas de secret serait absurde — c'est arrivé une fois,
//      avec la vraie clé VAPID, dans la première version de ce fichier ;
//   2. ce fichier est lui-même scanné : une chaîne littérale correspondant à
//      une règle le ferait échouer sur sa propre source. La concaténation
//      garde le fichier propre tout en exerçant les règles.
//
// Deux niveaux de test, comme pour les autres garde-fous :
//   1. `analyser()` est pure : on lui donne des secrets SYNTHÉTIQUES et on
//      vérifie qu'elle les attrape (donc qu'elle saurait échouer) ;
//   2. on l'applique ensuite aux fichiers réels du dépôt et on exige ZÉRO
//      trouvaille.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ⚠️ Les MOTIFS ne sont plus définis ici : ils vivent dans
// `scripts/secret-rules.mjs`, partagés avec l'audit d'historique
// (`scripts/history-secret-scan.mjs`). Deux copies d'une même liste de motifs
// finissent par diverger, et l'historique serait alors jugé propre selon des
// règles que ce fichier-ci a déjà renforcées.
import { analyser } from './secret-rules.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── Règles ───────────────────────────────────────────────────────────
// Elles sont importées ci-dessus depuis `scripts/secret-rules.mjs`. Ce qui
// reste ici : les CAS DE TEST (le contrôle sait-il échouer ?) et le balayage
// des fichiers réels.

// ─── 1. Le contrôle SAIT échouer (entrées synthétiques) ───────────────

/** Assemble une fausse valeur sans jamais l'écrire en clair (voir l'en-tête). */
const F = (...morceaux: string[]): string => morceaux.join('');

test('attrape un jeton service_role, épargne un anon', () => {
  const entete = (role: string): string =>
    F(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.',
      Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url'),
      '.c2lnbmF0dXJlLWZhY2U'
    );

  assert.equal(analyser(`const k = '${entete('anon')}'`, 'x.ts').length, 0, 'anon est publique : ne doit pas crier');
  const t = analyser(`const k = '${entete('service_role')}'`, 'x.ts');
  assert.equal(t.length, 1);
  assert.match(t[0], /service_role/);
});

test('attrape les formats de clés connues', () => {
  const tete = F('-----BEGIN ', 'RSA PRIVATE KEY', '-----');
  const jetonGithub = F('ghp_', 'AAAAaaaaBBBBbbbbCCCCccccDDDDdddd');
  const cleAws = F('AKIA', 'IOSFODNN7EXAMPLE');

  assert.equal(analyser(`${tete}\nMIIE...`, 'x').length, 1);
  assert.equal(analyser(`token = "${jetonGithub}"`, 'x').length, 1);
  assert.equal(analyser(`k = "${cleAws}"`, 'x').length, 1);
});

test('attrape une affectation sensible en littéral', () => {
  const nom = F('VAPID_', 'PRIVATE_KEY');
  const fausse = F('FAUSSE_CLE', '_de_test_0123456789');
  const t = analyser(`${nom}='${fausse}'`, 'x.ts');
  assert.equal(t.length, 1);
  assert.match(t[0], /VAPID_PRIVATE_KEY/);
});

test('épargne le modèle .env et les valeurs gabarit', () => {
  for (const ligne of [
    'VITE_SUPABASE_ANON_KEY=<clé_anon_publique>',
    'SUPABASE_SERVICE_ROLE_KEY=<change_me>',
    'API_KEY=your-key-here-please',
    'SECRET=...',
  ]) {
    assert.equal(analyser(ligne, '.env.example').length, 0, `faux positif sur : ${ligne}`);
  }
});

// ─── 2. Le dépôt réel n'en contient aucun ─────────────────────────────

const TAILLE_MAX = 1_000_000;

function fichiersSuivis(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: racine, encoding: 'utf8' })
    .split('\0')
    .filter((f) => f.length > 0);
}

test('aucun secret en clair dans les fichiers suivis', () => {
  const trouvailles: string[] = [];
  let scannes = 0;

  for (const chemin of fichiersSuivis()) {
    let texte: string;
    try {
      const brut = readFileSync(join(racine, chemin));
      if (brut.length > TAILLE_MAX) continue;
      texte = brut.toString('utf8');
    } catch {
      continue; // binaire illisible : rien à scanner
    }
    if (texte.includes('\u0000')) continue; // binaire
    scannes++;
    trouvailles.push(...analyser(texte, chemin));
  }

  assert.ok(scannes > 100, `balayage suspect : seulement ${scannes} fichier(s) lus`);
  assert.deepEqual(
    trouvailles,
    [],
    `secret(s) en clair dans le dépôt :\n  ${trouvailles.join('\n  ')}\n` +
      '→ déplacer la valeur hors du dépôt (variable d’environnement, .env.local ignoré) et la révoquer.'
  );
});

// ─── Le coût des règles sur une très longue ligne ────────────────────
//
// Ce test est né d'une panne RÉELLE, pas d'une intuition : le 09/10/2026,
// en câblant le mode profond de l'audit d'historique, `npm test` s'est mis à
// ne plus rendre la main. Cause trouvée en mesurant : le groupe de nom de
// AFFECTATION était non borné, ce qui rendait l'expression QUADRATIQUE.
//
//   avant :  5 000 car. = 58 ms · 20 000 = 1 059 ms · 40 000 = 5 115 ms
//   après : 40 000 = 5 ms · 400 000 = 10 ms
//
// À l'échelle d'un blob de 400 Kio, l'ancien comportement demandait ~8
// minutes. Un contrôle qui coûte huit minutes par fichier est un contrôle
// qu'on n'exécute pas — donc il ne protège rien.
//
// ⚠️ Ce test vise un retour du comportement quadratique, pas une
// micro-régression de performance : la marge est énorme (≈60×) pour rester
// insensible à une machine chargée. Il n'a de sens que sur des lignes d'une
// seule traite, ce que produit un bundle minifié.
test('les règles restent linéaires sur une très longue ligne', () => {
  const debut = Date.now();
  // Cas 1 : aucune trouvaille — la ligne ne mentionne aucun mot sensible.
  assert.deepEqual(analyser('A'.repeat(400_000), 'ligne-longue.txt'), []);
  // Cas 2 : le pire cas réel — une affectation sensible avec une valeur de
  // 400 000 caractères impose de lire ET de tracer la valeur.
  const trouvees = analyser(`secret=${'A'.repeat(400_000)}`, 'ligne-longue.txt');
  assert.equal(trouvees.length, 1, 'la longue ligne sensible doit être détectée');
  const ms = Date.now() - debut;
  assert.ok(ms < 3000, `2 × 400 000 caractères en ${ms} ms : les règles sont redevenues super-linéaires`);
});
