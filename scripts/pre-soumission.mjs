// scripts/pre-soumission.mjs
// ═══════════════════════════════════════════════════════════════════
// « L'endpoint RPC principal répond-il VRAIMENT ? »
//
// Usage : npm run check:soumission
//         node scripts/pre-soumission.mjs [--endpoint=<url>]
//
// À lancer AVANT de déposer : c'est le seul contrôle qui parte de
// l'endpoint réel de l'application (le relais Edge) et pas d'un nœud
// public de secours. Les autres scripts (`rpc-check`, `idl-check`)
// interrogent le devnet public et peuvent donc réussir pendant que
// l'application, elle, tourne sur le repli.
//
// ── Pourquoi TROIS sondes, et dans cet ordre ────────────────────────
//  1. `getVersion` — l'endpoint rend-il du JSON-RPC 2.0 ? C'est ici que
//     tombe le cas mesuré le 11/10/2026 : fonction Edge non déployée →
//     404 → repli devnet public, silencieusement côté navigateur.
//  2. `getProgramAccounts` — l'appel qui liste TOUS les pacts. C'est
//     celui que Helius bridait (-32401, voir READ_RPC_ENDPOINTS dans
//     src/lib/constants.ts) et celui qui décide si `#/pacts` affiche
//     « 0 pact(s) » ou six lignes. Un endpoint qui répond à getVersion
//     et refuse celui-là passe toutes les vérifications naïves
//     (« le RPC répond ») tout en cassant la moitié de l'application.
//  3. le PRÉ-VOL CORS — ce que `fetch` envoie depuis un navigateur. Le cas
//     mesuré le 12/10/2026 : le relais répondait 200 à `curl` ET à ce
//     script, mais `Access-Control-Allow-Headers` ne listait pas
//     `solana-client` — un en-tête que `@solana/web3.js` pose sur chaque
//     requête. Le navigateur faisait donc échouer le pré-vol
//     (« TypeError: Failed to fetch »), l'app basculait sur le devnet
//     public, et aucune sonde lancée en Node ne pouvait le voir : sans
//     navigateur, il n'y a pas de pré-vol. Cette troisième sonde est
//     l'unique endroit où le contrôle ressemble au client réel.
//
// ── Ce que le script ne fait pas ────────────────────────────────────
// Il n'écrit rien, n'envoie aucune transaction et ne demande aucune clé
// privée. Il ne lit jamais un endpoint dans une variable `VITE_RPC_*` :
// l'application ne le fait plus (délibérément, cf. constants.ts), et un
// contrôle qui interrogerait un autre endpoint que l'app ne prouverait
// rien. Toutes les URL affichées passent par `masquerEndpoint()` : le
// rapport peut être collé dans un ticket ou montré au jury sans publier
// un `?api-key=`.
//
// ── Codes de sortie ────────────────────────────────────────────────
//   0 = les trois sondes passent (dont le pré-vol CORS) et le programme
//       détient des comptes
//   1 = à corriger — NE PAS DÉPOSER (le rapport dit quoi faire) : une sonde
//       échoue, ou un fichier d'environnement local déclare un endpoint
//       `VITE_` — la valeur repartirait en clair dans le bundle livré
//   2 = indéterminable (configuration illisible : aucun endpoint,
//       programme absent du code ou de l'IDL)
//
// INFORMATIF pour le reste : le repli (devnet public) est sondé à la
// fin. Il ne change PAS le code de sortie — il sert à savoir ce que
// l'application fera si le principal tombe.
// ═══════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { construireUrlProxy } from '../src/lib/rpcProxy.ts';
import { masquerEndpoint } from '../src/lib/rpcMask.ts';
import { classerReponse } from '../src/lib/rpcHealth.ts';

/** Fichiers d'environnement lus, dans cet ordre (le premier gagne). */
export const FICHIERS_ENV = ['.env.local', '.env'];

/**
 * Motif d'un endpoint de nœud déclaré dans un fichier d'environnement.
 *
 * Volontairement large : le risque tient au NOM, pas à la valeur. Vite
 * incruste en clair, dans le JavaScript livré, la valeur de toute variable
 * `VITE_` qu'il évalue au build — donc `VITE_RPC_URL`, `VITE_HELIUS_URL`,
 * `VITE_DEVNET_URL`… valent `VITE_RPC_ENDPOINT`.
 *
 * `RPC_URL` sans préfixe `VITE_` n'est PAS visé : il n'est lu que par les
 * scripts de vérification, jamais par le bundle.
 */
