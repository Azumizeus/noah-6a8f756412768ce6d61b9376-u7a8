// supabase/functions/network-write/index.ts
// Écriture SÉCURISÉE du Réseau Builders (network_posts /
// network_post_reactions / network_post_comments + URL d'upload signée).
// Tables en RLS lecture seule : toute écriture passe par ici, après
// vérification d'une signature ed25519. Le wallet est extrait DU MESSAGE
// SIGNÉ, jamais du payload.
// Déploiement : supabase functions deploy network-write --no-verify-jwt
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

const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

// Regex ANCRÉE (^…$). Non négociable : avec un `includes`, un attaquant
// pourrait faire signer un texte anodin contenant ce motif et le rejouer.
const NETWORK_RE = new RegExp(
  `^BuildPact — réseau builders\\nWallet: (${B58})\\nTimestamp: (\\d{10,16})$`
);

// ⚠️ Doivent rester ALIGNÉES sur src/lib/network.ts.
const MAX_POST_BODY = 500;
const MAX_COMMENT_BODY = 280;
const MAX_URL = 500;

const MEDIA_BUCKET = 'network-media';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const RATE_WINDOW_MS = 60 * 1000;
const MAX_POSTS_PER_WINDOW = 5;
const MAX_COMMENTS_PER_WINDOW = 20;

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

/** Langue d'écriture déclarée par le client. Whitelist stricte : cette
 *  colonne sert au front à DÉCIDER de ne pas traduire, une valeur libre y
 *  ferait passer n'importe quoi. Inconnue → null (« non mesurée »). */
