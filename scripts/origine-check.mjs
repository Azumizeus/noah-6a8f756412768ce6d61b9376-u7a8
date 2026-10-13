// scripts/origine-check.mjs
// ═══════════════════════════════════════════════════════════════════
// « La production a-t-elle été CONSTRUITE à partir d'un commit ? »
//
// Usage : node scripts/origine-check.mjs
//         npm run check:origine
//
// ── Pourquoi ce fichier existe ─────────────────────────────────────
// Le 11/10/2026, la production Vercel a été mise à jour par un envoi
// `vercel --prod` fait à la main (`source: cli`). Le dépôt était vert, la
// production était propre, `check:prod` était vert lui aussi : il compare le
// commit SERVI au commit du dépôt, et les deux portaient le même `2cc9d23`.
// Rien dans le dépôt ne pouvait voir la différence.
//
// C'est une différence qui compte : une livraison faite à la main n'est pas
// reproductible. Personne ne peut dire de quel arbre exact elle est née, ni la
// reconstruire, ni la relire en diff. « Chaque envoi construit depuis un commit
// connu » n'est donc pas une intention, c'est une propriété qui se MESURE — et
// sans ce contrôle-ci, elle ne se mesurait pas.
//
// ── Ce qu'il interroge, et pourquoi pas le HTML servi ──────────────
// `check:prod` lit l'adresse publique ; ce fichier-ci lit l'API des
// déploiements, parce que la provenance (`source`) n'apparaît nulle part dans
// les octets servis. C'est une deuxième source, pas un doublon.
//
// ── Codes de sortie (mêmes conventions que `check:prod`) ───────────
//   0 = la production courante vient de Git, et du commit attendu ;
//   1 = elle vient de Git, mais pas du commit attendu (divergence) ;
//   2 = impossible de conclure (jeton absent, API injoignable). Ce n'est PAS
//       un succès : un contrôle qui n'a rien lu ne doit pas ressembler à un
//       contrôle qui a validé ;
//   3 = elle ne vient PAS de Git : publiée à la main, ou sans commit
//       identifiable. C'est le cas GRAVE — même RÔLE que le code 3 de
//       `check:prod` (celui qui arrête le job), sur un autre sujet. La
//       distinction avec le code 1 n'est pas cosmétique : une production en
//       retard sur le dépôt est NORMALE (un push vient d'arriver), une
//       production publiée à la main ne l'est pas. Les confondre ferait
//       crier au loup chaque matin, donc ignorer les deux.
//
// ── Ce qu'il n'affiche jamais ──────────────────────────────────────
// Le jeton. Il est lu dans l'environnement, ou dans l'authentification que la
// CLI Vercel a déjà posée sur cette machine, passé dans l'en-tête, et jamais
// imprimé — même en cas d'erreur.
// ═══════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Lit le premier fichier d'authentification CLI qui existe, ou null. */
function lireAuthCli() {
  for (const chemin of cheminsAuthCli()) {
    try {
      if (existsSync(chemin)) return readFileSync(chemin, 'utf8');
    } catch {
      // Chemin illisible : on essaie le suivant. Aucun nom de fichier ni
      // contenu n'est journalisé — ce fichier porte un jeton.
    }
  }
  return null;
}

/** Délai de lecture : une API qui pend ne doit pas pendre le contrôle. */
export const DELAI_MS = 20_000;

/**
 * Emplacements de l'authentification que la CLI Vercel pose après `vercel login`.
 * macOS d'abord, puis Linux — les deux seuls systèmes où ce dépôt est utilisé.
 */
export function cheminsAuthCli(home = process.env.HOME ?? '') {
  if (!home) return [];
  return [
    `${home}/Library/Application Support/com.vercel.cli/auth.json`,
    `${home}/.local/share/com.vercel.cli/auth.json`,
  ];
}

/**
 * Le jeton Vercel : l'environnement d'abord, puis l'authentification de la CLI.
 * FONCTION PURE — testable sans disque ni réseau.
 *
 * ── Pourquoi ce repli ──────────────────────────────────────────────
 * `check:parc` passe par la CLI, qui lit son propre jeton ; ce contrôle-ci
 * parle à l'API directement. Sans repli, l'un tournait dès l'installation et
 * l'autre exigeait de préfixer la commande par `VERCEL_TOKEN=…` — deux
 * contrôles voisins, deux modes d'emploi. Le jour où l'un des deux est
 * planifié, c'est celui-là qui tombe en « non vérifié » sans qu'on sache
 * pourquoi.
 *
 * L'environnement reste PRIORITAIRE : c'est ce qui permet à la CI de viser un
 * jeton de dépôt sans jamais dépendre de ce qui traîne sur la machine.
 *
 * @param {Record<string, string|undefined>} env
 * @param {string|null} contenuAuthCli contenu de `auth.json`, ou null
 * @returns {string} le jeton, ou une chaîne vide si aucun n'est disponible
 */
