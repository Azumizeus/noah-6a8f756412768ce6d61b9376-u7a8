// scripts/build-guard.mjs
// ═══════════════════════════════════════════════════════════════════
// « Ce que je m'apprête à publier contient-il une valeur secrète ? »
//
// Usage : node scripts/build-guard.mjs [dossier]     (défaut : dist)
//         branché dans `npm run build`, donc exécuté AVANT tout envoi
//
// ── Pourquoi ce fichier existe ─────────────────────────────────────
// `check:prod` et `check:parc` regardent ce qui est DÉJÀ publié. Ils ont
// trouvé la clé, mais après trois semaines d'exposition : détecter n'est pas
// empêcher. Ce garde-fou pose la question une étape plus tôt, sur le dossier
// produit et avant qu'il ne quitte la machine.
//
// Il ferme précisément le mécanisme de l'incident du 11/10/2026 : Vite inline
// la valeur de toute variable `VITE_*` qu'il évalue à la compilation. Le code
// avait cessé de LIRE la variable ; la variable restait DÉCLARÉE sur la
// plateforme, et le build l'a recopiée fidèlement dans le JavaScript publié.
// Un contrôle qui inspecte le dépôt ne voit pas une déclaration de plateforme.
// Celui-ci regarde le résultat, là où les deux moitiés du problème se
// rejoignent.
//
// ── Ce qu'il refuse, exactement ────────────────────────────────────
// Les règles sont celles du dépôt entier (`scripts/secret-rules.mjs` →
// `analyserBundle`), déjà calibrées sur les bundles réellement servis pour ne
// pas crier à tort. Aucune valeur n'est jamais affichée : empreinte sha256 et
// longueur seulement.
//
// ── Codes de sortie ────────────────────────────────────────────────
//   0 = le dossier produit a été lu, et rien de secret dedans ;
//   3 = une valeur de forme secrète serait publiée — le build ÉCHOUE ;
//   2 = rien n'a pu être lu (dossier absent ou vide). Ce n'est pas un succès :
//       un garde-fou qui n'a rien examiné ne doit pas ressembler à un
//       garde-fou qui a validé.
//
// ⚠️ Ce garde-fou n'est PAS une raison de ne pas révoquer. Il empêche une
// publication future ; il ne rend pas inoffensive une clé déjà partie.
// ═══════════════════════════════════════════════════════════════════
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyserBundle } from './secret-rules.mjs';

/** Au-delà, on ne lit pas le fichier : on le DIT (un plafond muet produit une
 *  réponse fausse, pas partielle — même règle que deploy-check.mjs). */
export const MAX_OCTETS = 12 * 1024 * 1024;

/** Extensions qu'on sait lire comme du texte. Un `.png` ou un `.woff2` n'est
 *  pas analysable : les ouvrir en utf8 produirait du bruit, donc un faux
 *  positif, donc un garde-fou qu'on désactive. */
export const EXTENSIONS_TEXTE = [
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.html',
  '.htm',
  '.css',
  '.svg',
  '.txt',
  '.map',
  '.xml',
  '.webmanifest',
];

/**
 * Tous les fichiers d'un dossier, récursivement, dans un ordre stable.
 * @param {string} racine
 * @returns {string[]} chemins absolus
 */
export function fichiersDuDossier(racine) {
  const trouves = [];
  const visiter = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) visiter(chemin);
      else if (entree.isFile()) trouves.push(chemin);
    }
  };
  visiter(racine);
  return trouves;
}

/** Le fichier est-il de ceux qu'on sait lire comme du texte ? */
export function estLisible(chemin) {
  const bas = chemin.toLowerCase();
  return EXTENSIONS_TEXTE.some((ext) => bas.endsWith(ext));
}

/**
 * Décide du sort d'un dossier produit à partir de son contenu.
 * FONCTION PURE — testable sans disque.
 *
 * @param {{fichier: string, texte: string}[]} entrees
 * @returns {{fuites: string[], lus: number}}
 */
export function verdictsDesFichiers(entrees) {
  const fuites = [];
  for (const { fichier, texte } of entrees) {
    fuites.push(...analyserBundle(texte, fichier));
  }
  return { fuites, lus: entrees.length };
}

async function main() {
  const dossier = process.argv[2] ?? 'dist';

  console.log('\n── Build ─────────────────────────────────────────────');
  console.log(`  dossier produit : ${dossier}`);

  if (!existsSync(dossier) || !statSync(dossier).isDirectory()) {
    console.log('\n── Verdict ───────────────────────────────────────────');
    console.log(`  ? « ${dossier} » est absent — rien à examiner, donc PAS de feu vert (code 2).`);
    console.log('    Lance ce garde-fou après la compilation : npm run build');
    process.exit(2);
  }

  const tous = fichiersDuDossier(dossier);
  const lisibles = tous.filter(estLisible);
  const autres = tous.length - lisibles.length;

  const entrees = [];
  const ignores = [];
  for (const chemin of lisibles) {
    const taille = statSync(chemin).size;
    if (taille > MAX_OCTETS) {
      ignores.push(`${relative(dossier, chemin)} (${(taille / 1024 / 1024).toFixed(1)} Mio > plafond)`);
      continue;
    }
    entrees.push({ fichier: relative(dossier, chemin), texte: readFileSync(chemin, 'utf8') });
  }

  console.log(`  fichiers         : ${tous.length} (${lisibles.length} lisibles, ${autres} non textuels ignorés)`);
  if (ignores.length > 0) console.log(`  au-dessus du plafond : ${ignores.join(', ')}`);

  const { fuites, lus } = verdictsDesFichiers(entrees);

  console.log('\n── Secrets dans ce qui serait publié ─────────────────');
  console.log(`  fichiers lus : ${lus}/${lisibles.length}`);
  for (const f of fuites) console.log(`  ✗ ${f}`);
  if (fuites.length === 0 && lus > 0) {
    console.log('  ✓ aucune valeur de forme secrète ne partirait avec ce build');
  }

  console.log('\n── Verdict ───────────────────────────────────────────');
  if (fuites.length > 0) {
    console.log(
      `  ✗ ${fuites.length} valeur(s) de forme secrète dans le dossier produit — PUBLICATION REFUSÉE.`
    );
    console.log(
      '    Retire la variable de la plateforme (et non seulement du code : Vite inline ce qui est\n' +
        '    DÉCLARÉ), ou renomme-la sans le préfixe VITE_ si elle doit rester serveur.'
    );
    console.log('    Révoquer la clé chez le fournisseur reste nécessaire si elle a déjà été publiée.');
    process.exit(3);
  }
  if (lus === 0) {
    console.log('  ? aucun fichier lu — le build n’est PAS vérifié (pas un succès).');
    process.exit(2);
  }
  console.log(`  ✓ ${lus} fichier(s) lu(s), rien de secret dedans.`);
  process.exit(0);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((erreur) => {
    console.error(`\n✗ Garde-fou interrompu : ${erreur?.message ?? erreur}`);
    process.exit(2);
  });
}
