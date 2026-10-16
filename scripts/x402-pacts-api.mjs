// scripts/x402-pacts-api.mjs
// ═══════════════════════════════════════════════════════════════════
// Route RÉELLE x402 — GET /api/pacts : liste des pacts lus sur la chaîne.
//
// Différence avec scripts/x402-pacts-server.mjs (route TEST) : ici le
// handler appelle `getProgramAccounts` (filtre memcmp sur le
// discriminant `Project`), décode chaque compte avec l'IDL et renvoie
// les pacts réels. Lecture seule : aucun fund/distribute, aucune
// signature, le vault n'est pas touché.
//
// Usage :
//   node scripts/x402-pacts-api.mjs [--port=4022]
//   curl -i http://localhost:4022/api/pacts      # → 402 attendu
//   npm run x402:pay -- --url=http://localhost:4022/api/pacts
//
// Config (env, rien n'est écrit en dur) :
//   RPC_URL    nœud Solana (défaut : devnet public). Jamais journalisé.
//   X402_PRICE prix par appel (défaut "$0.001")
//   Réseau figé sur devnet, payTo = PROTOCOL_WALLET (voir SECURITY.md).
// ═══════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import { paymentMiddleware } from '@x402/express';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactSvmScheme } from '@x402/svm/exact/server';

const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 4022);
const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'; // devnet
const PAY_TO = 'AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH'; // PROTOCOL_WALLET
const PRICE = process.env.X402_PRICE ?? '$0.001';
const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const CACHE_MS = 15_000;

const idl = JSON.parse(readFileSync(new URL('../src/idl/buildpact.json', import.meta.url), 'utf8'));
const programId = new PublicKey(idl.address);
const coder = new BorshAccountsCoder(idl);
const discriminant = Buffer.from(idl.accounts.find((a) => a.name === 'Project').discriminator);
const connection = new Connection(RPC_URL, 'confirmed');

const plat = (v) => {
  if (v instanceof PublicKey) return v.toBase58();
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(plat);
  if (v && typeof v === 'object') {
    if (v.constructor?.name === 'BN') return v.toString();
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plat(x)]));
  }
  return v;
};

let cache = { at: 0, corps: null };
export async function lirePacts() {
  if (cache.corps && Date.now() - cache.at < CACHE_MS) return cache.corps;
  const comptes = await connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(discriminant) } }],
  });
  const pacts = [];
  for (const { pubkey, account } of comptes) {
    try {
      pacts.push({ adresse: pubkey.toBase58(), ...plat(coder.decode('Project', account.data)) });
    } catch {
      // compte au format ancien : ignoré plutôt que de casser toute la liste
    }
  }
  cache = {
    at: Date.now(),
    corps: { reseau: 'solana-devnet', programme: programId.toBase58(), total: pacts.length, pacts },
  };
  return cache.corps;
}

if (process.argv.includes('--lire-seulement')) {
  // Diagnostic sans serveur ni paiement : affiche le résultat de la lecture chaîne.
  const c = await lirePacts();
  console.log(JSON.stringify({ total: c.total, premier: c.pacts[0]?.title ?? null }));
  process.exit(0);
}

const facilitator = new HTTPFacilitatorClient({ url: 'https://x402.org/facilitator' });
const server = new x402ResourceServer(facilitator).register(NETWORK, new ExactSvmScheme());

const app = express();

app.use(
  paymentMiddleware(
    {
      'GET /api/pacts': {
        accepts: [{ scheme: 'exact', price: PRICE, network: NETWORK, payTo: PAY_TO }],
        description: 'BuildPact — liste des pacts on-chain (lecture seule, devnet)',
        mimeType: 'application/json',
      },
    },
    server,
  ),
);

app.get('/api/pacts', async (_req, res) => {
  try {
    res.json(await lirePacts());
  } catch {
    // le message d'erreur du RPC peut contenir l'URL (donc la clé) : on ne le relaie pas
    res.status(502).json({ erreur: 'lecture chaîne indisponible' });
  }
});

app.listen(PORT, () => console.log(`x402 → http://localhost:${PORT}/api/pacts`));
