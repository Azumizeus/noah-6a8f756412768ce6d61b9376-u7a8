// supabase/functions/push/index.ts
// BuildPact — Notifications push reelles (Web Push / VAPID), 29/08 nuit.
//
// Meme schema de preuve que quest-write/network-write : signature ed25519
// fraiche (tweetnacl + bs58), message ancre au format exact.
//
// Quatre actions (routees par body.action) :
//  - subscribe    : upsert (wallet, endpoint, keys, prefs)
//  - unsubscribe  : supprime la ligne (endpoint + wallet doivent matcher)
//  - update_prefs : met a jour seulement les 3 booleens de preference
//  - send         : envoie un vrai push aux wallets destinataires dont la
//                    preference du type concerne est active. Signee par
//                    l'ACTEUR de l'action on-chain qui declenche l'envoi
//                    (ex: qui vient d'approuver), pas par le destinataire.
//
// ⚠️ Limite assumee (v1) : "send" ne re-verifie pas on-chain que l'action
// (approve/fund/finalize) a reellement eu lieu — meme niveau de confiance
// que network-write pour les posts. Risque residuel : un wallet pourrait
// declencher un faux "push" pour un pact dont il est membre. Impact limite
// (une notification, aucun etat/argent ne bouge) — a durcir plus tard en
// recroisant pact_events si besoin.
//
// Secrets requis : VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// Sans ca, "subscribe"/"unsubscribe"/"update_prefs" fonctionnent (pas
// besoin des cles), mais "send" echoue explicitement (503, message clair)
// plutot que d'echouer silencieusement.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@5';
import webpush from 'npm:web-push@3.6.7';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const WALLET_RE = new RegExp(`^${B58}$`);
const NOTIF_TYPES = ['approvals', 'funding', 'quests'] as const;
type NotifType = (typeof NOTIF_TYPES)[number];

const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

// Messages signes — un format par action, tous ancres (^...$) pour empecher
// tout rejeu croise. L'endpoint push (URL longue) est inclus tel quel : le
// wallet adapter signe sans limite de longueur pratique ici.
const SUB_RE = new RegExp(
  `^BuildPact — abonnement notifications\\nWallet: (${B58})\\nEndpoint: (.+)\\nTimestamp: (\\d{10,16})$`
);
const UNSUB_RE = new RegExp(
  `^BuildPact — désabonnement notifications\\nWallet: (${B58})\\nEndpoint: (.+)\\nTimestamp: (\\d{10,16})$`
);
const PREFS_RE = new RegExp(
  `^BuildPact — préférences notifications\\nWallet: (${B58})\\nEndpoint: (.+)\\nTimestamp: (\\d{10,16})$`
);
const SEND_RE = new RegExp(
  `^BuildPact — notification push\\nWallet: (${B58})\\nPact: (${B58})\\nType: (approvals|funding|quests)\\nTimestamp: (\\d{10,16})$`
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function verifySignatureBytes(wallet: string, message: string, signature: unknown): boolean {
  if (!Array.isArray(signature) || signature.length !== 64) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      Uint8Array.from(signature as number[]),
      bs58.decode(wallet)
    );
  } catch {
    return false;
  }
}

function isFresh(timestamp: number): boolean {
  const age = Date.now() - timestamp;
  return age <= MAX_AGE_MS && age >= -MAX_CLOCK_SKEW_MS;
}

