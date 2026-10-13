// scripts/deploy-fleet-check.mjs
// ═══════════════════════════════════════════════════════════════════
// « Tout le parc de déploiements sert-il des octets propres ? »
//
// Usage : node scripts/deploy-fleet-check.mjs [url…]
//         npm run check:parc
//
// ── Pourquoi ce fichier existe ─────────────────────────────────────
// `npm run check:prod` ne lit QU'UNE adresse : celle de la production. Le
// 11/10/2026, cette lecture a bien trouvé la clé Helius servie en clair — mais
// elle ne pouvait pas savoir que le projet comptait 166 déploiements, que 99
// d'entre eux servaient une page dont le bundle portait une clé, ni surtout
// qu'il y en avait **deux** distinctes. La seconde n'a été vue qu'en énumérant
// tout le parc et en regroupant les bundles par empreinte.
//
// Un contrôle qui ne regarde qu'une porte ne dit rien des 165 autres.
//
// ── Ce qu'il fait, dans cet ordre ──────────────────────────────────
//   1. il énumère les déploiements du projet lié (`vercel ls`, pagination
//      comprise), ou prend la liste donnée en arguments ;
//   2. il lit la page de CHACUN et note le bundle qu'elle référence ;
//   3. il regroupe par nom de bundle — un même nom de fichier signifie un même
//      contenu (Vite hache le contenu), donc un bundle identique n'est
//      téléchargé et analysé qu'UNE fois. Sur le parc réel du 11/10 : 166 pages
//      lues, 62 bundles distincts, soit 62 téléchargements au lieu de 166 ;
//   4. il fait passer chaque bundle lu par `analyserBundle` — les règles du
//      dépôt, écrites une seule fois dans `scripts/secret-rules.mjs`.
//
// ── Ce qu'il n'affiche JAMAIS ──────────────────────────────────────
// Une valeur. Une trouvaille se décrit par son empreinte sha256 et sa longueur.
// Un contrôle de sécurité qui recopie ce qu'il trouve est un contrôle qui fuit.
//
// ── Codes de sortie ────────────────────────────────────────────────
//   0 = au moins un déploiement a été lu, et AUCUN ne sert de valeur secrète ;
//   3 = au moins un bundle servi porte une valeur de forme secrète ;
//   2 = impossible de conclure (CLI absente, projet non lié, aucune page
//       lisible). Ce n'est PAS un succès : un contrôle qui n'a rien mesuré ne
//       doit pas ressembler à un contrôle qui a validé. Les déploiements non
//       lisibles sont comptés et affichés, jamais tus.
//
// ── Pourquoi ce n'est pas dans `npm test` ni en CI ─────────────────
// Il dépend du réseau ET d'une authentification Vercel : le faire tourner dans
// la suite de tests la rendrait dépendante d'un service externe, et en CI il
// échouerait en « 2 » faute de jeton — un rouge permanent qu'on apprend à
// ignorer. Il accepte `VERCEL_TOKEN` pour pouvoir y être branché plus tard,
// quand un secret existera côté CI. Les FONCTIONS pures de ce fichier, elles,
// sont testées (scripts/deploy-fleet-check.test.ts) : la décision se vérifie
// sans réseau, la lecture non.
// ═══════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assetsDuHtml } from './deploy-check.mjs';
import { analyserBundle } from './secret-rules.mjs';

/** Délai par requête : un déploiement qui pend ne doit pas pendre le contrôle. */
export const DELAI_MS = 20_000;

/** Au-delà, on ne lit pas le fichier : on le DIT (même plafond que
 *  `deploy-check.mjs` — un plafond muet produit une réponse fausse). */
export const MAX_OCTETS = 12 * 1024 * 1024;

/** Requêtes simultanées. Assez pour avancer, assez peu pour rester courtois. */
export const PARALLELE = 6;

/**
 * Décode une page de `vercel ls --format json`.
 * FONCTION PURE — testable sans CLI ni réseau.
 * @param {string} sortie stdout de la CLI
 * @returns {{urls: string[], suivant: number|null}}
 */
export function lirePageDeDeploiements(sortie) {
  const json = JSON.parse(sortie);
  const urls = (json.deployments ?? []).map((d) => d.url).filter((u) => typeof u === 'string' && u !== '');
  return { urls, suivant: json.pagination?.next ?? null };
}

/**
 * Énumère TOUS les déploiements du projet lié, page après page.
 *
 * ⚠️ La pagination n'est pas un détail : la CLI rend 20 résultats par défaut,
 * et n'en demander que 20 donnerait un contrôle qui se croit complet. Le parc
 * réel en comptait 166.
 *
 * @param {{exec?: Function, token?: string, limiteParPage?: number, maxPages?: number}} [options]
 * @returns {string[]} URLs de déploiement, dédoublonnées, dans l'ordre reçu
 */
