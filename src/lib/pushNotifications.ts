// src/lib/pushNotifications.ts
// ═══════════════════════════════════════════════════════════════════
// Notifications push réelles (Web Push / VAPID), 29/08 nuit — remplace le
// v1 purement local (notificationPrefs.ts, jamais d'envoi réel, voir
// buildpact_settings_batch_290826_soir.md). Ce fichier gère la partie
// navigateur (permission, abonnement Push API, service worker) ; l'envoi
// et le stockage passent par l'Edge Function `push` (voir
// supabase/functions/push/index.ts).
//
// Signature wallet requise pour subscribe/unsubscribe/update_prefs/send —
// même schéma que claimQuestReward (gamification.ts) : le clic + popup
// wallet est le geste de preuve, le serveur revérifie tout.
//
// ⚠️ Trois pièces d'infrastructure sont nécessaires pour que le toggle
// fonctionne VRAIMENT : VITE_VAPID_PUBLIC_KEY (.env.local),
// supabase/functions/push/index.ts, et public/push-sw.js. Sans elles,
// isPushSupported() renvoie false et l'UI affiche « non supporté » — pas
// d'erreur, la fonctionnalité est simplement invisible. C'est voulu :
// une dégradation silencieuse vaut mieux qu'un toggle qui promet une
// alerte que personne n'enverra.
// ═══════════════════════════════════════════════════════════════════
import { SUPABASE_PROJECT_URL, isRemoteEnabled } from './supabaseClient';