const DECLARATION_ENDPOINT = /(^|\n)\s*(VITE_[A-Z0-9_]*(RPC|HELIUS|SOLANA|DEVNET)[A-Z0-9_]*)\s*=/i;

/**
 * Les fichiers d'environnement locaux qui DÉCLARENT un endpoint `VITE_`.
 *
 * FONCTION PURE : l'appelant fournit le contenu, donc le test peut prouver
 * que le détecteur SAIT refuser sans écrire de fichier sur le disque.
 *
 * Pourquoi c'est un REFUS et non une note. Le 11/10/2026, mesuré : le code
 * avait cessé de lire cette variable (commit `80a48da`) et `dist/` sortait
 * propre — deux contrôles verts —, pendant que la production servait la clé
 * Helius en clair dans son bundle, recopiée par Vite depuis la variable
 * restée posée. Une déclaration qu'on ne lit plus n'est pas inerte : elle
 * attend. Ce contrôle la refuse AVANT la soumission, là où ça se voit.
 *
 * @param entrees [{ nom, texte }] — fichiers d'environnement locaux
 * @returns les noms des fichiers qui déclarent (lignes commentées exclues)
 */
export function fichiersDeclarantEndpoint(entrees) {
  return entrees
    .filter(({ texte }) => {
      const sansCommentaires = String(texte)
        .split('\n')
        .filter((ligne) => !/^\s*#/.test(ligne))
        .join('\n');
      return DECLARATION_ENDPOINT.test(sansCommentaires);
    })
    .map(({ nom }) => nom);
}

/**
 * En-têtes que le NAVIGATEUR envoie au relais, tels que le pré-vol doit
 * les autoriser. `content-type` vient de `fetch` lui-même ; `solana-client`
 * est posé par `@solana/web3.js` sur chacune de ses requêtes — c'est celui
 * qui manquait le 12/10/2026 et qui rendait le relais inutilisable depuis
 * l'application tout en paraissant parfaitement sain en ligne de commande.
 */
export const EN_TETES_CLIENT = ['content-type', 'solana-client'];

/**
 * En-têtes attendus par le pré-vol et ABSENTS de la liste annoncée par le
 * relais. FONCTION PURE : c'est ce qui permet de vérifier la régression du
 * 12/10/2026 sans réseau, et de savoir que le script SAIT la nommer.
 *
 * @param autorises valeur de `Access-Control-Allow-Headers` (ou null)
 * @param attendus en-têtes que le client enverra (défaut : EN_TETES_CLIENT)
 * @returns la liste des manquants (vide = pré-vol utilisable)
 */
export function enTetesRefuses(autorises, attendus = EN_TETES_CLIENT) {
  const liste = String(autorises ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return attendus.filter((h) => !liste.includes(h.toLowerCase()));
}

/** Message de refus, écrit ici une fois pour que les tests le retrouvent. */
export const BANDEAU_REFUS = 'NE PAS DÉPOSER';

// ─── Lecture de configuration (fonctions PURES, testées à part) ──────

/**
 * Analyse un fichier `.env` : `CLE=valeur`, commentaires `#` ignorés.
 *
 * ⚠️ Un `#` en fin de ligne n'est PAS traité comme un commentaire : une
 * valeur peut légitimement en contenir (query string d'un endpoint,
 * fragment). Couper sur le `#` tronquerait une URL en silence — et le
 * contrôle porterait alors sur une autre URL que celle de l'app.
 */
export function lireEnv(texte) {
  const valeurs = {};
  for (const ligne of String(texte).split('\n')) {
    const propre = ligne.trim();
    if (!propre || propre.startsWith('#')) continue;
    const i = propre.indexOf('=');
    if (i === -1) continue;
    const cle = propre.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cle)) continue;
    let valeur = propre.slice(i + 1).trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"')) ||
      (valeur.startsWith("'") && valeur.endsWith("'"))
    ) {
      valeur = valeur.slice(1, -1);
    }
    if (valeur) valeurs[cle] = valeur;
  }
  return valeurs;
}