export function listerDeploiements(options = {}) {
  const exec = options.exec ?? execFileSync;
  const token = options.token ?? process.env.VERCEL_TOKEN ?? '';
  const limiteParPage = options.limiteParPage ?? 100;
  const maxPages = options.maxPages ?? 40;

  const tous = [];
  let suivant = null;
  for (let page = 0; page < maxPages; page++) {
    const args = ['ls', '--yes', '--format', 'json', '--limit', String(limiteParPage)];
    if (suivant) args.push('--next', String(suivant));
    if (token) args.push('--token', token);
    const sortie = exec('vercel', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const { urls, suivant: prochain } = lirePageDeDeploiements(String(sortie));
    tous.push(...urls);
    if (!prochain) break;
    suivant = prochain;
  }
  return [...new Set(tous)];
}

/**
 * Regroupe des pages par bundle référencé.
 * FONCTION PURE.
 *
 * Le regroupement est ce qui rend le balayage praticable : deux déploiements
 * qui référencent `assets/index-B77dM799.js` servent le MÊME fichier au bit
 * près (le nom est un hachage de contenu). Le lire deux fois ne dirait rien de
 * plus, et le lire une fois dit tout pour les deux.
 *
 * @param {{url: string, bundle: string|null}[]} pages
 * @returns {Map<string, string[]>} bundle → URLs des déploiements qui le servent
 */
export function grouperParBundle(pages) {
  const parBundle = new Map();
  for (const p of pages) {
    if (!p.bundle) continue;
    if (!parBundle.has(p.bundle)) parBundle.set(p.bundle, []);
    parBundle.get(p.bundle).push(p.url);
  }
  return parBundle;
}

/**
 * Décide du sort du parc. FONCTION PURE — testable sans réseau.
 *
 * ── Pourquoi `resultats` porte un objet et pas une liste de trouvailles ──
 * Un bundle peut être PROPRE, porter une fuite, ou n'avoir pas pu être LU.
 * Ces trois états sont distincts, et les confondre a un coût précis : si
 * « illisible » se rangeait avec « fuite », un réseau capricieux ferait sortir
 * le contrôle en 3 — « une clé est servie » — alors qu'il n'a rien vu du tout.
 * Un contrôle qui crie au loup sur une panne réseau est un contrôle qu'on
 * apprend à ignorer, et le jour où il a raison personne ne le lit.
 *
 * Un bundle SANS entrée dans `resultats` est compté comme illisible, jamais
 * comme propre : une interruption au milieu du balayage ne doit pas pouvoir
 * produire un verdict vert.
 *
 * @param {{url: string, statut: number, bundle: string|null}[]} pages
 * @param {Map<string, {fuites: string[], illisible: string|null}>} resultats
 * @returns {{fuites: {url: string, message: string}[], lues: object[],
 *            illisibles: {url: string, bundle: string, cause: string}[],
 *            sansBundle: object[], nonLues: object[], code: 0|2|3}}
 */
export function verdictDuParc(pages, resultats) {
  const fuites = [];
  const lues = [];
  const illisibles = [];

  for (const p of pages) {
    if (!p.bundle) continue;
    const r = resultats.get(p.bundle);
    for (const message of r?.fuites ?? []) fuites.push({ url: p.url, message });
    if (!r) illisibles.push({ url: p.url, bundle: p.bundle, cause: 'bundle non examiné' });
    else if (r.illisible) illisibles.push({ url: p.url, bundle: p.bundle, cause: r.illisible });
    else lues.push(p);
  }

  const sansBundle = pages.filter((p) => p.statut === 200 && !p.bundle);
  const nonLues = pages.filter((p) => p.statut !== 200);

  // Une fuite prime sur tout : c'est le même arbitrage que `check:prod`, qui
  // refuse d'appeler « divergence de commit » une clé servie en clair. Mais
  // une fuite seulement — pas une adresse qu'on n'a pas réussi à lire.
  const code = fuites.length > 0 ? 3 : lues.length === 0 ? 2 : 0;
  return { fuites, lues, illisibles, sansBundle, nonLues, code };
}

/** Découpe une liste en lots d'au plus `taille` — pour borner la concurrence. */
export function enLots(liste, taille = PARALLELE) {
  const lots = [];
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille));
  return lots;
}

async function lire(url) {
  try {
    const reponse = await fetch(url, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!reponse.ok) return { statut: reponse.status };
    const texte = await reponse.text();
    return { statut: reponse.status, texte };
  } catch {
    // Un échec réseau n'est pas une réponse : statut 0, donc « non lu » et
    // affiché comme tel. Le compter comme propre serait le mensonge à éviter.
    return { statut: 0 };
  }
}

