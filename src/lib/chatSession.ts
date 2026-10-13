// src/lib/chatSession.ts
// ═══════════════════════════════════════════════════════════════════
// Jeton de session du chat — signé UNE fois, réutilisé pendant 24 h.
//
// Pourquoi : l'écriture du chat exige une preuve cryptographique (voir
// chat.ts), mais signer chaque message imposait un popup wallet par
// message — inutilisable pour une conversation. Le wallet signe donc un
// jeton de session, que le serveur revérifie à chaque envoi.
//
// ⚠️ Ce que ça change côté sécurité, à connaître avant de toucher ce
// fichier : le jeton est un BEARER TOKEN. Il vit en localStorage.
// Quiconque peut le lire (XSS, extension, poste partagé) peut publier
// sous ce wallet jusqu'à expiration. C'est le prix assumé du confort.
// Trois garde-fous limitent le dégât, à ne pas retirer :
//   • le jeton est scopé à UN projet (un vol ne pollue que ce chat) ;
//   • le serveur applique un rate limit par wallet ;
//   • le wallet peut révoquer côté serveur — voir revokeChatSessions()
//     dans chat.ts, qui pose un cutoff daté en base. C'est la seule
//     manière de tuer un jeton déjà sorti du navigateur ; les fonctions
//     `clear*` ci-dessous n'effacent QUE la copie locale.
//
// localStorage et pas sessionStorage : sessionStorage meurt à la
// fermeture de l'onglet, ce qui ramènerait un popup par session de
// navigation et viderait la durée de 24 h de son sens.
// ═══════════════════════════════════════════════════════════════════
import { translate, type Lang } from './i18n/translations';

/**
 * ⚠️ Doit rester synchronisé avec SESSION_TTL_HOURS dans
 * supabase/functions/chat-moderate/index.ts. La valeur est écrite en
 * toutes lettres dans le message signé : si les deux divergent, la regex
 * serveur ne matche plus et TOUS les envois échouent avec « Session
 * invalide », sans autre symptôme.
 */
export const CHAT_SESSION_TTL_HOURS = 24;
const TTL_MS = CHAT_SESSION_TTL_HOURS * 60 * 60 * 1000;

/**
 * On considère la session morte 5 min avant le serveur, et on refait
 * signer. Sans cette marge, un envoi parti juste avant l'échéance —
 * ou avec une horloge locale légèrement en avance — se ferait refuser
 * côté serveur alors que le client la croyait encore valide.
 */
const RENEW_MARGIN_MS = 5 * 60 * 1000;

const STORAGE_PREFIX = 'buildpact_chat_session';

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

export interface ChatSession {
  message: string;
  signature: number[];
  signedAt: number;
}

/**
 * Message canonique de session.
 * ⚠️ Le format est validé côté serveur par une regex ANCRÉE (^…$) :
 * toute modification ici — espace, accent, ordre des lignes — casse
 * l'authentification. La ligne « Validité » n'est pas décorative, elle
 * fait partie du contrat.
 */
export function buildChatSessionMessage(wallet: string, projectPda: string, timestamp: number): string {
  return `BuildPact — session chat\nWallet: ${wallet}\nProjet: ${projectPda}\nValidité: ${CHAT_SESSION_TTL_HOURS} h\nTimestamp: ${timestamp}`;
}

function storageKey(projectPda: string, wallet: string): string {
  return `${STORAGE_PREFIX}:${projectPda}:${wallet}`;
}

