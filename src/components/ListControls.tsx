// src/components/ListControls.tsx
// ═══════════════════════════════════════════════════════════════════
// Contrôles de liste partagés : bascule de vue (grandes / petites cartes)
// + pagination numérotée. Introduits le 21/09 pour suivre l'évolution du
// marketplace & co : les listes grossissent, "Afficher plus" cumulatif ne
// suffit plus à s'y accrocher.
//
// Pourquoi la pagination est sûre : elle travaille sur des listes déjà
// entièrement en mémoire (chargées via getProgramAccounts par useProjects,
// PAS paginées serveur). Slicer des pages est un opération pure locale —
// l'objection d'atomicité ciblait le paginage SERVEUR, pas celui-ci.
//
// Contrastes : idents aux pills de filtre existantes ; cibles ≥ 36px ;
// focus clavier violet visible (règles skill buildpact).
// ═══════════════════════════════════════════════════════════════════
import { useEffect } from 'react'; import type { ReactElement } from 'react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { ListingView } from '../lib/listingView';

// ─── Toggle de vue ───────────────────────────────────────────────────

export function ViewToggle({
  view,
  onChange,
  smallViewLabel,
  largeViewLabel,
  listViewLabel,
  tableLabel,
  ariaLabel,
}: {
  view: ListingView;
  onChange: (v: ListingView) => void;
  smallViewLabel: string;
  largeViewLabel: string;
  listViewLabel?: string;
  tableLabel?: string;
  ariaLabel: string;
}) {
  const options: { id: ListingView; label: string; icon: ReactElement }[] = [
    {
      id: 'large',
      label: largeViewLabel,
      icon: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="6.2" height="6.2" rx="1.5" fill="currentColor" />
          <rect x="8.8" y="1" width="6.2" height="6.2" rx="1.5" fill="currentColor" />
          <rect x="1" y="8.8" width="6.2" height="6.2" rx="1.5" fill="currentColor" />
          <rect x="8.8" y="8.8" width="6.2" height="6.2" rx="1.5" fill="currentColor" />
        </svg>
      ),
    },
    {
      id: 'small',
      label: smallViewLabel,
      icon: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="4.4" height="4.4" rx="1" fill="currentColor" />
          <rect x="6.8" y="1" width="4.4" height="4.4" rx="1" fill="currentColor" />
          <rect x="12.6" y="1" width="4.4" height="4.4" rx="1" fill="currentColor" />
          <rect x="1" y="6.8" width="4.4" height="4.4" rx="1" fill="currentColor" />
          <rect x="6.8" y="6.8" width="4.4" height="4.4" rx="1" fill="currentColor" />
          <rect x="12.6" y="6.8" width="4.4" height="4.4" rx="1" fill="currentColor" />
        </svg>
      ),
    },
    // Liste dense : optionnelle — n'apparaît que si listViewLabel est fourni
    // (PactsPage/Dash la gardent en 2 modes, le PactCard étant déjà de type
    // bannière ; Marketplace/Builders/… l'activent).
    ...(listViewLabel
      ? [{
          id: 'list' as ListingView,
          label: listViewLabel,
          icon: (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor" />
              <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" />
              <rect x="1" y="12" width="14" height="2" rx="1" fill="currentColor" />
            </svg>
          ),
        }]
      : []),
    ...(tableLabel
      ? [{
          id: 'table' as ListingView,
          label: tableLabel,
          icon: (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="14" height="3.6" rx="1" fill="currentColor" />
              <rect x="1" y="6" width="14" height="3.6" rx="1" fill="currentColor" />
              <rect x="1" y="11" width="14" height="3.6" rx="1" fill="currentColor" />
            </svg>
          ),
        }]
      : []),
  ];

  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-xl border border-white/10">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={view === o.id}
          className={
            'inline-flex min-h-[36px] items-center gap-1.5 px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-violet ' +
            (view === o.id
              ? 'bg-violet-500/20 text-white'
              : 'text-ink-300 hover:bg-white/5 hover:text-white')
          }
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
          {/* Sur mobile seul l'icône reste : toujours lisible (74px cible). */}
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Pagination numérotée ────────────────────────────────────────────
// Fenêtre glissante : 1 … p-1 p p+1 … N. Les trois numéros autour de la
// page courante suffisent jusqu'à quelques milliers d'items — le gap
// central s'étoile au-delà.
const PAGE_WINDOW = 1;

export function NumberedPagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}) {
  const { t } = useLanguage();
  if (pageCount <= 1) return null;

  const want = (p: number) =>
    p === 1 ||
    p === pageCount ||
    Math.abs(p - page) <= PAGE_WINDOW;

  const cells: (number | '…')[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (!want(p)) continue;
    const prev = cells[cells.length - 1];
    if (typeof prev === 'number' && p - prev > 1) cells.push('…');
    cells.push(p);
  }

  const cls = (active: boolean) =>
    'inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-violet ' +
    (active
      ? 'border border-accent-violet/60 bg-violet-500/20 text-white'
      : 'border border-white/10 text-ink-300 hover:border-white/20 hover:text-white');

  return (
    <nav aria-label={t('common.paginationAria')} className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('common.prevPage')}
        className={cls(false) + ' disabled:pointer-events-none disabled:opacity-40'}
      >
        ‹
      </button>
      {cells.map((c, i) =>
        c === '…' ? (
          <span key={`gap${i}`} aria-hidden="true" className="px-1 text-ink-400">…</span>
        ) : (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-current={c === page ? 'page' : undefined}
            className={cls(c === page)}
          >
            {c}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label={t('common.nextPage')}
        className={cls(false) + ' disabled:pointer-events-none disabled:opacity-40'}
      >
        ›
      </button>
      <span className="ml-2 font-mono text-[11px] text-ink-400">
        {t('common.pageOf', { p: page, n: pageCount })}
      </span>
    </nav>
  );
}

// ─── Découpage paginé ────────────────────────────────────────────────
// Réinitialise la page quand la clé (filtre / recherche / vue) change —
// sinon on garde "page 3 de 40 items" sous un filtre qui n'en a plus que 3.
export function usePagedSlice<T>(
  items: T[],
  page: number,
  setPage: (p: number) => void,
  pageSize: number,
  key: string
) {
  // Appliqué en parasold — détail : useEffect doctrine du projet : reset sur
  // clé change seulement.
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    slice: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    pageCount,
    total: items.length,
    from: items.length === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: Math.min(items.length, safePage * pageSize),
  };
}

export default ViewToggle;
