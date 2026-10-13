// src/lib/media.ts
// ═══════════════════════════════════════════════════════════════════
// Logo + bannière de projet — upload réel vers Supabase Storage (bucket
// "project-media", public). Off-chain volontairement (comme role_interests
// / pact_events) : le compte Project on-chain a déjà un budget d'octets
// serré, stocker des images dessus serait hors de prix. Une seule ligne
// par projet dans project_media (upsert).
//
// ⚠️ SÉCURITÉ — migration 20260828180000. project_media portait à la fois
// une policy INSERT et une policy UPDATE publiques : n'importe qui pouvait
// remplacer le logo, la bannière et la présentation de N'IMPORTE quel
// projet. C'était le trou le plus visible du produit — un défacement de
// fiche publique en une requête curl. L'écriture passe désormais par l'Edge
// Function `project-write`, qui exige une signature ET vérifie on-chain que
// le signataire est bien le founder du projet.
//
// ⚠️ Réparé le 28/08 — migration 20260828190000 avait fermé les policies
// INSERT/UPDATE publiques sur storage.objects (n'importe qui pouvait
// écraser l'objet `<pda>/logo.png` d'un tiers, chemin déterministe + clé
// anon). `uploadMediaFile` ne parle donc plus jamais en écriture directe au
// bucket : elle demande d'abord une URL d'upload SIGNÉE à l'Edge Function
// `project-write` (action "media-upload-url", même modèle que
// `vault`/upload-url), qui vérifie la signature PUIS l'autorisation avant
// de l'émettre — le fichier ne transite jamais par la fonction elle-même.
//
// Deux cas d'autorisation gérés côté serveur (voir project-write) :
//   1. Le projet existe déjà on-chain (EditMediaModal) → le signataire doit
//      être project.creator, lu on-chain.
//   2. Le projet n'existe pas ENCORE (upload pendant CreatePactWizard,
//      juste après createProject) → le serveur redérive le PDA depuis
//      (wallet, projectId) fourni en paramètre et vérifie qu'il correspond.
//      D'où le paramètre `projectId` optionnel de `uploadMediaFile`,
//      OBLIGATOIRE dans ce second cas.
//
// La signature est réutilisée telle quelle pour l'appel "media" qui suit
// (enregistrement des URLs) — un seul popup wallet pour tout le flux
// (upload logo + upload bannière + enregistrement), comme avant la
// fermeture du bucket.
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled } from './supabaseClient';
import { translate, type Lang } from './i18n/translations';
import {
  buildMediaSignMessage,
  callProjectWrite,
  signForProjectWrite,
  type SignMessageFn,
} from './projectWrite';

export { isRemoteEnabled as mediaEnabled };

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

export interface ProjectMedia {
  projectPda: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  pitchVideoUrl: string | null;
  aboutText: string | null;
  aboutTextEn: string | null;
}

const BUCKET = 'project-media';
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 Mo
const MAX_BANNER_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Valide un fichier AVANT l'upload — évite un aller-retour réseau pour rien. */
export function validateMediaFile(file: File, kind: 'logo' | 'banner'): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return tr('errors.mediaBadFormat');
  }
  const max = kind === 'logo' ? MAX_LOGO_BYTES : MAX_BANNER_BYTES;
  if (file.size > max) {
    return tr('errors.mediaTooLarge', { max: (max / 1024 / 1024).toFixed(0) });
  }
  return null;
}

function extFromFile(file: File): string {
  const fromType = file.type.split('/')[1];
  return fromType === 'jpeg' ? 'jpg' : fromType || 'png';
}

/**
 * Demande une URL d'upload signée à l'Edge Function pour CE chemin précis
 * (`<projectPda>/<kind>.<ext>`), sur la base d'une signature déjà obtenue
 * par l'appelant (réutilisée telle quelle — voir en-tête de fichier).
 */
async function requestMediaUploadUrl(
  projectPda: string,
  kind: 'logo' | 'banner',
  file: File,
  signed: { message: string; signature: number[] },
  projectId?: string
): Promise<{ path: string; token: string } | { error: string }> {
  const r = await callProjectWrite({
    action: 'media-upload-url',
    projectPda,
    message: signed.message,
    signature: signed.signature,
    kind,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    ...(projectId ? { projectId } : {}),
  });

  if ('error' in r) return { error: r.error };

  const path = (r as { data?: Record<string, unknown> }).data?.path;
  const token = (r as { data?: Record<string, unknown> }).data?.token;
  if (typeof path !== 'string' || typeof token !== 'string') {
    return { error: tr('errors.uploadFailed') };
  }
  return { path, token };
}

