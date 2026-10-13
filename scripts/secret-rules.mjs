// scripts/secret-rules.mjs
// ═══════════════════════════════════════════════════════════════════
// Les RÈGLES de détection de secrets — écrites une fois, utilisées par
// les DEUX contrôles qui en ont besoin :
//
//   - scripts/secret-scan.test.ts       → l'arbre de travail (fichiers suivis)
//   - scripts/history-secret-scan.mjs   → tout l'historique (blobs)
//
// Pourquoi ce fichier existe : les deux contrôles cherchaient la même chose
// à deux endroits. Deux copies d'une même liste de motifs finissent toujours
// par diverger — l'historique serait alors jugé propre par des règles que le
// contrôle de l'arbre a déjà renforcées. C'est le défaut que
// `docs/outils/verifier-docs.mjs` documente pour les documents de référence,
// repris ici pour les secrets.
//
// ── Ce que ce module ne fait JAMAIS : écrire une valeur en clair ──
// `analyser()` peut fonctionner en deux modes :
//   - par défaut (`masquer: false`) : il rend un COURT PRÉFIXE de la valeur.
//     Utile à un humain qui corrige son propre fichier, et c'est le mode
//     historique de `secret-scan.test.ts` ;
//   - `masquer: true` : il ne rend que l'EMPREINTE (sha256, 12 caractères).
//     C'est le mode obligatoire pour l'historique : un audit qui recopie un
//     secret dans un terminal est un audit qui fuit.
//
// Sortie de ce module : des chaînes prêtes à lire. Aucune valeur en clair
// en mode masqué, jamais.
// ═══════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';

/** Empreinte d'une valeur : sha256 en hexadécimal, 12 premiers caractères.
 *  Deux empreintes égales prouvent deux valeurs égales ; l'empreinte ne
 *  permet pas de remonter à la valeur. */
export const empreinte = (valeur) =>
  createHash('sha256').update(String(valeur)).digest('hex').slice(0, 12);

/** Valeur manifestement fictive : gabarit `<…>`, point de suspension,
 *  « CHANGE_ME », « your-key », « example »… Sans ce filtre, le modèle
 *  `.env.example` (dont c'est TOUT l'intérêt) ferait échouer le contrôle. */
