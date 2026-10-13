// src/pages/premium/PremiumSettings.tsx
// ═══════════════════════════════════════════════════════════════════
// Panneau Paramètres du shell PREMIUM.
//
// Pourquoi un panneau dédié plutôt qu'une réutilisation de
// ProfileSettingsModal : ce dernier est (a) habillé en tokens legacy sombres
// — il détonnerait sur un shell clair ou sombre — et (b) soudé à
// l'enregistrement du PROFIL par signature wallet. Ici, tout est en tokens
// --p-* (donc les 4 palettes × 2 modes suivent gratuitement).
//
// Migré du panneau legacy le 08/10 (voir PLAN-CHANTIERS-PREMIUM) — un
// utilisateur du shell premium n'avait AUCUN accès à ces réglages :
//   • Notifications (3 préférences + abonnement push de l'appareil)
//   • Aperçu grand format des logos/bannières  [vivant ici : le shell premium
//     monte PostCard, qui contient ImageHoverPreview]
//   • Confidentialité du profil (masquer l'adresse wallet)
//   • Export CSV de l'historique du wallet
//
// NON migré, et pourquoi (à ne pas confondre avec un oubli) :
//   • thème legacy, décor de fond, intensité des halos — le shell premium a
//     son PROPRE système d'apparence (appearance + mode, ci-dessus). Recopier
//     ces axes créerait deux réglages concurrents pour la même intention, dont
//     l'un n'aurait aucun effet visible (--glow-strength n'alimente que les
//     box-shadow legacy en --accent-violet-rgb).
//   • diagnostic du service de traduction — outil de mise au point du projet,
//     pas un réglage d'utilisateur.
//
// On réutilise les mêmes LIBS que les composants legacy (lib/density.ts,
// lib/usdDisplay.ts, lib/constants.ts, lib/notificationPrefs.ts,
// lib/pushNotifications.ts, lib/csvExport.ts, lib/profileRemote.ts) : un
// réglage changé d'un côté est vu de l'autre. Seule l'UI est réécrite ici,
// parce qu'un composant legacy apporte ses classes Tailwind sombres — la
// logique, elle, n'est jamais dupliquée.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import {
  useAppearance,
  useAppearanceMode,
  APPEARANCE_META,
  APPEARANCE_IDS,
  type AppearanceId,
  type AppearanceMode,
} from '../../lib/appearance';
import { useTheme } from '../../lib/ThemeContext';
import { useDensity } from '../../hooks/useDensity';
import { loadShowUsd, saveShowUsd } from '../../lib/usdDisplay';
import { getCustomRpc, setCustomRpc } from '../../lib/constants';
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '../../lib/notificationPrefs';
import {
  isPushSupported,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPrefs,
} from '../../lib/pushNotifications';
import { buildWalletHistoryCsv, downloadCsv } from '../../lib/csvExport';
import { emptyProfile } from '../../lib/profile';
import { fetchProfile, submitProfileUpdate } from '../../lib/profileRemote';
import '../../styles/premium.css';

// ─── Petits blocs de mise en page (tokens premium uniquement) ─────────

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--p-ink)', margin: 0, letterSpacing: '-0.01em' }}>
        {title}
      </h3>
      {children}
      {hint && <p style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--p-ink3)', margin: 0 }}>{hint}</p>}
    </section>
  );
}

/** Bouton de choix unique (pastille pleine largeur) — état actif en accent. */
function ChoiceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={{
        flex: 1,
        minHeight: 38,
        padding: '8px 12px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 11.5,
        fontWeight: active ? 700 : 550,
        fontFamily: "'Inter',sans-serif",
        border: `1px solid ${active ? 'var(--p-accent)' : 'var(--p-line)'}`,
        background: active ? 'var(--p-accent-soft)' : 'var(--p-canvas)',
        color: active ? 'var(--p-accent)' : 'var(--p-ink2)',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Interrupteur on/off du shell premium. Réécrit ici plutôt qu'importé de
 * components/ToggleSwitch.tsx, qui porte des classes Tailwind legacy
 * (bg-accent-violet, bg-white/15) : sur fond ivoire elles donneraient un rail
 * gris translucide, et sur Atelier un violet étranger à la palette.
 *
 * Géométrie conservée à l'identique (44 × 24, pastille de 20, jeu de 2 px) :
 * c'est l'invariant qui empêche la pastille de se décentrer — voir le
 * commentaire long de components/ToggleSwitch.tsx, qui l'explique en détail.
 * Translation de 20 px = 44 − 2 − 20 − 2.
 */
function PremiumSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        display: 'inline-flex',
        width: 44,
        height: 24,
        minWidth: 44,
        maxWidth: 44,
        flexShrink: 0,
        flexGrow: 0,
        border: 'none',
        padding: 0,
        borderRadius: 99,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        background: checked ? 'var(--p-accent)' : 'var(--p-line)',
        transition: 'background .18s',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          left: 2,
          top: 2,
          width: 20,
          height: 20,
          borderRadius: 99,
          background: '#fff',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform .2s ease-out',
        }}
      />
    </button>
  );
}