/**
 * Upload un logo ou une bannière pour un projet (chemin déterministe
 * `<projectPda>/<kind>.<ext>`, upsert — un ré-upload remplace l'ancien).
 * N'écrit rien dans `project_media` — voir `saveProjectMedia` pour ça.
 *
 * `signed` est le couple {message, signature} déjà obtenu par l'appelant
 * (une seule signature wallet sert à tous les fichiers ET à l'appel
 * `saveProjectMedia` qui suit — voir en-tête de fichier).
 *
 * `projectId` est OBLIGATOIRE si le projet vient tout juste d'être créé et
 * n'est pas encore garanti visible du RPC (cas CreatePactWizard) : le
 * serveur ne peut pas encore lire `project.creator` on-chain, et redérive
 * le PDA à partir de (wallet, projectId) à la place. Omissible pour un
 * projet déjà existant (EditMediaModal), où la lecture on-chain suffit.
 */
export async function uploadMediaFile(
  projectPda: string,
  file: File,
  kind: 'logo' | 'banner',
  signed: { message: string; signature: number[] },
  projectId?: string
): Promise<{ url: string } | { error: string }> {
  if (!supabase) return { error: tr('errors.notConfigured') };

  const invalid = validateMediaFile(file, kind);
  if (invalid) return { error: invalid };

  const prep = await requestMediaUploadUrl(projectPda, kind, file, signed, projectId);
  if ('error' in prep) return prep;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, file);

  if (uploadError) {
    console.warn('[media] upload error:', uploadError.message);
    return { error: tr('errors.uploadFailed') };
  }

  const path = `${projectPda}/${kind}.${extFromFile(file)}`;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust : le chemin est déterministe (même URL si on remplace le
  // fichier), on ajoute un ?t= pour forcer le navigateur à recharger la
  // nouvelle image plutôt que de servir l'ancienne depuis son cache.
  return { url: `${data.publicUrl}?t=${Date.now()}` };
}

/** Champs modifiables de project_media. Un champ absent reste inchangé ;
 *  une chaîne vide efface la valeur côté serveur. */
export interface ProjectMediaPatch {
  logoUrl?: string;
  bannerUrl?: string;
  pitchVideoUrl?: string;
  aboutText?: string;
  aboutTextEn?: string;
}

/**
 * Écrit un lot de champs en UNE signature. Founder-only (vérifié on-chain
 * par l'Edge Function, pas ici — un contrôle côté client ne protège rien).
 *
 * `presigned`, s'il est fourni, réutilise une signature déjà obtenue (par
 * exemple pour les appels `uploadMediaFile` qui ont précédé) au lieu d'en
 * redemander une — c'est ce qui garde le flux logo+bannière+enregistrement
 * à UN SEUL popup wallet plutôt que trois.
 */
export async function saveProjectMedia(
  projectPda: string,
  patch: ProjectMediaPatch,
  auth: { wallet: string; signMessage: SignMessageFn },
  presigned?: { message: string; signature: number[] }
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };
  if (Object.keys(patch).length === 0) return { ok: true };

  const signed =
    presigned ??
    (await signForProjectWrite(
      auth.signMessage,
      buildMediaSignMessage(auth.wallet, projectPda, Date.now())
    ));
  if ('error' in signed) return { error: signed.error };

  const r = await callProjectWrite({
    action: 'media',
    projectPda,
    message: signed.message,
    signature: signed.signature,
    ...patch,
  });

  if ('error' in r) {
    console.warn('[media] enregistrement refusé:', r.error);
    return { error: r.error };
  }
  return { ok: true };
}

/** Signe une fois le message "médias du projet", réutilisable pour
 *  `uploadMediaFile` (plusieurs fois) puis `saveProjectMedia` — voir
 *  en-tête de fichier pour pourquoi cette réutilisation est sûre. */
export async function signMediaWrite(
  wallet: string,
  projectPda: string,
  signMessage: SignMessageFn
): Promise<{ message: string; signature: number[] } | { error: string }> {
  return signForProjectWrite(signMessage, buildMediaSignMessage(wallet, projectPda, Date.now()));
}

