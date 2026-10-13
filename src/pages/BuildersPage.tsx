// src/pages/BuildersPage.tsx
// ═══════════════════════════════════════════════════════════════════
// Annuaire des builders : tous les profils enregistrés, avec un bouton
// "Contacter" sur ceux marqués disponibles (voir lib/contact.ts).
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import EmptyState from '../components/EmptyState';
import { useListingView } from '../hooks/useListingView';
import { ViewToggle, NumberedPagination, usePagedSlice } from '../components/ListControls';
import PactListRow from '../components/PactListRow';
import ContactModal from '../components/ContactModal';
import BuilderDetailModal from '../components/BuilderDetailModal';
import StarRating from '../components/StarRating';
import { listAllProfiles } from '../lib/profileRemote';
import type { BuilderProfile } from '../lib/profile';
import { AVAILABILITY_META, SKILL_LEVEL_META } from '../lib/profile';
import { ALL_ROLES } from '../lib/roles';
import { formatAddress } from '../lib/pacts';
import { fetchRatingSummaries, submitRating } from '../lib/contact';
import type { RatingSummary } from '../lib/contact';
import { useLanguage } from '../lib/i18n/LanguageContext';

function roleLabel(id: string): string {
  return ALL_ROLES.find((r) => r.id === id)?.label ?? id;
}

