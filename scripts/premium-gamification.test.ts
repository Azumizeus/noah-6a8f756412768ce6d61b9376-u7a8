// scripts/premium-gamification.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de la dernière famille migrée de /v1 vers le premium :
// progression (rang + XP + badges), quêtes (quêtes, chronique, historique)
// et panneau wallet.
//
// Contexte : ces trois fonctions n'existaient que dans `MonProfilPage`
// (legacy), via `components/XpBar.tsx`, `BadgeShelf.tsx`, `QuestBoard.tsx` et
// `WalletPanel.tsx` — les deux dernières « perdues » de
// `INVENTAIRE-V1-2026-10-08.md`. Les retirer avec /v1 aurait retiré des
// fonctions utilisateur, pas de la dette d'habillage.
//
// Quatre règles, chacune pour un piège précis :
//
//   1. Les pages premium DOIVENT passer par les composants migrés. Sinon la
//      fonction redevient dépendante du legacy au premier remaniement, et
//      l'inventaire redevient vrai.
//   2. Ces composants ne reprennent AUCUN habillage legacy (classe Tailwind
//      sombre, `--accent-violet`, `glass-panel`, couleur littérale) — c'est
//      ce qui leur fait suivre gratuitement les 4 palettes × 2 modes. Seule
//      exception déclarée : les jeux d'ICÔNES (`RankIcons`, `QuestIcons`),
//      qui sont des SVG en `currentColor` sans palette ni encre propre.
//   3. Les composants emploient les lecteurs qui RAPPORTENT l'échec
//      (`…Result`), jamais ceux qui le convertissent en valeur de repli. Une
//      base injoignable doit s'afficher comme telle, pas comme
//      « 0 XP, aucun badge, aucune quête ».
//   4. Chaque variante `…Result` doit avoir sa variante d'origine comme
//      simple délégation dans la lib : deux implémentations de la même
//      lecture finiraient par diverger, et c'est celle du legacy qui
//      resterait juste pour personne.
//
// Lecture du source + dictionnaires (pas de DOM) : même parti pris que
// premium-social.test.ts — le projet n'a pas de jsdom, et une clé i18n
// manquante d'un seul côté est précisément le bug qu'aucun écran ne montre.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DOSSIER = new URL('../src/pages/premium/', import.meta.url);
const lire = (nom: string): string => readFileSync(new URL(nom, DOSSIER), 'utf8');

/** Source sans commentaires : les en-têtes de ces fichiers citent longuement
 *  les composants legacy pour EXPLIQUER qu'ils ne les réutilisent pas, et un
 *  scan naïf y lirait des dépendances. Même détourage que premium-social. */