/**
 * Programme du dépôt, lu à DEUX sources. Le champ `address` de l'IDL est
 * déclaratif : il peut être édité à la main sans que le reste du fichier
 * suive. Une divergence entre les deux signifie que le contrôle porterait
 * sur un compte que l'application n'interroge pas.
 */
export function lireProgramme(constantsSrc, idl) {
  const trouve = /PROGRAM_ID\s*=\s*new PublicKey\(\s*['"]([1-9A-HJ-NP-Za-km-z]{32,44})['"]\s*\)/.exec(
    String(constantsSrc)
  );
  const duCode = trouve ? trouve[1] : null;
  const deIdl = typeof idl?.address === 'string' ? idl.address : null;
  return { duCode, deIdl, coherent: Boolean(duCode && deIdl && duCode === deIdl) };
}

/** Discriminant de compte Anchor : 8 premiers octets de sha256("account:X"). */
export function discriminantCompte(nom) {
  return createHash('sha256').update(`account:${nom}`).digest().subarray(0, 8);
}

/** Alphabet base58 — sans 0, O, I, l. Copié de scripts/idl-check.mjs. */
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Encode un Buffer en base58 (une requête JSON-RPC attend ce format). */
export function base58(buf) {
  const chiffres = [0];
  for (const octet of buf) {
    let retenue = octet;
    for (let i = 0; i < chiffres.length; i++) {
      retenue += chiffres[i] << 8;
      chiffres[i] = retenue % 58;
      retenue = (retenue / 58) | 0;
    }
    while (retenue > 0) {
      chiffres.push(retenue % 58);
      retenue = (retenue / 58) | 0;
    }
  }
  let sortie = '';
  for (const octet of buf) {
    if (octet === 0) sortie += '1';
    else break;
  }
  // Un buffer entièrement nul n'a AUCUN chiffre à écrire : la boucle
  // ci-dessus a déjà posé un « 1 » par octet nul, et reprendre `chiffres`
  // en ajouterait un de trop (base58 de [0x00] = « 1 », pas « 11 »).
  // Le cas ne concerne pas un discriminant réel, mais un encodeur faux se
  // propage ; autant qu'il soit juste.
  const nombreNul = chiffres.length === 1 && chiffres[0] === 0;
  if (!nombreNul) {
    for (let i = chiffres.length - 1; i >= 0; i--) sortie += BASE58[chiffres[i]];
  }
  return sortie;
}

/**
 * Endpoint principal = celui que l'application utilise, construit par la
 * MÊME fonction (`construireUrlProxy`), à partir de `VITE_SUPABASE_URL`.
 * Un `--endpoint` explicite court-circuite la résolution (utile pour
 * tester un nœud direct), mais il est signalé comme tel dans le rapport.
 */
export function resoudreEndpointPrincipal({ explicite, env, fichierEnv, repliSupabase } = {}) {
  if (explicite) return { url: String(explicite).trim(), source: 'argument --endpoint' };
  const base =
    (env?.VITE_SUPABASE_URL || '').trim() ||
    (fichierEnv?.VITE_SUPABASE_URL || '').trim() ||
    (repliSupabase || '').trim();
  const url = construireUrlProxy(base);
  if (!url) return { url: null, source: 'aucune (VITE_SUPABASE_URL introuvable)' };
  const source = env?.VITE_SUPABASE_URL
    ? 'VITE_SUPABASE_URL (environnement)'
    : fichierEnv?.VITE_SUPABASE_URL
      ? 'VITE_SUPABASE_URL (fichier .env)'
      : 'URL de repli de src/lib/supabaseClient.ts';
  return { url, source };
}

// ─── Verdict ────────────────────────────────────────────────────────

/**
 * Décide du sort de la soumission à partir des trois sondes.
 *
 * FONCTION PURE : c'est ce qui permet de vérifier les cinq issues
 * (version morte, méthode bridée, pré-vol CORS inutilisable, programme
 * vide, tout va bien) sans réseau, et donc de savoir que le script SAIT
 * refuser quelque chose.
 *
 * @param version sonde `getVersion` (résultat de `classerReponse`), ou null
 * @param gpa     sonde `getProgramAccounts`, ou null
 * @param comptes nombre de comptes détenus par le programme (si la sonde est passée)
 * @param pacts   nombre de comptes Project parmi eux (si connus)
 * @param cors    sonde du pré-vol : { manquants: string[], origin: string|null } ou null
 */
export function verdictSoumission({ version, gpa, comptes = null, pacts = null, cors = null }) {
  if (!version || version.verdict !== 'sain') {
    return {
      code: 1,
      titre: `l'endpoint principal ne rend pas de JSON-RPC (${version ? version.verdict : 'aucune réponse'})`,
      action:
        'Déployer la fonction Edge (supabase functions deploy rpc --no-verify-jwt) et vérifier le secret RPC_UPSTREAM_URL — voir docs/CHECKLIST-DERNIERE-LIGNE-2026-10-12.md, Bloc 0.',
    };
  }
  // Placé AVANT les sondes JSON-RPC : un relais qui répond à `curl` mais
  // que le navigateur ne peut pas appeler est un relais mort pour
  // l'application. Les scripts Node, eux, l'auraient trouvé parfait.
  if (cors && (!cors.origin || cors.manquants?.length > 0)) {
    const manquants = cors.manquants ?? [];
    const sansEntetes = cors.origin && !cors.entetes;
    return {
      code: 1,
      titre: !cors.origin
        ? "le relais répond, mais sa réponse ne porte AUCUN en-tête CORS d'origine"
        : manquants.length && !sansEntetes
          ? `le relais répond, mais son pré-vol CORS REFUSE des en-têtes que le navigateur envoie (${manquants.join(', ')})`
          : "le relais répond, mais sa réponse ne déclare pas la liste des en-têtes autorisés (Access-Control-Allow-Headers)",
      action: !cors.origin
        ? "Vérifier 'Access-Control-Allow-Origin' dans supabase/functions/rpc/index.ts, puis redéployer : sans lui le navigateur bloque la lecture du corps et l'app bascule sur le repli."
        : `Ajouter « ${(manquants.length ? manquants : EN_TETES_CLIENT).join(', ')} » dans 'Access-Control-Allow-Headers' (supabase/functions/rpc/index.ts) puis redéployer. Sans cela, la requête échoue côté navigateur (« TypeError: Failed to fetch ») et l'application bascule sur le devnet public — pendant que curl et tout ce script répondent 200.`,
    };
  }
  if (!gpa || gpa.verdict !== 'sain') {
    const bridee = gpa?.verdict === 'methode-bridee';
    return {
      code: 1,
      titre: bridee
        ? 'getVersion passe mais le fournisseur BRIDE getProgramAccounts (-32401)'
        : `getVersion passe mais getProgramAccounts échoue (${gpa ? gpa.verdict : 'aucune réponse'})`,
      action: bridee
        ? "L'application affichera 0 pact alors que la chaîne en contient : changer de plan/clé côté fournisseur, ou pointer le relais sur un nœud qui accepte la méthode."
        : 'Regarder le détail ci-dessus, puis la liste blanche du relais (supabase/functions/rpc/allowlist.ts).',
    };
  }
  if (comptes === 0) {
    return {
      code: 1,
      titre: "les deux sondes passent, mais le programme ne détient AUCUN compte",
      action:
        "L'application affichera « 0 pact » en démonstration. Vérifier le cluster (devnet), l'adresse du programme et qu'un pacte a bien été créé.",
    };
  }
  return {
    code: 0,
    titre: `les trois sondes passent${comptes !== null ? ` — ${comptes} compte(s) du programme` : ''}`,
    action: null,
  };
}

// ─── Réseau ─────────────────────────────────────────────────────────

/** Un POST JSON-RPC brut : on veut le code HTTP ET le corps, pas un objet. */
async function postJsonRpc(url, method, params, timeoutMs = 8000) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), timeoutMs);
  try {
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'buildpact-pre-soumission', method, params }),
      signal: controleur.signal,
    });
    return { httpStatus: reponse.status, corps: await reponse.text() };
  } catch (e) {
    return { httpStatus: 0, corps: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(minuteur);
  }
}

