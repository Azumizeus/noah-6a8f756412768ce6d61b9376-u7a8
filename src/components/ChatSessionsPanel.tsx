// src/components/ChatSessionsPanel.tsx
// ═══════════════════════════════════════════════════════════════════
// Panneau « Sessions de chat » de la page Profil.
//
// Deux choses distinctes y sont présentées, et l'écart entre les deux est
// le point délicat de cet écran :
//
//   1. La LISTE des jetons présents dans CE navigateur. Elle est locale par
//      construction : le serveur ne tient aucun registre des jetons émis, il
//      se contente de vérifier une signature. Une session ouverte sur un
//      téléphone n'apparaîtra donc jamais ici.
//   2. Le bouton RÉVOQUER, qui lui est global : il pose un cutoff daté côté
//      serveur, invalidant tous les jetons du wallet, y compris ceux qu'on
//      ne voit pas dans la liste.
//
// Laisser croire que la liste est exhaustive serait le pire des mensonges
// d'interface — l'utilisateur se croirait tranquille avec une seule ligne
// affichée alors qu'il traîne des jetons ailleurs. Le libellé le dit donc
// explicitement plutôt que de le cacher derrière un titre rassurant.
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { revokeChatSessions } from '../lib/chat';
import { listChatSessions, type ChatSessionEntry } from '../lib/chatSession';
import { formatAddress } from '../lib/pacts';
import { useLanguage } from '../lib/i18n/LanguageContext';

export default function ChatSessionsPanel({ wallet }: { wallet: string }) {
  const { lang, t } = useLanguage();
  const { signMessage } = useWallet();
  const [sessions, setSessions] = useState<ChatSessionEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refresh = useCallback(() => setSessions(listChatSessions(wallet)), [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRevoke = async () => {
    if (!signMessage) {
      setError(t('chatSession.noSign'));
      return;
    }
    const confirmed = window.confirm(t('chatSession.confirm'));
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setDone(false);
    const r = await revokeChatSessions({ wallet, signMessage });
    setBusy(false);
    // revokeChatSessions vide le cache local dans TOUS les cas — on
    // rafraîchit avant même de traiter l'erreur, sinon la liste afficherait
    // des jetons qui n'existent plus.
    refresh();
    if ('error' in r) setError(r.error);
    else setDone(true);
  };

  const fmt = (ms: number) =>
    ms > 0 ? new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') : '—';

  return (
    <div className="glass-panel p-5">
      <h2 className="mb-1 font-sans text-lg font-semibold text-white">
        {t('chatSession.heading')}
      </h2>
      <p className="mb-4 text-xs text-ink-400">
        {t('chatSession.intro')}
      </p>

      {sessions.length === 0 ? (
        <p className="text-xs text-ink-400">
          {t('chatSession.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sessions.map((s) => (
            <li
              key={s.projectPda}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
            >
              <a
                href={`#/pact/${s.projectPda}`}
                className="min-w-0 truncate font-mono text-xs text-white underline-offset-2 hover:text-accent-neon hover:underline"
              >
                {formatAddress(s.projectPda)}
              </a>
              <span
                className={`shrink-0 text-[11px] ${s.stale ? 'text-ink-500' : 'text-ink-300'}`}
                title={fmt(s.expiresAt)}
              >
                {s.stale
                  ? t('chatSession.expired')
                  : t('chatSession.until', { date: fmt(s.expiresAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Cet avertissement n'est pas de la prudence décorative : sans lui, la
          liste ci-dessus se lit comme un inventaire complet, ce qu'elle
          n'est pas. */}
      <p className="mt-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
        {t('chatSession.browserOnly')}
      </p>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {done && (
        <p className="mt-2 text-xs text-emerald-300">
          {t('chatSession.revoked')}
        </p>
      )}

      <button
        type="button"
        onClick={handleRevoke}
        disabled={busy}
        className="mt-3 w-full rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs font-medium text-white transition hover:bg-red-500/20 disabled:opacity-50"
      >
        {busy ? t('chatSession.revoking') : t('chatSession.revoke')}
      </button>
    </div>
  );
}