function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
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
  if (req.method !== 'POST') return jsonResponse({ error: 'Methode non supportee.' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const admin = adminClient();
  if (!admin) return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);

  const action = body.action;

  // ── subscribe ──────────────────────────────────────────────────────
  if (action === 'subscribe') {
    const wallet = String(body.wallet ?? '');
    const endpoint = String(body.endpoint ?? '');
    const keys = body.keys as { p256dh?: string; auth?: string } | undefined;
    const message = String(body.message ?? '');
    const signature = body.signature;

    if (!WALLET_RE.test(wallet)) return jsonResponse({ error: 'Wallet invalide.' }, 400);
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return jsonResponse({ error: 'Abonnement push incomplet.' }, 400);
    }
    const m = SUB_RE.exec(message);
    if (!m || m[1] !== wallet || m[2] !== endpoint) {
      return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    }
    if (!isFresh(Number(m[3]))) return jsonResponse({ error: 'Signature expiree.' }, 400);
    if (!verifySignatureBytes(wallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    const prefs = (body.prefs as Partial<Record<NotifType, boolean>>) ?? {};
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        wallet,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        notify_approvals: prefs.approvals ?? true,
        notify_funding: prefs.funding ?? true,
        notify_quests: prefs.quests ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  // ── unsubscribe ────────────────────────────────────────────────────
  if (action === 'unsubscribe') {
    const wallet = String(body.wallet ?? '');
    const endpoint = String(body.endpoint ?? '');
    const message = String(body.message ?? '');
    const signature = body.signature;

    if (!WALLET_RE.test(wallet)) return jsonResponse({ error: 'Wallet invalide.' }, 400);
    const m = UNSUB_RE.exec(message);
    if (!m || m[1] !== wallet || m[2] !== endpoint) {
      return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    }
    if (!isFresh(Number(m[3]))) return jsonResponse({ error: 'Signature expiree.' }, 400);
    if (!verifySignatureBytes(wallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('wallet', wallet)
      .eq('endpoint', endpoint);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  // ── update_prefs ───────────────────────────────────────────────────
  if (action === 'update_prefs') {
    const wallet = String(body.wallet ?? '');
    const endpoint = String(body.endpoint ?? '');
    const message = String(body.message ?? '');
    const signature = body.signature;
    const prefs = (body.prefs as Partial<Record<NotifType, boolean>>) ?? {};

    if (!WALLET_RE.test(wallet)) return jsonResponse({ error: 'Wallet invalide.' }, 400);
    const m = PREFS_RE.exec(message);
    if (!m || m[1] !== wallet || m[2] !== endpoint) {
      return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    }
    if (!isFresh(Number(m[3]))) return jsonResponse({ error: 'Signature expiree.' }, 400);
    if (!verifySignatureBytes(wallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof prefs.approvals === 'boolean') patch.notify_approvals = prefs.approvals;
    if (typeof prefs.funding === 'boolean') patch.notify_funding = prefs.funding;
    if (typeof prefs.quests === 'boolean') patch.notify_quests = prefs.quests;

    const { error } = await admin
      .from('push_subscriptions')
      .update(patch)
      .eq('wallet', wallet)
      .eq('endpoint', endpoint);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  // ── send ───────────────────────────────────────────────────────────
  if (action === 'send') {
    const actorWallet = String(body.actorWallet ?? '');
    const projectPda = String(body.projectPda ?? '');
    const type = String(body.type ?? '') as NotifType;
    const message = String(body.message ?? '');
    const signature = body.signature;
    const wallets = Array.isArray(body.wallets) ? (body.wallets as string[]) : [];
    const title = String(body.title ?? 'BuildPact');
    const pushBody = String(body.body ?? '');
    const url = typeof body.url === 'string' ? body.url : '/';

    if (!WALLET_RE.test(actorWallet)) return jsonResponse({ error: 'Wallet invalide.' }, 400);
    if (!NOTIF_TYPES.includes(type)) return jsonResponse({ error: 'Type invalide.' }, 400);
    const m = SEND_RE.exec(message);
    if (!m || m[1] !== actorWallet || m[2] !== projectPda || m[3] !== type) {
      return jsonResponse({ error: 'Message de signature invalide.' }, 400);
    }
    if (!isFresh(Number(m[4]))) return jsonResponse({ error: 'Signature expiree.' }, 400);
    if (!verifySignatureBytes(actorWallet, message, signature)) {
      return jsonResponse({ error: 'Signature invalide.' }, 401);
    }

    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPublic || !vapidPrivate) {
      // Echec explicite plutot que silencieux — voir commentaire d'en-tete.
      return jsonResponse(
        { error: 'VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY non configures cote serveur.' },
        503
      );
    }
    webpush.setVapidDetails('mailto:buildpact@example.com', vapidPublic, vapidPrivate);

    const targets = wallets.filter((w) => WALLET_RE.test(w) && w !== actorWallet);
    if (targets.length === 0) return jsonResponse({ ok: true, sent: 0 });

    const prefColumn = `notify_${type}`;
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, wallet, endpoint, p256dh, auth')
      .in('wallet', targets)
      .eq(prefColumn, true);
    if (error) return jsonResponse({ error: error.message }, 500);

    let sent = 0;
    const deadIds: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            JSON.stringify({ title, body: pushBody, url }),
          );
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) deadIds.push(s.id as string);
        }
      }),
    );

    if (deadIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', deadIds);
    }

    return jsonResponse({ ok: true, sent, pruned: deadIds.length });
  }

  return jsonResponse({ error: 'Action inconnue.' }, 400);
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
