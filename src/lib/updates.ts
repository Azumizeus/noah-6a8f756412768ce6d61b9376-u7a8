// src/lib/updates.ts
// ═══════════════════════════════════════════════════════════════════
// Fil d'avancement des membres (table project_updates, Supabase) — chaque
// membre du pact peut poster un court texte + un lien optionnel ("Milestone
// X fait", lien vers une démo/repo/capture).
//
// ⚠️ L'écriture passe par l'Edge Function `project-write` depuis la
// migration 20260828180000. La policy INSERT publique laissait poster une
// mise à jour sous le wallet de n'importe quel membre — or ce fil sert
// justement à attester de l'avancement auprès des backers. `author_wallet`
// est désormais rempli par le SERVEUR à partir de la signature vérifiée,
// jamais depuis un champ envoyé par le client.
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled } from './supabaseClient';
import { translate, type Lang } from './i18n/translations';
import {
  buildUpdateSignMessage,
  callProjectWrite,
  signForProjectWrite,
  type SignMessageFn,
} from './projectWrite';

export { isRemoteEnabled as updatesEnabled };

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

const MAX_BODY_LEN = 500;
const MAX_LINK_LEN = 300;

export interface ProjectUpdate {
  id: number;
  projectPda: string;
  authorWallet: string;
  body: string;
  link: string | null;
  createdAt: string; // ISO
}

function fromRemote(row: Record<string, unknown>): ProjectUpdate {
  return {
    id: row.id as number,
    projectPda: row.project_pda as string,
    authorWallet: row.author_wallet as string,
    body: row.body as string,
    link: (row.link as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Validation avant envoi — évite un aller-retour réseau pour un texte vide/trop long. */
export function validateUpdateBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return tr('errors.updateEmptyBody');
  if (trimmed.length > MAX_BODY_LEN) return tr('errors.textTooLong', { max: MAX_BODY_LEN });
  return null;
}

export function validateUpdateLink(link: string): string | null {
  if (!link.trim()) return null; // optionnel
  if (link.trim().length > MAX_LINK_LEN) return tr('errors.linkTooLong', { max: MAX_LINK_LEN });
  try {
    new URL(link.trim());
    return null;
  } catch {
    return tr('errors.linkInvalid');
  }
}

/**
 * Publie une mise à jour. Exige une signature du wallet auteur.
 *
 * Le popup est assumé : poster une mise à jour est un acte rare et
 * délibéré, contrairement au chat où un popup par message rendait l'usage
 * impossible (d'où le système de session côté chat). Ajouter une session
 * ici compliquerait le modèle pour économiser un clic tous les trois jours.
 */
export async function postProjectUpdate(params: {
  projectPda: string;
  authorWallet: string;
  body: string;
  link?: string;
  signMessage: SignMessageFn;
}): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled) return { error: tr('errors.notConfigured') };

  // Validation locale d'abord : inutile de faire signer l'utilisateur pour
  // se faire refuser ensuite sur un texte vide.
  const bodyErr = validateUpdateBody(params.body);
  if (bodyErr) return { error: bodyErr };
  const linkErr = validateUpdateLink(params.link ?? '');
  if (linkErr) return { error: linkErr };

  const signed = await signForProjectWrite(
    params.signMessage,
    buildUpdateSignMessage(params.authorWallet, params.projectPda, Date.now())
  );
  if ('error' in signed) return { error: signed.error };

  const r = await callProjectWrite({
    action: 'update',
    projectPda: params.projectPda,
    message: signed.message,
    signature: signed.signature,
    body: params.body.trim(),
    link: params.link?.trim() || '',
  });

  if ('error' in r) {
    console.warn('[updates] refusé:', r.error);
    return { error: r.error };
  }
  return { ok: true };
}

/** Charge les mises à jour d'un projet, les plus récentes d'abord. */
export async function fetchProjectUpdates(projectPda: string, limit = 50): Promise<ProjectUpdate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('project_updates')
    .select('*')
    .eq('project_pda', projectPda)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[updates] fetch error:', error.message);
    return [];
  }
  return (data ?? []).map(fromRemote);
}
