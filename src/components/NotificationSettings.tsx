// src/components/NotificationSettings.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 (29/08, nuit) — les 3 préférences existent depuis le v1 (local
// seulement, voir buildpact_settings_batch_290826_soir.md) ; ce qui
// change ici, c'est le toggle "Activer sur cet appareil" qui déclenche
// un VRAI abonnement Push API (permission navigateur + service worker +
// enregistrement signé côté serveur, voir lib/pushNotifications.ts). Les
// 3 cases restent utilisables même sans abonnement actif (elles pilotent
// aussi, en local, ce qui pourrait s'afficher ailleurs dans l'app plus
// tard) — mais elles ne contrôlent l'envoi RÉEL que si l'appareil est
// abonné, d'où le bandeau d'état explicite.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '../lib/notificationPrefs';
import {
  isPushSupported,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPrefs,
} from '../lib/pushNotifications';
import { useLanguage } from '../lib/i18n/LanguageContext';
import InfoTooltip from './InfoTooltip';
import ToggleSwitch from './ToggleSwitch';

type PushState = 'checking' | 'unsupported' | 'off' | 'on' | 'busy';

export function NotificationSettings() {
  const { t } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [pushState, setPushState] = useState<PushState>('checking');
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isPushSupported()) {
      setPushState('unsupported');
      return;
    }
    getExistingSubscription().then((sub) => {
      if (!cancelled) setPushState(sub ? 'on' : 'off');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key: keyof NotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveNotificationPrefs(next);
    if (pushState === 'on' && publicKey && signMessage) {
      updatePushPrefs(publicKey.toBase58(), next, (msg) => signMessage(msg)).catch(() => {
        /* non bloquant — la préférence locale reste appliquée */
      });
    }
  };

  const rows: Array<{ key: keyof NotificationPrefs; label: string }> = [
    { key: 'approvals', label: t('settings.notifApprovals') },
    { key: 'funding', label: t('settings.notifFunding') },
    { key: 'quests', label: t('settings.notifQuests') },
  ];

  const togglePush = async () => {
    if (!publicKey || !signMessage) {
      setPushError(t('settings.notifPushNeedsWallet'));
      return;
    }
    setPushError(null);
    setPushState('busy');
    const wallet = publicKey.toBase58();
    const sign = (msg: Uint8Array) => signMessage(msg);

    // Filet de sécurité (29/08, bug trouvé en test manuel) : même si
    // subscribeToPush/unsubscribeFromPush ont leur propre try/catch, ce
    // try/catch ici garantit que le toggle ne reste JAMAIS bloqué en
    // "busy" — quoi qu'il arrive, on retombe sur un état stable.
    try {
      if (pushState === 'on') {
        const res = await unsubscribeFromPush(wallet, sign);
        setPushState(res.ok ? 'off' : 'on');
        if (!res.ok) setPushError(res.error ?? null);
        return;
      }

      const res = await subscribeToPush(wallet, prefs, sign);
      setPushState(res.ok ? 'on' : 'off');
      if (!res.ok) setPushError(res.error ?? null);
    } catch {
      setPushState('off');
      setPushError(t('settings.notifPushUnexpected'));
    }
  };

  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white">
        {t('settings.notificationsHeading')}
        <InfoTooltip text={t('settings.notificationsHint')} />
      </h4>

      {pushState !== 'unsupported' && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          {/* min-w-0 : sans lui, un bloc de texte flex refuse de passer
              sous sa largeur de contenu et pousse le rail hors de la
              ligne au lieu de se replier. */}
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-ink-200">
              {t('settings.notifPushDeviceLabel')}
            </p>
            <p className="text-[10px] text-ink-500">
              {pushState === 'on' ? t('settings.notifPushOn') : t('settings.notifPushOff')}
            </p>
          </div>
          {/* tone="neon" : le vert est le code « ça part vraiment » de
              l'app (mouvements de SOL, .btn-neon). Ici il dit la même
              chose — des alertes réelles sont envoyées à cet appareil. */}
          <ToggleSwitch
            checked={pushState === 'on'}
            onChange={togglePush}
            disabled={pushState === 'checking' || pushState === 'busy'}
            ariaLabel={t('settings.notifPushDeviceLabel')}
            tone="neon"
          />
        </div>
      )}
      {pushState === 'unsupported' && (
        <p className="mb-3 text-[10px] text-ink-500">{t('settings.notifPushUnsupported')}</p>
      )}
      {pushError && <p className="mb-2 text-[10px] text-red-400">{pushError}</p>}

      <div className="space-y-1.5">
        {rows.map((r) => (
          <label
            key={r.key}
            className="flex items-center gap-2 text-[11px] font-medium text-ink-200"
          >
            <input
              type="checkbox"
              checked={prefs[r.key]}
              onChange={() => toggle(r.key)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-accent-violet"
            />
            {r.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default NotificationSettings;