/** Case à cocher + libellé, sur une ligne. */
function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, color: 'var(--p-ink2)', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: 'var(--p-accent)', cursor: 'pointer' }}
      />
      {label}
    </label>
  );
}

const rowStyle: CSSProperties = { display: 'flex', gap: 8 };

/** Carte d'une ligne de réglage : libellé + état à gauche, contrôle à droite. */
const cardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid var(--p-line)',
  background: 'var(--p-canvas)',
};

const secondaryButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  minHeight: 38,
  padding: '8px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 11.5,
  fontWeight: 650,
  fontFamily: "'Inter',sans-serif",
  border: '1px solid var(--p-line)',
  background: 'var(--p-canvas)',
  color: 'var(--p-ink2)',
};

type PushState = 'checking' | 'unsupported' | 'off' | 'on' | 'busy';
type CsvState = 'idle' | 'loading' | 'empty' | 'error';
type SaveState = 'idle' | 'saving' | 'success' | 'error';

export default function PremiumSettings({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const [appearance, setAppearance] = useAppearance();
  const [mode, setMode] = useAppearanceMode();
  const [density, setDensity] = useDensity();
  const [showUsd, setShowUsd] = useState(() => loadShowUsd());
  const [rpc, setRpc] = useState(() => getCustomRpc());
  const [rpcSaved, setRpcSaved] = useState(false);

  // Aperçu grand format — état porté par ThemeContext (partagé avec les
  // composants legacy qui l'affichent, dont PostCard ici même).
  const { previewEnabled, setPreviewEnabled } = useTheme();

  // Notifications — mêmes libs que components/NotificationSettings.tsx.
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [pushState, setPushState] = useState<PushState>('checking');
  const [pushError, setPushError] = useState<string | null>(null);

  // Confidentialité — champ de PROFIL (colonne hide_wallet), donc distant :
  // il faut le relire à la connexion du wallet, et le réenregistrer signé.
  const [hideWallet, setHideWallet] = useState(false);
  const [privacyState, setPrivacyState] = useState<SaveState>('idle');
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  const [csvState, setCsvState] = useState<CsvState>('idle');

  // Escape ferme le panneau (même convention que les autres modales de l'app).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // État réel de l'abonnement push de CET appareil. `unsupported` couvre à la
  // fois le navigateur sans Push API et l'infrastructure absente côté projet.
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

  // Relecture du profil distant quand le wallet change, pour afficher l'état
  // réel de hideWallet au lieu d'une case systématiquement décochée.
  // `cancelled` : sans lui, une réponse tardive pour l'ancien wallet
  // écraserait l'état du nouveau après une reconnexion.
  useEffect(() => {
    let cancelled = false;
    if (!publicKey) {
      setHideWallet(false);
      setPrivacyState('idle');
      return;
    }
    fetchProfile(publicKey.toBase58())
      .then((p) => {
        if (!cancelled && p) setHideWallet(p.hideWallet);
      })
      .catch(() => {
        /* profil illisible : on laisse la case sur son état neutre */
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const saveRpc = () => {
    setCustomRpc(rpc);
    setRpcSaved(true);
  };

  const clearRpc = () => {
    setRpc('');
    setCustomRpc('');
    setRpcSaved(false);
  };

  const toggleUsd = (v: boolean) => {
    setShowUsd(v);
    saveShowUsd(v);
  };

  const togglePref = (key: keyof NotificationPrefs) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    saveNotificationPrefs(next);
    // Réplication serveur seulement si l'appareil est abonné — sans
    // abonnement, il n'y a rien à mettre à jour et l'appel serait perdu.
    if (pushState === 'on' && publicKey && signMessage) {
      updatePushPrefs(publicKey.toBase58(), next, (msg) => signMessage(msg)).catch(() => {
        /* non bloquant — la préférence locale reste appliquée */
      });
    }
  };

  const togglePush = async () => {
    if (!publicKey || !signMessage) {
      setPushError(t('settings.notifPushNeedsWallet'));
      return;
    }
    setPushError(null);
    setPushState('busy');
    const wallet = publicKey.toBase58();
    const sign = (msg: Uint8Array) => signMessage(msg);

    // Filet de sécurité repris tel quel de NotificationSettings : même si les
    // fonctions de lib ont leur propre try/catch, celle-ci garantit que
    // l'interrupteur ne reste JAMAIS bloqué sur « busy ».
    try {
      if (pushState === 'on') {
        const res = await unsubscribeFromPush(wallet, sign);
        setPushState(res.ok ? 'off' : 'on');
        if (!res.ok) setPushError(res.error ?? null);
        return;
      }
      const res = await subscribeToPush(wallet, notifPrefs, sign);
      setPushState(res.ok ? 'on' : 'off');
      if (!res.ok) setPushError(res.error ?? null);
    } catch {
      setPushState('off');
      setPushError(t('settings.notifPushUnexpected'));
    }
  };

  const savePrivacy = async () => {
    if (!publicKey || !signMessage) return;
    setPrivacyState('saving');
    const wallet = publicKey.toBase58();
    try {
      // On repart du profil DISTANT, jamais d'un objet vide : envoyer un
      // profil partiel efface silencieusement en base tout champ omis
      // (bannière, palette — bug déjà rencontré sur ce projet).
      const base = (await fetchProfile(wallet)) ?? emptyProfile(wallet);
      const r = await submitProfileUpdate(wallet, (msg) => signMessage(msg), {
        ...base,
        wallet,
        hideWallet,
      });
      if ('error' in r) {
        setPrivacyState('error');
        setPrivacyError(r.error);
        return;
      }
      setPrivacyState('success');
      setPrivacyError(null);
    } catch {
      setPrivacyState('error');
      setPrivacyError(null);
    }
  };

  const handleExport = async () => {
    if (!publicKey) return;
    setCsvState('loading');
    try {
      const wallet = publicKey.toBase58();
      const csv = await buildWalletHistoryCsv(wallet);
      // `empty` est un état à part entière : « rien à exporter » et « serveur
      // injoignable » demandent deux messages différents, sinon l'utilisateur
      // croit à une panne.
      if (!csv) {
        setCsvState('empty');
        return;
      }
      downloadCsv(`buildpact-${wallet.slice(0, 8)}-history.csv`, csv);
      setCsvState('idle');
    } catch {
      setCsvState('error');
    }
  };

  const prefRows: Array<{ key: keyof NotificationPrefs; label: string }> = [
    { key: 'approvals', label: t('settings.notifApprovals') },
    { key: 'funding', label: t('settings.notifFunding') },
    { key: 'quests', label: t('settings.notifQuests') },
  ];

  const canSign = !!publicKey && !!signMessage;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.settingsTitle')}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        overflowY: 'auto',
      }}
    >
      {/* stopPropagation : sans lui, chaque clic DANS le panneau remonterait
          jusqu'au onClick de fermeture du fond, et le panneau se fermerait. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--p-bg)',
          border: '1px solid var(--p-line)',
          borderRadius: 'var(--p-radius-lg)',
          boxShadow: 'var(--p-shadow)',
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          color: 'var(--p-ink)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            {t('profile.settingsTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('profile.settingsClose')}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid var(--p-line)',
              background: 'var(--p-canvas)',
              color: 'var(--p-ink2)',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </header>

        {/* ── Apparence : clair/sombre + palette ── */}
        <Section title={t('theme.appearanceHeading')}>
          <div role="radiogroup" aria-label={t('theme.modeAria')} style={rowStyle}>
            {(['light', 'dark'] as const).map((m: AppearanceMode) => (
              <ChoiceButton key={m} active={mode === m} onClick={() => setMode(m)}>
                {m === 'light' ? '☀️ ' : '🌙 '}
                {t(m === 'light' ? 'theme.modeLight' : 'theme.modeDark')}
              </ChoiceButton>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {APPEARANCE_IDS.map((id: AppearanceId) => {
              const active = appearance === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAppearance(id)}
                  aria-pressed={active}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '8px 10px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    border: `1px solid ${active ? 'var(--p-accent)' : 'var(--p-line)'}`,
                    background: active ? 'var(--p-accent-soft)' : 'var(--p-canvas)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 99,
                      background: APPEARANCE_META[id].swatch,
                      border: '1px solid var(--p-line)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 550, color: active ? 'var(--p-accent)' : 'var(--p-ink2)' }}>
                    {APPEARANCE_META[id].label}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Densité ── */}
        <Section title={t('settings.densityHeading')} hint={t('settings.densityHint')}>
          <div role="radiogroup" aria-label={t('settings.densityHeading')} style={rowStyle}>
            {(['comfortable', 'compact'] as const).map((d) => (
              <ChoiceButton key={d} active={density === d} onClick={() => setDensity(d)}>
                {d === 'comfortable' ? t('settings.densityComfortable') : t('settings.densityCompact')}
              </ChoiceButton>
            ))}
          </div>
        </Section>

        {/* ── Aperçu grand format des images (migré du panneau legacy) ── */}
        <Section title={t('theme.previewHeading')} hint={t('theme.previewHint')}>
          <div style={cardStyle}>
            <span style={{ minWidth: 0, fontSize: 11.5, color: 'var(--p-ink2)' }}>
              {t('theme.previewToggleLabel')}
            </span>
            <PremiumSwitch
              checked={previewEnabled}
              onChange={() => setPreviewEnabled(!previewEnabled)}
              ariaLabel={t('theme.previewToggleLabel')}
            />
          </div>
        </Section>

        {/* ── Langue ── */}
        <Section title={t('profile.settingsLangLabel')}>
          <div role="radiogroup" aria-label={t('profile.settingsLangLabel')} style={rowStyle}>
            {(['fr', 'en'] as const).map((code) => (
              <ChoiceButton key={code} active={lang === code} onClick={() => setLang(code)}>
                {code.toUpperCase()}
              </ChoiceButton>
            ))}
          </div>
        </Section>

        {/* ── Notifications (migré du panneau legacy) ── */}
        <Section title={t('settings.notificationsHeading')} hint={t('settings.notificationsHint')}>
          {pushState !== 'unsupported' ? (
            <div style={cardStyle}>
              {/* minWidth: 0 — un enfant flex refuse de passer sous sa largeur
                  de contenu sans ça, et pousse l'interrupteur hors de la ligne
                  au lieu de replier le texte. */}
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--p-ink2)' }}>{t('settings.notifPushDeviceLabel')}</p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 10.5,
                    color: pushState === 'on' ? 'var(--p-ok)' : 'var(--p-ink3)',
                  }}
                >
                  {pushState === 'on' ? t('settings.notifPushOn') : t('settings.notifPushOff')}
                </p>
              </div>
              <PremiumSwitch
                checked={pushState === 'on'}
                onChange={togglePush}
                disabled={pushState === 'checking' || pushState === 'busy'}
                ariaLabel={t('settings.notifPushDeviceLabel')}
              />
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--p-ink3)' }}>{t('settings.notifPushUnsupported')}</p>
          )}
          {pushError && <p style={{ margin: 0, fontSize: 10.5, color: 'var(--p-err)' }}>{pushError}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {prefRows.map((r) => (
              <CheckRow
                key={r.key}
                checked={notifPrefs[r.key]}
                onChange={() => togglePref(r.key)}
                label={r.label}
              />
            ))}
          </div>
        </Section>

        {/* ── Confidentialité du profil (migré du panneau legacy) ── */}
        <Section title={t('settings.privacyHeading')} hint={t('settings.privacyHint')}>
          <CheckRow
            checked={hideWallet}
            onChange={(v) => {
              setHideWallet(v);
              // Un changement non enregistré ne doit pas laisser le bandeau
              // « Enregistré » d'un clic précédent à l'écran.
              setPrivacyState('idle');
            }}
            label={t('settings.privacyToggleLabel')}
          />
          {canSign ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={savePrivacy}
                disabled={privacyState === 'saving'}
                style={{
                  minHeight: 38,
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: privacyState === 'saving' ? 'not-allowed' : 'pointer',
                  fontSize: 11.5,
                  fontWeight: 700,
                  fontFamily: "'Inter',sans-serif",
                  background: 'var(--p-accent)',
                  color: '#fff',
                  opacity: privacyState === 'saving' ? 0.6 : 1,
                }}
              >
                {privacyState === 'saving' ? t('profile.saving') : t('profile.settingsSave')}
              </button>
              {privacyState === 'success' && (
                <span style={{ fontSize: 10.5, color: 'var(--p-ok)' }}>{t('profile.settingsSaved')}</span>
              )}
            </div>
          ) : (
            // Sans wallet, aucune signature n'est possible : le dire plutôt que
            // d'afficher un bouton qui échouerait sans explication.
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--p-ink3)' }}>{t('settings.privacyNeedsWallet')}</p>
          )}
          {privacyState === 'error' && (
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--p-err)' }}>
              {t('profile.saveErrorPrefix')} {privacyError ?? t('errors.notConfigured')}
            </p>
          )}
        </Section>

        {/* ── RPC personnalisé ── */}
        <Section title={t('settings.rpcHeading')} hint={t('settings.rpcHint')}>
          <div style={rowStyle}>
            <input
              type="url"
              value={rpc}
              onChange={(e) => {
                setRpc(e.target.value);
                setRpcSaved(false);
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label={t('settings.rpcHeading')}
              placeholder="https://…"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 38,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--p-line)',
                background: 'var(--p-canvas)',
                color: 'var(--p-ink)',
                fontFamily: 'monospace',
                fontSize: 11.5,
              }}
            />
            <button
              type="button"
              onClick={saveRpc}
              style={{
                minHeight: 38,
                padding: '8px 16px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 11.5,
                background: 'var(--p-accent)',
                color: '#fff',
              }}
            >
              {t('common.save')}
            </button>
            {rpc && (
              <button
                type="button"
                onClick={clearRpc}
                style={{
                  minHeight: 38,
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--p-line)',
                  background: 'var(--p-canvas)',
                  color: 'var(--p-ink2)',
                  cursor: 'pointer',
                  fontSize: 11.5,
                }}
              >
                {t('settings.rpcClear')}
              </button>
            )}
          </div>
          {rpcSaved && (
            <p style={{ fontSize: 10.5, color: 'var(--p-ok)', margin: 0 }}>{t('settings.rpcSaved')}</p>
          )}
        </Section>

        {/* ── Affichage USD ── */}
        {/* Bloc inline plutôt que <Section> : la seule clé i18n disponible est
            le libellé de la case, et la mettre en titre la ferait apparaître
            deux fois (titre + libellé). */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--p-ink2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showUsd}
              onChange={(e) => toggleUsd(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--p-accent)' }}
            />
            {t('settings.usdToggleLabel')}
          </label>
          <p style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--p-ink3)', margin: 0 }}>{t('settings.usdHint')}</p>
        </section>

        {/* ── Export CSV (migré du panneau legacy) ── */}
        <Section title={t('settings.exportHeading')} hint={t('settings.exportHint')}>
          {/* Sans wallet il n'y a rien à exporter : le panneau historique ne
              rendait même pas le bouton (CsvExportButton renvoie null). */}
          {publicKey && (
            <button
              type="button"
              onClick={handleExport}
              disabled={csvState === 'loading'}
              style={{
                ...secondaryButtonStyle,
                opacity: csvState === 'loading' ? 0.6 : 1,
                cursor: csvState === 'loading' ? 'not-allowed' : 'pointer',
              }}
            >
              {csvState === 'loading' ? t('common.loading') : t('settings.exportButton')}
            </button>
          )}
          {csvState === 'empty' && (
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--p-ink3)' }}>{t('settings.exportEmpty')}</p>
          )}
          {csvState === 'error' && (
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--p-err)' }}>{t('errors.serverUnreachable')}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