// Recherche insensible aux accents (ex: "developpeur" doit trouver
// "Développeur") ET à la casse — avant, "rust dev" ne trouvait rien si
// l'utilisateur tapait "développeur rust" avec accent, et la bio du profil
// n'était pas cherchée du tout.
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function BuildersPage() {
  const { t } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const myAddr = publicKey?.toBase58();
  const [profiles, setProfiles] = useState<BuilderProfile[] | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [query, setQuery] = useState('');
  const [contactTarget, setContactTarget] = useState<BuilderProfile | null>(null);
  const [detailTarget, setDetailTarget] = useState<BuilderProfile | null>(null);
  const [ratings, setRatings] = useState<Map<string, RatingSummary>>(new Map());
  const [ratingBusy, setRatingBusy] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listAllProfiles();
      if (cancelled) return;
      setProfiles(list);
      const summaries = await fetchRatingSummaries(list.map((p) => p.wallet));
      if (!cancelled) setRatings(summaries);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRate = async (toWallet: string, stars: number) => {
    if (!myAddr || !signMessage) { setRatingError(t('errors.signMessageUnsupported')); return; }
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

  const visible = useMemo(() => {
    if (!profiles) return [];
    const q = normalize(query.trim());
    return profiles
      .filter((p) => p.wallet !== myAddr)
      .filter((p) => !onlyAvailable || p.availability === 'open')
      .filter((p) => {
        if (!q) return true;
        // Recherche élargie : pseudo, bio, compétences (label complet ET
        // abrégé, ex. "rustdev" ou "rust dev" doivent tous les deux
        // matcher "Rust / Anchor Dev"), et l'adresse wallet complète.
        const haystack = normalize(
          [p.pseudo, p.bio, p.wallet, ...p.skills.map((s) => roleLabel(s))].join(' ')
        );
        return haystack.includes(q);
      });
  }, [profiles, onlyAvailable, query, myAddr]);

  const [view, setView] = useListingView('builders');
  const [page, setPage] = useState(1);
  const paged = usePagedSlice(visible, page, setPage, view === 'small' ? 24 : 12, query + '|' + String(onlyAvailable));

  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-6 sm:mb-8">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">{t('builders.eyebrow')}</p>
          <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('builders.titleLine1')} <span className="text-accent-violet">{t('builders.titleLine2')}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">{t('builders.subtitle')}</p>
        </header>
      </FadeInUp>

      <FadeInUp>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('builders.searchPlaceholder')}
            className="h-11 flex-1 min-w-[200px] rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setOnlyAvailable((v) => !v)}
            aria-pressed={onlyAvailable}
            className={
              'inline-flex h-11 items-center rounded-xl border px-4 text-sm transition-colors ' +
              (onlyAvailable
                ? 'border-emerald-400/40 bg-emerald-500/15 text-white'
                : 'border-white/10 text-ink-300 hover:bg-white/5 hover:text-white')
            }
          >
            🟢 {t('builders.filterAvailable')}
          </button>
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

      {ratingError && (
        <FadeInUp>
          <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">{ratingError}</p>
        </FadeInUp>
      )}

      {profiles === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-panel h-56 animate-pulse rounded-2xl" aria-hidden="true" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <FadeInUp>
          <EmptyState
            title={t('builders.emptyTitle')}
            description={t('builders.emptyDesc')}
            ctaLabel={t('builders.emptyCta')}
            onCta={() => { window.location.hash = '#/profile'; }}
          />
        </FadeInUp>
      ) : (
        // Le branchement contient la grille + le bouton load-more : un seul
        // élément racine requis (fragment) — ce fut l'erreur tsc 2657.
        <>
        {view === 'list' ? (
          <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[.03]">
            {paged.slice.map((p) => (
              <PactListRow
                key={p.wallet}
                seed={p.wallet}
                logo={p.avatarUrl}
                title={p.pseudo}
                meta={p.skills.slice(0, 3).map((id) => roleLabel(id)).join(' · ') || formatAddress(p.wallet)}
                figure={undefined}
                pill={
                  <span
                    className={
                      'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ' +
                      (p.availability === 'open'
                        ? 'bg-emerald-400/10 text-emerald-400'
                        : 'bg-white/5 text-ink-300')
                    }
                  >
                    {AVAILABILITY_META[p.availability].emoji}
                  </span>
                }
                href={'#/builders'}
              />
            ))}
          </div>
        ) : (
        <section aria-label={t('builders.listAria')} className={
          view === 'small'
            ? 'grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
        }>
          {paged.slice.map((p) => (
            <FadeInUp key={p.wallet}>
              <article className="glass-panel flex h-full flex-col rounded-2xl border border-white/5 p-5 transition-all hover:border-accent-violet/20">
                <button
                  type="button"
                  onClick={() => setDetailTarget(p)}
                  aria-label={t('builders.viewProfile')}
                  className="mb-3 flex items-center gap-3 rounded-xl text-left transition hover:opacity-80"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg text-ink-500">
                        {p.pseudo.trim().charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-sans text-sm font-semibold text-white underline decoration-white/20 underline-offset-2">{p.pseudo}</h3>
                    <span className="inline-block rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-ink-400">
                      {AVAILABILITY_META[p.availability].emoji} {t(AVAILABILITY_META[p.availability].labelKey)}
                    </span>
                    <div className="mt-1">
                      <StarRating value={ratings.get(p.wallet)?.avgStars ?? 0} count={ratings.get(p.wallet)?.ratingCount ?? 0} />
                    </div>
                  </div>
                </button>

                {p.bio && (
                  <p className="mb-3 flex-1 text-xs leading-relaxed text-ink-300">
                    {p.bio.length > 140 ? p.bio.slice(0, 140) + '…' : p.bio}
                  </p>
                )}

                {p.skills.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {p.skills.slice(0, 5).map((id) => (
                      <span key={id} className="rounded-full border border-accent-violet/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-white">
                        {roleLabel(id)}
                        {p.skillLevels[id] && (
                          <span className="text-ink-400"> · {t(SKILL_LEVEL_META[p.skillLevels[id]].labelKey)}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <p className="mb-3 font-mono text-[10px] text-ink-500">{formatAddress(p.wallet)}</p>

                {myAddr && (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5">
                    <span className="text-[10px] text-ink-400">{t('builders.rateLabel')}</span>
                    <StarRating
                      value={0}
                      onRate={(stars) => handleRate(p.wallet, stars)}
                      disabled={ratingBusy === p.wallet}
                    />
                  </div>
                )}

                {p.availability === 'open' ? (
                  myAddr ? (
                    <button
                      type="button"
                      onClick={() => setContactTarget(p)}
                      className="mt-auto w-full rounded-lg bg-accent-violet py-2 text-xs font-medium text-ink-900 transition hover:bg-accent-violet/90"
                    >
                      {t('builders.contactButton')}
                    </button>
                  ) : (
                    <p className="mt-auto text-center text-[11px] text-ink-500">{t('builders.connectToContact')}</p>
                  )
                ) : (
                  <p className="mt-auto text-center text-[11px] text-ink-500">{t('builders.notAvailable')}</p>
                )}
              </article>
            </FadeInUp>
          ))}
        </section>
        )}
        <NumberedPagination page={paged.page} pageCount={paged.pageCount} onChange={setPage} />
        </>
      )}

      {detailTarget && (
        <BuilderDetailModal
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
        <ContactModal
          fromWallet={myAddr}
          signMessage={signMessage}
          toWallet={contactTarget.wallet}
          toPseudo={contactTarget.pseudo}
          onClose={() => setContactTarget(null)}
        />
      )}
    </DashboardLayout>
  );
}
