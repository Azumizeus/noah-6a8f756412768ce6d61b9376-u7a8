// src/pages/premium/PremiumPacts.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — onglet Pacts : registre complet (liste/tableau rampant
// en priorité, cartes ensuite). Actions on-chain restent sur la fiche
// #/pact/<pda> — v2 n'active pas encore la gestion (rollout progressif.
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProjects } from '../../hooks/useProjects';
import { useProjectMedia } from '../../hooks/useProjectMedia';
import { useListingView } from '../../hooks/useListingView';
import { ViewToggle, usePagedSlice } from '../../components/ListControls';
import { formatAddress, formatSol, type ChainPact } from '../../lib/pacts';
import { displayPitchShort } from '../../lib/pitch';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PactListRow from '../../components/PactListRow';
import PremiumNav from './PremiumNav';
import PremiumProjectCard from './PremiumProjectCard';
import '../../styles/premium.css';

type Filter = 'all' | 'active' | 'pending' | 'mine';

export default function PremiumPacts() {
  const { t } = useLanguage();
  const { publicKey } = useWallet();
  const { pacts, loading, error } = useProjects();
  const { media } = useProjectMedia();

  const [filter, setFilter] = useState<Filter>('all');
  const mine = useMemo(
    () => pacts.filter((p) => !!publicKey && (p.creator.toBase58() === publicKey?.toBase58() || p.members.some((m) => m.wallet.toBase58() === publicKey?.toBase58()))),
    [pacts, publicKey]
  );
  const visible = useMemo(() => {
    if (filter === 'active') return pacts.filter((p) => p.status === 'active');
    if (filter === 'pending') return pacts.filter((p) => p.status !== 'active');
    if (filter === 'mine') return mine;
    return pacts;
  }, [pacts, filter, mine]);

  const [view, setView] = useListingView('v2-pacts');
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(visible, page, setPage, view === 'list' ? 7 : 12, filter + view);

  const totalVault = useMemo(() => pacts.reduce((s, p) => s + p.vaultBalanceSol, 0), [pacts]);

  useEffect(() => {
    document.title = 'BuildPact — Mes pacts (v2)';
  }, []);

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/pacts" />

        <p className="p-eyebrow">{t('pacts.eyebrow')}</p>
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 8 }}>
          {t('pacts.titleLine1')}{' '}
          <span style={{ color: 'var(--p-accent)' }}>{t('pacts.titleLine2')}</span>
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginTop: 20 }}>
          <div className="p-stat hero">
            <p className="k">{t('v2.pacts.statVaults')}</p>
            <p className="v">{totalVault.toFixed(4)} <small>SOL</small></p>
            <p className="s">{t('v2.pacts.statVaultsSub', { n: pacts.length })}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('v2.pacts.statOpen')}</p>
            <p className="v">{pacts.filter((p) => p.status !== 'active').length}</p>
            <p className="s">{t('v2.pacts.statOpenSub')}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('v2.pacts.statFinalized')}</p>
            <p className="v">{pacts.filter((p) => p.status === 'active').length}</p>
            <p className="s">{t('v2.pacts.statFinalizedSub')}</p>
          </div>
        </div>

        {error && (
          <p style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', color: 'var(--p-err)', fontSize: 13 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '28px 0 14px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['all', 'active', 'pending', 'mine'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                disabled={f === 'mine' && !publicKey}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                style={{
                  fontFamily: "'Inter',sans-serif",
                  borderRadius: 99,
                  cursor: f === 'mine' && !publicKey ? 'default' : 'pointer',
                  opacity: f === 'mine' && !publicKey ? 0.45 : 1,
                  minHeight: 36,
                  fontSize: 12,
                  fontWeight: filter === f ? 700 : 550,
                  padding: filter === f ? '8px 16px' : '8px 14px',
                  border: `1px solid ${filter === f ? 'var(--p-accent)' : 'var(--p-line)'}`,
                  background: filter === f ? 'var(--p-accent-soft)' : 'transparent',
                  color: filter === f ? 'var(--p-accent)' : 'var(--p-ink2)',
                }}
              >
                {t(f === 'all' ? 'pacts.filterAll' : f === 'active' ? 'pacts.filterActive' : f === 'pending' ? 'pacts.filterPending' : 'pacts.filterMine')}
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

        {(view === 'list' || view === 'table') && (
          <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'hidden', boxShadow: 'var(--p-shadow)' }}>
            {view === 'table' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--p-line)' }}>
                    {[t('v2.dashboard.thPact'), t('v2.dashboard.thStatus'), t('v2.dashboard.thVault'), t('v2.dashboard.kMembers')].map((h) => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, letterSpacing: 0.1, textTransform: 'uppercase', color: 'var(--p-ink3)', padding: '12px 16px', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
              </table>
            )}
            {paged.slice.map((p) => {
              const isOpen = p.status !== 'active';
              return (
                <PactListRow
                  key={p.pda.toBase58()}
                  seed={p.pda.toBase58()}
                  logo={media.get(p.pda.toBase58())?.logoUrl}
                  title={p.title}
                  meta={`${formatAddress(p.creator.toBase58())} · ${p.members.length} ${t('marketplaceCard.members')}`}
                  figure={p.status === 'active' ? `${formatSol(p.vaultBalanceSol)} SOL` : undefined}
                  pill={<span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('pacts.filterPending') : t('pacts.filterActive')}</span>}
                  href={`#/pact/${p.pda.toBase58()}`}
                />
              );
            })}
          </div>
        )}

        {(view === 'large' || view === 'small') && (
          <div style={{ display: 'grid', gap: view === 'small' ? 10 : 14, gridTemplateColumns: '1fr 1fr' }}>
            {paged.slice.map((p) => {
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
                  pill={<span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('v2.pacts.pillOpen') : t('v2.pacts.pillFunds')}</span>}
                  description={displayPitchShort(p.description, 130)}
                  kv={[
                    { k: t('v2.dashboard.thVault'), v: p.status === 'active' ? `${formatSol(p.vaultBalanceSol)} SOL` : '—' },
                    { k: t('v2.dashboard.kMembers'), v: String(p.members.length) },
                  ]}
                  actions={<a className="p-btn primary" href={`#/pact/${p.pda.toBase58()}`}>{t('v2.pacts.managePact')}</a>}
                />
              );
            })}
          </div>
        )}

        <div style={{ display: paged.pageCount <= 1 ? 'none' : 'flex', gap: 5, justifyContent: 'center', marginTop: 18 }}>
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
