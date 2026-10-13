// src/pages/premium/PremiumMyDashboard.tsx
// Tableau de bord personnel (#/dashboard).
//
// L'accueil (#/) est le registre public. Le lien « Dashboard » y renvoyait,
// donc il ne changeait pas l'URL et n'ouvrait rien de distinct. Cette page
// ne montre que les pacts du wallet connecté, lus on-chain — pas de chiffre
// tant que le chargement n'est pas fini.
import { useMemo, type CSSProperties } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProjects } from '../../hooks/useProjects';
import { formatAddress, formatSol } from '../../lib/pacts';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
import '../../styles/premium.css';

export default function PremiumMyDashboard() {
  const { t } = useLanguage();
  const { publicKey } = useWallet();
  const { pacts, loading, error } = useProjects();
  const me = publicKey?.toBase58() ?? null;

  const mine = useMemo(() => {
    if (!me) return [];
    return pacts.filter(
      (p) => p.creator.toBase58() === me || p.members.some((m) => m.wallet.toBase58() === me),
    );
  }, [pacts, me]);

  const locked = useMemo(
    () => mine.reduce((sum, p) => sum + (p.status === 'active' ? p.vaultBalanceSol : 0), 0),
    [mine],
  );

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '20px 24px 96px' }}>
        <PremiumNav active="#/dashboard" />
        <p className="p-eyebrow">{t('v2.myDashboard.eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', margin: '8px 0' }}>
          {t('v2.myDashboard.titleLine1')}{' '}
          <span style={{ color: 'var(--p-accent)' }}>{t('v2.myDashboard.titleLine2')}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--p-ink2)', maxWidth: 560, lineHeight: 1.65 }}>
          {t('v2.myDashboard.subtitle')}
        </p>

        {!me && (
          <section style={panel} aria-labelledby="dash-connect-title">
            <h2 id="dash-connect-title" style={panelTitle}>{t('v2.myDashboard.connectTitle')}</h2>
            <p style={panelBody}>{t('v2.myDashboard.connectBody')}</p>
            <a className="p-btn ghost" href="#/" style={linkBtn}>{t('v2.myDashboard.browse')}</a>
          </section>
        )}

        {me && loading && (
          <p role="status" style={{ marginTop: 28, color: 'var(--p-ink2)', fontSize: 14 }}>
            {t('v2.myDashboard.loading')}
          </p>
        )}

        {me && error && (
          <p role="alert" style={{ marginTop: 18, color: 'var(--p-err)', fontSize: 13 }}>{error}</p>
        )}

        {me && !loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginTop: 22 }}>
              <div className="p-stat hero">
                <p className="k">{t('v2.myDashboard.statMine')}</p>
                <p className="v">{mine.length}</p>
              </div>
              <div className="p-stat">
                <p className="k">{t('v2.myDashboard.statVault')}</p>
                <p className="v">{formatSol(locked)} <small>SOL</small></p>
              </div>
            </div>

            {mine.length === 0 ? (
              <section style={panel} aria-labelledby="dash-empty-title">
                <h2 id="dash-empty-title" style={panelTitle}>{t('v2.myDashboard.emptyTitle')}</h2>
                <p style={panelBody}>{t('v2.myDashboard.emptyBody')}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <a className="p-btn primary" href="#/create" style={linkBtn}>{t('v2.myDashboard.create')}</a>
                  <a className="p-btn ghost" href="#/marketplace" style={linkBtn}>{t('v2.myDashboard.marketplace')}</a>
                </div>
              </section>
            ) : (
              <ul style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'grid', gap: 10 }}>
                {mine.map((p) => {
                  const creator = p.creator.toBase58() === me;
                  return (
                    <li key={p.pda.toBase58()}>
                      <a
                        href={`#/pact/${p.pda.toBase58()}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          padding: '14px 16px',
                          background: 'var(--p-canvas)',
                          border: '1px solid var(--p-line)',
                          borderRadius: 'var(--p-radius-md)',
                          textDecoration: 'none',
                          color: 'var(--p-ink)',
                        }}
                      >
                        <span>
                          <strong style={{ display: 'block' }}>{p.title}</strong>
                          <span style={{ fontSize: 12, color: 'var(--p-ink3)' }}>
                            {formatAddress(p.pda.toBase58())}
                            {' · '}
                            {creator ? t('v2.myDashboard.youCreator') : t('v2.myDashboard.youMember')}
                          </span>
                        </span>
                        <span className={'p-pill ' + (p.status === 'active' ? 'ok' : 'warn')}>
                          {p.status === 'active'
                            ? `${formatSol(p.vaultBalanceSol)} SOL`
                            : t('v2.dashboard.pillRecruiting')}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const panel: CSSProperties = {
  marginTop: 28,
  padding: '22px 20px',
  background: 'var(--p-canvas)',
  border: '1px solid var(--p-line)',
  borderRadius: 'var(--p-radius-lg)',
};

const panelTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--p-ink)',
};

const panelBody: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13.5,
  lineHeight: 1.6,
  color: 'var(--p-ink2)',
  maxWidth: 520,
};

const linkBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: 14,
  textDecoration: 'none',
  width: 'auto',
  flex: '0 0 auto',
  padding: '0 16px',
};
