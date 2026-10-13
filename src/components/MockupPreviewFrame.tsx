// src/components/MockupPreviewFrame.tsx
// ═══════════════════════════════════════════════════════════════════
// Aperçu de thème CONTENU dans un petit cadre (téléphone ou navigateur),
// qui ne touche JAMAIS document.documentElement — contrairement à
// l'ancien comportement où l'aperçu (ThemeContext.preview) s'appliquait
// en live sur toute la vraie page pendant qu'on navigue les autres
// réglages de la modale. Trois axes indépendants entrent en jeu :
//   - palette/mode : `[data-theme]`/`[data-mode]` dans index.css sont des
//     sélecteurs d'ATTRIBUT NON scopés à <html> (`[data-theme='cyan']`,
//     pas `html[data-theme='cyan']`) — les poser sur CE conteneur suffit
//     à faire cascader les bonnes variables CSS custom properties à ses
//     descendants, sans jamais toucher le root du document.
//   - fond de page : DashboardLayout utilise des calques `fixed inset-0`
//     (pensés pour occuper tout le viewport) — inutilisables ici tels
//     quels. Le rendu ci-dessous est une version `absolute inset-0`
//     dédiée à ce cadre, avec les mêmes dégradés/motifs.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { BackgroundStyle } from '../lib/theme';

type Shape = 'phone' | 'browser';

/** Calque de fond miniature — même logique que DashboardLayout, en
 *  `absolute` plutôt que `fixed` pour rester contenu dans le cadre. */
function MockupBackground({ style }: { style: BackgroundStyle }) {
  switch (style) {
    case 'orbs':
      return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -left-6 -top-8 h-24 w-24 rounded-full opacity-60 blur-xl"
            style={{ background: 'radial-gradient(circle, rgb(var(--accent-violet-rgb) / 0.6), transparent 70%)' }}
          />
          <div
            className="absolute -right-8 top-1/3 h-24 w-24 rounded-full opacity-50 blur-xl"
            style={{ background: 'radial-gradient(circle, rgb(var(--accent-neon-rgb) / 0.5), transparent 70%)' }}
          />
          <div
            className="absolute -bottom-8 left-1/4 h-20 w-20 rounded-full opacity-45 blur-xl"
            style={{ background: 'radial-gradient(circle, rgb(var(--accent-gold-rgb) / 0.4), transparent 70%)' }}
          />
        </div>
      );
    case 'grid':
      return (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'linear-gradient(rgb(var(--accent-violet-rgb) / 0.35) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent-violet-rgb) / 0.35) 1px, transparent 1px)',
            backgroundSize: '10px 10px',
          }}
        />
      );
    case 'aurora':
      return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(115deg, transparent 20%, rgb(var(--accent-violet-rgb) / 0.55) 45%, rgb(var(--accent-neon-rgb) / 0.4) 60%, transparent 80%)',
            }}
          />
        </div>
      );
    case 'scanlines':
      return (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage: 'repeating-linear-gradient(rgb(var(--accent-violet-rgb) / 0.5) 0 1px, transparent 1px 3px)',
          }}
        />
      );
    case 'solid':
    default:
      return null;
  }
}

/** Contenu miniature — assez de "vrai" BuildPact (nav, carte de pact,
 *  bouton CTA) pour juger un thème sans dupliquer une page entière. */
