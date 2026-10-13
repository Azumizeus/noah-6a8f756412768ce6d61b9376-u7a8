// src/components/ThemeSwitch.tsx
// ═══════════════════════════════════════════════════════════════════
// Sélecteur de palette d'accent. Volontairement sans texte dans l'état
// replié : quatre pastilles de couleur communiquent plus vite que quatre
// noms, et ça évite de traduire un libellé dans un espace de 40px.
// Les noms restent accessibles (aria-label + title), donc lisibles au
// lecteur d'écran et au survol.
// ═══════════════════════════════════════════════════════════════════
import { useTheme } from '../lib/ThemeContext';
// SELECTABLE_THEMES, pas THEMES : ce dernier contient aussi les palettes
// retirées du produit mais encore valides pour les profils qui les ont.
import { SELECTABLE_THEMES } from '../lib/theme';
import { useLanguage } from '../lib/i18n/LanguageContext';

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.pickerAria')}
      className={
        'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 ' +
        (compact ? '' : 'w-full justify-center')
      }
    >
      {SELECTABLE_THEMES.map((th) => {
        const active = th.id === theme;
        const label = t(th.labelKey);
        return (
          <button
            key={th.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(th.id)}
            className={
              'relative h-7 w-7 rounded-md transition-transform ' +
              (active
                ? 'scale-100 ring-2 ring-white/70'
                : 'scale-90 opacity-70 hover:scale-100 hover:opacity-100')
            }
          >
            {/* Aperçu de la triade réelle du thème, pas une pastille unie :
                c'est le rapport entre les trois couleurs qui fait l'identité,
                et le voir avant de cliquer évite l'essai-erreur. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 overflow-hidden rounded-md"
              style={{
                background: `linear-gradient(135deg,
                  rgb(${th.primary}) 0%,
                  rgb(${th.primary}) 45%,
                  rgb(${th.money}) 45%,
                  rgb(${th.money}) 78%,
                  rgb(${th.highlight}) 78%)`,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

export default ThemeSwitch;
