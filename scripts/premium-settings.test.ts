// scripts/premium-settings.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du panneau Paramètres premium (l'entrée ⚙️ de PremiumNav).
//
// Contexte : le shell premium n'avait AUCUN accès aux réglages — il fallait
// taper /v1/profile à la main, et le panneau qui s'y ouvrait était habillé
// en tokens legacy sombres (fix du 08/10). Trois règles ici, chacune pour un
// piège précis :
//
//   1. PremiumNav expose l'entrée ET monte le panneau. PremiumNav est le
//      seul point commun aux 10 pages premium : si le montage descend dans
//      une page, les 9 autres perdent les réglages sans que rien ne casse.
//   2. PremiumSettings ne se sert QUE de tokens `--p-*` — aucune classe
//      Tailwind legacy, aucun `--accent-violet`, aucun `className`. C'est
//      exactement ce qui lui fait suivre gratuitement les 4 palettes × 2
//      modes ; un seul token legacy et il détonne dans 7 combinaisons sur 8.
//   3. toutes les clés t() du panneau existent en FR **et** en EN, et le
//      panneau réutilise les libs partagées (densité, affichage USD, RPC) au
//      lieu de rejouer les clés localStorage — un réglage changé depuis le
//      legacy doit être vu ici, et inversement.
//
// Lecture du source + dictionnaires importés (pas de DOM) : même parti pris
// que premium-card.test.ts — le projet n'a pas de jsdom, et une clé i18n
// manquante d'un seul côté est précisément le bug qu'aucun écran ne montre
// (la bonne langue s'affiche, l'autre affiche « settings.rpcHeading »).
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readPremium = (name: string): string =>
  readFileSync(new URL(`../src/pages/premium/${name}`, import.meta.url), 'utf8');

/** Source sans ses commentaires : les règles ci-dessous visent le CODE. Le
 *  panneau cite `ProfileSettingsModal` dans son en-tête pour expliquer
 *  pourquoi il ne l'utilise PAS — un scan naïf y verrait une dépendance.
 *  Limite assumée : un bloc `/* … *\/` écrit DANS une chaîne de caractères
 *  serait retiré aussi ; ce fichier n'en contient aucun. */
