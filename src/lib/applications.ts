// src/lib/applications.ts
// ═══════════════════════════════════════════════════════════════════
// Candidatures sur les rôles ouverts d'un pact (bouton "Postuler" de la
// Marketplace). Volontairement 100% off-chain : le programme Anchor n'a
// pas d'instruction de candidature (add_member est founder-only), et en
// ajouter une demanderait de redéployer le programme à 4 jours de la
// deadline. Voir supabase/role_interests.sql pour le schéma.
// ═══════════════════════════════════════════════════════════════════
//
// ⚠️ Depuis la migration 20260828180000, l'écriture passe par l'Edge
// Function `project-write` : la policy INSERT publique permettait de
// déposer des candidatures au nom d'un autre wallet, ce qui pollue la
// boîte du founder et discrédite un builder à son insu.
// `applicant_wallet` vient désormais de la signature vérifiée.
import { supabase, isRemoteEnabled } from './supabaseClient';
import {
  buildApplySignMessage,
  callProjectWrite,
  signForProjectWrite,
  type SignMessageFn,
} from './projectWrite';

export interface RoleInterest {
  id: number;
  projectPda: string;
  roleWanted: string;
  applicantWallet: string;
  message: string;
  createdAt: string;
}

function fromRemote(row: Record<string, unknown>): RoleInterest {
  return {
    id: row.id as number,
    projectPda: row.project_pda as string,
    roleWanted: row.role_wanted as string,
    applicantWallet: row.applicant_wallet as string,
    message: (row.message as string) ?? '',
    createdAt: row.created_at as string,
  };
}

export { isRemoteEnabled as applicationsEnabled };

/**
 * Enregistre une candidature. Exige une signature du wallet candidat.
 *
 * Renvoie un objet plutôt qu'un booléen : avec une signature dans la
 * boucle, l'échec le plus fréquent devient « l'utilisateur a refusé le
 * popup », et afficher « échec de l'envoi » dans ce cas serait trompeur.
 */
export async function submitApplication(input: {
  projectPda: string;
  roleWanted: string;
  applicantWallet: string;
  message: string;
  signMessage: SignMessageFn;
}): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled) return { error: 'Backend non configuré.' };

  const signed = await signForProjectWrite(
    input.signMessage,
    buildApplySignMessage(input.applicantWallet, input.projectPda, Date.now())
  );
  if ('error' in signed) return { error: signed.error };

  const r = await callProjectWrite({
    action: 'apply',
    projectPda: input.projectPda,
    message: signed.message,
    signature: signed.signature,
    roleWanted: input.roleWanted,
    applyMessage: input.message.slice(0, 400),
  });

  if ('error' in r) {
    console.warn('[applications] refusé:', r.error);
    return { error: r.error };
  }
  return { ok: true };
}

/** Liste les candidatures reçues pour un projet (visible publiquement, comme le fil d'activité). */
export async function fetchApplications(projectPda: string): Promise<RoleInterest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('role_interests')
    .select('*')
    .eq('project_pda', projectPda)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[applications] fetch error:', error.message);
    return [];
  }
  return (data ?? []).map(fromRemote);
}
