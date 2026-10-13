// src/components/ThemeModeGrid.tsx
// ═══════════════════════════════════════════════════════════════════
// Sélecteur combiné palette × mode — 8 boutons (4 palettes sélectionnables
// × 2 modes) au lieu des 2 contrôles séparés (ThemeSwitch + ModeSwitch) qu'il
// fallait combiner mentalement. ThemeSwitch/ModeSwitch restent utilisés
// ailleurs (ex. en-tête compacte de DashboardLayout) — ce composant ne
// les remplace que dans les paramètres, où l'espace permet une grille
// complète.
//
// Aperçu avant activation (29/08 nuit) : un clic ne change plus l'app tout
// de suite. Il pose un aperçu (ThemeContext.previewSet) — appliqué en live
// sur toute la page via les effets de ThemeContext, mais pas encore
// persisté — et ProfileSettingsModal affiche une barre "Activer ce thème"
// pour valider. Ça évite qu'un simple clic malheureux change le thème
// visible par tout le monde qui regarde l'écran (démo, capture d'écran).
//
// ⚠️ TODO validé mais PAS encore implémenté ici : verrouiller « aurum »
// derrière le rang Architecte (2500 XP), avec aperçu grisé + mention du
// seuil. Cette version affiche sans condition les palettes de PALETTES.
//
// PALETTES (liste sélectionnable, 4) et non ALL_PALETTES (5) : `coral` a
// été retirée du produit mais reste valide pour les profils qui l'ont
// déjà. Conséquence assumée — un profil en coral ne verra AUCUN bouton
// coché dans cette grille tant qu'il n'a pas choisi autre chose. Son thème
// reste bien appliqué, il n'est simplement plus représenté dans le menu.
// ═══════════════════════════════════════════════════════════════════
import { useTheme } from '../lib/ThemeContext';
import { PALETTES, PALETTE_LABEL_KEY, MODES, type Palette, type Mode } from '../lib/theme';
import { useLanguage } from '../lib/i18n/LanguageContext';

/** Couleur d'accent par palette — pour peindre le mini-aperçu de chaque
 *  bouton. Doit rester alignée sur PRIMARY_RGB (theme.ts) et les blocs
 *  [data-theme] d'index.css : un écart se verrait comme un bouton qui ne
 *  ressemble pas au thème qu'il applique réellement. */
const SWATCH: Record<Palette, string> = {
  violet: '#9945FF',
  cyan: '#22D3EE',
  coral: '#FB7185',
  // Aurum : or comme accent principal (noir chaud en sombre).
  aurum: '#E8B84B',
  // Atelier garde volontairement l'accent violet ("accent conservé" —
  // sa différence vient du canevas ivoire/encre, pas de la teinte).
  atelier: '#9945FF',
  // Nova : magenta électrique — voir [data-theme='nova'] dans index.css.
  nova: '#FF2E93',
  // Volta / Ember — 21/09, habillages validés (prototype v3).
  volta: '#10B981',
  ember: '#FFCF5A',
};

/** Couleur de canevas approximative par palette × mode — pour le corps du
 *  mini-aperçu. Les 3 palettes "neutres" partagent les canevas standard ;
 *  Aurum et Atelier ont leurs propres overrides (voir index.css). */
const CANVAS: Record<Palette, Record<Mode, string>> = {
  violet: { dark: '#0a0a14', light: '#f0f0f5' },
  cyan: { dark: '#0a0a14', light: '#f0f0f5' },
  coral: { dark: '#0a0a14', light: '#f0f0f5' },
  aurum: { dark: '#0b0a08', light: '#f0f0f5' },
  atelier: { dark: '#f7f4ee', light: '#f7f4ee' },
  nova: { dark: '#0a0a14', light: '#f0f0f5' },
  volta: { dark: '#0a0a14', light: '#f0f0f5' },
  ember: { dark: '#0a0a14', light: '#f0f0f5' },
};

export function ThemeModeGrid() {
  const { theme, mode, preview, previewSet } = useTheme();
  const { t } = useLanguage();

  // Ce qui doit apparaître "actif" dans la grille = l'aperçu s'il y en a
  // un, sinon la valeur déjà validée — sans ça, cliquer une option
  // laisserait l'ANCIENNE cochée alors que toute la page a déjà changé.
  const effectivePalette = preview?.theme ?? theme;
  const effectiveMode = preview?.mode ?? mode;

  return (
    <div role="radiogroup" aria-label={t('theme.modeGridAria')} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {PALETTES.map((palette) =>
        MODES.map((m) => {
          const active = effectivePalette === palette && effectiveMode === m;
          const label = `${t(PALETTE_LABEL_KEY[palette])} · ${t(m === 'light' ? 'theme.modeLight' : 'theme.modeDark')}`;
          return (
            <button
              key={`${palette}-${m}`}
              type="button"
              role="radio"
              aria-checked={active}
              title={label}
              onClick={() => previewSet({ theme: palette, mode: m })}
              className={
                'flex flex-col items-center gap-1.5 rounded-lg border p-2 transition ' +
                (active
                  ? 'border-accent-violet/50 bg-white/[0.06]'
                  : 'border-white/10 bg-black/20 hover:border-white/20')
              }
            >
              {/* Mini-visualiseur : bande d'accent + corps couleur canevas,
                  plus fidèle qu'un simple emoji dans un anneau — on VOIT
                  la palette plutôt que de la deviner depuis son nom. */}
              <span
                aria-hidden="true"
                className="block h-8 w-full overflow-hidden rounded-md"
                style={{ boxShadow: `inset 0 0 0 1px ${SWATCH[palette]}66` }}
              >
                <span className="block h-[35%] w-full" style={{ backgroundColor: SWATCH[palette] }} />
                <span
                  className="flex h-[65%] w-full items-center justify-center text-[10px]"
                  style={{ backgroundColor: CANVAS[palette][m] }}
                >
                  {m === 'light' ? '☀️' : '🌙'}
                </span>
              </span>
              <span className="text-center text-[10px] leading-tight text-ink-300">{label}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

export default ThemeModeGrid;
