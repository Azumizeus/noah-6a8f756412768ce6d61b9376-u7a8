// src/components/UpdatesFeed.tsx
// ═══════════════════════════════════════════════════════════════════
// Fil d'avancement des membres — chaque membre du pact (créateur inclus)
// peut poster un court texte + un lien optionnel ("Milestone X fait", démo,
// repo...). Off-chain (project_updates), affiché en liste chronologique sur
// la fiche publique. Seuls les wallets présents dans `members` peuvent
// publier — quiconque peut lire (même modèle que ActivityFeed).
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatAddress } from '../lib/pacts';
import type { ChainMember } from '../lib/pacts';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { fetchProfilesByWallets } from '../lib/profileRemote';
import type { BuilderProfile } from '../lib/profile';
import {
  fetchProjectUpdates,
  postProjectUpdate,
  updatesEnabled,
  validateUpdateBody,
  validateUpdateLink,
  type ProjectUpdate,
} from '../lib/updates';

interface Props {
  projectPda: string;
  members: ChainMember[];
}

export function UpdatesFeed({ projectPda, members }: Props) {
  const { publicKey, signMessage } = useWallet();
  const { t } = useLanguage();

  const timeAgoIso = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return t('activity.justNow');
    if (min < 60) return t('activity.minAgo', { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t('activity.hAgo', { n: h });
    const d = Math.floor(h / 24);
    return t('activity.dAgo', { n: d });
  };
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [profiles, setProfiles] = useState<Map<string, BuilderProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myAddr = publicKey?.toBase58();
  const iAmMember = !!myAddr && members.some((m) => m.wallet.toBase58() === myAddr);

  const load = () => {
    setLoading(true);
    fetchProjectUpdates(projectPda).then((u) => {
      setUpdates(u);
      setLoading(false);
    });
  };

  useEffect(() => {
    if (updatesEnabled) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPda]);

  // Résout pseudo + avatar des auteurs — même best-effort que ChatBox.tsx.
  useEffect(() => {
    const wallets = Array.from(new Set(updates.map((u) => u.authorWallet)));
    if (wallets.length === 0) return;
    fetchProfilesByWallets(wallets).then(setProfiles);
  }, [updates]);

  const displayName = (wallet: string): string => profiles.get(wallet)?.pseudo?.trim() || formatAddress(wallet);
  const avatarUrl = (wallet: string): string | null => profiles.get(wallet)?.avatarUrl ?? null;

  if (!updatesEnabled) return null;

  const handlePost = async () => {
    if (!myAddr) return;
    // Une signature prouve désormais l'auteur côté serveur : sans
    // `signMessage`, l'envoi échouerait avec un message opaque. Autant le
    // dire clairement ici.
    if (!signMessage) {
      setError("Ce wallet ne sait pas signer de message — publication impossible.");
      return;
    }
    const bodyErr = validateUpdateBody(body);
    const linkErr = validateUpdateLink(link);
    if (bodyErr || linkErr) {
      setError(bodyErr ?? linkErr);
      return;
    }
    setPosting(true);
    setError(null);
    const r = await postProjectUpdate({ projectPda, authorWallet: myAddr, body, link, signMessage });
    setPosting(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setBody('');
    setLink('');
    load();
  };

  return (
    <div className="glass-panel p-4">
      <h3 className="mb-3 font-sans text-sm font-semibold text-white">{t('updates.heading')}</h3>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : updates.length === 0 ? (
        <p className="text-xs text-ink-400">{t('updates.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {updates.map((u) => (
            <li key={u.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between text-[11px] text-ink-400">
                <span className="flex items-center gap-1.5 text-ink-300">
                  <span className="h-4 w-4 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
                    {avatarUrl(u.authorWallet) ? (
                      <img src={avatarUrl(u.authorWallet)!} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[8px] text-ink-500">
                        {displayName(u.authorWallet).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  {displayName(u.authorWallet)}
                </span>
                <span>{timeAgoIso(u.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-200">{u.body}</p>
              {u.link && (
                <a
                  href={u.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] text-accent-neon underline-offset-2 hover:underline"
                >
                  {t('updates.viewLink')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {iAmMember && (
        <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
          <label htmlFor="update-body" className="sr-only">
            Nouvelle mise à jour
          </label>
          <textarea
            id="update-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('updates.bodyPlaceholder')}
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
          />
          <label htmlFor="update-link" className="sr-only">
            Lien optionnel
          </label>
          <input
            id="update-link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={t('updates.linkPlaceholder')}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || !body.trim()}
            className="w-full rounded-lg bg-accent-violet px-3 py-2 text-xs font-medium text-ink-900 transition hover:bg-accent-violet/90 disabled:opacity-50"
          >
            {posting ? t('updates.publishing') : t('updates.publish')}
          </button>
        </div>
      )}
    </div>
  );
}

export default UpdatesFeed;
