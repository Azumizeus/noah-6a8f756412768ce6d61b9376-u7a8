// supabase/functions/update-profile/index.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — écriture SÉCURISÉE du profil builder.
//
// Pourquoi une Edge Function (et pas juste une policy RLS ouverte comme
// project_media/pact_events) : un profil est lié à une IDENTITÉ de wallet.
// Laisser n'importe qui appeler `upsert` sur builder_profiles depuis le
// navigateur permettrait d'écrire le profil de N'IMPORTE QUEL wallet, y
// compris celui de quelqu'un d'autre — usurpation. Ici, le wallet doit
// signer un message (signMessage) prouvant qu'il contrôle la clé privée ;
// cette fonction vérifie la signature CÔTÉ SERVEUR avant d'écrire avec la
// service_role key (qui bypass RLS — builder_profiles.sql ne donne AUCUNE
// policy d'insert/update publique, l'écriture ne peut passer que par ici).
//
// Déploiement (une seule fois, depuis la racine du repo) :
//   1. npm install -g supabase        (CLI Supabase)
//   2. supabase login
//   3. supabase link --project-ref <ton-project-ref>   (visible dans l'URL
//      du dashboard Supabase, ou Settings → General → Reference ID)
//   4. supabase functions deploy update-profile --no-verify-jwt
//      (--no-verify-jwt : cette fonction n'utilise pas l'auth Supabase, elle
//      a sa propre vérification de signature wallet)
//
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées AUTOMATIQUEMENT
// par le runtime Edge Functions — rien à configurer manuellement.
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
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 min — anti-replay raisonnable
const MAX_CLOCK_SKEW_MS = 60 * 1000; // tolère 1 min d'horloge client en avance

// Regex ANCRÉE (^…$). Non négociable : avec un simple `includes`, une
// signature obtenue pour une AUTRE action (vault, contact, etc.) — qui
// contient elle aussi le wallet quelque part dans son texte — pourrait
// être rejouée ici. Voir project-write/index.ts pour le même principe.
const PROFILE_RE = new RegExp(`^BuildPact — mise à jour de profil\\nWallet: (${B58})\\nTimestamp: (\\d{10,16})$`);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const SKILL_LEVELS = ['debutant', 'confirme', 'expert'];
// Liste blanche des palettes. ⚠️ Une palette absente d'ici n'est PAS
// rejetée : elle est écrasée en `null` et la réponse reste { ok: true }.
// Ajouter une palette côté client sans la déclarer ici perd donc le choix
// en base, sans la moindre erreur visible. `aurum` / `atelier` ajoutées le
// 29/08 en même temps que leurs blocs CSS.
  // ⚠️ MIROIR de ALL_PALETTES (src/lib/theme/palettes.ts) — 21/09 :
  // +volta, +ember (habillages validés prototype v3). La liste doit suivre
  // à CHAQUE ajout de palette, sinon l'appel discarte la valeur en NULL.
  const THEME_PALETTES = ['violet', 'cyan', 'coral', 'aurum', 'atelier', 'nova', 'volta', 'ember'];

interface ProfilePayload {
  display_name?: string;
  bio?: string;
  roles?: string[];
  skills?: string[];
  skill_levels?: Record<string, string>;
  links?: Record<string, string>;
  available?: boolean;
  avatar_url?: string;
  banner_url?: string;
  theme_palette?: string;
  hide_wallet?: boolean;
}

function sanitizeProfile(p: ProfilePayload) {
  const display_name = String(p.display_name ?? '').slice(0, 40);
  const bio = String(p.bio ?? '').slice(0, 280);
  const roles = Array.isArray(p.roles) ? p.roles.slice(0, 20).map((r) => String(r).slice(0, 40)) : [];
  const skills = Array.isArray(p.skills) ? p.skills.slice(0, 20).map((s) => String(s).slice(0, 40)) : [];
  const links: Record<string, string> = {};
  if (p.links && typeof p.links === 'object') {
    for (const k of ['github', 'twitter', 'discord', 'website', 'portfolio']) {
      const v = (p.links as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.length > 0) links[k] = v.slice(0, 300);
    }
  }
  // Niveau par compétence — on ne garde que les entrées dont la clé est une
  // compétence réellement sélectionnée (skills) et dont la valeur est un
  // niveau connu, pour éviter d'accumuler des clés orphelines/arbitraires.
  const skill_levels: Record<string, string> = {};
  if (p.skill_levels && typeof p.skill_levels === 'object') {
    for (const skillId of skills) {
      const lvl = (p.skill_levels as Record<string, unknown>)[skillId];
      if (typeof lvl === 'string' && SKILL_LEVELS.includes(lvl)) skill_levels[skillId] = lvl;
    }
  }
  const available = Boolean(p.available ?? true);
  const avatar_url = typeof p.avatar_url === 'string' ? p.avatar_url.slice(0, 500) : '';
  const banner_url = typeof p.banner_url === 'string' ? p.banner_url.slice(0, 500) : '';
  const theme_palette =
    typeof p.theme_palette === 'string' && THEME_PALETTES.includes(p.theme_palette)
      ? p.theme_palette
      : null;
  const hide_wallet = Boolean(p.hide_wallet ?? false);
  return {
    display_name,
    bio,
    roles,
    skills,
    skill_levels,
    links,
    available,
    avatar_url,
    banner_url,
    theme_palette,
    hide_wallet,
  };
}

