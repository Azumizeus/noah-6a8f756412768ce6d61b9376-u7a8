// src/pages/premium/PremiumDashboard.tsx
// ═══════════════════════════════════════════════════════════════════
// Phase 1 — banc réel du shell premium clair (route #/v2).
// Remplace le labo iframe : même contenu que le moodboard « Ivory
// Ledger », mais branché sur les vraies données on-chain (useProjects).
// 4 modes de vue commutables : étendue / compacte / liste / tableau.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { ChainPact } from '../../lib/pacts';
import { formatAddress, formatSol } from '../../lib/pacts';
import { displayPitchShort } from '../../lib/pitch';
import { useProjects } from '../../hooks/useProjects';
import { useProjectMedia } from '../../hooks/useProjectMedia';
import { useListingView } from '../../hooks/useListingView';
import { usePagedSlice } from '../../components/ListControls';
import { ViewToggle } from '../../components/ListControls';
import { APPEARANCE_META, APPEARANCE_IDS, type AppearanceId, loadAppearance, applyAppearanceToDom, useAppearance } from '../../lib/appearance';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
import PremiumProjectCard from './PremiumProjectCard';
import PactListRow from '../../components/PactListRow';
import '../../styles/premium.css';

export default function PremiumDashboard() {
  const { pacts, loading, error } = useProjects();
  const { media } = useProjectMedia();
  const { publicKey } = useWallet();
  const { t } = useLanguage();
  const [effective, setAppearance] = useAppearance();
  useEffect(() => {
    if (!document.documentElement.getAttribute('data-appearance')) {
      applyAppearanceToDom(loadAppearance());
    }
  }, []);

  const [view, setView] = useListingView('v2');
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(pacts, page, setPage, view === 'list' ? 5 : 10, 'v2');

  const recruiting = useMemo(() => pacts.filter((p) => p.status !== 'active'), [pacts]);
  const funding = useMemo(() => pacts.filter((p) => p.status === 'active'), [pacts]);
  const vaultTotal = useMemo(() => pacts.reduce((s, p) => s + p.vaultBalanceSol, 0), [pacts]);

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '20px 24px 96px' }}>
        <PremiumNav active="#/" />
        {/* Hero */}
        <div className="p-hero">
          <p className="p-eyebrow">{t('v2.dashboard.eyebrow')}</p>
          <h1 style={{ margin: '10px 0 8px' }}>
            {t('v2.dashboard.titleLine1')} <span className="accent">{t('v2.dashboard.titleLine2')}</span>.
          </h1>
          <p className="sub" style={{ fontSize: 14, color: 'var(--p-ink2)', maxWidth: 540, lineHeight: 1.65 }}>
            {t('v2.dashboard.subtitle')}
          </p>
        </div>

        {/* Statistiques réelles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginTop: 20 }}>
          <div className="p-stat hero">
            <p className="k">{t('v2.dashboard.statFunds')}</p>
            <p className="v">{loading ? '…' : <>{vaultTotal.toFixed(4)} <small>SOL</small></>}</p>
            <p className="s">{loading ? t('v2.dashboard.loadingRegistry') : t('v2.dashboard.statFundsSub', { n: pacts.length })}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('v2.dashboard.statRecruiting')}</p>
            <p className="v">{loading ? '…' : recruiting.length}</p>
            <p className="s">{t('v2.dashboard.statRecruitingSub')}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('v2.dashboard.statFunding')}</p>
            <p className="v">{loading ? '…' : funding.length}</p>
            <p className="s">{t('v2.dashboard.statFundingSub')}</p>
          </div>
        </div>

        {error && (
          <p style={{ marginTop: 18, borderRadius: 12, border: '1px solid var(--p-line)', padding: '14px 16px', fontSize: 13, color: 'var(--p-err)', background: 'var(--p-canvas)' }}>
            {error}
          </p>
        )}

        {/* Barre de contrôles : 4 vues */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '34px 0 14px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--p-ink)' }}>
            {loading ? t('v2.dashboard.loadingRegistry') : t('v2.dashboard.registryCount', { n: pacts.length })}
          </h2>
          <ViewToggle
            view={view}
            onChange={setView}
            largeViewLabel={t('common.viewLarge')}
            smallViewLabel={t('common.viewSmall')}
            listViewLabel={t('common.viewList')}
            tableLabel={t('common.viewTable')}
            ariaLabel={t('common.viewAria')}
          />
        </div>

        {/* Rendu selon la vue */}
        {view === 'list' && (
          <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'hidden', boxShadow: 'var(--p-shadow)' }}>
            {paged.slice.map((p) => (
              <PactListRow
                key={p.pda.toBase58()}
                seed={p.pda.toBase58()}
                logo={media.get(p.pda.toBase58())?.logoUrl}
                title={p.title}
                meta={`${formatAddress(p.creator.toBase58())} · ${t('v2.dashboard.listMetaMembers', { n: p.members.length })}`}
                pill={
                  <span className={'p-pill ' + (p.status === 'active' ? 'ok' : 'warn')}>
                    {p.status === 'active' ? t('v2.dashboard.pillFunds') : t('v2.dashboard.pillRecruiting')}
                  </span>
                }
                href={`#/pact/${p.pda.toBase58()}`}
              />
            ))}
          </div>
        )}

        {view === 'table' && (
          <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'auto', boxShadow: 'var(--p-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--p-line)' }}>
                  {[t('v2.dashboard.thPact'), t('v2.dashboard.thStatus'), t('v2.dashboard.thVault'), t('v2.dashboard.kMembers'), t('v2.dashboard.kCreator')].map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--p-ink3)', padding: '12px 16px', fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((p) => (
                  <tr key={p.pda.toBase58()} style={{ borderBottom: '1px solid var(--p-line)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <a href={`#/pact/${p.pda.toBase58()}`} style={{ fontWeight: 650, color: 'var(--p-ink)', textDecoration: 'none' }}>{p.title}</a>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={'p-pill ' + (p.status === 'active' ? 'ok' : 'warn')}>{p.status === 'active' ? t('v2.dashboard.pillFunds') : t('v2.dashboard.pillRecruiting')}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums' }}>{p.status === 'active' ? `${formatSol(p.vaultBalanceSol)} SOL` : '—'}</td>
                    <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums' }}>{p.members.length}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 10.5, color: 'var(--p-ink3)' }}>{formatAddress(p.creator.toBase58())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(view === 'large' || view === 'small') && (
          <div
            style={{
              display: 'grid',
              gap: view === 'small' ? 10 : 16,
              gridTemplateColumns: view === 'small' ? 'repeat(auto-fill,minmax(250px,1fr))' : '1fr 1fr',
            }}
          >
            {paged.slice.map((p) => {
              const totalBps = p.members.reduce((sum, m) => sum + m.shareBps, 0);
              const entry = media.get(p.pda.toBase58());
              const isOpen = p.status !== 'active';
              return (
                <PremiumProjectCard
                  key={p.pda.toBase58()}
                  title={p.title}
                  bannerUrl={entry?.bannerUrl}
                  logoUrl={entry?.logoUrl}
                  size={view === 'small' ? 'small' : 'large'}
                  isOpen={isOpen}
                  pill={<span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('v2.dashboard.pillRecruiting') : t('v2.dashboard.pillFunds')}</span>}
                  description={displayPitchShort(p.description, 150)}
                  kv={[
                    { k: isOpen ? t('v2.dashboard.kAllocated') : t('v2.dashboard.thVault'), v: isOpen ? `${Math.round(totalBps / 100)} %` : `${formatSol(p.vaultBalanceSol)} SOL` },
                    { k: isOpen ? t('v2.dashboard.kAvailable') : t('v2.dashboard.kMembers'), v: isOpen ? `${100 - Math.round(totalBps / 100)} %` : String(p.members.length) },
                  ]}
                  trackPct={Math.min(100, totalBps / 100)}
                  legend={p.members.slice(0, 3).map((m) => `${formatAddress(m.wallet.toBase58())} ${(m.shareBps / 100).toFixed(0)}%`).join(' · ')}
                  actions={<a className="p-btn ghost" href={`#/pact/${p.pda.toBase58()}`}>{t('marketplaceCard.viewSheet')}</a>}
                />
              );
            })}
          </div>
        )}

        {/* Pagination — le composant historique, habillé clair via CSS inline */}
        <div data-premium-pagination style={{ marginTop: 18 }}>
          <PaginationShell paged={paged} setPage={setPage} />
        </div>

        {!loading && pacts.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--p-ink2)', fontSize: 13.5, marginTop: 40 }}>
            {t('v2.dashboard.emptyRegistry')}
          </p>
        )}
        {publicKey && (
          <span style={{ display: 'none' }}>{publicKey.toBase58()}</span>
        )}
      </div>
    </div>
  );
}

function PaginationShell({ paged, setPage }: { paged: ReturnType<typeof usePagedSlice>; setPage: (p: number) => void }) {
  const { t } = useLanguage();
  if (paged.pageCount <= 1) return null;
  return (
    <nav aria-label={t('common.paginationAria')} style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
      <PagerBtn disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>‹</PagerBtn>
      {Array.from({ length: paged.pageCount }, (_, i) => i + 1).map((n) => (
        <PagerBtn key={n} active={n === paged.page} onClick={() => setPage(n)}>{n}</PagerBtn>
      ))}
      <PagerBtn disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}>›</PagerBtn>
      <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, color: 'var(--p-ink3)' }}>{t('common.pageOf', { p: paged.page, n: paged.pageCount })}</span>
    </nav>
  );
}

function PagerBtn({ children, onClick, active, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 36,
        minHeight: 36,
        borderRadius: 10,
        border: `1px solid var(--p-line)`,
        background: active ? 'var(--p-ink)' : 'var(--p-canvas)',
        color: active ? '#fff' : 'var(--p-ink2)',
        fontFamily: "'Inter',sans-serif",
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
