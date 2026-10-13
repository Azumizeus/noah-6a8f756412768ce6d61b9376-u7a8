// scripts/tour-fixes.test.ts
// Garde-fous des correctifs du tour manuel (dashboard, 404, langue, trésorerie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyHash } from '../src/lib/hashRoute.ts';
import { sumOutflowsSol, vaultSolDelta } from '../src/lib/treasuryAmounts.ts';
import { readLang, writeLang } from '../src/lib/i18n/langStorage.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('un hash inconnu est une 404, pas le registre', () => {
  assert.equal(classifyHash('#/acts').route, '/404');
  assert.equal(classifyHash('#/pact/pas-une-adresse').route, '/404');
  assert.equal(classifyHash('#/').route, '/');
  assert.equal(classifyHash('#/dashboard').route, '/dashboard');
});

test('un bookmark /v2/dashboard revient sur le tableau de bord', () => {
  const hit = classifyHash('#/v2/dashboard');
  assert.equal(hit.redirectTo, '/dashboard');
});

test('une fiche pact garde son PDA', () => {
  const pda = '11111111111111111111111111111111';
  const hit = classifyHash(`#/pact/${pda}`);
  assert.equal(hit.pactPda, pda);
  assert.equal(hit.route, '/');
});

test('le delta de vault ignore le journal et ne compte que les sorties', () => {
  const vault = 'Vault111111111111111111111111111111111111';
  const tx = {
    accountKeys: ['FeePayer1111111111111111111111111111111', vault],
    preBalances: [1_000_000_000, 2_700_000],
    postBalances: [1_000_000_000, 1_800_000],
  };
  assert.equal(vaultSolDelta(tx, vault), -0.0009);
  assert.equal(vaultSolDelta(tx, 'absent'), null);
  // Un loyer seul, ou une ligne illisible, ne doit pas gonfler le total.
  assert.equal(sumOutflowsSol([-0.0009, 0.002, null, 0]), 0.0009);
});

test('une langue déjà choisie gagne sur celle du navigateur', () => {
  const store = new Map<string, string>();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { language: 'fr-FR' },
  });
  try {
    writeLang('en');
    assert.equal(readLang(), 'en');
    store.clear();
    assert.equal(readLang(), 'fr');
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
    }
  }
});

test('le lien Dashboard ouvre #/dashboard et les inconnus ont une page dédiée', () => {
  const nav = read('src/pages/premium/PremiumNav.tsx');
  const app = read('src/App.tsx');
  assert.match(nav, /href: '#\/dashboard'/);
  assert.match(app, /route === '\/dashboard'/);
  assert.match(app, /PremiumNotFound/);
  assert.match(nav, /t\('nav\.devnetBeta'\)/);
});

test('la trésorerie n’affiche le total distribué que si les deltas sont lus', () => {
  const page = read('src/pages/premium/PremiumTreasury.tsx');
  assert.match(page, /flowsVerified/);
  assert.match(page, /treasury\.unverifiedFlows/);
});
