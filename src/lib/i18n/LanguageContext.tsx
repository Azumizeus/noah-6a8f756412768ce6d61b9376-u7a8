// src/lib/i18n/LanguageContext.tsx
// ═══════════════════════════════════════════════════════════════════
// Contexte de langue FR/EN — persisté en localStorage, détecte la langue
// du navigateur au tout premier chargement (navigator.language). Toute
// l'app lit via useLanguage() → { lang, setLang, t }.
// ═══════════════════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type Lang } from './translations';

const STORAGE_KEY = 'buildpact_lang';

function detectInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en') return stored;
  } catch {
    /* localStorage indisponible (navigation privée...) — fallback navigateur */
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }
  return 'fr';
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitialLang());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* non bloquant */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t: (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage() doit être utilisé à l\'intérieur de <LanguageProvider>');
  return ctx;
}
