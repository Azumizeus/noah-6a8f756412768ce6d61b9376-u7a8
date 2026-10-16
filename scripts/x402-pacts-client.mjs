// scripts/x402-pacts-client.mjs
// ═══════════════════════════════════════════════════════════════════
// Client TEST x402 — paie 0.001 USDC devnet puis lit /api/pacts-test.
//
// Usage :
//   1. terminal A : npm run x402:test            (serveur :4021)
//   2. terminal B : SVM_PRIVATE_KEY=<base58> node scripts/x402-pacts-client.mjs
//      ou : node scripts/x402-pacts-client.mjs --keypair=contracts/target/wallet/wallet.json
// L'environnement attend du base58 ; le fichier keypair attend un tableau JSON d'octets.
//
// La clé ne s'affiche jamais : seules son adresse et la signature
// de settlement (hash tx) sont imprimées.
//
// Portefeuille requis (devnet) :
//   · un peu de SOL devnet (frais, le facilitateur paie le gaz du
//     TransferChecked mais le wallet doit exister et signer)
//   · 0.001+ USDC devnet, mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
//     (faucet : https://faucet.circle.com → Solana Devnet, ou
//     `spl-token mint` local vers ton ATA)
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import axios from 'axios';
import { x402Client, wrapAxiosWithPayment, x402HTTPClient } from '@x402/axios';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { createKeyPairSignerFromBytes, createKeyPairSignerFromPrivateKeyBytes } from '@solana/kit';
import { decodeSvmKey } from './x402-key.mjs';

const URL = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:4021/api/pacts-test';

function chargerCle() {
  const direct = process.env.SVM_PRIVATE_KEY?.trim();
  if (direct) {
    try {
      return decodeSvmKey(direct, 'base58');
    } catch {
      throw new Error('SVM_PRIVATE_KEY doit être une clé base58 valide.');
    }
  }
  const kf = process.argv.find((a) => a.startsWith('--keypair='))?.split('=').slice(1).join('=');
  if (kf) {
    if (!existsSync(kf)) throw new Error(`Fichier de keypair introuvable : ${kf}`);
    const raw = JSON.parse(readFileSync(kf, 'utf8'));
    return decodeSvmKey(raw, 'keypair-json');
  }
  return null;
}

let octets;
try {
  octets = chargerCle();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (!octets) {
  console.log('Portefeuille manquant.');
  console.log('Relance avec : SVM_PRIVATE_KEY=<base58> node scripts/x402-pacts-client.mjs');
  console.log('(devnet uniquement — jamais de clé mainnet ici)');
  process.exit(2);
}
// @solana/kit accepte une paire Ed25519 de 64 octets ou une clé privée de 32.
const signer = octets.length === 64
  ? await createKeyPairSignerFromBytes(octets)
  : await createKeyPairSignerFromPrivateKeyBytes(octets);
console.log('wallet:', signer.address);

const client = new x402Client();
registerExactSvmScheme(client, { signer });
const api = wrapAxiosWithPayment(axios.create(), client);

const res = await api.get(URL);
console.log('statut:', res.status);
console.log('données:', JSON.stringify(res.data));

const http = new x402HTTPClient(client);
let tx = null;
try {
  const settlement = http.getPaymentSettleResponse((n) => res.headers[n.toLowerCase()]);
  tx = settlement?.transaction ?? settlement?.txHash ?? null;
} catch { tx = null; }
if (tx) {
  console.log('tx:', tx);
  console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
} else {
  console.log('(pas de hash de settlement dans la réponse — voir en-tête PAYMENT-RESPONSE)');
}
