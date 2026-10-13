// src/components/BadgeShelf.tsx
// ═══════════════════════════════════════════════════════════════════
// Rangée de badges — V2 (29/08) : affiche aussi les badges VERROUILLÉS,
// grisés, avec leur compteur ("7/10") — computeBadgeProgress() calculait
// déjà ces compteurs en V1 et les jetait après ne garder que les débloqués.
// Une liste qui ne montre que ce qu'on a déjà obtenu est un trophée mort ;
// voir aussi le % de rareté par badge (fetchBadgeRarity), qui donne une
// valeur à un badge rare même avant de l'avoir débloqué.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import {
  computeBadgeProgress,
  fetchBadgeRarity,
  BADGE_META,
  BADGE_ORDER,
  type BadgeId,
  type BadgeProgress,
} from '../lib/gamification';
import { useLanguage } from '../lib/i18n/LanguageContext';

interface Props {
  wallet: string;
  className?: string;
}

export default function BadgeShelf({ wallet, className = '' }: Props) {
  const { t } = useLanguage();
  const [progress, setProgress] = useState<Record<BadgeId, BadgeProgress> | null>(null);
  const [rarity, setRarity] = useState<Record<BadgeId, number> | null>(null);

  useEffect(() => {
    let alive = true;
    computeBadgeProgress(wallet).then((p) => {
      if (alive) setProgress(p);
    });
    // Rareté indépendante du wallet (calculée sur tout le protocole) — pas
    // besoin de la relire si seul `wallet` change entre deux montages, mais
    // le coût d'un fetch en plus est négligeable au volume actuel.
    fetchBadgeRarity().then((r) => {
      if (alive) setRarity(r);
    });
    return () => {
      alive = false;
    };
  }, [wallet]);

  if (progress === null) {
    return (
      <div
        className={`h-16 w-full animate-pulse rounded-lg bg-white/5 ${className}`}
        aria-hidden="true"
      />
    );
  }

  const unlockedCount = BADGE_ORDER.filter((id) => progress[id].unlocked).length;

  return (
    <div className={className}>
      <p className="mb-2 text-[11px] text-ink-500">
        {t('gamification.badgesUnlockedCount', {
          done: unlockedCount,
          total: BADGE_ORDER.length,
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        {BADGE_ORDER.map((id) => {
          const meta = BADGE_META[id];
          const p = progress[id];
          const pct = rarity?.[id];
          const title =
            t(meta.descKey) +
            (p.unlocked ? '' : ` (${p.current}/${p.target})`) +
            (pct !== undefined ? ` — ${t('gamification.badgeRarityLabel', { pct })}` : '');
          return (
            <span
              key={id}
              title={title}
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ' +
                (p.unlocked
                  ? 'border-accent-gold/25 bg-accent-gold/10 text-accent-gold'
                  : 'border-white/10 bg-black/20 text-ink-500 grayscale')
              }
            >
              <span aria-hidden="true">{meta.emoji}</span>
              {t(meta.labelKey)}
              {!p.unlocked && (
                <span className="font-mono text-[10px] text-ink-500">
                  {p.current}/{p.target}
                </span>
              )}
              {pct !== undefined && pct <= 20 && (
                <span className="text-accent-violet">
                  {t('gamification.badgeRarityLabel', { pct })}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