export const GABARIT = /^(<|\[|%|\{)|<[^>]*>|\.\.\.|x{3,}|X{3,}|change[_-]?me|your[_-]|example|placeholder|redacted|todo|tr[oO]?nqu/i;

/** Nom de variable qui annonce un secret. `ANON_KEY` n'y est PAS : une clé
 *  anon Supabase est publique, la traiter comme un secret ferait un faux
 *  positif permanent. */
export const NOM_SENSIBLE = /(secret|private[_-]?key|priv[_-]?key|service[_-]?role|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|bearer|password|passwd|credential)/i;

/** Jeton au format JWT : trois segments base64url. */
export const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

/** Affectation `NOM = "valeur"` / `NOM: 'valeur'`, valeur littérale longue.
 *
 * ⚠️ Le nom est BORNÉ (65 caractères) — et ce n'est pas un détail de style.
 * Mesuré le 09/10/2026, pendant la mise en place du mode profond : avec un
 * groupe de nom non borné, cette expression est QUADRATIQUE. Sur une seule
 * ligne de 400 000 caractères (un bundle minifié, un blob de remplissage),
 * chaque position de départ avalait toute la suite avant d'échouer sur le
 * `=` manquant. Mesures avant correction : 5 000 car. = 58 ms,
 * 10 000 = 252 ms, 20 000 = 1 059 ms, 40 000 = 5 115 ms — soit ~500 s pour
 * un blob de 400 Kio. Un audit qui met huit minutes par blob n'est pas
 * exécuté, donc ne protège rien.
 *
 * Borner ne coûte aucune détection : aucun nom de variable réel n'atteint
 * 65 caractères, et une ligne qui nomme un secret ET porte une longue valeur
 * reste couverte par VALEUR_LONGUE, qui lit la ligne entière. */
export const AFFECTATION = /([A-Za-z_][A-Za-z0-9_]{0,64})\s*[:=]\s*["'`]?([A-Za-z0-9+/_=.-]{20,})["'`]?/g;

/** Formats de clés reconnaissables à leur préfixe ou à leur structure. */
export const FORMATS_CONNUS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'bloc de clé privée collé'],
  [/\bghp_[A-Za-z0-9]{30,}/, 'jeton GitHub (ghp_)'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, 'jeton GitHub (github_pat_)'],
  [/\bsk-[A-Za-z0-9]{32,}/, 'clé de type OpenAI (sk-)'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'jeton Slack (xox)'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'clé d’accès AWS'],
  [/\[(\s*-?\d{1,3}\s*,){63}\s*-?\d{1,3}\s*\]/, 'keypair Solana (tableau de 64 octets)'],
];

/**
 * À quoi ressemble une clé : une longue suite base64url sans espace. Sert à
 * repérer la valeur là où elle n'est PAS en forme d'affectation — dans une
 * cellule de tableau Markdown, par exemple.
 *
 * ⚠️ Règle ajoutée le 09/10/2026 après un FAUX NÉGATIF mesuré : la première
 * version de ce module ne trouvait pas la clé privée VAPID du
 * `docs/BILAN_BUILDPACT_290826.md` historique, parce qu'elle y figurait dans
 * une cellule (`| `VAPID_PRIVATE_KEY` | `valeur` |`) et non sous la forme
 * `NOM=valeur`. Le secret le plus grave du dépôt passait donc entre les
 * mailles des règles censées le trouver.
 *
 * ⚠️ L'alphabet est volontairement étroit (`[A-Za-z0-9_-]`, pas de `/`, `.`,
 * `+`, `=`) : un motif plus large signalait des CHEMINS et des NOMS DE
 * FICHIERS (`target/deploy/workspace-keypair.json`,
 * `buildpact-75mv-backup-20261007-151646.bundle`,
 * `@xrplf/secret-numbers/…`) sur toute ligne qui mentionnait le mot
 * « secret ». Un garde-fou qui crie sur des chemins est un garde-fou qu'on
 * désactive.
 */
export const VALEUR_LONGUE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;

/**
 * Le jeton a-t-il la FORME d'une clé plutôt que d'un identifiant ?
 *
 * Calibré sur les valeurs réelles trouvées dans l'historique le 09/10/2026 :
 * la clé privée VAPID (43 car.) et sa publique (87 car.) mêlent toutes deux
 * minuscules, MAJUSCULES et chiffres. Exiger les trois classes écarte les
 * identifiants en kebab-case (`buildpact-75mv-backup-20261007-151646`), les
 * constantes en MAJUSCULES (`SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`) et les
 * empreintes hexadécimales en minuscules.
 */
export const formeDeCle = (jeton) => /[a-z]/.test(jeton) && /[A-Z]/.test(jeton) && /[0-9]/.test(jeton);

/**
 * Secret glissé dans une URL (`?api-key=…`, `&token=…`).
 *
 * ⚠️ Règle ajoutée par l'audit d'historique du 09/10/2026, sur une trouvaille
 * réelle que les règles ci-dessus laissaient passer : une clé d'API de
 * fournisseur RPC, logée dans une variable d'environnement sous forme
 * `…/v1/?api-key=<uuid>`. Ni `NOM_SENSIBLE` (le nom de variable ne dit rien)
 * ni `AFFECTATION` (la valeur est une URL, pas un littéral) ne la voyaient.
 */
export const URL_CREDENTIAL = /[?&](api[_-]?key|apikey|key|token|access[_-]?token|secret)=([A-Za-z0-9_\-.]{16,})/gi;

/**
 * Une valeur qui n'est pas un littéral, mais une RÉFÉRENCE à l'environnement.
 *
 * ⚠️ Faux positif mesuré le 11/10/2026 sur `npm test` :
 *
 *   const apiKey = import.meta.env.VITE_TOKENS_API_KEY;
 *
 * était signalé « apiKey = valeur littérale (35 car.) ». Les 35 caractères
 * sont le CHEMIN de la variable, pas sa valeur — `AFFECTATION` accepte le `.`
 * dans sa classe de caractères (elle doit lire `foo.bar.baz`), donc un chemin
 * d'environnement long ressemble à un secret. Le dépôt était rouge sur du code
 * sain, et un contrôle qu'on ne peut pas garder vert finit désactivé.
 *
 * ⚠️ Ce n'est PAS une perte de couverture, et c'est le point important : le
 * mécanisme redouté est la substitution faite par Vite au moment du build, qui
 * remplace la référence par la VALEUR. Cette valeur-là est cherchée là où elle
 * atterrit vraiment — dans le `dist/` produit — par `scripts/build-guard.mjs`.
 * On cesse de signaler le NOM de la variable ; on continue de signaler sa
 * VALEUR.
 *
 * La racine est volontairement étroite (les objets d'environnement connus) :
 * un secret réel ne commence pas par `process.` ou `import.meta`. */
export const REFERENCE_ENVIRONNEMENT =
  /^(import\s*\.\s*meta|process|Deno|Bun|globalThis|self|window)\b/;

/** Décode la revendication `role` d'un JWT, sans vérifier la signature : on
 *  veut seulement savoir ce que le porteur PRÉTEND être. */
export function roleDuJeton(jeton) {
  try {
    const charge = String(jeton).split('.')[1];
    const b64 = charge.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const objet = JSON.parse(json);
    return typeof objet.role === 'string' ? objet.role : null;
  } catch {
    return null;
  }
}

/**
 * Analyser PUR : rend la liste des trouvailles. Fonction sans git ni disque,
 * donc testable sur des entrées fabriquées.
 * @param {string} texte contenu à examiner
 * @param {string} fichier étiquette mise dans le message (chemin, ou oid)
 * @param {{masquer?: boolean, strict?: boolean}} [options]
 *   `masquer: true` → empreintes seulement (mode historique/audit) ;
 *   `strict: true` → règles STRUCTURELLES seulement (voir plus bas)
 * @returns {string[]} messages lisibles, un par problème
 *
 * ── `strict` : pourquoi cette option existe ──
 * `VALEUR_LONGUE` est une règle SOUPLE : elle signale tout jeton long et
 * de forme-clé sur une ligne qui mentionne un mot sensible. Elle a été
 * ajoutée pour un cas réel (une clé privée dans une TABLE Markdown), et en
 * texte elle est utile.
 *
 * Dans un BINAIRE, elle n'a aucun sens : une « ligne » y est une plage de
 * texte imprimable arbitraire — symboles mangled de Rust, chaînes de débogage
 * DWARF — et un identifiant long y côtoie le mot « secret » par hasard.
 * Mesuré le 09/10/2026 sur l'historique réel : sur 843 trouvailles du mode
 * profond, 831 venaient de cette seule règle sur des `.rcgu.o` de
 * `target/`. Un rapport où 98 % des lignes sont du bruit ne se lit pas ; on
 * l'ignore, et le vrai signal part avec.
 *
 * `strict` conserve les règles STRUCTURELLES (`FORMATS_CONNUS`, JWT,
 * `AFFECTATION`, `URL_CREDENTIAL`) : une clé compilée dans un bundle reste
 * `API_KEY=valeur`, donc elle est vue. C'est la règle de forme, pas la
 * détection, qu'on retire.
 */
/**
 * Affectation d'un littéral ENTRE GUILLEMETS à un nom qui annonce un secret.
 *
 * ⚠️ Règle ajoutée le 11/10/2026 pour lire les BUNDLES MINIFIÉS, après une
 * calibration sur la production réelle. `AFFECTATION` y produit des faux
 * positifs systématiques : dans du code minifié, `nom=valeur` n'est presque
 * jamais une valeur, c'est une EXPRESSION. Mesuré sur le bundle servi :
 *
 *   access_token=this.socket.<champ>          → signalé (28 car.)
 *   accessToken=this.<méthode>.bind(this)     → signalé (25 car.)
 *
 * Les deux viennent de `@supabase/supabase-js` et ne contiennent aucun
 * secret. Exiger les guillemets garde ce qui compte — un secret COLLÉ dans du
 * code l'est toujours entre guillemets — et écarte les expressions.
 *
 * ⚠️ Ces deux exemples portent un `<gabarit>`, et ce n'est pas de la
 * coquetterie : recopiés sous leur forme réelle, ils déclenchent
 * `secret-scan` SUR CE FICHIER — un fichier de règles scanné par ses propres
 * règles, l'assignation `nom=valeur` d'une expression JS ressemblant à celle
 * d'un secret. C'est la meilleure démonstration du problème ci-dessus. Ne les
 * « corrige » donc pas en écrivant l'expression complète.
 */
export const AFFECTATION_CITEE =
  /["']?([A-Za-z_][A-Za-z0-9_]{0,64})["']?\s*[:=]\s*["'`]([A-Za-z0-9+/_=.-]{20,})["'`]/g;

/**
 * Analyser ce qui est RÉELLEMENT SERVI au visiteur : un bundle minifié.
 *
 * ── Pourquoi une fonction distincte, et pas des options d'`analyser` ──
 * Un bundle n'est pas du texte. `analyser` y applique `VALEUR_LONGUE` (règle
 * souple conçue pour une cellule Markdown) et `AFFECTATION` (conçue pour un
 * fichier `.env`) : calibré le 11/10/2026 sur les 5 bundles de production,
 * ça donnait 3 trouvailles pour 1 seule réelle. Ici, seules les règles
 * STRUCTURELLES survivent, et l'affectation exige des guillemets.
 *
 * Ce qui reste détecté :
 *   · une clé dans une URL (`?api-key=…`) — la règle qui a trouvé la clé
 *     Helius servie par la production le 11/10/2026 ;
 *   · un littéral entre guillemets nommé comme un secret (`apiKey:"…"`) ;
 *   · les formats reconnaissables (bloc PEM, `sk-`, `AKIA`, `ghp_`…) ;
 *   · un jeton Supabase `service_role` (celui qui court-circuite le RLS).
 *
 * Ce qui n'est PAS détecté, et c'est une limite assumée : un identifiant
 * opaque collé sous un nom anodin (`const X = "bc8ce800-…"`). Un UUID ne se
 * distingue pas d'une empreinte — le dire serait mentir.
 *
 * Sortie MASQUÉE par construction : empreinte et longueur, jamais la valeur.
 * Un contrôle de sécurité qui recopie ce qu'il trouve est un contrôle qui
 * fuit.
 *
 * @param {string} texte contenu du fichier servi
 * @param {string} fichier étiquette mise dans le message
 * @returns {string[]} messages lisibles, un par problème
 */
export function analyserBundle(texte, fichier) {
  const source = String(texte);
  const trouve = [];
  const trace = (valeur) => `empreinte ${empreinte(valeur)}, ${valeur.length} car.`;
  const ignorer = (v) => v.length === 0 || GABARIT.test(v);

  for (const [motif, quoi] of FORMATS_CONNUS) {
    const m = source.match(motif);
    if (m) trouve.push(`${fichier} : ${quoi} (${trace(m[0])})`);
  }

  for (const jeton of source.match(JWT) ?? []) {
    if (roleDuJeton(jeton) === 'service_role') {
      trouve.push(`${fichier} : jeton Supabase service_role en clair (${trace(jeton)})`);
    }
  }

  for (const ligne of source.split('\n')) {
    URL_CREDENTIAL.lastIndex = 0;
    let u;
    while ((u = URL_CREDENTIAL.exec(ligne)) !== null) {
      const [, parametre, valeur] = u;
      if (ignorer(valeur)) continue;
      trouve.push(
        `${fichier} : paramètre « ${parametre} » d’une URL = valeur en clair (${trace(valeur)})`
      );
    }
  }

  AFFECTATION_CITEE.lastIndex = 0;
  let m;
  while ((m = AFFECTATION_CITEE.exec(source)) !== null) {
    const [, nom, valeur] = m;
    if (!NOM_SENSIBLE.test(nom) || ignorer(valeur)) continue;
    trouve.push(`${fichier} : ${nom} = littéral entre guillemets (${trace(valeur)})`);
  }

  return trouve;
}

export function analyser(texte, fichier, options = {}) {
  const masquer = options.masquer === true;
  const strict = options.strict === true;
  const trouve = [];
  // ⚠ La LONGUEUR sort dans les deux modes : elle ne divulgue rien, et c'est
  // souvent elle qui permet de reconnaître une valeur d'une autre (« les 27
  // caractères », « les 43 d'une clé privée P-256 »).
  const trace = (valeur) =>
    masquer
      ? `empreinte ${empreinte(valeur)}, ${valeur.length} car.`
      : `${valeur.slice(0, 8)}… (${valeur.length} car.)`;
  const ignorer = (v) => v.length === 0 || GABARIT.test(v);

  for (const [motif, quoi] of FORMATS_CONNUS) {
    const m = String(texte).match(motif);
    if (m) trouve.push(`${fichier} : ${quoi} (${trace(m[0])})`);
  }

  for (const jeton of String(texte).match(JWT) ?? []) {
    const role = roleDuJeton(jeton);
    // `service_role` court-circuite le RLS : c'est LE jeton à ne jamais
    // publier. Les autres rôles (anon, authenticated) sont publics.
    if (role === 'service_role') {
      trouve.push(`${fichier} : jeton Supabase service_role en clair (empreinte ${empreinte(jeton)})`);
    }
  }

  for (const ligne of String(texte).split('\n')) {
    let ligneExpliquee = false;

    // ⚠️ Garde de VITESSE, sans effet sur ce qui est détecté : AFFECTATION ne
    // signale une trouvaille que si le NOM matche NOM_SENSIBLE — et le nom
    // fait partie de la ligne. Donc « la ligne ne mentionne aucun mot
    // sensible » implique « aucune trouvaille d'affectation ici ». On évite
    // ainsi de lancer une expression coûteuse sur chaque ligne d'un bundle.
    if (NOM_SENSIBLE.test(ligne)) {
      AFFECTATION.lastIndex = 0;
      let m;
      while ((m = AFFECTATION.exec(ligne)) !== null) {
        const [, nom, valeur] = m;
        // Une référence d'environnement est le NOM de la variable, pas sa
        // valeur : la signaler rendrait rouge du code sain. Le tirer n'est pas
        // marqué comme « expliqué », pour que les autres règles continuent de
        // tourner sur la ligne. ⚠️ Si un jour une valeur littérale et une
        // référence cohabitent sur une même ligne, c'est le comportement voulu.
        if (NOM_SENSIBLE.test(nom) && !ignorer(valeur) && !REFERENCE_ENVIRONNEMENT.test(valeur)) {
          trouve.push(`${fichier} : ${nom} = valeur littérale (${trace(valeur)})`);
          ligneExpliquee = true;
        }
      }
    }

    // Un nom qui annonce un secret ET une longue valeur sur la même ligne,
    // même sans `=` ni `:` : c'est la forme d'une cellule de tableau
    // Markdown, ou d'une phrase qui cite la valeur. On ne le fait que si
    // rien d'autre n'a déjà expliqué cette ligne, pour ne pas doubler les
    // trouvailles.
    if (!strict && !ligneExpliquee && NOM_SENSIBLE.test(ligne)) {
      VALEUR_LONGUE.lastIndex = 0;
      const trouves = (ligne.match(VALEUR_LONGUE) ?? []).filter((v) => !ignorer(v) && formeDeCle(v));
      for (const valeur of trouves) {
        trouve.push(`${fichier} : valeur longue sur une ligne qui nomme un secret (${trace(valeur)})`);
      }
    }

    // Les URL se lisent sur la LIGNE ENTIÈRE : la valeur n'est pas un
    // littéral, c'est une adresse, et c'est le paramètre qui porte le secret.
    URL_CREDENTIAL.lastIndex = 0;
    let u;
    while ((u = URL_CREDENTIAL.exec(ligne)) !== null) {
      const [, parametre, valeur] = u;
      if (ignorer(valeur)) continue;
      trouve.push(`${fichier} : paramètre « ${parametre} » d’une URL = valeur en clair (${trace(valeur)})`);
    }
  }

  return trouve;
}
