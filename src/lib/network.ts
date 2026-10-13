// src/lib/network.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — Réseau Builders (feed transverse, hors périmètre pact).
//
// Client de l'Edge Function `network-write`. Même modèle de confiance que
// project-write/update-profile : network_posts / network_post_reactions /
// network_post_comments n'acceptent AUCUNE écriture directe depuis le
// navigateur (RLS = lecture seule) — tout insert/delete passe par ici,
// après signature ed25519 prouvant l'identité du wallet appelant.
//
// ⚠️ Objet volontairement DISTINCT de updates.ts (project_updates, fil
// d'avancement PAR pact) et de ChatBox.tsx/project_chat_messages (Q&A PAR
// pact) : ce feed est transverse à tous les builders, pas attaché à un
// projet.
//
// Aucune XP n'est attribuée pour poster/réagir/commenter — le système XP
// ne mesure QUE des actions on-chain vérifiées.
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled, SUPABASE_PROJECT_URL } from './supabaseClient';
import { translate, type Lang } from './i18n/translations';

export { isRemoteEnabled as networkEnabled };

export type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

function currentLang(): Lang {
  try {
    const stored = localStorage.getItem('buildpact_lang');
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    /* non bloquant */
  }
  return 'fr';
}

function tr(key: string, params?: Record<string, string | number>): string {
  return translate(currentLang(), key, params);
}

const NETWORK_WRITE_URL = SUPABASE_PROJECT_URL
  ? `${SUPABASE_PROJECT_URL}/functions/v1/network-write`
  : null;

export const MAX_POST_BODY = 500;
export const MAX_COMMENT_BODY = 280;

export interface NetworkPost {
  id: number;
  authorWallet: string;
  body: string;
  imageUrl: string | null;
  linkedProjectPda: string | null;
  createdAt: string; // ISO
  /** Langue d'écriture ('fr' | 'en'), `null` avant la colonne `lang`. */
  lang: string | null;
}

export interface NetworkComment {
  id: number;
  postId: number;
  authorWallet: string;
  body: string;
  createdAt: string;
  lang: string | null;
}

function postFromRemote(row: Record<string, unknown>): NetworkPost {
  return {
    id: row.id as number,
    authorWallet: row.author_wallet as string,
    body: row.body as string,
    imageUrl: (row.image_url as string | null) ?? null,
    linkedProjectPda: (row.linked_project_pda as string | null) ?? null,
    createdAt: row.created_at as string,
    lang: (row.lang as string | null) ?? null,
  };
}

function commentFromRemote(row: Record<string, unknown>): NetworkComment {
  return {
    id: row.id as number,
    postId: row.post_id as number,
    authorWallet: row.author_wallet as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    lang: (row.lang as string | null) ?? null,
  };
}

/** Message signé unique pour toutes les actions réseau (wallet + timestamp,
 *  pas de ressource tierce à figer — voir en-tête de network-write/index.ts). */
function buildNetworkSignMessage(wallet: string, ts: number): string {
  return `BuildPact — réseau builders\nWallet: ${wallet}\nTimestamp: ${ts}`;
}

async function signForNetworkWrite(
  wallet: string,
  signMessage: SignMessageFn
): Promise<{ message: string; signature: number[] } | { error: string }> {
  const message = buildNetworkSignMessage(wallet, Date.now());
  try {
    const sig = await signMessage(new TextEncoder().encode(message));
    return { message, signature: Array.from(sig) };
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message.toLowerCase() : '';
    if (raw.includes('rejected')) return { error: tr('errors.signatureRejected') };
    return { error: tr('errors.signMessageUnsupported') };
  }
}

async function callNetworkWrite(
  body: Record<string, unknown>
): Promise<{ ok: true; data: Record<string, unknown> } | { error: string }> {
  if (!NETWORK_WRITE_URL) return { error: tr('errors.notConfigured') };
  let res: Response;
  try {
    res = await fetch(NETWORK_WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: tr('errors.serverUnreachable') };
  }
  let json: Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    /* réponse vide ou non-JSON */
  }
  if (!res.ok) {
    return { error: (json.error as string) ?? tr('errors.serverError', { status: res.status }) };
  }
  return { ok: true, data: json };
}

// ── Lecture ───────────────────────────────────────────────────────

const FEED_PAGE_SIZE = 20;

/** Charge le feed global, paginé (les plus récents d'abord). */
export async function fetchNetworkFeed(
  before?: string,
  limit = FEED_PAGE_SIZE
): Promise<NetworkPost[]> {
  if (!supabase) return [];
  let query = supabase
    .from('network_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) {
    console.warn('[network] fetchNetworkFeed error:', error.message);
    return [];
  }
  return (data ?? []).map(postFromRemote);
}

