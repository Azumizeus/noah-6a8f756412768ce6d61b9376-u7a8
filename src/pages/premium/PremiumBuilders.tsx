// src/pages/premium/PremiumBuilders.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — annuaire des builders : skins tokens clairs + 3 modes
// de vue (étendu / compact / liste, mobile-friendly).
//
// Famille sociale migrée depuis /v1 le 08/10 (voir PLAN-CHANTIERS-PREMIUM) :
// notation (1 → 6 étoiles), fiche détaillée, demande de contact. C'était l'un
// des « perdus » de l'inventaire : ces fonctions n'existaient QUE dans
// `BuildersPage` (legacy), donc supprimer /v1 les aurait retirées aux
// utilisateurs. Les libs ne sont pas dupliquées — `lib/contact.ts` écrit et
// lit les mêmes tables/Edge Function que le legacy, donc une note posée d'un
// côté est vue de l'autre.
//
// Deux points de conception à ne pas perdre de vue :
//   • `listAllProfiles()` renvoie `[]` aussi bien quand l'annuaire est VIDE
//     que quand la base est INJOIGNABLE. Cette page passe donc par
//     `listAllProfilesResult()` et affiche l'erreur : « 0 builder » et
//     « annuaire indisponible » ne sont pas la même chose pour l'utilisateur.
//   • la notation exige une signature du wallet (`submitRating`) — impossible
//     de noter en se faisant passer pour quelqu'un d'autre. Sans wallet
//     connecté, le widget n'est simplement pas proposé.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ALL_ROLES } from '../../lib/roles';
import { AVAILABILITY_META, SKILL_LEVEL_META, type BuilderProfile } from '../../lib/profile';
import { listAllProfilesResult } from '../../lib/profileRemote';
import { fetchRatingSummaries, submitRating, type RatingSummary } from '../../lib/contact';
import { useListingView } from '../../hooks/useListingView';
import { ViewToggle, usePagedSlice } from '../../components/ListControls';
import { formatAddress } from '../../lib/pacts';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
import PremiumStarRating from './PremiumStarRating';
import PremiumBuilderDetail from './PremiumBuilderDetail';
import PremiumContactDialog from './PremiumContactDialog';
import '../../styles/premium.css';

function roleLabel(id: string): string {
  return ALL_ROLES.find((r) => r.id === id)?.label ?? id;
}

