// src/pages/TreasuryPage.tsx
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import StatsCard from '../components/StatsCard';
import { useTreasury } from '../hooks/useProjects';
import { explorerTxUrl, formatSol } from '../lib/pacts';
import { downloadTreasuryCsv, downloadTreasuryJson } from '../lib/exportTreasury';
import { useLanguage } from '../lib/i18n/LanguageContext';

export function TreasuryPage() {
  const { t } = useLanguage();

  function timeAgo(unixSeconds: number | null): string {
    if (!unixSeconds) return '';
    const diffMs = Date.now() - unixSeconds * 1000;
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return t('treasury.justNow');
    if (min < 60) return t('treasury.minAgo', { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t('treasury.hAgo', { n: h });
    const d = Math.floor(h / 24);
    return t('treasury.dAgo', { n: d });
  }

  const { totalValueLockedSol, distributedRecentSol, pendingClaimsSol, flows, flowsVerified, loading, error } = useTreasury();

  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-6 sm:mb-8">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">{t('treasury.eyebrow')}</p>
          <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('treasury.titleLine1')} <span className="text-accent-violet">{t('treasury.titleLine2')}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">
            {t('treasury.subtitle')}
          </p>
        </header>
      </FadeInUp>

      {error && (
        <FadeInUp>
          <p className="mt-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
            {t('common.rpcErrorPrefix')} {error}
          </p>
        </FadeInUp>
      )}

      <section aria-label={t('treasury.eyebrow')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="glass-panel h-28 animate-pulse rounded-2xl" aria-hidden="true" />
          ))
        ) : (
          <>
            <FadeInUp><StatsCard label={t('treasury.statTvlLabel')} value={totalValueLockedSol} decimals={3} suffix="SOL" icon="earned" accent="violet" sublabel={t('treasury.statTvlSublabel')} /></FadeInUp>
            <FadeInUp>
              {flowsVerified ? (
                <StatsCard label={t('treasury.statDistributedLabel')} value={distributedRecentSol} decimals={3} suffix="SOL" icon="claimable" accent="neon" sublabel={t('treasury.statDistributedSublabel')} />
              ) : (
                <div className="glass-panel p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{t('treasury.statDistributedLabel')}</p>
                  <p className="mt-3 font-mono text-2xl font-bold text-white">—</p>
                  <p className="mt-1 text-xs text-ink-300">{t('treasury.unverifiedFlows')}</p>
                </div>
              )}
            </FadeInUp>
            <FadeInUp><StatsCard label={t('treasury.statPendingLabel')} value={pendingClaimsSol} decimals={3} suffix="SOL" icon="pacts" accent="gold" sublabel={t('treasury.statPendingSublabel')} /></FadeInUp>
          </>
        )}
      </section>

      <FadeInUp>
        <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-sans text-lg font-semibold text-white">{t('treasury.recentFlows')}</h2>
          {!loading && flows.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadTreasuryCsv(flows)}
                className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs text-ink-300 hover:border-accent-violet/40 hover:text-white"
              >
                {t('treasury.exportCsv')}
              </button>
              <button
                type="button"
                onClick={() => downloadTreasuryJson(flows, { totalValueLockedSol, distributedRecentSol, pendingClaimsSol })}
                className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs text-ink-300 hover:border-accent-violet/40 hover:text-white"
              >
                {t('treasury.exportJson')}
              </button>
            </div>
          )}
        </div>
      </FadeInUp>

      {!loading && flows.length === 0 && (
        <FadeInUp>
          <p className="glass-panel px-4 py-6 text-center text-sm text-ink-400">
            {flowsVerified ? t('treasury.emptyFlows') : t('treasury.unverifiedFlows')}
          </p>
        </FadeInUp>
      )}

      {flows.length > 0 && (
        <FadeInUp>
          <ul className="glass-panel divide-y divide-violet-500/10">
            {flows.map((f) => (
              <li key={f.signature} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <a
                    href={explorerTxUrl(f.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm text-white underline-offset-2 hover:text-accent-neon hover:underline"
                  >
                    {f.label} — {f.projectTitle}
                  </a>
                  <p className="mt-0.5 font-mono text-xs text-ink-400">{timeAgo(f.when)}</p>
                </div>
                <p className={'shrink-0 font-mono text-sm tabular-nums ' + (f.amountSol > 0 ? 'text-accent-neon' : 'text-accent-gold')}>
                  {f.amountSol > 0 ? '+' : '−'}{formatSol(Math.abs(f.amountSol))} SOL
                </p>
              </li>
            ))}
          </ul>
        </FadeInUp>
      )}
    </DashboardLayout>
  );
}

export default TreasuryPage;
