import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { decodeSvmKey } from './x402-key.mjs';

test('x402 key: base58 input remains base58 even when it resembles base64', () => {
  const key = Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 68) % 256);
  const encoded = base58.encode(key);
  assert.match(encoded, /^[A-Za-z0-9+/=]+$/);
  assert.equal(encoded.length % 4, 0);
  assert.deepEqual(decodeSvmKey(encoded, 'base58'), key);
});

test('x402 key: JSON keypair accepts byte arrays, not encoded strings', () => {
  const key = Array.from({ length: 64 }, (_, i) => i % 256);
  assert.deepEqual(decodeSvmKey({ secretKey: key }, 'keypair-json'), Uint8Array.from(key));
  assert.throws(() => decodeSvmKey({ secretKey: 'AQID' }, 'keypair-json'), /tableau d’octets/);
  assert.throws(() => decodeSvmKey([0, 256], 'keypair-json'), /octet invalide/);
});

test('x402 key: only 32-byte seeds and 64-byte secret keys are accepted', () => {
  assert.equal(decodeSvmKey(base58.encode(new Uint8Array(32)), 'base58').length, 32);
  assert.throws(() => decodeSvmKey(base58.encode(new Uint8Array(31)), 'base58'), /31 octets/);
});
