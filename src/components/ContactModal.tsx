// src/components/ContactModal.tsx
// ═══════════════════════════════════════════════════════════════════
// Modale "contacter ce builder" — envoie une demande de contact simple
// (pas de messagerie complète) : rôle recherché + message court. Voir
// lib/contact.ts pour le modèle de confiance (écriture publique, MVP).
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { sendContactRequest } from '../lib/contact';
import { useLanguage } from '../lib/i18n/LanguageContext';

type SignFn = (message: Uint8Array) => Promise<Uint8Array>;

interface Props {
  fromWallet: string;
  signMessage?: SignFn;
  toWallet: string;
  toPseudo: string;
  onClose: () => void;
  onSent?: () => void;
}

export default function ContactModal({ fromWallet, signMessage, toWallet, toPseudo, onClose, onSent }: Props) {
  const { t } = useLanguage();
  const [roleText, setRoleText] = useState('');
  const [message, setMessage] = useState(t('contact.defaultMessage', { pseudo: toPseudo }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!signMessage) {
      setError(t('errors.signMessageUnsupported'));
      return;
    }
    setSending(true);
    setError(null);
    const r = await sendContactRequest({ fromWallet, signMessage, toWallet, roleText, message });
    setSending(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setSent(true);
    onSent?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-md space-y-4 rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <>
            <p className="text-sm font-medium text-emerald-300">{t('contact.sentTitle', { pseudo: toPseudo })}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-accent-neon py-2.5 text-sm font-bold text-ink-900 transition hover:opacity-90"
            >
              {t('common.close')}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-sm font-semibold text-white">{t('contact.heading', { pseudo: toPseudo })}</h3>
              <button type="button" onClick={onClose} aria-label={t('common.close')} className="text-ink-400 hover:text-white">×</button>
            </div>

            <label className="block text-xs font-semibold text-white">
              {t('contact.roleLabel')}
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-sm text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
                maxLength={60}
                placeholder={t('contact.rolePlaceholder')}
                value={roleText}
                onChange={(e) => setRoleText(e.target.value)}
              />
            </label>

            <label className="block text-xs font-semibold text-white">
              {t('contact.messageLabel')}
              <textarea
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-sm text-white focus:border-accent-violet/50 focus:outline-none"
                rows={4}
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <span className="text-[11px] text-ink-400">{message.length}/500</span>
            </label>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="w-full rounded-lg bg-accent-neon py-2.5 text-sm font-bold text-ink-900 transition hover:opacity-90 disabled:opacity-50"
            >
              {sending ? t('contact.sending') : t('contact.sendButton')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
