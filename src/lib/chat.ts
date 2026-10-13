// src/lib/chat.ts
// ═══════════════════════════════════════════════════════════════════
// Chat simple par projet (table project_chat_messages, Supabase Realtime).
//
// LECTURE : publique et directe (policy SELECT ouverte). C'est aussi ce qui
// fait fonctionner le Realtime — un abonnement postgres_changes est évalué
// avec les droits SELECT du client abonné, pas de ceux de l'écrivain.
//
// ÉCRITURE (envoi ET suppression) : passe obligatoirement par l'Edge
// Function `chat-moderate`, qui vérifie une signature ed25519 avant
// d'écrire en service_role. La table n'a plus AUCUNE policy INSERT ni
// DELETE.
//
// Pourquoi l'envoi aussi : `author_wallet` était un champ texte rempli par
// le client sous une policy `INSERT with check (true)`. N'importe qui
// pouvait donc poster sous le wallet d'un autre — y compris celui du
// founder. Postgres ne peut pas trancher ça : il n'a aucun moyen de savoir
// qui contrôle une clé Solana. Seule une signature le prouve.
//
// ENVOI : autorisé par un jeton de SESSION signé une fois pour 24 h
// (voir chatSession.ts). Signer chaque message était plus strict mais
// imposait un popup wallet par message.
// SUPPRESSION : garde une signature unitaire et fraîche — l'acte est rare
// et destructif, la friction y est justifiée.
// ═══════════════════════════════════════════════════════════════════
import { supabase, isRemoteEnabled, SUPABASE_PROJECT_URL } from './supabaseClient';
import { translate, type Lang } from './i18n/translations';
import {
  clearChatSession,
  clearChatSessionsForWallet,
  getOrCreateChatSession,
} from './chatSession';

export { isRemoteEnabled as chatEnabled };

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

const CHAT_MODERATE_URL = SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/functions/v1/chat-moderate` : '';

export interface ChatMessage {
  id: number;
  projectPda: string;
  authorWallet: string;
  body: string;
  createdAt: string; // ISO
  /** Langue d'écriture, renseignée à l'envoi. `null` sur les messages
   *  antérieurs à la colonne `lang` — voir TranslatedMessage. */
  lang: string | null;
}

function fromRemote(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as number,
    projectPda: row.project_pda as string,
    authorWallet: row.author_wallet as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    lang: (row.lang as string | null) ?? null,
  };
}

export function validateChatBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null; // vide = pas d'envoi, pas une erreur affichable
  if (trimmed.length > MAX_BODY_LEN) return tr('errors.messageTooLong', { max: MAX_BODY_LEN });
  return null;
}

/** Appel brut de l'Edge Function. `code` sert au rattrapage de session. */
async function callChatModerate(
  payload: Record<string, unknown>
): Promise<{ ok: true; data: Record<string, unknown> } | { error: string; code?: string }> {
  try {
    const res = await fetch(CHAT_MODERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data?.error ?? tr('errors.serverError', { status: res.status }), code: data?.code };
    }
    return { ok: true, data };
  } catch {
    return { error: tr('errors.serverUnreachable') };
  }
}

/**
 * Publie un message. L'auteur n'est PAS pris dans les paramètres côté
 * serveur : il est déduit du jeton de session dont la signature vient
 * d'être validée. `authorWallet` ne sert ici qu'à retrouver la bonne
 * session en cache.
 *
 * Retourne le message créé pour un affichage immédiat (le Realtime le
 * renverra aussi ; ChatBox déduplique par id).
 */
export async function postChatMessage(params: {
  projectPda: string;
  authorWallet: string;
  body: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<{ ok: true; message: ChatMessage | null } | { error: string }> {
  if (!isRemoteEnabled || !CHAT_MODERATE_URL) return { error: tr('errors.notConfigured') };
  const trimmed = params.body.trim();
  if (!trimmed) return { error: tr('errors.chatEmptyBody') };
  if (trimmed.length > MAX_BODY_LEN) return { error: tr('errors.messageTooLong', { max: MAX_BODY_LEN }) };

  const send = async (force: boolean) => {
    const s = await getOrCreateChatSession({
      projectPda: params.projectPda,
      wallet: params.authorWallet,
      signMessage: params.signMessage,
      force,
    });
    if ('error' in s) return { error: s.error };
    return callChatModerate({
      action: 'post',
      projectPda: params.projectPda,
      body: trimmed,
      // Langue de l'interface au moment de l'écriture — sert uniquement à
      // éviter de traduire un message vers la langue dans laquelle il est
      // déjà rédigé.
      lang: currentLang(),
      sessionMessage: s.session.message,
      sessionSignature: s.session.signature,
    });
  };

  let r = await send(false);

  // Le serveur reste l'autorité sur la validité d'une session : si le
  // cache local est en retard (horloge décalée, TTL changé entre deux
  // déploiements, session révoquée), on refait signer une fois plutôt que
  // de renvoyer une erreur que l'utilisateur ne peut pas résoudre lui-même.
  //
  // `session_revoked` est inclus volontairement : re-signer n'annule pas la
  // révocation, ça crée un jeton postérieur au cutoff. Ce n'est pas un
  // contournement — la nouvelle signature exige une approbation explicite
  // dans le wallet, hors de portée de qui aurait volé l'ancien jeton.
  if (
    'error' in r &&
    (r.code === 'session_expired' || r.code === 'session_invalid' || r.code === 'session_revoked')
  ) {
    clearChatSession(params.projectPda, params.authorWallet);
    r = await send(true);
  }

  if ('error' in r) return { error: r.error };

  const row = r.data?.message as Record<string, unknown> | undefined;
  return { ok: true, message: row ? fromRemote(row) : null };
}

/** Charge les messages existants d'un projet, du plus ancien au plus récent. */
export async function fetchChatMessages(projectPda: string, limit = 100): Promise<ChatMessage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('project_chat_messages')
    .select('*')
    .eq('project_pda', projectPda)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.warn('[chat] fetch error:', error.message);
    return [];
  }
  return (data ?? []).map(fromRemote);
}

/** Timestamp (ISO) du dernier message d'un projet, ou null — pour un badge "nouveau message"
 *  sans charger tout l'historique. Lecture publique, comme fetchChatMessages(). */
export async function fetchLatestChatTimestamp(projectPda: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('project_chat_messages')
    .select('created_at')
    .eq('project_pda', projectPda)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.created_at as string;
}

/**
 * Message canonique signé par le wallet — DOIT rester synchronisé avec les
 * vérifications de l'Edge Function : présence du wallet, du projectPda,
 * de `Message: <id>` et d'un `Timestamp: <ms>`.
 */
function buildChatDeleteSignMessage(
  wallet: string,
  projectPda: string,
  messageId: number,
  timestamp: number
): string {
  return `BuildPact — suppression d'un message\nWallet: ${wallet}\nProjet: ${projectPda}\nMessage: ${messageId}\nTimestamp: ${timestamp}`;
}