/** Posts d'un seul wallet — pour l'onglet « Mes posts » du profil. */
export async function fetchPostsByWallet(wallet: string): Promise<NetworkPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('network_posts')
    .select('*')
    .eq('author_wallet', wallet)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[network] fetchPostsByWallet error:', error.message);
    return [];
  }
  return (data ?? []).map(postFromRemote);
}

/** Commentaires d'un post (ordre chronologique). */
export async function fetchComments(postId: number): Promise<NetworkComment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('network_post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[network] fetchComments error:', error.message);
    return [];
  }
  return (data ?? []).map(commentFromRemote);
}

// PostgREST plafonne une réponse à 1000 lignes (`db-max-rows`). Une lecture
// simple `.select().in(...)` s'arrête donc à 1000 SANS erreur ni indice :
// les compteurs sous-estiment en silence dès que le volume dépasse ce seuil.
// On pagine explicitement avec .range() jusqu'à épuisement.
const COUNT_PAGE = 1000;
// Garde-fou : au-delà, on préfère un compteur tronqué à une boucle qui
// martèle l'API. 50 000 lignes de réactions signifieraient de toute façon
// qu'il faut passer par une vue SQL agrégée côté serveur.
const COUNT_MAX_PAGES = 50;

/** Récupère TOUS les `post_id` d'une table pour les posts donnés, en
 *  paginant. `count: 'exact'` sert de contrôle : si le total annoncé par
 *  Postgres dépasse ce qu'on a pu lire, on le signale au lieu de rendre
 *  un chiffre faux sans le dire. */
async function fetchAllPostIds(
  table: 'network_post_reactions' | 'network_post_comments',
  postIds: number[]
): Promise<number[]> {
  if (!supabase) return [];
  const ids: number[] = [];
  let total: number | null = null;

  for (let page = 0; page < COUNT_MAX_PAGES; page++) {
    const from = page * COUNT_PAGE;
    const { data, count, error } = await supabase
      .from(table)
      .select('post_id', { count: page === 0 ? 'exact' : undefined })
      .in('post_id', postIds)
      .range(from, from + COUNT_PAGE - 1);
    if (error) {
      console.warn(`[network] fetchAllPostIds(${table}) error:`, error.message);
      break;
    }
    if (page === 0 && typeof count === 'number') total = count;
    const rows = data ?? [];
    for (const r of rows) ids.push(r.post_id as number);
    if (rows.length < COUNT_PAGE) break;
  }

  if (total !== null && ids.length < total) {
    console.warn(
      `[network] ${table} : ${ids.length}/${total} lignes lues — compteurs tronqués, ` +
        'passer par une vue SQL agrégée.'
    );
  }
  return ids;
}

/** Charge, pour une liste de posts, le nombre de réactions et de commentaires
 *  de chacun — une seule série d'appels par table, pas de N+1 sur le feed.
 *
 *  Le comptage reste côté client car PostgREST ne sait pas renvoyer un
 *  GROUP BY : `count: 'exact'` donne le total de la requête, pas le détail
 *  par post. La pagination garantit que ce total est bien atteint. */
export async function fetchPostCounts(
  postIds: number[]
): Promise<Map<number, { reactions: number; comments: number }>> {
  const map = new Map<number, { reactions: number; comments: number }>();
  if (!supabase || postIds.length === 0) return map;

  const [reactions, comments] = await Promise.all([
    fetchAllPostIds('network_post_reactions', postIds),
    fetchAllPostIds('network_post_comments', postIds),
  ]);
  for (const id of postIds) map.set(id, { reactions: 0, comments: 0 });
  for (const postId of reactions) {
    const e = map.get(postId);
    if (e) e.reactions += 1;
  }
  for (const postId of comments) {
    const e = map.get(postId);
    if (e) e.comments += 1;
  }
  return map;
}

/** Posts déjà encouragés par LE wallet connecté, parmi une liste donnée —
 *  sert à afficher le bouton dans son état actif. */
export async function fetchMyReactions(wallet: string, postIds: number[]): Promise<Set<number>> {
  const set = new Set<number>();
  if (!supabase || postIds.length === 0) return set;
  const { data, error } = await supabase
    .from('network_post_reactions')
    .select('post_id')
    .eq('wallet', wallet)
    .in('post_id', postIds);
  if (error) return set;
  for (const r of data ?? []) set.add(r.post_id as number);
  return set;
}

// ── Écriture (signée) ────────────────────────────────────────────

