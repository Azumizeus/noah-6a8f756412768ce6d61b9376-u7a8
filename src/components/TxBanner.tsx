// src/components/TxBanner.tsx
import type { TxState } from '../hooks/useProjects';
import { explorerTxUrl } from '../lib/pacts';
import { useLanguage } from '../lib/i18n/LanguageContext';

export function TxBanner({
  state,
  onDismiss,
}: {
  state: TxState | null;
  /** Optionnel : bouton × pour fermer manuellement. Sans lui, le bandeau
   *  reste affiché indéfiniment tant qu'aucune nouvelle action Fund/Finalize
   *  ne le remplace (Distribuer, géré en local dans PactCard, ne le touche
   *  jamais — d'où l'intérêt de pouvoir le fermer soi-même). */
  onDismiss?: () => void;
}) {
  const { t } = useLanguage();
  if (!state) return null;
  const ok = state.kind === 'success';
  return (
    <div
      role="status"
      className={
        'flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ' +
        (ok
          ? 'border-accent-neon/30 bg-accent-neon/10 text-accent-neon'
          : 'border-red-400/30 bg-red-400/10 text-red-300')
      }
    >
      <span>
        {state.text}
        {state.sig && (
          <a
            href={explorerTxUrl(state.sig)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 underline underline-offset-4 hover:opacity-80"
          >
            {t('common.viewTx')}
          </a>
        )}
      </span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={t('common.close')}
          className="-m-2.5 flex h-9 w-9 shrink-0 items-center justify-center p-2.5 opacity-70 transition hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default TxBanner;