/**
 * Supprime un message — founder uniquement, vérifié CÔTÉ SERVEUR.
 * Fait signer un message au wallet puis délègue à l'Edge Function
 * `chat-moderate`, qui relit project.creator on-chain avant d'écrire.
 */
export async function deleteChatMessage(params: {
  id: number;
  projectPda: string;
  wallet: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !CHAT_MODERATE_URL) return { error: tr('errors.notConfigured') };

  const timestamp = Date.now();
  const message = buildChatDeleteSignMessage(params.wallet, params.projectPda, params.id, timestamp);

  // Volontairement PAS de session ici : la suppression exige une
  // signature fraîche et liée à l'id visé.
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await params.signMessage(new TextEncoder().encode(message));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.toLowerCase().includes('user rejected')) return { error: tr('errors.signatureRejected') };
    return { error: tr('errors.signMessageUnsupported') };
  }

  const r = await callChatModerate({
    action: 'delete',
    projectPda: params.projectPda,
    messageId: params.id,
    message,
    signature: Array.from(signatureBytes),
  });
  if ('error' in r) return { error: r.error };
  return { ok: true };
}

/**
 * Message canonique de révocation.
 * ⚠️ Validé côté serveur par une regex ANCRÉE — toute modification (espace,
 * accent, ordre des lignes) casse la révocation. Volontairement SANS ligne
 * `Projet:` : la révocation porte sur le wallet entier.
 */
function buildChatRevokeSignMessage(wallet: string, timestamp: number): string {
  return `BuildPact — révocation des sessions chat\nWallet: ${wallet}\nTimestamp: ${timestamp}`;
}

/**
 * Révoque RÉELLEMENT les sessions de chat du wallet, tous projets confondus.
 *
 * Différence avec `clearChatSessionsForWallet` seul : le serveur enregistre
 * un cutoff daté, et refuse ensuite tout jeton signé avant. Un jeton déjà
 * exfiltré (XSS, extension, poste partagé) cesse donc de fonctionner —
 * l'effacement local, lui, ne faisait que retirer la copie de CE navigateur
 * et laissait les autres actives jusqu'à leur échéance.
 *
 * Une signature fraîche est exigée : sans elle, n'importe qui pourrait
 * révoquer les sessions d'autrui, ce qui serait un déni de service trivial.
 */
export async function revokeChatSessions(params: {
  wallet: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<{ ok: true } | { error: string }> {
  if (!isRemoteEnabled || !CHAT_MODERATE_URL) return { error: tr('errors.notConfigured') };

  const timestamp = Date.now();
  const message = buildChatRevokeSignMessage(params.wallet, timestamp);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await params.signMessage(new TextEncoder().encode(message));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.toLowerCase().includes('user rejected')) return { error: tr('errors.signatureRejected') };
    return { error: tr('errors.signMessageUnsupported') };
  }

  const r = await callChatModerate({
    action: 'revoke',
    wallet: params.wallet,
    message,
    signature: Array.from(signatureBytes),
  });

  // Le cache local est vidé dans TOUS les cas, succès ou non : retirer les
  // jetons de ce navigateur est bénéfique même si le serveur n'a pas pris
  // la demande. L'erreur reste remontée telle quelle — l'utilisateur doit
  // savoir que la révocation serveur, elle, n'a pas abouti, sans quoi il
  // croirait protégés des jetons qui restent valides ailleurs.
  clearChatSessionsForWallet(params.wallet);

  if ('error' in r) return { error: r.error };
  return { ok: true };
}

/** Souscrit aux nouveaux messages Realtime d'un projet. Retourne une fonction de désabonnement. */
export function subscribeToChatMessages(
  projectPda: string,
  onMessage: (m: ChatMessage) => void
): () => void {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`project_chat:${projectPda}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'project_chat_messages', filter: `project_pda=eq.${projectPda}` },
      (payload) => onMessage(fromRemote(payload.new as Record<string, unknown>))
    )
    .subscribe();

  return () => {
    supabase!.removeChannel(channel);
  };
}
