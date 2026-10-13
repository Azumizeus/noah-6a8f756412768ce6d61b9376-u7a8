// src/pages/premium/PremiumContactDialog.tsx
// ═══════════════════════════════════════════════════════════════════
// Modale « contacter ce builder » du shell premium.
//
// Réécrite en tokens `--p-*` : `components/ContactModal.tsx` est habillé en
// `glass-panel` + `bg-black/75` (legacy sombre) et détonnerait sur l'ivoire.
// La logique n'est PAS dupliquée : on appelle `sendContactRequest` de
// `lib/contact.ts`, qui construit le message canonique signé et parle à
// l'Edge Function `contact`. La signature du wallet est le seul élément qui
// prouve que l'expéditeur contrôle bien son adresse — elle n'est pas
// facultative ici.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { sendContactRequest } from '../../lib/contact';
import { useLanguage } from '../../lib/i18n/LanguageContext';

type SignFn = (message: Uint8Array) => Promise<Uint8Array>;

interface Props {
  fromWallet: string;
  signMessage?: SignFn;
  toWallet: string;
  toPseudo: string;
  onClose: () => void;
  onSent?: () => void;
}

const inputStyle = {
  width: '100%',
  marginTop: 4,
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: "'Inter',sans-serif",
  border: '1px solid var(--p-line)',
  borderRadius: 'var(--p-radius-xs)',
  background: 'var(--p-canvas)',
  color: 'var(--p-ink)',
} as const;

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 650,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--p-ink3)',
} as const;

export default function PremiumContactDialog({ fromWallet, signMessage, toWallet, toPseudo, onClose, onSent }: Props) {
  const { t } = useLanguage();
  const [roleText, setRoleText] = useState('');
  const [message, setMessage] = useState(t('contact.defaultMessage', { pseudo: toPseudo }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Échap ferme, comme les autres modales premium : sans ça, un panneau plein
  // écran n'offre plus que la croix, et le clavier n'a aucune porte de sortie.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'var(--p-overlay)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: 'var(--p-canvas)',
          border: '1px solid var(--p-line)',
          borderRadius: 'var(--p-radius-lg)',
          boxShadow: 'var(--p-shadow)',
        }}
      >
        {sent ? (
          <>
            <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--p-ok)', margin: 0 }}>
              {t('contact.sentTitle', { pseudo: toPseudo })}
            </p>
            <button type="button" className="p-btn primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>
                {t('contact.heading', { pseudo: toPseudo })}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 17, color: 'var(--p-ink3)' }}
              >
                ×
              </button>
            </div>

            <label style={labelStyle}>
              {t('contact.roleLabel')}
              <input
                type="text"
                maxLength={60}
                placeholder={t('contact.rolePlaceholder')}
                value={roleText}
                onChange={(e) => setRoleText(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              {t('contact.messageLabel')}
              <textarea
                rows={4}
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <span style={{ display: 'block', marginTop: 3, fontSize: 10.5, color: 'var(--p-ink3)' }}>
                {message.length}/500
              </span>
            </label>

            {error && <p style={{ fontSize: 12, color: 'var(--p-err)', margin: 0 }}>{error}</p>}

            <button
              type="button"
              className="p-btn primary"
              onClick={handleSend}
              disabled={sending || !message.trim()}
              style={sending || !message.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              {sending ? t('contact.sending') : t('contact.sendButton')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
