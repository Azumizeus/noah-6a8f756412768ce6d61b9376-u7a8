// supabase/functions/contact/index.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — Demandes de contact entre builders, SÉCURISÉES.
//
// Table 100% fermée : cette fonction vérifie une signature signMessage
// AVANT d'utiliser la service_role key, pour les deux actions :
//   - 'send' : le wallet signe pour prouver qu'il est bien `from_wallet`
//   - 'list' : le wallet signe pour prouver qu'il est bien `to_wallet`
//              (donc en droit de lire CES demandes précises, les siennes)
//
// Déploiement : supabase functions deploy contact --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const WALLET_RE = new RegExp(`^${B58}$`);
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const MAX_ROLE_LEN = 60;
const MAX_MESSAGE_LEN = 500;

// Regex ANCRÉE (^…$). Non négociable : avec un simple `includes`, une
// signature obtenue pour une AUTRE action (vault, update-profile…)
// pourrait être rejouée ici tant qu'elle contient le wallet quelque part.
const CONTACT_RE = new RegExp(`^BuildPact — contact\\nWallet: (${B58})\\nTimestamp: (\\d{10,16})$`);

/** Langue d'écriture déclarée par le client. Whitelist stricte : le front
 *  s'en sert pour DÉCIDER de ne pas traduire. Inconnue → null. */
function cleanLang(v: unknown): string | null {
  return v === 'fr' || v === 'en' ? v : null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Vérifie signature ed25519 + anti-replay. Le wallet est extrait DU
 *  MESSAGE SIGNÉ (jamais du payload) — voir project-write/index.ts. */
function verifyWalletSignature(
  message: unknown,
  signature: unknown
): { wallet: string } | { error: string } {
  if (typeof message !== 'string') return { error: 'Message de signature absent.' };
  const parsed = CONTACT_RE.exec(message);
  if (!parsed) return { error: 'Message de signature invalide.' };
  const [, wallet, tsStr] = parsed;

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
  return { wallet };
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const action = body?.action;
  const sigResult = verifyWalletSignature(body?.message, body?.signature);
  if ('error' in sigResult) return jsonResponse({ error: sigResult.error }, 401);

  // Le wallet vient de verifyWalletSignature (extrait du message signé,
  // preuve cryptographique) — jamais du payload brut.
  const wallet = sigResult.wallet;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ═══ send : `wallet` (prouvé) envoie une demande à `toWallet` ═══
  if (action === 'send') {
    const toWallet = String(body.toWallet ?? '');
    if (!WALLET_RE.test(toWallet)) return jsonResponse({ error: 'Destinataire invalide.' }, 400);
    if (toWallet === wallet) return jsonResponse({ error: 'Tu ne peux pas te contacter toi-même.' }, 400);

    const roleText = String(body.roleText ?? '').trim().slice(0, MAX_ROLE_LEN);
    const messageText = String(body.messageText ?? '').trim().slice(0, MAX_MESSAGE_LEN);
    if (!messageText) return jsonResponse({ error: "Écris un message avant d'envoyer." }, 400);

    const { error } = await admin.from('builder_contact_requests').insert({
      from_wallet: wallet,
      to_wallet: toWallet,
      role_text: roleText,
      message: messageText,
      lang: cleanLang(body.lang),
    });
    if (error) {
      console.error('[contact] insert error:', error.message);
      return jsonResponse({ error: "Échec de l'envoi — réessaie." }, 500);
    }
    return jsonResponse({ ok: true });
  }

  // ═══ rate : `wallet` (prouvé) note `toWallet` (1 à 6 étoiles, upsert) ═══
  if (action === 'rate') {
    const toWallet = String(body.toWallet ?? '');
    if (!WALLET_RE.test(toWallet)) return jsonResponse({ error: 'Destinataire invalide.' }, 400);
    if (toWallet === wallet) return jsonResponse({ error: 'Tu ne peux pas te noter toi-même.' }, 400);
    const stars = Number(body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 6) {
      return jsonResponse({ error: 'Note invalide (1 à 6 étoiles).' }, 400);
    }

    const { error } = await admin.from('builder_ratings').upsert(
      {
        from_wallet: wallet,
        to_wallet: toWallet,
        stars,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'from_wallet,to_wallet' }
    );
    if (error) {
      console.error('[contact] rate error:', error.message);
      return jsonResponse({ error: "Échec de l'envoi de la note — réessaie." }, 500);
    }
    return jsonResponse({ ok: true });
  }

  // ═══ list : `wallet` (prouvé) liste SES PROPRES demandes reçues ═══
  if (action === 'list') {
    const { data, error } = await admin
      .from('builder_contact_requests')
      .select('*')
      .eq('to_wallet', wallet)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('[contact] list error:', error.message);
      return jsonResponse({ error: 'Échec du chargement.' }, 500);
    }
    return jsonResponse({
      requests: (data ?? []).map((r) => ({
        id: r.id,
        fromWallet: r.from_wallet,
        toWallet: r.to_wallet,
        roleText: r.role_text,
        message: r.message,
        lang: r.lang ?? null,
        createdAt: r.created_at,
      })),
    });
  }

  return jsonResponse({ error: 'Action inconnue.' }, 400);
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
