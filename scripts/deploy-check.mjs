// scripts/deploy-check.mjs
// ═══════════════════════════════════════════════════════════════════
// « La prod sert-elle le code du dépôt — et sans secret dedans ? »
//
// Usage : node scripts/deploy-check.mjs [url]
//         npm run check:prod
//
// Deux questions, deux mécanismes.
//
// ── 1. Le code servi est-il celui du dépôt ? ──
// Ce que ça résout concrètement : un déploiement qui échoue, un projet Vercel
// non branché sur le dépôt, ou un push fait pendant qu'un autre déploiement
// tournait — la prod reste alors sur un build antérieur pendant que le dépôt
// avance. Rien dans le dépôt ne le montre, et sans accès au tableau de bord la
// divergence est invisible. Le build porte donc un tampon
// <meta name="build-commit"> (vite.config.ts), comparé au commit attendu.
//
// ── 2. La livraison contient-elle une clé en clair ? ──
// Ajouté le 11/10/2026, sur une mesure : le dépôt était irréprochable
// (2 433 objets interrogés, aucun secret), le code ne lisait plus la variable
// d'endpoint — et la production servait pourtant une clé d'API Helius en
// clair, lisible par n'importe quel visiteur. Ce contrôle ne regardait que le
// commit : il était vert. Il lit désormais AUSSI le contenu des bundles servis.
//
// Les règles de détection sont celles du dépôt entier
// (`scripts/secret-rules.mjs` → `analyserBundle`) : un motif écrit une fois,
// calibré sur les bundles réels pour ne pas crier à tort. Aucune valeur n'est
// jamais affichée — empreinte sha256 et longueur seulement, comme l'audit
// d'historique.
//
// INFORMATIF pour la divergence : en CI, un écart de commit ne bloque pas le
// merge (voir ci.yml) — une prod peut légitimement être en retard. La fuite de
// clé, elle, ARRÊTE le job : une clé exposée n'est pas un retard.
//
// Codes de sortie : 0 = synchro et propre · 1 = divergence de commit ·
//                   2 = indéterminable · 3 = clé en clair dans la livraison.
// ═══════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { analyserBundle } from './secret-rules.mjs';

/** Au-delà, on ne lit pas le fichier servi : on le DIT au lieu de le sauter
 *  en silence (un plafond muet produit une réponse fausse, pas partielle). */
const MAX_OCTETS = 12 * 1024 * 1024;

/** Délai par requête : un site qui pend ne doit pas pendre la CI. */
const DELAI_MS = 20_000;

/**
 * Les bundles JavaScript référencés par le HTML servi.
 * FONCTION PURE — testable sans réseau.
 * @param {string} html page servie
 * @returns {string[]} chemins `/assets/…js`, dédoublonnés, dans l'ordre
 */
export function assetsDuHtml(html) {
  return [...new Set([...String(html).matchAll(/\/assets\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0]))];
}

