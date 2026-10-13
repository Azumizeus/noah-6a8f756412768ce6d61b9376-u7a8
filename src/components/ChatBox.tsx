// src/components/ChatBox.tsx
// ═══════════════════════════════════════════════════════════════════
// Chat simple par projet — lecture + Realtime publics, écriture ouverte à
// tout wallet connecté (pas seulement les membres : un backer ou un curieux
// doit pouvoir poser une question avant même de rejoindre).
//
// Envoi et suppression passent par l'Edge Function `chat-moderate` et
// exigent une signature du wallet — c'est la seule façon de garantir que
// `author_wallet` correspond réellement à l'expéditeur.
//
// L'envoi s'appuie sur un jeton de session signé UNE fois pour 24 h : un
// seul popup au premier message, puis plus rien. La suppression, elle,
// redemande une signature à chaque fois (acte rare et destructif).
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatAddress } from '../lib/pacts';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { fetchProfilesByWallets } from '../lib/profileRemote';
import type { BuilderProfile } from '../lib/profile';
import {
  chatEnabled,
  deleteChatMessage,
  fetchChatMessages,
  postChatMessage,
  revokeChatSessions,
  subscribeToChatMessages,
  validateChatBody,
  type ChatMessage,
} from '../lib/chat';
import { CHAT_SESSION_TTL_HOURS, chatSessionExpiresAt } from '../lib/chatSession';
import TranslatedMessage from './TranslatedMessage';

interface Props {
  projectPda: string;
  /** Wallet du founder — si présent et égal au wallet connecté, affiche un
   *  bouton de suppression sur chaque message (modération founder-only). */
  creatorWallet?: string;
}

