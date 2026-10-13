// src/pages/premium/PremiumStarRating.tsx
// ═══════════════════════════════════════════════════════════════════
// Étoiles de notation du shell premium — affichage (moyenne en lecture
// seule) et/ou notation interactive (1 à `max` étoiles, clic = envoi).
//
// Réécrit ici plutôt qu'importé de `components/StarRating.tsx`, qui porte des
// classes Tailwind legacy (`text-accent-gold`, `text-white/15`) et une encre
// pensée pour le fond noir : sur l'ivoire premium, `text-white/15` donne une
// étoile vide quasi invisible. La logique, elle, est identique — c'est
// `lib/contact.ts` (submitRating / fetchRatingSummaries) qui décide.
//
// L'étoile pleine prend `--p-warn` (le doré du shell, qui suit les 4 palettes
// et le mode sombre) au lieu du `--accent-gold` legacy figé.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';

interface Props {
  /** Valeur affichée (moyenne, éventuellement décimale — arrondie au rendu). */
  value: number;
  max?: number;
  /** Nombre de notes — affiché entre parenthèses si fourni. */
  count?: number;
  /** Si fourni, le widget devient cliquable : chaque étoile envoie sa valeur. */
  onRate?: (stars: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export default function PremiumStarRating({ value, max = 6, count, onRate, disabled, size = 'sm' }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const interactive = !!onRate;
  const shown = hover ?? Math.round(value);
  const fontSize = size === 'sm' ? 13 : 19;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{ display: 'inline-flex', gap: 1 }}
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
            aria-label={`${n} / ${max}`}
            style={{
              padding: 0,
              border: 'none',
              background: 'none',
              fontFamily: "'Inter',sans-serif",
              fontSize,
              lineHeight: 1,
              color: n <= shown ? 'var(--p-warn)' : 'var(--p-line)',
              cursor: interactive && !disabled ? 'pointer' : 'default',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            ★
          </button>
        ))}
      </span>
      {typeof count === 'number' && value > 0 && (
        <span style={{ fontSize: 11, color: 'var(--p-ink3)' }}>
          {value.toFixed(1)} ({count})
        </span>
      )}
    </span>
  );
}