export default function PremiumBuilders() {
  const { t } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const myAddr = publicKey?.toBase58();

  const [profiles, setProfiles] = useState<BuilderProfile[] | null>(null);
  // Non nul quand la lecture distante a échoué — `profiles` vaut alors `[]`,
  // mais l'écran le dit au lieu de laisser croire à un annuaire vide.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Map<string, RatingSummary>>(new Map());
  const [ratingBusy, setRatingBusy] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [contactTarget, setContactTarget] = useState<BuilderProfile | null>(null);
  const [detailTarget, setDetailTarget] = useState<BuilderProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listAllProfilesResult();
      if (cancelled) return;
      if ('error' in r) {
        setLoadError(t('builders.remoteOffline'));
        setProfiles([]);
        return;
      }
      setLoadError(null);
      setProfiles(r.profiles);
      // Notes lues après la liste : un résumé indisponible ne doit pas
      // empêcher l'annuaire de s'afficher, il laisse simplement les étoiles
      // vides (fetchRatingSummaries renvoie une map vide en cas d'échec).
      const summaries = await fetchRatingSummaries(r.profiles.map((p) => p.wallet));
      if (!cancelled) setRatings(summaries);
    })();
    return () => { cancelled = true; };
  }, [t]);

  const handleRate = async (toWallet: string, stars: number) => {
    if (!myAddr || !signMessage) {
      setRatingError(t('errors.signMessageUnsupported'));
      return;
    }
    setRatingBusy(toWallet);
    setRatingError(null);
    const r = await submitRating({ fromWallet: myAddr, signMessage, toWallet, stars });
    setRatingBusy(null);
    if ('error' in r) {
      setRatingError(r.error);
      return;
    }
    // Rafraîchit juste la moyenne de ce builder (pas besoin de tout recharger).
    const updated = await fetchRatingSummaries([toWallet]);
    setRatings((prev) => new Map(prev).set(toWallet, updated.get(toWallet) ?? { avgStars: stars, ratingCount: 1 }));
  };

  const [view, setView] = useListingView('v2-builders');
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(profiles ?? [], page, setPage, view === 'list' ? 8 : 12, 'v2');

  const meta = useMemo(
    () => ({
      eyebrow: t('builders.eyebrow'),
      title: `${t('builders.titleLine1')} ${t('builders.titleLine2')}`,
      subtitle: t('builders.subtitle'),
    }),
    [t]
  );

  /** Barre d'actions sociales d'une carte — repliée quand rien n'est possible.
   *  Fonction de rendu, pas un composant : un composant déclaré ici serait
   *  recréé à chaque rendu, donc remonté, et l'état de survol des étoiles
   *  se réinitialiserait sous le curseur. */
  const socialRow = (p: BuilderProfile) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
      {myAddr ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--p-ink3)' }}>
          {t('builders.rateLabel')}
          <PremiumStarRating value={0} onRate={(stars) => handleRate(p.wallet, stars)} disabled={ratingBusy === p.wallet} />
        </span>
      ) : (
        <span />
      )}
      {p.availability === 'open' &&
        (myAddr ? (
          <button type="button" className="p-btn primary" onClick={() => setContactTarget(p)} style={{ fontSize: 11.5, padding: '7px 12px' }}>
            {t('builders.contactButton')}
          </button>
        ) : (
          <span style={{ fontSize: 10.5, color: 'var(--p-ink3)' }}>{t('builders.connectToContact')}</span>
        ))}
    </div>
  );

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/builders" />

        <p className="p-eyebrow">{meta.eyebrow}</p>
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 8 }}>
          {meta.title}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--p-ink2)', marginTop: 10, maxWidth: 520, lineHeight: 1.65 }}>
          {meta.subtitle}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', margin: '26px 0 14px', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--p-ink)' }}>
            {profiles ? `${profiles.length} builder${profiles.length > 1 ? 's' : ''}` : '…'}
          </h2>
          <ViewToggle
            view={view}
            onChange={setView}
            largeViewLabel={t('common.viewLarge')}
            smallViewLabel={t('common.viewSmall')}
            listViewLabel={t('common.viewList')}
            ariaLabel={t('common.viewAria')}
          />
        </div>

        {/* L'annuaire est INJOIGNABLE — ce n'est pas « aucun builder ». */}
        {loadError && (
          <p
            role="alert"
            style={{
              margin: '0 0 14px',
              padding: '11px 14px',
              fontSize: 12.5,
              lineHeight: 1.6,
              color: 'var(--p-err)',
              background: 'var(--p-canvas)',
              border: '1px solid var(--p-err)',
              borderRadius: 'var(--p-radius-xs)',
            }}
          >
            {loadError}
          </p>
        )}

        {/* L'annuaire est joignable mais réellement vide. */}
        {profiles !== null && !loadError && profiles.length === 0 && (
          <p
            style={{
              margin: '0 0 14px',
              padding: '11px 14px',
              fontSize: 12.5,
              color: 'var(--p-ink3)',
              background: 'var(--p-canvas)',
              border: '1px solid var(--p-line)',
              borderRadius: 'var(--p-radius-xs)',
            }}
          >
            {t('builders.emptyDirectory')}
          </p>
        )}

        {ratingError && (
          <p role="alert" style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--p-err)' }}>{ratingError}</p>
        )}

        {profiles === null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 220, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', margin: 0 }} aria-hidden="true" />
            ))}
          </div>
        )}

        {profiles !== null && view !== 'list' && (
          <div style={{ display: 'grid', gap: view === 'small' ? 10 : 16, gridTemplateColumns: view === 'small' ? 'repeat(auto-fill,minmax(220px,1fr))' : '1fr 1fr' }}>
            {paged.slice.map((p) => (
              <article key={p.wallet} className="p-card">
                <div className="body">
                  <button
                    type="button"
                    onClick={() => setDetailTarget(p)}
                    aria-label={t('builders.viewProfile')}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" style={{ width: 46, height: 46, borderRadius: 99, border: '1px solid var(--p-line)', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ width: 46, height: 46, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'var(--p-accent-soft)', color: 'var(--p-accent)', fontWeight: 800 }}>
                        {p.pseudo.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--p-ink)' }}>{p.pseudo}</b>
                      <span style={{ fontSize: 10.5, color: 'var(--p-ink3)' }}>
                        {formatAddress(p.wallet)}
                      </span>
                      <div style={{ marginTop: 3 }}>
                        <PremiumStarRating value={ratings.get(p.wallet)?.avgStars ?? 0} count={ratings.get(p.wallet)?.ratingCount ?? 0} />
                      </div>
                    </div>
                    <span className={'p-pill ' + (p.availability === 'open' ? 'ok' : '')} style={p.availability !== 'open' ? { background: 'var(--p-bg)', color: 'var(--p-ink3)' } : undefined}>
                      {AVAILABILITY_META[p.availability].emoji}
                    </span>
                  </button>
                  {p.bio && <p className="desc">{p.bio.length > 120 ? p.bio.slice(0, 120) + '…' : p.bio}</p>}
                  {p.skills.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {p.skills.slice(0, 4).map((id) => (
                        <span key={id} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--p-ink2)', border: '1px solid var(--p-line)', borderRadius: 99, padding: '3px 9px' }}>
                          {roleLabel(id)}
                          {p.skillLevels[id] && <span style={{ color: 'var(--p-ink3)' }}> · {t(SKILL_LEVEL_META[p.skillLevels[id]].labelKey)}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {socialRow(p)}
                </div>
              </article>
            ))}
          </div>
        )}

        {profiles !== null && view === 'list' && (
          <div style={{ background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'hidden', boxShadow: 'var(--p-shadow)' }}>
            {paged.slice.map((p) => (
              <div
                key={p.wallet}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--p-line)' }}
              >
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: 99, objectFit: 'cover' }} />
                ) : (
                  <span style={{ width: 34, height: 34, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'var(--p-accent-soft)', color: 'var(--p-accent)', fontWeight: 800, flexShrink: 0 }}>
                    {p.pseudo.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: 'block', fontSize: 13.5, fontWeight: 650 }}>{p.pseudo}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--p-ink3)' }}>
                    {p.skills.slice(0, 3).map((id) => roleLabel(id)).join(' · ') || formatAddress(p.wallet)}
                  </span>
                </div>
                <PremiumStarRating value={ratings.get(p.wallet)?.avgStars ?? 0} count={ratings.get(p.wallet)?.ratingCount ?? 0} />
                <button
                  type="button"
                  className="p-btn ghost"
                  onClick={() => setDetailTarget(p)}
                  style={{ fontSize: 11, padding: '6px 10px', flexShrink: 0 }}
                >
                  {t('builders.viewProfile')}
                </button>
                <span className={'p-pill ' + (p.availability === 'open' ? 'ok' : '')} style={p.availability !== 'open' ? { background: 'var(--p-bg)', color: 'var(--p-ink3)' } : undefined}>
                  {AVAILABILITY_META[p.availability].emoji} {t(AVAILABILITY_META[p.availability].labelKey)}
                </span>
                {myAddr && p.availability === 'open' && (
                  <button
                    type="button"
                    className="p-btn primary"
                    onClick={() => setContactTarget(p)}
                    style={{ fontSize: 11, padding: '6px 10px', flexShrink: 0 }}
                  >
                    {t('builders.contactButton')}
                  </button>
                )}
              </div>
            ))}
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

        {detailTarget && (
          <PremiumBuilderDetail
            profile={detailTarget}
            rating={ratings.get(detailTarget.wallet)}
            canContact={Boolean(myAddr)}
            onClose={() => setDetailTarget(null)}
            onContact={() => {
              setContactTarget(detailTarget);
              setDetailTarget(null);
            }}
          />
        )}

        {contactTarget && myAddr && (
          <PremiumContactDialog
            fromWallet={myAddr}
            signMessage={signMessage}
            toWallet={contactTarget.wallet}
            toPseudo={contactTarget.pseudo}
            onClose={() => setContactTarget(null)}
          />
        )}
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
