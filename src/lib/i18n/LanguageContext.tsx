// src/lib/i18n/LanguageContext.tsx
// ═══════════════════════════════════════════════════════════════════
// Contexte de langue FR/EN — persisté en localStorage, détecte la langue
// du navigateur au tout premier chargement (navigator.language). Toute
// l'app lit via useLanguage() → { lang, setLang, t }.
// ═══════════════════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type Lang } from './translations';
import { LANG_STORAGE_KEY, readLang, writeLang } from './langStorage';

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Écriture SYNCHRONE au premier rendu : les modules qui lisent
  // localStorage (parseTxError, badges de stage…) voient la même langue
  // que l'interface, sans attendre un effet. Un choix déjà stocké n'est
  // jamais écrasé par la langue du navigateur.
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = readLang();
    writeLang(initial);
    return initial;
  });

  useEffect(() => {
    writeLang(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  // Un autre onglet qui change la langue doit suivre, sinon deux vues
  // du même site divergent. On ignore les écritures qui ne sont pas
  // fr/en (une valeur corrompue ne doit pas faire basculer l'UI).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LANG_STORAGE_KEY) return;
      if (event.newValue === 'fr' || event.newValue === 'en') setLangState(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setLang = (l: Lang) => {
    writeLang(l);
    setLangState(l);
  };

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
