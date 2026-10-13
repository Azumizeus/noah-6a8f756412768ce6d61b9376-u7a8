// src/components/LanguageSwitch.tsx
// Petit sélecteur FR/EN — toujours visible dans la nav (desktop + mobile),
// donc accessible "à tout moment" sans bloquer l'ouverture de l'app avec
// un choix forcé. Persisté en localStorage via LanguageContext.
import { useLanguage } from '../lib/i18n/LanguageContext';

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t('nav.langSwitch')}
      className={
        'inline-flex items-center rounded-lg border border-white/10 bg-black/20 p-0.5 text-[11px] font-medium ' +
        (compact ? 'h-9' : 'h-11')
      }
    >
      <button
        type="button"
        onClick={() => setLang('fr')}
        aria-pressed={lang === 'fr'}
        className={
          'rounded-md px-2 py-1 transition-colors ' +
          (lang === 'fr' ? 'bg-violet-500/20 text-white' : 'text-ink-400 hover:text-white')
        }
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={
          'rounded-md px-2 py-1 transition-colors ' +
          (lang === 'en' ? 'bg-violet-500/20 text-white' : 'text-ink-400 hover:text-white')
        }
      >
        EN
      </button>
    </div>
  );
}

export default LanguageSwitch;
