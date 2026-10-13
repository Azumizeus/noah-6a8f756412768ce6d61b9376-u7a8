// src/components/CustomRpcSettings.tsx
// Permet de coller son propre endpoint RPC (Helius, QuickNode, Triton…).
// Utile quand le devnet public throttle : l'utilisateur reprend la main
// sans qu'on ait à redéployer.
import { useState } from 'react';
import { getCustomRpc, setCustomRpc } from '../lib/constants';
import { useLanguage } from '../lib/i18n/LanguageContext';
import InfoTooltip from './InfoTooltip';

export function CustomRpcSettings() {
  const { t } = useLanguage();
  const [value, setValue] = useState(() => getCustomRpc());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setCustomRpc(value);
    setSaved(true);
    // Confirmation éphémère plutôt qu'un toast : le panneau de réglages
    // est déjà un contexte de feedback local, un toast global serait
    // redondant. Pas de cleanup du timer : le composant vit tant que le
    // panneau est ouvert, et un setState sur démonté est ici inoffensif
    // (React 18+ ne warn plus).
    window.setTimeout(() => setSaved(false), 2500);
  };

  const handleClear = () => {
    setCustomRpc('');
    setValue('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white">
        {t('settings.rpcHeading')}
        <InfoTooltip text={t('settings.rpcHint')} />
      </h4>
      <input
        type="url"
        inputMode="url"
        // spellCheck désactivé : une URL avec clé d'API est systématiquement
        // soulignée en rouge par le correcteur, ce qui la fait passer pour
        // invalide alors qu'elle est correcte.
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://devnet.helius-rpc.com/?api-key=..."
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-accent-violet/90 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-accent-violet"
        >
          {t('common.save')}
        </button>
        {/* Lu à chaque render (pas depuis `value`) : le bouton doit refléter
            ce qui est RÉELLEMENT persisté, pas ce qui est tapé dans le champ. */}
        {getCustomRpc() && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-white/10 px-3 py-1.5 text-[11px] font-medium text-ink-300 transition hover:text-white"
          >
            {t('settings.rpcClear')}
          </button>
        )}
        {saved && <span className="text-[11px] text-emerald-400">{t('settings.rpcSaved')}</span>}
      </div>
    </div>
  );
}

export default CustomRpcSettings;