function cleanLang(v: unknown): string | null {
  return v === 'fr' || v === 'en' ? v : null;
}

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Id de post : entier positif. Rejette `1.5`, `NaN`, `"3; drop"`. */
function parsePostId(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function extFromMime(mimeType: string): string {
  const fromType = mimeType.split('/')[1];
  return fromType === 'jpeg' ? 'jpg' : fromType || 'png';
}

/** Compte les lignes récentes d'un wallet dans une table donnée.
 *  Renvoie null si le comptage échoue : l'appelant refuse alors (échec
 *  FERMÉ), au lieu de traiter une panne comme « 0 message récent ». */
async function recentCount(
  admin: ReturnType<typeof createClient>,
  table: 'network_posts' | 'network_post_comments',
  wallet: string
): Promise<number | null> {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('author_wallet', wallet)
    .gte('created_at', since);
  if (error) return null;
  return count ?? 0;
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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const admin = adminClient();
  if (!admin) return jsonResponse({ error: 'Configuration serveur manquante.' }, 500);

  const action = payload.action;
  const message = payload.message;
  if (typeof message !== 'string') {
    return jsonResponse({ error: 'Message de signature absent.' }, 400);
  }

  // GARDE COMMUNE — `wallet` est extrait DU MESSAGE SIGNÉ.
  const parsed = NETWORK_RE.exec(message);
  if (!parsed) return jsonResponse({ error: 'Message de signature invalide.' }, 400);
  const [, wallet, ts] = parsed;

  if (!isFresh(Number(ts))) {
    return jsonResponse({ error: 'Signature expirée — réessaie.' }, 401);
  }
  if (!verifySignatureBytes(wallet, message, payload.signature)) {
    return jsonResponse({ error: 'Signature invalide.' }, 401);
  }

  // POST — publication
  if (action === 'post') {
    const body = clean(payload.body, MAX_POST_BODY);
    if (!body) return jsonResponse({ error: 'Publication vide.' }, 400);

    const imageUrl = clean(payload.imageUrl, MAX_URL) || null;
    const linkedProjectPda = clean(payload.linkedProjectPda, 64) || null;
    if (linkedProjectPda && !WALLET_RE.test(linkedProjectPda)) {
      return jsonResponse({ error: 'Projet lié invalide.' }, 400);
    }

    const recentPosts = await recentCount(admin, 'network_posts', wallet);
    if (recentPosts === null) {
      return jsonResponse({ error: 'Vérification du débit indisponible — réessaie.' }, 503);
    }
    if (recentPosts >= MAX_POSTS_PER_WINDOW) {
      return jsonResponse({ error: 'Trop de publications — attends une minute.' }, 429);
    }

    const { data, error } = await admin
      .from('network_posts')
      .insert({
        author_wallet: wallet,
        body,
        image_url: imageUrl,
        linked_project_pda: linkedProjectPda,
        lang: cleanLang(payload.lang),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[network-write] post insert:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true, id: data.id });
  }

  // REACT — bascule l'encouragement (clé = post_id + wallet)
  if (action === 'react') {
    const postId = parsePostId(payload.postId);
    if (postId === null) return jsonResponse({ error: 'Post invalide.' }, 400);

    const { data: post } = await admin
      .from('network_posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle();
    if (!post) return jsonResponse({ error: 'Publication introuvable.' }, 404);

    const { data: existing } = await admin
      .from('network_post_reactions')
      .select('post_id')
      .eq('post_id', postId)
      .eq('wallet', wallet)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('network_post_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('wallet', wallet);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, reacted: false });
    }

    const { error } = await admin
      .from('network_post_reactions')
      .insert({ post_id: postId, wallet });
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return jsonResponse({ ok: true, reacted: true });
      }
      console.error('[network-write] react insert:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true, reacted: true });
  }

  // COMMENT — commentaire sur un post
  if (action === 'comment') {
    const postId = parsePostId(payload.postId);
    if (postId === null) return jsonResponse({ error: 'Post invalide.' }, 400);

    const body = clean(payload.body, MAX_COMMENT_BODY);
    if (!body) return jsonResponse({ error: 'Commentaire vide.' }, 400);

    const { data: post } = await admin
      .from('network_posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle();
    if (!post) return jsonResponse({ error: 'Publication introuvable.' }, 404);

    const recentComments = await recentCount(admin, 'network_post_comments', wallet);
    if (recentComments === null) {
      return jsonResponse({ error: 'Vérification du débit indisponible — réessaie.' }, 503);
    }
    if (recentComments >= MAX_COMMENTS_PER_WINDOW) {
      return jsonResponse({ error: 'Trop de commentaires — attends une minute.' }, 429);
    }

    const { data, error } = await admin
      .from('network_post_comments')
      .insert({ post_id: postId, author_wallet: wallet, body, lang: cleanLang(payload.lang) })
      .select('id')
      .single();

    if (error) {
      console.error('[network-write] comment insert:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true, id: data.id });
  }

  // DELETE-POST — suppression par son AUTEUR uniquement
  if (action === 'delete-post') {
    const postId = parsePostId(payload.postId);
    if (postId === null) return jsonResponse({ error: 'Post invalide.' }, 400);

    const { data: post } = await admin
      .from('network_posts')
      .select('id, author_wallet')
      .eq('id', postId)
      .maybeSingle();
    if (!post) return jsonResponse({ error: 'Publication introuvable.' }, 404);
    if (post.author_wallet !== wallet) {
      return jsonResponse({ error: "Tu n'es pas l'auteur de cette publication." }, 403);
    }

    // Enfants d'abord — filet si la migration FK n'est pas appliquée.
    await admin.from('network_post_reactions').delete().eq('post_id', postId);
    await admin.from('network_post_comments').delete().eq('post_id', postId);

    const { error } = await admin.from('network_posts').delete().eq('id', postId);
    if (error) {
      console.error('[network-write] delete post:', error.message);
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  }

  // POST-MEDIA-UPLOAD-URL — URL d'upload signée, chemin calculé serveur
  if (action === 'post-media-upload-url') {
    const mimeType = clean(payload.mimeType, 100);
    const sizeBytes = Number(payload.sizeBytes);

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return jsonResponse({ error: 'Format non supporté.' }, 400);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: 'Fichier trop volumineux.' }, 400);
    }

    const path = `${wallet}/${Date.now()}.${extFromMime(mimeType)}`;
    const { data, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error('[network-write] signed upload url:', error?.message);
      return jsonResponse({ error: "Impossible de préparer l'upload." }, 500);
    }

    const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return jsonResponse({
      ok: true,
      path,
      token: data.token,
      publicUrl: pub.publicUrl,
    });
  }

  return jsonResponse({ error: 'Action inconnue.' }, 400);
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
