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
  const { lang } = useLanguage();
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
      setError(lang === 'en'
        ? 'This wallet cannot sign messages — revocation unavailable.'
        : 'Ce wallet ne peut pas signer de message — révocation indisponible.');
      return;
    }
    const confirmed = window.confirm(lang === 'en'
      ? 'Revoke every chat session of this wallet, on all devices and all projects? A wallet signature is required.'
      : 'Révoquer toutes les sessions de chat de ce wallet, sur tous les appareils et tous les projets ? Une signature du wallet est requise.');
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
        {lang === 'en' ? 'Chat sessions' : 'Sessions de chat'}
      </h2>
      <p className="mb-4 text-xs text-ink-400">
        {lang === 'en'
          ? 'A chat session is a token your wallet signs once, then reused for 24 h so you are not asked to sign every message.'
          : "Une session de chat est un jeton que ton wallet signe une fois, réutilisé 24 h pour t'éviter une signature par message."}
      </p>

      {sessions.length === 0 ? (
        <p className="text-xs text-ink-400">
          {lang === 'en'
            ? 'No session stored in this browser.'
            : 'Aucune session stockée dans ce navigateur.'}
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
                  ? (lang === 'en' ? 'expired' : 'expirée')
                  : (lang === 'en' ? `until ${fmt(s.expiresAt)}` : `jusqu'au ${fmt(s.expiresAt)}`)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Cet avertissement n'est pas de la prudence décorative : sans lui, la
          liste ci-dessus se lit comme un inventaire complet, ce qu'elle
          n'est pas. */}
      <p className="mt-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
        {lang === 'en'
          ? 'This list only covers the current browser. Sessions opened on another device are not visible here — the server keeps no registry of issued tokens. Revoking, however, applies everywhere.'
          : "Cette liste ne couvre que le navigateur courant. Les sessions ouvertes sur un autre appareil n'y figurent pas — le serveur ne tient aucun registre des jetons émis. La révocation, elle, s'applique partout."}
      </p>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {done && (
        <p className="mt-2 text-xs text-emerald-300">
          {lang === 'en'
            ? 'Sessions revoked. The next message will ask for a new signature.'
            : 'Sessions révoquées. Le prochain message redemandera une signature.'}
        </p>
      )}

      <button
        type="button"
        onClick={handleRevoke}
        disabled={busy}
        className="mt-3 w-full rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs font-medium text-white transition hover:bg-red-500/20 disabled:opacity-50"
      >
        {busy
          ? (lang === 'en' ? 'Revoking…' : 'Révocation…')
          : (lang === 'en' ? 'Revoke all sessions (all devices)' : 'Révoquer toutes les sessions (tous appareils)')}
      </button>
    </div>
  );
}
