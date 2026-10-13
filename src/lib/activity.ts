// src/lib/activity.ts
// ═══════════════════════════════════════════════════════════════════
// BuildPact — Fil d'activité par projet (table pact_events, Supabase)
// Chaque ligne écrite ici référence une tx déjà CONFIRMÉE on-chain
// (tx_sig) — cette table n'est qu'un journal d'affichage temps réel,
// jamais la source de vérité.
//
// ⚠️ L'écriture ne passe PLUS par le client Supabase : la policy INSERT
// publique a été supprimée (migration 20260828180000). Elle permettait
// d'inscrire un faux « X a financé 40 SOL » dans le fil de n'importe quel
// projet, sans qu'aucune transaction n'ait eu lieu — et le fil d'activité
// est précisément ce qu'un visiteur regarde pour jauger la crédibilité
// d'un pact.
//
// L'Edge Function `project-write` vérifie désormais la transaction
// elle-même (existe, a réussi, invoque le programme, `actor` signataire).
// Aucune signature wallet n'est demandée : ce journal s'écrit juste après
// une tx confirmée, un second popup y serait intenable. Prouver l'ACTE est
// de toute façon plus fort que prouver l'identité.
// ═══════════════════════════════════════════════════════════════════
import { supabase } from './supabaseClient';
import { callProjectWrite } from './projectWrite';

export type PactEventKind = 'approve' | 'fund' | 'finalize' | 'distribute' | 'add_member';

export interface PactEvent {
  id: number;
  projectPda: string;
  kind: PactEventKind;
  actor: string;
  amountSol: number | null;
  txSig: string;
  createdAt: string; // ISO
}

function fromRemote(row: Record<string, unknown>): PactEvent {
  return {
    id: row.id as number,
    projectPda: row.project_pda as string,
    kind: row.kind as PactEventKind,
    actor: row.actor as string,
    amountSol: (row.amount_sol as number | null) ?? null,
    txSig: row.tx_sig as string,
    createdAt: row.created_at as string,
  };
}

/**
 * Délai avant la seconde tentative quand le RPC n'a pas encore indexé la tx.
 * `logPactEvent` est appelé immédiatement après confirmation ; le serveur
 * peut interroger un nœud qui a une seconde de retard. Sans ce réessai, des
 * événements parfaitement réels disparaîtraient du fil pour une simple
 * course entre deux nœuds.
 */
const TX_INDEX_RETRY_MS = 2500;

/**
 * Enregistre un événement APRÈS confirmation on-chain d'une transaction.
 *
 * Fire-and-forget : n'échoue jamais bruyamment. Si le backend est absent ou
 * refuse, le fil d'activité est simplement incomplet — la transaction, elle,
 * n'a jamais dépendu de cet appel et reste la source de vérité.
 *
 * Un rejet du serveur (403) est journalisé en warning et NON réessayé : il
 * signifie que la tx ne prouve pas l'événement déclaré, ce qu'un réessai ne
 * changera pas.
 */
export function logPactEvent(event: {
  projectPda: string;
  kind: PactEventKind;
  actor: string;
  amountSol?: number | null;
  txSig: string;
}): void {
  const body = {
    action: 'event',
    projectPda: event.projectPda,
    kind: event.kind,
    actor: event.actor,
    amountSol: event.amountSol ?? null,
    txSig: event.txSig,
  };

  void (async () => {
    let r = await callProjectWrite(body);
    if ('error' in r && r.code === 'tx_not_found') {
      await new Promise((resolve) => setTimeout(resolve, TX_INDEX_RETRY_MS));
      r = await callProjectWrite(body);
    }
    if ('error' in r) {
      console.warn('[activity] log refusé (non bloquant):', r.error);
    }
  })();
}

/** Charge les derniers événements d'un projet (fetch initial, avant le flux Realtime). */
export async function fetchRecentEvents(projectPda: string, limit = 20): Promise<PactEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pact_events')
    .select('*')
    .eq('project_pda', projectPda)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[activity] fetch error:', error.message);
    return [];
  }
  return (data ?? []).map(fromRemote);
}

/**
 * Tous les mouvements d'argent récents, tous projets confondus.
 *
 * ⚠️ C'est le remplacement du scan on-chain du Treasury. L'ancienne version
 * reconstruisait cet historique depuis la chaîne : pour chaque vault, un
 * `getSignaturesForAddress` puis un `getParsedTransaction` par signature —
 * soit ~90 appels RPC pour 6 pacts, à chaque ouverture de page. Le devnet
 * public throttlait (429) bien avant la fin, et aucun retry ne pouvait
 * inventer de la capacité qui n'existe pas.
 *
 * Or `pact_events` contient déjà exactement cette information : chaque fund
 * et chaque distribute y est écrit au moment même de la transaction, avec le
 * montant et la signature, par l'Edge Function qui a vérifié la tx on-chain.
 * C'est la table qui alimente déjà l'XP et le fil d'activité. Le Treasury
 * refabriquait donc à grands frais une donnée déjà stockée.
 *
 * La chaîne reste la source de vérité — chaque ligne porte son `tx_sig`,
 * vérifiable en un clic sur l'explorer. On ne fait pas confiance à cette
 * table pour prouver quoi que ce soit : on l'utilise comme index.
 */
export async function fetchMoneyEvents(limit = 60): Promise<PactEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pact_events')
    .select('*')
    .in('kind', ['fund', 'distribute'])
    .not('amount_sol', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[activity] fetch money events error:', error.message);
    return [];
  }
  return (data ?? []).map(fromRemote);
}

/**
 * Souscrit aux nouveaux événements Realtime pour un projet donné.
 * Retourne une fonction de désabonnement (à appeler dans le cleanup du useEffect).
 */
export function subscribeToPactEvents(
  projectPda: string,
  onEvent: (event: PactEvent) => void
): () => void {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`pact_events:${projectPda}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pact_events', filter: `project_pda=eq.${projectPda}` },
      (payload) => onEvent(fromRemote(payload.new as Record<string, unknown>))
    )
    .subscribe();

  return () => {
    supabase!.removeChannel(channel);
  };
}
