// src/pages/premium/PremiumMyDashboard.tsx
// Tableau de bord personnel (#/dashboard).
//
// L'accueil (#/) est le registre public. Le lien « Dashboard » y renvoyait,
// donc il ne changeait pas l'URL et n'ouvrait rien de distinct. Cette page
// ne montre que les pacts du wallet connecté, lus on-chain — pas de chiffre
// tant que le chargement n'est pas fini.
//
// 20/10 : la liste était une simple <ul> (titre + adresse + pastille) —
// aucune description, aucun moyen de changer la densité de lecture. Elle
// utilise désormais EXACTEMENT les mêmes quatre vues que le Marketplace
// (grandes cartes / petites cartes / liste dense / tableau), via les mêmes
// composants (ViewToggle, PremiumProjectCard, PactListRow) : un pact se lit
// de la même façon partout, et le dashboard affiche enfin le pitch.
import { useMemo, useState, type CSSProperties } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProjects } from '../../hooks/useProjects';
import { useProjectMedia } from '../../hooks/useProjectMedia';
import { useListingView } from '../../hooks/useListingView';
import { ViewToggle, NumberedPagination, usePagedSlice } from '../../components/ListControls';
import { formatAddress, formatSol } from '../../lib/pacts';
import { parsePitch, stageBadgeLabel } from '../../lib/pitch';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PactListRow from '../../components/PactListRow';
import PremiumNav from './PremiumNav';
import PremiumProjectCard from './PremiumProjectCard';
import '../../styles/premium.css';

export default function PremiumMyDashboard() {
  const { t, lang } = useLanguage();
  const { publicKey } = useWallet();
  const { pacts, loading, error } = useProjects();
  const { media } = useProjectMedia();
  const me = publicKey?.toBase58() ?? null;


  // Présentation longue hors chaîne (FR/EN) — `project_media.about_text`.
  // Elle existait déjà mais n'était lue que par les pages legacy /v1 ; les
  // cartes premium montraient le pitch on-chain, parfois tronqué en plein
  // milieu d'un mot par les anciens builds (280/500 octets). 21/10 : on
  // affiche le texte long quand il existe, le pitch on-chain sinon.
  const aboutForLang = (pda: string) => {
    const m = media.get(pda);
    return lang === 'en' ? m?.aboutTextEn || m?.aboutText : m?.aboutText || m?.aboutTextEn;
  };

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

  // Même convention que le Marketplace : le choix de vue est persisté par
  // page (clé localStorage propre au dashboard).
  const [view, setView] = useListingView('v2-dashboard');
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(mine, page, setPage, view === 'list' || view === 'table' ? 8 : 12, view);

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
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 26, marginBottom: 14 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>
                    {t('v2.myDashboard.myProjectsHeading')}
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

                {/* VUE LISTE DENSE */}
                {view === 'list' && (
                  <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'hidden', boxShadow: 'var(--p-shadow)' }}>
                    {paged.slice.map((p) => {
                      const isOpen = p.status !== 'active';
                      const totalBps = p.members.reduce((sum, m) => sum + m.shareBps, 0);
                      const creator = p.creator.toBase58() === me;
                      return (
                        <PactListRow
                          key={p.pda.toBase58()}
                          seed={p.pda.toBase58()}
                          logo={media.get(p.pda.toBase58())?.logoUrl}
                          title={p.title}
                          meta={`${creator ? t('v2.myDashboard.youCreator') : t('v2.myDashboard.youMember')} · ${formatAddress(p.pda.toBase58())} · ${p.members.length} ${t('marketplaceCard.members')}`}
                          figure={isOpen ? `${Math.max(0, 100 - Math.round(totalBps / 100))} %` : `${formatSol(p.vaultBalanceSol)} SOL`}
                          pill={<span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('marketplaceCard.recruiting') : t('marketplaceCard.funding')}</span>}
                          href={`#/pact/${p.pda.toBase58()}`}
                        />
                      );
                    })}
                  </div>
                )}

                {/* VUE TABLEAU */}
                {view === 'table' && (
                  <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'auto', boxShadow: 'var(--p-shadow)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--p-line)' }}>
                          {[t('v2.dashboard.thPact'), t('v2.dashboard.thStatus'), t('v2.dashboard.thVault'), t('v2.dashboard.kMembers'), t('v2.myDashboard.youMember')].map((h) => (
                            <th key={h} style={{ textAlign: 'left', fontSize: 10, letterSpacing: 0.1, textTransform: 'uppercase', color: 'var(--p-ink3)', padding: '12px 16px', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paged.slice.map((p) => {
                          const isOpen = p.status !== 'active';
                          const creator = p.creator.toBase58() === me;
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
                              <td style={{ padding: '12px 16px', fontSize: 11.5, color: 'var(--p-ink2)' }}>{creator ? t('v2.myDashboard.youCreator') : t('v2.myDashboard.youMember')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* VUE CARTES */}
                {(view === 'large' || view === 'small') && (
                  <div style={{ display: 'grid', gap: view === 'small' ? 10 : 16, gridTemplateColumns: view === 'small' ? 'repeat(auto-fill,minmax(250px,1fr))' : '1fr 1fr' }}>
                    {paged.slice.map((p) => {
                      const parsed = parsePitch(p.description);
                      const totalBps = p.members.reduce((sum, m) => sum + m.shareBps, 0);
                      const entry = media.get(p.pda.toBase58());
                      const isOpen = p.status !== 'active';
                      const creator = p.creator.toBase58() === me;
                      return (
                        <PremiumProjectCard
                          key={p.pda.toBase58()}
                          title={p.title}
                          bannerUrl={entry?.bannerUrl}
                          logoUrl={entry?.logoUrl}
                          size={view === 'small' ? 'small' : 'large'}
                          isOpen={isOpen}
                          pill={<span className={'p-pill ' + (isOpen ? 'warn' : 'ok')}>{isOpen ? t('marketplaceCard.recruiting') : t('marketplaceCard.funding')}</span>}
                          description={aboutForLang(p.pda.toBase58()) || parsed.pitch}
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
                          legend={<>{creator ? t('v2.myDashboard.youCreator') : t('v2.myDashboard.youMember')}</>}
                          actions={
                            <a className="p-btn ghost" href={`#/pact/${p.pda.toBase58()}`}>{t('marketplaceCard.viewSheet')}</a>
                          }
                        />
                      );
                    })}
                  </div>
                )}

                <NumberedPagination page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
              </>
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