async function main() {
  // Une variable d'environnement absente arrive en chaîne vide en CI : on traite
  // donc '' comme « non défini » pour retomber sur l'URL par défaut.
  const URL =
    (process.argv[2] ?? '').trim() ||
    (process.env.PROD_URL ?? '').trim() ||
    'https://buildpact-solana.vercel.app';

  function sh(cmd) {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return null;
    }
  }

  const localSha = sh('git rev-parse --short=7 HEAD');
  // Commit censé être en prod. Par défaut le HEAD local ; en CI sur une pull
  // request, la prod ne peut PAS servir le commit de la PR (pas encore fusionné),
  // on vise donc la branche de base (main) via PROD_EXPECT_SHA.
  const expectRef = (process.env.PROD_EXPECT_SHA ?? '').trim();
  const expectedSha = (expectRef ? sh(`git rev-parse --short=7 ${expectRef}`) : null) ?? localSha;
  const expectLabel = expectRef
    ? `attendu ${expectedSha ?? '?'} (réf ${expectRef.slice(0, 7)})`
    : `attendu ${expectedSha ?? '?'}`;
  // « Arbre sale » au sens utile = des fichiers SUIVIS modifiés : eux seuls
  // changent ce qui serait déployé. Les fichiers NON suivis (dist/, target/,
  // dossiers de travail locaux) ne partent jamais en prod — et comme `dist` est
  // produit par le build local, les signaler ferait sonner l'alerte à chaque
  // exécution, donc plus personne ne la lirait. Même convention que
  // scripts/purge-*-from-history.sh.
  const dirty = (sh('git status --porcelain --untracked-files=no') ?? '') !== '';
  const branch = sh('git rev-parse --abbrev-ref HEAD');

  console.log(`\n── Local ─────────────────────────────────────────────`);
  console.log(`  commit : ${localSha ?? 'introuvable (pas un dépôt git ?)'}${branch ? ` (${branch})` : ''}`);
  if (expectedSha && expectedSha !== localSha) console.log(`  cible  : ${expectLabel}`);
  if (dirty) {
    console.log(
      `  ⚠ fichiers suivis modifiés — ces changements ne peuvent pas être en prod, la comparaison porte sur le commit, pas sur ton arbre local`
    );
  }

  // ─── Rapport Markdown (résumé GitHub Actions) ──────────────────────
  const rows = [
    ['URL cible', URL],
    ['Production sert', '—'],
    ['Dépôt attendu', expectedSha ? `\`${expectedSha}\`${branch ? ` (${branch})` : ''}` : '—'],
    ['Bundle prod', '—'],
  ];

  function writeSummary(code, title, action) {
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (!path) return;
    const badge =
      code === 0
        ? '✅ synchronisé'
        : code === 1
          ? '⚠️ divergence'
          : code === 3
            ? '🚨 clé en clair dans la livraison'
            : '❔ indéterminable';
    const headEmoji = code === 0 ? '✅' : code === 1 ? '⚠️' : code === 3 ? '🚨' : '❔';
    const lines = [
      `## ${headEmoji} Contrôle production ↔ dépôt`,
      '',
      `**Verdict : ${badge}**`,
      '',
      '| | |',
      '| --- | --- |',
      ...rows.map(([k, v]) => `| ${k} | ${v} |`),
      '',
      code === 0
        ? `_${title}_`
        : `> ${title}${action ? `\n>\n> **Action :** ${action}` : ''}`,
      '',
    ];
    try {
      appendFileSync(path, lines.join('\n') + '\n');
    } catch {
      /* pas de résumé disponible — non bloquant */
    }
  }

  function finish(code, title, action) {
    const badge = code === 0 ? '✓' : code === 1 ? '✗' : code === 3 ? '✗' : '?';
    console.log(`\n── Verdict ───────────────────────────────────────────`);
    console.log(`  ${badge} ${title}`);
    if (action) console.log(`    ${action}`);
    writeSummary(code, title, action);
    process.exit(code);
  }

  let html;
  try {
    const res = await fetch(URL, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!res.ok) {
      rows[1] = ['Réponse', `HTTP ${res.status}`];
      console.error(`\n✗ ${URL} → HTTP ${res.status} : impossible de lire la prod.`);
      finish(2, `La production n'a pas répondu (HTTP ${res.status}).`, "Vérifie que l'URL est correcte et le site en ligne.");
    }
    html = await res.text();
  } catch (e) {
    rows[1] = ['Réponse', 'injoignable'];
    console.error(`\n✗ ${URL} injoignable : ${e.message}`);
    finish(2, `La production est injoignable (${e.message}).`, 'Contrôle réseau/URL — ce n’est pas une divergence de code.');
  }

  const stamp = html.match(/<meta\s+name="build-commit"\s+content="([^"]+)"/)?.[1] ?? null;
  const asset = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? null;

  console.log(`\n── Prod (${URL}) ────────────────────────────────`);
  console.log(`  commit : ${stamp ?? 'aucun tampon (build antérieur au tampon de commit)'}`);
  console.log(`  bundle : ${asset ?? 'introuvable'}`);
  rows[1] = ['Production sert', stamp ? `\`${stamp}\`` : 'aucun tampon de commit'];
  rows[3] = ['Bundle prod', asset ? `\`${asset}\`` : 'introuvable'];

  // Comparaison informative avec un build local déjà présent : deux builds du
  // même code produisent le même nom de fichier (contenu haché).
  const distDir = 'dist/assets';
  if (asset && existsSync(distDir)) {
    const localAssets = readdirSync(distDir).filter((f) => /^index-.*\.js$/.test(f));
    if (localAssets.length > 0) {
      const localAsset = `assets/${localAssets[0]}`;
      console.log(`  local  : ${localAsset}`);
      rows.push(['Bundle local (ce dossier)', `\`${localAsset}\``]);
      if (localAsset !== asset) {
        console.log(`  → les bundles diffèrent : la prod n'a pas été construite depuis ce dossier`);
        rows.push(['Bundles', '⚠️ différents']);
      }
    }
  }

  // ─── La livraison porte-t-elle un secret en clair ? ────────────────
  // Avant la comparaison de commit : une clé exposée n'est pas un retard de
  // déploiement, c'est une fuite — elle passe au premier plan.
  const base = URL.replace(/\/$/, '');
  const chemins = assetsDuHtml(html);
  const fuites = [];
  const illisibles = [];
  let lus = 0;

  for (const chemin of chemins) {
    try {
      const rep = await fetch(base + chemin, {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!rep.ok) {
        illisibles.push(`${chemin} (HTTP ${rep.status})`);
        continue;
      }
      const texte = await rep.text();
      if (texte.length > MAX_OCTETS) {
        illisibles.push(`${chemin} (${(texte.length / 1024 / 1024).toFixed(1)} Mio > plafond)`);
        continue;
      }
      lus += 1;
      fuites.push(...analyserBundle(texte, `prod${chemin}`));
    } catch (e) {
      illisibles.push(`${chemin} (${e.message})`);
    }
  }
  fuites.push(...analyserBundle(html, 'prod /index.html'));

  console.log(`\n── Secrets dans la livraison ─────────────────────────`);
  console.log(`  bundles lus : ${lus}/${chemins.length}${illisibles.length > 0 ? ` — non lus : ${illisibles.join(', ')}` : ''}`);
  if (chemins.length === 0) {
    console.log(`  ⚠ la page servie ne référence aucun bundle : rien à inspecter`);
  }
  for (const f of fuites) console.log(`  ✗ ${f}`);
  if (fuites.length === 0) console.log(`  ✓ aucune valeur de forme secrète dans ce qui est servi`);
  rows.push(['Secrets servis en clair', fuites.length === 0 ? '✅ aucun' : `🚨 **${fuites.length}**`]);
  for (const f of fuites) rows.push(['↳', `\`${f}\``]);

  if (fuites.length > 0) {
    finish(
      3,
      `La production sert ${fuites.length} valeur(s) de forme secrète en clair — dont une clé d'API lisible par tout visiteur.`,
      "Révoque la clé chez le fournisseur (une purge d'historique, une suppression de variable ou un redéploiement ne la dévalide PAS), puis redéploie depuis le dépôt propre pour retirer l'endpoint du bundle."
    );
  }

  if (stamp && expectedSha && stamp === expectedSha) {
    finish(0, `La production sert ${stamp}, identique à ${expectRef ? `la cible ${expectedSha}` : 'au HEAD local'}, et sans secret en clair.`);
  }

  if (!stamp) {
    finish(
      1,
      "La production ne porte aucun tampon de commit : elle est forcément plus ancienne que ce dépôt.",
      `Redéploie ${expectedSha ?? 'le commit courant'} sur Vercel (Deployments → Redeploy) puis relance ce contrôle.`,
    );
  }

  const age = sh(`git rev-list --count ${stamp}..HEAD`);
  const detail = age
    ? `${age} commit(s) d'avance sur la prod.`
    : `${stamp} n'est pas un commit connu de ce dépôt (build fait ailleurs ?).`;
  finish(
    1,
    `Écart : la prod sert ${stamp}, ${branch ?? 'la branche locale'} est à ${localSha ?? '?'}${expectedSha && expectedSha !== localSha ? ` (cible ${expectedSha})` : ''} — ${detail}`,
    'Redéploie le commit attendu sur Vercel, ou vérifie que le projet Vercel est bien branché sur ce dépôt.',
  );
}

// Le script est importable (scripts/deploy-check.test.ts vérifie ses fonctions
// pures) : `main()` ne part que s'il est exécuté directement. Sans cette garde,
// importer le module déclencherait des requêtes réseau et un `process.exit`.
const invoqueDirectement =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invoqueDirectement) {
  main().catch((err) => {
    console.error(`\n✗ Contrôle interrompu : ${err?.message ?? err}`);
    process.exit(2);
  });
}
