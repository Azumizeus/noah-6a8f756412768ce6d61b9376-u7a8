// src/components/LoadMoreList.tsx
// ═══════════════════════════════════════════════════════════════════
// Bouton "Afficher plus" réutilisable — le pattern de pagination retenu
// le 21/09 pour toutes les listes BuildPact.
//
// Pourquoi PAS de numéros de page : un "load more" travaille en mémoire
// (aucune requête réseau de plus), reste cumulé (l'utilisateur garde son
// contexte de scroll), et les listes on-chain ne sont pas atomiques —
// numériser casserait les renivers inter-pages quand la chaîne avance.
//
// Réutilisé par PactsPage, MarketplacePage et BuildersPage. NetworkPage
// garde son bouton historique (paginé côté Supabase, lui).
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useLanguage } from '../lib/i18n/LanguageContext';

interface LoadMoreButtonProps {
  /** Nombre total d'items de la liste (avant découpage). */
  total: number;
  /** Combien en montre l'UI à cet instant. */
  shown: number;
  /** +un pas. Le parent gère son propre état. */
  onMore: () => void;
}

export function LoadMoreButton({ total, shown, onMore }: LoadMoreButtonProps) {
  const { t } = useLanguage();
  if (shown >= total) return null;
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onMore}
        className="rounded-full border border-white/10 px-5 py-2 text-sm text-ink-300 transition hover:border-white/20 hover:text-white"
      >
        {t('common.showMore', { n: '+' })}
      </button>
    </div>
  );
}

// ─── Hook de découpage ───────────────────────────────────────────────
//(first) Le rendu initial montre `step` items ; la clé (filtre actif ou
// recherche) RESET la découpe — sinon on garde "40 items affichés" en
// passant à 3 items sous un filtre qui n'en contient plus.

export function useLoadMoreSlice<T>(items: T[], key: string, step = 20) {
  const [shown, setShown] = useState(step);
  useEffect(() => setShown(step), [key, step]);
  return {
    visible: items.slice(0, shown),
    more: () => setShown((v) => v + step),
    shown: Math.min(shown, items.length),
  };
}

export default LoadMoreButton;
