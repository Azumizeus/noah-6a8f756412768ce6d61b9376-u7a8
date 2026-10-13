// src/components/GlowStrengthSwitch.tsx
// Intensité des halos. 3 crans exposés en UI, mais --glow-strength accepte
// n'importe quelle valeur 0-1 (voir theme.ts) : les box-shadow du projet la
// consomment dans des calc(), donc le réglage s'applique partout sans
// qu'aucun composant n'ait à le lire.
import { useTheme } from '../lib/ThemeContext';
import type { GlowStrength } from '../lib/theme';
import { useLanguage } from '../lib/i18n/LanguageContext';
import InfoTooltip from './InfoTooltip';

const OPTIONS: { value: GlowStrength; labelKey: string }[] = [
  { value: 0, labelKey: 'theme.glowOff' },
  { value: 0.5, labelKey: 'theme.glowMedium' },
  { value: 1, labelKey: 'theme.glowFull' },
];

export function GlowStrengthSwitch() {
  const { glowStrength, setGlowStrength } = useTheme();
  const { t } = useLanguage();

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
        {t('theme.glowHeading')}
        <InfoTooltip text={t('theme.glowHint')} />
      </p>
      <div role="radiogroup" aria-label={t('theme.glowHeading')} className="mt-2 grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          // Comparaison stricte sur un union numérique : pas de piège ici,
          // les 3 valeurs viennent de la même source que l'état.
          const active = glowStrength === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setGlowStrength(opt.value)}
              className={
                'rounded-lg border px-2 py-2 text-[11px] font-medium transition ' +
                (active
                  ? 'border-accent-violet/50 bg-white/[0.06] text-white'
                  : 'border-white/10 bg-black/20 text-ink-400 hover:border-white/20 hover:text-ink-200')
              }
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GlowStrengthSwitch;