const stripComments = (src: string): string =>
  src
    .replace(/^[ \t]*\{\s*\/\*[\s\S]*?\*\/\s*\}[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .split('\n')
    .filter((line) => !/^[ \t]*(\/\/|\*)/.test(line))
    .join('\n');

const code = (nom: string): string => stripComments(lire(nom));

/** Les trois composants de la famille progression/quêtes/wallet. */
const PANNEAUX = ['PremiumProgression.tsx', 'PremiumQuests.tsx', 'PremiumWalletPanel.tsx'] as const;

// ─── 1. Le détecteur de lecteur qui avale l'échec (entrées fabriquées) ──

/** Lectures de gamification dont la variante d'origine CONVERTIT un échec en
 *  valeur de repli (0 / [] / Set vide / tous badges verrouillés). La variante
 *  `…Result` existe pour chacune et rapporte l'échec. */
export const LECTEURS_AVALANTS = [
  'fetchWalletXp',
  'computeBadgeProgress',
  'fetchWeeklyQuestProgress',
  'fetchClaimedThisWeek',
  'fetchWalletChronicle',
  'fetchQuestHistory',
] as const;

/**
 * Noms de lecteurs « qui avalent l'échec » réellement appelés dans un source.
 *
 * Le `(?!Result)` est le cœur du détecteur : `\bfetchWalletXp\b` matcherait
 * aussi `fetchWalletXpResult`, et le contrôle signalerait alors précisément le
 * code qu'on veut voir. Fonction pure (exportée) : le test ci-dessous la fait
 * tourner sur des entrées fabriquées, pour qu'un détecteur cassé ne puisse pas
 * se faire passer pour un dépôt propre.
 */
export function lecteursAvalants(src: string): string[] {
  return LECTEURS_AVALANTS.filter((nom) =>
    new RegExp(`\\b${nom}\\b(?!Result)`).test(src)
  );
}

test('le détecteur attrape un lecteur qui avale l’échec, et épargne sa variante', () => {
  assert.deepEqual(lecteursAvalants('fetchWalletXp(wallet).then(setXp)'), ['fetchWalletXp']);
  assert.deepEqual(lecteursAvalants('computeBadgeProgress(wallet).then(setB)'), ['computeBadgeProgress']);
  assert.deepEqual(
    lecteursAvalants('fetchWalletXpResult(wallet).then((r) => {})'),
    [],
    'la variante qui rapporte l’échec ne doit jamais être signalée'
  );
  assert.deepEqual(
    lecteursAvalants('fetchWeeklyQuestProgressResult(wallet).then((r) => {})'),
    [],
    'un nom qui CONTIENT un nom avalant ne doit pas déclencher le détecteur'
  );
  assert.deepEqual(lecteursAvalants('const x = 1;'), []);
});

test('la liste des lecteurs avalants correspond à des fonctions réellement exportées', () => {
  const lib = readFileSync(new URL('../src/lib/gamification.ts', import.meta.url), 'utf8');
  const fantomes = LECTEURS_AVALANTS.filter(
    (nom) => !new RegExp(`export async function ${nom}\\b`).test(lib)
  );
  assert.deepEqual(fantomes, [], `lecteur déclaré introuvable dans la lib : ${fantomes.join(', ')}`);
  assert.ok(LECTEURS_AVALANTS.length >= 4, `liste suspicieusement courte : ${LECTEURS_AVALANTS.length}`);
});

// ─── 2. Les pages passent par les composants migrés ───────────────────

test('PremiumProfil rend progression, quêtes et wallet', () => {
  const src = code('PremiumProfil.tsx');
  for (const [nom, composant] of [
    ['PremiumProgression', 'PremiumProgression'],
    ['PremiumQuests', 'PremiumQuests'],
    ['PremiumWalletPanel', 'PremiumWalletPanel'],
  ] as const) {
    assert.match(
      src,
      new RegExp(`import ${nom} from '\\./${nom}'`),
      `${composant} : import manquant`
    );
    assert.match(src, new RegExp(`<${nom}\\b`), `${composant} n’est pas rendu`);
  }
  // Sans wallet, les trois liraient les données de personne et la réclamation
  // d'une quête demanderait une signature impossible : le montage est gardé.
  for (const nom of ['PremiumProgression', 'PremiumQuests', 'PremiumWalletPanel']) {
    assert.match(
      src,
      new RegExp(`\\{myAddr && <${nom}\\b`),
      `${nom} doit être conditionné au wallet`
    );
  }
});

// ─── 3. Aucun habillage legacy dans les composants migrés ─────────────

const LEGACY_SIGNS: Array<[RegExp, string]> = [
  [/\btext-ink-\d/, 'encre legacy (text-ink-*) : invisible ou hors palette sur l’ivoire'],
  [/\btext-white\b/, 'blanc legacy : pensé pour le fond noir, illisible en mode clair'],
  [/--accent-violet/, 'token legacy : ne suit ni la palette ni le mode sombre'],
  [/\bglass-panel\b/, 'panneau legacy : palette sombre figée'],
  [/rgba?\(/, 'couleur littérale : la pastille doit prendre un token de palette'],
  [/\bmodal-surface\b/, 'surface legacy : palette sombre figée'],
];

/** Jeux d'icônes partagés, DÉCLARÉS nommément. Ce sont des SVG en
 *  `currentColor`, sans palette ni encre propre : les réécrire dupliquerait
 *  7 rangs et 9 glyphes de quête pour zéro token. Toute autre importation
 *  depuis `components/` apporterait son habillage sombre avec elle. */
const ICONES_PARTAGEES = ['../../components/RankIcons', '../../components/QuestIcons'];

for (const fichier of PANNEAUX) {
  test(`${fichier} n’emprunte rien à l’habillage legacy`, () => {
    const src = code(fichier);
    for (const [pattern, message] of LEGACY_SIGNS) {
      assert.doesNotMatch(src, pattern, `${fichier} : ${message}`);
    }
  });

  test(`${fichier} n’importe de components/ que les jeux d’icônes déclarés`, () => {
    const src = code(fichier);
    const imports = [...src.matchAll(/from '(\.\.\/\.\.\/components\/[^']+)'/g)].map((m) => m[1]);
    const horsListe = imports.filter((i) => !ICONES_PARTAGEES.includes(i));
    assert.deepEqual(
      horsListe,
      [],
      `${fichier} : composant legacy importé (${horsListe.join(', ')}) — il apporte son habillage sombre`
    );
  });

  test(`toute variable CSS consommée par ${fichier} est un token --p-*`, () => {
    const src = code(fichier);
    const tokens = [...src.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    const horsPerimetre = [...new Set(tokens)].filter((tk) => !tk.startsWith('--p-'));
    assert.deepEqual(horsPerimetre, [], `${fichier} : token hors charte premium — ${horsPerimetre.join(', ')}`);
  });

  test(`les tokens --p-* de ${fichier} existent réellement dans premium.css`, () => {
    const css = readFileSync(new URL('../src/styles/premium.css', import.meta.url), 'utf8');
    const inconnus = [...new Set([...code(fichier).matchAll(/var\((--p-[a-z0-9-]+)/g)].map((m) => m[1]))]
      .filter((tk) => !css.includes(`${tk}:`));
    assert.deepEqual(inconnus, [], `token déclaré nulle part : ${inconnus.join(', ')}`);
  });
}

test('les icônes déclarées comme partagées existent bien', () => {
  for (const chemin of ICONES_PARTAGEES) {
    const rel = chemin.replace('../../', '../src/');
    assert.ok(
      readFileSync(new URL(`${rel}.tsx`, import.meta.url), 'utf8').length > 0,
      `jeu d’icônes déclaré introuvable : ${chemin}`
    );
  }
});

// ─── 4. Les composants emploient les lecteurs qui rapportent l'échec ──

test('aucun composant migré ne lit la gamification par un lecteur qui avale l’échec', () => {
  const coupables: string[] = [];
  for (const fichier of PANNEAUX) {
    for (const nom of lecteursAvalants(code(fichier))) coupables.push(`${fichier} → ${nom}`);
  }
  assert.deepEqual(
    coupables,
    [],
    `lecteur(s) qui convertissent un échec en valeur de repli : ${coupables.join(', ')} — ` +
      'utiliser la variante …Result et afficher l’erreur'
  );
});

test('chaque variante …Result a un socle réel et sa variante d’origine en délégation', () => {
  const lib = stripComments(readFileSync(new URL('../src/lib/gamification.ts', import.meta.url), 'utf8'));
  for (const nom of LECTEURS_AVALANTS) {
    const variante = `${nom}Result`;
    assert.match(
      lib,
      new RegExp(`export async function ${variante}\\b`),
      `${variante} manquante : la page n’a plus de quoi distinguer « vide » de « injoignable »`
    );
    // La variante d'origine doit DÉLÉGUER. Si elle réinterrogeait la base pour
    // son compte, les deux pourraient diverger (l'une filtrant, l'autre pas)
    // sans que rien ne casse — c'est le doublon qu'on refuse.
    const delegue = new RegExp(
      `export async function ${nom}\\([^)]*\\)[^{]*\\{\\s*const r = await ${variante}\\(`
    );
    assert.match(lib, delegue, `${nom} ne délègue pas à ${variante}`);
  }
});

test('les composants migrés exposent une surface d’erreur annoncée', () => {
  const manquantes: string[] = [];
  for (const fichier of PANNEAUX) {
    const src = code(fichier);
    if (!/\bsetError\b/.test(src)) manquantes.push(`${fichier} : aucun état d’erreur`);
    if (!/role="alert"/.test(src)) manquantes.push(`${fichier} : erreur non annoncée (role="alert" absent)`);
  }
  assert.deepEqual(
    manquantes,
    [],
    `composant(s) incapable(s) de dire que la lecture a échoué : ${manquantes.join(', ')}`
  );
});

// ─── 5. Clés i18n présentes en FR ET en EN ────────────────────────────

const FR_FILES = ['fr.ts', 'fr.settings.ts', 'fr.v2.ts', 'fr.walletPanel.ts'];
const EN_FILES = ['en.ts', 'en.settings.ts', 'en.v2.ts', 'en.walletPanel.ts'];

const readI18n = (files: string[]): string =>
  files.map((f) => readFileSync(new URL(`../src/lib/i18n/${f}`, import.meta.url), 'utf8')).join('\n');

/** Bloc source d'un namespace écrit sur place, borné par l'indentation — pas
 *  de comptage d'accolades, qui se trompe dès qu'une traduction contient
 *  `{` (ex. « {{n}} XP »). Même principe que premium-social.test.ts. */
function namespaceBlock(src: string, ns: string): string | undefined {
  const start = src.search(new RegExp(`(^|\\n) {2}${ns}: \\{`));
  if (start < 0) return undefined;
  const rest = src.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-zA-Z0-9_]+: /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/**
 * Où vit chaque clé. `encoreDans` distingue les deux formes réelles du
 * projet : un namespace écrit EN PLACE dans fr.ts (`  gamification: { … }`),
 * et un namespace EXTRAIT dans son propre fichier (`frWalletPanel.ts`, `{ heading: … }`).
 * Chercher `walletPanel: {` dans fr.ts ne trouverait rien — c'est le piège qui
 * ferait croire à une clé manquante alors qu'elle est bien là.
 */
test('les nouvelles clés i18n existent en FR et en EN', () => {
  const attendues: Array<{ ns: string; cle: string; encoreDans: 'fr.ts' | 'fr.walletPanel.ts' }> = [
    { ns: 'gamification', cle: 'offline', encoreDans: 'fr.ts' },
    { ns: 'walletPanel', cle: 'tokensError', encoreDans: 'fr.walletPanel.ts' },
    { ns: 'profile', cle: 'avatarUploaded', encoreDans: 'fr.ts' },
  ];
  const manquantes: string[] = [];
  for (const { ns, cle, encoreDans } of attendues) {
    const jumeau = encoreDans.replace('fr.', 'en.');
    for (const [langue, fichier] of [
      ['FR', encoreDans],
      ['EN', jumeau],
    ] as const) {
      const src = readFileSync(new URL(`../src/lib/i18n/${fichier}`, import.meta.url), 'utf8');
      // Namespace en place : on borne au bloc. Namespace extrait : le fichier
      // entier EST le bloc.
      const portee = encoreDans.endsWith('fr.ts') ? namespaceBlock(src, ns) : src;
      if (!portee || !new RegExp(`\\b${cle}:\\s*['"\`]`).test(portee)) {
        manquantes.push(`${ns}.${cle} (${langue})`);
      }
    }
  }
  assert.deepEqual(manquantes, [], `clé(s) i18n absente(s) d’un dictionnaire : ${manquantes.join(', ')}`);
});

test('les 7 rangs ont leur libellé dans les deux langues', () => {
  // Les clés de rang sont appelées en dynamique (`t(\`gamification.${rankKey}\`)`),
  // donc un scan de chaînes littérales ne les voit pas : c'est exactement le
  // trou par lequel « gamification.rankLegendary » s'afficherait à l'écran
  // dans une seule langue sans qu'aucun test ne bronche.
  const fr = readI18n(FR_FILES);
  const en = readI18n(EN_FILES);
  const rangs = [
    'rankAnon',
    'rankContributor',
    'rankBuilder',
    'rankShipwright',
    'rankArchitect',
    'rankVeteran',
    'rankLegendary',
  ];
  const manquants: string[] = [];
  for (const rang of rangs) {
    for (const [langue, dict] of [['FR', fr], ['EN', en]] as const) {
      const bloc = namespaceBlock(dict, 'gamification');
      if (!bloc || !new RegExp(`\\b${rang}:\\s*['"\`]`).test(bloc)) manquants.push(`${rang} (${langue})`);
    }
  }
  assert.deepEqual(manquants, [], `rang(s) sans libellé : ${manquants.join(', ')}`);
});
