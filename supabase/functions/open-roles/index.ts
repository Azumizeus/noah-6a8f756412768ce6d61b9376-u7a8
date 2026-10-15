// supabase/functions/open-roles/index.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — Rôles recherchés par un pact (écriture SÉCURISÉE).
//
// Pourquoi une Edge Function (et pas une policy RLS ouverte comme
// project_media/pact_events) : la liste des rôles recherchés s'affiche
// publiquement sur la Marketplace. Une écriture ouverte permettrait à
// n'importe qui de réécrire les besoins du pact de quelqu'un d'autre —
// vandalisme visible. Ici, on vérifie :
//   1. une signature signMessage (preuve que l'appelant contrôle le wallet)
//   2. que ce wallet est project.creator EN LISANT LE COMPTE ON-CHAIN
//      (même IDL Anchor que le frontend — cf. fonctions vault/contact)
// Seulement après, la service_role key (bypass RLS) remplace la liste —
// la table project_open_roles n'a AUCUNE policy d'écriture publique.
//
// Action unique : 'set' → remplace ATOMIQUEMENT toute la liste du projet
// (delete + insert). Couvre la création (wizard) ET l'édition ultérieure.
//
// Déploiement (depuis la racine du repo) :
//   supabase functions deploy open-roles --no-verify-jwt
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement)
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.95.3';
import { AnchorProvider, Program } from 'npm:@coral-xyz/anchor@0.30.1';
import idl from './buildpact_idl.json' with { type: 'json' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const WALLET_RE = new RegExp(`^${B58}$`);
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

// Regex ANCRÉE (^…$). Non négociable : avec un simple `includes`, une
// signature obtenue pour une AUTRE action (vault, contact…) — ou même
// pour ce même endpoint mais sur un AUTRE projet — pourrait être rejouée
// ici. Voir project-write/index.ts pour le même principe.
const OPEN_ROLES_RE = new RegExp(
  `^BuildPact — rôles recherchés\\nWallet: (${B58})\\nProjet: (${B58})\\nTimestamp: (\\d{10,16})$`
);

const MAX_ROLES = 8; // cohérent avec MAX_MEMBERS on-chain
const MAX_ROLE_LABEL_LEN = 40; // cohérent avec MAX_ROLE_LEN on-chain

const RPC_URL = Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Vérifie signature ed25519 + anti-replay. Wallet ET projet signé sont
 *  extraits DU MESSAGE SIGNÉ (jamais du payload) — voir project-write/index.ts. */
function verifyWalletSignature(
  message: unknown,
  signature: unknown
): { wallet: string; signedProject: string } | { error: string } {
  if (typeof message !== 'string') return { error: 'Message de signature absent.' };
  const parsed = OPEN_ROLES_RE.exec(message);
  if (!parsed) return { error: 'Message de signature invalide.' };
  const [, wallet, signedProject, tsStr] = parsed;

  if (!Array.isArray(signature) || signature.length !== 64) return { error: 'Signature invalide.' };

  const age = Date.now() - Number(tsStr);
  if (age > MAX_MESSAGE_AGE_MS || age < -MAX_CLOCK_SKEW_MS) return { error: 'Signature expirée — réessaie.' };

  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(signature as number[]);
    const pubkeyBytes = bs58.decode(wallet);
    if (!nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes)) {
      return { error: 'Signature invalide — impossible de prouver que tu contrôles ce wallet.' };
    }
  } catch {
    return { error: 'Signature invalide.' };
  }
  return { wallet, signedProject };
}

/** Lit le compte Project on-chain (même décodage Anchor que le frontend). */
async function fetchProjectAccount(projectPda: string) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
  const program = new Program(idl as any, provider);
  return await (program.account as any).project.fetch(new PublicKey(projectPda));
}

/** Nettoie la liste demandée : trim, dédupe (insensible casse), borne. */
function sanitizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of input) {
    const label = String(r ?? '').trim().slice(0, MAX_ROLE_LABEL_LEN);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= MAX_ROLES) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// CORS restreint (15/10/2026). `*` laissait n'importe quel site appeler
// cette fonction depuis le navigateur d'un visiteur. Désormais seule une
// origine de la liste est répercutée ; les autres reçoivent une réponse
// SANS en-tête Access-Control-Allow-Origin (le navigateur la bloque).
// Surcharge possible sans redéployer le code :
//   supabase secrets set ALLOWED_ORIGINS="https://a.example,https://b.example"
// Les appels hors navigateur (curl, serveur) ne sont pas concernés : le
// CORS protège le navigateur, pas l'API — l'auth reste la signature.
// ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  'https://buildpact-solana.vercel.app,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get('Origin');
  const headers = new Headers(res.headers);
  headers.set('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.delete('Access-Control-Allow-Origin');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non supportée.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const { action, projectPda, message, signature } = body ?? {};

  if (action !== 'set') {
    return jsonResponse({ error: 'Action inconnue.' }, 400);
  }

  const sigResult = verifyWalletSignature(message, signature);
  if ('error' in sigResult) return jsonResponse({ error: sigResult.error }, 401);
  const { wallet, signedProject } = sigResult;

  if (typeof projectPda !== 'string' || !WALLET_RE.test(projectPda)) {
    return jsonResponse({ error: 'Projet invalide.' }, 400);
  }
  if (signedProject !== projectPda) {
    return jsonResponse({ error: 'Signature émise pour un autre projet.' }, 400);
  }

  let project: any;
  try {
    project = await fetchProjectAccount(projectPda);
  } catch {
    return jsonResponse({ error: 'Projet introuvable on-chain.' }, 404);
  }

  // Seul le founder (project.creator on-chain) peut définir les rôles recherchés.
  if ((project.creator as PublicKey).toBase58() !== wallet) {
    return jsonResponse({ error: 'Seul le founder du projet peut modifier ses rôles recherchés.' }, 403);
  }

  const roles = sanitizeRoles(body.roles);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Remplacement atomique : on supprime l'existant puis on insère la nouvelle
  // liste. Si la liste est vide, c'est un simple effacement (édition valide).
  const { error: delError } = await admin
    .from('project_open_roles')
    .delete()
    .eq('project_pda', projectPda);
  if (delError) {
    console.error('[open-roles] delete error:', delError.message);
    return jsonResponse({ error: `Échec de l'enregistrement — ${delError.message}` }, 500);
  }

  if (roles.length > 0) {
    const rows = roles.map((role_label, position) => ({ project_pda: projectPda, role_label, position }));
    const { error: insError } = await admin.from('project_open_roles').insert(rows);
    if (insError) {
      console.error('[open-roles] insert error:', insError.message);
      return jsonResponse({ error: `Échec de l'enregistrement — ${insError.message}` }, 500);
    }
  }

  return jsonResponse({ ok: true, count: roles.length });
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
