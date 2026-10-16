import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { isMissingTokenAccount } from './setup-atas-utils.mjs';

test('ATA setup: only a missing token account is treated as creatable', () => {
  assert.equal(isMissingTokenAccount(new TokenAccountNotFoundError()), true);
  assert.equal(isMissingTokenAccount(new TokenInvalidAccountOwnerError()), false);
  assert.equal(isMissingTokenAccount(new Error('RPC unavailable')), false);
});