// Un `/*` doit être en début de ligne pour être traité comme un commentaire :
// le fichier parle de `/v1/*` en pleine phrase, et un `\/\*[\s\S]*?\*\/`
// non ancré partait de là pour avaler les imports et la première fonction.
const stripComments = (src: string): string =>
  src
    .replace(/^[ \t]*\{\s*\/\*[\s\S]*?\*\/\s*\}[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .split('\n')
    .filter((line) => !/^[ \t]*(\/\/|\*)/.test(line))
    .join('\n');

const readPremiumCode = (name: string): string => stripComments(readPremium(name));

// ─── 1. L'entrée ⚙️ et le montage du panneau ──────────────────────────

test('PremiumNav monte le panneau Paramètres', () => {
  const src = readPremium('PremiumNav.tsx');
  assert.match(src, /import PremiumSettings from '\.\/PremiumSettings'/, 'import manquant');
  assert.match(src, /<PremiumSettings/, 'le panneau doit être rendu par la nav, pas par chaque page');
});

test('PremiumNav expose une entrée ⚙️ ouvrant une modale', () => {
  const src = readPremium('PremiumNav.tsx');
  assert.match(src, /aria-haspopup="dialog"/, 'l’entrée ⚙️ doit s’annoncer comme ouvrant une modale');
  assert.match(src, /onClick=\{\(\) => setSettingsOpen\(true\)\}/, 'l’entrée doit ouvrir le panneau');
  assert.match(src, /t\('profile\.settingsTitle'\)/, 'libellé accessible attendu (pas un titre en dur)');
});

test('le panneau existe au chemin attendu et sait se fermer', () => {
  const src = readPremium('PremiumSettings.tsx');
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /Escape/, 'la touche Échap doit fermer, comme les autres modales');
  assert.match(src, /onClose/, 'la fermeture doit passer par la prop, pas par un état local');
});

// ─── 2. Habillage : tokens premium uniquement ─────────────────────────

const LEGACY_SIGNS: Array<[RegExp, string]> = [
  [/className\s*=/, 'classe Tailwind détectée : ce panneau doit rester en styles inline tokens --p-*'],
  [/--accent-violet/, 'token legacy : --accent-violet ne suit ni la palette ni le mode sombre'],
  [/modal-surface|bg-black\/70|text-white|text-ink-\d/, 'habillage legacy (ProfileSettingsModal) recopié'],
  [/ProfileSettingsModal/, 'le panneau premium ne doit pas dépendre du panneau legacy'],
];

test('PremiumSettings n’emprunte rien à l’habillage legacy', () => {
  const src = readPremiumCode('PremiumSettings.tsx');
  for (const [pattern, message] of LEGACY_SIGNS) {
    assert.doesNotMatch(src, pattern, message);
  }
});

test('PremiumSettings : toute variable CSS consommée est un token --p-*', () => {
  const src = readPremiumCode('PremiumSettings.tsx');
  const tokens = [...src.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
  assert.ok(tokens.length > 0, 'aucun token utilisé : le panneau ne suivrait pas le thème');
  const horsPerimetre = [...new Set(tokens)].filter((t) => !t.startsWith('--p-'));
  assert.deepEqual(
    horsPerimetre,
    [],
    `token hors charte premium : ${horsPerimetre.join(', ')} — utiliser un --p-* de premium.css`
  );
});

test('PremiumSettings : les tokens --p-* utilisés existent réellement dans premium.css', () => {
  const css = readFileSync(new URL('../src/styles/premium.css', import.meta.url), 'utf8');
  const src = readPremiumCode('PremiumSettings.tsx');
  const tokens = [...new Set([...src.matchAll(/var\((--p-[a-z0-9-]+)/g)].map((m) => m[1]))];
  const inconnus = tokens.filter((t) => !css.includes(`${t}:`));
  assert.deepEqual(inconnus, [], `token déclaré nulle part : ${inconnus.join(', ')}`);
});

// ─── 3. Clés i18n et libs partagées ───────────────────────────────────

// Les dictionnaires sont importables par Vite… mais pas par `node --test` :
// fr.ts importe './fr.settings' sans extension, ce qu'ESM refuse hors bundler.
// On lit donc les sources de dictionnaires, comme le fait déjà
// premium-card.test.ts pour les pages. La clé est cherchée dans le BLOC du
// namespace (entre son ouverture et le namespace suivant), pas dans tout le
// fichier : sinon un `save:` du namespace `common` validerait un
// `common.save` oublié ailleurs.
const FR_FILES = ['fr.ts', 'fr.settings.ts', 'fr.v2.ts', 'fr.walletPanel.ts'];
const EN_FILES = ['en.ts', 'en.settings.ts', 'en.v2.ts', 'en.walletPanel.ts'];

const readI18n = (files: string[]): string =>
  files.map((f) => readFileSync(new URL(`../src/lib/i18n/${f}`, import.meta.url), 'utf8')).join('\n');

/** Bloc source d'un namespace, dans les deux formes que le projet utilise :
 *
 *   1. objet écrit sur place — `  settings: { … }` (le cas de `theme`) ;
 *   2. objet extrait dans son propre fichier — `  settings: frSettings,`
 *      dans fr.ts, l'objet vivant dans fr.settings.ts. Un namespace
 *      « raccroché » se reconnaît à la valeur qui est un identifiant.
 *
 *  Bornes trouvées par indentation (`\n  clé: `) pour le cas 1, par la
 *  déclaration `export const X: Dict = {` puis `\n};` pour le cas 2 : pas de
 *  comptage d'accolades, qui se trompe dès qu'une traduction contient `{`. */
function namespaceBlock(src: string, ns: string): string | undefined {
  const inline = src.search(new RegExp(`(^|\\n) {2}${ns}: \\{`));
  if (inline >= 0) {
    const rest = src.slice(inline + 1);
    const next = rest.slice(1).search(/\n {2}[a-zA-Z0-9_]+: /);
    return next < 0 ? rest : rest.slice(0, next + 1);
  }

  const alias = new RegExp(`(^|\\n) {2}${ns}: ([A-Za-z_][A-Za-z0-9_]*),`).exec(src);
  if (!alias) return undefined;
  const decl = new RegExp(`\\nexport const ${alias[2]}: Dict = \\{`).exec(src);
  if (!decl) return undefined;
  const start = decl.index + decl[0].length - 1;
  const end = src.slice(start).search(/\n\};/);
  return end < 0 ? src.slice(start) : src.slice(start, start + end);
}

/** Clés candidates : chaînes pointées du source. Attrape aussi les clés
 *  choisies dans un ternaire (`t(cond ? 'x.a' : 'x.b')`), que le motif
 *  `t('…')` laisserait échapper. */
function usedKeys(src: string): string[] {
  const raw = [...src.matchAll(/'([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+)'/g)].map((m) => m[1]);
  return [...new Set(raw)];
}

test('chaque clé t() du panneau existe en français ET en anglais', () => {
  const keys = usedKeys(readPremium('PremiumSettings.tsx'));
  assert.ok(keys.length >= 10, `extraction suspecte : ${keys.length} clé(s) trouvée(s)`);
  // Le helper ne descend pas plus bas qu'un namespace : le dire fort plutôt
  // que de laisser passer une clé à 3 segments non vérifiée.
  const tropProfondes = keys.filter((k) => k.split('.').length !== 2);
  assert.deepEqual(tropProfondes, [], `clé à plus de 2 segments — étendre namespaceBlock : ${tropProfondes.join(', ')}`);

  const frSrc = readI18n(FR_FILES);
  const enSrc = readI18n(EN_FILES);
  const manquantes = keys.filter((k) => {
    const [ns, leaf] = k.split('.');
    const frBlock = namespaceBlock(frSrc, ns);
    const enBlock = namespaceBlock(enSrc, ns);
    const dans = (block: string | undefined) => !!block && new RegExp(`\\b${leaf}:`).test(block);
    return !dans(frBlock) || !dans(enBlock);
  });
  assert.deepEqual(manquantes, [], `clé(s) i18n absente(s) d’un dictionnaire : ${manquantes.join(', ')}`);
});

test('le namespace theme déclare son titre de section dans les deux langues', () => {
  // Cas concret qui a motivé la règle : `theme.appearanceHeading` a été
  // ajouté pour le panneau premium. En anglais seulement, la section
  // s'afficherait « theme.appearanceHeading » — invisible depuis le FR.
  assert.match(namespaceBlock(readI18n(FR_FILES), 'theme') ?? '', /\bappearanceHeading:/);
  assert.match(namespaceBlock(readI18n(EN_FILES), 'theme') ?? '', /\bappearanceHeading:/);
});

// ─── 4. Réglages migrés du panneau legacy (08/10) ─────────────────────

// Contexte : un utilisateur du shell premium n'avait accès NI aux
// notifications, NI à la confidentialité, NI à l'export CSV, NI à l'aperçu
// grand format — ces 4 réglages ne vivaient que dans ProfileSettingsModal,
// derrière /v1/profile. Les tests ci-dessous figent la migration : si un
// refactor les retire, la perte est visible ici plutôt qu'en production.

test('les 4 réglages migrés ont chacun leur section', () => {
  const src = readPremium('PremiumSettings.tsx');
  const sections = [
    'settings.notificationsHeading',
    'settings.privacyHeading',
    'settings.exportHeading',
    'theme.previewHeading',
  ];
  for (const key of sections) {
    assert.ok(src.includes(`t('${key}')`), `section manquante : ${key}`);
  }
});

test('les réglages migrés passent par les libs, pas par une réécriture', () => {
  const src = readPremiumCode('PremiumSettings.tsx');
  const libs: Array<[RegExp, string]> = [
    [/from '\.\.\/\.\.\/lib\/notificationPrefs'/, 'notifications : préférences locales partagées'],
    [/from '\.\.\/\.\.\/lib\/pushNotifications'/, 'notifications : abonnement push partagé'],
    [/from '\.\.\/\.\.\/lib\/csvExport'/, 'export CSV : générateur partagé'],
    [/from '\.\.\/\.\.\/lib\/profileRemote'/, 'confidentialité : profil distant partagé'],
    [/from '\.\.\/\.\.\/lib\/ThemeContext'/, 'aperçu image : état partagé avec les cards'],
  ];
  for (const [pattern, message] of libs) {
    assert.match(src, pattern, message);
  }
});

// Piège précis : `hideWallet` est un champ de PROFIL, pas une clé locale.
// Une case à cocher qui ne s'enregistre nulle part donnerait l'illusion d'un
// réglage appliqué — c'est pire que l'absence du réglage.
test('l’enregistrement de la confidentialité repart du profil distant', () => {
  const src = readPremiumCode('PremiumSettings.tsx');
  assert.match(src, /fetchProfile\(/, 'le profil doit être relu avant écriture');
  assert.match(src, /submitProfileUpdate\(/, 'l’écriture doit passer par la lib signée');
  assert.match(src, /\.\.\.base/, 'fusion avec le profil existant (sinon les champs omis sont effacés)');
});

// Le panneau legacy gardait sa propre séquence d'abonnement push, avec un
// try/catch qui garantit que l'interrupteur ne reste JAMAIS sur « busy ».
// La version premium doit conserver ce filet : sans lui, une promesse
// rejetée laisse le contrôle mort jusqu'au rechargement de la page.
test('l’abonnement push garde le filet anti-blocage du panneau legacy', () => {
  const src = readPremiumCode('PremiumSettings.tsx');
  assert.match(src, /catch\s*\{/, 'try/catch de sécurité attendu autour de l’abonnement');
  assert.match(src, /setPushState\('off'\)/, 'retour à un état stable si l’abonnement échoue');
});

test('le panneau réutilise les libs partagées au lieu de rejouer le stockage', () => {
  const src = readPremiumCode('PremiumSettings.tsx');
  assert.match(src, /from '\.\.\/\.\.\/hooks\/useDensity'/, 'densité : passer par le hook partagé');
  assert.match(src, /from '\.\.\/\.\.\/lib\/usdDisplay'/, 'affichage USD : passer par la lib partagée');
  assert.match(src, /from '\.\.\/\.\.\/lib\/constants'/, 'RPC : passer par la lib partagée');
  assert.match(src, /from '\.\.\/\.\.\/lib\/appearance'/, 'apparence : passer par les hooks d’apparence');
  // Les clés localStorage en dur signeraient une réécriture de la lib : un
  // réglage changé ici ne serait plus relu par le reste de l'app.
  assert.doesNotMatch(src, /localStorage/, 'aucun accès direct au stockage (les libs s’en chargent)');
});
