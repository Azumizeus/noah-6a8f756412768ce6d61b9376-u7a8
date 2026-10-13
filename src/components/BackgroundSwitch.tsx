// src/components/BackgroundSwitch.tsx
// ═══════════════════════════════════════════════════════════════════
// Choix du décor de fond (DashboardLayout) — 5 options : la nébuleuse
// d'orbes actuelle, une grille pure, un fond uni, et 2 ajouts proposés
// (aurore / scanlines). Un seul contrôle plutôt qu'un toggle "orbes
// on/off" séparé : choisir "grille" ou "uni" DÉSACTIVE de fait les
// orbes, donc les deux demandes (toggle orbes + choix de fond) se
// couvrent avec une seule liste au lieu de deux réglages qui pourraient
// se contredire.
//
// Aperçu avant activation + mini-visualiseurs réels (29/08 nuit) : chaque
// bouton montre maintenant un petit rendu du VRAI motif (dégradés/lignes
// approximés en CSS, pas juste un emoji), et un clic prévisualise en live
// sur toute la page (ThemeContext.previewSet) plutôt que d'appliquer tout
// de suite — voir la barre de confirmation dans ProfileSettingsModal.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { BACKGROUND_STYLES, type BackgroundStyle } from '../lib/theme';
import { useLanguage } from '../lib/i18n/LanguageContext';

const LABEL_KEY: Record<BackgroundStyle, string> = {
  orbs: 'theme.backgroundOrbs',
  grid: 'theme.backgroundGrid',
  solid: 'theme.backgroundSolid',
  aurora: 'theme.backgroundAurora',
  scanlines: 'theme.backgroundScanlines',
  nebula_hd: 'theme.backgroundNebulaHd',
  grid_hd: 'theme.backgroundGridHd',
  aurora_hd: 'theme.backgroundAuroraHd',
};

const DESC_KEY: Record<BackgroundStyle, string> = {
  orbs: 'theme.backgroundOrbsDesc',
  grid: 'theme.backgroundGridDesc',
  solid: 'theme.backgroundSolidDesc',
  aurora: 'theme.backgroundAuroraDesc',
  scanlines: 'theme.backgroundScanlinesDesc',
  nebula_hd: 'theme.backgroundNebulaHdDesc',
  grid_hd: 'theme.backgroundGridHdDesc',
  aurora_hd: 'theme.backgroundAuroraHdDesc',
};

/** Mini-rendu de chaque style, approximé en CSS pur (pas de dépendance aux
 *  classes pleine-page de DashboardLayout, pensées pour un fond `fixed
 *  inset-0` — à cette échelle il faut des valeurs dédiées, pas les mêmes
 *  tailles de motif). Toujours sur base sombre : c'est un aperçu du MOTIF,
 *  pas du mode clair/sombre (couvert par ThemeModeGrid, un axe séparé). */
function MiniPreview({ style, size = 'sm' }: { style: BackgroundStyle; size?: 'sm' | 'lg' }) {
  const base = 'relative w-full overflow-hidden rounded-md bg-[#0a0a14] ' + (size === 'lg' ? 'h-20' : 'h-8');
  switch (style) {
    case 'orbs':
      return (
        <span aria-hidden="true" className={base}>
          <span
            className="absolute -left-2 -top-3 h-8 w-8 rounded-full"
            style={{ background: 'radial-gradient(circle, rgb(var(--accent-violet-rgb) / 0.9), transparent 70%)' }}
          />
          <span
            className="absolute -right-2 -bottom-3 h-8 w-8 rounded-full"
            style={{ background: 'radial-gradient(circle, rgb(var(--accent-neon-rgb) / 0.8), transparent 70%)' }}
          />
        </span>
      );
    case 'grid':
      return (
        <span
          aria-hidden="true"
          className={base}
          style={{
            backgroundImage:
              'linear-gradient(rgb(var(--accent-violet-rgb) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent-violet-rgb) / 0.5) 1px, transparent 1px)',
            backgroundSize: '8px 8px',
          }}
        />
      );
    case 'solid':
      return <span aria-hidden="true" className={base} />;
    case 'aurora':
      return (
        <span
          aria-hidden="true"
          className={base}
          style={{
            backgroundImage:
              'linear-gradient(115deg, transparent 20%, rgb(var(--accent-violet-rgb) / 0.7) 45%, rgb(var(--accent-neon-rgb) / 0.5) 60%, transparent 80%)',
          }}
        />
      );
    case 'scanlines':
      return (
        <span
          aria-hidden="true"
          className={base}
          style={{
            backgroundImage: 'repeating-linear-gradient(rgb(var(--accent-violet-rgb) / 0.6) 0 1px, transparent 1px 4px)',
          }}
        />
      );
    // ⚠️ Les 3 variantes « HD » (nebula_hd / grid_hd / aurora_hd) sont
    // volontairement absentes : leurs fichiers image n'ont jamais été
    // committés (voir le commentaire de BACKGROUND_STYLES dans lib/theme.ts).
    // Leur vignette unique source était cet `url('/backgrounds/…')`, donc
    // chaque ouverture des réglages déclenchait trois requêtes en 404.
    default:
      return <span aria-hidden="true" className={base} />;
  }
}

export function BackgroundSwitch() {
  const { background, preview, previewSet } = useTheme();
  const { t } = useLanguage();
  const effective = preview?.background ?? background;
  // Aperçu agrandi au survol/focus d'une vignette, AVANT toute sélection —
  // demande explicite (29/08, soir) distincte du cadre MockupPreviewFrame :
  // ici c'est le MOTIF seul, en grand, pas une maquette d'app entière.
  // `null` = rien survolé/focus → retombe sur le choix effectif courant,
  // pour que la zone agrandie ne soit jamais vide.
  const [spotlight, setSpotlight] = useState<BackgroundStyle | null>(null);
  const shown = spotlight ?? effective;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-white">{t('theme.backgroundHeading')}</h4>

      {/* Bande d'aperçu agrandi — reflète la vignette survolée/focus, ou le
          choix effectif courant si rien n'est survolé. */}
      <div className="mb-2">
        <MiniPreview style={shown} size="lg" />
      </div>

      <div role="radiogroup" aria-label={t('theme.backgroundHeading')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BACKGROUND_STYLES.map((bg) => {
          const active = effective === bg;
          return (
            <button
              key={bg}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => previewSet({ background: bg })}
              onMouseEnter={() => setSpotlight(bg)}
              onMouseLeave={() => setSpotlight(null)}
              onFocus={() => setSpotlight(bg)}
              onBlur={() => setSpotlight(null)}
              className={
                'flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition ' +
                (active
                  ? 'border-accent-violet/50 bg-white/[0.06]'
                  : 'border-white/10 bg-black/20 hover:border-white/20')
              }
            >
              <MiniPreview style={bg} />
              <span className="text-[11px] font-medium text-ink-200">{t(LABEL_KEY[bg])}</span>
              <span className="text-[10px] leading-tight text-ink-500">{t(DESC_KEY[bg])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BackgroundSwitch;
