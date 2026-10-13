// outils/verifier-docs.mjs
// ═══════════════════════════════════════════════════════════════════
// Échoue si une page HTML de référence ne correspond plus à son Markdown,
// si la page attendue MANQUE, si elle a été écrite à la main, ou si elle
// survit à la suppression de sa source.
//
// Pourquoi : le dépôt a déjà eu le problème inverse — le même contenu vivant
// en .md ET en .html, sans rien pour garantir qu'ils disaient la même chose.
// Ils avaient divergé. Depuis, les .html sont PRODUITS depuis les .md ; ce
// script est ce qui rend la règle vérifiable au lieu d'être une intention.
//
// Il régénère chaque page en mémoire et la compare OCTET À OCTET à celle qui
// est sur disque. Quatre cas attrapés :
//   - le .md a été modifié sans régénérer le .html (écart) ;
//   - le .html a été retouché à la main (écart) ;
//   - la source contient une construction que le générateur ne rend pas
//     (Markdown brut visible dans la page) ;
//   - et, depuis le 08/10, les trois trous de couverture ci-dessous.
//
// ── Les trois trous que ce fichier ne voyait pas ─────────────────────
// La version précédente ne regardait QUE les .md ayant déjà un .html signé.
// Trois angles morts en découlaient :
//
//   1. **page manquante** — un document de référence neuf dont on oublie de
//      générer la page : rien ne le signalait. C'est pourquoi il existe
//      désormais une liste DÉCLARÉE (`PAGES_ATTENDUES`) : deviner à partir du
//      nom serait faux, le dossier contient des dizaines de .md sans page
//      (notes, veilles, rapports) qui n'en veulent pas.
//   2. **page écrite à la main** — un .html présent mais sans la signature du
//      générateur passait pour inexistant, donc sans contrôle. Il est
//      maintenant refusé : une page de référence non produite dérivera.
//   3. **page orpheline** — un .html signé dont le .md a été supprimé. Il
//      resterait à jamais hors de tout contrôle, avec la signature d'un
//      générateur dont la source n'existe plus.
//
// ── Le quatrième trou : deux langues, un seul document ───────────────
// Depuis le 11/10, un document de référence peut exister en version anglaise
// ET en version française (la fiche d'incident). Le contrôle .md/.html
// ci-dessus n'a rien à dire d'un tel couple : les deux .md sont valides,
// aucun n'a de page, et ils peuvent diverger indéfiniment sans qu'aucune règle
// ne s'en aperçoive. `PAIRES_LANGUES` déclare ces couples, et
// `ecartsDeLangue()` compare ce qui NE SE TRADUIT PAS — empreintes, URL,
// commandes, nombre de sections. Une traduction reformule des phrases ; elle
// n'a pas le droit de changer une empreinte sha256 ni le nom d'une commande.
//
// La langue et le titre ne sont pas recopiés ici : ils sont relus dans le
// .html existant, donc changer un titre ne casse pas la vérification.
//
// ⚠️ Ce contrôle tourne à DEUX endroits, exprès :
//   - en ligne de commande, pour corriger à la main ;
//   - dans `scripts/docs-sync.test.ts`, donc dans `npm test` — une divergence
//     qui arriverait sans qu'on lance le script à la main doit faire échouer la
//     suite de tests, pas attendre qu'on pense à elle.
// La logique est ici et NULLE PART ailleurs : le test importe `auditerDocs()`,
// il ne réécrit pas la comparaison (deux copies d'un même contrôle finissent
// toujours par diverger — c'est le défaut que ce fichier corrige).
//
// Usage :
//   node outils/verifier-docs.mjs          → contrôle (code de sortie 1 si écart)
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { buildHtml } from './md-to-html.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..');

/** Signature présente dans le pied de page des pages GÉNÉRÉES. */
const MARQUE = 'par outils/md-to-html.mjs';

/**
 * Sources de référence qui DOIVENT avoir une page HTML générée, à côté d'elles.
 *
 * ⚠️ Cette liste est la seule partie du fichier à tenir à la main. Elle est
 * délibérément explicite : un document de référence qui n'y figure pas n'est
 * pas surveillé. Quand tu ajoutes un document destiné à être lu dans un
 * navigateur, ajoute-le ICI — sinon sa page pourra manquer sans bruit.
 */
export const PAGES_ATTENDUES = [
  'CHECKLIST-TEST-WALLET-2026-10-08.md',
  'ETAT-APP-2026-10-08-EN.md',
  'ETAT-APP-2026-10-08-FR.md',
  'INVENTAIRE-V1-2026-10-08.md',
  'REVUE-DOCS-REFERENCE-2026-10-08.md',
];

