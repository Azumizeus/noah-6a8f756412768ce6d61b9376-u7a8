// src/lib/contact.ts
// ═══════════════════════════════════════════════════════════════════
// Demandes de contact entre builders — SÉCURISÉ (v2). Toute la logique de
// vérification (signature signMessage prouvant l'identité de l'appelant)
// vit côté serveur dans supabase/functions/contact, jamais ici. Ce fichier
// ne fait que construire le message à signer et appeler l'Edge Function —
// même pattern que lib/vault.ts.
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled, SUPABASE_PROJECT_URL } from './supabaseClient';
import { translate, type Lang } from './i18n/translations';

export { isRemoteEnabled as contactEnabled };

const CONTACT_URL = SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/functions/v1/contact` : '';

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

const MAX_ROLE_LEN = 60;
const MAX_MESSAGE_LEN = 500;

export interface ContactRequest {
  id: number;
  fromWallet: string;
  toWallet: string;
  roleText: string;
  message: string;
  createdAt: string; // ISO
  /** Langue d'écriture du message ('fr' | 'en'), `null` si antérieure à
   *  la colonne `lang`. */
  lang: string | null;
}

type SignFn = (message: Uint8Array) => Promise<Uint8Array>;

/** Message canonique signé — prouve que l'appelant contrôle bien `wallet`. */
function buildContactSignMessage(wallet: string, timestamp: number): string {
  return `BuildPact — contact\nWallet: ${wallet}\nTimestamp: ${timestamp}`;
}

async function signPayload(
  wallet: string,
  signMessage: SignFn
): Promise<{ message: string; signature: number[] } | { error: string }> {
  const timestamp = Date.now();
  const message = buildContactSignMessage(wallet, timestamp);
  try {
    const sigBytes = await signMessage(new TextEncoder().encode(message));
    return { message, signature: Array.from(sigBytes) };
  } catch (e: any) {
    const msg: string = e?.message ?? '';
    if (msg.toLowerCase().includes('user rejected')) return { error: tr('errors.signatureRejected') };
    return { error: tr('errors.signMessageUnsupported') };
  }
}

async function callContact(body: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(CONTACT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn('[contact] fetch error:', e);
    return { error: tr('errors.serverUnreachable') };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data?.error ?? tr('errors.serverError', { status: res.status }) };
  }
  return data;
}

/** Envoie une demande de contact ("je cherche ce rôle, es-tu disponible ?"),
 *  signée par le wallet expéditeur — impossible de se faire passer pour un autre. */
export async function sendContactRequest(params: {
  fromWallet: string;
  signMessage: SignFn;
  toWallet: string;
  roleText: string;
  message: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !CONTACT_URL) return { error: tr('errors.notConfigured') };
  const roleText = params.roleText.trim().slice(0, MAX_ROLE_LEN);
  const messageText = params.message.trim().slice(0, MAX_MESSAGE_LEN);
  if (!messageText) return { error: tr('errors.contactEmptyMessage') };
  if (params.fromWallet === params.toWallet) return { error: tr('errors.contactSelf') };

  const signed = await signPayload(params.fromWallet, params.signMessage);
  if ('error' in signed) return signed;

  const data = await callContact({
    action: 'send',
    wallet: params.fromWallet,
    ...signed,
    toWallet: params.toWallet,
    roleText,
    messageText,
    lang: currentLang(),
  });
  if (data?.error) return { error: data.error };
  return { ok: true };
}

/** Liste les demandes reçues par ce wallet — signature requise pour prouver
 *  que c'est bien le destinataire qui consulte SES propres demandes. */
export async function fetchContactRequestsFor(
  wallet: string,
  signMessage: SignFn
): Promise<ContactRequest[] | { error: string }> {
  if (!isRemoteEnabled || !CONTACT_URL) return { error: tr('errors.notConfigured') };
  const signed = await signPayload(wallet, signMessage);
  if ('error' in signed) return signed;
  const data = await callContact({ action: 'list', wallet, ...signed });
  if (data?.error) return { error: data.error };
  return (data.requests ?? []) as ContactRequest[];
}

export const MAX_STARS = 6;

/** Note un builder (1 à 6 étoiles), signé par le wallet notant — impossible
 *  de noter en se faisant passer pour quelqu'un d'autre. Renoter le même
 *  builder met juste à jour la note précédente (voir contrainte unique côté
 *  SQL + upsert côté Edge Function). */
export async function submitRating(params: {
  fromWallet: string;
  signMessage: SignFn;
  toWallet: string;
  stars: number;
}): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !CONTACT_URL) return { error: tr('errors.notConfigured') };
  if (params.fromWallet === params.toWallet) return { error: tr('errors.contactSelf') };
  if (!Number.isInteger(params.stars) || params.stars < 1 || params.stars > MAX_STARS) {
    return { error: tr('errors.ratingInvalid', { max: MAX_STARS }) };
  }

  const signed = await signPayload(params.fromWallet, params.signMessage);
  if ('error' in signed) return signed;

  const data = await callContact({
    action: 'rate',
    wallet: params.fromWallet,
    ...signed,
    toWallet: params.toWallet,
    stars: params.stars,
  });
  if (data?.error) return { error: data.error };
  return { ok: true };
}

export interface RatingSummary {
  avgStars: number;
  ratingCount: number;
}

/** Résumé public léger (moyenne + nombre de notes, JAMAIS le détail) pour
 *  un ou plusieurs wallets — pas de signature nécessaire, lecture publique
 *  de la vue agrégée builder_ratings_summary (voir builder_ratings.sql). */
export async function fetchRatingSummaries(wallets: string[]): Promise<Map<string, RatingSummary>> {
  const map = new Map<string, RatingSummary>();
  if (!supabase || wallets.length === 0) return map;
  const unique = Array.from(new Set(wallets));
  const { data, error } = await supabase
    .from('builder_ratings_summary')
    .select('*')
    .in('to_wallet', unique);
  if (error) {
    console.warn('[contact] fetchRatingSummaries error:', error.message);
    return map;
  }
  for (const row of data ?? []) {
    map.set(row.to_wallet as string, {
      avgStars: Number(row.avg_stars) || 0,
      ratingCount: Number(row.rating_count) || 0,
    });
  }
  return map;
}

// ─── Badge "non lu" — 100% local (localStorage), même esprit que lib/seen.ts
// mais indexé par wallet destinataire plutôt que par pact. ───
function seenKey(wallet: string): string {
  return `buildpact_contact_seen_${wallet}`;
}

export function getContactLastSeen(wallet: string): number {
  try {
    const raw = localStorage.getItem(seenKey(wallet));
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function markContactSeenNow(wallet: string): void {
  try {
    localStorage.setItem(seenKey(wallet), String(Date.now()));
  } catch {
    /* non bloquant */
  }
}
