// src/components/DemoKit.tsx
// ═══════════════════════════════════════════════════════════════════
// Kit démo juges — lien pré-rempli vers un pact déjà finalisé, pour ne
// pas refaire tout le wizard create → add_member → approve → finalize
// en direct devant les juges. Sélection AUTOMATIQUE (pas de PDA codé en
// dur) : le pact finalisé avec le vault le plus rempli, sinon le plus
// récent — reste valide même si le pact de démo change avant le 26/08.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { pactPublicUrl } from '../lib/router';
import QrCode from './QrCode';
import { useLanguage } from '../lib/i18n/LanguageContext';

export function DemoKit() {
  const { t } = useLanguage();
  const { pacts, loading } = useProjects();
  const [copied, setCopied] = useState(false);

  const finalized = pacts.filter((p) => p.status === 'active');
  const best =
    [...finalized].sort((a, b) => b.vaultBalanceSol - a.vaultBalanceSol)[0] ??
    null;

  if (loading) {
    return <div className="glass-panel h-32 animate-pulse rounded-2xl" aria-hidden="true" />;
  }

  if (!best) {
    return (
      <div className="glass-panel p-5 text-sm text-ink-400">
        {t('demoKit.empty')}
      </div>
    );
  }

  const demoUrl = pactPublicUrl(best.pda.toBase58());
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
    <div className="glass-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-xs uppercase tracking-wider text-accent-neon">{t('demoKit.label')}</p>
        <p className="mt-1 text-sm text-white">
          {t('demoKit.summary', { title: best.title, vault: best.vaultBalanceSol.toFixed(3), members: best.members.length })}
        </p>
        <p className="mt-1 text-xs text-ink-400">
          {t('demoKit.hint')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`#/pact/${best.pda.toBase58()}`}
            className="inline-flex h-10 items-center rounded-lg bg-accent-violet px-4 text-sm font-medium text-ink-900 hover:bg-accent-violet/90"
          >
            {t('demoKit.open')}
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-10 items-center rounded-lg border border-white/10 px-4 text-sm text-ink-300 hover:border-accent-violet/40 hover:text-white"
          >
            {copied ? t('common.linkCopied') : t('common.copyLink')}
          </button>
        </div>
      </div>
      <div className="mx-auto shrink-0 rounded-xl bg-white p-2 sm:mx-0">
        <QrCode value={demoUrl} size={96} />
      </div>
    </div>
  );
}

export default DemoKit;
