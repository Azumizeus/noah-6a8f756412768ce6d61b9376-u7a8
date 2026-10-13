// scripts/vapid-check.mjs
// ═══════════════════════════════════════════════════════════════════
// Vérifie que la paire VAPID DÉPLOYÉE est bien celle des fichiers locaux.
//
// Le problème concret : une rotation de clé VAPID est invisible. On peut
// régénérer la paire, poser les nouveaux secrets, croire que c'est fini —
// et laisser le serveur servir l'ancienne, ou l'inverse. Rien dans le
// dépôt ne le dit : le serveur garde ses secrets, le poste garde les siens,
// et personne ne compare jamais les deux. C'est exactement la situation qui
// a produit la rotation du 08/10/2026, où la seule preuve disponible était
// un encadré écrit à la main dans un document.
//
// ── La règle : ne JAMAIS comparer des valeurs, comparer des empreintes ──
// Un secret qui s'affiche une seule fois est un secret qui fuit dans un
// terminal, un historique de shell, un log de CI. Ici, tout passe par un
// `sha256` tronqué à 12 caractères : deux empreintes égales prouvent deux
// valeurs égales, et une empreinte ne permet pas de remonter à la valeur.
// `supabase secrets list` rend précisément un sha256 en hexadécimal — le
// même calcul, ce qui rend la comparaison locale/serveur légitime.
//
// ── Sortie : jamais une valeur ────────────────────────────────────────
// Toutes les fonctions publiques de ce module sont conçues pour n'émettre
// que des empreintes ou des longueurs. `masquer()` existe pour ça, et le
// test associé vérifie qu'aucune sortie ne contient la clé d'entrée.
//
// Codes de sortie du CLI :
//   0 — la paire locale est cohérente (et concorde avec le serveur si interrogé)
//   1 — incohérence : paire locale invalide, ou divergence avec le serveur
//   2 — vérification impossible (pas de paire locale, CLI Supabase injoignable)
//       ⚠ 2 n'est PAS un succès : on ne prétend jamais avoir vérifié.
// ═══════════════════════════════════════════════════════════════════
import { createHash, createECDH } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Empreinte d'une valeur : sha256 en hex, 12 premiers caractères. */
export const empreinte = (valeur) =>
  createHash('sha256').update(String(valeur)).digest('hex').slice(0, 12);

/**
 * Rend la valeur sous une forme qui ne la divulgue pas.
 * Sert à tout message destiné à un humain ou à un log.
 */
export const masquer = (valeur) => {
  const v = String(valeur ?? '');
  if (v.length === 0) return '(vide)';
  // Aucun préfixe : même quatre caractères d'une clé vivante sont quatre
  // caractères de trop. La longueur et l'empreinte suffisent au diagnostic.
  return `(masquée, ${v.length} car., empreinte ${empreinte(v)})`;
};

/**
 * Dérive la clé publique d'une clé privée VAPID (courbe P-256).
 * Une clé VAPID est une clé EC : sa publique se recalcule, elle ne se
 * devine pas. C'est ce qui permet de prouver qu'une paire est COHÉRENTE
 * au lieu de supposer que deux valeurs vont ensemble.
 * @returns {string|null} publique en base64url (87 car.), ou null si illisible
 */
export function derivePublique(privee) {
  const v = String(privee ?? '').trim();
  // ⚠ `Buffer.from(x, 'base64url')` est INDULGENT : il ignore les caractères
  // invalides et tronque. Sans ce garde, `'pas-une-cle!!'` produisait une
  // paire parfaitement plausible au lieu d'un refus — un contrôle qui répond
  // « incohérent » là où il devrait répondre « illisible » se trompe de
  // diagnostic, et un diagnostic faux coûte plus cher qu'une erreur franche.
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  const brut = Buffer.from(v, 'base64url');
  if (brut.length !== 32) return null; // une privée VAPID P-256 fait 32 octets
  try {
    const e = createECDH('prime256v1');
    e.setPrivateKey(brut);
    return e.getPublicKey().toString('base64url');
  } catch {
    return null;
  }
}

/** Deux valeurs forment-elles une paire VAPID cohérente ? */
export const paireCoherente = (privee, publique) => {
  if (!privee || !publique) return false;
  return derivePublique(privee) === String(publique).trim();
};

