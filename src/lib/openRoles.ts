// src/lib/openRoles.ts
// ═══════════════════════════════════════════════════════════════════
// Rôles recherchés par un pact ("open roles") — ce que le founder cherche
// à recruter, affiché publiquement sur la Marketplace / fiche pact et
// proposé comme raccourci dans la modale Postuler.
//
// 100% off-chain (table Supabase `project_open_roles`) : le compte Project
// on-chain n'a pas de champ dédié et la description est plafonnée à 280
// octets. Modifier le programme changerait le layout → casserait les pacts
// existants. C'est de la métadonnée transitoire (un rôle pourvu disparaît),
// donc off-chain comme project_media.
//
// Lecture : publique (RLS select true).
// Écriture : JAMAIS directe — toujours via l'Edge Function `open-roles`
// (signMessage + vérif on-chain que le signataire est project.creator),
// même pattern que profileRemote.ts / vault.ts.
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled, SUPABASE_PROJECT_URL } from './supabaseClient';
import { translate, type Lang } from './i18n/translations';

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

const OPEN_ROLES_URL = SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/functions/v1/open-roles` : '';

export const MAX_OPEN_ROLES = 8;

export { isRemoteEnabled as openRolesEnabled };

/**
 * Charge TOUS les rôles recherchés en UN SEUL appel — utilisé par les listes
 * (Marketplace) pour éviter un fetch par carte. Volontairement séparé de
 * useProjects() : donnée annexe off-chain, même pattern que fetchAllProjectMedia.
 */
export async function fetchAllOpenRoles(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!supabase) return map;

  const { data, error } = await supabase
    .from('project_open_roles')
    .select('project_pda, role_label, position')
    .order('position', { ascending: true });

  if (error) {
    console.warn('[openRoles] fetchAll error:', error.message);
    return map;
  }
  for (const row of data ?? []) {
    const pda = row.project_pda as string;
    const list = map.get(pda) ?? [];
    list.push(row.role_label as string);
    map.set(pda, list);
  }
  return map;
}

/**
 * Charge les rôles recherchés pour UNE LISTE de pacts (une seule requête)
 * — utilisé par la Marketplace. Retourne une Map projectPda → labels ordonnés.
 */
export async function fetchOpenRolesForProjects(projectPdas: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!supabase || projectPdas.length === 0) return map;

  const { data, error } = await supabase
    .from('project_open_roles')
    .select('project_pda, role_label, position')
    .in('project_pda', projectPdas)
    .order('position', { ascending: true });

  if (error) {
    console.warn('[openRoles] fetch error:', error.message);
    return map;
  }
  for (const row of data ?? []) {
    const pda = row.project_pda as string;
    const list = map.get(pda) ?? [];
    list.push(row.role_label as string);
    map.set(pda, list);
  }
  return map;
}

/** Charge les rôles recherchés d'UN pact — fiche publique / modale Postuler. */
export async function fetchOpenRoles(projectPda: string): Promise<string[]> {
  const map = await fetchOpenRolesForProjects([projectPda]);
  return map.get(projectPda) ?? [];
}

/**
 * Message canonique signé par le wallet — DOIT rester synchronisé avec le
 * regex de l'Edge Function (`Timestamp:\s*(\d+)` + `message.includes(wallet)`).
 */
function buildOpenRolesSignMessage(wallet: string, projectPda: string, timestamp: number): string {
  return `BuildPact — rôles recherchés\nWallet: ${wallet}\nProjet: ${projectPda}\nTimestamp: ${timestamp}`;
}

/**
 * Remplace la liste des rôles recherchés d'un pact — founder uniquement.
 * Fait signer un message au wallet puis délègue l'écriture à l'Edge Function.
 * `roles` vide = effacement complet (édition valide).
 */
export async function saveOpenRoles(
  wallet: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  projectPda: string,
  roles: string[]
): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !OPEN_ROLES_URL) {
    return { error: tr('errors.notConfigured') };
  }

  const timestamp = Date.now();
  const message = buildOpenRolesSignMessage(wallet, projectPda, timestamp);
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
    const res = await fetch(OPEN_ROLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set',
        wallet,
        projectPda,
        message,
        signature: Array.from(signatureBytes),
        roles: roles.slice(0, MAX_OPEN_ROLES),
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
