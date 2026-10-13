// src/lib/pitchParse.ts
// ═══════════════════════════════════════════════════════════════════
// Encodage/décodage du champ `description` on-chain.
//
// CreatePactWizard encode plusieurs infos dans ce champ (le programme n'a
// pas de champ structuré dédié) :
//   "[<stage>] <pitch libre> | Rôles créateur : <rôles> | 💰 Seed founder : <n> SOL (...)"
// Ce parseur reconstitue un affichage propre pour les cartes et les fiches,
// sans jamais supposer que les 3 parties sont présentes (le tout est tronqué
// à la limite d'octets côté programme, donc la fin peut manquer).
//
// POURQUOI CE FICHIER EST SÉPARÉ DE pitch.ts : ici, aucune dépendance — ni
// i18n, ni navigateur. C'est ce qui rend le parseur testable avec
// `node --test` (scripts/pitch-display.test.ts), le runner du projet ne
// résolvant pas les imports sans extension (`./i18n/translations`) utilisés
// par la couche de libellés de pitch.ts. La règle : toute la logique de
// décodage reste dans ce module pur ; pitch.ts n'ajoute que la traduction.
// ═══════════════════════════════════════════════════════════════════

export type PactStage = 'dev' | 'invest' | 'both' | null;

export interface ParsedPitch {
  stage: PactStage;
  stageLabel: string | null;
  pitch: string;
  rolesWanted: string;
  seedAmountSol: string | null;
}

/** Clés canoniques (fixes, jamais traduites) écrites dans le bracket on-chain. */
export const STAGE_CANONICAL: Record<Exclude<PactStage, null>, string> = {
  dev: '🔧 Recherche des devs',
  invest: '💰 Recherche des investisseurs',
  both: '🤝 Les deux',
};

const STAGE_MAP: Record<string, PactStage> = {
  '🔧 Recherche des devs': 'dev',
  '💰 Recherche des investisseurs': 'invest',
  '🤝 Les deux': 'both',
};

/**
 * Texte à AFFICHER pour la description d'un pact : le pitch libre, rien de
 * plus.
 *
 * ⚠️ Pourquoi cette fonction existe au lieu d'un simple `parsed.pitch ||
 * pact.description` (le repli utilisé jusqu'ici sur toutes les cartes) :
 * quand le pitch libre est vide, ce repli affichait la chaîne BRUTE au
 * visiteur — donc la clé d'étape entre crochets et les marqueurs internes,
 * présentés comme du texte (« [🤝 Les deux] | Rôles créateur : … », constaté
 * le 10/10/2026 sur les pacts de démonstration). Une description vide — que
 * l'appelant masque — vaut mieux qu'un artefact d'encodage exposé.
 */
export function displayPitch(raw: string | null | undefined): string {
  if (!raw) return '';
  return parsePitch(raw).pitch;
}

/**
 * Même texte, tronqué proprement pour une carte (ellipse sur un caractère,
 * pas au milieu d'un emoji). Les cartes tronquaient auparavant la chaîne
 * brute à 130/150 caractères — la borne s'applique désormais au pitch réel,
 * pas à la clé d'étape qui le précède.
 */
export function displayPitchShort(raw: string | null | undefined, max: number): string {
  const text = displayPitch(raw);
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function parsePitch(raw: string): ParsedPitch {
  let rest = raw;
  let stageLabel: string | null = null;
  let stage: PactStage = null;

  const bracketMatch = rest.match(/^\[([^\]]+)\]\s*/);
  if (bracketMatch) {
    stageLabel = bracketMatch[1];
    stage = STAGE_MAP[stageLabel] ?? null;
    rest = rest.slice(bracketMatch[0].length);
  }

  let pitch = rest;
  let rolesWanted = '';
  let seedAmountSol: string | null = null;

  // ⚠️ Marqueurs SANS espace de tête. Le `\s*` du bracket a déjà consommé
  // l'espace du séparateur : sur un pact dont le pitch libre est vide, la
  // chaîne on-chain est « [<étape>] | Rôles créateur : … » et un marqueur
  // précédé d'un espace ne matchait plus. Résultat : les rôles du créateur
  // s'affichaient à la place du pitch, en clair. Trouvé par
  // scripts/pitch-display.test.ts le 10/10/2026.
  const ROLE_MARK = '| Rôles créateur : ';
  const SEED_MARK = '| 💰 Seed founder : ';

  const roleIdx = rest.indexOf(ROLE_MARK);
  if (roleIdx !== -1) {
    pitch = rest.slice(0, roleIdx);
    const afterRoles = rest.slice(roleIdx + ROLE_MARK.length);
    const seedIdx = afterRoles.indexOf(SEED_MARK);
    if (seedIdx !== -1) {
      rolesWanted = afterRoles.slice(0, seedIdx);
      const seedMatch = afterRoles.slice(seedIdx + SEED_MARK.length).match(/^([\d.,]+)\s*SOL/);
      seedAmountSol = seedMatch ? seedMatch[1] : null;
    } else {
      rolesWanted = afterRoles;
    }
  }

  return {
    stage,
    stageLabel,
    pitch: pitch.trim(),
    rolesWanted: rolesWanted.trim(),
    seedAmountSol,
  };
}