export async function createPost(
  wallet: string,
  signMessage: SignMessageFn,
  body: string,
  opts?: { imageUrl?: string; linkedProjectPda?: string }
): Promise<{ ok: true; id: number } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };
  const trimmed = body.trim();
  if (!trimmed) return { error: tr('network.emptyPost') };
  if (trimmed.length > MAX_POST_BODY) {
    return { error: tr('network.postTooLong', { max: MAX_POST_BODY }) };
  }

  const signed = await signForNetworkWrite(wallet, signMessage);
  if ('error' in signed) return signed;

  const r = await callNetworkWrite({
    action: 'post',
    wallet,
    ...signed,
    body: trimmed,
    imageUrl: opts?.imageUrl ?? undefined,
    linkedProjectPda: opts?.linkedProjectPda ?? undefined,
    // Langue d'écriture — évite de repasser le post chez DeepL pour les
    // lecteurs qui sont déjà dans cette langue.
    lang: currentLang(),
  });
  if ('error' in r) return r;
  return { ok: true, id: r.data.id as number };
}

/** Bascule l'encouragement 🤝 sur un post — retourne le nouvel état.
 *
 *  Le schéma impose ce modèle : network_post_reactions n'a NI colonne `id`
 *  NI colonne de type, sa clé est (post_id, wallet). Une réaction est donc
 *  binaire et unique par wallet — un sélecteur d'emojis nécessiterait une
 *  migration, pas seulement du front. */
export async function toggleReaction(
  wallet: string,
  signMessage: SignMessageFn,
  postId: number
): Promise<{ ok: true; reacted: boolean } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };
  const signed = await signForNetworkWrite(wallet, signMessage);
  if ('error' in signed) return signed;

  const r = await callNetworkWrite({ action: 'react', wallet, ...signed, postId });
  if ('error' in r) return r;
  return { ok: true, reacted: Boolean(r.data.reacted) };
}

export async function commentOnPost(
  wallet: string,
  signMessage: SignMessageFn,
  postId: number,
  body: string
): Promise<{ ok: true; id: number } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };
  const trimmed = body.trim();
  if (!trimmed) return { error: tr('network.emptyComment') };
  if (trimmed.length > MAX_COMMENT_BODY) {
    return { error: tr('network.commentTooLong', { max: MAX_COMMENT_BODY }) };
  }

  const signed = await signForNetworkWrite(wallet, signMessage);
  if ('error' in signed) return signed;

  const r = await callNetworkWrite({
    action: 'comment',
    wallet,
    ...signed,
    postId,
    body: trimmed,
    lang: currentLang(),
  });
  if ('error' in r) return r;
  return { ok: true, id: r.data.id as number };
}

export async function deletePost(
  wallet: string,
  signMessage: SignMessageFn,
  postId: number
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };
  const signed = await signForNetworkWrite(wallet, signMessage);
  if ('error' in signed) return signed;

  const r = await callNetworkWrite({ action: 'delete-post', wallet, ...signed, postId });
  if ('error' in r) return r;
  return { ok: true };
}

// ── Image de post (optionnelle) ─────────────────────────────────

const MEDIA_BUCKET = 'network-media';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function validatePostImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return tr('errors.mediaBadFormat');
  if (file.size > MAX_IMAGE_BYTES) {
    return tr('errors.mediaTooLarge', { max: (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0) });
  }
  return null;
}

/** Upload une image de post et renvoie son URL publique.
 *
 *  ⚠️ Cette fonction déclenche SA PROPRE signature, distincte de celle de
 *  createPost() : poster avec une image demande donc DEUX signatures au
 *  wallet. L'en-tête de PostComposer.tsx annonce l'inverse (« une seule
 *  signature pour le flux complet ») — c'est le commentaire qui est faux,
 *  pas le code. Fusionner les deux imposerait de faire écrire le post par
 *  l'Edge Function au moment de l'upload, donc de tout réorganiser. */
export async function uploadPostImage(
  wallet: string,
  signMessage: SignMessageFn,
  file: File
): Promise<{ url: string } | { error: string }> {
  if (!isRemoteEnabled || !supabase) return { error: tr('errors.notConfigured') };
  const invalid = validatePostImage(file);
  if (invalid) return { error: invalid };

  const signed = await signForNetworkWrite(wallet, signMessage);
  if ('error' in signed) return signed;

  const r = await callNetworkWrite({
    action: 'post-media-upload-url',
    wallet,
    ...signed,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });
  if ('error' in r) return r;

  const path = r.data.path as string;
  const token = r.data.token as string;
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .uploadToSignedUrl(path, token, file);
  if (uploadError) {
    console.warn('[network] image upload error:', uploadError.message);
    return { error: tr('errors.uploadFailed') };
  }
  return { url: r.data.publicUrl as string };
}
