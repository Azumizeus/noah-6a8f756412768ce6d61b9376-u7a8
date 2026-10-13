// src/components/XpBar.tsx
// ═══════════════════════════════════════════════════════════════════
// Barre de progression XP → rang suivant. Même convention que RankBadge
// (fetch XP par elle-même, pas de contexte global) : simple à monter
// n'importe où sans prop drilling.
//
// Passe "haute qualité" (30/08) — trois ajouts, tous purement cosmétiques
// (aucun changement de logique XP/rang côté serveur) :
//   1. Le total XP s'anime en comptage (au lieu de sauter instantanément)
//      quand il augmente — même intention que les jauges de jeu vidéo.
//   2. Un reflet balaie en continu la portion remplie de la barre — donne
//      de la vie même quand rien ne change, cohérent avec l'anneau pulsant
//      déjà utilisé dans QuestBoard pour l'état "prête à réclamer".
//   3. Un flash + éclat de particules (réutilise ClaimBurst) se déclenche
//      UNE FOIS quand le rang calculé change entre deux fetch — même
//      mécanique de diff par ref que `applyQuests` dans QuestBoard.tsx
//      (on ne veut pas animer au tout premier chargement, seulement sur un
//      vrai changement observé).
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { computeRank, fetchWalletXp } from '../lib/gamification';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { RANK_ICON, IconRankAnon } from './RankIcons';
import ClaimBurst from './ClaimBurst';

interface Props {
  wallet: string;
  className?: string;
}

/** Anime un nombre entre deux valeurs — easeOutCubic, ~600ms. Ne fait rien
 *  au tout premier rendu (évite de "compter depuis 0" à chaque montage), et
 *  saute directement à la valeur finale sous prefers-reduced-motion (un
 *  compteur qui défile reste un mouvement, même sans déplacement/opacité —
 *  même logique que les animations d'ambiance neutralisées dans index.css). */
function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) return;

    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(to);
      return;
    }

    const duration = 600;
    const start = performance.now();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return display;
}

export default function XpBar({ wallet, className = '' }: Props) {
  const { t } = useLanguage();
  const [xp, setXp] = useState<number | null>(null);
  const displayXp = useCountUp(xp ?? 0);

  // Diff de rang entre deux fetch — voir intro du fichier. `null` = pas
  // encore de référence (premier chargement), donc pas d'animation.
  const prevRankRef = useRef<string | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchWalletXp(wallet).then((v) => {
      if (alive) setXp(v);
    });
    return () => {
      alive = false;
    };
  }, [wallet]);

  useEffect(() => {
    if (xp === null) return;
    const { rankKey } = computeRank(xp);
    const prev = prevRankRef.current;
    if (prev !== null && prev !== rankKey) {
      setLeveledUp(true);
      const id = window.setTimeout(() => setLeveledUp(false), 1400);
      return () => window.clearTimeout(id);
    }
    prevRankRef.current = rankKey;
  }, [xp]);

  if (xp === null) {
    return (
      <div
        className={`h-9 w-full animate-pulse rounded-lg bg-white/5 ${className}`}
        aria-hidden="true"
      />
    );
  }

  const { rankKey, xp: total, xpToNext, nextRankKey, progressPct } = computeRank(xp);
  // La ref n'est mise à jour qu'APRÈS avoir lu le changement ci-dessus —
  // on la pose ici aussi pour couvrir le tout premier rendu (où l'effet
  // au-dessus n'a pas encore tourné une seconde fois).
  if (prevRankRef.current === null) prevRankRef.current = rankKey;

  const Icon = RANK_ICON[rankKey] ?? IconRankAnon;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="relative inline-flex items-center gap-1 font-medium text-accent-violet">
          {leveledUp && <ClaimBurst />}
          <span className={leveledUp ? 'xpbar-levelup-flash inline-flex' : 'inline-flex'}>
            <Icon className="h-3 w-3 shrink-0" />
          </span>
          <span className={leveledUp ? 'xpbar-levelup-flash' : ''}>
            {t(`gamification.${rankKey}`)}
          </span>
        </span>
        <span className="font-mono text-ink-400">
          {nextRankKey
            ? t('gamification.xpToNext', {
                n: xpToNext ?? 0,
                rank: t(`gamification.${nextRankKey}`),
              })
            : t('gamification.maxRank')}
        </span>
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('gamification.xpTotal', { n: total })}
      >
        <div
          className="relative h-full overflow-hidden rounded-full bg-accent-violet transition-[width] duration-700 ease-out"
          style={{
            width: `${progressPct}%`,
            boxShadow: '0 0 10px 1px rgb(var(--accent-violet-rgb) / 0.55)',
          }}
        >
          {/* Reflet qui balaie en continu — donne de la vie à la barre même
              sans changement de progression. Neutralisé sous
              prefers-reduced-motion comme le reste des animations d'ambiance. */}
          <span aria-hidden="true" className="xpbar-shimmer absolute inset-y-0 -left-1/3 w-1/3" />
        </div>
      </div>
      <p className="mt-1 text-right font-mono text-[10px] text-ink-500">
        {t('gamification.xpTotal', { n: displayXp })}
      </p>
      {leveledUp && (
        <p className="xpbar-levelup-flash mt-1 text-right text-[10px] font-semibold text-accent-gold">
          {t('gamification.rankUpToast', { rank: t(`gamification.${rankKey}`) })}
        </p>
      )}
    </div>
  );
}
