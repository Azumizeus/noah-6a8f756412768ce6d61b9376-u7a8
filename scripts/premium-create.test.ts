// scripts/premium-create.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du chantier 2 — la création de pact en shell premium.
//
// Le wizard de création (`CreatePactWizard`, 1030 lignes + `wizard/*`) envoie
// des TRANSACTIONS : il ne devait pas être réécrit, seulement ré-habillé.
// D'où deux familles de règles, et chacune vise un piège précis :
//
//   1. PÉRIMÈTRE — la page premium ne contient QUE de l'habillage. Si un
//      import d'anchor, de web3 ou d'un hook wallet apparaît ici, c'est que
//      la logique a été recopiée : deux chemins de signature à maintenir, et
//      celui-ci n'est couvert par aucun test de transaction.
//   2. PARITÉ — la page premium doit se comporter comme la page legacy :
//      mêmes redirections de succès et de fermeture. Sinon créer un pact
//      depuis le premium n'atterrit pas au même endroit que depuis /v1.
//   3. PEINTURE — l'habillage est une PEAU (`.p-legacy-skin`) qui réécrit
//      les variables historiques avec les valeurs des palettes premium.
//      Le test recalcule lui-même ces valeurs depuis `premium.css` : si une
//      palette change sans régénérer la peau, il échoue en nommant la
//      variable. Sans ce contrôle, la peau dériverait en silence et le
//      wizard afficherait un contraste calculé pour l'ancien thème.
//   4. COUVERTURE — les couleurs sémantiques du wizard (ambre = attention,
//      émeraude = succès, rouge = erreur) sont écrites en palette Tailwind
//      figée, pensée pour le noir. Sur l'ivoire premium elles disparaissent.
//      Chaque classe réellement utilisée doit donc avoir sa règle de peau —
//      et le test relit les sources du wizard pour le vérifier, classes par
//      classes, plutôt que de faire confiance à une liste recopiée à la main.
//
// Lecture du source uniquement (pas de DOM) : même parti pris que
// premium-settings.test.ts / premium-card.test.ts.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const url = (rel: string) => new URL(`../${rel}`, import.meta.url);
const read = (rel: string) => readFileSync(url(rel), 'utf8');

/** Retire les commentaires : les règles ci-dessous visent le CODE, or les
 *  en-têtes du projet citent justement les symboles qu'il ne faut pas
 *  utiliser (pour expliquer pourquoi). Non ancré sur `/*` : le fichier parle
 *  de `/v1/*` en pleine phrase. */
