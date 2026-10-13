// src/pages/premium/PremiumChatSessions.tsx
// ═══════════════════════════════════════════════════════════════════
// Panneau « Sessions de chat » du profil premium.
//
// Le point délicat de cet écran est l'écart entre ce qu'il MONTRE et ce qu'il
// FAIT, et il est volontairement assumé à l'écran :
//
//   1. La LISTE des jetons présents dans CE navigateur. Elle est locale par
//      construction : le serveur ne tient aucun registre des jetons émis, il
//      vérifie une signature. Une session ouverte sur un téléphone
//      n'apparaîtra donc jamais ici.
//   2. Le bouton RÉVOQUER, qui lui est global : il pose un cutoff daté côté
//      serveur et invalide tous les jetons du wallet, y compris ceux qu'on ne
//      voit pas dans la liste.
//
// Laisser croire que la liste est exhaustive serait le pire des mensonges
// d'interface — l'utilisateur se croirait tranquille avec une seule ligne
// affichée alors qu'il traîne des jetons ailleurs. D'où l'avertissement
// `chatSession.browserOnly`, affiché en clair sous la liste.
//
// Réécrit en tokens `--p-*` : `components/ChatSessionsPanel.tsx` est habillé
// en `glass-panel` + `text-ink-*` (legacy sombre). La logique n'est pas
// dupliquée : on réutilise `lib/chatSession.ts` (liste locale, TTL) et
// `lib/chat.ts` (révocation serveur).
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { revokeChatSessions } from '../../lib/chat';
import { listChatSessions, type ChatSessionEntry } from '../../lib/chatSession';
import { formatAddress } from '../../lib/pacts';
import { useLanguage } from '../../lib/i18n/LanguageContext';

export default function PremiumChatSessions({ wallet }: { wallet: string }) {
  const { t, lang } = useLanguage();
  const { signMessage } = useWallet();
  const [sessions, setSessions] = useState<ChatSessionEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refresh = useCallback(() => setSessions(listChatSessions(wallet)), [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fmt = (ms: number) => (ms > 0 ? new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') : '—');

  const handleRevoke = async () => {
    if (!signMessage) {
      setError(t('chatSession.noSign'));
      return;
    }
    if (!window.confirm(t('chatSession.confirm'))) return;

    setBusy(true);
    setError(null);
    setDone(false);
    const r = await revokeChatSessions({ wallet, signMessage });
    setBusy(false);
    // revokeChatSessions vide le cache local dans TOUS les cas — on rafraîchit
    // avant même de traiter l'erreur, sinon la liste afficherait des jetons
    // qui n'existent plus.
    refresh();
    if ('error' in r) setError(r.error);
    else setDone(true);
  };

  return (
    <section
      style={{
        marginTop: 22,
        padding: '18px 20px',
        background: 'var(--p-canvas)',
        border: '1px solid var(--p-line)',
        borderRadius: 'var(--p-radius-lg)',
        boxShadow: 'var(--p-shadow)',
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>{t('chatSession.heading')}</h2>
      <p style={{ fontSize: 11.5, lineHeight: 1.65, color: 'var(--p-ink3)', margin: '6px 0 14px' }}>
        {t('chatSession.intro')}
      </p>

      {sessions.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--p-ink3)', margin: 0 }}>{t('chatSession.empty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sessions.map((s) => (
            <li
              key={s.projectPda}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 12px',
                background: 'var(--p-bg)',
                border: '1px solid var(--p-line)',
                borderRadius: 'var(--p-radius-xs)',
              }}
            >
              <a
                href={`#/pact/${s.projectPda}`}
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: 'var(--p-accent)',
                  textDecoration: 'none',
                }}
              >
                {formatAddress(s.projectPda)}
              </a>
              <span
                style={{ flexShrink: 0, fontSize: 11, color: s.stale ? 'var(--p-ink3)' : 'var(--p-ink2)' }}
                title={fmt(s.expiresAt)}
              >
                {s.stale ? t('chatSession.expired') : t('chatSession.until', { date: fmt(s.expiresAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Cet avertissement n'est pas de la prudence décorative : sans lui, la
          liste ci-dessus se lit comme un inventaire complet, ce qu'elle
          n'est pas. */}
      <p
        style={{
          margin: '12px 0 0',
          padding: '8px 12px',
          fontSize: 10.5,
          lineHeight: 1.65,
          color: 'var(--p-ink3)',
          background: 'var(--p-bg)',
          border: '1px solid var(--p-line)',
          borderRadius: 'var(--p-radius-xs)',
        }}
      >
        {t('chatSession.browserOnly')}
      </p>

      {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--p-err)' }}>{error}</p>}
      {done && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--p-ok)' }}>{t('chatSession.revoked')}</p>}

      <button
        type="button"
        className="p-btn ghost"
        onClick={handleRevoke}
        disabled={busy}
        style={{ marginTop: 12, width: '100%', color: 'var(--p-err)', borderColor: 'var(--p-err)', opacity: busy ? 0.5 : 1 }}
      >
        {busy ? t('chatSession.revoking') : t('chatSession.revoke')}
      </button>
    </section>
  );
}
