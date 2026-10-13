// src/pages/premium/PremiumNetwork.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — onglet Réseau : feed transverse des builders.
// Réutilise PostComposer + PostCard tels quels (mêmes composants rodés
// que #/network : hydration par lot, réactions signées, commentaires à
// la demande). Le shell premium habille l'en-tête ; les cartes gardent
// leur habillage historique — même compromis assumé que ChatBox /
// VaultPanel sur #/v2/pact.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import PostComposer from '../../components/PostComposer';
import PostCard from '../../components/PostCard';
import EmptyState from '../../components/EmptyState';
import PremiumNav from './PremiumNav';
import type { NetworkPost } from '../../lib/network';
import { fetchNetworkFeed, fetchPostCounts, fetchMyReactions } from '../../lib/network';
import { fetchProfilesByWallets } from '../../lib/profileRemote';
import type { BuilderProfile } from '../../lib/profile';
import { filterVisiblePacts } from '../../lib/hiddenPacts';
import { useProjects } from '../../hooks/useProjects';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import '../../styles/premium.css';

const PAGE_SIZE = 20;
type Counts = Map<number, { reactions: number; comments: number }>;

export default function PremiumNetwork() {
  const { t } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const myWallet = publicKey?.toBase58() ?? null;
  const { pacts } = useProjects();

  const [posts, setPosts] = useState<NetworkPost[] | null>(null);
  const [profiles, setProfiles] = useState<Map<string, BuilderProfile>>(new Map());
  const [counts, setCounts] = useState<Counts>(new Map());
  const [myReactions, setMyReactions] = useState<Set<number>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Titres par PDA — liste noire appliquée (même règle que NetworkPage).
  const pactTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of filterVisiblePacts(pacts, (x) => x.pda)) {
      map.set(p.pda.toBase58(), p.title);
    }
    return map;
  }, [pacts]);

  /** Charge en une passe profils / compteurs / réactions du wallet. */
  const hydrate = useCallback(
    async (batch: NetworkPost[]) => {
      if (batch.length === 0) return;
      const ids = batch.map((p) => p.id);
      const wallets = batch.map((p) => p.authorWallet);
      const [freshProfiles, freshCounts, reacted] = await Promise.all([
        fetchProfilesByWallets(wallets),
        fetchPostCounts(ids),
        myWallet ? fetchMyReactions(myWallet, ids) : Promise.resolve(new Set<number>()),
      ]);
      setProfiles((prev) => {
        const next = new Map(prev);
        for (const [w, p] of freshProfiles) next.set(w, p);
        return next;
      });
      setCounts((prev) => {
        const next = new Map(prev);
        for (const [id, c] of freshCounts) next.set(id, c);
        return next;
      });
      setMyReactions((prev) => {
        const next = new Set(prev);
        for (const id of reacted) next.add(id);
        return next;
      });
    },
    [myWallet]
  );

  // Premier chargement — relancé si le wallet change (état « encouragé »
  // propre au wallet connecté).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const batch = await fetchNetworkFeed(undefined, PAGE_SIZE);
      if (cancelled) return;
      setPosts(batch);
      setHasMore(batch.length === PAGE_SIZE);
      await hydrate(batch);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  useEffect(() => {
    document.title = 'BuildPact — Réseau (v2)';
  }, []);

  async function loadMore() {
    if (!posts || posts.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const oldest = posts[posts.length - 1].createdAt;
    const batch = await fetchNetworkFeed(oldest, PAGE_SIZE);
    setPosts((prev) => [...(prev ?? []), ...batch]);
    setHasMore(batch.length === PAGE_SIZE);
    setLoadingMore(false);
    await hydrate(batch);
  }

  function handlePosted(post: NetworkPost) {
    // Insertion optimiste en tête — createPost() renvoie déjà le post complet.
    setPosts((prev) => [post, ...(prev ?? [])]);
    setCounts((prev) => new Map(prev).set(post.id, { reactions: 0, comments: 0 }));
  }

  function handleReactionChange(postId: number, reacted: boolean) {
    setMyReactions((prev) => {
      const next = new Set(prev);
      if (reacted) next.add(postId);
      else next.delete(postId);
      return next;
    });
  }

  function handleDeleted(postId: number) {
    setPosts((prev) => (prev ?? []).filter((p) => p.id !== postId));
  }

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/network" />

        <p className="p-eyebrow">{t('network.eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 8 }}>
          {t('network.titleLine1')}{' '}
          <span style={{ color: 'var(--p-accent)' }}>{t('network.titleLine2')}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--p-ink2)', marginTop: 10, maxWidth: 540, lineHeight: 1.65 }}>
          {t('network.subtitle')}
        </p>

        {/* Composeur — composant legacy réutilisé tel quel */}
        <div style={{ marginTop: 22 }}>
          <PostComposer myWallet={myWallet} signMessage={signMessage} onPosted={handlePosted} />
        </div>

        {posts === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{ height: 160, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)' }}
                aria-hidden="true"
              />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div style={{ marginTop: 18 }}>
            <EmptyState title={t('network.feedEmpty')} description={t('network.subtitle')} />
          </div>
        ) : (
          <>
            <section aria-label={t('network.titleLine2')} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  authorProfile={profiles.get(post.authorWallet) ?? null}
                  linkedPactTitle={
                    post.linkedProjectPda ? pactTitles.get(post.linkedProjectPda) ?? null : null
                  }
                  counts={counts.get(post.id) ?? { reactions: 0, comments: 0 }}
                  reacted={myReactions.has(post.id)}
                  myWallet={myWallet}
                  signMessage={signMessage}
                  onReactionChange={handleReactionChange}
                  onDeleted={handleDeleted}
                />
              ))}
            </section>

            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    borderRadius: 99,
                    border: '1px solid var(--p-line)',
                    background: 'var(--p-canvas)',
                    color: 'var(--p-ink2)',
                    fontFamily: "'Inter',sans-serif",
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: '10px 20px',
                    minHeight: 38,
                    cursor: loadingMore ? 'default' : 'pointer',
                    opacity: loadingMore ? 0.5 : 1,
                  }}
                >
                  {loadingMore ? t('common.loading') : t('network.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
