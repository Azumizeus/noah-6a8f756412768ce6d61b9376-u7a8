// src/components/PostCard.tsx
// ═══════════════════════════════════════════════════════════════════
// Un post du Réseau Builders : auteur + rang, texte, image optionnelle,
// pact référencé optionnel, encouragements, commentaires (chargés à la
// demande — pas de N+1 au premier rendu du feed).
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import type { NetworkPost, NetworkComment, SignMessageFn } from '../lib/network';
import {
  fetchComments,
  commentOnPost,
  toggleReaction,
  deletePost,
  MAX_COMMENT_BODY,
} from '../lib/network';
import type { BuilderProfile } from '../lib/profile';
import RankBadge from './RankBadge';
import { formatAddress } from '../lib/pacts';
import ImageHoverPreview from './ImageHoverPreview';
import { useLanguage } from '../lib/i18n/LanguageContext';
import TranslatedMessage from './TranslatedMessage';

interface Props {
  post: NetworkPost;
  authorProfile: BuilderProfile | null;
  linkedPactTitle: string | null;
  counts: { reactions: number; comments: number };
  reacted: boolean;
  myWallet: string | null;
  signMessage: SignMessageFn | undefined;
  onReactionChange: (postId: number, reacted: boolean) => void;
  onDeleted: (postId: number) => void;
}

function timeAgo(
  iso: string,
  t: (k: string, p?: Record<string, string | number>) => string
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t('treasury.justNow');
  if (min < 60) return t('treasury.minAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('treasury.hAgo', { n: h });
  const d = Math.floor(h / 24);
  return t('treasury.dAgo', { n: d });
}

export default function PostCard({
  post,
  authorProfile,
  linkedPactTitle,
  counts,
  reacted,
  myWallet,
  signMessage,
  onReactionChange,
  onDeleted,
}: Props) {
  const { t, lang } = useLanguage();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<NetworkComment[] | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [localCounts, setLocalCounts] = useState(counts);
  const [localReacted, setLocalReacted] = useState(reacted);
  const [error, setError] = useState<string | null>(null);

  const pseudo = authorProfile?.pseudo?.trim() || formatAddress(post.authorWallet);
  const isMine = myWallet === post.authorWallet;

  async function loadComments() {
    if (comments !== null) {
      setShowComments((s) => !s);
      return;
    }
    const list = await fetchComments(post.id);
    setComments(list);
    setShowComments(true);
  }

  async function handleReact() {
    if (!myWallet || !signMessage || busy) return;
    setBusy(true);
    setError(null);
    const r = await toggleReaction(myWallet, signMessage, post.id);
    setBusy(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setLocalReacted(r.reacted);
    setLocalCounts((c) => ({ ...c, reactions: c.reactions + (r.reacted ? 1 : -1) }));
    onReactionChange(post.id, r.reacted);
  }

  async function handleComment() {
    if (!myWallet || !signMessage || !commentBody.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await commentOnPost(myWallet, signMessage, post.id, commentBody);
    setBusy(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setComments((prev) => [
      ...(prev ?? []),
      {
        id: r.id,
        postId: post.id,
        authorWallet: myWallet,
        body: commentBody.trim(),
        createdAt: new Date().toISOString(),
        lang,
      },
    ]);
    setLocalCounts((c) => ({ ...c, comments: c.comments + 1 }));
    setCommentBody('');
  }

  async function handleDelete() {
    if (!myWallet || !signMessage || busy) return;
    if (!window.confirm(t('network.deleteConfirm'))) return;
    setBusy(true);
    const r = await deletePost(myWallet, signMessage, post.id);
    setBusy(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    onDeleted(post.id);
  }

  return (
    <article className="glass-panel rounded-2xl border border-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
            {authorProfile?.avatarUrl ? (
              <img src={authorProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-ink-500">
                {pseudo.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-white">{pseudo}</span>
              <RankBadge wallet={post.authorWallet} size="xs" />
            </div>
            <p className="font-mono text-[10px] text-ink-500">{timeAgo(post.createdAt, t)}</p>
          </div>
        </div>

        {isMine && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-[11px] text-ink-500 underline underline-offset-2 transition-colors hover:text-red-400"
          >
            {t('network.deleteButton')}
          </button>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-200">
        <TranslatedMessage text={post.body} sourceLang={post.lang} />
      </p>

      {post.imageUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/5">
          <ImageHoverPreview src={post.imageUrl} alt="" kind="banner">
            <img src={post.imageUrl} alt="" className="max-h-80 w-full object-cover" />
          </ImageHoverPreview>
        </div>
      )}

      {post.linkedProjectPda && linkedPactTitle && (
        <a
          href={`#/pact/${post.linkedProjectPda}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent-violet/25 bg-accent-violet/10 px-2.5 py-1 text-[11px] text-accent-violet transition hover:bg-accent-violet/20"
        >
          🔗 {t('network.linkedPact')} {linkedPactTitle}
        </a>
      )}

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}

      <div className="mt-4 flex items-center gap-4 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={handleReact}
          disabled={!myWallet || busy}
          className={
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ' +
            (localReacted
              ? 'border border-accent-neon/40 bg-accent-neon/10 text-accent-neon'
              : 'border border-white/10 text-ink-400 hover:border-white/20 hover:text-white')
          }
        >
          🤝 {localReacted ? t('network.encouraged') : t('network.encourage')}
          {localCounts.reactions > 0 && <span>· {localCounts.reactions}</span>}
        </button>

        <button
          type="button"
          onClick={loadComments}
          className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-ink-400 transition hover:border-white/20 hover:text-white"
        >
          💬 {t('network.commentButton')}
          {localCounts.comments > 0 && <span>· {localCounts.comments}</span>}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-2.5 border-t border-white/5 pt-3">
          {(comments ?? []).length === 0 ? (
            <p className="text-[11px] text-ink-500">{t('network.noComments')}</p>
          ) : (
            (comments ?? []).map((c) => (
              <div key={c.id} className="rounded-lg bg-black/20 px-3 py-2">
                <p className="font-mono text-[10px] text-ink-500">
                  {formatAddress(c.authorWallet)}
                </p>
                <p className="mt-0.5 text-xs text-ink-200">
                  <TranslatedMessage text={c.body} sourceLang={c.lang} />
                </p>
              </div>
            ))
          )}

          {myWallet && signMessage && (
            <div className="flex items-center gap-2">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value.slice(0, MAX_COMMENT_BODY))}
                placeholder={t('network.commentPlaceholder')}
                className="flex-1 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-white placeholder:text-ink-500 focus:border-accent-violet/40 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleComment();
                }}
              />
              <button
                type="button"
                onClick={handleComment}
                disabled={busy || !commentBody.trim()}
                className="btn-primary rounded-lg px-3 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('network.commentSend')}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
