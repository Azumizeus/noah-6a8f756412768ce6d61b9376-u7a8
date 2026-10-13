// src/components/RankIcons.tsx
// ═══════════════════════════════════════════════════════════════════
// Icônes SVG custom pour les 7 rangs de progression (RankBadge.tsx),
// remplacent les emoji système (👤🔧🛠️⚓🏛️🎖️👑) — même passe "Duolingo"
// que QuestIcons.tsx (voir son en-tête pour le détail du principe :
// coins arrondis, trait épais et régulier, formes pleines).
//
// ⚠️ Différence avec QuestIcons : ici la couleur N'ENCODE PAS un état,
// elle est fixe (`text-accent-violet`, posée par RankBadge sur le <span>
// parent) — c'est le GLYPHE qui change avec le rang, pas la couleur. Donc
// pas de contrainte "jamais de fill-opacity" aussi stricte que côté
// quêtes, mais on reste `currentColor` quand même : la palette d'accent
// change (violet/cyan/corail/aurum/atelier), l'icône doit suivre sans
// modification.
// ═══════════════════════════════════════════════════════════════════
import type { FC } from 'react';

interface IconProps {
  className?: string;
}

const BASE = 'h-3.5 w-3.5 shrink-0';

/** rankAnon — silhouette tête + épaules, la plus neutre du set. */
export function IconRankAnon({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="10" cy="7.2" r="3.4" stroke="currentColor" strokeWidth="2" />
      <path d="M3.4 17c0-3.4 2.8-5.8 6.6-5.8s6.6 2.4 6.6 5.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** rankContributor — clé (outil d'entrée de gamme, un seul coup). */
export function IconRankContributor({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="6.3" cy="6.3" r="3.4" stroke="currentColor" strokeWidth="2" />
      <path d="M8.7 8.7 16.8 16.8M13.6 13.6l2-2M16 16l1.6-1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** rankBuilder — marteau, silhouette pleine et arrondie. */
export function IconRankBuilder({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M11.4 2.4a1.6 1.6 0 0 1 2.3 0l3.9 3.9a1.6 1.6 0 0 1 0 2.3l-1.1 1.1-6.2-6.2 1.1-1.1Z" />
      <path
        d="M9.2 5.6 3.1 11.7c-.5.5-.5 1.2 0 1.7l3.5 3.5c.5.5 1.2.5 1.7 0l6.1-6.1-5.2-5.2Z"
        fillOpacity="0.85"
      />
    </svg>
  );
}

/** rankShipwright — ancre (thème naval, cohérent avec "Shipwright"). */
export function IconRankShipwright({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="10" cy="4.4" r="1.9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 6.3v10.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5.8 8.4h8.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M3.6 11.2c0 3.1 2.6 5.5 6.4 5.9 3.8-.4 6.4-2.8 6.4-5.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** rankArchitect — colonne/fronton, thème "monument". */
export function IconRankArchitect({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M2.6 5.4 10 2.4l7.4 3v1.9H2.6V5.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="currentColor" fillOpacity="0.25" />
      <path d="M4.6 9.3v5.4M9 9.3v5.4M13.4 9.3v5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2.6 17.2h14.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

/** rankVeteran — médaille suspendue à un ruban court. */
export function IconRankVeteran({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M7.4 2.6 10 7.4l2.6-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.25" />
      <circle cx="10" cy="12.4" r="5" stroke="currentColor" strokeWidth="2" />
      <path d="M10 9.6v5.6M7.6 12.4h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}

/** rankLegendary — couronne, plein sommet du set. */
export function IconRankLegendary({ className = BASE }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 15.4 2 6.6l3.9 2.9L10 3.4l4.1 6.1 3.9-2.9-1 8.8H3Z" />
      <rect x="3" y="16.4" width="14" height="1.6" rx="0.8" />
    </svg>
  );
}

export const RANK_ICON: Record<string, FC<IconProps>> = {
  rankAnon: IconRankAnon,
  rankContributor: IconRankContributor,
  rankBuilder: IconRankBuilder,
  rankShipwright: IconRankShipwright,
  rankArchitect: IconRankArchitect,
  rankVeteran: IconRankVeteran,
  rankLegendary: IconRankLegendary,
};
