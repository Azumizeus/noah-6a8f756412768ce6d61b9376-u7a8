// src/pages/MarketplacePage.tsx
// ═══════════════════════════════════════════════════════════════════
// Onglet "/marketplace" — vue découverte. Aucune action on-chain ici :
// les cards renvoient vers la fiche publique du pact, et "Postuler"
// ouvre une candidature 100% off-chain (Supabase). Voir ApplyModal.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProjectMedia } from '../hooks/useProjectMedia';
import { useOpenRoles } from '../hooks/useOpenRoles';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { useDensity } from '../hooks/useDensity';
import { useListingView } from '../hooks/useListingView';
import { ViewToggle, NumberedPagination, usePagedSlice } from '../components/ListControls';
import type { ChainPact } from '../lib/pacts';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import { MarketplaceCard } from '../components/MarketplaceCard';
import PactListRow from '../components/PactListRow';
import { formatAddress } from '../lib/pacts';
import StatsCard from '../components/StatsCard';
import EmptyState from '../components/EmptyState';
import ApplyModal from '../components/ApplyModal';

type Filter = 'all' | 'recruiting' | 'funding';

interface Props {
  // Optionnel : en amont (repo GitHub) la page ne prend aucune prop. Repli
  // local tant que la version amont n'est pas rapatriée, sinon App.tsx (qui
  // rend <MarketplacePage /> sans prop) ne compile pas.
  onCreatePact?: () => void;
}

export default function MarketplacePage({ onCreatePact }: Props) {
  const createPact = onCreatePact ?? (() => { window.location.hash = '#/pacts'; });
  const { t } = useLanguage();
  // Densité — 21/09 : le réglage ⚙️ Confortable/Compact (DensitySwitch)
  // était réellement interprété nulle part — le choix n'entraînait aucune
  // différence visible = choix fantôme. Compact : +1 colonne et gaps réduits.
  // Vue par défaut : la densité globale (Paramètres) reste le comportement
  // "fresh visitor" ; ViewToggle permet de la contourner page par page et
  // persiste son propre choix (useListingView).
  const [density] = useDensity();
  const [view, setView] = useListingView('marketplace');
  const { pacts, loading, error } = useProjects();
  const { publicKey } = useWallet();
  const { media } = useProjectMedia();
  const { openRoles } = useOpenRoles();
  const [filter, setFilter] = useState<Filter>('all');
  const [applyTo, setApplyTo] = useState<ChainPact | null>(null);

  // "Recrute" = pact encore ouvert (parts modifiables, membres ajoutables).
  // "Cherche des fonds" = pact finalisé, verrouillé, prêt à recevoir du SOL.
  const recruiting = pacts.filter((p) => p.status !== 'active');
  const funding = pacts.filter((p) => p.status === 'active');

  const visible =
    filter === 'recruiting' ? recruiting : filter === 'funding' ? funding : pacts;
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(visible, page, setPage, view === 'small' ? 24 : 12, filter);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: t('marketplace.filterAll') },
    { id: 'recruiting', label: t('marketplace.filterRecruiting') },
    { id: 'funding', label: t('marketplace.filterFunding') },
  ];

  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
    <div className="space-y-8">
      <FadeInUp>
        <header>
          <p className="font-mono text-[11px] uppercase tracking-wider text-accent-violet">
            {t('marketplace.eyebrow')}
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
            {t('marketplace.titleLine1')}{' '}
            <span className="text-accent-violet">{t('marketplace.titleLine2')}</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ink-300">{t('marketplace.subtitle')}</p>
        </header>
      </FadeInUp>

      <FadeInUp>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatsCard
            label={t('marketplace.statRecruitingLabel')}
            value={recruiting.length}
            decimals={0}
            icon="pacts"
            accent="violet"
            loading={loading}
            sublabel={t('marketplace.statRecruitingSublabel')}
          />
          <StatsCard
            label={t('marketplace.statFundingLabel')}
            value={funding.length}
            decimals={0}
            icon="earned"
            accent="neon"
            loading={loading}
            sublabel={t('marketplace.statFundingSublabel')}
          />
        </div>
      </FadeInUp>

      <FadeInUp>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={
                  'rounded-full border px-4 py-1.5 text-xs transition-colors ' +
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

      {error && (
        <FadeInUp>
          <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
            {t('common.rpcErrorPrefix')} {error}
          </p>
        </FadeInUp>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="skeleton h-64 w-full rounded-2xl" aria-hidden="true" />
          <div className="skeleton h-64 w-full rounded-2xl" aria-hidden="true" />
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <FadeInUp>
          <EmptyState
            title={t('marketplace.emptyTitle')}
            description={t('marketplace.emptyDesc')}
            ctaLabel={t('marketplace.emptyCta')}
            onCta={createPact}
          />
        </FadeInUp>
      )}

      {view === 'list' ? (
        // Mode liste dense : 1 ligne = 1 pact, mêmes données que les cartes.
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[.03]">
          {paged.slice.map((p) => {
            const isOpen = p.status !== 'active';
            const totalBps = p.members.reduce((sum, m) => sum + m.shareBps, 0);
            return (
              <PactListRow
                key={p.pda.toBase58()}
                seed={p.pda.toBase58()}
                logo={media.get(p.pda.toBase58())?.logoUrl}
                title={p.title}
                meta={`${t('marketplaceCard.creator')}${formatAddress(p.creator.toBase58())} · ${p.members.length} ${t('marketplaceCard.members')}`}
                figure={isOpen ? `${Math.max(0, 100 - totalBps / 100).toFixed(0)} %` : undefined}
                pill={
                  <span
                    className={
                      'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ' +
                      (isOpen
                        ? 'bg-amber-400/10 text-amber-400'
                        : 'bg-emerald-400/10 text-emerald-400')
                    }
                  >
                    {isOpen ? t('marketplaceCard.recruiting') : t('marketplaceCard.funding')}
                  </span>
                }
                href={`#/pact/${p.pda.toBase58()}`}
                onApply={isOpen ? () => setApplyTo(p) : undefined}
                applyLabel={isOpen && !p.members.some((m) => m.wallet.toBase58() === publicKey?.toBase58()) ? t('marketplaceCard.apply') : undefined}
              />
            );
          })}
        </div>
      ) : (
      <div
        className={
          view === 'small' || density === 'compact'
            ? 'grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' // Petites cartes : plus de colonnes, gaps réduits
            : 'grid gap-4 sm:grid-cols-2'
        }
      >
        {paged.slice.map((p) => (
          <FadeInUp key={p.pda.toBase58()}>
            <MarketplaceCard
              pact={p}
              onApply={setApplyTo}
              media={media.get(p.pda.toBase58())}
              openRoles={openRoles.get(p.pda.toBase58())}
            />
          </FadeInUp>
        ))}
      </div>
      )}

      <NumberedPagination page={paged.page} pageCount={paged.pageCount} onChange={setPage} />

      {applyTo && (
        <ApplyModal
          projectPda={applyTo.pda.toBase58()}
          projectTitle={applyTo.title}
          wantedRoles={openRoles.get(applyTo.pda.toBase58())}
          onClose={() => setApplyTo(null)}
        />
      )}
    </div>
    </DashboardLayout>
  );
}
