// src/components/ProfileSettingsModal.tsx
// ═══════════════════════════════════════════════════════════════════
// Pop-up de paramètres — palette d'accent, mode clair/sombre, langue.
// Extrait de MonProfilPage pour être montable depuis n'importe quelle
// page (ex. Leaderboard) sans dupliquer la logique de sauvegarde.
//
// Deux façons d'être utilisé :
//  1) Avec `profile` fourni (page Profil) : le brouillon en cours
//     (pseudo/bio non sauvegardés inclus) est enregistré EN MÊME TEMPS
//     que le thème — une seule signature couvre tout, comme avant
//     l'extraction.
//  2) Sans `profile` (ex. Leaderboard) : le modal va chercher lui-même
//     le profil distant du wallet connecté juste avant d'enregistrer,
//     pour ne modifier QUE le thème sans écraser le reste avec un objet
//     vide. Voir le bug déjà rencontré une fois sur ce projet : omettre
//     bannerUrl/themePalette au save les efface silencieusement en base.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useTheme } from '../lib/ThemeContext';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { emptyProfile, type BuilderProfile } from '../lib/profile';
import { fetchProfile, submitProfileUpdate } from '../lib/profileRemote';
import MockupPreviewFrame from './MockupPreviewFrame';
import CustomRpcSettings from './CustomRpcSettings';
import DensitySwitch from './DensitySwitch';
import UsdToggleSettings from './UsdToggleSettings';
import CsvExportButton from './CsvExportButton';
import NotificationSettings from './NotificationSettings';
import ThemeModeGrid from './ThemeModeGrid';
import BackgroundSwitch from './BackgroundSwitch';
import ImagePreviewSettings from './ImagePreviewSettings';
import GlowStrengthSwitch from './GlowStrengthSwitch';
import LanguageSwitch from './LanguageSwitch';
import TranslationStatus from './TranslationStatus';
import InfoTooltip from './InfoTooltip';

type SignFn = (message: Uint8Array) => Promise<Uint8Array>;
type SaveState = 'idle' | 'saving' | 'success' | 'error';

interface ProfileSettingsModalProps {
  onClose: () => void;
  profile?: BuilderProfile | null;
  onSaved?: (saved: BuilderProfile) => void;
}