/**
 * Couples source / traduction d'un MÊME document, qui doivent dire la même
 * chose dans les deux langues.
 *
 * ⚠️ Comme `PAGES_ATTENDUES`, cette liste tient à la main : ajouter une
 * traduction sans l'inscrire ici la laisse hors de tout contrôle.
 */
export const PAIRES_LANGUES = [
  ['SECURITY-INCIDENT-2026-10-11.md', 'SECURITY-INCIDENT-2026-10-11-FR.md'],
];

/** Nombre de sections de niveau 2 : c'est la charpente du document. Une
 *  traduction qui perd une section n'est plus une traduction, c'est un résumé. */
export function nombreDeSections(texte) {
  return (String(texte).match(/^##\s+/gm) ?? []).length;
}

/** Trie et dédoublonne une liste de jetons. */
const uniqTri = (xs) => [...new Set(xs)].sort();

/**
 * Les jetons d'un document qui ne se traduisent pas : ce qui est écrit entre
 * accents graves (`comme ceci`) et dans les blocs de code. C'est là que vivent
 * les faits vérifiables — une empreinte, une URL, une commande — et jamais
 * dans la prose : personne n'écrit une empreinte sha256 en pleine phrase.
 *
 * Chercher ces jetons DANS LA PROSE serait un faux positif permanent : le
 * français contient des mots faits uniquement de a–f (« face », « décade »,
 * « effacée »). Se limiter au code rend la comparaison stricte sans la rendre
 * bruyante — un contrôle qui crie au loup finit par être ignoré.
 */
export function jetonsInvariants(texte) {
  const t = String(texte);
  const morceaux = [
    ...[...t.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()),
    ...[...t.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1].trim()),
  ];
  const code = morceaux.join('\n');
  return {
    empreintes: uniqTri(
      morceaux.filter((x) => /^[0-9a-f]{7,}$/i.test(x)).map((x) => x.toLowerCase())
    ),
    urls: uniqTri(
      morceaux.filter((x) => /^https?:\/\//i.test(x)).map((x) => x.replace(/[.,;:]+$/, ''))
    ),
    commandes: uniqTri([
      ...[...code.matchAll(/\bnpm run ([a-z0-9:_-]+)/gi)].map((m) => m[1]),
      ...[...code.matchAll(/\bnpm (test|build)\b/gi)].map((m) => m[1]),
    ]),
  };
}

/**
 * Compare les deux langues d'un même document et rend la liste des écarts.
 *
 * Fonction PURE et exportée pour être testable : un contrôle dont on ne peut
 * pas déclencher l'échec sur un exemple connu ne prouve rien — même exigence
 * que `rpc-endpoint-guard.test.ts`, qui vérifie que son détecteur sait échouer.
 *
 * @returns {string[]} vide si les deux versions concordent.
 */
export function ecartsDeLangue(source, traduction) {
  const a = jetonsInvariants(source);
  const b = jetonsInvariants(traduction);
  const ecarts = [];

  const sa = nombreDeSections(source);
  const sb = nombreDeSections(traduction);
  if (sa !== sb) ecarts.push(`sections : ${sa} dans la source, ${sb} dans la traduction`);

  for (const famille of ['empreintes', 'urls', 'commandes']) {
    const manquants = a[famille].filter((x) => !b[famille].includes(x));
    const enTrop = b[famille].filter((x) => !a[famille].includes(x));
    if (manquants.length > 0) {
      ecarts.push(`${famille} dans la source, absentes de la traduction : ${manquants.join(', ')}`);
    }
    if (enTrop.length > 0) {
      ecarts.push(`${famille} dans la traduction, absentes de la source : ${enTrop.join(', ')}`);
    }
  }

  return ecarts;
}

/** Le .html qui correspond à un .md, par convention de nom. */
const pageDe = (md) => md.replace(/\.md$/, '.html');

/**
 * Paires .md/.html découvertes : un `X.md` et un `X.html` côte à côte, dont le
 * HTML se DÉCLARE généré.
 *
 * ⚠️ La convention de nom seule ne suffit pas : les roadmaps d'août existent
 * en .md et en .html sans que l'un dérive de l'autre (deux documents écrits
 * séparément, à l'époque). Les inclure produirait deux faux positifs — un
 * contrôle qui crie au loup sur des documents sains finit par être ignoré.
 * Seules les pages qui portent la signature du générateur sont comparées.
 */
export function paires() {
  return readdirSync(racine)
    .filter((f) => f.endsWith('.md'))
    .map((md) => ({ md, html: pageDe(md) }))
    .filter(({ html }) => {
      if (!existsSync(join(racine, html))) return false;
      return readFileSync(join(racine, html), 'utf8').includes(MARQUE);
    });
}

/** Toutes les paires à contrôler : celles déclarées + celles découvertes.
 *  La déclaration prime, donc une source déclarée est contrôlée même avant
 *  que sa première page existe (c'est justement le cas « manquante »). */
function pairesAControler() {
  const vues = new Map(paires().map((p) => [p.md, p]));
  for (const md of PAGES_ATTENDUES) {
    if (!vues.has(md)) vues.set(md, { md, html: pageDe(md) });
  }
  return [...vues.values()].sort((a, b) => a.md.localeCompare(b.md));
}

/** Markdown non converti restant dans une page : hors blocs de code, il ne
 *  devrait plus y avoir ni `**`, ni lien non transformé `](`, ni puce brute.
 *  `**` ou `](` peuvent exister légitimement DANS un code inline ou un bloc —
 *  d'où le retrait des zones `<pre>` / `<code>` avant analyse. */
function markdownResiduel(html) {
  const horsCode = html
    .replace(/<pre>[\s\S]*?<\/pre>/g, '')
    .replace(/<code>[\s\S]*?<\/code>/g, '');
  return [
    ...new Set([...horsCode.matchAll(/\*\*|\]\(|^\s*[-*]\s/gm)].map((m) => m[0].trim())),
  ];
}

/**
 * L'audit lui-même, sans décider du sort du processus : il REND le résultat.
 * Un test a besoin de savoir ce qui ne va pas pour l'afficher ; la ligne de
 * commande ci-dessous a besoin de sortir en erreur. Sortir d'ici priverait le
 * second appelant de l'information utile (« quel document, et quoi dedans »).
 *
 * @returns {{ trouvees: {md: string, html: string}[],
 *             ecarts: {md: string, html: string}[],
 *             residus: {md: string, html: string, reste: string[]}[],
 *             manquantes: string[],
 *             nonGeneres: string[],
 *             orphelines: string[],
 *             sourcesAbsentes: string[],
 *             languesDesynchronisees: {source: string, traduction: string, ecarts: string[]}[] }}
 */
export function auditerDocs() {
  const trouvees = pairesAControler();
  const ecarts = [];
  const residus = [];
  const manquantes = [];
  const nonGeneres = [];
  const sourcesAbsentes = [];
  const languesDesynchronisees = [];

  for (const { md, html } of trouvees) {
    const cheminMd = join(racine, md);
    const cheminHtml = join(racine, html);

    // La source déclarée a disparu : c'est la déclaration qui est périmée.
    if (!existsSync(cheminMd)) {
      sourcesAbsentes.push(md);
      continue;
    }
    if (!existsSync(cheminHtml)) {
      manquantes.push(md);
      continue;
    }

    const attendu = readFileSync(cheminHtml, 'utf8');
    // Un .html présent mais NON signé a été écrit à la main : il ne sera
    // jamais régénéré, donc il divergera tôt ou tard.
    if (!attendu.includes(MARQUE)) {
      nonGeneres.push(md);
      continue;
    }

    const lang = /<html lang="([^"]+)"/.exec(attendu)?.[1] ?? 'fr';
    const title = /<title>([^<]*)<\/title>/.exec(attendu)?.[1] ?? 'BuildPact';
    const regenere = buildHtml(readFileSync(cheminMd, 'utf8'), { lang, title, source: md });
    if (regenere !== attendu) ecarts.push({ md, html });
    const reste = markdownResiduel(regenere);
    if (reste.length > 0) residus.push({ md, html, reste });
  }

  // Orphelines : un .html signé dont la source .md n'existe plus.
  const sources = new Set(readdirSync(racine).filter((f) => f.endsWith('.md')));
  const orphelines = readdirSync(racine)
    .filter((f) => f.endsWith('.html'))
    .filter((html) => readFileSync(join(racine, html), 'utf8').includes(MARQUE))
    .filter((html) => !sources.has(html.replace(/\.html$/, '.md')));

  // Parité des langues : deux versions d'un même document doivent porter les
  // mêmes faits. Un couple déclaré dont une moitié manque compte comme un écart
  // — une traduction supprimée laisserait sinon la déclaration dans le vide.
  for (const [source, traduction] of PAIRES_LANGUES) {
    const cheminSource = join(racine, source);
    const cheminTraduction = join(racine, traduction);
    if (!existsSync(cheminSource) || !existsSync(cheminTraduction)) {
      languesDesynchronisees.push({
        source,
        traduction,
        ecarts: ['une des deux versions est introuvable'],
      });
      continue;
    }
    const ecarts = ecartsDeLangue(
      readFileSync(cheminSource, 'utf8'),
      readFileSync(cheminTraduction, 'utf8')
    );
    if (ecarts.length > 0) languesDesynchronisees.push({ source, traduction, ecarts });
  }

  return {
    trouvees,
    ecarts,
    residus,
    manquantes,
    nonGeneres,
    orphelines,
    sourcesAbsentes,
    languesDesynchronisees,
  };
}

