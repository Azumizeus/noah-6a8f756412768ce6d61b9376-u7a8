// src/components/ModeToggle.tsx
// ═══════════════════════════════════════════════════════════════════
// Bascule Sombre / Clair du header — 2 boutons, c'est tout.
//
// 21/09 (demande user) : les pastilles de palette (violet/volta/ember)
// quittaient le header — trop de choix visuel en permanence. Les
// habillages restent réglables dans ⚙️ Paramètres (ThemeModeGrid), où
// ils disposent d'un aperçu grand format. Le header ne garde que le
// réglage le plus fréquent : jour/nuit.
// ═══════════════════════════════════════════════════════════════════
import { useTheme } from '../lib/ThemeContext';
import { useLanguage } from '../lib/i18n/LanguageContext';

export function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  const { t } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.modeAria')}
      className={
        'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 ' +
        (compact ? '' : 'w-full justify-center')
      }
    >
      {(['dark', 'light'] as const).map((m) => {
        const active = m === mode;
        const label = t(m === 'light' ? 'theme.modeLight' : 'theme.modeDark');
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setMode(m)}
            className={
              'flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ' +
              (active
                ? 'bg-white/10 text-white'
                : 'text-ink-400 hover:bg-white/5 hover:text-white')
            }
          >
            {m === 'dark' ? (
              // Lune
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              // Soleil
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default ModeToggle;
