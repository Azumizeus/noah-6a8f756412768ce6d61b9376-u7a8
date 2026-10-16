// scripts/setup-atas.mjs
// ═══════════════════════════════════════════════════════════════════
// Prépare les comptes token (ATA) des wallets receveurs AVANT le
// premier encaissement. Sans ATA, tout TransferChecked échoue à la
// simulation (erreur mesurée : invalid_exact_svm_transaction_simulation_failed).
//
// Idempotent : un ATA existant est signalé et laissé tel quel.
// La création est permissionless : le payeur (keypair local) paie le
// loyer (~0.002 SOL), la clé du receveur n'est jamais nécessaire.
//
// Usage :
//   node scripts/setup-atas.mjs --check-only
//   node scripts/setup-atas.mjs --owner=ADDR1 --owner=ADDR2
//   node scripts/setup-atas.mjs --url=https://api.mainnet-beta.solana.com \
//     --mint=<MINT_USDC_MAINNET> --owner=<WALLET> --keypair=~/.config/solana/id.json
//
// Défauts (devnet, sûrs) :
//   --url      https://api.devnet.solana.com
//   --mint     4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (USDC devnet)
//   --owner    AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH (PROTOCOL_WALLET)
//   --keypair  ~/.config/solana/id.json (payeur du loyer)
// ═══════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccount } from '@solana/spl-token';
import { isMissingTokenAccount } from './setup-atas-utils.mjs';

const args = process.argv.slice(2);
const val = (n, d) => args.find((a) => a.startsWith(n + '='))?.split('=').slice(1).join('=') ?? d;
const all = (n) => args.filter((a) => a.startsWith(n + '=')).map((a) => a.split('=').slice(1).join('='));
const CHECK_ONLY = args.includes('--check-only');

const URL = val('--url', 'https://api.devnet.solana.com');
const MINT = new PublicKey(val('--mint', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'));
const OWNERS = all('--owner').length ? all('--owner') : ['AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH'];
const KEYPAIR = val('--keypair', process.env.HOME + '/.config/solana/id.json').replace(/^~/, process.env.HOME);

const connection = new Connection(URL, 'confirmed');
let payer = null;
if (!CHECK_ONLY) {
  const raw = JSON.parse(readFileSync(KEYPAIR, 'utf8'));
  payer = Keypair.fromSecretKey(Uint8Array.from(Array.isArray(raw) ? raw : raw.secretKey));
}

let code = 0;
for (const o of OWNERS) {
  const owner = new PublicKey(o);
  const ata = await getAssociatedTokenAddress(MINT, owner);
  try {
    await getAccount(connection, ata);
    console.log(`OK   ${owner.toBase58()} → ${ata.toBase58()} (existe)`);
  } catch (error) {
    // Seule l'absence confirmée de l'ATA autorise une création payante ; toute panne RPC remonte.
    if (!isMissingTokenAccount(error)) {
      throw error;
    }
    if (CHECK_ONLY) {
      console.log(`MANQUANT ${owner.toBase58()} → ${ata.toBase58()} (à créer)`);
      code = 1;
    } else {
      const sig = await createAssociatedTokenAccount(connection, payer, MINT, owner);
      console.log(`CRÉÉ ${owner.toBase58()} → ${ata.toBase58()} (${sig})`);
    }
  }
}
process.exit(code);