/** Session en cache encore valide (marge incluse), ou null. */
export function loadChatSession(projectPda: string, wallet: string): ChatSession | null {
  try {
    const raw = localStorage.getItem(storageKey(projectPda, wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatSession;
    if (
      typeof parsed?.message !== 'string' ||
      !Array.isArray(parsed?.signature) ||
      typeof parsed?.signedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.signedAt >= TTL_MS - RENEW_MARGIN_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Efface la copie LOCALE du jeton d'un projet.
 * ⚠️ Ce n'est pas une révocation : le jeton reste accepté par le serveur
 * jusqu'à son échéance. Pour l'invalider partout, passer par
 * `revokeChatSessions()` (chat.ts).
 */
export function clearChatSession(projectPda: string, wallet: string): void {
  try {
    localStorage.removeItem(storageKey(projectPda, wallet));
  } catch {
    /* non bloquant */
  }
}

/**
 * Efface TOUS les jetons de session d'un wallet, tous projets confondus.
 * Local uniquement, là encore — cf. `revokeChatSessions()` pour l'effet
 * côté serveur.
 *
 * Utilisé à la déconnexion (voir useChatSessionCleanup) : `clearChatSession`
 * est scopé à un projet, donc l'appeler depuis un ChatBox ne nettoierait que
 * le chat affiché à ce moment-là et laisserait dormir les jetons des autres
 * projets visités — exactement le scénario « poste partagé » qu'on veut
 * fermer.
 *
 * Retourne le nombre de jetons supprimés (utile en debug).
 */
export function clearChatSessionsForWallet(wallet: string): number {
  try {
    // On collecte AVANT de supprimer : `localStorage.key(i)` réindexe après
    // chaque removeItem, supprimer pendant l'itération sauterait des clés.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${STORAGE_PREFIX}:`) && k.endsWith(`:${wallet}`)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}

export interface ChatSessionEntry {
  projectPda: string;
  wallet: string;
  signedAt: number;
  expiresAt: number;
  /** true si le jeton est passé de la marge de renouvellement (bientôt inutilisable). */
  stale: boolean;
}

/**
 * Inventaire des jetons présents dans CE navigateur pour un wallet.
 *
 * ⚠️ Ce n'est pas « la liste de tes sessions actives » au sens d'un compte
 * classique : le serveur ne tient aucun registre des jetons émis (il se
 * contente de vérifier une signature). Une session ouverte sur un autre
 * appareil est donc INVISIBLE ici. Présenter cette liste comme exhaustive
 * serait le pire des mensonges d'interface — l'utilisateur croirait n'avoir
 * qu'une session alors qu'il en traîne trois ailleurs.
 *
 * D'où la conception du panneau profil : la liste est explicitement locale,
 * et le bouton de révocation, lui, est global côté serveur.
 *
 * Les entrées expirées sont incluses (`stale`) — les masquer laisserait
 * croire que le stockage est propre alors que des jetons y dorment encore.
 */
export function listChatSessions(wallet: string): ChatSessionEntry[] {
  const out: ChatSessionEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(`${STORAGE_PREFIX}:`) || !k.endsWith(`:${wallet}`)) continue;

      // Découpage par les DEUX bornes plutôt qu'un split(':') : rien ne
      // garantit qu'une base58 ne contienne jamais le séparateur, et un
      // split naïf produirait un PDA tronqué affiché tel quel.
      const projectPda = k.slice(STORAGE_PREFIX.length + 1, k.length - wallet.length - 1);

      let signedAt = 0;
      try {
        const parsed = JSON.parse(localStorage.getItem(k) ?? '{}') as ChatSession;
        if (typeof parsed?.signedAt === 'number') signedAt = parsed.signedAt;
      } catch {
        /* entrée corrompue : on l'affiche quand même, signedAt = 0 */
      }
      const expiresAt = signedAt + TTL_MS;
      out.push({
        projectPda,
        wallet,
        signedAt,
        expiresAt,
        stale: Date.now() >= expiresAt - RENEW_MARGIN_MS,
      });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.signedAt - a.signedAt);
}

/** Vrai si l'utilisateur peut écrire sans repasser par une signature. */
export function hasChatSession(projectPda: string, wallet: string): boolean {
  return loadChatSession(projectPda, wallet) !== null;
}

/** Échéance affichable de la session courante, ou null. */
export function chatSessionExpiresAt(projectPda: string, wallet: string): Date | null {
  const session = loadChatSession(projectPda, wallet);
  return session ? new Date(session.signedAt + TTL_MS) : null;
}

/**
 * Retourne la session en cache, ou en fait signer une nouvelle.
 * `force` sert au cas où le serveur a rejeté un jeton que le client
 * croyait bon (horloges désynchronisées, TTL modifié entre deux
 * déploiements).
 */
export async function getOrCreateChatSession(params: {
  projectPda: string;
  wallet: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  force?: boolean;
}): Promise<{ session: ChatSession } | { error: string }> {
  if (!params.force) {
    const cached = loadChatSession(params.projectPda, params.wallet);
    if (cached) return { session: cached };
  }

  const signedAt = Date.now();
  const message = buildChatSessionMessage(params.wallet, params.projectPda, signedAt);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await params.signMessage(new TextEncoder().encode(message));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.toLowerCase().includes('user rejected')) return { error: tr('errors.signatureRejected') };
    return { error: tr('errors.signMessageUnsupported') };
  }

  const session: ChatSession = { message, signature: Array.from(signatureBytes), signedAt };
  try {
    localStorage.setItem(storageKey(params.projectPda, params.wallet), JSON.stringify(session));
  } catch {
    // Quota plein ou stockage bloqué : on continue sans cache. L'envoi
    // fonctionne, l'utilisateur resignera au message suivant.
  }
  return { session };
}
