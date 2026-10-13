// src/pages/premium/PremiumTreasury.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — Treasury, habillage tokens clairs sur les MÊMES données
// réelles que /treasury legacy (hook useTreasury) : TVL, sorties
// récentes, claims en attente, flux on-chain.
//
// L'export CSV/JSON est désormais NATIF ici (08/10/2026) : c'était la seule
// fonction du legacy que le premium déléguait encore, ce qui faisait du lien
// 'Historique ↗' une dépendance et non un ornement. Il ne reste au legacy que
// le rendu 'audit' de l'historique complet.
// ═══════════════════════════════════════════════════════════════════
import { formatSol } from '../../lib/pacts';
import { useTreasury } from '../../hooks/useProjects';
import { downloadTreasuryCsv, downloadTreasuryJson } from '../../lib/exportTreasury';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
import '../../styles/premium.css';

export default function PremiumTreasury() {
  const { t } = useLanguage();
  const { totalValueLockedSol, distributedRecentSol, pendingClaimsSol, flows, loading, error } = useTreasury();

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/treasury" />

        <p className="p-eyebrow">{t('treasury.eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, marginTop: 10 }}>
          {t('treasury.titleLine1')}{' '}
          <span style={{ color: 'var(--p-accent)' }}>{t('treasury.titleLine2')}</span>
        </h1>

        {/* Stats réelles — mêmes sources que la page historique */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginTop: 24 }}>
          <div className="p-stat hero">
            <p className="k">{t('treasury.statTvlLabel')}</p>
            <p className="v">{totalValueLockedSol.toFixed(4)} <small>SOL</small></p>
            <p className="s">{t('treasury.statTvlSublabel')}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('treasury.statDistributedLabel')}</p>
            <p className="v">{distributedRecentSol.toFixed(4)} <small>SOL</small></p>
            <p className="s">{t('treasury.statDistributedSublabel')}</p>
          </div>
          <div className="p-stat">
            <p className="k">{t('treasury.statPendingLabel')}</p>
            <p className="v">{pendingClaimsSol.toFixed(4)} <small>SOL</small></p>
            <p className="s">{t('treasury.statPendingSublabel')}</p>
          </div>
        </div>

        {error && (
          <p style={{ marginTop: 18, padding: '13px 16px', borderRadius: 12, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', color: 'var(--p-err)', fontSize: 13 }}>
            {error}
          </p>
        )}

        {/* Flux récents — vraies entrées on-chain (pact_events) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '34px 0 12px' }}>
          <h2 style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--p-ink3)', margin: 0 }}>
            {t('treasury.recentFlows')}
          </h2>
          {!loading && flows.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="p-btn ghost"
                style={{ flex: 'none', padding: '0 14px', minHeight: 34, fontSize: 12 }}
                onClick={() => downloadTreasuryCsv(flows)}
              >
                {t('treasury.exportCsv')}
              </button>
              <button
                type="button"
                className="p-btn ghost"
                style={{ flex: 'none', padding: '0 14px', minHeight: 34, fontSize: 12 }}
                onClick={() => downloadTreasuryJson(flows, { totalValueLockedSol, distributedRecentSol, pendingClaimsSol })}
              >
                {t('treasury.exportJson')}
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div style={{ height: 190, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)' }} aria-hidden="true" />
        ) : flows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '42px 24px', background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)' }}>
            <p style={{ fontSize: 13, color: 'var(--p-ink3)' }}>{t('treasury.emptyFlows')}</p>
          </div>
        ) : (
          <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'hidden', boxShadow: 'var(--p-shadow)' }}>
            {flows.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--p-line)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 99,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 800,
                    background: f.amountSol >= 0 ? 'var(--p-ok-soft)' : 'var(--p-warn-soft)',
                    color: f.amountSol >= 0 ? 'var(--p-ok)' : 'var(--p-warn)',
                  }}
                >
                  {f.amountSol >= 0 ? '+' : '−'}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--p-ink)' }}>{f.projectTitle}</b>
                  <span style={{ fontSize: 11, color: 'var(--p-ink3)' }}>{f.label}{f.when ? ' · ' + new Date(f.when * 1000).toLocaleTimeString() : ''}</span>
                </div>
                <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, fontWeight: 650, fontVariantNumeric: 'tabular-nums', color: 'var(--p-ink)' }}>
                  {f.amountSol >= 0 ? '+' : '−'}{Math.abs(f.amountSol).toFixed(4)} SOL
                </span>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 10.5, color: 'var(--p-ink3)', marginTop: 10, textAlign: 'center' }}>
          {t('v2.treasury.footnote', { amount: formatSol(totalValueLockedSol) })}
        </p>
      </div>
    </div>
  );
}
