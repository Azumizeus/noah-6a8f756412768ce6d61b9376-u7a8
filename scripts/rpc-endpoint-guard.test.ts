// scripts/rpc-endpoint-guard.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde : aucun fichier d'environnement LOCAL ne déclare d'endpoint RPC.
//
// ── Pourquoi CE contrôle, alors que `rpc-proxy.test.ts` existe déjà ──
// `rpc-proxy.test.ts` prouve deux choses vraies : le code de `src/` ne lit
// plus aucune variable `VITE_RPC_*`, et l'artefact de `dist/` sort sans
// endpoint porteur de clé. Les deux étaient vertes le 11/10/2026 — et
// pourtant la production servait bel et bien une clé Helius, en clair, dans
// son bundle.
//
// La fuite ne venait pas du code : elle venait d'une DÉCLARATION. Une
// variable `VITE_RPC_ENDPOINT` restait posée sur la plateforme de
// déploiement, et Vite incruste la valeur d'une variable `VITE_` évaluée au
// build. Le code avait cessé de la lire ; la variable, elle, attendait —
// il suffisait de restaurer une ligne pour que la clé reparte dans le
// fichier livré.
//
// Ce test regarde donc l'endroit que PERSONNE ne regarde : les fichiers
// d'environnement locaux. Ils ne sont pas versionnés, donc `secret-scan` ne
// les voit pas ; ils ne sont pas dans `dist/`, donc le contrôle d'artefact
// ne les voit pas non plus. C'est exactement l'angle mort qui a coûté la
// clé.
//
// En CI, ces fichiers n'existent pas : le test passe sans rien inspecter, et
// c'est correct — un clone propre n'a rien à déclarer.
// ═══════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les deux noms que l'application a lus, puis cessé de lire. */
const NOM_HISTORIQUE = /\b(VITE_RPC_ENDPOINT|VITE_REACT_APP_SOLANA_RPC_URL)\b/;

/**
 * Toute variable `VITE_` dont le NOM annonce un endpoint de nœud.
 *
 * Volontairement large — `VITE_RPC_URL`, `VITE_HELIUS_URL`,
 * `VITE_SOLANA_RPC`, `VITE_DEVNET_URL`… Le risque tient au nom, pas à la
 * valeur : Vite recopie en clair, dans le JavaScript livré, toute variable
 * `VITE_` évaluée au moment du build. Un nom d'endpoint déclaré ici est
 * donc un secret en puissance, quelle que soit la valeur du jour.
 */
const VITE_ENDPOINT = /^\s*(VITE_[A-Z0-9_]*(RPC|HELIUS|SOLANA|DEVNET)[A-Z0-9_]*)\s*=/i;

/**
 * Les lignes qui DÉCLARENT un endpoint interdit.
 *
 * Les commentaires sont ignorés : ils documentent, ils ne déclarent pas —
 * Vite ne lit pas une ligne commentée. `RPC_URL` sans préfixe `VITE_` est
 * ignoré aussi : il n'est lu que par les scripts de vérification, jamais
 * incrusté dans le bundle.
 */
export function declarationsInterdites(contenu: string): string[] {
  const fautes: string[] = [];
  contenu.split('\n').forEach((ligne, i) => {
    if (/^\s*(#|$)/.test(ligne)) return;
    const trouve = ligne.match(VITE_ENDPOINT) ?? ligne.match(NOM_HISTORIQUE);
    if (trouve) fautes.push(`ligne ${i + 1} → ${trouve[1] ?? trouve[0]}`);
  });
  return fautes;
}

/** Les fichiers d'environnement locaux, `.env.example` excepté (c'est le modèle). */
export function fichiersEnvLocaux(racine: string): string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine)
    .filter((nom) => /^\.env(\..+)?$/.test(nom) && nom !== '.env.example')
    .sort();
}

// ─── 1. L'arbre réel ──────────────────────────────────────────────────

test('aucun fichier d’environnement local ne déclare d’endpoint RPC', (t) => {
  const fichiers = fichiersEnvLocaux(RACINE);
  t.diagnostic(
    fichiers.length === 0
      ? 'aucun fichier .env* local (clone propre) — rien à déclarer, rien à vérifier'
      : `fichiers inspectés : ${fichiers.join(', ')}`
  );

  for (const nom of fichiers) {
    const fautes = declarationsInterdites(readFileSync(join(RACINE, nom), 'utf8'));
    assert.deepEqual(
      fautes,
      [],
      `${nom} déclare un endpoint RPC (${fautes.join(', ')}). Vite l’incrusterait EN CLAIR ` +
        'dans dist/, donc dans le JavaScript du visiteur. L’application ne lit plus cette ' +
        'variable : la déclarer n’apporte rien et expose la clé — supprime la ligne.'
    );
  }
});

// ─── 2. Le détecteur sait échouer (sinon il ne vaut rien) ─────────────

test('le détecteur SAIT échouer — fichiers fabriqués', () => {
  const REFUSE: Record<string, string> = {
    'le nom historique': 'VITE_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=0000\n',
    'le second nom historique': "VITE_REACT_APP_SOLANA_RPC_URL='https://exemple.test/?k=1'\n",
    'un endpoint sous un autre nom': 'VITE_HELIUS_URL=https://mainnet.helius-rpc.com/?api-key=abcdef\n',
    'un endpoint sans clé mais dédié': 'VITE_RPC_URL=https://devnet.helius-rpc.com\n',
    'l’ordre devnet': 'VITE_DEVNET_URL=https://exemple.test\n',
    'la déclaration sans espace': 'VITE_SOLANA_RPC=https://exemple.test\n',
  };
  for (const [cas, contenu] of Object.entries(REFUSE)) {
    assert.equal(
      declarationsInterdites(contenu).length,
      1,
      `${cas} n’est pas refusé : un test qui ne sait pas échouer ne protège rien`
    );
  }

  const ACCEPTE: Record<string, string> = {
    'une ligne commentée': '# VITE_RPC_ENDPOINT=https://exemple.test\n',
    'les variables publiques du projet':
      'VITE_SUPABASE_URL=https://exemple.supabase.co\nVITE_VAPID_PUBLIC_KEY=BExemple\n',
    'un endpoint réservé aux scripts': 'RPC_URL=https://api.devnet.solana.com\n',
    'du texte libre': 'le nœud dédié vit côté plateforme, pas ici\n',
    'un fichier vide': '',
  };
  for (const [cas, contenu] of Object.entries(ACCEPTE)) {
    assert.deepEqual(
      declarationsInterdites(contenu),
      [],
      `${cas} est refusé à tort — un faux positif rendrait la garde inaudible`
    );
  }
});

// ─── 3. Le modèle ne montre pas l'exemple à ne pas suivre ─────────────

test('.env.example ne déclare aucun endpoint `VITE_`', () => {
  const modele = readFileSync(join(RACINE, '.env.example'), 'utf8');
  assert.deepEqual(
    declarationsInterdites(modele),
    [],
    '.env.example est recopié tel quel : un endpoint déclaré là finit dans un .env.local.'
  );
  // Le modèle doit quand même expliquer pourquoi : sinon la règle se perd.
  assert.match(modele, /VITE_RPC_ENDPOINT/, 'le modèle doit nommer les variables retirées');
});