/** Lit un fichier `.env` (guillemets et `export` tolérés). */
export function lireVarsEnv(texte) {
  const vars = {};
  for (const ligne of String(texte).split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(ligne);
    if (!m) continue;
    vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return vars;
}

/** Extrait la référence de projet d'une URL Supabase (`https://<ref>.supabase.co`). */
export function refDepuisUrl(url) {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(String(url ?? '').trim());
  return m ? m[1] : null;
}

/**
 * Compare deux empreintes — l'une calculée en local, l'autre annoncée par
 * le serveur — en se limitant aux 12 premiers caractères, pour que les deux
 * formes (empreinte courte, sha256 complet) restent comparables.
 */
export function comparerEmpreintes({ nom, locale, distante }) {
  const a = String(locale ?? '');
  const b = String(distante ?? '');
  return { nom, locale: a, distante: b, concorde: a.length > 0 && b.length >= 12 && a === b.slice(0, 12) };
}

/** Lit la paire locale dans les fichiers d'environnement fournis. */
export function lirePaireLocale({ fichierPrivee, fichierPublique }) {
  const privee = existsSync(fichierPrivee)
    ? (lireVarsEnv(readFileSync(fichierPrivee, 'utf8')).VAPID_PRIVATE_KEY ?? null)
    : null;
  const publiques = existsSync(fichierPublique)
    ? (() => {
        const v = lireVarsEnv(readFileSync(fichierPublique, 'utf8'));
        return v.VITE_VAPID_PUBLIC_KEY ?? v.VAPID_PUBLIC_KEY ?? null;
      })()
    : null;
  return { privee, publique: publiques };
}

/** Liste des secrets annoncés par Supabase : { NOM: digest }. */
export function lireSecretsDistants(projectRef, exec = execFileSync) {
  const sortie = exec('supabase', ['secrets', 'list', '--project-ref', projectRef], { encoding: 'utf8' });
  const distants = {};
  for (const ligne of String(sortie).split('\n')) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*\|\s*([0-9a-f]{16,})\s*$/.exec(ligne);
    if (m) distants[m[1]] = m[2];
  }
  return distants;
}

// ─── CLI ──────────────────────────────────────────────────────────────

const oui = (m) => console.log(`  ✓ ${m}`);
const non = (m) => console.log(`  ✗ ${m}`);
const info = (m) => console.log(`    ${m}`);

function main() {
  const args = process.argv.slice(2);
  const sansServeur = args.includes('--local-seul');
  const fichierPrivee = process.env.VAPID_PRIVEE ?? '.env.vapid';
  const fichierPublique = process.env.VAPID_PUBLIQUE ?? '.env.local';

  console.log('\n── Paire VAPID locale ────────────────────────────────');
  const { privee, publique } = lirePaireLocale({ fichierPrivee, fichierPublique });

  if (!privee) {
    non(`aucune VAPID_PRIVATE_KEY dans ${fichierPrivee}`);
    info('→ vérification impossible : ce n’est pas un succès (code 2)');
    process.exit(2);
  }
  if (!publique) {
    non(`aucune VAPID_PUBLIC_KEY dans ${fichierPublique}`);
    info('→ vérification impossible : ce n’est pas un succès (code 2)');
    process.exit(2);
  }

  const coherente = paireCoherente(privee, publique);
  info(`privée  : ${masquer(privee)}`);
  info(`publique: ${masquer(publique)}`);
  if (coherente) oui('la privée dérive exactement la publique — paire cohérente');
  else non('la privée NE dérive PAS cette publique — paire incohérente');

  let code = coherente ? 0 : 1;

  if (!sansServeur) {
    console.log('\n── Ce que le serveur sert réellement ─────────────────');
    const ref = process.env.SUPABASE_PROJECT_REF ?? refDepuisUrl(
      existsSync('.env') ? lireVarsEnv(readFileSync('.env', 'utf8')).VITE_SUPABASE_URL : ''
    );

    if (!ref) {
      non('référence de projet Supabase introuvable');
      info('→ renseigne SUPABASE_PROJECT_REF, ou lance avec --local-seul');
      process.exit(Math.max(code, 2));
    }

    let distants;
    try {
      distants = lireSecretsDistants(ref);
    } catch (e) {
      non(`impossible d’interroger Supabase (${String(e.message ?? e).split('\n')[0]})`);
      info('→ vérification serveur NON faite : ce n’est pas un succès (code 2)');
      process.exit(Math.max(code, 2));
    }

    const compPrivee = comparerEmpreintes({
      nom: 'VAPID_PRIVATE_KEY',
      locale: empreinte(privee),
      distante: distants.VAPID_PRIVATE_KEY,
    });
    const compPublique = comparerEmpreintes({
      nom: 'VAPID_PUBLIC_KEY',
      locale: empreinte(publique),
      distante: distants.VAPID_PUBLIC_KEY,
    });

    for (const c of [compPrivee, compPublique]) {
      if (!c.distante) {
        non(`${c.nom} absent des secrets Supabase`);
        code = 1;
      } else if (c.concorde) {
        oui(`${c.nom} : ${c.locale} côté local == côté serveur`);
      } else {
        non(`${c.nom} DIVERGE — local ${c.locale}, serveur ${c.distante.slice(0, 12)}`);
        info('→ une rotation a été faite d’un seul côté. La régénérer et reposer les deux.');
        code = 1;
      }
    }
  }

  console.log('');
  console.log(code === 0 ? '✓ Rien à signaler.' : '✗ Vérification en échec.');
  process.exit(code);
}

// N'exécuter le CLI que s'il est lancé directement (les tests importent le
// module). La comparaison passe par `realpathSync` : `process.argv[1]` est
// relatif quand on lance `node scripts/…`, et une URL construite à la main ne
// correspondrait jamais — le CLI ne se serait jamais exécuté.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
