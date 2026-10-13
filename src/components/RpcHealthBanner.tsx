// src/components/RpcHealthBanner.tsx
// ═══════════════════════════════════════════════════════════════════
// Bandeau de santé RPC — la face visible de lib/rpcHealth.ts.
//
// Pourquoi ce composant existe : une rotation d'endpoint était jusqu'ici un
// `console.warn`. Personne ne lit la console en démonstration, et le
// symptôme visible (« 0 pact », « ça rame ») ne dit pas sa cause. Mesuré le
// 11/10/2026 : relais Edge non déployé → 404 → repli devnet public, écran
// muet.
//
// Quatre principes de rendu :
//   - il ne s'affiche que si `messageSante()` le demande (donc jamais sur
//     un 429 passager) ;
//   - il n'affiche JAMAIS d'URL brute : `SanteRpc` ne contient que des
//     origines, masquées par lib/rpcMask.ts (une clé d'API vit dans la
//     query string du nœud dédié) ;
//   - les libellés passent par i18n (`rpcHealth.*`), dans les deux shells ;
//   - il est MASQUÉ en mode tournage (`#/demo?tournage=1`, lib/tournage.ts) :
//     la vidéo montre le produit, pas l'état de l'infrastructure, et un
//     bandeau qui apparaît en pleine prise oblige à recommencer.
//
// Monté dans PremiumNav (shell premium, seul point commun aux dix pages) et
// dans DashboardLayout (shell legacy, seul point commun aux onze pages
// `/v1`) : une page ajoutée demain dans l'un ou l'autre hérite de
// l'information sans rien câbler.
//
// ⚠️ Deux variantes de style, et ce n'est pas cosmétique : `/v1` ne définit
// AUCUNE variable `--p-*`, donc la version premium y serait invisible
// (fond transparent, texte hérité). Voir lib/rpcBannerStyles.ts, qui porte
// cette règle et la fait vérifier par les tests.
// ═══════════════════════════════════════════════════════════════════
import { useState, type CSSProperties } from 'react';
import { messageSante, type SanteRpc } from '../lib/rpcHealth';
import { stylesBandeau, type VarianteBandeau } from '../lib/rpcBannerStyles';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { useModeTournage } from '../hooks/useModeTournage';

export type { VarianteBandeau };

export interface RpcHealthBannerProps {
  sante: SanteRpc;
  enCours: boolean;
  onVerifier: () => void;
  /** Ouvre les réglages du shell courant (le champ « RPC personnalisé »). */
  onOpenSettings?: () => void;
  /** `premium` (défaut, tokens --p-*) ou `legacy` (classes du shell /v1). */
  variante?: VarianteBandeau;
}

/** Les tables de style sont typées largement (Record<string, string | number>)
 *  pour rester testables sans React ; ici on les présente à React. */
const css = (style: Record<string, string | number>): CSSProperties => style as CSSProperties;

export default function RpcHealthBanner({
  sante,
  enCours,
  onVerifier,
  onOpenSettings,
  variante = 'premium',
}: RpcHealthBannerProps) {
  const { t, lang } = useLanguage();
  const { actif: modeTournage } = useModeTournage();
  const [masque, setMasque] = useState<string | null>(null);

  const message = messageSante(sante);
  if (!message) return null;
  // Mode tournage : l'information reste disponible ailleurs (les deux
  // attestations de sonde et le journal de rotation ne sont pas touchés) —
  // c'est l'AFFICHAGE d'un incident pendant une prise qui gêne.
  if (modeTournage) return null;

  // Signature de l'événement : un masquage manuel vaut pour CETTE alerte,
  // pas pour la suivante. Une nouvelle rotation (autre horodatage) ou un
  // changement de niveau fait réapparaître le bandeau — sinon on se
  // retrouverait avec un incident masqué à vie.
  const signature = `${message.cle}|${sante.niveau}|${sante.rotation?.a ?? ''}`;
  if (masque === signature) return null;

  const alerte = message.ton === 'alerte';
  const s = stylesBandeau(variante, alerte, enCours);
  const cause = [
    message.verdictCle ? t(message.verdictCle) : null,
    message.motifCle ? t(message.motifCle) : null,
  ]
    .filter(Boolean)
    .join(' — ');

  const heure = sante.verifieA
    ? new Date(sante.verifieA).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US')
    : null;

  return (
    <div
      // `role="alert"` pour une panne (lecture immédiate par un lecteur
      // d'écran), `status` pour une information de bascule : annoncer une
      // simple rotation comme une panne serait une fausse urgence.
      role={alerte ? 'alert' : 'status'}
      style={css(s.containerStyle)}
      className={s.containerClass}
    >
      <span aria-hidden="true" style={css(s.iconeStyle)} className={s.iconeClass}>
        !
      </span>

      <div style={css(s.texteStyle)} className={s.texteClass}>
        <p style={css(s.titreStyle)} className={s.titreClass}>
          {t(message.cle, message.params)}
        </p>
        {cause && (
          <p style={css(s.causeStyle)} className={s.causeClass}>
            {t('rpcHealth.reason', { reason: cause })}
          </p>
        )}
        {heure && (
          <p style={css(s.heureStyle)} className={s.heureClass}>
            {t('rpcHealth.checkedAt', { time: heure })}
          </p>
        )}
      </div>

      <div style={css(s.actionsStyle)} className={s.actionsClass}>
        <button
          type="button"
          onClick={onVerifier}
          disabled={enCours}
          style={css(s.principalStyle)}
          className={s.principalClass}
        >
          {enCours ? t('rpcHealth.checking') : t('rpcHealth.retry')}
        </button>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            style={css(s.secondaireStyle)}
            className={s.secondaireClass}
          >
            {t('rpcHealth.settings')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMasque(signature)}
          style={css(s.masquerStyle)}
          className={s.masquerClass}
        >
          {t('rpcHealth.hide')}
        </button>
      </div>
    </div>
  );
}
