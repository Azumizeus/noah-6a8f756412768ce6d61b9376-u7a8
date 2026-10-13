// src/components/TranslatedMessage.tsx
// ═══════════════════════════════════════════════════════════════════
// Wrapper unique pour tout texte affiché à l'utilisateur qui a pu être
// écrit par quelqu'un d'autre dans une autre langue — chat de pact,
// messages de contact, posts/commentaires Network.
//
// Traduction automatique et immédiate (jamais un bouton "Traduire" à
// cliquer) — la transparence est gardée via le lien "Voir l'original".
//
// Deux comportements volontaires :
//  • si la traduction revient identique au texte source (message déjà
//    dans la langue du lecteur), on n'affiche RIEN de plus — pas de
//    lien "Voir l'original" inutile sur 90 % des messages ;
//  • en cas d'erreur (quota, réseau, DEEPL_API_KEY absente), on retombe
//    silencieusement sur l'original. Un message lisible dans la mauvaise
//    langue vaut mieux qu'un bandeau d'erreur sur chaque ligne du fil.
//
// `sourceLang` est l'économie principale de quota : quand la langue
// d'écriture est connue ET égale à celle du lecteur, AUCUN appel n'est
// émis — zéro caractère consommé, au lieu d'un aller-retour DeepL qui
// renvoyait le texte inchangé. Elle vaut `null` sur tout l'historique
// écrit avant la colonne `lang` (migration 20260919090000) : dans ce cas
// on retombe sur l'ancien comportement, on traduit et on compare.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { translateMessage } from '../lib/translation';

interface Props {
  text: string;
  /** Langue dans laquelle le texte a été écrit ('fr' | 'en'), ou null si
   *  inconnue (message antérieur à la colonne `lang`). */
  sourceLang?: string | null;
  className?: string;
}

export function TranslatedMessage({ text, sourceLang, className }: Props) {
  const { lang, t } = useLanguage();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTranslated(null);
    setShowOriginal(false);
    if (!text.trim()) return;
    // Court-circuit : rien à traduire, donc rien à demander au serveur.
    if (sourceLang && sourceLang === lang) return;

    translateMessage(text, lang, wallet).then((r) => {
      if (cancelled) return;
      if ('error' in r) return;
      if (r.translatedText.trim() !== text.trim()) setTranslated(r.translatedText);
    });

    return () => {
      cancelled = true;
    };
    // `wallet` est délibérément hors des dépendances : il ne sert qu'au
    // compteur de quota côté serveur. L'inclure relancerait une traduction
    // de tout le fil au moment où l'utilisateur connecte son wallet, pour
    // un résultat rigoureusement identique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, lang, sourceLang]);

  const display = translated && !showOriginal ? translated : text;

  return (
    <span>
      <span className={className}>{display}</span>
      {translated && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="ml-1.5 align-baseline text-[10px] italic text-ink-500 underline decoration-dotted transition-colors hover:text-ink-300"
        >
          {showOriginal ? t('common.viewTranslation') : t('common.viewOriginal')}
        </button>
      )}
    </span>
  );
}

export default TranslatedMessage;
