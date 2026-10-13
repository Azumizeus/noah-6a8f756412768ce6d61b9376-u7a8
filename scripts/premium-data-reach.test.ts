// scripts/premium-data-reach.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou : une page premium qui LIT une liste doit pouvoir distinguer
// « il n'y a rien » de « je n'ai pas pu lire ».
//
// Contexte, mesuré et non supposé : `listAllProfiles()` renvoyait `[]` aussi
// bien quand l'annuaire est vide que quand la base est tombée. Aucune page ne
// peut rattraper ça — l'information est perdue AVANT d'atteindre l'écran, et
// l'utilisateur lit « 0 builder » alors que le serveur est simplement
// injoignable. Le patron se retrouve à l'identique dans toute lecture qui
// convertit un échec en collection vide :
//
//     .catch(() => setProfiles([]))            ← l'échec devient « vide »
//     if (error) { …; return []; }             ← l'échec devient « vide »
//
// On ne teste donc pas « le fetch a réussi » (il n'y a pas de backend dans la
// suite) : on teste que la page a de quoi DIRE la différence, et que le
// lecteur qu'elle emploie ne la lui cache pas.
//
// Trois règles :
//   1. aucune page premium ne convertit un échec en collection vide ;
//   2. aucune page premium n'emploie le lecteur qui avale l'échec
//      (`listAllProfiles`) — elle doit passer par la variante qui le rapporte ;
//   3. toute page premium branchée sur un lecteur de liste expose une surface
//      d'erreur (un état `…Error` rendu via `role="alert"`).
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DOSSIER = new URL('../src/pages/premium/', import.meta.url);

const stripComments = (src: string): string =>
  src
    .replace(/^[ \t]*\{\s*\/\*[\s\S]*?\*\/\s*\}[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')
    .split('\n')
    .filter((line) => !/^[ \t]*(\/\/|\*)/.test(line))
    .join('\n');

const pagesPremium = (): string[] =>
  readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.tsx'))
    .sort();

const code = (page: string): string => stripComments(readFileSync(new URL(page, DOSSIER), 'utf8'));

/**
 * Un `.catch()` qui affecte une collection VIDE à un état : l'échec devient
 * indiscernable d'un résultat vide pour tout ce qui s'affiche ensuite.
 *
 * Fonction pure (exportée) : le test de détecteur ci-dessous la fait tourner
 * sur des entrées fabriquées, pour qu'un détecteur cassé ne puisse pas se
 * faire passer pour un dépôt propre.
 *
 * Limite assumée : le corps d'un `.catch` est borné à la première accolade
 * fermante. Ces handlers-ci n'imbriquent ni objet ni fonction ; un cas plus
 * tordu passerait au travers, mais la mutation correspondante est déjà
 * couverte par la règle 2 (le lecteur ne peut plus avaler l'erreur).
 */
export function vidagesSilencieux(src: string): string[] {
  const trouves: string[] = [];
  const court = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 140);

  // .catch(() => { … setX([]) … })   ·   .catch((e) => { … })
  for (const m of src.matchAll(/\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{([^}]*)\}/g)) {
    if (/set[A-Za-z0-9_]*\(\s*\[\s*\]\s*\)/.test(m[1])) trouves.push(court(m[0]));
  }

  // .catch(() => setX([]))  — promesse sans accolades
  for (const m of src.matchAll(/\.catch\(\s*\(\)\s*=>\s*set[A-Za-z0-9_]*\(\s*\[\s*\]\s*\)/g)) {
    trouves.push(court(m[0]));
  }

  // if (error) { …; return []; }  — le lecteur lui-même avale l'échec
  for (const m of src.matchAll(/if\s*\([^)]*\berror\b[^)]*\)\s*\{([^}]*)\}/g)) {
    if (/return\s*\[\s*\]/.test(m[1]) && !/return\s*\{\s*error/.test(m[1])) trouves.push(court(m[0]));
  }

  return trouves;
}

// ─── 1. Le détecteur fonctionne (entrées fabriquées) ─────────────────

test('le détecteur attrape un échec converti en collection vide', () => {
  assert.equal(vidagesSilencieux('listAllProfiles().then(setItems).catch(() => { setItems([]); })').length, 1);
  assert.equal(vidagesSilencieux('load().catch(() => setItems([]))').length, 1);
  assert.equal(vidagesSilencieux('if (error) { console.error(error); return []; }').length, 1);
});

test('le détecteur épargne un échec qui est rapporté', () => {
  assert.deepEqual(vidagesSilencieux('load().catch(() => setItemsError(t("x")))'), []);
  assert.deepEqual(vidagesSilencieux('if (error) { return { error: error.message }; }'), []);
  assert.deepEqual(vidagesSilencieux('load().then((r) => setItems(r.items ?? []))'), []);
  // Un état INITALISÉ à vide n'est pas un vidage : seule la conversion d'un
  // échec en vide est visée.
  assert.deepEqual(vidagesSilencieux('const [items, setItems] = useState<string[]>([])'), []);
});

