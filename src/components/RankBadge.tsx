// src/components/RankBadge.tsx
// ═══════════════════════════════════════════════════════════════════
// Petit chip de rang réutilisable — BuildersPage, BuilderDetailModal,
// liste de membres dans PactCard. Fait son propre fetch XP (pas de
// contexte global) : cohérent avec le reste de l'app (ActivityFeed,
// StarRating font pareil), simple à réutiliser n'importe où sans prop
// drilling. Coût : un appel réseau léger par instance affichée.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { computeRank, fetchWalletXp } from '../lib/gamification';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { RANK_ICON, IconRankAnon } from './RankIcons';

/** @deprecated Remplacé par RANK_ICON (RankIcons.tsx) — les emoji système
 *  rendaient différemment selon l'OS et cassaient l'alignement du chip.
 *  Conservé le temps de vérifier qu'aucun écran by7b ne s'en sert encore. */
export const RANK_EMOJI: Record<string, string> = {
  rankAnon: '👤',
  rankContributor: '🔧',
  rankBuilder: '🛠️',
  rankShipwright: '⚓',
  rankArchitect: '🏛️',
  rankVeteran: '🎖️',
  rankLegendary: '👑',
};

interface Props {
  wallet: string;
  size?: 'xs' | 'sm';
  className?: string;
}

export default function RankBadge({ wallet, size = 'sm', className = '' }: Props) {
  const { t } = useLanguage();
  const [xp, setXp] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchWalletXp(wallet).then((v) => {
      if (alive) setXp(v);
    });
    return () => {
      alive = false;
    };
  }, [wallet]);

  // Pas de skeleton : c'est un détail secondaire à côté d'une adresse, pas
  // un contenu attendu — un flash au montage suffit, pas besoin d'un
  // placeholder qui attirerait plus l'oeil que le badge lui-même.
  if (xp === null) return null;

  const { rankKey } = computeRank(xp);
  const sizeCls =
    size === 'xs' ? 'gap-1 px-1.5 py-0.5 text-[10px]' : 'gap-1 px-2 py-0.5 text-[11px]';
  // Repli sur IconRankAnon plutôt que `?.` : un rankKey inconnu ne peut
  // venir que d'un seuil ajouté dans RANKS sans son icône — mieux vaut la
  // silhouette neutre qu'un trou dans le chip.
  const Icon = RANK_ICON[rankKey] ?? IconRankAnon;
  const iconCls = size === 'xs' ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0';

  return (
    <span
      title={`${xp} XP`}
      className={`inline-flex items-center rounded-full border border-accent-violet/25 bg-accent-violet/10 font-medium text-accent-violet ${sizeCls} ${className}`}
    >
      <Icon className={iconCls} />
      {t(`gamification.${rankKey}`)}
    </span>
  );
}
