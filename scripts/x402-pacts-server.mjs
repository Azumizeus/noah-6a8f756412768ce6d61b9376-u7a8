// scripts/x402-pacts-server.mjs
// ═══════════════════════════════════════════════════════════════════
// Route TEST x402 — lecture payante, SANS toucher au vault.
//
// Ce que c'est : un serveur Express local qui expose
//   GET /api/pacts-test
// protégé par x402 `exact` sur Solana Devnet. Sans paiement → 402 +
// en-tête PAYMENT-REQUIRED. Avec paiement valide → 200 + sample statique.
//
// Ce que ce N'EST PAS : ni le relais RPC, ni fund/distribute, ni le
// programme Anchor. Le vault, les PDA et les 2%/98% ne sont pas
// concernés. Le handler renvoie un échantillon figé qui miroite le
// résultat de `npm run check:soumission` (9 comptes, 6 pacts), sans
// appeler la chaîne.
//
// Usage :
//   node scripts/x402-pacts-server.mjs [--port=4021]
//   curl -i http://localhost:4021/api/pacts-test   # → 402 attendu
//
// Config :
//   réseau  solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1 (devnet, facilitateur défaut)
//   prix    $0.001 exact, USDC devnet (mint résolu par le facilitateur)
//   payTo   PROTOCOL_WALLET du programme (constante figée, voir SECURITY.md)
// ═══════════════════════════════════════════════════════════════════
import express from 'express';
import { paymentMiddleware } from '@x402/express';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactSvmScheme } from '@x402/svm/exact/server';

const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 4021);
const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const PAY_TO = 'AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH';

const facilitator = new HTTPFacilitatorClient({ url: 'https://x402.org/facilitator' });
const server = new x402ResourceServer(facilitator).register(NETWORK, new ExactSvmScheme());

const app = express();

app.use(
  paymentMiddleware(
    {
      'GET /api/pacts-test': {
        accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo: PAY_TO }],
        description: 'BuildPact test — liste des pacts (échantillon, devnet)',
        mimeType: 'application/json',
      },
    },
    server,
  ),
);

app.get('/api/pacts-test', (_req, res) => {
  res.json({
    reseau: 'solana-devnet',
    programme: '9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ',
    comptes: 9,
    pacts: 6,
    note: 'échantillon test x402 — le vault et fund/distribute ne sont pas concernés',
  });
});

app.listen(PORT, () => console.log(`x402 test → http://localhost:${PORT}/api/pacts-test`));