function MockupContent({ background }: { background: BackgroundStyle }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <MockupBackground style={background} />
      <div className="relative flex h-full flex-col gap-2 p-2.5">
        {/* Nav miniature */}
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-accent-violet" />
          <span className="h-1.5 w-8 rounded-full bg-white/20" />
          <span className="ml-auto h-1.5 w-5 rounded-full bg-white/10" />
          <span className="h-1.5 w-5 rounded-full bg-white/10" />
        </div>

        {/* Carte de pact miniature */}
        <div className="rounded-md border border-white/10 bg-canvas-800 p-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="h-2 w-16 rounded-full bg-white/25" />
            <span className="rounded-full bg-accent-gold/20 px-1.5 py-0.5 text-[6px] font-bold text-accent-gold">
              ★
            </span>
          </div>
          <span className="mt-1.5 block h-1.5 w-24 rounded-full bg-white/10" />
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-accent-neon" />
          </div>
          <div className="mt-1.5 flex -space-x-1">
            <span className="h-3 w-3 rounded-full border border-canvas-800 bg-accent-violet/70" />
            <span className="h-3 w-3 rounded-full border border-canvas-800 bg-accent-neon/70" />
            <span className="h-3 w-3 rounded-full border border-canvas-800 bg-accent-gold/70" />
          </div>
        </div>

        {/* CTA miniature */}
        <div className="mt-auto rounded-md bg-accent-violet/90 py-1.5 text-center text-[7px] font-bold text-white">
          ● ● ●
        </div>
      </div>
    </div>
  );
}

export function MockupPreviewFrame() {
  const { theme, mode, background, preview } = useTheme();
  const { t } = useLanguage();
  const [shape, setShape] = useState<Shape>('phone');

  // Résout chaque axe : aperçu non validé s'il existe, sinon état déjà
  // validé — EXACTEMENT ce que faisait ThemeContext sur le vrai document
  // avant ce changement, sauf que ça n'atterrit plus que sur ce cadre.
  const effectiveTheme = preview?.theme ?? theme;
  const effectiveMode = preview?.mode ?? mode;
  const effectiveBackground = preview?.background ?? background;

  const dataAttrs =
    effectiveMode === 'light'
      ? { 'data-theme': effectiveTheme, 'data-mode': 'light' as const }
      : { 'data-theme': effectiveTheme };

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-white">{t('theme.mockupHeading')}</h4>
        <div className="flex gap-1 rounded-md border border-white/10 p-0.5">
          <button
            type="button"
            onClick={() => setShape('phone')}
            aria-pressed={shape === 'phone'}
            className={
              'rounded px-2 py-0.5 text-[10px] font-medium transition ' +
              (shape === 'phone' ? 'bg-accent-violet/80 text-white' : 'text-ink-400 hover:text-white')
            }
          >
            {t('theme.mockupPhone')}
          </button>
          <button
            type="button"
            onClick={() => setShape('browser')}
            aria-pressed={shape === 'browser'}
            className={
              'rounded px-2 py-0.5 text-[10px] font-medium transition ' +
              (shape === 'browser' ? 'bg-accent-violet/80 text-white' : 'text-ink-400 hover:text-white')
            }
          >
            {t('theme.mockupBrowser')}
          </button>
        </div>
      </div>

      {/* `isolate` empêche les z-index internes du cadre de fuiter dans le
          reste de la modale ; `data-theme`/`data-mode` posés ICI seulement —
          jamais sur document.documentElement (voir en-tête du fichier). */}
      <div className="flex justify-center" {...dataAttrs}>
        {shape === 'phone' ? (
          <div className="isolate w-[130px] shrink-0 rounded-[16px] border-[3px] border-black/60 bg-black/60 p-1 shadow-xl">
            <div className="mx-auto mb-1 h-1 w-8 rounded-full bg-black/50" />
            <div className="h-[220px] w-full overflow-hidden rounded-[11px]">
              <MockupContent background={effectiveBackground} />
            </div>
          </div>
        ) : (
          <div className="isolate w-full max-w-[280px] shrink-0 overflow-hidden rounded-lg border border-black/50 shadow-xl">
            <div className="flex items-center gap-1 bg-[#1a1a24] px-2 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
              <span className="ml-2 flex-1 truncate rounded bg-black/30 px-1.5 py-0.5 text-center text-[7px] text-ink-400">
                buildpact.app
              </span>
            </div>
            <div className="h-[150px] w-full overflow-hidden">
              <MockupContent background={effectiveBackground} />
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[10px] leading-tight text-ink-500">{t('theme.mockupHint')}</p>
    </div>
  );
}

export default MockupPreviewFrame;
