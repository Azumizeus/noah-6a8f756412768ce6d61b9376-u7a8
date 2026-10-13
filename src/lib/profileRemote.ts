// ═══════════════════════════════════════════════════════
// BuildPact — Persistance distante des profils builders
// Supabase (Postgres + RLS) — table builder_profiles
// ⚠️ L'ÉCRITURE passe OBLIGATOIREMENT par l'Edge Function `update-profile` :
// un profil est lié à une identité de wallet, donc contrairement à
// project_media/pact_events (MVP écriture ouverte assumée), on exige une
// preuve cryptographique (signMessage) que l'appelant contrôle bien ce
// wallet, vérifiée côté serveur. Voir supabase/functions/update-profile.
// ═══════════════════════════════════════════════════════
import type { BuilderProfile, SkillLevel } from './profile';
// Client Supabase partagé (voir supabaseClient.ts) — évite une 2e instance GoTrue/Realtime.
import { supabase, isRemoteEnabled, SUPABASE_PROJECT_URL } from './supabaseClient';
import { isPalette, type ThemeId } from './theme';
import { translate, type Lang } from './i18n/translations';
import { readLang } from './i18n/langStorage';
export { isRemoteEnabled };

function currentLang(): Lang {
  return readLang();
}
function tr(key: string, params?: Record<string, string | number>): string {
  return translate(currentLang(), key, params);
}

const UPDATE_PROFILE_URL = SUPABASE_PROJECT_URL
  ? `${SUPABASE_PROJECT_URL}/functions/v1/update-profile`
  : '';

function fromRemote(row: Record<string, unknown>): BuilderProfile {
  return {
    wallet: row.wallet as string,
    pseudo: (row.display_name as string) ?? '',
    bio: (row.bio as string) ?? '',
    skills: (row.skills as string[]) ?? [],
    skillLevels: (row.skill_levels as Record<string, SkillLevel>) ?? {},
    links: (row.links as Record<string, string>) ?? {},
    availability: row.available ? 'open' : 'busy',
    avatarUrl: (row.avatar_url as string | null) ?? null,
    bannerUrl: (row.banner_url as string | null) ?? null,
    // Validé par `isPalette` et non simplement casté : la colonne est un
    // texte libre côté Postgres, et une palette supprimée du code (ou un
    // '' écrit par submitProfileUpdate ci-dessous) donnerait un ThemeId
    // inexistant. Il serait posé tel quel en [data-theme] sur <html>, sans
    // bloc CSS correspondant — donc un thème muet, à moitié appliqué.
    // `null` = aucune préférence, le thème local de l'appareil reste maître.
    themePalette: isPalette(row.theme_palette) ? (row.theme_palette as ThemeId) : null,
    hideWallet: Boolean(row.hide_wallet ?? false),
    updatedAt: row.updated_at ? new Date(row.updated_at as string).getTime() : 0,
  };
}

/** Charge plusieurs profils d'un coup (wallet → profil) — pour résoudre pseudo/avatar
 *  dans le chat ou le fil d'avancement sans faire un fetch par message. */
export async function fetchProfilesByWallets(wallets: string[]): Promise<Map<string, BuilderProfile>> {
  const map = new Map<string, BuilderProfile>();
  if (!supabase || wallets.length === 0) return map;
  const unique = Array.from(new Set(wallets));
  const { data, error } = await supabase.from('builder_profiles').select('*').in('wallet', unique);
  if (error) {
    console.warn('[profileRemote] fetchProfilesByWallets error:', error.message);
    return map;
  }
  for (const row of data ?? []) {
    const p = fromRemote(row);
    map.set(p.wallet, p);
  }
  return map;
}

/** Résultat de charge distinguant "pas de profil" (état normal, mode
 *  édition légitime) d'un échec réseau (état erreur : on NE force PAS le
 *  mode édition, audit 19/09 — un faux "jamais sauvegardé" fait disparaître
 *  le bouton Annuler et peut pousser l'utilisateur à réécrire son profil). */
export type FetchProfileResult =
  | { status: 'ok'; profile: BuilderProfile | null }
  | { status: 'error' };

export async function fetchProfileDetailed(wallet: string): Promise<FetchProfileResult> {
  if (!supabase) return { status: 'error' };
  const { data, error } = await supabase
    .from('builder_profiles')
    .select('*')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) {
    console.error('[profileRemote] fetch error:', error.message);
    return { status: 'error' };
  }
  return { status: 'ok', profile: data ? fromRemote(data) : null };
}

/** Charge le profil d'un wallet (null si inexistant ou erreur) — simple lecture, RLS publique. */
export async function fetchProfile(wallet: string): Promise<BuilderProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('builder_profiles')
    .select('*')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) {
    console.error('[profileRemote] fetch error:', error.message);
    return null;
  }
  return data ? fromRemote(data) : null;
}

/** Liste tous les profils disponibles (available=true) uniquement. */
export async function listAvailableProfiles(): Promise<BuilderProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('builder_profiles')
    .select('*')
    .eq('available', true)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[profileRemote] list error:', error.message);
    return [];
  }
  return (data ?? []).map(fromRemote);
}

/** Liste TOUS les profils (annuaire builders — page /builders), qu'ils soient
 *  disponibles ou non. On ne cache qu'un profil vide (jamais réellement
 *  enregistré, pseudo vide) pour ne pas polluer l'annuaire. */
