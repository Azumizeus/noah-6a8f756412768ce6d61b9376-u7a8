// scripts/premium-social.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de la famille sociale migrée de /v1 vers le premium :
// notation, fiche détaillée d'un builder, demande de contact, sessions de
// chat.
//
// Contexte : ces quatre fonctions n'existaient QUE côté legacy
// (`BuildersPage`, `MonProfilPage`) — c'étaient des « perdues » de
// `INVENTAIRE-V1-2026-10-08.md` § 3. Les retirer avec /v1 aurait retiré des
// fonctions utilisateur, pas de la dette d'habillage. Trois règles ici :
//
//   1. Les pages premium DOIVENT passer par les nouveaux composants — sinon
//      la fonction redevient dépendante du legacy au premier remaniement de
//      page, et l'inventaire redevient vrai.
//   2. Les composants sociaux premium ne reprennent AUCUN habillage legacy
//      (ni classe Tailwind sombre, ni `--accent-violet`, ni `glass-panel`) :
//      c'est ce qui leur fait suivre gratuitement les 4 palettes × 2 modes.
//   3. La logique n'est jamais dupliquée — les composants appellent
//      `lib/contact.ts`, `lib/chat.ts` et `lib/chatSession.ts`, les mêmes
//      modules que le legacy, donc une note ou une révocation faite d'un côté
//      est vue de l'autre.
//
// Lecture du source + dictionnaires (pas de DOM) : même parti pris que
// premium-settings.test.ts — le projet n'a pas de jsdom, et une clé i18n
// manquante d'un seul côté est précisément le bug qu'aucun écran ne montre.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DOSSIER = new URL('../src/pages/premium/', import.meta.url);
const lire = (nom: string): string => readFileSync(new URL(nom, DOSSIER), 'utf8');

/** Source sans ses commentaires : plusieurs en-têtes citent les composants
 *  legacy pour EXPLIQUER qu'ils ne les utilisent pas ; un scan naïf y lirait
 *  une dépendance. Même limite assumée que premium-settings.test.ts : un bloc
 *  commentaire écrit DANS une chaîne serait retiré aussi, et ces fichiers n'en
 *  contiennent aucun. */
