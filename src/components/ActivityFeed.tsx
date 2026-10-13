// src/components/ActivityFeed.tsx
import { useActivityFeed } from '../hooks/useActivityFeed';
import { formatAddress, formatSol, explorerTxUrl } from '../lib/pacts';
import type { PactEventKind } from '../lib/activity';
import { useLanguage } from '../lib/i18n/LanguageContext';

const KIND_ICON: Record<PactEventKind, string> = {
  approve: '✅',
  fund: '💚',
  finalize: '🔒',
  distribute: '🔁',
  add_member: '➕',
};

interface Props {
  projectPda: string;
}

/**
 * Fil d'activité live d'un projet — Supabase Realtime. Chaque ligne pointe
 * vers sa transaction on-chain (Explorer devnet) : preuve vérifiable, pas
 * une simple notification en mémoire.
 * Ne s'affiche pas si Supabase n'est pas configuré (dégradation silencieuse).
 */
export function ActivityFeed({ projectPda }: Props) {
  const { events, loading, enabled } = useActivityFeed(projectPda);
  const { t } = useLanguage();

  const KIND_LABEL: Record<PactEventKind, string> = {
    approve: t('activity.approve'),
    fund: t('activity.fund'),
    finalize: t('activity.finalize'),
    distribute: t('activity.distribute'),
    add_member: t('activity.add_member'),
  };

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

  if (!enabled) return null;

  return (
    <div className="glass-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-sans text-sm font-semibold text-white">{t('activity.heading')}</h3>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-400">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-neon animate-pulse" aria-hidden="true" />
          {t('activity.live')}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-ink-400">{t('activity.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-ink-300">
                <span aria-hidden="true">{KIND_ICON[e.kind]}</span>{' '}
                <a
                  href={explorerTxUrl(e.txSig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-white underline-offset-2 hover:text-accent-neon hover:underline"
                >
                  {formatAddress(e.actor)}
                </a>{' '}
                {KIND_LABEL[e.kind]}
                {e.amountSol != null && (
                  <span className="text-accent-neon"> · {formatSol(e.amountSol)} SOL</span>
                )}
              </span>
              <span className="shrink-0 text-ink-400">{timeAgoIso(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ActivityFeed;
