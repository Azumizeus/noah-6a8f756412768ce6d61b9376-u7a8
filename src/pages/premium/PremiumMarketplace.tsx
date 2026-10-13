// src/pages/premium/PremiumMarketplace.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — onglet Marketplace, habillages tokens (data-appearance),
// vraies données + candidature off-chain (ApplyModal).
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProjects } from '../../hooks/useProjects';
import { useProjectMedia } from '../../hooks/useProjectMedia';
import { useOpenRoles } from '../../hooks/useOpenRoles';
import { useListingView } from '../../hooks/useListingView';
import { ViewToggle, usePagedSlice } from '../../components/ListControls';
import { formatAddress, formatSol, type ChainPact } from '../../lib/pacts';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import { parsePitch, stageBadgeLabel } from '../../lib/pitch';
import ApplyModal from '../../components/ApplyModal';
import PactListRow from '../../components/PactListRow';
import PremiumNav from './PremiumNav';
import PremiumProjectCard from './PremiumProjectCard';
import '../../styles/premium.css';

type Filter = 'all' | 'recruiting' | 'funding';

export default function PremiumMarketplace() {
  const { t } = useLanguage();
  const { publicKey } = useWallet();
  const { pacts, loading, error } = useProjects();
  const { media } = useProjectMedia();
  const { openRoles } = useOpenRoles();
  const [filter, setFilter] = useState<Filter>('all');
  const [applyTo, setApplyTo] = useState<ChainPact | null>(null);

  const recruiting = useMemo(() => pacts.filter((p) => p.status !== 'active'), [pacts]);
  const funding = useMemo(() => pacts.filter((p) => p.status === 'active'), [pacts]);
  const visible = filter === 'recruiting' ? recruiting : filter === 'funding' ? funding : pacts;

  const [view, setView] = useListingView('v2-marketplace');
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(visible, page, setPage, view === 'list' ? 8 : 12, filter + view);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: t('marketplace.filterAll') },
    { id: 'recruiting', label: t('marketplace.filterRecruiting') },
    { id: 'funding', label: t('marketplace.filterFunding') },
  ];

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px' }}>
        <PremiumNav active="#/marketplace" />
        {/* Hero */}
        <p className="p-eyebrow">{t('marketplace.eyebrow')}</p>
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 10 }}>
          {t('marketplace.titleLine1')}{' '}
          <span style={{ color: 'var(--p-accent)' }}>{t('marketplace.titleLine2')}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--p-ink2)', marginTop: 10, maxWidth: 540, lineHeight: 1.65 }}>
          {t('marketplace.subtitle')}
        </p>

        {/* Stats réelles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginTop: 24 }}>
          <div className="p-stat hero">
            <p className="k">{t('marketplace.statRecruitingLabel')}</p>
            <p className="v">{loading ? '…' : recruiting.length}</p>
            <p className="s">{t('marketplace.statRecruitingSublabel')}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('marketplace.statFundingLabel')}</p>
            <p className="v">{loading ? '…' : funding.length}</p>
            <p className="s">{t('marketplace.statFundingSublabel')}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('v2.marketplace.statRemaining')}</p>
            <p className="v">
              {loading ? '…' : (() => {
                const libre = pacts
                  .filter((p) => p.status !== 'active')
                  .reduce((s, p) => s + (100 - Math.round(p.members.reduce((x, m) => x + m.shareBps, 0) / 100)), 0);
                return `${libre} %`;
              })()}
            </p>
            <p className="s">&nbsp;</p>
          </div>
        </div>

        {/* Filtres + toggle vue */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '30px 0 16px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                style={{
                  borderRadius: 99,
                  border: `1px solid ${filter === f.id ? 'var(--p-accent)' : 'var(--p-line)'}`,
                  background: filter === f.id ? 'var(--p-accent-soft)' : 'transparent',
                  color: filter === f.id ? 'var(--p-accent)' : 'var(--p-ink2)',
                  fontFamily: "'Inter',sans-serif",
                  fontWeight: filter === f.id ? 700 : 550,
                  fontSize: 12,
                  padding: '8px 16px',
                  minHeight: 36,
                  cursor: 'pointer',
                }}
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
            tableLabel={t('common.viewTable')}
            ariaLabel={t('common.viewAria')}
          />
        </div>

        {error && (
          <p style={{ marginTop: 18, padding: '12px 16px', borderRadius: 12, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', color: 'var(--p-err)', fontSize: 13 }}>{t('common.rpcErrorPrefix')} {error}</p>
        )}

        {/* RENDU */}
        {view === 'list' && (
          <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'hidden', boxShadow: 'var(--p-shadow)' }}>
            {paged.slice.map((p) => {
              const isOpen = p.status !== 'active';
              const totalBps = p.members.reduce((sum, m) => sum + m.shareBps, 0);
              return (
                <PactListRow
                  key={p.pda.toBase58()}
                  seed={p.pda.toBase58()}
                  logo={media.get(p.pda.toBase58())?.logoUrl}
                  title={p.title}
                  meta={`${t('marketplaceCard.creator')}${formatAddress(p.creator.toBase58())} · ${openRoles.get(p.pda.toBase58())?.join(' · ') || ''}`}
                  figure={isOpen ? `${Math.max(0, 100 - Math.round(totalBps / 100))} %` : formatSol(p.vaultBalanceSol) + ' SOL'}
                  pill={<span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('marketplaceCard.recruiting') : t('marketplaceCard.funding')}</span>}
                  href={`#/pact/${p.pda.toBase58()}`}
                  onApply={isOpen ? () => setApplyTo(p) : undefined}
                  applyLabel={t('marketplaceCard.apply')}
                />
              );
            })}
          </div>
        )}

        {view === 'table' && (
          <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'auto', boxShadow: 'var(--p-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--p-line)' }}>
                  {[t('v2.dashboard.thPact'), t('v2.dashboard.thStatus'), t('v2.dashboard.thVault'), t('v2.dashboard.kMembers'), t('v2.marketplace.thCreator')].map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, letterSpacing: 0.1, textTransform: 'uppercase', color: 'var(--p-ink3)', padding: '12px 16px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((p) => {
                  const isOpen = p.status !== 'active';
                  return (
                    <tr key={p.pda.toBase58()} style={{ borderBottom: '1px solid var(--p-line)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <a href={`#/pact/${p.pda.toBase58()}`} style={{ fontWeight: 650, color: 'var(--p-ink)', textDecoration: 'none' }}>{p.title}</a>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('marketplaceCard.recruiting') : t('marketplaceCard.funding')}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums' }}>{p.status === 'active' ? `${formatSol(p.vaultBalanceSol)} SOL` : '—'}</td>
                      <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums' }}>{p.members.length}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 10.5, color: 'var(--p-ink3)' }}>{formatAddress(p.creator.toBase58())}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(view === 'large' || view === 'small' ) && (
          <div style={{ display: 'grid', gap: view === 'small' ? 10 : 16, gridTemplateColumns: view === 'small' ? 'repeat(auto-fill,minmax(250px,1fr))' : '1fr 1fr' }}>
            {paged.slice.map((p) => {
              const parsed = parsePitch(p.description);
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
                  pill={<span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('marketplaceCard.recruiting') : t('marketplaceCard.funding')}</span>}
                  description={parsed.pitch}
                  stage={
                    isOpen && parsed.stage ? (
                      <p style={{ fontSize: 10.5, fontWeight: 650, color: 'var(--p-accent)', background: 'var(--p-accent-soft)', borderRadius: 99, padding: '4px 10px', alignSelf: 'flex-start', marginBottom: 10 }}>
                        {stageBadgeLabel(parsed.stage)}
                      </p>
                    ) : undefined
                  }
                  kv={[
                    { k: isOpen ? t('v2.dashboard.kAllocated') : t('v2.dashboard.thVault'), v: isOpen ? `${Math.round(totalBps / 100)} %` : `${formatSol(p.vaultBalanceSol)} SOL` },
                    { k: isOpen ? t('v2.dashboard.kAvailable') : t('v2.dashboard.kMembers'), v: isOpen ? `${100 - Math.round(totalBps / 100)} %` : String(p.members.length) },
                  ]}
                  trackPct={Math.min(100, totalBps / 100)}
                  legend={<>{t('marketplaceCard.creator')}{formatAddress(p.creator.toBase58())}</>}
                  actions={
                    <>
                      <a className="p-btn ghost" href={`#/pact/${p.pda.toBase58()}`}>{t('marketplaceCard.viewSheet')}</a>
                      {isOpen && !p.members.some((m) => m.wallet.toBase58() === publicKey?.toBase58()) && (
                        <button type="button" className="p-btn primary" onClick={() => setApplyTo(p)}>{t('marketplaceCard.apply')}</button>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
        )}

        {applyTo && (
          <ApplyModal
            projectPda={applyTo.pda.toBase58()}
            projectTitle={applyTo.title}
            wantedRoles={openRoles.get(applyTo.pda.toBase58())}
            onClose={() => setApplyTo(null)}
          />
        )}

        {/* Pager réutilisé, porté clair par les mêmes styles inline du shell */}
        <div style={{ display: paged.pageCount <= 1 ? 'none' : 'flex', gap: 5, justifyContent: 'center', alignItems: 'center', marginTop: 18 }}>
          <PagerBtn disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>‹</PagerBtn>
          {Array.from({ length: paged.pageCount }, (_, i) => i + 1).map((n) => (
            <PagerBtn key={n} active={n === paged.page} onClick={() => setPage(n)}>{n}</PagerBtn>
          ))}
          <PagerBtn disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}>›</PagerBtn>
          <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, color: 'var(--p-ink3)' }}>p. {paged.page}/{paged.pageCount}</span>
        </div>
      </div>
    </div>
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
        border: '1px solid var(--p-line)',
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
