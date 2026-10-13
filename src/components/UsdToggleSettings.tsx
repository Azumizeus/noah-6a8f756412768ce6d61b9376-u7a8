// src/components/UsdToggleSettings.tsx
// Affichage des montants en USD à côté du SOL. État local + écriture
// localStorage immédiate, sans contexte : le réglage n'est lu qu'au montage
// des composants de montant, une propagation globale n'apporterait rien.
import { useState } from 'react';
import { loadShowUsd, saveShowUsd } from '../lib/usdDisplay';
import { useLanguage } from '../lib/i18n/LanguageContext';

export function UsdToggleSettings() {
  const { t } = useLanguage();
  // Initialiseur paresseux : `useState(loadShowUsd())` relirait
  // localStorage à chaque rendu du panneau, pour rien.
  const [enabled, setEnabled] = useState(() => loadShowUsd());

  const toggle = (v: boolean) => {
    setEnabled(v);
    saveShowUsd(v);
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-[11px] font-medium text-ink-200">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-accent-violet"
        />
        {t('settings.usdToggleLabel')}
      </label>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{t('settings.usdHint')}</p>
    </div>
  );
}

export default UsdToggleSettings;
