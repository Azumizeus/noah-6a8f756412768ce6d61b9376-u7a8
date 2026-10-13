// src/pages/NetworkPage.tsx
// ═══════════════════════════════════════════════════════════════════
// Réseau Builders — assemble le composeur, le feed et les cartes.
//
// C'est CETTE page qui porte tout le chargement annexe, pas PostCard :
// les profils auteurs, les titres des pacts référencés, les compteurs et
// les réactions du wallet connecté sont chargés PAR LOT pour la page
// entière. Laisser chaque carte faire ses propres appels aurait ramené
// le N+1 que fetchPostCounts() sert justement à éviter.
//
// ⚠️ Seul RankBadge fait encore un appel par instance (choix documenté
// dans son en-tête). Si le feed devient long, c'est le premier endroit à
// convertir en chargement groupé.
//
// ⚠️ Les titres de pacts passent par filterVisiblePacts() : un post peut
// référencer un pact masqué depuis (liste noire de hiddenPacts.ts). Sans
// ce filtre, la carte réafficherait le titre d'un pact de test — la
// puce n'est rendue que si le titre est résolu, donc filtrer ici suffit
// à la faire disparaître.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import EmptyState from '../components/EmptyState';
import PostComposer from '../components/PostComposer';
import PostCard from '../components/PostCard';
import type { NetworkPost } from '../lib/network';
import { fetchNetworkFeed, fetchPostCounts, fetchMyReactions } from '../lib/network';
import { fetchProfilesByWallets } from '../lib/profileRemote';
import type { BuilderProfile } from '../lib/profile';
import { filterVisiblePacts } from '../lib/hiddenPacts';
import { useProjects } from '../hooks/useProjects';
import { useLanguage } from '../lib/i18n/LanguageContext';

const PAGE_SIZE = 20;

type Counts = Map<number, { reactions: number; comments: number }>;

export default function NetworkPage() {
  const { t } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const myWallet = publicKey?.toBase58() ?? null;
  const { pacts } = useProjects();

  const [posts, setPosts] = useState<NetworkPost[] | null>(null);
  const [profiles, setProfiles] = useState<Map<string, BuilderProfile>>(new Map());
  const [counts, setCounts] = useState<Counts>(new Map());
  const [myReactions, setMyReactions] = useState<Set<number>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  // `false` dès qu'une page revient incomplète : inutile de proposer
  // « charger plus » pour un aller-retour qui ne rendra rien.
  const [hasMore, setHasMore] = useState(true);

  // Titre par PDA, liste noire appliquée — voir en-tête.
  const pactTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of filterVisiblePacts(pacts, (x) => x.pda)) {
      map.set(p.pda.toBase58(), p.title);
    }
    return map;
  }, [pacts]);

  /** Charge en une passe tout ce qui accompagne un lot de posts. */
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

  // Premier chargement — relancé si le wallet change, parce que l'état
  // « déjà encouragé » est propre au wallet connecté.
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
    // Insertion optimiste en tête : le post revient déjà complet de
    // createPost(), pas besoin de recharger tout le feed.
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
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-6 sm:mb-8">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">
            {t('network.eyebrow')}
          </p>
          <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('network.titleLine1')}{' '}
            <span className="text-accent-violet">{t('network.titleLine2')}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">{t('network.subtitle')}</p>
        </header>
      </FadeInUp>

      <FadeInUp>
        <div className="mb-6">
          <PostComposer myWallet={myWallet} signMessage={signMessage} onPosted={handlePosted} />
        </div>
      </FadeInUp>

      {posts === null ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-panel h-40 animate-pulse rounded-2xl" aria-hidden="true" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <FadeInUp>
          <EmptyState title={t('network.feedEmpty')} description={t('network.subtitle')} />
        </FadeInUp>
      ) : (
        <>
          <section aria-label={t('network.titleLine2')} className="space-y-4">
            {posts.map((post) => (
              <FadeInUp key={post.id}>
                <PostCard
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
              </FadeInUp>
            ))}
          </section>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full border border-white/10 px-5 py-2 text-sm text-ink-300 transition hover:border-white/20 hover:text-white disabled:opacity-50"
              >
                {loadingMore ? t('common.loading') : t('network.loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