export function ChatBox({ projectPda, creatorWallet }: Props) {
  const { publicKey, connected, signMessage } = useWallet();
  const { t, lang } = useLanguage();
  const isCreator = !!publicKey && !!creatorWallet && publicKey.toBase58() === creatorWallet;
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const timeLabel = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Map<string, BuilderProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Échéance de la session de chat en cours, ou null s'il n'y en a pas.
  // Purement informatif : ça prévient qu'un popup wallet va s'ouvrir (ou
  // pas). Ce n'est PAS un gate de sécurité — c'est le serveur qui valide
  // la session, le client peut se tromper sans conséquence.
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null);
  const [revoking, setRevoking] = useState(false);
  const needsSignature = !!publicKey && sessionExpiresAt === null;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatEnabled) { setLoading(false); return; }
    let cancelled = false;
    fetchChatMessages(projectPda).then((msgs) => {
      if (!cancelled) { setMessages(msgs); setLoading(false); }
    });
    const unsubscribe = subscribeToChatMessages(projectPda, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [projectPda]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const refreshSession = useCallback(() => {
    const next = publicKey ? chatSessionExpiresAt(projectPda, publicKey.toBase58()) : null;
    // On compare les timestamps : `chatSessionExpiresAt` renvoie un objet
    // Date neuf à chaque appel, le stocker tel quel provoquerait un
    // re-render inutile à chaque tick.
    setSessionExpiresAt((prev) => (prev?.getTime() === next?.getTime() ? prev : next));
  }, [projectPda, publicKey]);

  // Re-vérifié chaque minute : sans ça, un onglet laissé ouvert continuerait
  // d'afficher « session active » après l'expiration, et l'utilisateur
  // recevrait un popup wallet sans avertissement au message suivant.
  useEffect(() => {
    refreshSession();
    const id = window.setInterval(refreshSession, 60_000);
    return () => window.clearInterval(id);
  }, [refreshSession]);

  // Résout pseudo + avatar des auteurs — affichage plus lisible qu'une
  // adresse wallet tronquée pour tout le monde. Best-effort : si Supabase
  // n'a pas de profil pour un wallet, on retombe sur l'adresse (voir displayName()).
  useEffect(() => {
    const wallets = Array.from(new Set(messages.map((m) => m.authorWallet)));
    if (wallets.length === 0) return;
    fetchProfilesByWallets(wallets).then(setProfiles);
  }, [messages]);

  /** Échéance compacte : heure seule si c'est aujourd'hui, jour + heure sinon. */
  const sessionLabel = (d: Date): string => {
    const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay
      ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Révocation SERVEUR des sessions de chat du wallet.
   *
   * Le serveur enregistre un cutoff daté et refuse ensuite tout jeton signé
   * avant : un jeton déjà exfiltré cesse de fonctionner. L'ancien comportement
   * (effacer le localStorage) ne retirait que la copie de CE navigateur et
   * donnait une fausse impression de déconnexion.
   *
   * Deux points que l'UI doit assumer explicitement :
   *  • un popup de signature s'ouvre — c'est ce qui empêche un tiers de
   *    révoquer les sessions d'autrui ;
   *  • la portée est TOUS LES PROJETS, pas seulement ce chat. D'où la
   *    confirmation : le libellé est affiché sous un chat précis, l'effet
   *    est plus large que ce que le contexte laisse croire.
   */
  const handleRevokeSession = async () => {
    if (!publicKey) return;
    if (!signMessage) {
      setError(t('chat.noSignRevoke'));
      return;
    }
    const confirmed = window.confirm(t('chat.revokeConfirm'));
    if (!confirmed) return;

    setRevoking(true);
    setError(null);
    const r = await revokeChatSessions({ wallet: publicKey.toBase58(), signMessage });
    setRevoking(false);
    // Le cache local est vidé par revokeChatSessions dans tous les cas :
    // on rafraîchit l'indicateur avant même de traiter l'erreur.
    refreshSession();
    if ('error' in r) setError(r.error);
  };

  const displayName = (wallet: string): string => profiles.get(wallet)?.pseudo?.trim() || formatAddress(wallet);
  const avatarUrl = (wallet: string): string | null => profiles.get(wallet)?.avatarUrl ?? null;

  if (!chatEnabled) return null;

  const handleSend = async () => {
    if (!publicKey) return;
    if (!signMessage) {
      setError(t('chat.noSignSend'));
      return;
    }
    const invalid = validateChatBody(body);
    if (invalid) { setError(invalid); return; }
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    const r = await postChatMessage({
      projectPda,
      authorWallet: publicKey.toBase58(),
      body,
      signMessage,
    });
    setSending(false);
    refreshSession();
    if ('error' in r) { setError(r.error); return; }
    // Affichage immédiat : le Realtime renverra la même ligne, la garde
    // `some(x => x.id === m.id)` de l'abonnement évite le doublon.
    if (r.message) {
      const created = r.message;
      setMessages((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created]));
    }
    setBody('');
  };

  // La suppression exige maintenant une signature : le serveur relit
  // project.creator on-chain pour valider que l'appelant est bien le
  // founder. Le bouton caché ne suffisait pas — la policy DELETE était
  // ouverte à tous.
  const handleDelete = async (id: number) => {
    if (!publicKey) return;
    if (!signMessage) {
      setError(t('chat.noSignModerate'));
      return;
    }
    if (!window.confirm(t('chat.deleteConfirm'))) return;
    setDeletingId(id);
    setError(null);
    const r = await deleteChatMessage({
      id,
      projectPda,
      wallet: publicKey.toBase58(),
      signMessage,
    });
    setDeletingId(null);
    if ('error' in r) { setError(r.error); return; }
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="glass-panel flex flex-col p-4">
      <h3 className="mb-3 font-sans text-sm font-semibold text-white">{t('chat.heading')}</h3>

      <div ref={listRef} className="mb-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />)}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-ink-400">{t('chat.empty')}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex items-start gap-2 text-xs">
              <div className="mt-0.5 h-5 w-5 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
                {avatarUrl(m.authorWallet) ? (
                  <img src={avatarUrl(m.authorWallet)!} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] text-ink-500">
                    {displayName(m.authorWallet).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-ink-300">
                  {displayName(m.authorWallet)}
                  {m.authorWallet === publicKey?.toBase58() && <span className="ml-1 text-accent-violet">{t('chat.you')}</span>}
                </span>{' '}
                <span className="text-ink-500">· {timeLabel(m.createdAt)}</span>
                <p className="mt-0.5 whitespace-pre-wrap text-ink-200">
                  <TranslatedMessage text={m.body} sourceLang={m.lang} />
                </p>
              </div>
              {isCreator && (
                <button
                  type="button"
                  onClick={() => handleDelete(m.id)}
                  disabled={deletingId === m.id}
                  title={t('chat.deleteTitle')}
                  className="shrink-0 text-ink-500 transition hover:text-red-400 disabled:opacity-40"
                >
                  {deletingId === m.id ? '…' : '×'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {connected ? (
        <div className="space-y-1.5">
          {needsSignature ? (
            <p className="text-[11px] text-ink-500">
              {t('chat.firstSignature', { hours: CHAT_SESSION_TTL_HOURS })}
            </p>
          ) : sessionExpiresAt ? (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-violet/70" aria-hidden="true" />
              <span title={sessionExpiresAt.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')}>
                {t('chat.sessionActive', { date: sessionLabel(sessionExpiresAt) })}
              </span>
              <button
                type="button"
                onClick={handleRevokeSession}
                disabled={revoking}
                title={t('chat.revokeTitle')}
                className="shrink-0 underline decoration-dotted underline-offset-2 transition hover:text-ink-200 disabled:opacity-40"
              >
                {revoking ? t('chat.revoking') : t('chat.revoke')}
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <label htmlFor="chat-input" className="sr-only">{t('chat.placeholder')}</label>
            <input
              id="chat-input"
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !sending) handleSend(); }}
              maxLength={500}
              placeholder={t('chat.placeholder')}
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !body.trim()}
              className="shrink-0 rounded-lg bg-accent-violet px-3 py-2 text-xs font-medium text-ink-900 transition hover:bg-accent-violet/90 disabled:opacity-50"
            >
              {sending ? t('chat.sending') : t('chat.send')}
            </button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      ) : (
        <p className="text-[11px] text-ink-500">{t('chat.connectPrompt')}</p>
      )}
    </div>
  );
}

export default ChatBox;