export function jetonVercel(env, contenuAuthCli) {
  const direct = String(env?.VERCEL_TOKEN ?? '').trim();
  if (direct) return direct;
  if (!contenuAuthCli) return '';
  try {
    return String(JSON.parse(contenuAuthCli)?.token ?? '').trim();
  } catch {
    // Un fichier d'authentification illisible ne doit pas faire échouer le
    // contrôle : on retombe sur « aucun jeton », donc code 2, jamais code 0.
    return '';
  }
}

/**
 * Identifiants du projet, si ni l'environnement ni `.vercel/project.json` ne
 * les donnent.
 *
 * Pourquoi des valeurs en dur : `.vercel/` est ignoré par git, donc absent en
 * CI, et un contrôle qui refuse de tourner faute d'un identifiant non secret
 * est un contrôle qui ne tourne jamais. Ces deux valeurs sont déjà publiques
 * par construction (elles identifient le projet qui sert l'adresse publique
 * `buildpact-solana.vercel.app`, elle-même en dur dans `deploy-check.mjs`).
 * L'environnement reste prioritaire, pour pouvoir viser un autre projet.
 */
export const PROJET_PAR_DEFAUT = {
  projectId: 'prj_pW0JP94mt1sW0hwWPJdsdq6r62NU',
  orgId: 'team_IVVSmPHwB38P3WyhYzTixOZl',
};

/**
 * Résout `{ projectId, orgId }` : environnement, puis fichier lié, puis défaut.
 * FONCTION PURE — testable sans disque ni réseau.
 *
 * @param {Record<string, string|undefined>} env
 * @param {string|null} contenuProjetJson contenu de `.vercel/project.json`
 */
export function identiteProjet(env, contenuProjetJson) {
  let fichier = {};
  if (contenuProjetJson) {
    try {
      fichier = JSON.parse(contenuProjetJson) ?? {};
    } catch {
      // Un fichier illisible ne doit pas faire échouer le contrôle : on
      // retombe sur le défaut, et le nom du fichier n'est pas une donnée
      // sensible — seul son CONTENU l'aurait été s'il était valide.
      fichier = {};
    }
  }
  return {
    projectId:
      String(env?.VERCEL_PROJECT_ID ?? '').trim() || fichier.projectId || PROJET_PAR_DEFAUT.projectId,
    orgId: String(env?.VERCEL_ORG_ID ?? '').trim() || fichier.orgId || PROJET_PAR_DEFAUT.orgId,
  };
}

/**
 * Le déploiement de production qui sert ACTUELLEMENT le domaine.
 *
 * FONCTION PURE. C'est le plus récent `READY` visant `production` : un
 * déploiement en cours (`BUILDING`), annulé (`CANCELED`) ou bloqué (`BLOCKED`)
 * ne sert rien, et un aperçu (`preview`) ne sert pas la production — le prendre
 * pour la production ferait porter le verdict sur une page que personne ne voit.
 *
 * @param {Array<{target?: string, readyState?: string, created?: number}>} deployments
 */
export function choisirProduction(deployments) {
  const candidats = (deployments ?? []).filter(
    (d) => d && d.target === 'production' && d.readyState === 'READY'
  );
  if (candidats.length === 0) return null;
  return candidats.reduce((a, b) => ((b.created ?? 0) > (a.created ?? 0) ? b : a));
}

/**
 * Le verdict. FONCTION PURE — testable sans réseau.
 *
 * ── Pourquoi la provenance prime sur la concordance ──
 * Un déploiement fait à la main peut porter le BON commit : c'est exactement ce
 * qui s'est produit le 11/10 (`source: cli`, commit `2cc9d23`, celui du dépôt).
 * Comparer les commits aurait dit « synchronisé » sur une livraison non
 * reproductible. On refuse donc d'abord la main-mise, ensuite on regarde le
 * commit.
 *
 * @param {object|null} deploiement déploiement de production retenu
 * @param {{shaAttendu?: string}} [options]
 */
