// src/pages/PactsPage.tsx
// ═══════════════════════════════════════════════════════════════════
// Onglet "/pacts" — liste complète avec filtres. Le filtre "Mes pacts"
// peut être pré-sélectionné par l'URL (#/pacts?mine=1), c'est ce que
// le Dashboard utilise pour renvoyer ici sans dupliquer sa logique.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProjects, usePactActions } from '../hooks/useProjects';
import { useProjectMedia } from '../hooks/useProjectMedia';
import { usePactsMineParam } from '../lib/router';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { useDensity } from '../hooks/useDensity';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import EmptyState from '../components/EmptyState';
import { useListingView } from '../hooks/useListingView';
import { ViewToggle, NumberedPagination, usePagedSlice } from '../components/ListControls';
import PactCard from '../components/PactCard';
import PactListRow from '../components/PactListRow';
import TxBanner from '../components/TxBanner';

type Filter = 'all' | 'active' | 'pending' | 'mine';

interface Props {
  // Optionnel : en amont (repo GitHub) la page ne prend aucune prop et gère
  // le wizard elle-même. Tant que la version amont n'est pas rapatriée, on
  // garde le point d'entrée mais avec un repli local, sinon App.tsx (qui
  // rend <PactsPage /> sans prop) ne compile pas.
  onCreatePact?: () => void;
}

export default function PactsPage({ onCreatePact }: Props) {
  const createPact = onCreatePact ?? (() => { window.location.hash = '#/create'; });
  const { t } = useLanguage();
  // Densité — 21/09 (fix choix fantôme) : Compact réduit les gaps aussi ici.
  const [density] = useDensity();
  const [view, setView] = useListingView('pacts');
  const { connected, publicKey } = useWallet();
  const { pacts, loading, error, refresh } = useProjects();
  const { media, refresh: refreshMedia } = useProjectMedia();
  const actions = usePactActions(refresh);
  const mineFromUrl = usePactsMineParam();

  const [filter, setFilter] = useState<Filter>(mineFromUrl ? 'mine' : 'all');

  // Le hash peut changer alors que la page est déjà montée (clic sur un lien
  // "Voir tous mes pacts" depuis le Dashboard) — on resynchronise le filtre.
  useEffect(() => {
    if (mineFromUrl) setFilter('mine');
  }, [mineFromUrl]);

  const visible = pacts.filter((p) => {
    if (filter === 'active') return p.status === 'active';
    if (filter === 'pending') return p.status !== 'active';
    if (filter === 'mine') {
      if (!publicKey) return false;
      return (
        p.creator.equals(publicKey) ||
        p.members.some((m) => m.wallet.equals(publicKey))
      );
    }
    return true;
  });
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(visible, page, setPage, view === 'small' ? 16 : 10, filter);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: t('pacts.filterAll') },
    { id: 'active', label: t('pacts.filterActive') },
    { id: 'pending', label: t('pacts.filterPending') },
    { id: 'mine', label: t('pacts.filterMine') },
  ];

  // ⚠️ PactsPage rend son propre layout : App.tsx ne fournit plus de coquille
  // (Index.tsx a été supprimé, c'était une invention absente du repo amont).
  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
    <div className="space-y-8">
      <FadeInUp>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-accent-violet">
              {t('pacts.eyebrow')}
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
              {t('pacts.titleLine1')}{' '}
              <span className="text-accent-violet">{t('pacts.titleLine2')}</span>
            </h1>
          </div>
          <button type="button" onClick={createPact} className="btn-primary">
            {t('pacts.createButton')}
          </button>
        </header>
      </FadeInUp>

      <FadeInUp>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                disabled={f.id === 'mine' && !connected}
                className={
                  'rounded-full border px-4 py-1.5 text-xs transition-colors disabled:opacity-40 ' +
                  (filter === f.id
                    ? 'border-accent-violet/60 bg-violet-500/20 text-white'
                    : 'border-white/10 text-ink-300 hover:text-white')
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <ViewToggle
            view={view}
            onChange={setView}
            largeViewLabel={t('common.viewLarge')}
            smallViewLabel={t('common.viewSmall')}
            listViewLabel={t('common.viewList')}
            ariaLabel={t('common.viewAria')}
          />
        </div>
      </FadeInUp>

      {actions.txState && (
        <FadeInUp>
          <TxBanner state={actions.txState} onDismiss={actions.clearTxState} />
        </FadeInUp>
      )}

      {error && (
        <FadeInUp>
          <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
            {t('common.rpcErrorPrefix')} {error}
          </p>
        </FadeInUp>
      )}

      {loading && (
        <div className="grid gap-4">
          <div className="skeleton h-36 w-full rounded-2xl" aria-hidden="true" />
          <div className="skeleton h-36 w-full rounded-2xl" aria-hidden="true" />
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <FadeInUp>
          <EmptyState
            title={t('pacts.emptyTitle')}
            description={t('pacts.emptyDesc')}
            ctaLabel={t('pacts.createButton')}
            onCta={createPact}
          />
        </FadeInUp>
      )}

      {view === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[.03]">
          {paged.slice.map((p) => {
            const isOpen = p.status !== 'active';
            return (
              <PactListRow
                key={p.pda.toBase58()}
                seed={p.pda.toBase58()}
                logo={media.get(p.pda.toBase58())?.logoUrl}
                title={p.title}
                meta={`${p.creator.toBase58().slice(0, 4)}…${p.creator.toBase58().slice(-4)} · ${p.members.length} ${t('marketplaceCard.members')}`}
                figure={isOpen ? undefined : `${p.vaultBalanceSol.toFixed(3)} SOL`}
                pill={
                  <span
                    className={
                      'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ' +
                      (isOpen
                        ? 'bg-amber-400/10 text-amber-400'
                        : 'bg-emerald-400/10 text-emerald-400')
                    }
                  >
                    {isOpen ? t('pacts.filterPending') : t('pacts.filterActive')}
                  </span>
                }
                href={`#/pact/${p.pda.toBase58()}`}
              />
            );
          })}
        </div>
      ) : (
        <section
          aria-label={t('pacts.listAria')}
          className={
            view === 'small'
              ? 'grid gap-2 md:grid-cols-2 xl:grid-cols-3'
              : density === 'compact'
                ? 'grid gap-2'
                : 'grid gap-4'
          }
        >
          {paged.slice.map((p) => (
            <FadeInUp key={p.pda.toBase58()}>
              <PactCard
                pact={p}
                walletConnected={connected}
                busyAction={actions.busyId === p.pda.toBase58() ? actions.busyAction : null}
                onFund={actions.runFund}
                onFinalize={actions.runFinalize}
                clearTopBanner={actions.clearTxState}
                onDistributed={refresh}
                media={media.get(p.pda.toBase58())}
                onMediaUpdated={refreshMedia}
              />
            </FadeInUp>
          ))}
        </section>
      )}

      <NumberedPagination page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
    </div>
    </DashboardLayout>
  );
}