const stripComments = (src: string): string =>
  src
    .replace(/^[ \t]*\{\s*\/\*[\s\S]*?\*\/\s*\}[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .split('\n')
    .filter((line) => !/^[ \t]*(\/\/|\*)/.test(line))
    .join('\n');

const code = (nom: string): string => stripComments(lire(nom));

/** Les quatre composants de la famille sociale premium. */
const SOCIAUX = [
  'PremiumStarRating.tsx',
  'PremiumBuilderDetail.tsx',
  'PremiumContactDialog.tsx',
  'PremiumChatSessions.tsx',
] as const;

// ─── 1. Les pages passent par les composants migrés ───────────────────

test('PremiumBuilders rend notation, fiche détaillée et demande de contact', () => {
  const src = code('PremiumBuilders.tsx');
  assert.match(src, /import PremiumStarRating from '\.\/PremiumStarRating'/, 'notation : import manquant');
  assert.match(src, /<PremiumStarRating/, 'la notation n’est pas rendue');
  assert.match(src, /import PremiumBuilderDetail from '\.\/PremiumBuilderDetail'/, 'fiche : import manquant');
  assert.match(src, /<PremiumBuilderDetail/, 'la fiche détaillée n’est pas rendue');
  assert.match(src, /import PremiumContactDialog from '\.\/PremiumContactDialog'/, 'contact : import manquant');
  assert.match(src, /<PremiumContactDialog/, 'la demande de contact n’est pas rendue');
});

test('PremiumBuilders passe par les libs partagées, pas par une copie locale', () => {
  const src = code('PremiumBuilders.tsx');
  assert.match(src, /fetchRatingSummaries/, 'les moyennes doivent venir de lib/contact');
  assert.match(src, /submitRating/, 'la notation doit passer par submitRating (signée)');
  assert.match(src, /listAllProfilesResult/, 'l’annuaire doit distinguer « vide » de « injoignable »');
  // Le message signé et l’appel à l’Edge Function vivent dans lib/contact :
  // les rejouer ici créerait un second contrat à tenir à jour.
  assert.doesNotMatch(src, /buildContactSignMessage/, 'message de signature recopié au lieu d’être partagé');
  assert.doesNotMatch(src, /functions\/v1\/contact/, 'URL d’Edge Function recopiée dans une page');
});

test('PremiumProfil monte le panneau Sessions de chat', () => {
  const src = code('PremiumProfil.tsx');
  assert.match(src, /import PremiumChatSessions from '\.\/PremiumChatSessions'/, 'import manquant');
  assert.match(src, /<PremiumChatSessions/, 'le panneau n’est pas rendu');
  // Sans wallet, la liste porterait sur le wallet de personne et la
  // révocation demanderait une signature impossible : le montage est gardé.
  assert.match(src, /\{myAddr && <PremiumChatSessions/, 'le panneau doit être conditionné au wallet');
});

// ─── 2. Aucun habillage legacy dans les composants sociaux ────────────

const LEGACY_SIGNS: Array<[RegExp, string]> = [
  [/\btext-ink-\d/, 'encre legacy (text-ink-*) : invisible ou hors palette sur l’ivoire'],
  [/\btext-white\b/, 'blanc legacy : pensé pour le fond noir, illisible en mode clair'],
  [/--accent-violet/, 'token legacy : ne suit ni la palette ni le mode sombre'],
  [/\bglass-panel\b/, 'panneau legacy : palette sombre figée'],
  [/rgba?\(/, 'couleur littérale : la modale doit prendre un token de palette (ex. --p-overlay)'],
  [/from '\.\.\/\.\.\/components\//, 'un composant legacy importé apporte son habillage sombre'],
];

for (const fichier of SOCIAUX) {
  test(`${fichier} n’emprunte rien à l’habillage legacy`, () => {
    const src = code(fichier);
    for (const [pattern, message] of LEGACY_SIGNS) {
      assert.doesNotMatch(src, pattern, `${fichier} : ${message}`);
    }
  });
}

/** Les classes autorisées sont dérivées de `premium.css`, la source unique :
 *  `p-btn` y est `.p-btn`, et les modificateurs (`primary`, `ghost`, `ok`…)
 *  n'existent que sous la forme composée `.p-btn.primary`. Exiger un préfixe
 *  `p-` sur CHAQUE jeton aurait donc rejeté la forme réelle du projet ; tester
 *  l'existence du sélecteur attrape en revanche une classe inventée. */
test('les composants sociaux n’utilisent que des classes déclarées dans premium.css', () => {
  const css = readFileSync(new URL('../src/styles/premium.css', import.meta.url), 'utf8');
  for (const fichier of SOCIAUX) {
    const src = code(fichier);
    for (const m of src.matchAll(/className="([^"]*)"/g)) {
      const tokens = m[1].split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        assert.ok(
          css.includes(`.${token}`),
          `${fichier} : classe « ${token} » absente de premium.css — un composant premium ne porte que des classes .p-* (et leurs modificateurs) définies là-bas`
        );
      }
    }
  }
});

test('toute variable CSS consommée par un composant social est un token --p-*', () => {
  for (const fichier of SOCIAUX) {
    const src = code(fichier);
    const tokens = [...src.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    const horsPerimetre = [...new Set(tokens)].filter((tk) => !tk.startsWith('--p-'));
    assert.deepEqual(horsPerimetre, [], `${fichier} : token hors charte premium — ${horsPerimetre.join(', ')}`);
  }
});

test('les tokens --p-* des composants sociaux existent réellement dans premium.css', () => {
  const css = readFileSync(new URL('../src/styles/premium.css', import.meta.url), 'utf8');
  const inconnus: string[] = [];
  for (const fichier of SOCIAUX) {
    const src = code(fichier);
    const tokens = [...new Set([...src.matchAll(/var\((--p-[a-z0-9-]+)/g)].map((m) => m[1]))];
    for (const tk of tokens) if (!css.includes(`${tk}:`)) inconnus.push(`${fichier}:${tk}`);
  }
  assert.deepEqual(inconnus, [], `token déclaré nulle part : ${inconnus.join(', ')}`);
});

// ─── 3. Clés i18n présentes en FR ET en EN ────────────────────────────

const FR_FILES = ['fr.ts', 'fr.settings.ts', 'fr.v2.ts', 'fr.walletPanel.ts'];
const EN_FILES = ['en.ts', 'en.settings.ts', 'en.v2.ts', 'en.walletPanel.ts'];

const readI18n = (files: string[]): string =>
  files.map((f) => readFileSync(new URL(`../src/lib/i18n/${f}`, import.meta.url), 'utf8')).join('\n');

/** Bloc source d'un namespace écrit sur place (`  clé: { … }`), borné par
 *  l'indentation : pas de comptage d'accolades, qui se trompe dès qu'une
 *  traduction contient `{` (ex. « {{pseudo}} »). Même principe que
 *  premium-settings.test.ts. */
function namespaceBlock(src: string, ns: string): string | undefined {
  const start = src.search(new RegExp(`(^|\\n) {2}${ns}: \\{`));
  if (start < 0) return undefined;
  const rest = src.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-zA-Z0-9_]+: /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** Clés candidates : chaînes pointées du source (`a.b`). */
const usedKeys = (src: string): string[] => {
  const raw = [...src.matchAll(/'([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+)'/g)].map((m) => m[1]);
  return [...new Set(raw)];
};

test('toutes les clés t() des pages et composants sociaux existent en FR et en EN', () => {
  const fichiers = [...SOCIAUX, 'PremiumBuilders.tsx'];
  const fr = readI18n(FR_FILES);
  const en = readI18n(EN_FILES);
  const manquantes: string[] = [];

  for (const fichier of fichiers) {
    for (const k of usedKeys(code(fichier))) {
      const [ns, key] = k.split('.');
      for (const [langue, dict] of [['FR', fr], ['EN', en]] as const) {
        const bloc = namespaceBlock(dict, ns);
        // Une valeur peut être entre apostrophes, guillemets ou backticks :
        // `viewAria: "Disposition de l'affichage"` est légitime, et l'exiger
        // en apostrophes ferait échouer le contrôle sur du code correct.
        if (!bloc || !new RegExp(`\\b${key}:\\s*['"\`]`).test(bloc)) {
          manquantes.push(`${fichier} → ${k} (${langue})`);
        }
      }
    }
  }

  assert.deepEqual(manquantes, [], `clé(s) i18n absente(s) d’un dictionnaire : ${manquantes.join(', ')}`);
});

test('le namespace chatSession est symétrique en FR et en EN', () => {
  const fr = namespaceBlock(readI18n(FR_FILES), 'chatSession');
  const en = namespaceBlock(readI18n(EN_FILES), 'chatSession');
  assert.ok(fr, 'namespace chatSession absent du dictionnaire FR');
  assert.ok(en, 'namespace chatSession absent du dictionnaire EN');

  const cles = (bloc: string) => [...new Set([...bloc.matchAll(/^ {4}([a-zA-Z0-9_]+):/gm)].map((m) => m[1]))].sort();
  assert.deepEqual(
    cles(en as string),
    cles(fr as string),
    'les deux langues doivent exposer exactement les mêmes clés de sessions de chat'
  );
  assert.ok(cles(fr as string).length >= 8, `namespace chatSession soupçonné d’être incomplet : ${cles(fr as string).length} clé(s)`);
});
