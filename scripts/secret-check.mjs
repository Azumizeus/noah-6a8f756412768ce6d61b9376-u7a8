// scripts/secret-check.mjs
// ═══════════════════════════════════════════════════════════════════
// « Le secret du relais, déployé côté Supabase, est-il bien CE fichier ? »
//
// Usage : node scripts/secret-check.mjs [chemin-du-fichier]
//         npm run check:secret
//
// ── Le problème concret ──────────────────────────────────────────────
// Le relais (`supabase/functions/rpc`) lit sa clé d'API dans le secret
// `RPC_UPSTREAM_URL`. Une rotation est INVISIBLE de l'extérieur : le relais
// expose `X-Buildpact-Relais: dedie | devnet-public`, ce qui dit seulement
// s'il tourne sur un nœud dédié ou s'il est retombé sur le devnet public —
// jamais QUELLE clé il utilise. C'est exactement ce qu'on veut de lui.
//
// Donc, après une rotation, deux choses peuvent être vraies en même temps :
// le secret a été posé, et il ne correspond pas au fichier qu'on croit.
// Aucun test du dépôt ne le voit, parce que la valeur vit des deux côtés du
// réseau. Ce script compare les deux, et c'est tout.
//
// ── La règle : jamais une valeur, seulement des empreintes ───────────
// `supabase secrets list` annonce un sha256 par secret, jamais la valeur.
// On calcule le même sha256 sur la valeur locale et on compare les préfixes.
// Deux empreintes égales prouvent deux valeurs égales ; une empreinte ne
// permet pas de remonter à la valeur. `masquer()` (emprunté à
// `vapid-check.mjs`) garantit qu'aucun message n'imprime autre chose qu'une
// empreinte et une longueur.
//
// ── Le fichier attendu ───────────────────────────────────────────────
// Une SEULE ligne, hors du dépôt, p. ex. `~/.buildpact-rpc.env` :
//
//   RPC_UPSTREAM_URL=https://devnet.helius-rpc.com/?api-key=<ta clé>
//
// L'emplacement se choisit dans cet ordre : argument de la commande, puis
// `RPC_SECRET_FILE`, puis `~/.buildpact-rpc.env`.
//
// ── Codes de sortie ──────────────────────────────────────────────────
//   0 — le secret déployé est exactement ce fichier
//   1 — DIVERGENCE : le relais ne tourne pas sur ce fichier (ou secret absent)
//   2 — vérification impossible : fichier introuvable, ou Supabase injoignable
//       ⚠ 2 n'est PAS un succès : on ne prétend jamais avoir vérifié.
//       `--local-seul` saute la comparaison serveur (et rend 2 si un fichier
//       est présent, puisque rien n'a été comparé).
// ═══════════════════════════════════════════════════════════════════
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  comparerEmpreintes,
  empreinte,
  lireSecretsDistants,
  lireVarsEnv,
  masquer,
  refDepuisUrl,
} from './vapid-check.mjs';

/** Nom du secret côté Supabase, et de la clé dans le fichier local. */
export const NOM_SECRET = 'RPC_UPSTREAM_URL';

/** Fichier par défaut : hors du dépôt, un dépôt ne porte pas de clé. */
export const FICHIER_DEFAUT = join(homedir(), '.buildpact-rpc.env');

/**
 * Quel fichier lire ? Argument, puis `RPC_SECRET_FILE`, puis le défaut.
 * FONCTION PURE : les trois sources sont passées en paramètre, donc le test
 * les exerce sans toucher au disque ni à l'environnement réel.
 */
export function resoudreFichier({ args = [], env = {}, defaut = FICHIER_DEFAUT } = {}) {
  const parArgument = (args ?? []).find((a) => a && !String(a).startsWith('--'));
  const parEnv = String(env.RPC_SECRET_FILE ?? '').trim();
  const choisi = (parArgument ?? '') || parEnv || defaut;
  // `node ~/.buildpact-rpc.env` écrit un chemin « nu » : on le garde tel quel,
  // mais un chemin relatif doit être lisible depuis le dépôt, pas depuis `~`.
  return isAbsolute(choisi) || /[\\/]/.test(choisi) || choisi.startsWith('~')
    ? choisi.replace(/^~(?=\/|$)/, homedir())
    : join(process.cwd(), choisi);
}

/**
 * La valeur `RPC_UPSTREAM_URL` d'un texte de fichier d'environnement.
 * FONCTION PURE. Aucun message ne rend jamais cette valeur telle quelle.
 * @returns {string|null} l'URL amont, ou null si absente
 */
export function lireUrlAmont(texte) {
  const vars = lireVarsEnv(String(texte ?? ''));
  const valeur = vars[NOM_SECRET];
  return valeur ? String(valeur).trim() : null;
}

/**
 * Le rapport, construit sur des valeurs DÉJÀ lues.
 * FONCTION PURE — c'est ici que se joue la règle « jamais une valeur », et le
 * test associé vérifie qu'aucune ligne ne contient la clé d'entrée.
 *
 * @param {{fichier: string, valeur: string|null, distante?: string|null, ref?: string|null}} entree
 *   `distante` : le sha256 complet annoncé par Supabase (ou null si inconnu)
 *   `ref` : référence du projet Supabase, pour que la commande de réparation
 *           soit COMPLÈTE — un `<ref>` à compléter à la main est un mode
 *           d'emploi qu'on ne suit pas
 * @returns {{code: number, lignes: string[]}}
 */