/** Sonde + résultat exploitable (compte, version…), classé par l'app. */
async function sonder(url, method, params) {
  const { httpStatus, corps } = await postJsonRpc(url, method, params);
  const classe = classerReponse(httpStatus, corps);
  let resultat = null;
  if (classe.verdict === 'sain') {
    try {
      resultat = JSON.parse(corps).result ?? null;
    } catch {
      resultat = null;
    }
  }
  return { ...classe, resultat };
}

/**
 * Origine annoncée au pré-vol. Depuis le 15/10/2026 le relais ne répercute
 * QUE les origines de sa liste blanche (plus de `*`) : cette valeur doit donc
 * rester l'origine de la prod, sinon la sonde échouerait à juste titre.
 */
export const ORIGINE_PREVOL = 'https://buildpact-solana.vercel.app';

/**
 * Sonde 3 — le PRÉ-VOL, tel que le navigateur le pose.
 *
 * On reproduit la requête `OPTIONS` qu'un navigateur envoie AVANT un POST
 * JSON-RPC portant un en-tête non simple (`solana-client` en fait partie,
 * d'où le pré-vol) : on annonce le même `Origin`, la même méthode et les
 * mêmes `Access-Control-Request-Headers`, puis on lit ce que le relais
 * autorise réellement. Aucune autre sonde du dépôt ne fait cela : en Node,
 * sans navigateur, il n'y a jamais de pré-vol — c'est précisément la faille
 * du 12/10/2026, où tout était vert sauf l'application.
 */