const AVATAR_BUCKET = 'builder-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 Mo
const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const BANNER_BUCKET = 'builder-banners';
const MAX_BANNER_BYTES = 4 * 1024 * 1024; // 4 Mo — une bannière est plus large
const ALLOWED_BANNER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non supportée.' }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const { message, signature, profile } = body ?? {};

  // Le wallet est extrait DU MESSAGE SIGNÉ, jamais du payload — sinon
  // rien n'empêcherait d'envoyer wallet: "victime" avec une signature
  // valide pour un AUTRE wallet.
  if (typeof message !== 'string') {
    return jsonResponse({ error: 'Message de signature absent.' }, 400);
  }
  const parsedMsg = PROFILE_RE.exec(message);
  if (!parsedMsg) {
    return jsonResponse({ error: 'Message de signature invalide.' }, 400);
  }
  const [, wallet, tsStr] = parsedMsg;

  if (!Array.isArray(signature) || signature.length !== 64) {
    return jsonResponse({ error: 'Signature invalide.' }, 400);
  }

  // ── Anti-replay : le timestamp signé doit être récent ──
  const age = Date.now() - Number(tsStr);
  if (age > MAX_MESSAGE_AGE_MS || age < -MAX_CLOCK_SKEW_MS) {
    return jsonResponse({ error: 'Signature expirée — réessaie (recharge la page si besoin).' }, 400);
  }

  // ── Vérification cryptographique de la signature ed25519 ──
  let verified = false;
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(signature as number[]);
    const pubkeyBytes = bs58.decode(wallet);
    verified = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
  } catch {
    verified = false;
  }
  if (!verified) {
    return jsonResponse({ error: 'Signature invalide — impossible de prouver que tu contrôles ce wallet.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Configuration serveur manquante (SUPABASE_URL / SERVICE_ROLE_KEY).' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ═══ action='avatar-upload-url' : signature déjà vérifiée ci-dessus →
  // le wallet a prouvé qu'il contrôle CE wallet, donc on l'autorise à
  // écrire uniquement sous son propre chemin dans le bucket avatars. ═══
  if (body.action === 'avatar-upload-url') {
    const mimeType = String(body.mimeType ?? '');
    const sizeBytes = Number(body.sizeBytes ?? 0);
    if (!ALLOWED_AVATAR_TYPES.includes(mimeType)) {
      return jsonResponse({ error: 'Format non supporté — utilise PNG, JPEG, WebP ou GIF.' }, 400);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_AVATAR_BYTES) {
      return jsonResponse({ error: `Fichier trop lourd (max ${MAX_AVATAR_BYTES / 1024 / 1024} Mo).` }, 400);
    }
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const path = `${wallet}/avatar.${ext}`;
    const { data: signedUpload, error: signErr } = await admin.storage
      .from(AVATAR_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signErr || !signedUpload) {
      console.error('[update-profile] avatar signed url error:', signErr?.message);
      return jsonResponse({ error: "Échec de préparation de l'upload — réessaie." }, 500);
    }
    const { data: pub } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return jsonResponse({ uploadUrl: signedUpload.signedUrl, token: signedUpload.token, path, publicUrl: pub.publicUrl });
  }

  // Même logique que l'avatar, bucket et plafond distincts.
  if (body.action === 'banner-upload-url') {
    const mimeType = String(body.mimeType ?? '');
    const sizeBytes = Number(body.sizeBytes ?? 0);
    if (!ALLOWED_BANNER_TYPES.includes(mimeType)) {
      return jsonResponse({ error: 'Format non supporté — utilise PNG, JPEG, WebP ou GIF.' }, 400);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BANNER_BYTES) {
      return jsonResponse({ error: `Fichier trop lourd (max ${MAX_BANNER_BYTES / 1024 / 1024} Mo).` }, 400);
    }
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const path = `${wallet}/banner.${ext}`;
    const { data: signedUpload, error: signErr } = await admin.storage
      .from(BANNER_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signErr || !signedUpload) {
      console.error('[update-profile] banner signed url error:', signErr?.message);
      return jsonResponse({ error: "Échec de préparation de l'upload — réessaie." }, 500);
    }
    const { data: pub } = admin.storage.from(BANNER_BUCKET).getPublicUrl(path);
    return jsonResponse({ uploadUrl: signedUpload.signedUrl, token: signedUpload.token, path, publicUrl: pub.publicUrl });
  }

  const clean = sanitizeProfile(profile ?? {});

  const { error } = await admin.from('builder_profiles').upsert(
    {
      wallet,
      display_name: clean.display_name,
      bio: clean.bio,
      roles: clean.roles,
      skills: clean.skills,
      skill_levels: clean.skill_levels,
      links: clean.links,
      available: clean.available,
      avatar_url: clean.avatar_url,
      banner_url: clean.banner_url,
      theme_palette: clean.theme_palette,
      hide_wallet: clean.hide_wallet,
    },
    { onConflict: 'wallet' }
  );

  if (error) {
    console.error('[update-profile] upsert error:', error.message);
    // ⚠️ Devnet/MVP : on renvoie le message Postgres brut au client pour que
    // l'échec soit diagnosticable directement depuis l'UI (au lieu du
    // générique "réessaie" qui masquait la vraie cause — colonne manquante,
    // contrainte violée, etc.). Pas de donnée sensible exposée ici (juste le
    // texte d'erreur SQL), acceptable pour ce stade du projet.
    return jsonResponse({ error: `Échec de l'enregistrement — ${error.message}` }, 500);
  }

  return jsonResponse({ ok: true });
});
