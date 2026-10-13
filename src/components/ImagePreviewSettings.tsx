// src/components/ImagePreviewSettings.tsx
// Active/désactive l'aperçu grand format des logos et bannières
// (consommé par ImageHoverPreview).
//
// Le rail était écrit à la main ici, avec sa géométrie recopiée à
// l'identique dans NotificationSettings. Passé sur ToggleSwitch : une
// seule définition de la taille et du déplacement de la pastille, et
// une largeur que le conteneur ne peut plus étirer.
//
// Conteneur en <div> et non en <label> : le libellé n'active rien (le
// <button> ne s'associe pas à un <label>, contrairement à un <input>),
// donc un <label> promettait un clic sur le texte qui n'a jamais
// fonctionné. L'accessibilité passe par aria-label sur le rail.
import { useTheme } from '../lib/ThemeContext';
import { useLanguage } from '../lib/i18n/LanguageContext';
import InfoTooltip from './InfoTooltip';
import ToggleSwitch from './ToggleSwitch';

export function ImagePreviewSettings() {
  const { previewEnabled, setPreviewEnabled } = useTheme();
  const { t } = useLanguage();

  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white">
        {t('theme.previewHeading')}
        <InfoTooltip text={t('theme.previewHint')} />
      </h4>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
        <span className="min-w-0 text-xs text-ink-200">{t('theme.previewToggleLabel')}</span>
        <ToggleSwitch
          checked={previewEnabled}
          onChange={() => setPreviewEnabled(!previewEnabled)}
          ariaLabel={t('theme.previewToggleLabel')}
        />
      </div>
    </div>
  );
}

export default ImagePreviewSettings;
