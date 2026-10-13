// src/components/StatsCard.tsx
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

type StatsCardProps = {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon?: 'earned' | 'claimable' | 'pacts';
  accent?: 'violet' | 'neon' | 'gold';
  loading?: boolean;
  sublabel?: string;
};

const itemVariants: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

/**
 * Compteur animé — interpolation linéaire + easing ease-out-cubic.
 * Court-circuite l'animation si l'utilisateur demande reduced motion.
 * Mémorise la valeur précédente pour transitions fluides sur mise à jour live.
 */
function useCountUp(target: number, duration = 900): number {
  const prefersReduced = useReducedMotion();
  const [value, setValue] = useState(0);
  const previousRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReduced) {
      setValue(target);
      previousRef.current = target;
      return;
    }
    const start = performance.now();
    const initial = previousRef.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out-cubic : 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      const next = initial + (target - initial) * eased;
      setValue(next);
      previousRef.current = next;
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // Dépendances intentionnellement limitées — on ne veut pas relancer sur `value`
     
  }, [target, duration, prefersReduced]);

  return value;
}

const ICONS: Record<'earned' | 'claimable' | 'pacts', ReactNode> = {
  earned:    <EarnedIcon />,
  claimable: <ClaimableIcon />,
  pacts:     <PactsIcon />,
};

const ACCENT: Record<'violet' | 'neon' | 'gold', string> = {
  violet: 'text-accent-violet',
  neon:   'text-accent-neon',
  gold:   'text-accent-gold',
};

export function StatsCard({
  label,
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  icon,
  accent = 'violet',
  loading = false,
  sublabel,
}: StatsCardProps) {
  const animated = useCountUp(value);

  return (
    <motion.div
      variants={itemVariants}
      whileHover={loading ? undefined : { scale: 1.02 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="glass-panel glass-panel-hover p-5"
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</p>
        {icon && <span className={ACCENT[accent]}>{ICONS[icon]}</span>}
      </div>

      {loading ? (
        <>
          <div className="skeleton mt-3 h-9 w-32" aria-hidden="true" />
          <div className="skeleton mt-2 h-3 w-20" aria-hidden="true" />
        </>
      ) : (
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-white">
          {prefix}
          {animated.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}
          {suffix && (
            <span className={`ml-1 text-base font-semibold ${ACCENT[accent]}`}>{suffix}</span>
          )}
        </p>
      )}

      {sublabel && !loading && (
        <p className="mt-1 text-xs text-ink-500">{sublabel}</p>
      )}
    </motion.div>
  );
}

function EarnedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 14l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 5h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClaimableIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="8" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 11h14M10 8v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 8C10 8 8.5 4 6 5.5C4 6.7 8.5 8 10 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <path d="M10 8C10 8 11.5 4 14 5.5C16 6.7 11.5 8 10 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function PactsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7 13l-2-2a2.5 2.5 0 0 1 0-3.5l2-2m6 8l2-2a2.5 2.5 0 0 0 0-3.5l-2-2m-5 9l3-9"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default StatsCard;