export function verdictOrigine(deploiement, options = {}) {
  const shaAttendu = String(options.shaAttendu ?? '').trim();

  if (!deploiement) {
    return {
      code: 2,
      titre: 'aucun déploiement de production lisible — rien n’a été vérifié (code 2)',
      action:
        'Vérifie que le projet Vercel existe toujours et que le jeton a le droit de lire ses déploiements.',
      faits: [],
    };
  }

  const source = String(deploiement.source ?? '').trim() || 'inconnue';
  const sha = String(deploiement.meta?.githubCommitSha ?? '').trim();
  const auteur = String(deploiement.meta?.githubCommitAuthorLogin ?? '').trim();
  const faits = [
    ['source', source],
    ['commit', sha ? sha.slice(0, 7) : '—'],
    ['auteur', auteur || '—'],
    ['créé', deploiement.created ? new Date(deploiement.created).toISOString() : '—'],
  ];

  if (source !== 'git') {
    return {
      code: 3,
      titre: `la production ne vient pas d’un commit : elle a été publiée à la main (source « ${source} »)`,
      action:
        'Pousse sur `main` pour que Vercel reconstruise depuis Git, puis cesse d’utiliser ' +
        '`vercel --prod` : une livraison faite à la main n’est ni reproductible, ni relisable en diff.',
      faits,
    };
  }

  if (!sha) {
    return {
      code: 3,
      titre: 'déploiement Git sans commit associé — provenance incomplète',
      action: 'Redéploie depuis Git : un déploiement Git porte toujours le SHA dont il est né.',
      faits,
    };
  }

  // Comparaison tolérante à la longueur : `df908f4` (court) contre un SHA
  // complet désignent le même commit.
  const concorde = sha.startsWith(shaAttendu) || shaAttendu.startsWith(sha.slice(0, 7));
  if (shaAttendu && !concorde) {
    return {
      code: 1,
      titre: `la production vient d’un commit, mais pas du commit attendu (${sha.slice(0, 7)} au lieu de ${shaAttendu})`,
      action: 'Pousse le commit attendu, ou vérifie sur quelle branche Vercel construit la production.',
      faits,
    };
  }

  return {
    code: 0,
    titre: `la production a été construite par Git depuis le commit ${sha.slice(0, 7)}`,
    action: null,
    faits,
  };
}

/** `git …` ou `null` — jamais d'exception pour un dépôt absent. */
function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

async function main() {
  const token = jetonVercel(process.env, lireAuthCli());
  const contenu =
    existsSync('.vercel/project.json') ? readFileSync('.vercel/project.json', 'utf8') : null;
  const { projectId, orgId } = identiteProjet(process.env, contenu);

  // Le commit attendu : le HEAD local, ou la branche de base sur une pull
  // request (la prod ne peut pas déjà servir la PR non fusionnée) — même
  // convention que `deploy-check.mjs`.
  const expectRef = String(process.env.PROD_EXPECT_SHA ?? '').trim();
  const shaAttendu = (
    (expectRef ? sh(`git rev-parse --short=7 ${expectRef}`) : null) ??
    sh('git rev-parse --short=7 HEAD') ??
    ''
  ).trim();

  console.log('\n── Provenance de la production ───────────────────────');
  console.log(`  projet : ${projectId}`);

  if (!token) {
    console.log('? jeton Vercel absent — lecture des déploiements impossible');
    console.log('  → renseigne VERCEL_TOKEN (variable d’environnement ou secret de dépôt),');
    console.log('    ou connecte la CLI sur cette machine (`vercel login`) : ce contrôle lit');
    console.log('    alors le jeton qu’elle a déjà posé, sans rien exporter à la main.');
    console.log('\n── Verdict ───────────────────────────────────────────');
    console.log('  ? NON VÉRIFIÉ — ce n’est pas un succès (code 2).');
    process.exit(2);
  }

  let deployments;
  try {
    const url =
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}` +
      `&teamId=${encodeURIComponent(orgId)}&limit=40`;
    const reponse = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const json = await reponse.json();
    if (json.error) throw new Error(`${json.error.code ?? '?'} — ${json.error.message ?? ''}`);
    deployments = json.deployments ?? [];
  } catch (e) {
    // Seule la première ligne du message : une erreur d'API peut recopier la
    // requête, et la requête ne contient pas le jeton — mais on n'en imprime
    // jamais plus que nécessaire.
    console.log(`? lecture impossible (${String(e?.message ?? e).split('\n')[0]})`);
    console.log('  → provenance NON vérifiée : ce n’est pas un succès (code 2).');
    process.exit(2);
  }

  const prod = choisirProduction(deployments);
  const verdict = verdictOrigine(prod, { shaAttendu });

  for (const [cle, valeur] of verdict.faits) console.log(`  ${cle.padEnd(7)} : ${valeur}`);

  console.log('\n── Verdict ───────────────────────────────────────────');
  const marque = verdict.code === 0 ? '✓' : verdict.code === 2 ? '?' : '✗';
  console.log(`  ${marque} ${verdict.titre}`);
  if (verdict.action) console.log(`    ${verdict.action}`);
  process.exit(verdict.code);
}

// Importable par les tests : `main()` ne part que si le fichier est exécuté.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((erreur) => {
    console.error(`\n✗ Contrôle interrompu : ${erreur?.message ?? erreur}`);
    process.exit(2);
  });
}