// ─── Ligne de commande ──────────────────────────────────────────────
// Uniquement quand CE fichier est lancé directement. Sans cette garde, importer
// `auditerDocs()` depuis un test tuerait le test runner au premier écart — au
// lieu de laisser le test échouer proprement et dire pourquoi.
const lanceDirectement =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (lanceDirectement) {
  const r = auditerDocs();
  const {
    trouvees,
    ecarts,
    residus,
    manquantes,
    nonGeneres,
    orphelines,
    sourcesAbsentes,
    languesDesynchronisees,
  } = r;

  if (trouvees.length === 0) {
    console.error(
      '✗ aucune page générée trouvée (aucun .html ne porte la signature du générateur) — ' +
        'soit les pages ont été écrites à la main, soit la signature a changé.'
    );
    process.exit(1);
  }

  let echec = false;

  if (ecarts.length > 0) {
    echec = true;
    console.error('✗ document(s) désynchronisé(s) — le .html ne reflète plus le .md :\n');
    for (const { md, html } of ecarts) {
      const lang = /FR\.md$/.test(md) ? 'fr' : 'en';
      console.error(`  ${md}  →  ${html}`);
      console.error(`     corriger : node outils/md-to-html.mjs "${md}" "${html}" ${lang} "<titre>"\n`);
    }
  }

  if (manquantes.length > 0) {
    echec = true;
    console.error('✗ document(s) de référence SANS page HTML :\n');
    for (const md of manquantes) {
      const lang = /FR\.md$/.test(md) ? 'fr' : 'en';
      console.error(`  ${md}  →  ${pageDe(md)} absent`);
      console.error(`     corriger : node outils/md-to-html.mjs "${md}" "${pageDe(md)}" ${lang} "<titre>"\n`);
    }
  }

  if (nonGeneres.length > 0) {
    echec = true;
    console.error('✗ page(s) HTML présente(s) mais NON produite(s) par le générateur :\n');
    for (const md of nonGeneres) {
      console.error(`  ${pageDe(md)}  (source : ${md})`);
      console.error('     une page écrite à la main ne sera jamais régénérée → elle divergera.\n');
    }
  }

  if (orphelines.length > 0) {
    echec = true;
    console.error('✗ page(s) HTML générée(s) dont la source .md a disparu :\n');
    for (const html of orphelines) {
      console.error(`  ${html}  →  ${pageDe(html).replace(/\.html$/, '.md')} introuvable`);
      console.error('     soit restaurer la source, soit supprimer la page.\n');
    }
  }

  if (sourcesAbsentes.length > 0) {
    echec = true;
    console.error('✗ source(s) déclarée(s) dans PAGES_ATTENDUES mais introuvable(s) :\n');
    for (const md of sourcesAbsentes) {
      console.error(`  ${md} — retirer l'entrée de PAGES_ATTENDUES si le document a été retiré.\n`);
    }
  }

  if (residus.length > 0) {
    echec = true;
    console.error('✗ Markdown non converti dans la page produite — la source utilise une\n' +
      '  construction que le générateur ne sait pas encore rendre :\n');
    for (const { md, html, reste } of residus) {
      console.error(`  ${md}  →  ${html}   reste : ${reste.map((r) => JSON.stringify(r)).join(', ')}`);
    }
    console.error('\n  corriger la source, ou étendre la conversion dans outils/md-to-html.mjs, puis régénérer.\n');
  }

  if (languesDesynchronisees.length > 0) {
    echec = true;
    console.error('✗ traduction(s) désynchronisée(s) — les deux versions d’un même document\n' +
      '  ne portent plus les mêmes faits (empreintes, URL, commandes, sections) :\n');
    for (const { source, traduction, ecarts } of languesDesynchronisees) {
      console.error(`  ${source}  ⇄  ${traduction}`);
      for (const e of ecarts) console.error(`     · ${e}`);
      console.error('     corriger la traduction (jamais l’original pour faire taire ce contrôle).\n');
    }
  }

  if (echec) process.exit(1);

  const paires = PAIRES_LANGUES.length;
  console.log(
    `✓ ${trouvees.length} page(s) vérifiée(s) — synchronisées, présentes et produites par le générateur : ` +
      trouvees.map((p) => p.html).join(', ')
  );
  if (paires > 0) {
    console.log(
      `✓ ${paires} paire(s) de langues vérifiée(s) — même charpente, mêmes empreintes, ` +
        `mêmes URL, mêmes commandes de part et d'autre.`
    );
  }
}