export function rapportAmont({ fichier, valeur, distante = null, ref = null }) {
  const lignes = [`  fichier   : ${fichier}`];

  if (!valeur) {
    lignes.push(`✗ aucun ${NOM_SECRET} lisible dans ce fichier`);
    lignes.push('  → la clé du relais doit y figurer, une seule ligne, hors dépôt');
    return { code: 2, lignes };
  }

  lignes.push(`  local     : ${masquer(valeur)}`);

  if (!distante) {
    lignes.push(`? ${NOM_SECRET} absent des secrets déployés — ou Supabase non interrogé`);
    return { code: 2, lignes };
  }

  const c = comparerEmpreintes({
    nom: NOM_SECRET,
    locale: empreinte(valeur),
    distante,
  });
  lignes.push(`  déployé   : ${c.distante.slice(0, 12)}… (sha256, ${c.distante.length} car.)`);

  if (c.concorde) {
    lignes.push(`✓ le relais tourne sur CE fichier (empreinte ${c.locale} des deux côtés)`);
    return { code: 0, lignes };
  }

  lignes.push(`✗ DIVERGENCE : le secret déployé ne correspond pas à ce fichier`);
  lignes.push(`  local ${c.locale} ≠ déployé ${c.distante.slice(0, 12)}`);
  lignes.push('  → deux causes possibles, et une seule commande pour trancher :');
  lignes.push(
    `     npx supabase secrets set --env-file ${fichier} --project-ref ${ref ?? '<ref>'}`
  );
  lignes.push('     (si la divergence surprend : une ancienne clé est restée posée)');
  return { code: 1, lignes };
}

// ─── CLI ──────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const localSeul = args.includes('--local-seul');
  const fichier = resoudreFichier({ args, env: process.env });

  console.log('\n── Clé du relais : le déployé est-il ce fichier ? ────');

  if (!existsSync(fichier)) {
    console.log(`  fichier   : ${fichier}`);
    console.log('✗ fichier introuvable — rien à comparer (ce n’est pas un succès)');
    console.log('');
    console.log('  À FAIRE, en deux gestes (la clé ne passe jamais par ce terminal) :');
    console.log('   1. dans le tableau de bord Helius, crée une clé devnet et copie son URL RPC');
    console.log('   2. reviens ici et colle-la dans le fichier, sans la taper à la main :');
    console.log('');
    console.log(`      pbpaste | sed 's|^|${NOM_SECRET}=|' > ${fichier}`);
    console.log(`      chmod 600 ${fichier}`);
    console.log('');
    console.log('   3. relance : npm run check:secret');
    console.log('      (surprise attendue au premier passage : DIVERGENCE — le relais tourne');
    console.log('       encore sur l’ancienne clé. La commande pour poser la neuve est alors');
    console.log('       affichée, et un second passage doit dire « CE fichier ».)');
    process.exit(2);
  }

  const valeur = lireUrlAmont(readFileSync(fichier, 'utf8'));

  let distante = null;
  // Résolue AVANT le rapport : elle sert aussi à écrire la commande de
  // réparation en entier, pas avec un `<ref>` à compléter.
  const ref =
    String(process.env.SUPABASE_PROJECT_REF ?? '').trim() ||
    refDepuisUrl(
      existsSync('.env') ? lireVarsEnv(readFileSync('.env', 'utf8')).VITE_SUPABASE_URL : ''
    );
  if (!localSeul) {
    if (!ref) {
      console.log(`  fichier   : ${fichier}`);
      console.log('? référence de projet Supabase introuvable — comparaison serveur impossible');
      console.log('  → renseigne SUPABASE_PROJECT_REF, ou lance avec --local-seul');
      process.exit(2);
    }
    try {
      distante = lireSecretsDistants(ref)[NOM_SECRET] ?? null;
    } catch (e) {
      console.log(`  fichier   : ${fichier}`);
      console.log(`? Supabase injoignable (${String(e.message ?? e).split('\n')[0]})`);
      console.log('  → comparaison NON faite : ce n’est pas un succès (code 2)');
      process.exit(2);
    }
  }

  const { code, lignes } = rapportAmont({ fichier, valeur, distante, ref });
  for (const l of lignes) console.log(l);
  console.log('');
  console.log(code === 0 ? '✓ Vérifié.' : code === 1 ? '✗ Divergence.' : '? Vérification impossible.');
  process.exit(code);
}

// N'exécuter le CLI que s'il est lancé directement (les tests importent le
// module). La comparaison passe par `realpathSync` : `process.argv[1]` est
// relatif quand on lance `node scripts/…`, et une URL construite à la main ne
// correspondrait jamais — le CLI ne se serait jamais exécuté. Même garde, mot
// pour mot, que `vapid-check.mjs`, qui est passé par ce piège.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
