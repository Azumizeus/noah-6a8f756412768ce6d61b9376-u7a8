// src/components/CsvExportButton.tsx
// Export de l'historique du wallet connecté (XP + actions on-chain).
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { buildWalletHistoryCsv, downloadCsv } from '../lib/csvExport';
import { useLanguage } from '../lib/i18n/LanguageContext';
import InfoTooltip from './InfoTooltip';

// `empty` est un état à part entière, pas une erreur : « tu n'as encore
// rien fait » et « le serveur n'a pas répondu » demandent deux messages
// différents, sinon l'utilisateur croit à une panne.
type State = 'idle' | 'loading' | 'empty' | 'error';

export function CsvExportButton() {
  const { t } = useLanguage();
  const { publicKey } = useWallet();
  const [state, setState] = useState<State>('idle');

  // Sans wallet il n'y a rien à exporter : on ne rend rien plutôt qu'un
  // bouton désactivé qui n'expliquerait pas pourquoi.
  if (!publicKey) return null;

  const handleExport = async () => {
    setState('loading');
    try {
      const wallet = publicKey.toBase58();
      const csv = await buildWalletHistoryCsv(wallet);
      if (!csv) {
        setState('empty');
        return;
      }
      downloadCsv(`buildpact-${wallet.slice(0, 8)}-history.csv`, csv);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white">
        {t('settings.exportHeading')}
        <InfoTooltip text={t('settings.exportHint')} />
      </h4>
      <button
        type="button"
        onClick={handleExport}
        disabled={state === 'loading'}
        className="rounded-md border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-medium text-ink-200 transition hover:border-white/20 hover:text-white disabled:opacity-50"
      >
        {t('settings.exportButton')}
      </button>
      {state === 'empty' && <p className="mt-1 text-[11px] text-ink-500">{t('settings.exportEmpty')}</p>}
      {state === 'error' && <p className="mt-1 text-[11px] text-red-400">{t('errors.serverUnreachable')}</p>}
    </div>
  );
}

export default CsvExportButton;
