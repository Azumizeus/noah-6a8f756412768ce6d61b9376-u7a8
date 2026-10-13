// src/lib/vault.ts
// ═══════════════════════════════════════════════════════════════════
// Vault de documents privés par projet — client.
// Toute la logique de sécurité (vérif signature + appartenance au projet
// on-chain) vit côté serveur dans supabase/functions/vault (service_role,
// jamais exposée ici). Ce fichier ne fait que : construire le message à
// signer, appeler l'Edge Function, et gérer l'upload direct au bucket
// privé via une signed URL (le fichier ne transite jamais par la fonction
// elle-même — seule l'autorisation d'upload le fait).
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled, SUPABASE_PROJECT_URL } from './supabaseClient';
import { translate, type Lang } from './i18n/translations';

export { isRemoteEnabled as vaultEnabled };

const VAULT_URL = SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/functions/v1/vault` : '';
const BUCKET = 'project-documents';

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

export type DocumentStatus = 'pending' | 'approved' | 'changes_requested';

export interface VaultDocument {
  id: number;
  title: string;
  uploaderWallet: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  founderNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  supersedesId: number | null;
  url: string | null;
}

export interface VersionChain {
  /** Version la plus récente de la chaîne — celle affichée en premier. */
  latest: VaultDocument;
  /** Versions précédentes, plus récente d'abord (vide si jamais remplacée). */
  history: VaultDocument[];
}

/** Regroupe une liste plate de documents en chaînes de versions (v3 → v2 → v1)
 *  via supersedesId, côté client — voir project_documents.sql pour le schéma. */
export function groupVaultVersions(documents: VaultDocument[]): VersionChain[] {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const supersededIds = new Set(
    documents.filter((d) => d.supersedesId != null).map((d) => d.supersedesId as number)
  );
  const latests = documents.filter((d) => !supersededIds.has(d.id));
  return latests
    .map((latest) => {
      const history: VaultDocument[] = [];
      let current = latest;
      while (current.supersedesId != null) {
        const prev = byId.get(current.supersedesId);
        if (!prev) break;
        history.push(prev);
        current = prev;
      }
      return { latest, history };
    })
    .sort((a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime());
}

type SignFn = (message: Uint8Array) => Promise<Uint8Array>;

/** Message canonique signé par le wallet pour prouver son identité auprès de l'Edge Function vault. */
function buildVaultSignMessage(wallet: string, timestamp: number): string {
  return `BuildPact — accès au vault\nWallet: ${wallet}\nTimestamp: ${timestamp}`;
}

async function signPayload(
  wallet: string,
  signMessage: SignFn
): Promise<{ message: string; signature: number[] } | { error: string }> {
  const timestamp = Date.now();
  const message = buildVaultSignMessage(wallet, timestamp);
  try {
    const sigBytes = await signMessage(new TextEncoder().encode(message));
    return { message, signature: Array.from(sigBytes) };
  } catch (e: any) {
    const msg: string = e?.message ?? '';
    if (msg.toLowerCase().includes('user rejected')) return { error: tr('errors.signatureRejected') };
    return { error: tr('errors.signMessageUnsupported') };
  }
}

async function callVault(body: Record<string, unknown>): Promise<any> {
  let res: Response;
  try {
    res = await fetch(VAULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Fetch qui échoue avant même une réponse (fonction pas déployée, CORS,
    // pas de réseau...) — sans ce catch l'erreur restait invisible pour
    // l'utilisateur (le bouton "se rallumait" sans aucun message).
    console.warn('[vault] fetch error:', e);
    return { error: tr('errors.serverUnreachable') };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data?.error ?? tr('errors.serverError', { status: res.status }) };
  }
  return data;
}

/** Liste les documents visibles par ce wallet (membre ou founder) pour un projet. */
export async function listVaultDocuments(
  wallet: string,
  projectPda: string,
  signMessage: SignFn
): Promise<{ documents: VaultDocument[]; isFounder: boolean } | { error: string }> {
  if (!isRemoteEnabled || !VAULT_URL) return { error: tr('errors.notConfigured') };
  const signed = await signPayload(wallet, signMessage);
  if ('error' in signed) return signed;
  const data = await callVault({ action: 'list', wallet, projectPda, ...signed });
  if (data?.error) return { error: data.error };
  return { documents: data.documents as VaultDocument[], isFounder: Boolean(data.isFounder) };
}

/** Upload un document : demande une URL signée, upload direct au bucket, puis enregistre les métadonnées. */
export async function uploadVaultDocument(
  wallet: string,
  projectPda: string,
  signMessage: SignFn,
  file: File,
  title: string,
  supersedesId?: number
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !VAULT_URL || !supabase) return { error: tr('errors.notConfigured') };
  const signed = await signPayload(wallet, signMessage);
  if ('error' in signed) return signed;

  const prep = await callVault({
    action: 'upload-url',
    wallet,
    projectPda,
    ...signed,
    title,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    ...(supersedesId != null ? { supersedesId } : {}),
  });
  if (prep?.error) return { error: prep.error };

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(prep.path as string, prep.token as string, file);
  if (uploadError) {
    console.warn('[vault] upload error:', uploadError.message);
    return { error: tr('errors.uploadFailed') };
  }
  return { ok: true };
}

export interface VaultSummary {
  docCount: number;
  latestAt: string | null;
}

/** Résumé public léger (compteur + date du dernier upload, JAMAIS le contenu) —
 *  pour un badge "nouveau document" sans signature ni appel à l'Edge Function.
 *  ⚠️ Audit 19/09 : la vue project_documents_summary a été durcie
 *  (migration tighten_summary_view_grants) à service_role uniquement —
 *  un appel anon est voué à échouer. On court-circuite donc le réseau et
 *  on renvoie un état vide explicite : le badge reste au repos. Une vraie
 *  reconstruction passera par l'Edge Function `vault` (signée), en V2. */
export async function fetchVaultSummary(projectPda: string): Promise<VaultSummary> {
  void projectPda;
  if (!supabase) return { docCount: 0, latestAt: null };
  return { docCount: 0, latestAt: null };
}

/** Le founder approuve ou demande des changements sur un document. */
export async function reviewVaultDocument(
  wallet: string,
  projectPda: string,
  signMessage: SignFn,
  documentId: number,
  status: Exclude<DocumentStatus, 'pending'>,
  note: string
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !VAULT_URL) return { error: tr('errors.notConfigured') };
  const signed = await signPayload(wallet, signMessage);
  if ('error' in signed) return signed;
  const data = await callVault({ action: 'review', wallet, projectPda, ...signed, documentId, status, note });
  if (data?.error) return { error: data.error };
  return { ok: true };
}