async function sonderPrevol(url, timeoutMs = 8000) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), timeoutMs);
  const demandes = [...new Set(['content-type', 'x-client-info', ...EN_TETES_CLIENT])];
  try {
    const reponse = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGINE_PREVOL,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': demandes.join(', '),
      },
      signal: controleur.signal,
    });
    const origin = reponse.headers.get('access-control-allow-origin');
    const entetes = reponse.headers.get('access-control-allow-headers');
    return {
      httpStatus: reponse.status,
      origin,
      entetes,
      manquants: enTetesRefuses(entetes),
      erreur: null,
    };
  } catch (e) {
    return {
      httpStatus: 0,
      origin: null,
      entetes: null,
      manquants: EN_TETES_CLIENT,
      erreur: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(minuteur);
  }
}

// ─── Rapport ────────────────────────────────────────────────────────

const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => console.log(`  \u2717 ${m}`);
const info = (m) => console.log(`    ${m}`);

function titre(texte) {
  console.log(`\n${texte}`);
}

async function main() {
  const argument = process.argv.find((a) => a.startsWith('--endpoint='));
  const explicite = argument ? argument.slice('--endpoint='.length) : null;

  const racine = new URL('..', import.meta.url);
  const lire = (chemin) => readFileSync(new URL(chemin, racine), 'utf8');

  // ── 1. Configuration ──────────────────────────────────────────────
  titre('── Configuration ──────────────────────────────────────');

  let fichierEnv = {};
  for (const nom of FICHIERS_ENV) {
    const chemin = new URL(nom, racine);
    if (!existsSync(chemin)) {
      info(`${nom} : absent`);
      continue;
    }
    // On ne recopie JAMAIS une valeur lue ici : seules les clés sont
    // affichées (`source`), la valeur part directement dans la sonde.
    fichierEnv = { ...lireEnv(lire(nom)), ...fichierEnv };
    info(`${nom} : lu`);
  }

  const supabaseSrc = lire('src/lib/supabaseClient.ts');
  const repliSupabase =
    /const FALLBACK_SUPABASE_URL\s*=\s*'([^']+)'/.exec(supabaseSrc)?.[1] ?? '';

  const { url: endpoint, source } = resoudreEndpointPrincipal({
    explicite,
    env: process.env,
    fichierEnv,
    repliSupabase,
  });

  const constantsSrc = lire('src/lib/constants.ts');
  const idl = JSON.parse(lire('src/idl/buildpact.json'));
  const programme = lireProgramme(constantsSrc, idl);

  console.log(`  endpoint  : ${endpoint ? masquerEndpoint(endpoint) : '(aucun)'}`);
  info(`source    : ${source}`);
  console.log(`  programme : ${programme.duCode ?? '(introuvable dans constants.ts)'}`);
  info(`IDL       : ${programme.deIdl ?? '(absent)'}`);

  // Refus AVANT toute sonde : un endpoint déclaré dans un fichier
  // d'environnement local repart en clair dans `dist/` au prochain build
  // (Vite incruste la valeur d'une variable `VITE_` évaluée). C'est la
  // cause mesurée de la clé servie par la production le 11/10/2026 — le
  // code était corrigé, la déclaration restait.
  const declares = fichiersDeclarantEndpoint(
    FICHIERS_ENV.filter((nom) => existsSync(new URL(nom, racine))).map((nom) => ({
      nom,
      texte: lire(nom),
    }))
  );
  if (declares.length > 0) {
    titre('── Verdict ────────────────────────────────────────────');
    bad(`${declares.join(' et ')} déclarent un endpoint « VITE_ » de nœud`);
    info('Vite incruste EN CLAIR la valeur d’une variable VITE_ évaluée au build :');
    info('cette déclaration met une clé dans dist/, donc dans le JavaScript du visiteur.');
    info('L’application ne lit plus cette variable : la déclaration n’apporte rien.');
    console.log(`\n  ${BANDEAU_REFUS} — un endpoint local est déclaré.`);
    console.log(
      `  À faire : supprimer la ligne de ${declares.join(' et ')} — le nœud dédié vit côté relais (secret de plateforme).`
    );
    process.exit(1);
  }

  if (!endpoint || !programme.coherent) {
    titre('── Verdict ────────────────────────────────────────────');
    if (!endpoint) bad("aucun endpoint principal résolu : VITE_SUPABASE_URL est introuvable");
    if (!programme.coherent) {
      bad('le programme du code et celui de l’IDL ne concordent pas');
      info(`code : ${programme.duCode ?? '—'} · IDL : ${programme.deIdl ?? '—'}`);
    }
    console.log(`\n  ? ${BANDEAU_REFUS} — contrôle impossible, configuration illisible.`);
    process.exit(2);
  }

  // ── 2. Sonde 1 : getVersion ───────────────────────────────────────
  titre('── Sonde 1 — getVersion ───────────────────────────────');
  const version = await sonder(endpoint, 'getVersion', []);
  if (version.verdict === 'sain') {
    const coeur = version.resultat?.['solana-core'] ?? '(sans numéro de version)';
    ok(`JSON-RPC rendu — solana-core ${coeur}`);
  } else {
    bad(`${version.verdict}${version.httpStatus ? ` (HTTP ${version.httpStatus})` : ''}`);
    info(version.detail);
  }

  // ── 3. Sonde 2 : getProgramAccounts ───────────────────────────────
  titre('── Sonde 2 — getProgramAccounts (la sonde qui compte) ──');
  const discrim = discriminantCompte('Project');
  const discrimIdl = idl.accounts?.find((a) => a.name === 'Project')?.discriminator;
  info(`discriminant Project : ${base58(discrim)}`);
  if (Array.isArray(discrimIdl) && Buffer.from(discrimIdl).toString('hex') !== discrim.toString('hex')) {
    info("⚠ l'IDL déclare un autre discriminant pour Project — l'un des deux a bougé");
  }

  const gpa = await sonder(endpoint, 'getProgramAccounts', [
    programme.duCode,
    { dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' },
  ]);
  let comptes = null;
  if (gpa.verdict === 'sain' && Array.isArray(gpa.resultat)) {
    comptes = gpa.resultat.length;
    ok(`${comptes} compte(s) détenu(s) par le programme`);
  } else if (gpa.verdict === 'sain') {
    bad('réponse inattendue (pas un tableau de comptes)');
    info(JSON.stringify(gpa.resultat)?.slice(0, 200) ?? 'null');
  } else {
    bad(`${gpa.verdict}${gpa.httpStatus ? ` (HTTP ${gpa.httpStatus})` : ''}`);
    info(gpa.detail);
    if (gpa.verdict === 'methode-bridee') {
      info("c'est le bridage fournisseur (-32401) décrit dans src/lib/constants.ts :");
      info('l’app listerait 0 pact alors que la chaîne en contient.');
    }
  }

  // Seulement si le scan complet a marché : combien de ces comptes sont des
  // pactes (comptes `Project`). C'est ce que `#/pacts` affichera.
  let pacts = null;
  if (comptes !== null && comptes > 0) {
    const filtres = await sonder(endpoint, 'getProgramAccounts', [
      programme.duCode,
      { filters: [{ memcmp: { offset: 0, bytes: base58(discrim) } }], dataSlice: { offset: 0, length: 0 } },
    ]);
    if (filtres.verdict === 'sain' && Array.isArray(filtres.resultat)) {
      pacts = filtres.resultat.length;
      if (pacts > 0) ok(`${pacts} pact(s) décodable(s) → c'est ce que #/pacts affichera`);
      else bad('aucun compte Project décodable → #/pacts afficherait « 0 pact »');
    } else {
      info(`filtre memcmp non concluant (${filtres.verdict}) — le scan complet reste valable`);
    }
  }

  // ── 3bis. Sonde 3 : pré-vol CORS (ce que le NAVIGATEUR envoie) ───
  titre('── Sonde 3 — pré-vol CORS (le navigateur, pas curl) ────');
  const cors = await sonderPrevol(endpoint);
  info(`origine annoncée : ${ORIGINE_PREVOL}`);
  if (cors.erreur) {
    bad(`pré-vol injoignable (${cors.erreur})`);
  } else if (cors.origin && cors.manquants.length === 0) {
    ok(`pré-vol accepté (méthode POST, en-têtes ${EN_TETES_CLIENT.join(' + ')})`);
  } else {
    bad(
      cors.origin
        ? `en-tête(s) refusé(s) au pré-vol : ${cors.manquants.join(', ') || '(liste absente)'}`
        : "aucun Access-Control-Allow-Origin dans la réponse — le navigateur bloquerait"
    );
    info("c'est la panne du 12/10/2026 : le relais est injoignable depuis l'app (l'app passe sur le devnet");
    info('public) pendant que toutes les sondes en ligne de commande le trouvent parfait.');
  }
  // Avec `--endpoint`, on sonde un nœud direct (par ex. le fournisseur) que
  // l'application n'appelle PAS : exiger de lui des en-têtes CORS ferait
  // échouer un contrôle légitime. Le pré-vol reste mesuré et affiché, mais
  // seul le relais de l'app décide du verdict.
  const corsDecisif = explicite ? null : cors;
  if (explicite) {
    info("endpoint explicite : le pré-vol est mesuré, mais ne décide pas du verdict (l'app, elle, passe par le relais)");
  }

  // ── 4. Repli (informatif) ─────────────────────────────────────────
  titre('── Repli (informatif) ─────────────────────────────────');
  const repli = 'https://api.devnet.solana.com';
  if (endpoint === repli) {
    info('l’endpoint principal EST le devnet public — rien à comparer');
  } else {
    const sondeRepli = await sonder(repli, 'getVersion', []);
    if (sondeRepli.verdict === 'sain') {
      info(
        `${masquerEndpoint(repli)} répond (solana-core ${sondeRepli.resultat?.['solana-core'] ?? '?'}) — c'est le nœud sur lequel l'app basculera si le principal tombe`
      );
    } else {
      info(`${masquerEndpoint(repli)} ne répond pas non plus (${sondeRepli.verdict})`);
    }
  }

  // ── 5. Verdict ────────────────────────────────────────────────────
  const verdict = verdictSoumission({ version, gpa, comptes, pacts, cors: corsDecisif });
  titre('── Verdict ────────────────────────────────────────────');
  if (verdict.code === 0) {
    console.log(`  ✓ ${verdict.titre}`);
    console.log('\n  Prêt à déposer.');
    process.exit(0);
  }
  console.log(`  ✗ ${verdict.titre}`);
  console.log(`\n  ${BANDEAU_REFUS} — l'application tombe (ou est tombée) sur le repli.`);
  if (verdict.action) console.log(`  À faire : ${verdict.action}`);
  console.log('');
  process.exit(verdict.code);
}

// Le script est importable (scripts/pre-soumission.test.ts vérifie ses
// fonctions pures) : `main()` ne part que s'il est exécuté directement.
const invoqueDirectement =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invoqueDirectement) {
  main().catch((err) => {
    console.error(`\n  ✗ ${BANDEAU_REFUS} — échec du contrôle : ${err?.message ?? err}`);
    process.exit(2);
  });
}
