// src/lib/projectWrite.ts
// ═══════════════════════════════════════════════════════════════════
// Client de l'Edge Function `project-write`.
//
// Depuis la migration 20260828180000, quatre tables n'acceptent plus
// d'écriture directe depuis le navigateur : pact_events, project_updates,
// role_interests, project_media. Elles vivaient sous des policies
// `INSERT with check (true)`, ce qui permettait notamment de réécrire le
// logo et la présentation de n'importe quel projet sans authentification.
//
// Toute écriture passe désormais par ce module. Un appel direct à
// `supabase.from(...).insert(...)` sur ces tables échouera silencieusement
// (RLS) — si une écriture « disparaît » sans erreur visible, c'est la
// première piste à regarder.
// ═══════════════════════════════════════════════════════════════════
import { SUPABASE_PROJECT_URL, isRemoteEnabled } from './supabaseClient';

export type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

const PROJECT_WRITE_URL = SUPABASE_PROJECT_URL
  ? `${SUPABASE_PROJECT_URL}/functions/v1/project-write`
  : null;

export const projectWriteEnabled = isRemoteEnabled && !!PROJECT_WRITE_URL;

export interface ProjectWriteError {
  error: string;
  /** Code machine renvoyé par la fonction (ex. `tx_not_found`). */
  code?: string;
  status?: number;
}

/** POST brut vers la fonction. Ne lève jamais — renvoie toujours un objet. */
export async function callProjectWrite(
  body: Record<string, unknown>
): Promise<{ ok: true; data: Record<string, unknown> } | ProjectWriteError> {
  if (!PROJECT_WRITE_URL) return { error: 'Backend non configuré.' };

  let res: Response;
  try {
    res = await fetch(PROJECT_WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: 'Réseau indisponible — réessaie.' };
  }

  let json: Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    /* réponse vide ou non-JSON : on retombe sur le statut HTTP */
  }

  if (!res.ok) {
    return {
      error: (json.error as string) ?? `Erreur ${res.status}.`,
      code: json.code as string | undefined,
      status: res.status,
    };
  }
  return { ok: true, data: json };
}

// ── Messages signés ────────────────────────────────────────────────
// ⚠️ Ces trois chaînes sont validées côté serveur par des regex ANCRÉES.
// Toute modification (espace, accent, ordre des lignes) casse l'action
// correspondante — et le symptôme est un « Message de signature invalide »
// qui ne dit pas lequel des deux côtés a bougé. Les formats sont aussi
// volontairement distincts les uns des autres : sans ça, une signature
// obtenue pour une candidature pourrait être rejouée pour réécrire les
// médias d'un projet.

export function buildUpdateSignMessage(wallet: string, projectPda: string, ts: number): string {
  return `BuildPact — mise à jour de projet\nWallet: ${wallet}\nProjet: ${projectPda}\nTimestamp: ${ts}`;
}

export function buildApplySignMessage(wallet: string, projectPda: string, ts: number): string {
  return `BuildPact — candidature\nWallet: ${wallet}\nProjet: ${projectPda}\nTimestamp: ${ts}`;
}

export function buildMediaSignMessage(wallet: string, projectPda: string, ts: number): string {
  return `BuildPact — médias du projet\nWallet: ${wallet}\nProjet: ${projectPda}\nTimestamp: ${ts}`;
}

/**
 * Fait signer un message et renvoie le couple prêt à poster.
 *
 * Le refus utilisateur est distingué d'une incapacité technique : dans le
 * premier cas il a délibérément annulé et un message d'erreur alarmant
 * serait déplacé ; dans le second son wallet ne sait tout simplement pas
 * signer de message et aucune insistance n'y changera rien.
 */
export async function signForProjectWrite(
  signMessage: SignMessageFn,
  message: string
): Promise<{ message: string; signature: number[] } | { error: string }> {
  try {
    const sig = await signMessage(new TextEncoder().encode(message));
    return { message, signature: Array.from(sig) };
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message.toLowerCase() : '';
    if (raw.includes('user rejected') || raw.includes('rejected')) {
      return { error: 'Signature refusée.' };
    }
    return { error: "Ce wallet ne sait pas signer de message — action impossible." };
  }
}