// ─── 2. Aucune page premium ne vide en silence ───────────────────────

test('aucune page premium ne convertit un échec de lecture en collection vide', () => {
  const pages = pagesPremium();
  assert.ok(pages.length >= 10, `balayage suspect : ${pages.length} page(s)`);

  const coupables: string[] = [];
  for (const page of pages) {
    for (const hit of vidagesSilencieux(code(page))) coupables.push(`${page} → ${hit}`);
  }

  assert.deepEqual(
    coupables,
    [],
    `page(s) premium vidant en silence (une base injoignable s’afficherait comme « aucun résultat ») :\n  ` +
      coupables.join('\n  ') +
      '\n→ rapporter l’échec (état d’erreur affiché), ou passer par une variante du lecteur qui le renvoie'
  );
});

// ─── 3. Le lecteur employé ne cache pas l'échec à la page ────────────

/** Lecteurs distants dont une page PREMIUM rend le résultat (une liste).
 *  Étendre cette table quand un lecteur de liste est ajouté : c'est le point
 *  où la distinction « vide / injoignable » se joue. */
const LECTEURS_LISTE: Record<string, string[]> = {
  profileRemote: ['listAllProfiles', 'listAllProfilesResult'],
  contact: ['fetchRatingSummaries', 'fetchContactRequestsFor'],
};

test('aucune page premium n’emploie un lecteur qui avale l’échec', () => {
  const coupables: string[] = [];
  for (const page of pagesPremium()) {
    const src = code(page);
    // `listAllProfiles` sans son suffixe `Result` : la variante qui renvoie []
    // en cas d'échec, donc celle qui rend l'erreur invisible à l'écran.
    for (const m of src.matchAll(/\blistAllProfiles\b(?!Result)/g)) {
      coupables.push(`${page} → ${m[0]}`);
    }
  }

  assert.deepEqual(
    coupables,
    [],
    `page(s) premium lisant une liste via un lecteur qui avale l’échec : ${coupables.join(', ')} — ` +
      'utiliser listAllProfilesResult() et afficher l’erreur'
  );
});

test('la variante qui avale l’échec est définie à partir de celle qui le rapporte', () => {
  const lib = stripComments(readFileSync(new URL('../src/lib/profileRemote.ts', import.meta.url), 'utf8'));
  assert.match(lib, /export async function listAllProfilesResult/, 'la variante qui rapporte l’échec a disparu');

  // Si `listAllProfiles` se remettait à interroger la base pour son compte,
  // les deux variantes pourraient diverger (l'une filtrant, l'autre pas) sans
  // que rien ne casse — c'est le doublon qu'on refuse.
  const delegue = /export async function listAllProfiles\(\): Promise<BuilderProfile\[\]> \{\s*const r = await listAllProfilesResult\(\)\s*;\s*return 'profiles' in r \? r\.profiles : \[\]\s*;\s*\}/.exec(lib);
  assert.ok(
    delegue,
    'listAllProfiles doit déléguer entièrement à listAllProfilesResult() — une seconde lecture de la base ferait diverger les deux variantes'
  );

  // Le corps de la variante qui avale ne doit contenir AUCUNE requête : un
  // `.from(` qui y réapparaîtrait signerait une deuxième source de vérité.
  assert.doesNotMatch(delegue[0], /\.from\(/, 'listAllProfiles interroge la base pour son compte');
});

test('toute page premium branchée sur un lecteur de liste expose une erreur affichée', () => {
  const manquantes: string[] = [];
  for (const page of pagesPremium()) {
    const src = code(page);
    const modules = Object.entries(LECTEURS_LISTE).filter(([, noms]) =>
      noms.some((nom) => new RegExp(`\\b${nom}\\b`).test(src))
    );
    if (modules.length === 0) continue;
    if (!/\b[A-Za-z_]*[Ee]rror\b/.test(src)) manquantes.push(`${page} : aucun état d’erreur`);
    if (!/role="alert"/.test(src)) manquantes.push(`${page} : erreur non annoncée (role="alert" absent)`);
  }

  assert.deepEqual(
    manquantes,
    [],
    `page(s) premium lisant une liste sans pouvoir dire que la lecture a échoué : ${manquantes.join(', ')}`
  );
});

test('la table des lecteurs de liste n’est pas vide et vise des lecteurs réels', () => {
  const tous = Object.values(LECTEURS_LISTE).flat();
  assert.ok(tous.length >= 2, `table suspicieusement vide : ${tous.length} lecteur(s)`);
  const libs = ['../src/lib/profileRemote.ts', '../src/lib/contact.ts']
    .map((p) => readFileSync(new URL(p, import.meta.url), 'utf8'))
    .join('\n');
  const fantomes = tous.filter((nom) => !new RegExp(`\\b${nom}\\b`).test(libs));
  assert.deepEqual(fantomes, [], `lecteur déclaré introuvable dans les libs : ${fantomes.join(', ')}`);
});