const PUSH_URL = SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/functions/v1/push` : '';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type NotifType = 'approvals' | 'funding' | 'quests';

export interface PushPrefs {
  approvals: boolean;
  funding: boolean;
  quests: boolean;
}

type SignFn = (message: Uint8Array) => Promise<Uint8Array>;

/** Lit `name`/`message` d'une erreur inconnue sans passer par `any`.
 *  (`catch (e: any)` déclenche @typescript-eslint/no-explicit-any en erreur
 *  sur la config de ce projet — seul écart avec la source by7b, le
 *  comportement est identique.) */
function errInfo(e: unknown): { name: string; message: string } {
  if (e && typeof e === 'object') {
    const o = e as { name?: unknown; message?: unknown };
    return {
      name: typeof o.name === 'string' ? o.name : '',
      message: typeof o.message === 'string' ? o.message : '',
    };
  }
  return { name: '', message: '' };
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY) &&
    isRemoteEnabled
  );
}

// applicationServerKey attend un Uint8Array décodé depuis la clé publique
// VAPID base64url — conversion standard, aucune lib requise côté client.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/push-sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/push-sw.js');
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function subKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const json = sub.toJSON();
  return { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' };
}

async function postPush(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (json as { error?: unknown })?.error;
      return { ok: false, error: typeof msg === 'string' ? msg : 'Échec de la requête.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Réseau injoignable — réessaie.' };
  }
}

/** Demande la permission navigateur, crée l'abonnement Push API, et
 *  l'enregistre côté serveur (signature wallet requise). */
export async function subscribeToPush(
  wallet: string,
  prefs: PushPrefs,
  signMessage: SignFn
): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { ok: false, error: 'Notifications push non supportées sur cet appareil.' };
  }

  if (Notification.permission === 'denied') {
    return { ok: false, error: 'Notifications bloquées dans les réglages du navigateur.' };
  }
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'Permission refusée.' };
  }

  // ⚠️ Bug trouvé en test manuel (29/08) : reg.pushManager.subscribe() peut
  // rejeter avec un AbortError ("Registration failed - push service error")
  // — connexion au service push du navigateur indisponible (réseau, proxy,
  // Chrome qui n'arrive pas à joindre FCM). Sans ce try/catch, l'exception
  // remontait non attrapée jusqu'à togglePush() dans NotificationSettings,
  // qui restait bloqué en état "busy" indéfiniment (le toggle ne revenait
  // jamais à off, aucun message d'erreur affiché).
  let reg: ServiceWorkerRegistration;
  let sub: PushSubscription;
  try {
    reg = await ensureServiceWorker();
    const existing = await reg.pushManager.getSubscription();
    sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      }));
  } catch (e: unknown) {
    const { name } = errInfo(e);
    if (name === 'AbortError') {
      return {
        ok: false,
        error:
          "Le service de notifications du navigateur n'est pas joignable (réseau/proxy). Réessaie plus tard ou change de réseau.",
      };
    }
    if (name === 'NotAllowedError') {
      return { ok: false, error: 'Permission refusée par le navigateur.' };
    }
    return { ok: false, error: "Échec de l'abonnement push — réessaie." };
  }

  const endpoint = sub.endpoint;
  const timestamp = Date.now();
  const message = `BuildPact — abonnement notifications\nWallet: ${wallet}\nEndpoint: ${endpoint}\nTimestamp: ${timestamp}`;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signMessage(new TextEncoder().encode(message));
  } catch (e: unknown) {
    const { message: msg } = errInfo(e);
    if (msg.toLowerCase().includes('user rejected')) return { ok: false, error: 'Signature refusée.' };
    return { ok: false, error: 'Ce wallet ne supporte pas la signature de message.' };
  }

  return postPush({
    action: 'subscribe',
    wallet,
    endpoint,
    keys: subKeys(sub),
    prefs,
    message,
    signature: Array.from(signatureBytes),
  });
}

export async function unsubscribeFromPush(
  wallet: string,
  signMessage: SignFn
): Promise<{ ok: boolean; error?: string }> {
  const sub = await getExistingSubscription();
  if (!sub) return { ok: true }; // rien à défaire

  const endpoint = sub.endpoint;
  const timestamp = Date.now();
  const message = `BuildPact — désabonnement notifications\nWallet: ${wallet}\nEndpoint: ${endpoint}\nTimestamp: ${timestamp}`;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signMessage(new TextEncoder().encode(message));
  } catch {
    return { ok: false, error: 'Signature refusée.' };
  }

  const result = await postPush({
    action: 'unsubscribe',
    wallet,
    endpoint,
    message,
    signature: Array.from(signatureBytes),
  });
  if (result.ok) {
    try {
      await sub.unsubscribe();
    } catch {
      /* non bloquant — la ligne serveur est déjà supprimée */
    }
  }
  return result;
}

export async function updatePushPrefs(
  wallet: string,
  prefs: PushPrefs,
  signMessage: SignFn
): Promise<{ ok: boolean; error?: string }> {
  const sub = await getExistingSubscription();
  if (!sub) return { ok: false, error: 'Aucun abonnement actif sur cet appareil.' };

  const endpoint = sub.endpoint;
  const timestamp = Date.now();
  const message = `BuildPact — préférences notifications\nWallet: ${wallet}\nEndpoint: ${endpoint}\nTimestamp: ${timestamp}`;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signMessage(new TextEncoder().encode(message));
  } catch {
    return { ok: false, error: 'Signature refusée.' };
  }

  return postPush({
    action: 'update_prefs',
    wallet,
    endpoint,
    prefs,
    message,
    signature: Array.from(signatureBytes),
  });
}

/** Déclenche l'envoi réel — appelé juste après une action on-chain réussie
 *  (approve/fund/finalize) par le wallet qui vient de l'effectuer, ciblant
 *  les AUTRES membres du pact. Échoue silencieusement côté UX (best-effort,
 *  ne doit jamais bloquer le flux principal de la transaction) — l'appelant
 *  ignore le résultat sauf en dev. */
export async function triggerPushNotification(params: {
  actorWallet: string;
  projectPda: string;
  type: NotifType;
  wallets: string[];
  title: string;
  body: string;
  url?: string;
  signMessage: SignFn;
}): Promise<{ ok: boolean; error?: string }> {
  const { actorWallet, projectPda, type, wallets, title, body, url, signMessage } = params;
  const timestamp = Date.now();
  const message = `BuildPact — notification push\nWallet: ${actorWallet}\nPact: ${projectPda}\nType: ${type}\nTimestamp: ${timestamp}`;

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signMessage(new TextEncoder().encode(message));
  } catch {
    return { ok: false, error: 'Signature refusée.' };
  }

  return postPush({
    action: 'send',
    actorWallet,
    projectPda,
    type,
    wallets,
    title,
    body,
    url,
    message,
    signature: Array.from(signatureBytes),
  });
}
