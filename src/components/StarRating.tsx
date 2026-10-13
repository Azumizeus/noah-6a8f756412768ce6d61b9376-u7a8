// src/components/StarRating.tsx
// ═══════════════════════════════════════════════════════════════════
// Widget étoiles réutilisable — affichage (moyenne en lecture seule) et/ou
// notation interactive (1 à `max` étoiles, clic = envoi immédiat). Voir
// lib/contact.ts pour submitRating()/fetchRatingSummaries().
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';

interface Props {
  /** Valeur affichée (moyenne, peut être décimale — arrondie à l'entier le plus proche pour le rendu). */
  value: number;
  max?: number;
  /** Nombre de notes — affiché entre parenthèses si fourni. */
  count?: number;
  /** Si fourni, le widget devient cliquable : chaque étoile envoie sa valeur immédiatement. */
  onRate?: (stars: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export default function StarRating({ value, max = 6, count, onRate, disabled, size = 'sm' }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const interactive = !!onRate;
  const displayValue = hover ?? Math.round(value);
  const starCls = size === 'sm' ? 'text-sm' : 'text-lg';

  return (
    <div className="flex items-center gap-1">
      <div
        className="flex"
        onMouseLeave={() => setHover(null)}
        role={interactive ? 'group' : undefined}
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={!interactive || disabled}
            onClick={() => onRate?.(n)}
            onMouseEnter={() => interactive && setHover(n)}
            className={`${starCls} ${interactive && !disabled ? 'cursor-pointer' : 'cursor-default'} ${n <= displayValue ? 'text-accent-gold' : 'text-white/15'}`}
            aria-label={`${n} / ${max}`}
          >
            ★
          </button>
        ))}
      </div>
      {typeof count === 'number' && (
        <span className="text-[11px] text-ink-400">{value > 0 ? `${value.toFixed(1)} (${count})` : ''}</span>
      )}
    </div>
  );
}