const stripComments = (src: string): string =>
  src
    .replace(/^[ \t]*\{\s*\/\*[\s\S]*?\*\/\s*\}[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .split('\n')
    .filter((line) => !/^[ \t]*(\/\/|\*)/.test(line))
    .join('\n');

const at = (rel: string) => stripComments(read(rel));

// ─── 1. Périmètre : habillage seulement ──────────────────────────────

const LOGIC_SIGNS: Array<[RegExp, string]> = [
  [/from '.*(lib\/anchor|@solana\/web3\.js|@solana\/wallet-adapter)/, 'import de logique on-chain : la page ne doit faire que l’habillage'],
  [/\b(createProject|addMember|uploadMediaFile|saveProjectMedia)\s*\(/, 'appel de logique métier recopié'],
  [/useAnchorProgram|useWallet\b/, 'la page n’a pas à lire l’état du wallet — le wizard s’en charge'],
];

test('PremiumCreate ne contient aucune logique — habillage uniquement', () => {
  const src = at('src/pages/premium/PremiumCreate.tsx');
  for (const [pattern, message] of LOGIC_SIGNS) {
    assert.doesNotMatch(src, pattern, message);
  }
});

test('PremiumCreate rend le wizard existant au lieu de le réécrire', () => {
  const src = at('src/pages/premium/PremiumCreate.tsx');
  assert.match(src, /import \{ CreatePactWizard \} from '\.\.\/\.\.\/components\/CreatePactWizard'/, 'import du wizard attendu');
  assert.match(src, /<CreatePactWizard/, 'le wizard doit être rendu, pas réimplémenté');
  // Le wizard est le seul composant lourd de la page : si un autre composant
  // de création apparaît, c'est une seconde implémentation à maintenir.
  const composants = [...src.matchAll(/from '.*components\/([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(composants, ['CreatePactWizard'], `composant inattendu dans la page : ${composants.join(', ')}`);
});

// ─── 2. Parité de comportement avec la page legacy ───────────────────

test('les redirections de succès et de fermeture sont celles du legacy', () => {
  const premium = at('src/pages/premium/PremiumCreate.tsx');
  const legacy = at('src/pages/CreatePactPage.tsx');
  for (const hash of ['#/pacts?mine=1', '#/pacts']) {
    assert.ok(legacy.includes(hash), `référence : la page legacy ne contient plus ${hash}`);
    assert.ok(premium.includes(hash), `redirection manquante côté premium : ${hash}`);
  }
  assert.match(premium, /onSuccess=/, 'onSuccess doit rester câblé');
  assert.match(premium, /onClose=/, 'onClose doit rester câblé');
});

test('#/create sert la page premium et /v1/create reste le filet legacy', () => {
  const src = at('src/App.tsx');
  assert.match(src, /route === '\/create' \? \(\s*<PremiumCreate \/>/, 'la route /create doit servir le shell premium');
  assert.match(src, /route === '\/v1\/create' \? \(\s*<CreatePactPage \/>/, '/v1/create doit rester branché tant que le chantier 3 n’est pas fait');
  assert.match(src, /import PremiumCreate from '\.\/pages\/premium\/PremiumCreate'/);
});

test('la peau est portée par un conteneur AUTOUR du wizard', () => {
  const src = at('src/pages/premium/PremiumCreate.tsx');
  const skin = src.indexOf('p-legacy-skin');
  const wizard = src.indexOf('<CreatePactWizard');
  assert.ok(skin >= 0, 'classe .p-legacy-skin absente : le wizard resterait en couleurs legacy');
  assert.ok(wizard > skin, 'la classe doit envelopper le wizard (sinon elle ne l’atteint pas)');
});

test('le wizard ne prend AUCUNE dépendance au shell premium', () => {
  // C'est ce qui justifie la peau externe : un seul `--p-*` dans le wizard
  // signerait une réécriture, avec le risque de transaction qui va avec.
  const tree = ['src/components/CreatePactWizard.tsx', ...wizardTree()];
  for (const file of tree) {
    const src = at(file);
    assert.doesNotMatch(src, /--p-[a-z]/, `${file} : token premium dans le wizard — l’habillage doit rester externe`);
    assert.doesNotMatch(src, /premium\//, `${file} : dépendance au shell premium`);
  }
});

// ─── 3. Peinture : la peau suit les palettes ─────────────────────────

/** Sources du wizard : le composant + ses sous-composants. */
function wizardTree(): string[] {
  const dir = readdirSync(url('src/components/wizard'));
  return dir.filter((f) => f.endsWith('.tsx')).map((f) => `src/components/wizard/${f}`);
}

const css = stripComments(read('src/styles/premium.css'));

type Vars = Record<string, string>;
function cssBlocks(source: string): Array<{ sel: string; v: Vars }> {
  const out: Array<{ sel: string; v: Vars }> = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const v: Vars = {};
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      v[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    out.push({ sel: m[1].replace(/\s+/g, ' ').trim(), v });
  }
  return out;
}
const blocks = cssBlocks(css);

const light: Record<string, Vars> = {};
const dark: Record<string, Vars> = {};
let darkNeutral: Vars = {};
for (const b of blocks) {
  let m = /^:root\[data-appearance-mode='dark'\]\[data-appearance='([a-z]+)'\]$/.exec(b.sel);
  if (m) { dark[m[1]] = b.v; continue; }
  if (b.sel === ":root[data-appearance-mode='dark']") { darkNeutral = b.v; continue; }
  m = /^:root\[data-appearance='([a-z]+)'\]$/.exec(b.sel);
  if (m) light[m[1]] = b.v;
}
const palettes = Object.keys(light);

/** Table de correspondance historique -> premium. Elle est la RÉFÉRENCE :
 *  la peau de `premium.css` doit la reproduire exactement. */
const MAP: Array<[string, string]> = [
  ['--text-primary-rgb', '--p-ink'], // c'est `white` de Tailwind dans ce projet
  ['--canvas-900-rgb', '--p-bg'],
  ['--canvas-800-rgb', '--p-canvas'],
  ['--canvas-700-rgb', '--p-panel'],
  ['--ink-100-rgb', '--p-ink'],
  ['--ink-200-rgb', '--p-ink2'],
  ['--ink-300-rgb', '--p-ink2'],
  ['--ink-400-rgb', '--p-ink3'],
  ['--ink-500-rgb', '--p-ink3'],
  ['--accent-violet-rgb', '--p-accent'],
  ['--accent-neon-rgb', '--p-ok'],
  ['--accent-gold-rgb', '--p-warn'],
];
const INK_ON_ACCENT = '12 12 18';

function chan(hex: string, what: string): string {
  assert.match(hex, /^#[0-9a-fA-F]{6}$/, `${what} : attendu un hex #rrggbb, reçu « ${hex} »`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(' ');
}

const skinBlocks = new Map<string, Vars>();
for (const b of blocks) {
  if (b.sel.endsWith(' .p-legacy-skin')) skinBlocks.set(b.sel.replace(' .p-legacy-skin', ''), b.v);
}

test('la peau déclare une combinaison pour chaque palette ET chaque mode', () => {
  assert.ok(palettes.length >= 4, `palettes détectées : ${palettes.join(', ')}`);
  const attendues = [
    ...palettes.map((p) => `:root[data-appearance='${p}']`),
    ":root[data-appearance-mode='dark']",
    ...palettes.map((p) => `:root[data-appearance-mode='dark'][data-appearance='${p}']`),
  ];
  const manquantes = attendues.filter((sel) => !skinBlocks.has(sel));
  assert.deepEqual(manquantes, [], `combinaison(s) sans peau : ${manquantes.join(' | ')}`);
  assert.equal(skinBlocks.size, attendues.length, 'bloc de peau en trop — la table de test doit être mise à jour');
});

test('la peau vaut exactement les palettes premium (aucune valeur recopiée à la main)', () => {
  // Sélecteur de la peau -> variables premium EFFECTIVES à cette
  // combinaison, en rejouant la cascade du fichier (palette claire, puis
  // neutralité sombre, puis palette sombre).
  const combos: Array<[string, Vars]> = [
    ...palettes.map((p) => [`:root[data-appearance='${p}']`, light[p]] as [string, Vars]),
    [":root[data-appearance-mode='dark']", { ...light[palettes[0]], ...darkNeutral }],
    ...palettes.map(
      (p) =>
        [
          `:root[data-appearance-mode='dark'][data-appearance='${p}']`,
          { ...light[p], ...darkNeutral, ...dark[p] },
        ] as [string, Vars]
    ),
  ];

  const ecarts: string[] = [];
  for (const [sel, vars] of combos) {
    const got = skinBlocks.get(sel);
    assert.ok(got, `aucune peau pour « ${sel} » — ce cas passerait sans être vérifié`);
    for (const [legacy, premium] of MAP) {
      const attendu = chan(vars[premium], `${sel} ${premium}`);
      if (got[legacy] !== attendu) ecarts.push(`${sel} → ${legacy}: attendu « ${attendu} », peau « ${got[legacy]} »`);
    }
    if (got['--ink-900-rgb'] !== INK_ON_ACCENT) {
      ecarts.push(`${sel} → --ink-900-rgb: attendu « ${INK_ON_ACCENT} », peau « ${got['--ink-900-rgb']} »`);
    }
  }
  assert.deepEqual(ecarts, [], `peau désynchronisée des palettes (régénérer la section) :\n  ${ecarts.join('\n  ')}`);
});

// ─── 4. Couverture : chaque couleur sémantique du wizard est remappée ─

// Aplats PLEINS volontairement laissés en Tailwind : vifs dans les deux
// modes, ils portent l'encre `text-ink-900` (voir la peau). Les remapper sur
// `--p-warn` / `--p-ok` donnerait, en mode clair, un aplat sombre sous une
// encre sombre — illisible.
const SOLID_EXCEPTIONS = new Set(['bg-amber-500', 'bg-emerald-500', 'bg-violet-500']);

/** Classes de couleur sémantique réellement écrites dans l'arbre du wizard. */
function semanticClasses(): string[] {
  const pattern =
    /(?:^|[\s"'])((?:text|bg|border|ring|from|to|via)-(?:amber|emerald|red|green|violet|blue|yellow|lime|rose|orange|teal|cyan|indigo|purple|pink|fuchsia|sky)-[0-9]{2,3}(?:\/[0-9]{1,3})?)/g;
  const found = new Set<string>();
  for (const file of ['src/components/CreatePactWizard.tsx', ...wizardTree()]) {
    for (const m of at(file).matchAll(pattern)) found.add(m[1]);
  }
  return [...found].sort();
}

test('chaque couleur sémantique utilisée par le wizard a sa règle de peau', () => {
  const classes = semanticClasses();
  assert.ok(classes.length >= 15, `extraction suspecte : ${classes.length} classe(s) trouvée(s)`);

  // En CSS, la barre d'opacité de Tailwind est échappée : `bg-amber-500/10`
  // s'écrit `.bg-amber-500\/10`.
  const needle = (c: string) => `.${c.replace('/', '\\/')}`;
  const nonCouverte = classes.filter(
    (c) => !SOLID_EXCEPTIONS.has(c) && !css.includes(needle(c))
  );
  assert.deepEqual(
    nonCouverte,
    [],
    `sans règle de peau, ces couleurs restent calées sur le thème sombre : ${nonCouverte.join(', ')}`
  );
});