async function main() {
  const explicites = process.argv.slice(2).filter((a) => a.startsWith('http'));

  console.log('\n── Parc ──────────────────────────────────────────────');
  let urls;
  if (explicites.length > 0) {
    urls = explicites;
    console.log(`  liste fournie : ${urls.length} adresse(s)`);
  } else {
    try {
      urls = listerDeploiements();
    } catch (e) {
      console.log('? impossible d’énumérer les déploiements');
      console.log(`  cause : ${String(e?.message ?? e).split('\n')[0]}`);
      console.log('  → la CLI `vercel` doit être installée et authentifiée (`vercel whoami`),');
      console.log('    et le dossier courant lié au projet (`vercel link`).');
      console.log('    Ou passe des URLs en arguments : node scripts/deploy-fleet-check.mjs <url> …');
      console.log('\n── Verdict ───────────────────────────────────────────');
      console.log('  ? Parc NON vérifié — ce n’est pas un succès (code 2).');
      process.exit(2);
    }
    console.log(`  déploiements énumérés : ${urls.length}`);
  }

  if (urls.length === 0) {
    console.log('\n── Verdict ───────────────────────────────────────────');
    console.log('  ? Aucun déploiement à examiner — rien n’a été mesuré (code 2).');
    process.exit(2);
  }

  // 1. La page de chaque déploiement → quel bundle sert-elle ?
  const pages = [];
  for (const lot of enLots(urls)) {
    pages.push(
      ...(await Promise.all(
        lot.map(async (url) => {
          const { statut, texte } = await lire(`https://${url}/`);
          const bundle = statut === 200 ? (assetsDuHtml(texte ?? '')[0] ?? null) : null;
          return { url, statut, bundle };
        })
      ))
    );
  }

  // 2. Chaque bundle distinct est téléchargé et analysé UNE fois.
  const parBundle = grouperParBundle(pages);
  console.log(`  bundles distincts     : ${parBundle.size}`);
  // Un bundle non lu est rangé à part, jamais avec les trouvailles.
  const resultats = new Map();
  for (const lot of enLots([...parBundle.keys()])) {
    const lus = await Promise.all(
      lot.map(async (bundle) => {
        const hote = parBundle.get(bundle)[0];
        const { statut, texte } = await lire(`https://${hote}/${bundle}`);
        if (statut !== 200) return [bundle, { fuites: [], illisible: `HTTP ${statut}` }];
        if ((texte ?? '').length > MAX_OCTETS) {
          return [bundle, { fuites: [], illisible: 'au-dessus du plafond de lecture' }];
        }
        return [bundle, { fuites: analyserBundle(texte, bundle), illisible: null }];
      })
    );
    for (const [bundle, r] of lus) resultats.set(bundle, r);
  }

  const { fuites, lues, illisibles, sansBundle, nonLues, code } = verdictDuParc(
    pages,
    resultats
  );

  console.log('\n── Secrets dans le parc ──────────────────────────────');
  console.log(`  pages lues (avec bundle) : ${lues.length}/${pages.length}`);
  if (sansBundle.length > 0) {
    console.log(`  sans bundle (pages vides) : ${sansBundle.length} — rien à inspecter dedans`);
  }
  if (nonLues.length > 0) {
    console.log(`  non lisibles              : ${nonLues.length} — ces adresses n’ont PAS été vérifiées`);
  }
  if (illisibles.length > 0) {
    console.log(
      `  bundles non lus           : ${illisibles.length} — comptés comme NON vérifiés, pas comme propres`
    );
    for (const i of illisibles.slice(0, 5)) console.log(`    ? ${i.url} → ${i.bundle} (${i.cause})`);
    if (illisibles.length > 5) console.log(`    ? … et ${illisibles.length - 5} autre(s)`);
  }
  for (const f of fuites) console.log(`  ✗ ${f.url} → ${f.message}`);
  if (fuites.length === 0 && lues.length > 0) {
    console.log('  ✓ aucun bundle servi ne porte de valeur de forme secrète');
  }

  console.log('\n── Verdict ───────────────────────────────────────────');
  if (code === 3) {
    const adresses = [...new Set(fuites.map((f) => f.url))];
    console.log(
      `  ✗ ${adresses.length} déploiement(s) servent une valeur de forme secrète — ` +
        'lisible par quiconque connaît l’adresse.'
    );
    console.log(
      '    Révoque la clé chez le fournisseur : retirer le déploiement, la variable ou ' +
        'l’historique ne la dévalide PAS.'
    );
  } else if (code === 2) {
    console.log('  ? Aucune page n’a pu être lue : le parc n’est PAS vérifié (pas un succès).');
  } else {
    console.log(
      `  ✓ ${lues.length} déploiement(s) lus, aucun ne sert de valeur de forme secrète.` +
        (nonLues.length + illisibles.length > 0
          ? ` ${nonLues.length + illisibles.length} non vérifié(s), comptés comme tels.`
          : '')
    );
  }
  process.exit(code);
}

// Le module est importable (scripts/deploy-fleet-check.test.ts vérifie ses
// fonctions pures) : `main()` ne part que s'il est exécuté directement. Sans
// cette garde, importer le fichier lancerait des requêtes réseau et un
// `process.exit` au milieu de la suite de tests.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((erreur) => {
    console.error(`\n✗ Contrôle interrompu : ${erreur?.message ?? erreur}`);
    process.exit(2);
  });
}