export function ProfileSettingsModal({ onClose, profile, onSaved }: ProfileSettingsModalProps) {
  const { t } = useLanguage();
  const { theme, preview, confirmPreview, cancelPreview } = useTheme();
  const { publicKey, signMessage } = useWallet();
  const [saving, setSaving] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hideWallet, setHideWallet] = useState<boolean>(profile?.hideWallet ?? false);

  // `signMessage` est absent des wallets en lecture seule (et de certains
  // adaptateurs mobiles) : sans lui, aucune écriture n'est possible — on
  // masque le bouton plutôt que de le désactiver sans explication.
  const canSave = !!publicKey && !!signMessage;

  // Fermer = annuler l'aperçu. Sans ça, un aperçu non validé resterait
  // en mémoire et le prochain MockupPreviewFrame rouvrirait sur un état
  // que l'utilisateur croyait abandonné.
  const handleClose = () => {
    cancelPreview();
    onClose();
  };

  const handleSave = async () => {
    if (!publicKey || !signMessage) return;
    setSaving('saving');
    const wallet = publicKey.toBase58();
    // Ordre de repli volontaire : le brouillon de la page Profil d'abord
    // (il contient des champs non encore enregistrés), sinon le profil
    // distant, sinon un profil neuf. Partir directement d'emptyProfile
    // écraserait pseudo/bio/skills par des valeurs vides.
    const base = profile ?? (await fetchProfile(wallet)) ?? emptyProfile(wallet);
    const toSave: BuilderProfile = {
      ...base,
      themePalette: theme,
      // La case « masquer mon wallet » n'est rendue qu'avec `profile` :
      // hors de ce cas, on reconduit la valeur existante au lieu du `false`
      // de l'état local, qui la remettrait à zéro à chaque enregistrement.
      hideWallet: profile ? hideWallet : base.hideWallet,
      wallet,
    };
    const r = await submitProfileUpdate(wallet, signMessage as SignFn, toSave);
    if ('error' in r) {
      // 21/09 : le détail serveur est désormais affiché sous le message
      // générique — sans ça, « Erreur » sans cause = diag impossible.
      setSaving('error');
      setSaveError(r.error);
      return;
    }
    setSaving('success');
    setSaveError(null);
    onSaved?.(toSave);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-8 sm:pt-14"
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.settingsTitle')}
      onClick={handleClose}
    >
      {/* stopPropagation : sans lui, le onClick de fermeture du fond
          se déclencherait à chaque clic dans le panneau. */}
      <div
        className="modal-surface my-4 flex max-h-[85vh] w-full max-w-2xl flex-col space-y-5 overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-base font-bold text-white">{t('profile.settingsTitle')}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('profile.settingsClose')}
            className="text-ink-400 transition hover:text-white"
          >
            ✕
          </button>
        </div>

        <div>
          <MockupPreviewFrame />
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
            {t('profile.settingsThemeLabel')}
            <InfoTooltip text={t('profile.settingsThemeHint')} />
          </p>
          <div className="mt-2">
            <ThemeModeGrid />
          </div>
        </div>

        <div>
          <BackgroundSwitch />
        </div>

        {/* Bandeau de confirmation — le seul endroit d'où l'aperçu peut être
            validé. ThemeModeGrid et BackgroundSwitch ne font que poser un
            aperçu (voir ThemeContext), donc sans ce bandeau aucun choix de
            thème ne serait applicable. */}
        {preview && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-violet/30 bg-accent-violet/10 px-3 py-2.5">
            <p className="text-[11px] leading-tight text-ink-200">{t('theme.previewBanner')}</p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={cancelPreview}
                className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-ink-300 transition hover:text-white"
              >
                {t('theme.previewCancel')}
              </button>
              <button
                type="button"
                onClick={confirmPreview}
                className="rounded-md bg-accent-violet/90 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-accent-violet"
              >
                {t('theme.previewConfirm')}
              </button>
            </div>
          </div>
        )}

        <div>
          <ImagePreviewSettings />
        </div>

        <div>
          <GlowStrengthSwitch />
        </div>

        <div className="space-y-4 border-t border-white/10 pt-4">
          <DensitySwitch />
          <NotificationSettings />
          {/* Réservé au cas « page Profil » : hors de là, on n'a pas de
              brouillon à joindre, et afficher la case donnerait l'illusion
              qu'elle est enregistrée avec le reste. */}
          {profile && (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white">
                {t('settings.privacyHeading')}
                <InfoTooltip text={t('settings.privacyHint')} />
              </h4>
              <label className="flex items-center gap-2 text-[11px] font-medium text-ink-200">
                <input
                  type="checkbox"
                  checked={hideWallet}
                  onChange={(e) => setHideWallet(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-accent-violet"
                />
                {t('settings.privacyToggleLabel')}
              </label>
            </div>
          )}
          <CustomRpcSettings />
          <UsdToggleSettings />
          <CsvExportButton />
        </div>

        <div>
          <p className="text-xs font-semibold text-white">{t('profile.settingsLangLabel')}</p>
          <div className="mt-2">
            <LanguageSwitch />
          </div>
          {/* Sous le sélecteur de langue et non dans le bloc technique
              plus haut : c'est le seul endroit où l'utilisateur pense
              « langue », donc le seul où il ira chercher pourquoi un
              message est resté non traduit. */}
          <div className="mt-3">
            <TranslationStatus />
          </div>
        </div>

        {canSave && (
          <button
            type="button"
            disabled={saving === 'saving'}
            onClick={handleSave}
            className="w-full rounded-lg bg-accent-violet/90 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-violet disabled:opacity-60"
          >
            {saving === 'saving' ? t('profile.saving') : t('profile.settingsSave')}
          </button>
        )}
        {saving === 'success' && (
          <p className="text-center text-xs text-emerald-400">{t('profile.settingsSaved')}</p>
        )}
        {saving === 'error' && (
          <p className="text-center text-xs text-rose-400">{t('profile.saveErrorPrefix')} {saveError ?? t('errors.notConfigured')}</p>
        )}
      </div>
    </div>
  );
}

export default ProfileSettingsModal;