function fromRemote(row: Record<string, unknown>): ProjectMedia {
  return {
    projectPda: row.project_pda as string,
    logoUrl: (row.logo_url as string | null) ?? null,
    bannerUrl: (row.banner_url as string | null) ?? null,
    pitchVideoUrl: (row.pitch_video_url as string | null) ?? null,
    aboutText: (row.about_text as string | null) ?? null,
    aboutTextEn: (row.about_text_en as string | null) ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Vidéo de présentation founder — LIEN EXTERNE uniquement (YouTube/Loom/
// Vimeo), pas d'upload de fichier. Choix volontaire : une vidéo pèse bien
// plus lourd qu'un logo/bannière et saturerait vite le quota gratuit
// Supabase Storage (~1 Go) ; un lien vers un hébergeur vidéo dédié est plus
// fiable et plus rapide à charger pour un juge qui clique le lien démo.
// ═══════════════════════════════════════════════════════════════════

/** Détecte l'hébergeur d'une URL vidéo et son ID, ou null si non supporté. */
function parseVideoUrl(url: string): { host: 'youtube' | 'loom' | 'vimeo'; id: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.searchParams.get('v');
    if (id) return { host: 'youtube', id };
    const shorts = u.pathname.match(/^\/shorts\/([\w-]+)/);
    if (shorts) return { host: 'youtube', id: shorts[1] };
    return null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return id ? { host: 'youtube', id } : null;
  }
  if (host === 'loom.com') {
    const m = u.pathname.match(/^\/share\/([\w-]+)/);
    return m ? { host: 'loom', id: m[1] } : null;
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    return m ? { host: 'vimeo', id: m[1] } : null;
  }
  return null;
}

/** Message d'erreur si l'URL n'est pas un lien YouTube/Loom/Vimeo valide, sinon null. */
export function validateVideoUrl(url: string): string | null {
  if (!url.trim()) return null; // vide = pas de vidéo, valide (permet d'en retirer une)
  if (!parseVideoUrl(url)) {
    return tr('errors.videoLinkInvalid');
  }
  return null;
}

/** Convertit une URL "watch" en URL embarquable dans un <iframe>, ou null si non supporté. */
export function toEmbedUrl(url: string): string | null {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;
  switch (parsed.host) {
    case 'youtube':
      return `https://www.youtube.com/embed/${parsed.id}`;
    case 'loom':
      return `https://www.loom.com/embed/${parsed.id}`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${parsed.id}`;
  }
}

/** Enregistre (ou efface, si url vide) le lien vidéo de présentation d'un projet. */
export async function setProjectVideo(
  projectPda: string,
  url: string,
  auth: { wallet: string; signMessage: SignMessageFn }
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };
  const invalid = validateVideoUrl(url);
  if (invalid) return { error: invalid };

  const signed = await signForProjectWrite(
    auth.signMessage,
    buildMediaSignMessage(auth.wallet, projectPda, Date.now())
  );
  if ('error' in signed) return { error: signed.error };

  const r = await callProjectWrite({
    action: 'media',
    projectPda,
    message: signed.message,
    signature: signed.signature,
    // Chaîne vide = effacement explicite côté serveur (retirer une vidéo).
    pitchVideoUrl: url.trim(),
  });

  if ('error' in r) {
    console.warn('[media] video refusée:', r.error);
    return { error: r.error };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════
// "À propos" — présentation longue, éditable à tout moment (même après
// finalisation du pact). Contrairement à la description on-chain (verrouillée
// pour de bon à la création — garantie de confiance pour les backers), ce
// texte off-chain permet au founder d'enrichir sa présentation sans jamais
// pouvoir réécrire la promesse initiale. Colonne about_text sur project_media,
// contrainte CHECK côté DB alignée sur MAX_ABOUT_LEN.
// ═══════════════════════════════════════════════════════════════════
const MAX_ABOUT_LEN = 4000;

/** Message d'erreur si le texte "À propos" dépasse la limite, sinon null. */
export function validateAboutText(text: string): string | null {
  if (text.length > MAX_ABOUT_LEN) {
    return `Texte trop long (max ${MAX_ABOUT_LEN} caractères, actuellement ${text.length}).`;
  }
  return null;
}

/**
 * Enregistre (ou efface, si vide) la présentation longue "À propos" d'un
 * projet, dans les deux langues en un seul upsert — le champ non modifié
 * est simplement réécrit avec sa valeur courante (no-op côté data).
 */
export async function setProjectAbout(
  projectPda: string,
  textFr: string,
  textEn: string,
  auth: { wallet: string; signMessage: SignMessageFn }
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };
  const invalidFr = validateAboutText(textFr);
  if (invalidFr) return { error: invalidFr };
  const invalidEn = validateAboutText(textEn);
  if (invalidEn) return { error: invalidEn };

  const signed = await signForProjectWrite(
    auth.signMessage,
    buildMediaSignMessage(auth.wallet, projectPda, Date.now())
  );
  if ('error' in signed) return { error: signed.error };

  const r = await callProjectWrite({
    action: 'media',
    projectPda,
    message: signed.message,
    signature: signed.signature,
    aboutText: textFr.trim(),
    aboutTextEn: textEn.trim(),
  });

  if ('error' in r) {
    console.warn('[media] about refusé:', r.error);
    return { error: r.error };
  }
  return { ok: true };
}

/** Charge TOUS les médias en un seul appel — pour les listes (Pacts/Marketplace), évite le N+1. */
export async function fetchAllProjectMedia(): Promise<Map<string, ProjectMedia>> {
  const map = new Map<string, ProjectMedia>();
  if (!supabase) return map;
  const { data, error } = await supabase.from('project_media').select('*');
  if (error) {
    console.warn('[media] fetch all error:', error.message);
    return map;
  }
  for (const row of data ?? []) {
    const m = fromRemote(row);
    map.set(m.projectPda, m);
  }
  return map;
}

/** Charge le média d'UN seul projet (fiche publique isolée). */
export async function fetchProjectMedia(projectPda: string): Promise<ProjectMedia | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_pda', projectPda)
    .maybeSingle();
  if (error || !data) return null;
  return fromRemote(data);
}
