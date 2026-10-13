// src/pages/premium/PremiumDemoKit.tsx
// ═══════════════════════════════════════════════════════════════════
// Kit démo juges — version premium (tokens clairs) du DemoKit legacy.
// Sélection AUTOMATIQUE : le pact finalisé avec le vault le plus rempli,
// sinon le plus récent. Affiche QR code + lien direct + résumé du pact
// d'exemple, pour démo live sans refaire tout le wizard.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useProjects } from '../../hooks/useProjects';
import { pactPublicUrl } from '../../lib/router';
import QrCode from '../../components/QrCode';
import { useLanguage } from '../../lib/i18n/LanguageContext';

export function PremiumDemoKit() {
  const { t } = useLanguage();
  const { pacts, loading } = useProjects();
  const [copied, setCopied] = useState(false);

  const finalized = pacts.filter((p) => p.status === 'active');
  const best =
    [...finalized].sort((a, b) => b.vaultBalanceSol - a.vaultBalanceSol)[0] ??
    null;

  const card: React.CSSProperties = {
    background: 'var(--p-canvas)',
    border: '1px solid var(--p-line)',
    borderRadius: 'var(--p-radius-lg)',
    boxShadow: 'var(--p-shadow)',
  };

  if (loading) {
    return (
      <div
        style={{ ...card, height: 128, animation: 'pulse 1.6s ease-in-out infinite', opacity: 0.6 }}
        aria-hidden="true"
      />
    );
  }

  if (!best) {
    return (
      <div style={{ ...card, padding: '20px 22px', fontSize: 13.5, color: 'var(--p-ink3)', lineHeight: 1.6 }}>
        {t('demoKit.empty')}
      </div>
    );
  }

  const demoUrl = pactPublicUrl(best.pda.toBase58());
  const solscanTx = `https://solscan.io/account/${best.pda.toBase58()}?cluster=devnet`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(demoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* non bloquant */
    }
  };

  return (
    <div style={{ ...card, padding: '20px 22px' }}>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 20, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--p-accent)' }}>
            {t('demoKit.label')}
          </p>
          <p style={{ marginTop: 8, fontSize: 14.5, fontWeight: 600, color: 'var(--p-ink)', lineHeight: 1.5 }}>
            {t('demoKit.summary', { title: best.title, vault: best.vaultBalanceSol.toFixed(3), members: best.members.length })}
          </p>
          <p style={{ marginTop: 4, fontSize: 12.5, color: 'var(--p-ink3)', lineHeight: 1.55 }}>
            {t('demoKit.hint')}
          </p>

          {/* Adresse PDA = exemple de "transaction" vérifiable on-chain */}
          <p style={{ marginTop: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--p-ink3)', wordBreak: 'break-all' }}>
            PDA&nbsp;: <span style={{ color: 'var(--p-accent)' }}>{best.pda.toBase58()}</span>
          </p>

          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <a
              href={`#/pact/${best.pda.toBase58()}`}
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 38, borderRadius: 99,
                background: 'var(--p-accent)', color: 'var(--p-accent-ink, #fff)',
                padding: '0 18px', fontSize: 13, fontWeight: 650, textDecoration: 'none',
              }}
            >
              {t('demoKit.open')}
            </a>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 38, borderRadius: 99,
                border: '1px solid var(--p-line)', background: 'var(--p-canvas)', color: 'var(--p-ink2)',
                padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {copied ? t('common.linkCopied') : t('common.copyLink')}
            </button>
            <a
              href={solscanTx}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 38, borderRadius: 99,
                border: '1px solid var(--p-line)', background: 'var(--p-canvas)', color: 'var(--p-accent)',
                padding: '0 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}
            >
              Solscan ↗
            </a>
          </div>
        </div>

        <div style={{ flexShrink: 0, borderRadius: 14, background: '#fff', padding: 10, border: '1px solid var(--p-line)' }}>
          <QrCode value={demoUrl} size={104} />
        </div>
      </div>
    </div>
  );
}

export default PremiumDemoKit;
