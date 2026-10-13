// src/lib/notificationPrefs.ts
// ═══════════════════════════════════════════════════════════════════
// Préférences de notifications — v1 HONNÊTE : aucune notification
// push/email n'est envoyée. Ce sont des préférences LOCALES qui
// préparent le terrain (le jour où une vraie livraison existe, ce
// fichier définit déjà quels événements l'utilisateur veut suivre :
// approbation de membre, financement reçu, quête réclamable).
// Ne pas laisser croire à une notification réellement envoyée —
// voir settings.notificationsHint côté UI.
//
// ⚠️ Mise à jour (29/08, nuit) : la livraison réelle EXISTE désormais,
// voir pushNotifications.ts. Ce module reste la source de vérité LOCALE
// des 3 cases à cocher (il survit à l'absence d'abonnement push, et
// pilote l'affichage même hors ligne) ; pushNotifications.ts se charge
// de répliquer ces préférences côté serveur quand un abonnement est
// actif. Les deux ne se remplacent pas : celui-ci ne sait rien du
// réseau, l'autre ne persiste rien localement.
// ═══════════════════════════════════════════════════════════════════
export interface NotificationPrefs {
  approvals: boolean;
  funding: boolean;
  quests: boolean;
}

const KEY = 'buildpact_notif_prefs';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  approvals: true,
  funding: true,
  quests: true,
};

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    // Fusion avec les défauts plutôt que retour direct du parse : une
    // version future qui ajoute une 4e préférence lirait sinon `undefined`
    // sur les profils déjà enregistrés, et la case s'afficherait décochée
    // sans que l'utilisateur ne l'ait jamais touchée.
    return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* non bloquant */
  }
}
