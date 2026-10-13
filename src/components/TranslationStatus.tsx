// src/components/TranslationStatus.tsx
// ═══════════════════════════════════════════════════════════════════
// Indicateur d'état du service de traduction, monté dans le panneau
// de réglages sous le sélecteur de langue.
//
// Pourquoi il existe : les trois pannes du chemin par défaut — Edge
// Function non déployée, secret DEEPL_API_KEY absent, fonction déployée
// avec vérification de JWT — sont invisibles depuis l'app. Un message
// non traduit reste affiché dans sa langue d'origine, ce qui est le
// comportement voulu au rendu, mais ne dit rien sur la cause. Résultat :
// impossible de savoir si « la traduction ne marche pas » vient d'un
// secret manquant ou d'un déploiement raté sans ouvrir la console.
//
// Déclenchement manuel, jamais au montage : un test automatique à chaque
// ouverture des réglages taperait l'Edge Function sans que personne ne
// lise le résultat. Le coût réel est nul (texte sonde mis en cache
// serveur dès le premier appel, voir diagnoseTranslation), mais le
// principe reste — on n'appelle pas un service pour rien.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import {
  diagnoseTranslation,
  loadTranslationByok,
  type TranslationDiagnosis,
  type TranslationHealth,
} from '../lib/translation';
import { useLanguage } from '../lib/i18n/LanguageContext';
import InfoTooltip from './InfoTooltip';

// Trois tons seulement, et ils ne suivent PAS le découpage succès/échec
// HTTP : 429 (quota atteint) est un 4xx, mais il prouve que la fonction
// est déployée et que la clé est valide — c'est une information plutôt
// qu'une panne, d'où l'ambre et non le rouge. Le rouge est réservé à ce
// qui demande une intervention côté projet.
const TONE: Record<TranslationHealth, string> = {
  ok: 'text-accent-neon',
  quota: 'text-amber-400',
  'key-missing': 'text-red-400',
  'not-deployed': 'text-red-400',
  'auth-blocked': 'text-red-400',
  upstream: 'text-red-400',
  unreachable: 'text-amber-400',
  disabled: 'text-ink-500',
  unknown: 'text-amber-400',
};

const LABEL_KEY: Record<TranslationHealth, string> = {
  ok: 'settings.translationOk',
  quota: 'settings.translationQuota',
  'key-missing': 'settings.translationKeyMissing',
  'not-deployed': 'settings.translationNotDeployed',
  'auth-blocked': 'settings.translationAuthBlocked',
  upstream: 'settings.translationUpstream',
  unreachable: 'settings.translationUnreachable',
  disabled: 'settings.translationDisabled',
  unknown: 'settings.translationUnknown',
};

export function TranslationStatus() {
  const { t } = useLanguage();
  const [result, setResult] = useState<TranslationDiagnosis | null>(null);
  const [testing, setTesting] = useState(false);

  // Lu au rendu et non dans un state : la clé BYOK peut être posée par
  // un autre écran pendant que ce panneau est ouvert, et une valeur figée
  // au montage afficherait la mauvaise note.
  const byok = loadTranslationByok();

  const runTest = async () => {
    setTesting(true);
    setResult(await diagnoseTranslation());
    setTesting(false);
  };

  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white">
        {t('settings.translationHeading')}
        <InfoTooltip text={t('settings.translationHint')} />
      </h4>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink-200">
            {t('settings.translationServiceLabel')}
          </p>
          {result ? (
            <p className={`text-[10px] ${TONE[result.health]}`}>
              {t(LABEL_KEY[result.health])}
              {/* Le code HTTP est affiché tel quel : c'est ce qu'on
                  demande de recopier quand le libellé ne suffit pas. */}
              {result.status ? ` (${result.status})` : ''}
            </p>
          ) : (
            <p className="text-[10px] text-ink-500">{t('settings.translationIdle')}</p>
          )}
        </div>

        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="shrink-0 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-ink-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testing ? t('settings.translationTesting') : t('settings.translationTest')}
        </button>
      </div>

      {/* Le détail serveur n'est montré que sur un état non-OK : sur un
          200 il n'y en a pas, et sur 429 la phrase de quota dit déjà tout
          ce qu'il y a à dire. */}
      {result?.detail && result.health !== 'ok' && (
        <p className="mt-1 text-[10px] leading-tight text-ink-500">{result.detail}</p>
      )}

      {/* Sans cette note, un « service KO » affolerait un utilisateur dont
          les messages se traduisent parfaitement via sa propre clé : le
          chemin BYOK ne passe pas du tout par l'Edge Function testée. */}
      {byok && <p className="mt-1 text-[10px] text-ink-500">{t('settings.translationByokNote')}</p>}
    </div>
  );
}

export default TranslationStatus;
