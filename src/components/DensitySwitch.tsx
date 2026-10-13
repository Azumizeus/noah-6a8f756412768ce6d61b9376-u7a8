// src/components/DensitySwitch.tsx
// Choix confortable / compact. `role="radiogroup"` + `aria-checked` sur
// des <button> plutôt que de vrais <input type="radio"> : le rendu est
// entièrement custom (pastilles pleine largeur), et styler un radio natif
// à ce point demande de le masquer — ce qui casse le focus visible.
import { useDensity } from '../hooks/useDensity';
import { useLanguage } from '../lib/i18n/LanguageContext';
import InfoTooltip from './InfoTooltip';

export function DensitySwitch() {
  const [density, setDensity] = useDensity();
  const { t } = useLanguage();

  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white">
        {t('settings.densityHeading')}
        <InfoTooltip text={t('settings.densityHint')} />
      </h4>
      <div role="radiogroup" aria-label={t('settings.densityHeading')} className="flex gap-2">
        {(['comfortable', 'compact'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={density === d}
            onClick={() => setDensity(d)}
            className={
              'flex-1 rounded-lg border px-3 py-2 text-[11px] font-medium transition ' +
              (density === d
                ? 'border-accent-violet/50 bg-white/[0.06] text-white'
                : 'border-white/10 bg-black/20 text-ink-300 hover:border-white/20')
            }
          >
            {d === 'comfortable' ? t('settings.densityComfortable') : t('settings.densityCompact')}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DensitySwitch;
