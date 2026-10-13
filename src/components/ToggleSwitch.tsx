// src/components/ToggleSwitch.tsx
// ═══════════════════════════════════════════════════════════════════
// Interrupteur on/off unique de l'app — 44 × 24 px, pastille de 20 px.
//
// Existe pour deux raisons :
//
//  1) ImagePreviewSettings et NotificationSettings en avaient chacun
//     une copie, avec la même géométrie recopiée à la main (h-6 w-11 /
//     h-5 w-5 / translate-x-[22px]). Deux copies d'un calcul de pixels
//     divergent à la première retouche : l'une garde 22px pendant que
//     l'autre passe à 44px de large.
//
//  2) La géométrie ci-dessous ne peut plus se désynchroniser, même si
//     on change la largeur du rail. Voir l'invariant plus bas.
//
// ─── Immunité au conteneur ──────────────────────────────────────────
// `shrink-0` empêche de rétrécir, mais RIEN n'empêche de grandir : un
// parent en `grid` à colonnes égales, un `[&>*]:flex-1`, ou un
// `align-items: stretch` étirent le rail malgré `w-11`, et la pastille
// — positionnée depuis la GAUCHE — reste alors plantée au milieu d'une
// barre trop longue. C'est exactement le symptôme rapporté. D'où
// `grow-0` ET les bornes `min-w`/`max-w` : la largeur devient
// non négociable quel que soit le parent, sans avoir à auditer chaque
// endroit où l'interrupteur est monté.
//
// ─── Invariant de la pastille ───────────────────────────────────────
// La pastille est posée à `left-0.5 top-0.5` (2 px) et translatée de
// `translate-x-full` — donc exactement SA propre largeur, jamais un
// nombre de pixels en dur. Le jeu à droite vaut alors
// rail − 2 (gauche) − 20 (pastille) − 20 (translation) = 2 px, soit le
// même qu'à gauche, tant que :
//
//     largeur du rail = 2 × jeu + 2 × largeur de pastille
//     ( 44 = 2×2 + 2×20 )
//
// Changer TRACK_W sans respecter cette égalité décentre la pastille à
// l'arrivée — c'est le seul couplage restant, et il est ici, à un seul
// endroit, plutôt que dispersé dans deux composants.
//
// Position absolue plutôt que `justify-end` : `transform` est animable
// par le GPU, un changement de `justify-content` ne l'est pas — le
// glissement serait instantané.
// ═══════════════════════════════════════════════════════════════════

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** Obligatoire : le rail n'a aucun texte, un lecteur d'écran n'a que
   *  ça pour annoncer de quoi il s'agit. */
  ariaLabel: string;
  /** Couleur de l'état actif. Deux valeurs seulement pour l'instant —
   *  violet = réglage d'affichage, neon = notifications réellement
   *  actives (le vert signale « ça part vraiment » ailleurs dans
   *  l'app, voir .btn-neon). */
  tone?: 'violet' | 'neon';
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  tone = 'violet',
}: ToggleSwitchProps) {
  const onColor = tone === 'neon' ? 'bg-accent-neon' : 'bg-accent-violet';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={
        'relative box-border inline-flex h-6 w-11 min-w-[44px] max-w-[44px] shrink-0 grow-0 ' +
        'cursor-pointer rounded-full border-0 p-0 transition-colors ' +
        'disabled:cursor-not-allowed disabled:opacity-40 ' +
        (checked ? onColor : 'bg-white/15')
      }
    >
      <span
        aria-hidden="true"
        className={
          'pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white ' +
          'shadow-sm transition-transform duration-200 ease-out ' +
          (checked ? 'translate-x-full' : 'translate-x-0')
        }
      />
    </button>
  );
}

export default ToggleSwitch;