export async function listAllProfiles(): Promise<BuilderProfile[]> {
  const r = await listAllProfilesResult();
  return 'profiles' in r ? r.profiles : [];
}

/**
 * Variante qui NE CONFOND PAS « annuaire vide » et « annuaire injoignable ».
 *
 * `listAllProfiles()` renvoie `[]` dans les deux cas — pratique pour un appelant
 * qui ne veut qu'une liste, mais c'est un mensonge d'interface dès qu'il y a un
 * écran derrière : l'annuaire s'affiche « 0 builder » alors que la base est
 * tombée, et l'utilisateur en conclut qu'il n'y a personne. Les pages qui
 * RENDENT une liste doivent passer par ici et distinguer `profiles: []`
 * d'`error`. */
export async function listAllProfilesResult(): Promise<
  { profiles: BuilderProfile[] } | { error: string }
> {
  if (!supabase) return { error: 'remote-disabled' };
  const { data, error } = await supabase
    .from('builder_profiles')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[profileRemote] listAll error:', error.message);
    return { error: error.message };
  }
  return { profiles: (data ?? []).map(fromRemote).filter((p) => p.pseudo.trim() !== '') };
}

/**
 * Message canonique signé par le wallet — DOIT rester synchronisé avec le
 * regex de vérification côté Edge Function (`Timestamp:\s*(\d+)` + contrôle
 * que `message.includes(wallet)`). Le timestamp sert d'anti-replay (la
 * fonction refuse un message vieux de plus de 5 min).
 */
function buildProfileSignMessage(wallet: string, timestamp: number): string {
  return `BuildPact — mise à jour de profil\nWallet: ${wallet}\nTimestamp: ${timestamp}`;
}

/**
 * Enregistre le profil de FAÇON SÉCURISÉE : fait signer un message au wallet
 * (preuve de possession de la clé privée), puis envoie signature + message à
 * l'Edge Function, qui vérifie tout côté serveur avant d'écrire. Ne touche
 * JAMAIS directement la table depuis le client.
 */
export async function submitProfileUpdate(
  wallet: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  profile: BuilderProfile
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !UPDATE_PROFILE_URL) {
    return { error: tr('errors.notConfigured') };
  }

  const timestamp = Date.now();
  const message = buildProfileSignMessage(wallet, timestamp);
  const messageBytes = new TextEncoder().encode(message);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signMessage(messageBytes);
  } catch (e: any) {
    const msg: string = e?.message ?? '';
    if (msg.toLowerCase().includes('user rejected')) {
      return { error: tr('errors.signatureRejected') };
    }
    return { error: tr('errors.signMessageUnsupported') };
  }

  try {
    const res = await fetch(UPDATE_PROFILE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet,
        message,
        signature: Array.from(signatureBytes),
        profile: {
          display_name: profile.pseudo,
          bio: profile.bio,
          roles: profile.skills,
          skills: profile.skills,
          skill_levels: profile.skillLevels,
          links: profile.links,
          available: profile.availability === 'open',
          // `?? ''` et non `?? null` : l'Edge Function valide des chaînes.
          // Corollaire côté lecture — une palette vide revient en '' et non
          // en null, d'où le filtre `isPalette` dans fromRemote().
          avatar_url: profile.avatarUrl ?? '',
          banner_url: profile.bannerUrl ?? '',
          theme_palette: profile.themePalette ?? '',
          hide_wallet: profile.hideWallet ?? false,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data?.error ?? tr('errors.serverError', { status: res.status }) };
    }
    return { ok: true };
  } catch {
    return { error: tr('errors.serverUnreachable') };
  }
}

const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Upload la photo de profil : demande une URL signée (Edge Function, wallet vérifié),
 *  upload direct au bucket public builder-avatars, retourne l'URL publique (cache-bust). */
export async function uploadProfileAvatar(
  wallet: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  file: File
): Promise<{ url: string } | { error: string }> {
  if (!isRemoteEnabled || !UPDATE_PROFILE_URL || !supabase) return { error: tr('errors.notConfigured') };
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) return { error: tr('errors.mediaBadFormat') };
  if (file.size > MAX_AVATAR_BYTES) return { error: tr('errors.mediaTooLarge', { max: (MAX_AVATAR_BYTES / 1024 / 1024).toFixed(0) }) };

  const timestamp = Date.now();
  const message = buildProfileSignMessage(wallet, timestamp);
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signMessage(new TextEncoder().encode(message));
  } catch (e: any) {
    const msg: string = e?.message ?? '';
    if (msg.toLowerCase().includes('user rejected')) return { error: tr('errors.signatureRejected') };
    return { error: tr('errors.signMessageUnsupported') };
  }

  const res = await fetch(UPDATE_PROFILE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'avatar-upload-url',
      wallet,
      message,
      signature: Array.from(signatureBytes),
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  }).catch(() => null);
  if (!res) return { error: tr('errors.serverUnreachable') };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error ?? tr('errors.serverError', { status: res.status }) };

  const { error: uploadError } = await supabase.storage
    .from('builder-avatars')
    .uploadToSignedUrl(data.path as string, data.token as string, file);
  if (uploadError) {
    console.warn('[profileRemote] avatar upload error:', uploadError.message);
    return { error: tr('errors.uploadFailed') };
  }

  return { url: `${data.publicUrl}?t=${Date.now()}` };
}
