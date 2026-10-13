// scripts/token-registry.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du helper registry tokens (src/lib/token-registry.ts).
//
// Que des fonctions PURES, aucun accès réseau : URL canonique +
// parsing du payload /v1/assets/:assetId (format doc officielle).
// Le cas "sans clé → null sans requête" est testé avec une clé vide.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOKENS_API_DEFAULT_BASE,
  buildAssetUrl,
  parseAssetPayload,
  resolveRegistryProfile,
} from '../src/lib/token-registry.ts';

test('base API officielle', () => {
  assert.equal(TOKENS_API_DEFAULT_BASE, 'https://api.tokens.xyz/v1');
});

test('URL canonique avec include=profile', () => {
  assert.equal(
    buildAssetUrl(
      TOKENS_API_DEFAULT_BASE,
      'So11111111111111111111111111111111111111112',
    ),
    'https://api.tokens.xyz/v1/assets/So11111111111111111111111111111111111111112?include=profile',
  );
});

test('parse un payload asset minimal', () => {
  assert.deepEqual(
    parseAssetPayload({
      asset: {
        assetId: 'solana',
        name: 'Solana',
        symbol: 'SOL',
        imageUrl: 'https://cdn/img/sol.png',
        primaryVariant: { logoURI: null, market: {} },
      },
    }),
    {
      assetId: 'solana',
      name: 'Solana',
      symbol: 'SOL',
      imageUrl: 'https://cdn/img/sol.png',
    },
  );
});

test('payload invalide → null', () => {
  assert.equal(parseAssetPayload(null), null);
  assert.equal(parseAssetPayload({}), null);
  assert.equal(parseAssetPayload({ asset: {} }), null);
});

test('sans clé → null, aucun appel réseau', async () => {
  assert.equal(await resolveRegistryProfile('So11111111111111111111111111111111111111112', ''), null);
  assert.equal(await resolveRegistryProfile('So11111111111111111111111111111111111111112', undefined), null);
});
