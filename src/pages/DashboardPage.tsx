// src/pages/DashboardPage.tsx
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import StatsCard from '../components/StatsCard';
import PactCard from '../components/PactCard';
import EmptyState from '../components/EmptyState';
import TxBanner from '../components/TxBanner';
import AppWalletButton from '../components/AppWalletButton';
import { useProjects, usePactActions } from '../hooks/useProjects';
import { useProjectMedia } from '../hooks/useProjectMedia';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { useListingView } from '../hooks/useListingView';
import { ViewToggle, NumberedPagination, usePagedSlice } from '../components/ListControls';

export function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const { t } = useLanguage();
  const { pacts, loading, error, refresh } = useProjects();
  const { media, refresh: refreshMedia } = useProjectMedia();
  const { busyId, busyAction, txState, runDistribute, runFund, runFinalize, clearTxState } = usePactActions(refresh);

  const totalVault = pacts.reduce((s, p) => s + p.vaultBalanceSol, 0);
  const myClaimable = pacts.reduce((s, p) => s + p.myClaimableSol, 0);
  const activeCount = pacts.filter((p) => p.status === 'active').length;

  // Priorité aux pacts où le wallet connecté est membre ou créateur — avant,
  // cette liste montrait les 4 premiers pacts de TOUT le protocole, pas les
  // siens, ce qui rendait l'accès à "son" pact confus (retour utilisateur).
  const myAddr = publicKey?.toBase58();
  const myPacts = pacts.filter((p) => !!myAddr && (p.creator.toBase58() === myAddr || p.members.some((m) => m.wallet.toBase58() === myAddr)));
  const showingMine = myPacts.length > 0;
  const [view, setView] = useListingView('dashboard');
  const [page, setPage] = useState(1);
  const previewList = showingMine ? myPacts : pacts;
  const paged = usePagedSlice(previewList, page, setPage, 6, String(showingMine));
  const preview = paged.slice;

  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-6 sm:mb-8">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">
            {t('dashboard.eyebrow')}
          </p>
          <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('dashboard.titleLine1')} <span className="text-accent-violet">{t('dashboard.titleLine2')}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">
            {t('dashboard.subtitle')}
          </p>
        </header>
      </FadeInUp>

      <FadeInUp>
        <TxBanner state={txState} onDismiss={clearTxState} />
      </FadeInUp>

      {error && (
        <FadeInUp>
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
            {t('common.rpcErrorPrefix')} {error}
          </p>
        </FadeInUp>
      )}

      {/* Stats */}
      <section aria-label="Statistiques globales" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="glass-panel h-28 animate-pulse rounded-2xl" aria-hidden="true" />
          ))
        ) : (
          <>
            <FadeInUp>
              <StatsCard label={t('dashboard.statVaultsLabel')} value={totalVault} decimals={3} suffix="SOL" icon="earned" accent="violet" sublabel={t('dashboard.statVaultsSublabel', { n: pacts.length })} />
            </FadeInUp>
            <FadeInUp>
              <StatsCard label={t('dashboard.statClaimableLabel')} value={myClaimable} decimals={3} suffix="SOL" icon="claimable" accent="neon" sublabel={t('dashboard.statClaimableSublabel')} />
            </FadeInUp>
            <FadeInUp>
              <StatsCard label={t('dashboard.statFinalizedLabel')} value={activeCount} decimals={0} icon="pacts" accent="gold" sublabel={t('dashboard.statFinalizedSublabel', { n: pacts.length - activeCount })} />
            </FadeInUp>
          </>
        )}
      </section>

      <FadeInUp>
        <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-sans text-lg font-semibold text-white">
            {showingMine ? t('dashboard.myProjectsHeading') : t('dashboard.projectsHeading')}
          </h2>
          <div className="flex items-center gap-2">
            <ViewToggle
              view={view}
              onChange={setView}
              largeViewLabel={t('common.viewLarge')}
              smallViewLabel={t('common.viewSmall')}
              ariaLabel={t('common.viewAria')}
            />
            <a href={showingMine ? '#/pacts?mine=1' : '#/pacts'} className="text-sm text-ink-300 underline-offset-4 hover:text-white hover:underline">
              {showingMine ? t('dashboard.viewAllMine') : t('dashboard.viewAll')}
            </a>
          </div>
        </div>
      </FadeInUp>

      {!loading && preview.length === 0 && connected && myPacts.length === 0 && pacts.length > 0 ? (
        <FadeInUp>
          <EmptyState
            title={t('dashboard.emptyMineTitle')}
            description={t('dashboard.emptyMineDesc')}
            ctaLabel={t('dashboard.emptyMineCta')}
            onCta={() => { window.location.hash = '#/marketplace'; }}
          />
        </FadeInUp>
      ) : !loading && preview.length === 0 ? (
        <FadeInUp>
          <EmptyState
            title={t('dashboard.emptyTitle')}
            description={t('dashboard.emptyDesc')}
            ctaLabel={t('dashboard.emptyCta')}
            onCta={() => { window.location.hash = '#/docs'; }}
          />
        </FadeInUp>
      ) : (
        <section aria-label="Liste des projets" className={
          view === 'small'
            ? 'grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3'
            : 'grid grid-cols-1 gap-4 md:grid-cols-2'
        }>
          {preview.map((pact) => (
            <FadeInUp key={pact.pda.toBase58()}>
              <PactCard
                pact={pact}
                walletConnected={connected}
                busyAction={busyId === pact.pda.toBase58() ? busyAction : null}
                onDistribute={runDistribute}
                onFund={runFund}
                onFinalize={runFinalize}
                clearTopBanner={clearTxState}
                media={media.get(pact.pda.toBase58())}
                onMediaUpdated={refreshMedia}
              />
            </FadeInUp>
          ))}
        </section>
      )}
      {!loading && preview.length > 0 && (
        <NumberedPagination page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
      )}
    </DashboardLayout>
  );
}

export default DashboardPage;
